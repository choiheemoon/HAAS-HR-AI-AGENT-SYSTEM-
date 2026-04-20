"""회사별 근태 기준정보 API."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.services.attendance_standard_service import AttendanceStandardService

router = APIRouter()


@router.get("/standard/{company_id}", response_model=Dict[str, Any])
@router.get("/standard-manage/{company_id}", response_model=Dict[str, Any])
def get_attendance_standard(
    company_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendanceStandardService(db).get_bundle(company_id, current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/standard/{company_id}", response_model=Dict[str, Any])
@router.put("/standard-manage/{company_id}", response_model=Dict[str, Any])
def put_attendance_standard(
    company_id: int,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendanceStandardService(db).save_bundle(company_id, current_user, body)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)[:500]) from e
