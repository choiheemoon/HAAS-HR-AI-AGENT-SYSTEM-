"""회사별 Major 코드 기준정보 API"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.models.major_code import MajorCode
from app.schemas.major_code import MajorCodeCreate, MajorCodeResponse, MajorCodeUpdate
from app.services.major_code_service import MajorCodeService
from app.services.system_rbac_service import SystemRbacService

router = APIRouter()


def _get_allowed_company_ids(current_user, db: Session) -> List[int]:
    rbac = SystemRbacService(db)
    return rbac.get_user_company_ids(current_user.id, current_user=current_user)


@router.get("", response_model=List[MajorCodeResponse])
@router.get("/", response_model=List[MajorCodeResponse])
def list_major_codes(
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")
    q = db.query(MajorCode).filter(MajorCode.company_id.in_(allowed_company_ids))
    if company_id is not None:
        q = q.filter(MajorCode.company_id == company_id)
    return q.order_by(MajorCode.major_code.asc()).all()


@router.get("/{major_code_id}", response_model=MajorCodeResponse)
@router.get("/{major_code_id}/", response_model=MajorCodeResponse)
def get_major_code(
    major_code_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if not allowed_company_ids:
        raise HTTPException(status_code=404, detail="Major 코드를 찾을 수 없습니다.")
    row = MajorCodeService(db).get(major_code_id)
    if not row or row.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="Major 코드를 찾을 수 없습니다.")
    return row


@router.post("", response_model=MajorCodeResponse)
@router.post("/", response_model=MajorCodeResponse)
def create_major_code(
    body: MajorCodeCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if body.company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")
    svc = MajorCodeService(db)
    try:
        return svc.create(body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail=str(getattr(e, "orig", e))) from e


@router.put("/{major_code_id}", response_model=MajorCodeResponse)
@router.put("/{major_code_id}/", response_model=MajorCodeResponse)
def update_major_code(
    major_code_id: int,
    body: MajorCodeUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    row = MajorCodeService(db).get(major_code_id)
    if not row or row.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="Major 코드를 찾을 수 없습니다.")
    try:
        return MajorCodeService(db).update(
            major_code_id, body.model_dump(exclude_unset=True)
        )
    except PermissionError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail=str(getattr(e, "orig", e))) from e


@router.delete("/{major_code_id}")
@router.delete("/{major_code_id}/")
def delete_major_code(
    major_code_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    row = MajorCodeService(db).get(major_code_id)
    if not row or row.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="Major 코드를 찾을 수 없습니다.")
    try:
        MajorCodeService(db).delete(major_code_id)
    except PermissionError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True, "id": major_code_id}

