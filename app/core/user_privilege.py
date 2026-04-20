"""로그인 사용자의 관리자/전체 메뉴 권한 판별 (역할·플래그 통합)."""
from app.models.user import User


def user_has_unrestricted_app_menus(user: User) -> bool:
    """
    권한그룹 메뉴 매트릭스를 건너뛰고 앱 전 메뉴·CRUD 허용.
    - is_superuser
    - role == admin
    
    can_manage_system 단독은 포함하지 않음(시스템 관리 API/시스템 메뉴만 필요한 계정은
    UI에서 '시스템 관리'만 쓰고 나머지는 권한그룹만 따름).
    """
    if bool(getattr(user, "is_superuser", False)):
        return True
    role = (getattr(user, "role", None) or "").strip().lower()
    return role == "admin"


def user_has_elevated_access(user: User) -> bool:
    """
    시스템 관리 API(/api/v1/system/*) 및 시스템 관리 사이드바 섹션 접근.
    - 슈퍼유저, can_manage_system, role admin
    """
    if bool(getattr(user, "is_superuser", False)):
        return True
    if bool(getattr(user, "can_manage_system", False)):
        return True
    role = (getattr(user, "role", None) or "").strip().lower()
    return role == "admin"
