"""직원 증명사진 API — /employees 라우터와 분리해 배포·점검 시 누락을 줄입니다."""

from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.company import Company
from app.services.auth.auth_service import AuthService
from app.services.employee_photo_storage import (
    absolute_file_path,
    delete_employee_photo_pair,
    media_type_for_path,
    save_employee_photo_file,
    thumb_relative_path_from_main,
)
from app.services.master_data import MasterDataService
from app.services.system_rbac_service import SystemRbacService

router = APIRouter()


def _company_folder_for_employee_photo(db: Session, employee) -> str:
    """저장용 하위 폴더명(회사코드). 미지정·누락 시 안정적인 대체 이름."""
    if employee.company_id is None:
        return "_no_company"
    co = db.query(Company).filter(Company.id == employee.company_id).first()
    if not co:
        return f"_company_{employee.company_id}"
    code = (co.company_code or "").strip()
    if not code:
        return f"_company_{employee.company_id}"
    return code


def _access_token_from_request(
    authorization: Optional[str],
    access_token: Optional[str],
) -> Optional[str]:
    if access_token and str(access_token).strip():
        return str(access_token).strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def _photo_auth_user(
    db: Session,
    authorization: Optional[str],
    access_token: Optional[str],
):
    token = _access_token_from_request(authorization, access_token)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="인증이 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    auth_service = AuthService()
    user = auth_service.get_current_user(db, token)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="인증에 실패했습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


@router.post("/{employee_id}/photo")
@router.post("/{employee_id}/photo/")
async def upload_employee_photo(
    employee_id: int,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """직원 증명사진 업로드: 2MB 이하 원본 → JPEG 본편(500px) + thumbnails(150px)."""
    service = MasterDataService(db)
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    employee = service.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    if employee.company_id is not None and employee.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    old_path = employee.photo_path
    company_folder = _company_folder_for_employee_photo(db, employee)
    storage = settings.STORAGE_PATH or "./storage"
    try:
        rel_main, rel_thumb = await save_employee_photo_file(
            storage_path=storage,
            employee_id=employee_id,
            company_folder=company_folder,
            upload=file,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    delete_employee_photo_pair(storage, old_path)
    employee.photo_path = rel_main
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return {"photo_path": rel_main, "thumbnail_path": rel_thumb}


@router.get("/{employee_id}/photo/thumbnail")
@router.get("/{employee_id}/photo/thumbnail/")
def get_employee_photo_thumbnail(
    employee_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Query(None),
):
    """목록용 썸네일. 파일 없으면 본편 이미지로 대체(구버전 데이터)."""
    user = _photo_auth_user(db, authorization, access_token)
    service = MasterDataService(db)
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(user.id, current_user=user)
    employee = service.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    if employee.company_id is not None and employee.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    if not employee.photo_path:
        raise HTTPException(status_code=404, detail="등록된 사진이 없습니다.")
    storage = settings.STORAGE_PATH or "./storage"
    thumb_rel = thumb_relative_path_from_main(employee.photo_path)
    path = None
    use_rel = employee.photo_path
    if thumb_rel:
        path = absolute_file_path(storage, thumb_rel)
        if path is not None:
            use_rel = thumb_rel
    if path is None:
        path = absolute_file_path(storage, employee.photo_path)
        use_rel = employee.photo_path
    if path is None:
        raise HTTPException(status_code=404, detail="사진 파일을 찾을 수 없습니다.")
    return FileResponse(str(path), media_type=media_type_for_path(use_rel))


@router.get("/{employee_id}/photo")
@router.get("/{employee_id}/photo/")
def get_employee_photo(
    employee_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Query(None),
):
    """직원 본편 사진 (img src용: access_token 쿼리 또는 Bearer 허용)."""
    user = _photo_auth_user(db, authorization, access_token)
    service = MasterDataService(db)
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(user.id, current_user=user)
    employee = service.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    if employee.company_id is not None and employee.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    if not employee.photo_path:
        raise HTTPException(status_code=404, detail="등록된 사진이 없습니다.")
    path = absolute_file_path(settings.STORAGE_PATH or "./storage", employee.photo_path)
    if path is None:
        raise HTTPException(status_code=404, detail="사진 파일을 찾을 수 없습니다.")
    return FileResponse(str(path), media_type=media_type_for_path(employee.photo_path))


@router.delete("/{employee_id}/photo")
@router.delete("/{employee_id}/photo/")
def delete_employee_photo(
    employee_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """직원 사진 삭제(DB 필드 및 본편·썸네일 파일)."""
    service = MasterDataService(db)
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    employee = service.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    if employee.company_id is not None and employee.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    old_path = employee.photo_path
    employee.photo_path = None
    db.add(employee)
    db.commit()
    delete_employee_photo_pair(settings.STORAGE_PATH or "./storage", old_path)
    return {"message": "삭제되었습니다.", "photo_path": None}
