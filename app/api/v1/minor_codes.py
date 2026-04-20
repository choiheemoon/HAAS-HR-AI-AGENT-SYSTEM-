"""회사별 Minor 코드 기준정보 API"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError, DBAPIError
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.models.major_code import MajorCode
from app.models.minor_code import MinorCode
from app.schemas.minor_code import MinorCodeCreate, MinorCodeResponse, MinorCodeUpdate
from app.services.minor_code_service import MinorCodeService
from app.services.system_rbac_service import SystemRbacService

router = APIRouter()


def _get_allowed_company_ids(current_user, db: Session) -> List[int]:
    rbac = SystemRbacService(db)
    return rbac.get_user_company_ids(current_user.id, current_user=current_user)


@router.get("", response_model=List[MinorCodeResponse])
@router.get("/", response_model=List[MinorCodeResponse])
def list_minor_codes(
    company_id: Optional[int] = None,
    major_code_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")
    q = db.query(MinorCode).filter(MinorCode.company_id.in_(allowed_company_ids))
    if company_id is not None:
        q = q.filter(MinorCode.company_id == company_id)
    if major_code_id is not None:
        q = q.filter(MinorCode.major_code_id == major_code_id)
    return q.order_by(MinorCode.minor_code.asc()).all()


@router.get("/{minor_code_id}", response_model=MinorCodeResponse)
@router.get("/{minor_code_id}/", response_model=MinorCodeResponse)
def get_minor_code(
    minor_code_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if not allowed_company_ids:
        raise HTTPException(status_code=404, detail="Minor 코드를 찾을 수 없습니다.")
    row = MinorCodeService(db).get(minor_code_id)
    if not row or row.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="Minor 코드를 찾을 수 없습니다.")
    return row


@router.post("", response_model=MinorCodeResponse)
@router.post("/", response_model=MinorCodeResponse)
def create_minor_code(
    body: MinorCodeCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if body.company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")

    major = db.query(MajorCode).filter(MajorCode.id == body.major_code_id).first()
    if not major or major.company_id != body.company_id:
        raise HTTPException(
            status_code=400, detail="선택한 Major 코드가 회사와 일치하지 않습니다."
        )

    svc = MinorCodeService(db)
    try:
        return svc.create(body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail=str(getattr(e, "orig", e))) from e


@router.put("/{minor_code_id}", response_model=MinorCodeResponse)
@router.put("/{minor_code_id}/", response_model=MinorCodeResponse)
def update_minor_code(
    minor_code_id: int,
    body: MinorCodeUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    row = MinorCodeService(db).get(minor_code_id)
    if not row or row.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="Minor 코드를 찾을 수 없습니다.")
    try:
        return MinorCodeService(db).update(
            minor_code_id, body.model_dump(exclude_unset=True)
        )
    except PermissionError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except IntegrityError as e:
        raise HTTPException(status_code=409, detail=str(getattr(e, "orig", e))) from e


@router.delete("/{minor_code_id}")
@router.delete("/{minor_code_id}/")
def delete_minor_code(
    minor_code_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    row = MinorCodeService(db).get(minor_code_id)
    if not row or row.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="Minor 코드를 찾을 수 없습니다.")
    try:
        MinorCodeService(db).delete(minor_code_id)
    except PermissionError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except IntegrityError as e:
        raise HTTPException(
            status_code=409,
            detail="해당 Minor 코드는 인사정보에서 사용 중이라 삭제할 수 없습니다.",
        ) from e
    except DBAPIError as e:
        raise HTTPException(
            status_code=409,
            detail="해당 Minor 코드는 인사정보에서 사용 중이라 삭제할 수 없습니다.",
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True, "id": minor_code_id}

