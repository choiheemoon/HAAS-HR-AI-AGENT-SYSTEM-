"""인증 서비스"""
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from datetime import datetime, timedelta
import uuid
from jose import JWTError, jwt
import bcrypt
from app.models.user import User
from app.config import settings


class AuthService:
    """인증 서비스"""
    
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
