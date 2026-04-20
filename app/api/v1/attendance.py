"""근태관리 API"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, Dict, List, Any
from datetime import date
import json
from app.database import get_db
from app.services.attendance import AttendanceService
from pydantic import BaseModel
from app.api.v1.auth import get_current_user
from app.models.attendance import Leave
from app.models.employee import Employee
from app.services.system_rbac_service import SystemRbacService
from app.services.attendance_period_lock_service import AttendancePeriodLockService

router = APIRouter()


class CheckInRequest(BaseModel):
    record_method: str = "mobile"
    location: Optional[Dict[str, float]] = None
    ip_address: Optional[str] = None


class LeaveRequest(BaseModel):
    leave_type: str
    start_date: date
    end_date: date
    reason: Optional[str] = None


class LeaveWriteRequest(BaseModel):
    employee_id: int
    purpose_of_leave: Optional[str] = None
    leave_type: Optional[str] = None
    from_date: date
    to_date: date
    total_days: Optional[float] = None
    with_pay: Optional[bool] = True
    approve_status: Optional[str] = "approved"
    leave_reason: Optional[str] = None
    memo: Optional[str] = None
    no_document: Optional[str] = None
    date_of_leave_record: Optional[str] = None
    doctor_guarantee: Optional[bool] = False
    start_hh: Optional[str] = None
    start_mm: Optional[str] = None
    end_hh: Optional[str] = None
    end_mm: Optional[str] = None


def _ensure_employee_access(db: Session, employee_id: int, current_user) -> Employee:
    allowed = SystemRbacService(db).get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    if emp.company_id is not None and int(emp.company_id) not in allowed:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    return emp


def _derive_leave_type(payload: LeaveWriteRequest) -> str:
    if payload.with_pay is False:
        return "unpaid"
    p = str(payload.purpose_of_leave or "").strip().lower()
    if "annual" in p:
        return "annual"
    if "sick" in p:
        return "sick"
    if "personal" in p:
        return "personal"
    if "maternity" in p:
        return "maternity"
    if "paternity" in p:
        return "paternity"
    return "other"


def _derive_status(raw: Optional[str]) -> str:
    s = str(raw or "approved").strip().lower()
    if s in ("reject", "rejected"):
        return "rejected"
    if s in ("cancel", "cancelled", "canceled"):
        return "cancelled"
    if s in ("pending",):
        return "pending"
    return "approved"


def _inclusive_days(a: date, b: date) -> float:
    d = (b - a).days
    return float(d + 1) if d >= 0 else 0.0


def _pack_reason(payload: LeaveWriteRequest) -> str:
    doc = {
        "purpose_of_leave": payload.purpose_of_leave or "",
        "leave_type_ui": payload.leave_type or "",
        "leave_reason": payload.leave_reason or "",
        "memo": payload.memo or "",
        "no_document": payload.no_document or "",
        "date_of_leave_record": payload.date_of_leave_record or "",
        "doctor_guarantee": bool(payload.doctor_guarantee),
        "with_pay": bool(payload.with_pay if payload.with_pay is not None else True),
        "approve_status": payload.approve_status or "approved",
        "start_hh": payload.start_hh or "",
        "start_mm": payload.start_mm or "",
        "end_hh": payload.end_hh or "",
        "end_mm": payload.end_mm or "",
    }
    return json.dumps(doc, ensure_ascii=False)


def _unpack_reason(reason: Optional[str]) -> Dict[str, Any]:
    s = str(reason or "").strip()
    if not s:
        return {}
    try:
        x = json.loads(s)
        if isinstance(x, dict):
            return x
    except Exception:
        pass
    return {"leave_reason": s}


@router.post("/check-in/{employee_id}")
def check_in(
    employee_id: int,
    request: CheckInRequest,
    db: Session = Depends(get_db)
):
    """출근 기록"""
    service = AttendanceService(db)
    attendance = service.record_check_in(
        employee_id,
        request.record_method,
        request.location,
        request.ip_address
    )
    return {"id": attendance.id, "check_in_time": attendance.check_in_time}


@router.post("/check-out/{employee_id}")
def check_out(
    employee_id: int,
    request: CheckInRequest,
    db: Session = Depends(get_db)
):
    """퇴근 기록"""
    service = AttendanceService(db)
    attendance = service.record_check_out(
        employee_id,
        request.record_method,
        request.location,
        request.ip_address
    )
    return {"id": attendance.id, "check_out_time": attendance.check_out_time}


@router.post("/leaves")
def apply_leave(
    leave_data: LeaveWriteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """휴가 신청"""
    emp = _ensure_employee_access(db, leave_data.employee_id, current_user)
    if emp.company_id is not None:
        AttendancePeriodLockService(db).assert_range_not_closed(
            int(emp.company_id), leave_data.from_date, leave_data.to_date
        )
    service = AttendanceService(db)
    payload = {
        "leave_type": _derive_leave_type(leave_data),
        "start_date": leave_data.from_date,
        "end_date": leave_data.to_date,
        "reason": _pack_reason(leave_data),
    }
    leave = service.apply_leave(leave_data.employee_id, payload)
    if leave_data.total_days is not None:
        leave.days = float(leave_data.total_days)
        leave.status = _derive_status(leave_data.approve_status)
        db.commit()
        db.refresh(leave)
    return {"id": leave.id, "status": leave.status}


@router.post("/leaves/{leave_id}/approve")
def approve_leave(
    leave_id: int,
    approver_id: int,
    notes: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """휴가 승인"""
    service = AttendanceService(db)
    leave = service.approve_leave(leave_id, approver_id, notes)
    return {"id": leave.id, "status": leave.status}


@router.get("/summary/{employee_id}")
def get_attendance_summary(
    employee_id: int,
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db)
):
    """근태 요약 조회"""
    service = AttendanceService(db)
    summary = service.get_attendance_summary(employee_id, start_date, end_date)
    return summary


@router.get("/leaves", response_model=List[Dict[str, Any]])
def list_leaves(
    employee_id: int = Query(..., ge=1),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_employee_access(db, employee_id, current_user)

    q = db.query(Leave).filter(Leave.employee_id == employee_id)
    if date_from:
        q = q.filter(Leave.end_date >= date_from)
    if date_to:
        q = q.filter(Leave.start_date <= date_to)
    rows = q.order_by(Leave.start_date.desc(), Leave.id.desc()).all()
    out: List[Dict[str, Any]] = []
    for lv in rows:
        meta = _unpack_reason(lv.reason)
        with_pay = bool(meta.get("with_pay", not ("unpaid" in str(lv.leave_type or "").lower())))
        out.append(
            {
                "id": int(lv.id),
                "employee_id": int(lv.employee_id),
                "leave_type": lv.leave_type,
                "start_date": lv.start_date.isoformat() if lv.start_date else None,
                "end_date": lv.end_date.isoformat() if lv.end_date else None,
                "days": float(lv.days or 0),
                "status": lv.status,
                "reason": lv.reason,
                "purpose_of_leave": meta.get("purpose_of_leave") or (lv.leave_type or "other"),
                "leave_type_ui": meta.get("leave_type_ui") or "Full-day leave",
                "with_pay": with_pay,
                "approve_status": meta.get("approve_status") or lv.status or "approved",
                "leave_reason": meta.get("leave_reason") or "",
                "memo": meta.get("memo") or "",
                "no_document": meta.get("no_document") or "",
                "date_of_leave_record": meta.get("date_of_leave_record") or (lv.start_date.isoformat() if lv.start_date else None),
                "doctor_guarantee": bool(meta.get("doctor_guarantee", False)),
                "start_hh": meta.get("start_hh") or "",
                "start_mm": meta.get("start_mm") or "",
                "end_hh": meta.get("end_hh") or "",
                "end_mm": meta.get("end_mm") or "",
                "approver_id": lv.approver_id,
                "approved_at": lv.approved_at.isoformat() if lv.approved_at else None,
            }
        )
    return out


@router.put("/leaves/{leave_id}", response_model=Dict[str, Any])
def update_leave(
    leave_id: int,
    payload: LeaveWriteRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    emp = _ensure_employee_access(db, payload.employee_id, current_user)
    lv = db.query(Leave).filter(Leave.id == leave_id, Leave.employee_id == payload.employee_id).first()
    if not lv:
        raise HTTPException(status_code=404, detail="휴가 기록을 찾을 수 없습니다.")
    if emp.company_id is not None:
        AttendancePeriodLockService(db).assert_range_not_closed(
            int(emp.company_id), payload.from_date, payload.to_date
        )
    lv.leave_type = _derive_leave_type(payload)
    lv.start_date = payload.from_date
    lv.end_date = payload.to_date
    lv.days = float(payload.total_days) if payload.total_days is not None else _inclusive_days(payload.from_date, payload.to_date)
    lv.status = _derive_status(payload.approve_status)
    lv.reason = _pack_reason(payload)
    db.commit()
    db.refresh(lv)
    return {"id": int(lv.id), "status": lv.status}


@router.delete("/leaves/{leave_id}", response_model=Dict[str, Any])
def delete_leave(
    leave_id: int,
    employee_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    emp = _ensure_employee_access(db, employee_id, current_user)
    lv = db.query(Leave).filter(Leave.id == leave_id, Leave.employee_id == employee_id).first()
    if not lv:
        raise HTTPException(status_code=404, detail="휴가 기록을 찾을 수 없습니다.")
    if emp.company_id is not None:
        AttendancePeriodLockService(db).assert_range_not_closed(
            int(emp.company_id), lv.start_date, lv.end_date
        )
    db.delete(lv)
    db.commit()
    return {"ok": True, "id": leave_id}
