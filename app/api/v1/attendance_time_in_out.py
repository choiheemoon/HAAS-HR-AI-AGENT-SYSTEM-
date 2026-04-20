"""근태 조회(타각) API."""
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.services.attendance_time_in_out_service import AttendanceTimeInOutService

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


@router.get("/time-in-out", response_model=Dict[str, List[Dict[str, Any]]])
def list_time_in_out(
    employee_id: int = Query(..., ge=1),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        items = AttendanceTimeInOutService(db).list_for_employee(
            employee_id,
            current_user,
            _pd(date_from),
            _pd(date_to),
        )
        return {"items": items}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/time-in-out/all", response_model=Dict[str, List[Dict[str, Any]]])
def list_time_in_out_all(
    company_id: Optional[int] = Query(None, ge=1),
    status: str = Query("active"),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(5000, ge=1, le=20000),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    items = AttendanceTimeInOutService(db).list_all_for_period(
        user=current_user,
        company_id=company_id,
        status=status,
        search=search,
        date_from=_pd(date_from),
        date_to=_pd(date_to),
        limit=limit,
    )
    return {"items": items}


@router.post("/time-in-out", response_model=Dict[str, Any])
def create_time_in_out(
    employee_id: int = Query(..., ge=1),
    body: Dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendanceTimeInOutService(db).create(employee_id, current_user, body)
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.put("/time-in-out/{record_id}", response_model=Dict[str, Any])
def update_time_in_out(
    record_id: int,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        return AttendanceTimeInOutService(db).update(record_id, current_user, body)
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg or "접근" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.delete("/time-in-out/{record_id}")
def delete_time_in_out(
    record_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        AttendanceTimeInOutService(db).soft_delete(record_id, current_user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True, "id_time_in_out": record_id}
