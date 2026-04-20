"""특별 OT CRUD."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.attendance_special_ot import AttendanceSpecialOt
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


def _parse_hhmm(s: str) -> Optional[tuple]:
    s = (s or "").strip()
    if not s:
        return None
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


def _norm_ot_field(raw: Optional[str]) -> str:
    s = _str(raw, 8, "") or ""
    if not s:
        return ""
    p = _parse_hhmm(s)
    if p is None:
        raise ValueError("OT 시간은 HH:mm 형식이어야 합니다.")
    return f"{p[0]:02d}:{p[1]:02d}"


def _row_to_dict(r: AttendanceSpecialOt, employee_number: Optional[str] = None) -> Dict[str, Any]:
    return {
        "id": int(r.id),
        "employee_id": int(r.employee_id),
        "employee_number": employee_number,
        "date_from": r.date_from.isoformat() if r.date_from else None,
        "date_to": r.date_to.isoformat() if r.date_to else None,
        "ot_1": r.ot_1 or "",
        "ot_1_5": r.ot_1_5 or "",
        "ot_2": r.ot_2 or "",
        "ot_2_5": r.ot_2_5 or "",
        "ot_3": r.ot_3 or "",
        "ot_6": r.ot_6 or "",
        "shift_slot": int(r.shift_slot or 1),
        "shift_text": r.shift_text or "",
        "food": r.food or "",
        "special": r.special or "",
        "note": r.note,
        "status": r.status or "Approve",
        "updated_by_username": r.updated_by_username,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


class AttendanceSpecialOtService:
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

    @staticmethod
    def _overlap_filter(q, date_from: Optional[date], date_to: Optional[date]):
        if date_from and date_to:
            return q.filter(
                and_(
                    AttendanceSpecialOt.date_to >= date_from,
                    AttendanceSpecialOt.date_from <= date_to,
                )
            )
        if date_from:
            return q.filter(AttendanceSpecialOt.date_to >= date_from)
        if date_to:
            return q.filter(AttendanceSpecialOt.date_from <= date_to)
        return q

    def list_for_employee(
        self,
        employee_id: int,
        user,
        date_from: Optional[date],
        date_to: Optional[date],
    ) -> List[Dict[str, Any]]:
        emp = self._require_employee(employee_id, user)
        en = getattr(emp, "employee_number", None)
        en_s = str(en) if en is not None else None
        q = self.db.query(AttendanceSpecialOt).filter(AttendanceSpecialOt.employee_id == employee_id)
        q = self._overlap_filter(q, date_from, date_to)
        rows = q.order_by(AttendanceSpecialOt.date_from.desc(), AttendanceSpecialOt.id.desc()).all()
        return [_row_to_dict(r, en_s) for r in rows]

    def create(self, employee_id: int, user, body: Dict[str, Any]) -> Dict[str, Any]:
        emp = self._require_employee(employee_id, user)
        df = _pd(body.get("date_from"))
        dt = _pd(body.get("date_to"))
        if not df or not dt:
            raise ValueError("date_from, date_to(YYYY-MM-DD)가 필요합니다.")
        if dt < df:
            raise ValueError("date_to는 date_from 이상이어야 합니다.")
        if emp.company_id is not None:
            AttendancePeriodLockService(self.db).assert_range_not_closed(int(emp.company_id), df, dt)
        slot = _int(body.get("shift_slot"), 1)
        if slot not in (1, 2):
            raise ValueError("shift_slot은 1 또는 2여야 합니다.")
        uname = getattr(user, "username", None) or getattr(user, "email", None) or ""
        row = AttendanceSpecialOt(
            employee_id=employee_id,
            date_from=df,
            date_to=dt,
            ot_1=_norm_ot_field(body.get("ot_1")),
            ot_1_5=_norm_ot_field(body.get("ot_1_5")),
            ot_2=_norm_ot_field(body.get("ot_2")),
            ot_2_5=_norm_ot_field(body.get("ot_2_5")),
            ot_3=_norm_ot_field(body.get("ot_3")),
            ot_6=_norm_ot_field(body.get("ot_6")),
            shift_slot=slot,
            shift_text=_str(body.get("shift_text"), 120) or "",
            food=_str(body.get("food"), 120) or "",
            special=_str(body.get("special"), 120) or "",
            note=_str(body.get("note"), 4000, None),
            status=_str(body.get("status"), 80) or "Approve",
            updated_by_user_id=int(user.id) if getattr(user, "id", None) else None,
            updated_by_username=_str(uname, 200) or None,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return _row_to_dict(row, str(emp.employee_number) if getattr(emp, "employee_number", None) is not None else None)

    def update(self, record_id: int, user, body: Dict[str, Any]) -> Dict[str, Any]:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        row = self.db.query(AttendanceSpecialOt).filter(AttendanceSpecialOt.id == record_id).first()
        if not row:
            raise ValueError("레코드를 찾을 수 없습니다.")
        emp = MasterDataService(self.db).get_employee(row.employee_id)
        if not emp or (emp.company_id is not None and emp.company_id not in allowed):
            raise ValueError("레코드를 찾을 수 없습니다.")

        if "date_from" in body:
            df = _pd(body.get("date_from"))
            if df:
                row.date_from = df
        if "date_to" in body:
            dt = _pd(body.get("date_to"))
            if dt:
                row.date_to = dt
        if row.date_to < row.date_from:
            raise ValueError("date_to는 date_from 이상이어야 합니다.")
        if emp.company_id is not None:
            AttendancePeriodLockService(self.db).assert_range_not_closed(
                int(emp.company_id), row.date_from, row.date_to
            )

        for key in ("ot_1", "ot_1_5", "ot_2", "ot_2_5", "ot_3", "ot_6"):
            if key in body:
                setattr(row, key, _norm_ot_field(body.get(key)))
        if "shift_slot" in body:
            slot = _int(body.get("shift_slot"), row.shift_slot or 1)
            if slot not in (1, 2):
                raise ValueError("shift_slot은 1 또는 2여야 합니다.")
            row.shift_slot = slot
        if "shift_text" in body:
            row.shift_text = _str(body.get("shift_text"), 120) or ""
        if "food" in body:
            row.food = _str(body.get("food"), 120) or ""
        if "special" in body:
            row.special = _str(body.get("special"), 120) or ""
        if "note" in body:
            row.note = _str(body.get("note"), 4000, "")
        if "status" in body and body.get("status") is not None:
            row.status = _str(body.get("status"), 80) or row.status

        uname = getattr(user, "username", None) or getattr(user, "email", None) or ""
        row.updated_by_user_id = int(user.id) if getattr(user, "id", None) else None
        row.updated_by_username = _str(uname, 200) or None
        row.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(row)
        return _row_to_dict(row, str(emp.employee_number) if getattr(emp, "employee_number", None) is not None else None)

    def delete(self, record_id: int, user) -> None:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        row = self.db.query(AttendanceSpecialOt).filter(AttendanceSpecialOt.id == record_id).first()
        if not row:
            raise ValueError("레코드를 찾을 수 없습니다.")
        emp = MasterDataService(self.db).get_employee(row.employee_id)
        if not emp or (emp.company_id is not None and emp.company_id not in allowed):
            raise ValueError("레코드를 찾을 수 없습니다.")
        if emp.company_id is not None:
            AttendancePeriodLockService(self.db).assert_range_not_closed(
                int(emp.company_id), row.date_from, row.date_to
            )
        self.db.delete(row)
        self.db.commit()
