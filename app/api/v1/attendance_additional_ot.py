"""추가 OT(Regular OT asking) API."""
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.services.attendance_additional_ot_service import AttendanceAdditionalOtService

router = APIRouter()


def _pd(v: Optional[str]) -> Optional[date]:
    if v is None or str(v).strip() == "":
        return None
    s = str(v).strip()[:10]
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


@router.get("/additional-ot", response_model=Dict[str, List[Dict[str, Any]]])
def list_additional_ot(
    employee_id: int = Query(..., ge=1),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        items = AttendanceAdditionalOtService(db).list_for_employee(
            employee_id,
            current_user,
            _pd(date_from),
            _pd(date_to),
        )
        return {"items": items}
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.post("/additional-ot", response_model=Dict[str, Any])
def create_additional_ot(
    employee_id: int = Query(..., ge=1),
    body: Dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendanceAdditionalOtService(db).create(employee_id, current_user, body)
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.put("/additional-ot/{record_id}", response_model=Dict[str, Any])
def update_additional_ot(
    record_id: int,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendanceAdditionalOtService(db).update(record_id, current_user, body)
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.delete("/additional-ot/{record_id}")
def delete_additional_ot(
    record_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        AttendanceAdditionalOtService(db).delete(record_id, current_user)
        return {"ok": True}
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
