"""직원 학력 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.services.employee_education_service import EmployeeEducationService
from app.schemas.employee_education import (
    EmployeeEducationCreate,
    EmployeeEducationUpdate,
    EmployeeEducationResponse,
    EmployeeEducationBulkSave,
)

router = APIRouter()


@router.get("/{employee_id}/educations", response_model=List[EmployeeEducationResponse])
def list_employee_educations(employee_id: int, db: Session = Depends(get_db)):
    """직원 학력 목록 (sort_order 오름차순, 맨 위가 최신 No.1)"""
    svc = EmployeeEducationService(db)
    try:
        return svc.list_by_employee(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{employee_id}/educations", response_model=EmployeeEducationResponse)
def create_employee_education(
    employee_id: int,
    body: EmployeeEducationCreate,
    db: Session = Depends(get_db),
):
    """학력 행 추가 (새 행이 맨 위 sort_order=0, 기존 행 순번 밀림)"""
    svc = EmployeeEducationService(db)
    try:
        return svc.create(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put(
    "/{employee_id}/educations/bulk-save",
    response_model=List[EmployeeEducationResponse],
)
def bulk_save_employee_educations(
    employee_id: int,
    body: EmployeeEducationBulkSave,
    db: Session = Depends(get_db),
):
    """학력 행 일괄 저장 (성능 최적화: 단일 트랜잭션)"""
    svc = EmployeeEducationService(db)
    try:
        payload = body.model_dump(exclude_unset=True)
        return svc.bulk_save(employee_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put(
    "/{employee_id}/educations/{education_id}",
    response_model=EmployeeEducationResponse,
)
def update_employee_education(
    employee_id: int,
    education_id: int,
    body: EmployeeEducationUpdate,
    db: Session = Depends(get_db),
):
    """학력 행 수정"""
    svc = EmployeeEducationService(db)
    try:
        return svc.update(
            employee_id, education_id, body.model_dump(exclude_unset=True)
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/{employee_id}/educations/{education_id}")
def delete_employee_education(
    employee_id: int, education_id: int, db: Session = Depends(get_db)
):
    """학력 행 삭제"""
    svc = EmployeeEducationService(db)
    try:
        svc.delete(employee_id, education_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True, "id": education_id}
