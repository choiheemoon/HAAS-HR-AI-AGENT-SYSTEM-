"""직원 근태 마스터 조회·저장·삭제."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_attendance_master import (
    EmployeeAttendanceLeaveBalance,
    EmployeeAttendanceMaster,
    EmployeeAttendanceMasterBasic,
    EmployeeAttendanceMasterOt,
    EmployeeAttendanceShiftSetting,
    EmployeeAttendanceSpecialCharge,
)
from app.models.attendance_standard import AttendanceShift, AttendanceShiftGroupMaster
from app.models.user import User
from app.services.master_data.master_data_service import MasterDataService
from app.services.system_rbac_service import SystemRbacService


def _d(v: Optional[date]) -> Optional[str]:
    return v.isoformat() if v else None


def _pd(v: Any) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, date):
        return v
    s = str(v).strip()[:10]
    if not s:
        return None
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def _dec(v: Any) -> Optional[Decimal]:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except Exception:
        return None


def _int(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except Exception:
        return None


def _bool(v: Any, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    return s in ("1", "true", "yes", "y", "on")


def _str(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


class EmployeeAttendanceMasterService:
    def __init__(self, db: Session):
        self.db = db

    def _allowed_company_ids(self, user: User) -> List[int]:
        return SystemRbacService(self.db).get_user_company_ids(user.id, current_user=user)

    def _require_employee(self, employee_id: int, user: User) -> Employee:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        emp = MasterDataService(self.db).get_employee(employee_id)
        if not emp:
            raise ValueError("직원을 찾을 수 없습니다.")
        if emp.company_id is not None and emp.company_id not in allowed:
            raise ValueError("직원을 찾을 수 없습니다.")
        return emp

    def _serialize_employee_header(self, emp: Employee) -> Dict[str, Any]:
        return {
            "id": emp.id,
            "company_id": emp.company_id,
            "employee_number": emp.employee_number,
            "name": emp.name,
            "name_en": emp.name_en,
            "division": emp.division,
            "department": emp.department,
            "job_level": emp.job_level,
            "work_place": emp.work_place,
            "area": emp.area,
            "work_status": emp.work_status,
            "employment_type": emp.employment_type,
            "salary_process_type": emp.salary_process_type,
            "position": emp.position,
            "hire_date": _d(emp.hire_date),
            "photo_path": emp.photo_path,
            "swipe_card": emp.swipe_card,
        }

    def _default_bundle_dict(self, emp: Employee) -> Dict[str, Any]:
        y = date.today().year
        return {
            "exists": False,
            "master_id": None,
            "employee": self._serialize_employee_header(emp),
            "contract_start_date": None,
            "contract_end_date": None,
            "card_code_extra": None,
            "basic": {
                "employment_starting_date": None,
                "end_probation_date": None,
                "probation_days": None,
                "days_experience_text": None,
                "annual_holiday_form": None,
                "master_shiftwork_id": None,
                "master_shiftwork": None,
                "check_in_zip_card": False,
                "check_out_zip_card": False,
                "received_food_allow": False,
                "not_charge_early": False,
                "not_rounding_early": False,
                "received_shift_payment": False,
                "not_charge_lateness": False,
                "not_rounding_lateness": False,
                "day_and_ot_zero": False,
                "deduct_baht_per_minute": None,
                "deduct_early_checkout_baht": None,
                "charge_type": None,
            },
            "ot": {
                "not_cut_ot": False,
                "not_charge_ot_send_payroll": False,
                "ot_pay_each_hour_ot6": False,
                "chang_all_ot6": False,
                "auto_ot_on_holiday": False,
                "auto_ot_exclude_holidays": False,
                "ot6_hourly_baht": None,
                "ui_lunchtime_by_emp_baht": None,
            },
            "special_charges": [
                {"slot_index": 1, "label": "", "amount_baht": 0},
                {"slot_index": 2, "label": "", "amount_baht": 0},
                {"slot_index": 3, "label": "", "amount_baht": 0},
            ],
            "shift": {
                "schedule_mode": "week",
                "days": [
                    {"key": "sun", "enabled": False, "shift_id": None, "shift_value": ""},
                    {"key": "mon", "enabled": True, "shift_id": None, "shift_value": ""},
                    {"key": "tue", "enabled": True, "shift_id": None, "shift_value": ""},
                    {"key": "wed", "enabled": True, "shift_id": None, "shift_value": ""},
                    {"key": "thu", "enabled": True, "shift_id": None, "shift_value": ""},
                    {"key": "fri", "enabled": True, "shift_id": None, "shift_value": ""},
                    {"key": "sat", "enabled": False, "shift_id": None, "shift_value": ""},
                ],
            },
            "leave": {
                "leave_year": y,
                "prev_days": None,
                "prev_hours": None,
                "prev_minutes": None,
                "transferred_days": None,
                "transferred_hours": None,
                "transferred_minutes": None,
                "used_days": None,
                "used_hours": None,
                "used_minutes": None,
                "year_days": None,
                "year_hours": None,
                "year_minutes": None,
                "level_of_leave": None,
                "compensate_accumulated": None,
            },
        }

    def _row_to_bundle(self, m: EmployeeAttendanceMaster, emp: Employee) -> Dict[str, Any]:
        out = self._default_bundle_dict(emp)
        out["exists"] = True
        out["master_id"] = m.id
        out["contract_start_date"] = _d(m.contract_start_date)
        out["contract_end_date"] = _d(m.contract_end_date)
        out["card_code_extra"] = m.card_code_extra

        b = m.basic
        if b:
            shift_group_id = b.master_shiftwork_id
            if (not shift_group_id) and b.master_shiftwork and emp.company_id is not None:
                g = (
                    self.db.query(AttendanceShiftGroupMaster)
                    .filter(
                        AttendanceShiftGroupMaster.company_id == emp.company_id,
                        AttendanceShiftGroupMaster.name == b.master_shiftwork,
                    )
                    .first()
                )
                shift_group_id = int(g.id) if g else None
            out["basic"] = {
                "employment_starting_date": _d(b.employment_starting_date),
                "end_probation_date": _d(b.end_probation_date),
                "probation_days": b.probation_days,
                "days_experience_text": b.days_experience_text,
                "annual_holiday_form": b.annual_holiday_form,
                "master_shiftwork_id": shift_group_id,
                "master_shiftwork": b.master_shiftwork,
                "check_in_zip_card": bool(b.check_in_zip_card),
                "check_out_zip_card": bool(b.check_out_zip_card),
                "received_food_allow": bool(b.received_food_allow),
                "not_charge_early": bool(b.not_charge_early),
                "not_rounding_early": bool(b.not_rounding_early),
                "received_shift_payment": bool(b.received_shift_payment),
                "not_charge_lateness": bool(b.not_charge_lateness),
                "not_rounding_lateness": bool(b.not_rounding_lateness),
                "day_and_ot_zero": bool(b.day_and_ot_zero),
                "deduct_baht_per_minute": float(b.deduct_baht_per_minute) if b.deduct_baht_per_minute is not None else None,
                "deduct_early_checkout_baht": float(b.deduct_early_checkout_baht) if b.deduct_early_checkout_baht is not None else None,
                "charge_type": b.charge_type,
            }

        o = m.ot
        if o:
            out["ot"] = {
                "not_cut_ot": bool(o.not_cut_ot),
                "not_charge_ot_send_payroll": bool(o.not_charge_ot_send_payroll),
                "ot_pay_each_hour_ot6": bool(o.ot_pay_each_hour_ot6),
                "chang_all_ot6": bool(o.chang_all_ot6),
                "auto_ot_on_holiday": bool(o.auto_ot_on_holiday),
                "auto_ot_exclude_holidays": bool(o.auto_ot_exclude_holidays),
                "ot6_hourly_baht": float(o.ot6_hourly_baht) if o.ot6_hourly_baht is not None else None,
                "ui_lunchtime_by_emp_baht": float(o.ui_lunchtime_by_emp_baht) if o.ui_lunchtime_by_emp_baht is not None else None,
            }

        slots = {r.slot_index: r for r in (m.special_charges or [])}
        sc_list: List[Dict[str, Any]] = []
        for i in range(1, 4):
            r = slots.get(i)
            sc_list.append(
                {
                    "slot_index": i,
                    "label": r.label if r else "",
                    "amount_baht": float(r.amount_baht) if r and r.amount_baht is not None else 0,
                }
            )
        for idx in sorted(k for k in slots.keys() if k > 3):
            r = slots[idx]
            sc_list.append(
                {
                    "slot_index": idx,
                    "label": r.label or "",
                    "amount_baht": float(r.amount_baht) if r.amount_baht is not None else 0,
                }
            )
        out["special_charges"] = sc_list

        sh = m.shift_setting
        if sh:
            day_map = [
                ("sun", sh.sun_enabled, sh.sun_shift_id, sh.sun_shift_value),
                ("mon", sh.mon_enabled, sh.mon_shift_id, sh.mon_shift_value),
                ("tue", sh.tue_enabled, sh.tue_shift_id, sh.tue_shift_value),
                ("wed", sh.wed_enabled, sh.wed_shift_id, sh.wed_shift_value),
                ("thu", sh.thu_enabled, sh.thu_shift_id, sh.thu_shift_value),
                ("fri", sh.fri_enabled, sh.fri_shift_id, sh.fri_shift_value),
                ("sat", sh.sat_enabled, sh.sat_shift_id, sh.sat_shift_value),
            ]
            out["shift"] = {
                "schedule_mode": sh.schedule_mode or "week",
                "days": [
                    {
                        "key": k,
                        "enabled": bool(en),
                        "shift_id": int(sid) if sid is not None else None,
                        "shift_value": (v or ""),
                    }
                    for k, en, sid, v in day_map
                ],
            }

        lb = m.leave_balance
        if lb:
            out["leave"] = {
                "leave_year": lb.leave_year,
                "prev_days": lb.prev_days,
                "prev_hours": lb.prev_hours,
                "prev_minutes": lb.prev_minutes,
                "transferred_days": lb.transferred_days,
                "transferred_hours": lb.transferred_hours,
                "transferred_minutes": lb.transferred_minutes,
                "used_days": lb.used_days,
                "used_hours": lb.used_hours,
                "used_minutes": lb.used_minutes,
                "year_days": lb.year_days,
                "year_hours": lb.year_hours,
                "year_minutes": lb.year_minutes,
                "level_of_leave": lb.level_of_leave,
                "compensate_accumulated": lb.compensate_accumulated,
            }

        return out

    def get_bundle(self, employee_id: int, user: User) -> Dict[str, Any]:
        emp = self._require_employee(employee_id, user)
        m = (
            self.db.query(EmployeeAttendanceMaster)
            .filter(EmployeeAttendanceMaster.employee_id == employee_id)
            .first()
        )
        if not m:
            return self._default_bundle_dict(emp)
        return self._row_to_bundle(m, emp)

    def _apply_shift_days(self, sh: EmployeeAttendanceShiftSetting, shift_payload: Dict[str, Any], emp: Employee) -> None:
        days = shift_payload.get("days") or []
        by_key = {str(d.get("key", "")).lower(): d for d in days if isinstance(d, dict)}
        mapping = [
            ("sun", "sun_enabled", "sun_shift_id", "sun_shift_value"),
            ("mon", "mon_enabled", "mon_shift_id", "mon_shift_value"),
            ("tue", "tue_enabled", "tue_shift_id", "tue_shift_value"),
            ("wed", "wed_enabled", "wed_shift_id", "wed_shift_value"),
            ("thu", "thu_enabled", "thu_shift_id", "thu_shift_value"),
            ("fri", "fri_enabled", "fri_shift_id", "fri_shift_value"),
            ("sat", "sat_enabled", "sat_shift_id", "sat_shift_value"),
        ]
        for key, en_col, id_col, val_col in mapping:
            d = by_key.get(key, {})
            setattr(sh, en_col, _bool(d.get("enabled"), key in ("mon", "tue", "wed", "thu", "fri")))
            req_shift_id = _int(d.get("shift_id"))
            if req_shift_id is None:
                # backward compatibility: old clients may still send shift_code in shift_value
                sv = _str(d.get("shift_value"))
                if sv and emp.company_id is not None:
                    matched = (
                        self.db.query(AttendanceShift)
                        .filter(AttendanceShift.company_id == emp.company_id, AttendanceShift.shift_code == sv)
                        .first()
                    )
                    req_shift_id = int(matched.id) if matched else None
            valid_shift = None
            if req_shift_id and emp.company_id is not None:
                valid_shift = (
                    self.db.query(AttendanceShift)
                    .filter(AttendanceShift.company_id == emp.company_id, AttendanceShift.id == req_shift_id)
                    .first()
                )
            setattr(sh, id_col, int(valid_shift.id) if valid_shift else None)
            setattr(sh, val_col, valid_shift.shift_code if valid_shift else None)

    def save_bundle(self, employee_id: int, user: User, body: Dict[str, Any]) -> Dict[str, Any]:
        emp = self._require_employee(employee_id, user)
        m = (
            self.db.query(EmployeeAttendanceMaster)
            .filter(EmployeeAttendanceMaster.employee_id == employee_id)
            .first()
        )
        now = datetime.utcnow()
        if not m:
            m = EmployeeAttendanceMaster(
                employee_id=employee_id,
                company_id=emp.company_id,
            )
            self.db.add(m)
            self.db.flush()

        m.company_id = emp.company_id
        m.contract_start_date = _pd(body.get("contract_start_date"))
        m.contract_end_date = _pd(body.get("contract_end_date"))
        if "card_code_extra" in body:
            m.card_code_extra = _str(body.get("card_code_extra"))
        m.updated_at = now

        basic_in = body.get("basic") or {}
        b = m.basic
        if not b:
            b = EmployeeAttendanceMasterBasic(master_id=m.id)
            self.db.add(b)
            m.basic = b
        b.employment_starting_date = _pd(basic_in.get("employment_starting_date"))
        b.end_probation_date = _pd(basic_in.get("end_probation_date"))
        b.probation_days = _int(basic_in.get("probation_days"))
        b.days_experience_text = _str(basic_in.get("days_experience_text"))
        b.annual_holiday_form = _str(basic_in.get("annual_holiday_form"))
        shift_group_id = _int(basic_in.get("master_shiftwork_id"))
        if not shift_group_id:
            shift_group_id = _int(basic_in.get("master_shiftwork"))
        if shift_group_id:
            valid_group = (
                self.db.query(AttendanceShiftGroupMaster)
                .filter(
                    AttendanceShiftGroupMaster.company_id == emp.company_id,
                    AttendanceShiftGroupMaster.id == shift_group_id,
                )
                .first()
            )
            b.master_shiftwork_id = int(valid_group.id) if valid_group else None
            b.master_shiftwork = valid_group.name if valid_group else None
        else:
            b.master_shiftwork_id = None
            b.master_shiftwork = None
        b.check_in_zip_card = _bool(basic_in.get("check_in_zip_card"))
        b.check_out_zip_card = _bool(basic_in.get("check_out_zip_card"))
        b.received_food_allow = _bool(basic_in.get("received_food_allow"))
        b.not_charge_early = _bool(basic_in.get("not_charge_early"))
        b.not_rounding_early = _bool(basic_in.get("not_rounding_early"))
        b.received_shift_payment = _bool(basic_in.get("received_shift_payment"))
        b.not_charge_lateness = _bool(basic_in.get("not_charge_lateness"))
        b.not_rounding_lateness = _bool(basic_in.get("not_rounding_lateness"))
        b.day_and_ot_zero = _bool(basic_in.get("day_and_ot_zero"))
        b.deduct_baht_per_minute = _dec(basic_in.get("deduct_baht_per_minute"))
        b.deduct_early_checkout_baht = _dec(basic_in.get("deduct_early_checkout_baht"))
        b.charge_type = _str(basic_in.get("charge_type"))
        b.updated_at = now

        ot_in = body.get("ot") or {}
        o = m.ot
        if not o:
            o = EmployeeAttendanceMasterOt(master_id=m.id)
            self.db.add(o)
            m.ot = o
        o.not_cut_ot = _bool(ot_in.get("not_cut_ot"))
        o.not_charge_ot_send_payroll = _bool(ot_in.get("not_charge_ot_send_payroll"))
        o.ot_pay_each_hour_ot6 = _bool(ot_in.get("ot_pay_each_hour_ot6"))
        o.chang_all_ot6 = _bool(ot_in.get("chang_all_ot6"))
        o.auto_ot_on_holiday = _bool(ot_in.get("auto_ot_on_holiday"))
        o.auto_ot_exclude_holidays = _bool(ot_in.get("auto_ot_exclude_holidays"))
        o.ot6_hourly_baht = _dec(ot_in.get("ot6_hourly_baht"))
        o.ui_lunchtime_by_emp_baht = _dec(ot_in.get("ui_lunchtime_by_emp_baht"))
        o.updated_at = now

        self.db.query(EmployeeAttendanceSpecialCharge).filter(
            EmployeeAttendanceSpecialCharge.master_id == m.id
        ).delete(synchronize_session=False)
        for row in body.get("special_charges") or []:
            if not isinstance(row, dict):
                continue
            si = _int(row.get("slot_index"))
            if si is None or si < 1 or si > 10:
                continue
            self.db.add(
                EmployeeAttendanceSpecialCharge(
                    master_id=m.id,
                    slot_index=si,
                    label=str(row.get("label") or "")[:200],
                    amount_baht=_dec(row.get("amount_baht")) or Decimal("0"),
                )
            )

        shift_in = body.get("shift") or {}
        sh = m.shift_setting
        if not sh:
            sh = EmployeeAttendanceShiftSetting(master_id=m.id)
            self.db.add(sh)
            m.shift_setting = sh
        mode = _str(shift_in.get("schedule_mode")) or "week"
        sh.schedule_mode = mode if mode in ("week", "auto") else "week"
        self._apply_shift_days(sh, shift_in, emp)
        sh.updated_at = now

        leave_in = body.get("leave") or {}
        lb = m.leave_balance
        if not lb:
            lb = EmployeeAttendanceLeaveBalance(master_id=m.id)
            self.db.add(lb)
            m.leave_balance = lb
        ly = _int(leave_in.get("leave_year"))
        lb.leave_year = ly if ly is not None else date.today().year
        lb.prev_days = _int(leave_in.get("prev_days"))
        lb.prev_hours = _int(leave_in.get("prev_hours"))
        lb.prev_minutes = _int(leave_in.get("prev_minutes"))
        lb.transferred_days = _int(leave_in.get("transferred_days"))
        lb.transferred_hours = _int(leave_in.get("transferred_hours"))
        lb.transferred_minutes = _int(leave_in.get("transferred_minutes"))
        lb.used_days = _int(leave_in.get("used_days"))
        lb.used_hours = _int(leave_in.get("used_hours"))
        lb.used_minutes = _int(leave_in.get("used_minutes"))
        lb.year_days = _int(leave_in.get("year_days"))
        lb.year_hours = _int(leave_in.get("year_hours"))
        lb.year_minutes = _int(leave_in.get("year_minutes"))
        lb.level_of_leave = _str(leave_in.get("level_of_leave"))
        ca = leave_in.get("compensate_accumulated")
        lb.compensate_accumulated = _str(ca) if ca is not None else None
        lb.updated_at = now

        self.db.commit()
        self.db.refresh(m)
        emp2 = MasterDataService(self.db).get_employee(employee_id) or emp
        return self._row_to_bundle(m, emp2)

    def delete_bundle(self, employee_id: int, user: User) -> None:
        self._require_employee(employee_id, user)
        m = (
            self.db.query(EmployeeAttendanceMaster)
            .filter(EmployeeAttendanceMaster.employee_id == employee_id)
            .first()
        )
        if m:
            self.db.delete(m)
            self.db.commit()
