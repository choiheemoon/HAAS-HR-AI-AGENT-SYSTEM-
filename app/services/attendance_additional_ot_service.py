"""추가 OT(Regular OT asking) CRUD."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.attendance_additional_ot import AttendanceAdditionalOt
from app.models.employee import Employee
from app.services.attendance_period_lock_service import AttendancePeriodLockService
from app.services.master_data.master_data_service import MasterDataService
from app.services.system_rbac_service import SystemRbacService


def _pd(v: Optional[str]) -> Optional[date]:
    if v is None or str(v).strip() == "":
        return None
    s = str(v).strip()[:10]
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def _str(v: Any, max_len: int, default: Optional[str] = None) -> Optional[str]:
    if v is None:
        return default
    s = str(v).strip()
    if not s:
        return default
    return s[:max_len]


def _int(v: Any, default: int = 0) -> int:
    if v is None or v == "":
        return default
    try:
        return int(v)
    except Exception:
        return default


def _bool(v: Any, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    return s in ("1", "true", "yes", "y", "on")


def _parse_hhmm(s: str) -> Optional[tuple]:
    s = (s or "").strip()
    parts = s.split(":")
    if len(parts) != 2:
        return None
    try:
        h = int(parts[0])
        m = int(parts[1])
        if 0 <= h <= 47 and 0 <= m <= 59:
            return (h, m)
    except Exception:
        pass
    return None


def compute_total_minutes(ot_start: str, ot_end: str) -> int:
    a = _parse_hhmm(ot_start)
    b = _parse_hhmm(ot_end)
    if not a or not b:
        return 0
    t1 = a[0] * 60 + a[1]
    t2 = b[0] * 60 + b[1]
    if t2 >= t1:
        return t2 - t1
    return t2 + 24 * 60 - t1


def _fmt_hhmm_from_minutes(mins: int) -> str:
    m = max(0, int(mins))
    return f"{m // 60:02d}:{m % 60:02d}"


def _row_to_dict(r: AttendanceAdditionalOt) -> Dict[str, Any]:
    tm = r.total_minutes if r.total_minutes is not None else compute_total_minutes(r.ot_start or "", r.ot_end or "")
    return {
        "id": int(r.id),
        "employee_id": int(r.employee_id),
        "work_date": r.work_date.isoformat() if r.work_date else None,
        "ot_type": r.ot_type,
        "ot_start": r.ot_start,
        "ot_end": r.ot_end,
        "total_minutes": int(tm),
        "total_time_hhmm": _fmt_hhmm_from_minutes(int(tm)),
        "type_ot": r.type_ot,
        "job_title_code": int(r.job_title_code or 0),
        "ot_breaktime_type": int(r.ot_breaktime_type or 1),
        "block_payment": bool(r.block_payment),
        "approve_status": r.approve_status,
        "note": r.note,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


class AttendanceAdditionalOtService:
    def __init__(self, db: Session):
        self.db = db

    def _allowed_company_ids(self, user) -> List[int]:
        return SystemRbacService(self.db).get_user_company_ids(user.id, current_user=user)

    def _require_employee(self, employee_id: int, user) -> Employee:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        emp = MasterDataService(self.db).get_employee(employee_id)
        if not emp:
            raise ValueError("직원을 찾을 수 없습니다.")
        if emp.company_id is not None and emp.company_id not in allowed:
            raise ValueError("직원을 찾을 수 없습니다.")
        return emp

    def list_for_employee(
        self,
        employee_id: int,
        user,
        date_from: Optional[date],
        date_to: Optional[date],
    ) -> List[Dict[str, Any]]:
        self._require_employee(employee_id, user)
        q = self.db.query(AttendanceAdditionalOt).filter(AttendanceAdditionalOt.employee_id == employee_id)
        if date_from:
            q = q.filter(AttendanceAdditionalOt.work_date >= date_from)
        if date_to:
            q = q.filter(AttendanceAdditionalOt.work_date <= date_to)
        rows = q.order_by(AttendanceAdditionalOt.work_date.desc(), AttendanceAdditionalOt.id.desc()).all()
        return [_row_to_dict(r) for r in rows]

    def create(self, employee_id: int, user, body: Dict[str, Any]) -> Dict[str, Any]:
        emp = self._require_employee(employee_id, user)
        wd = _pd(body.get("work_date"))
        if not wd:
            raise ValueError("work_date(YYYY-MM-DD)가 필요합니다.")
        if emp.company_id is not None:
            AttendancePeriodLockService(self.db).assert_day_not_closed(int(emp.company_id), wd)
        ot_type = _str(body.get("ot_type"), 120) or "OT asking before starting work"
        ot_start = _str(body.get("ot_start"), 8) or "00:00"
        ot_end = _str(body.get("ot_end"), 8) or "00:00"
        if not _parse_hhmm(ot_start) or not _parse_hhmm(ot_end):
            raise ValueError("ot_start, ot_end는 HH:mm 형식이어야 합니다.")
        tm = compute_total_minutes(ot_start, ot_end)
        row = AttendanceAdditionalOt(
            employee_id=employee_id,
            work_date=wd,
            ot_type=ot_type,
            ot_start=ot_start,
            ot_end=ot_end,
            total_minutes=tm,
            type_ot=_str(body.get("type_ot"), 40) or "Pay",
            job_title_code=_int(body.get("job_title_code"), 0),
            ot_breaktime_type=_int(body.get("ot_breaktime_type"), 1),
            block_payment=_bool(body.get("block_payment"), False),
            approve_status=_str(body.get("approve_status"), 80) or "Approve",
            note=_str(body.get("note"), 4000, None),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return _row_to_dict(row)

    def update(self, record_id: int, user, body: Dict[str, Any]) -> Dict[str, Any]:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        row = self.db.query(AttendanceAdditionalOt).filter(AttendanceAdditionalOt.id == record_id).first()
        if not row:
            raise ValueError("레코드를 찾을 수 없습니다.")
        emp = MasterDataService(self.db).get_employee(row.employee_id)
        if not emp or (emp.company_id is not None and emp.company_id not in allowed):
            raise ValueError("레코드를 찾을 수 없습니다.")

        if "work_date" in body:
            wd = _pd(body.get("work_date"))
            if wd:
                row.work_date = wd
        if emp.company_id is not None and row.work_date is not None:
            AttendancePeriodLockService(self.db).assert_day_not_closed(int(emp.company_id), row.work_date)
        if "ot_type" in body and body.get("ot_type") is not None:
            row.ot_type = _str(body.get("ot_type"), 120) or row.ot_type
        if "ot_start" in body and body.get("ot_start") is not None:
            row.ot_start = _str(body.get("ot_start"), 8) or row.ot_start
        if "ot_end" in body and body.get("ot_end") is not None:
            row.ot_end = _str(body.get("ot_end"), 8) or row.ot_end
        if not _parse_hhmm(row.ot_start or "") or not _parse_hhmm(row.ot_end or ""):
            raise ValueError("ot_start, ot_end는 HH:mm 형식이어야 합니다.")
        row.total_minutes = compute_total_minutes(row.ot_start or "", row.ot_end or "")
        if "type_ot" in body and body.get("type_ot") is not None:
            row.type_ot = _str(body.get("type_ot"), 40) or row.type_ot
        if "job_title_code" in body:
            row.job_title_code = _int(body.get("job_title_code"), row.job_title_code or 0)
        if "ot_breaktime_type" in body:
            row.ot_breaktime_type = _int(body.get("ot_breaktime_type"), row.ot_breaktime_type or 1)
        if "block_payment" in body:
            row.block_payment = _bool(body.get("block_payment"), row.block_payment or False)
        if "approve_status" in body and body.get("approve_status") is not None:
            row.approve_status = _str(body.get("approve_status"), 80) or row.approve_status
        if "note" in body:
            row.note = _str(body.get("note"), 4000, "")

        row.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(row)
        return _row_to_dict(row)

    def delete(self, record_id: int, user) -> None:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        row = self.db.query(AttendanceAdditionalOt).filter(AttendanceAdditionalOt.id == record_id).first()
        if not row:
            raise ValueError("레코드를 찾을 수 없습니다.")
        emp = MasterDataService(self.db).get_employee(row.employee_id)
        if not emp or (emp.company_id is not None and emp.company_id not in allowed):
            raise ValueError("레코드를 찾을 수 없습니다.")
        if emp.company_id is not None and row.work_date is not None:
            AttendancePeriodLockService(self.db).assert_day_not_closed(int(emp.company_id), row.work_date)
        self.db.delete(row)
        self.db.commit()
