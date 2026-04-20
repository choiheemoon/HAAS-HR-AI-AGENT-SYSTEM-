"""회사별 급여형태(EMPLOYEE TYPE) 기준정보 API"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.models.employee_type import EmployeeType
from app.schemas.employee_type import (
    EmployeeTypeCreate,
    EmployeeTypeResponse,
    EmployeeTypeUpdate,
)
from app.services.employee_type_service import EmployeeTypeService
from app.services.system_rbac_service import SystemRbacService

router = APIRouter()


def _get_allowed_company_ids(current_user, db: Session) -> List[int]:
    rbac = SystemRbacService(db)
    return rbac.get_user_company_ids(current_user.id, current_user=current_user)


@router.get("", response_model=List[EmployeeTypeResponse])
@router.get("/", response_model=List[EmployeeTypeResponse])
def list_employee_types(
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """사용자 접근 가능한 회사에 속한 급여형태 목록"""
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if not allowed_company_ids:
        return []

    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")

    q = db.query(EmployeeType).filter(EmployeeType.company_id.in_(allowed_company_ids))
    if company_id is not None:
        q = q.filter(EmployeeType.company_id == company_id)

    return q.order_by(EmployeeType.employee_type_code.asc()).all()


@router.get("/{employee_type_id}", response_model=EmployeeTypeResponse)
@router.get("/{employee_type_id}/", response_model=EmployeeTypeResponse)
def get_employee_type(
    employee_type_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """급여형태 단건 조회"""
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if not allowed_company_ids:
        raise HTTPException(status_code=404, detail="급여형태를 찾을 수 없습니다.")

    row = EmployeeTypeService(db).get(employee_type_id)
    if not row or row.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="급여형태를 찾을 수 없습니다.")
    return row


@router.post("", response_model=EmployeeTypeResponse)
@router.post("/", response_model=EmployeeTypeResponse)
def create_employee_type(
    body: EmployeeTypeCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """급여형태 생성"""
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if body.company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")

    svc = EmployeeTypeService(db)
    try:
        return svc.create(body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except IntegrityError as e:
        detail = str(getattr(e, "orig", e))
        raise HTTPException(status_code=409, detail=detail) from e


@router.put("/{employee_type_id}", response_model=EmployeeTypeResponse)
@router.put("/{employee_type_id}/", response_model=EmployeeTypeResponse)
def update_employee_type(
    employee_type_id: int,
    body: EmployeeTypeUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """급여형태 수정 (company_id/코드는 수정 불가)"""
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if not allowed_company_ids:
        raise HTTPException(status_code=404, detail="급여형태를 찾을 수 없습니다.")

    row = EmployeeTypeService(db).get(employee_type_id)
    if not row or row.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="급여형태를 찾을 수 없습니다.")

    payload = body.model_dump(exclude_unset=True)

    svc = EmployeeTypeService(db)
    try:
        return svc.update(employee_type_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except IntegrityError as e:
        detail = str(getattr(e, "orig", e))
        raise HTTPException(status_code=409, detail=detail) from e


@router.delete("/{employee_type_id}")
@router.delete("/{employee_type_id}/")
def delete_employee_type(
    employee_type_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """급여형태 삭제"""
    allowed_company_ids = _get_allowed_company_ids(current_user, db)
    if not allowed_company_ids:
        raise HTTPException(status_code=404, detail="급여형태를 찾을 수 없습니다.")

    row = EmployeeTypeService(db).get(employee_type_id)
    if not row or row.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="급여형태를 찾을 수 없습니다.")

    try:
        EmployeeTypeService(db).delete(employee_type_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    return {"ok": True, "id": employee_type_id}

