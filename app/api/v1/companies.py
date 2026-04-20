"""회사 마스터 API"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy.exc import DBAPIError, IntegrityError
from typing import Any, Dict, List

from app.database import get_db
from app.services.company_service import CompanyService
from app.services.attendance_standard_service import AttendanceStandardService
from app.schemas.company import CompanyCreate, CompanyUpdate, CompanyResponse
from app.api.v1.auth import get_current_user

router = APIRouter()


@router.get("", response_model=List[CompanyResponse])
@router.get("/", response_model=List[CompanyResponse])
def list_companies(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return CompanyService(db).list_companies(current_user=current_user)


@router.get("/{company_id}/attendance-standard", response_model=Dict[str, Any])
@router.get("/{company_id}/attendance-standard-manage", response_model=Dict[str, Any])
def get_company_attendance_standard(
    company_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """회사별 근태 기준정보 조회 (`/attendance/standard/{id}` 와 동일, 프록시·구버전 호환용)."""
    try:
        return AttendanceStandardService(db).get_bundle(company_id, current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/{company_id}/attendance-standard", response_model=Dict[str, Any])
@router.put("/{company_id}/attendance-standard-manage", response_model=Dict[str, Any])
def put_company_attendance_standard(
    company_id: int,
    body: Dict[str, Any] = Body(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """회사별 근태 기준정보 저장."""
    try:
        return AttendanceStandardService(db).save_bundle(company_id, current_user, body)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)[:500]) from e


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(company_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    row = CompanyService(db).get(company_id, current_user=current_user)
    if not row:
        raise HTTPException(status_code=404, detail="회사를 찾을 수 없습니다.")
    return row


@router.post("", response_model=CompanyResponse)
@router.post("/", response_model=CompanyResponse)
def create_company(body: CompanyCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    svc = CompanyService(db)
    try:
        return svc.create(body.model_dump(exclude_unset=True), current_user=current_user)
    except ValueError as e:
        msg = str(e)
        if "동일 시스템 그룹 내에 이미 같은 회사 코드" in msg:
            raise HTTPException(status_code=409, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
    except IntegrityError as e:
        raise HTTPException(
            status_code=409,
            detail="동일 시스템 그룹 내에 이미 같은 회사 코드가 있습니다.",
        ) from e


@router.put("/{company_id}", response_model=CompanyResponse)
def update_company(company_id: int, body: CompanyUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    svc = CompanyService(db)
    try:
        return svc.update(company_id, body.model_dump(exclude_unset=True), current_user=current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except IntegrityError as e:
        raise HTTPException(
            status_code=409,
            detail="동일 시스템 그룹 내에 이미 같은 회사 코드가 있습니다.",
        ) from e


def _is_pg_foreign_key_violation(exc: Exception) -> bool:
    text = str(getattr(exc, "orig", exc) or exc).lower()
    return "foreign key" in text or "23503" in text or "violates foreign key constraint" in text


@router.delete("/{company_id}")
def delete_company(company_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    svc = CompanyService(db)
    conflict_detail = (
        "해당 회사에 소속된 직원이 있거나, 인사기준정보 등이 직원 데이터에서 참조 중이라 삭제할 수 없습니다."
    )
    try:
        svc.delete(company_id, current_user=current_user)
    except ValueError as e:
        msg = str(e)
        if "회사를 찾을 수 없습니다" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=409, detail=msg) from e
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=conflict_detail) from e
    except DBAPIError as e:
        db.rollback()
        if _is_pg_foreign_key_violation(e):
            raise HTTPException(status_code=409, detail=conflict_detail) from e
        raise HTTPException(
            status_code=500,
            detail="데이터베이스 처리 중 오류가 발생했습니다.",
        ) from e
    return {"ok": True, "id": company_id}
