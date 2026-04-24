"""인증 서비스"""
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Optional
from datetime import datetime, timedelta
import uuid
import secrets
import string
import threading
from jose import JWTError, jwt
import bcrypt
from app.models.user import User
from app.config import settings
from app.utils.email_sender import send_email


class AuthService:
    """인증 서비스"""
    _forgot_password_attempts: dict[str, list[float]] = {}
    _forgot_password_lock = threading.Lock()
    _forgot_password_window_seconds = 10 * 60
    _forgot_password_max_attempts = 5
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """비밀번호 검증"""
        try:
            password_bytes = plain_password.encode('utf-8')
            if len(password_bytes) > 72:
                password_bytes = password_bytes[:72]
            return bcrypt.checkpw(password_bytes, hashed_password.encode('utf-8'))
        except Exception:
            return False
    
    @staticmethod
    def get_password_hash(password: str) -> str:
        """비밀번호 해싱"""
        # bcrypt는 72바이트 제한이 있으므로 초과 시 잘라냄
        password_bytes = password.encode('utf-8')
        if len(password_bytes) > 72:
            password_bytes = password_bytes[:72]
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password_bytes, salt)
        return hashed.decode('utf-8')
    
    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """JWT 토큰 생성"""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return encoded_jwt
    
    @staticmethod
    def _generate_system_group_code(db: Session) -> str:
        """중복 없는 시스템 그룹 코드를 생성합니다."""
        for _ in range(20):
            candidate = f"GRP-{uuid.uuid4().hex[:8].upper()}"
            exists = db.query(User.id).filter(User.system_group_code == candidate).first()
            if not exists:
                return candidate
        raise ValueError("시스템 그룹 코드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.")

    @staticmethod
    def verify_token(token: str) -> Optional[dict]:
        """JWT 토큰 검증"""
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            return payload
        except JWTError:
            return None

    @staticmethod
    def _generate_temporary_password(length: int = 10) -> str:
        alphabet = string.ascii_letters + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(max(8, length)))

    @staticmethod
    def _normalize_identity_text(value: str) -> str:
        # 공백 차이를 제거하고 대소문자를 정규화해 이름/이메일 비교 오탐을 줄입니다.
        return " ".join((value or "").strip().split()).casefold()

    @classmethod
    def _check_forgot_password_rate_limit(cls, request_key: str) -> bool:
        now_ts = datetime.utcnow().timestamp()
        threshold = now_ts - cls._forgot_password_window_seconds
        key = request_key.strip().lower() or "anonymous"

        with cls._forgot_password_lock:
            records = cls._forgot_password_attempts.get(key, [])
            records = [ts for ts in records if ts >= threshold]
            if len(records) >= cls._forgot_password_max_attempts:
                cls._forgot_password_attempts[key] = records
                return False
            records.append(now_ts)
            cls._forgot_password_attempts[key] = records
            return True

    def _consume_forgot_password_dummy_cost(self) -> None:
        # 계정 존재 여부가 처리 시간으로 유추되지 않도록 더미 해싱을 수행합니다.
        _ = self.get_password_hash(self._generate_temporary_password())
    
    def register_user(
        self,
        db: Session,
        email: str,
        username: str,
        password: str,
        full_name: Optional[str] = None,
        system_group_code: Optional[str] = None,
    ) -> User:
        """사용자 회원가입"""
        try:
            # 이메일 중복 확인
            existing_user = db.query(User).filter(User.email == email).first()
            if existing_user:
                raise ValueError("이미 등록된 이메일입니다.")
            
            group_code = (system_group_code or "").strip()
            if not group_code:
                group_code = self._generate_system_group_code(db)

            # 비밀번호 해싱
            hashed_password = self.get_password_hash(password)
            
            # 사용자 생성
            user = User(
                email=email,
                username=username,
                system_group_code=group_code,
                hashed_password=hashed_password,
                full_name=full_name or username,
                role="user",
                is_active=True,
                # 직접 회원가입한 계정은 테넌트 초기 관리자 역할을 수행할 수 있도록
                # 시스템 관리 메뉴 접근을 기본 허용합니다.
                can_manage_system=True,
            )
            
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        except UnicodeDecodeError as e:
            # 인코딩 오류를 명확한 메시지로 변환
            db.rollback()
            raise ValueError(
                "데이터베이스 인코딩 오류가 발생했습니다. "
                "PostgreSQL 데이터베이스의 Collation을 UTF8로 변경해주세요. "
                f"오류 상세: {str(e)[:100]}"
            )
        except Exception as e:
            db.rollback()
            # 다른 오류는 그대로 전달
            raise
    
    def authenticate_user(self, db: Session, username: str, password: str) -> Optional[User]:
        """사용자 인증"""
        # 이메일은 전역 유니크, 사용자명은 그룹코드 단위 유니크
        if "@" in username:
            user = db.query(User).filter(User.email == username).first()
        else:
            users = db.query(User).filter(User.username == username).all()
            if len(users) > 1:
                raise ValueError("동일 사용자명이 여러 개 존재합니다. 이메일로 로그인해주세요.")
            user = users[0] if users else None

        if not user:
            if settings.DEBUG:
                print(f"[AUTH] 사용자를 찾을 수 없음: {username}")
            return None

        if not user.hashed_password:
            if settings.DEBUG:
                print(f"[AUTH] 비밀번호 해시 없음: {user.username}")
            return None

        # 비밀번호 검증
        password_valid = self.verify_password(password, user.hashed_password)
        if not password_valid:
            if settings.DEBUG:
                print(f"[AUTH] 비밀번호 검증 실패: {user.username}")
                # 비밀번호 검증 상세 정보
                try:
                    import bcrypt
                    password_bytes = password.encode('utf-8')
                    if len(password_bytes) > 72:
                        password_bytes = password_bytes[:72]
                    stored_hash_bytes = user.hashed_password.encode('utf-8')
                    check_result = bcrypt.checkpw(password_bytes, stored_hash_bytes)
                    print(f"[AUTH] bcrypt 직접 검증 결과: {check_result}")
                except Exception as e:
                    print(f"[AUTH] 비밀번호 검증 오류: {e}")
            return None
        
        if not user.is_active:
            if settings.DEBUG:
                print(f"[AUTH] 사용자 비활성화: {user.username}")
            return None
        
        # 마지막 로그인 시간 업데이트 (컬럼/DB 오류 시 로그인 자체는 유지)
        try:
            user.last_login = datetime.utcnow()
            db.commit()
        except Exception as e:
            db.rollback()
            if settings.DEBUG:
                print(f"[AUTH] last_login 업데이트 실패(무시): {e}")
        else:
            try:
                db.refresh(user)
            except Exception:
                pass
        
        if settings.DEBUG:
            print(f"[AUTH] 인증 성공: {user.username}")
        
        return user
    
    def get_current_user(self, db: Session, token: str) -> Optional[User]:
        """토큰으로 현재 사용자 조회"""
        payload = self.verify_token(token)
        if not payload:
            return None
        
        subject = payload.get("sub")
        if subject is None:
            return None

        # 신규 토큰은 user.id를 sub로 사용, 기존 토큰(호환)은 username 사용
        if str(subject).isdigit():
            return db.query(User).filter(User.id == int(subject)).first()
        return db.query(User).filter(User.username == str(subject)).first()

    def issue_temporary_password_by_identity(
        self,
        db: Session,
        email: str,
        full_name: str,
        request_key: Optional[str] = None,
    ) -> bool:
        if not self._check_forgot_password_rate_limit(request_key or "forgot-password"):
            raise RuntimeError("요청 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.")

        normalized_email = self._normalize_identity_text(email)
        normalized_name = self._normalize_identity_text(full_name)
        user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
        if not user:
            self._consume_forgot_password_dummy_cost()
            return False

        if self._normalize_identity_text(user.full_name or user.username) != normalized_name:
            self._consume_forgot_password_dummy_cost()
            return False

        temp_password = self._generate_temporary_password()
        user.hashed_password = self.get_password_hash(temp_password)

        subject = "[HAAS] 임시비밀번호 발급 안내"
        body = (
            f"{user.full_name or user.username}님,\n\n"
            "비밀번호 분실 요청으로 임시비밀번호가 발급되었습니다.\n"
            f"임시비밀번호: {temp_password}\n\n"
            "보안을 위해 로그인 직후 반드시 비밀번호를 변경해주세요.\n"
            "요청하신 적이 없다면 관리자에게 즉시 문의해주세요.\n\n"
            "감사합니다.\n"
            "HAAS"
        )
        html_body = f"""
        <html>
          <body style="margin:0; padding:0; background:#f3f8fc; font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif; color:#1f2937;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; overflow:hidden;">
                    <tr>
                      <td style="padding:22px 24px; background:linear-gradient(90deg,#0ea5e9,#0284c7); color:#ffffff;">
                        <div style="font-size:22px; font-weight:700; letter-spacing:0.2px;">HAAS</div>
                        <div style="margin-top:6px; font-size:14px; opacity:0.95;">임시비밀번호 발급 안내</div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:24px;">
                        <p style="margin:0 0 12px; font-size:16px; line-height:1.6;">
                          <strong>{user.full_name or user.username}</strong>님, 안녕하세요.
                        </p>
                        <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#374151;">
                          비밀번호 분실 요청으로 임시비밀번호가 발급되었습니다.<br/>
                          아래 비밀번호로 로그인하신 뒤, 반드시 새 비밀번호로 변경해주세요.
                        </p>
                        <div style="margin:0 0 18px; padding:14px 16px; border:1px dashed #0ea5e9; background:#f0f9ff; border-radius:10px;">
                          <div style="font-size:12px; color:#0369a1; margin-bottom:8px; font-weight:700;">임시비밀번호</div>
                          <div style="font-size:24px; font-weight:800; letter-spacing:1px; color:#0f172a; font-family:Consolas,'Courier New',monospace;">
                            {temp_password}
                          </div>
                        </div>
                        <div style="padding:12px 14px; border-radius:8px; background:#fff7ed; border:1px solid #fed7aa; color:#9a3412; font-size:13px; line-height:1.6;">
                          요청하신 적이 없다면 계정 보안을 위해 관리자에게 즉시 문의해주세요.
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:14px 24px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280; line-height:1.6;">
                        본 메일은 발신전용입니다. 문의사항은 시스템 관리자에게 연락해주세요.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
        """

        try:
            send_email(to=user.email, subject=subject, body=body, html_body=html_body)
            db.commit()
        except Exception:
            db.rollback()
            raise

        return True
