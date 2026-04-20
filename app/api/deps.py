"""공통 API 의존성"""
from fastapi import Depends, HTTPException, status

from app.api.v1.auth import get_current_user
from app.models.user import User
from app.core.user_privilege import user_has_elevated_access


def require_system_admin(current_user: User = Depends(get_current_user)) -> User:
    """시스템 관리 API: 슈퍼유저·시스템관리 플래그·role=admin 계정."""
    if user_has_elevated_access(current_user):
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="시스템 관리 권한이 없습니다. 관리자가 사용자 관리 메뉴에서 등록한 계정만 접근할 수 있습니다.",
    )
