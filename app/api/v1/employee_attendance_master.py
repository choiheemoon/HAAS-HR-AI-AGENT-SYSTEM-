"""직원 근태 마스터 API."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.services.employee_attendance_master_service import EmployeeAttendanceMasterService

router = APIRouter()


@router.get("/{employee_id}/attendance-master", response_model=Dict[str, Any])
@router.get("/{employee_id}/attendance-master/", response_model=Dict[str, Any])
def get_employee_attendance_master(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return EmployeeAttendanceMasterService(db).get_bundle(employee_id, current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/{employee_id}/attendance-master", response_model=Dict[str, Any])
@router.put("/{employee_id}/attendance-master/", response_model=Dict[str, Any])
def put_employee_attendance_master(
    employee_id: int,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return EmployeeAttendanceMasterService(db).save_bundle(employee_id, current_user, body)
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)[:500]) from e


@router.delete("/{employee_id}/attendance-master")
@router.delete("/{employee_id}/attendance-master/")
def delete_employee_attendance_master(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        EmployeeAttendanceMasterService(db).delete_bundle(employee_id, current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True, "employee_id": employee_id}
