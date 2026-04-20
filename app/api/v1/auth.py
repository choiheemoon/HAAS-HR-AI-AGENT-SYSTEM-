"""인증 API"""
import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import ProgrammingError, SQLAlchemyError
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import timedelta
from app.database import get_db
from app.services.auth import AuthService
from app.services.system_rbac_service import SystemRbacService
from app.models.user import User
from app.config import settings
from app.schemas.system_rbac import MenuPermissionRow
from app.models.company import Company
from app.schemas.company import CompanyResponse

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


class UserRegister(BaseModel):
    """회원가입 요청"""
    email: EmailStr
    username: str
    password: str
    full_name: Optional[str] = None


class UserResponse(BaseModel):
    """사용자 응답"""
    id: int
    email: str
    username: str
    system_group_code: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    is_superuser: bool = False
    can_manage_system: bool = False
    permission_group_id: Optional[int] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    """토큰 응답"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenData(BaseModel):
    """토큰 데이터"""
    username: Optional[str] = None


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """현재 사용자 조회"""
    auth_service = AuthService()
    user = auth_service.get_current_user(db, token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증에 실패했습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_user_optional(
    token: Optional[str] = None,
    db: Session = Depends(get_db)
) -> Optional[User]:
    """현재 사용자 조회 (선택적) - 토큰이 없어도 None 반환"""
    from fastapi import Header
    try:
        # Authorization 헤더에서 토큰 추출
        # 실제로는 Header를 사용하여 직접 추출해야 함
        return None
    except Exception:
        return None


def get_current_user_optional(
    token: Optional[str] = Depends(OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """현재 사용자 조회 (선택적)"""
    if not token:
        return None
    try:
        auth_service = AuthService()
        user = auth_service.get_current_user(db, token)
        return user
    except Exception:
        return None


@router.post("/register", response_model=UserResponse)
def register(
    user_data: UserRegister,
    db: Session = Depends(get_db)
):
    """회원가입"""
    auth_service = AuthService()
    try:
        user = auth_service.register_user(
            db=db,
            email=user_data.email,
            username=user_data.username,
            password=user_data.password,
            full_name=user_data.full_name,
        )
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # 내부 서버 오류 로깅
        import traceback
        print(f"회원가입 오류: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"회원가입 처리 중 오류가 발생했습니다: {str(e)}")


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """로그인"""
    try:
        auth_service = AuthService()
    except Exception as e:
        if settings.DEBUG:
            import traceback
            print(f"[LOGIN] AuthService 초기화 오류: {e}")
            traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="로그인 처리 중 오류가 발생했습니다.",
        )
    
    if settings.DEBUG:
        print(f"[LOGIN] 로그인 시도: username={form_data.username}")
    
    try:
        user = auth_service.authenticate_user(db, form_data.username, form_data.password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except ProgrammingError as e:
        logging.exception("login: DB schema / SQL error")
        orig = getattr(e, "orig", None)
        hint = (
            "DB에 users.permission_group_id 등 필수 컬럼이 없을 수 있습니다. "
            "API 서버를 최신 코드로 재시작하면 스키마가 자동 보정되거나, "
            "migrations/ensure_full_system_rbac_schema.sql 을 DB에 실행하세요."
        )
        detail = f"데이터베이스 스키마 오류입니다. {hint}"
        if settings.DEBUG:
            detail = f"{detail} 원인: {orig or e}"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        ) from e
    except SQLAlchemyError as e:
        logging.exception("login: SQLAlchemy error")
        detail = "로그인 처리 중 DB 오류가 발생했습니다."
        if settings.DEBUG:
            detail = f"{detail} ({e})"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        ) from e
    except Exception as e:
        logging.exception("login: authenticate_user failed")
        detail = "로그인 처리 중 오류가 발생했습니다. (DB/비밀번호 검증)"
        if settings.DEBUG:
            detail = f"{detail} — {e}\n{traceback.format_exc()}"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
        ) from e
    
    if not user:
        # 디버깅: 실패 원인 로깅
        if settings.DEBUG:
            # 사용자 존재 여부 확인
            found_user = (
                db.query(User)
                .filter(or_(User.username == form_data.username, User.email == form_data.username))
                .first()
            )
            if found_user:
                print(f"[LOGIN] 사용자 발견: {found_user.username}, 비밀번호 검증 실패")
            else:
                print(f"[LOGIN] 사용자를 찾을 수 없음: {form_data.username}")
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자명 또는 비밀번호가 올바르지 않습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 액세스 토큰 생성
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth_service.create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    
    if settings.DEBUG:
        print(f"[LOGIN] 로그인 성공: {user.username}")
    
    try:
        user_response = UserResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            system_group_code=user.system_group_code,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            is_superuser=bool(user.is_superuser),
            can_manage_system=bool(getattr(user, "can_manage_system", False)),
            permission_group_id=getattr(user, "permission_group_id", None),
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_response
        }
    except Exception as e:
        if settings.DEBUG:
            print(f"[ERROR] UserResponse 생성 오류: {e}")
            import traceback
            traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="로그인 응답 생성 중 오류가 발생했습니다."
        )


class UserUpdateRequest(BaseModel):
    """사용자 정보 업데이트 요청"""
    full_name: Optional[str] = None


@router.get("/me", response_model=UserResponse)
def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """현재 사용자 정보 조회"""
    try:
        # User 모델을 UserResponse로 변환
        return UserResponse(
            id=current_user.id,
            email=current_user.email,
            username=current_user.username,
            system_group_code=current_user.system_group_code,
            full_name=current_user.full_name,
            role=current_user.role,
            is_active=current_user.is_active,
            is_superuser=bool(current_user.is_superuser),
            can_manage_system=bool(getattr(current_user, "can_manage_system", False)),
            permission_group_id=getattr(current_user, "permission_group_id", None),
        )
    except Exception as e:
        if settings.DEBUG:
            print(f"[ERROR] 사용자 정보 조회 오류: {e}")
            import traceback
            traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="사용자 정보를 조회하는 중 오류가 발생했습니다."
        )


@router.get("/me/menu-permissions", response_model=List[MenuPermissionRow])
def get_my_menu_permissions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """현재 사용자의 권한 그룹 기준 메뉴별 CRUD (화면·버튼 제어용)"""
    rows = SystemRbacService(db).get_effective_menu_permissions_for_user(current_user)
    return [MenuPermissionRow(**r) for r in rows]


@router.get("/me/companies", response_model=List[CompanyResponse])
def get_my_companies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """사용자별 접근 가능한 회사 목록"""
    ids = SystemRbacService(db).get_user_company_ids(
        current_user.id, current_user=current_user
    )
    if not ids:
        return []
    return (
        db.query(Company)
        .filter(Company.id.in_(ids))
        .order_by(Company.company_code.asc())
        .all()
    )


@router.put("/me", response_model=UserResponse)
def update_user_info(
    user_data: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """사용자 정보 업데이트"""
    try:
        # 이름 업데이트
        if user_data.full_name is not None:
            current_user.full_name = user_data.full_name
        
        db.commit()
        db.refresh(current_user)
        
        # User 모델을 UserResponse로 변환
        return UserResponse(
            id=current_user.id,
            email=current_user.email,
            username=current_user.username,
            system_group_code=current_user.system_group_code,
            full_name=current_user.full_name,
            role=current_user.role,
            is_active=current_user.is_active,
            is_superuser=bool(current_user.is_superuser),
            can_manage_system=bool(getattr(current_user, "can_manage_system", False)),
            permission_group_id=getattr(current_user, "permission_group_id", None),
        )
    except Exception as e:
        db.rollback()
        if settings.DEBUG:
            print(f"[ERROR] 사용자 정보 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="사용자 정보를 업데이트하는 중 오류가 발생했습니다."
        )


class PasswordChangeRequest(BaseModel):
    """비밀번호 변경 요청"""
    current_password: str
    new_password: str


@router.put("/me/password", response_model=UserResponse)
def change_password(
    password_data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """비밀번호 변경"""
    auth_service = AuthService()
    
    # 현재 비밀번호 확인
    if not auth_service.verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="현재 비밀번호가 올바르지 않습니다."
        )
    
    # 새 비밀번호 유효성 검사
    if len(password_data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="새 비밀번호는 최소 6자 이상이어야 합니다."
        )
    
    # 비밀번호 변경
    new_hashed_password = auth_service.get_password_hash(password_data.new_password)
    current_user.hashed_password = new_hashed_password
    db.commit()
    db.refresh(current_user)
    
    return current_user
