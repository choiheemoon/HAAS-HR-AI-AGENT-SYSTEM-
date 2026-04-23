"""시스템 관리 API (사용자·권한그룹·메뉴 권한)"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from pydantic import BaseModel

from app.database import get_db
from app.api.deps import require_system_admin
from app.services.system_rbac_service import SystemRbacService
from app.services.onboarding_setup_service import OnboardingSetupService
from app.models.user import User
from app.schemas.system_rbac import (
    PermissionGroupCreate,
    PermissionGroupUpdate,
    PermissionGroupResponse,
    AppMenuResponse,
    MenuPermissionRow,
    GroupMenuPermissionsPut,
    AdminUserResponse,
    AdminUserCreate,
    AdminUserUpdate,
    UserCompanyIdsPut,
)

router = APIRouter(dependencies=[Depends(require_system_admin)])


class TemplateGenerationRequest(BaseModel):
    source_company_id: int
    target_company_id: int | None = None
    create_new_company: bool = False
    major_minor_codes: bool = True
    hr_reference: bool = True
    attendance_reference: bool = True
    system_rbac: bool = True


def _svc(db: Session) -> SystemRbacService:
    return SystemRbacService(db)


# —— 메뉴(시드) ——
@router.get("/menus", response_model=List[AppMenuResponse])
def list_menus(db: Session = Depends(get_db)):
    _svc(db).seed_menus_if_needed()
    return _svc(db).list_menus()


# —— 권한 그룹 ——
@router.get("/permission-groups", response_model=List[PermissionGroupResponse])
def list_permission_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    return _svc(db).list_groups(current_user=current_user)


@router.post("/permission-groups", response_model=PermissionGroupResponse)
def create_permission_group(
    body: PermissionGroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        return _svc(db).create_group(body.model_dump(), current_user=current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail="그룹 코드가 중복됩니다.") from e


@router.put("/permission-groups/{group_id}", response_model=PermissionGroupResponse)
def update_permission_group(
    group_id: int,
    body: PermissionGroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        return _svc(db).update_group(
            group_id, body.model_dump(exclude_unset=True), current_user=current_user
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/permission-groups/{group_id}")
def delete_permission_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        _svc(db).delete_group(group_id, current_user=current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True}


# —— 그룹별 메뉴·CRUD 권한 ——
@router.get(
    "/permission-groups/{group_id}/menu-permissions",
    response_model=List[MenuPermissionRow],
)
def get_group_menu_permissions(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        rows = _svc(db).get_group_menu_matrix(group_id, current_user=current_user)
        return [MenuPermissionRow(**r) for r in rows]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/permission-groups/{group_id}/menu-permissions")
def put_group_menu_permissions(
    group_id: int,
    body: GroupMenuPermissionsPut,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        _svc(db).put_group_menu_matrix(
            group_id,
            [i.model_dump() for i in body.items],
            current_user=current_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True}


# —— 사용자 관리 ——
@router.get("/users", response_model=List[AdminUserResponse])
def list_system_users(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    return _svc(db).list_users(current_user=current_user, company_id=company_id)


@router.post("/users", response_model=AdminUserResponse)
def create_system_user(
    body: AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        u = _svc(db).create_user(body.model_dump(), current_user=current_user)
        return u
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail="이메일 또는 사용자명이 중복됩니다.") from e


@router.put("/users/{user_id}", response_model=AdminUserResponse)
def update_system_user(
    user_id: int,
    body: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    data = body.model_dump(exclude_unset=True)
    if not data.get("password"):
        data.pop("password", None)
    try:
        return _svc(db).update_user(user_id, data, current_user=current_user)
    except ValueError as e:
        msg = str(e)
        if "사용자를 찾을 수 없습니다" in msg or "로그인 사용자를 찾을 수 없습니다" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.delete("/users/{user_id}")
def deactivate_system_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        _svc(db).deactivate_user(user_id, current_user=current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True}


@router.get("/users/{user_id}/companies")
def get_user_company_access(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        ids = _svc(db).get_user_company_ids(user_id, current_user=current_user)
        return {"company_ids": ids}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/users/{user_id}/companies")
def put_user_company_access(
    user_id: int,
    body: UserCompanyIdsPut,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        _svc(db).set_user_companies(
            user_id, body.company_ids, current_user=current_user
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True}


@router.post("/template-generation")
def run_template_generation(
    body: TemplateGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_system_admin),
):
    try:
        return OnboardingSetupService(db).run_template_generation(
            current_user,
            source_company_id=int(body.source_company_id),
            target_company_id=int(body.target_company_id) if body.target_company_id else None,
            create_new_company=bool(body.create_new_company),
            options={
                "major_minor_codes": bool(body.major_minor_codes),
                "hr_reference": bool(body.hr_reference),
                "attendance_reference": bool(body.attendance_reference),
                "system_rbac": bool(body.system_rbac),
            },
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"템플릿 생성(기준정보) 중 오류가 발생했습니다: {str(e)}"
        ) from e
