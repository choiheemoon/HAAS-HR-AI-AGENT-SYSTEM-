"""급여근태기간 기준 근태·OT·수당 월(기간) 집계.

`attendance_payment_period`의 일자(시급/월급·OT) 범위로 `attendance_time_day`를 합산한다.
Regular OT asking(`attendance_additional_ot`)는 근태/OT/수당관리 조회와 동일 규칙으로 oth1·oth2에 가산한다.
(자동OT생성이 켜진 직원만 가산. 휴일제외가 함께 켜진 경우 `day_off` 일자는 추가 OT 가산 제외.)
OT 분(oth1~6)·OT금액(othb)·현지 OT급여(overtime_pay_local)는 일자별로 평일/휴일로 나누어 합산한다
(법정휴일·일요·근무달력 휴무 `day_off`는 휴일 구간, 그 외는 평일).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple

from sqlalchemy import func, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.attendance_additional_ot import AttendanceAdditionalOt
from app.models.attendance_payroll_bucket_aggregate import AttendancePayrollBucketAggregate
from app.models.attendance_standard import AttendanceCompanyHoliday, AttendancePaymentPeriod
from app.models.attendance_time_day import AttendanceTimeDay
from app.models.employee import Employee
from app.models.employee_reference_item import EmployeeReferenceItem
from app.models.employee_type import EmployeeType
from app.models.user import User
from app.services.attendance_additional_ot_service import compute_total_minutes
from app.services.attendance_time_day_service import (
    _employee_ids_auto_ot_exclude_calendar_holidays,
    _employee_ids_auto_ot_generation_enabled,
)
from app.services.company_service import CompanyService
from app.services.master_data.master_data_service import MasterDataService


def _additional_ot_approve_included(approve_status: Optional[str]) -> bool:
    if not approve_status:
        return True
    s = str(approve_status).strip().lower()
    return s in ("approved", "approve", "승인", "승인완료", "completed", "complete")


def _additional_ot_bucket_key(ot_type: Optional[str]) -> str:
    raw = ot_type or ""
    s = raw.strip().lower()
    if "lunchtime" in s or "점심" in raw:
        return "oth2"
    return "oth1"


def _is_monthly_pay(emp: Employee, type_by_code: Dict[str, EmployeeType]) -> bool:
    code = (emp.salary_process_type or "").strip()
    if not code:
        return True
    et = type_by_code.get(code.lower())
    if et:
        for nm in (et.name_kor, et.name_eng, et.name_thai):
            if not nm:
                continue
            n = nm.lower()
            if "월" in nm or "month" in n or "monthly" in n or "m" == n.strip():
                return True
            if "시" in nm or "일" in nm or "daily" in n or "hour" in n or "d" == n.strip():
                return False
    c = code.lower()
    if c in ("m", "monthly", "month"):
        return True
    if c in ("d", "daily", "day", "hourly"):
        return False
    return True


def _period_main_range(p: AttendancePaymentPeriod, monthly_pay: bool) -> Tuple[Optional[date], Optional[date]]:
    if monthly_pay:
        s, e = p.start_date_monthly, p.end_date_monthly
    else:
        s, e = p.start_date_daily, p.end_date_daily
    if s and e:
        return s, e
    return p.start_date_daily, p.end_date_daily


def _period_ot_range(p: AttendancePaymentPeriod, monthly_pay: bool) -> Tuple[Optional[date], Optional[date]]:
    if monthly_pay:
        s, e = p.ot_start_monthly, p.ot_end_monthly
    else:
        s, e = p.ot_start_daily, p.ot_end_daily
    if s and e:
        return s, e
    return _period_main_range(p, monthly_pay)


def _nz_int(v: Any) -> int:
    try:
        return int(v) if v is not None else 0
    except (TypeError, ValueError):
        return 0


def _nz_f(v: Any) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _parse_iso_date(s: Any) -> Optional[date]:
    if s is None:
        return None
    try:
        raw = str(s).strip()
        if not raw:
            return None
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def _date_to_iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def _company_holiday_key_set(db: Session, company_id: int, date_from: date, date_to: date) -> Set[Tuple[int, date]]:
    if date_from > date_to:
        return set()
    rows = (
        db.query(AttendanceCompanyHoliday)
        .filter(
            AttendanceCompanyHoliday.company_id == int(company_id),
            AttendanceCompanyHoliday.holiday_date >= date_from,
            AttendanceCompanyHoliday.holiday_date <= date_to,
        )
        .all()
    )
    out: Set[Tuple[int, date]] = set()
    for r in rows:
        hd = getattr(r, "holiday_date", None)
        if hd:
            out.add((int(company_id), hd))
    return out


def _is_holiday_ot_day(company_id: int, d: date, dr: AttendanceTimeDay, holiday_keys: Set[Tuple[int, date]]) -> bool:
    """근태 집계 OT 배수(`_day_band`)와 맞춤: 법정휴일·일요·근무달력 휴무(`day_off`)."""
    if (int(company_id), d) in holiday_keys:
        return True
    if d.weekday() == 6:
        return True
    if bool(getattr(dr, "day_off", False)):
        return True
    return False


class AttendancePayrollBucketService:
    def __init__(self, db: Session):
        self.db = db

    def _accessible_company_ids(self, user: User) -> List[int]:
        """근태기준정보·회사 마스터와 동일: 시스템 그룹(또는 슈퍼관리자 전체) 기준 접근 가능 회사."""
        return [c.id for c in CompanyService(self.db).list_companies(current_user=user)]

    def _type_by_code(self, company_id: int) -> Dict[str, EmployeeType]:
        rows = self.db.query(EmployeeType).filter(EmployeeType.company_id == company_id).all()
        return {r.employee_type_code.strip().lower(): r for r in rows if r.employee_type_code}

    def list_payment_periods(self, user: User, company_id: int, calendar_year: int) -> List[Dict[str, Any]]:
        allowed = self._accessible_company_ids(user)
        if not allowed or company_id not in allowed:
            return []
        rows = (
            self.db.query(AttendancePaymentPeriod)
            .filter(
                AttendancePaymentPeriod.company_id == company_id,
                AttendancePaymentPeriod.calendar_year == int(calendar_year),
            )
            .order_by(
                AttendancePaymentPeriod.calendar_month.asc(),
                AttendancePaymentPeriod.period_label.asc(),
            )
            .all()
        )
        out: List[Dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": int(r.id),
                    "calendar_year": int(r.calendar_year),
                    "calendar_month": int(r.calendar_month),
                    "period_label": r.period_label or "Period 1",
                    "start_date_daily": r.start_date_daily.isoformat() if r.start_date_daily else None,
                    "end_date_daily": r.end_date_daily.isoformat() if r.end_date_daily else None,
                    "start_date_monthly": r.start_date_monthly.isoformat() if r.start_date_monthly else None,
                    "end_date_monthly": r.end_date_monthly.isoformat() if r.end_date_monthly else None,
                    "ot_start_daily": r.ot_start_daily.isoformat() if r.ot_start_daily else None,
                    "ot_end_daily": r.ot_end_daily.isoformat() if r.ot_end_daily else None,
                    "ot_start_monthly": r.ot_start_monthly.isoformat() if r.ot_start_monthly else None,
                    "ot_end_monthly": r.ot_end_monthly.isoformat() if r.ot_end_monthly else None,
                    "is_closed": bool(getattr(r, "is_closed", False)),
                    "closed_at": r.closed_at.isoformat() if getattr(r, "closed_at", None) else None,
                    "closed_by_user_id": int(r.closed_by_user_id) if getattr(r, "closed_by_user_id", None) else None,
                }
            )
        return out

    def set_period_closed(
        self,
        user: User,
        company_id: int,
        calendar_year: int,
        calendar_month: int,
        period_label: str,
        is_closed: bool,
    ) -> Dict[str, Any]:
        allowed = self._accessible_company_ids(user)
        if not allowed or company_id not in allowed:
            raise ValueError("회사에 대한 접근 권한이 없습니다.")
        pl = (period_label or "Period 1").strip() or "Period 1"
        row = (
            self.db.query(AttendancePaymentPeriod)
            .filter(
                AttendancePaymentPeriod.company_id == int(company_id),
                AttendancePaymentPeriod.calendar_year == int(calendar_year),
                AttendancePaymentPeriod.calendar_month == int(calendar_month),
                AttendancePaymentPeriod.period_label == pl,
            )
            .first()
        )
        if not row:
            raise ValueError("마감할 급여근태기간을 찾을 수 없습니다.")
        row.is_closed = bool(is_closed)
        if is_closed:
            row.closed_at = date.today()
            row.closed_by_user_id = int(getattr(user, "id", 0) or 0) or None
        else:
            row.closed_at = None
            row.closed_by_user_id = None
        row.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(row)
        return {
            "id": int(row.id),
            "company_id": int(row.company_id),
            "calendar_year": int(row.calendar_year),
            "calendar_month": int(row.calendar_month),
            "period_label": row.period_label or "Period 1",
            "is_closed": bool(row.is_closed),
            "closed_at": row.closed_at.isoformat() if row.closed_at else None,
            "closed_by_user_id": int(row.closed_by_user_id) if row.closed_by_user_id else None,
        }

    def _filter_employees(
        self,
        company_id: int,
        allowed: List[int],
        coverage: str,
        employee_code_from: Optional[str],
        employee_code_to: Optional[str],
        department_code: Optional[str],
        employee_ids: Optional[List[int]] = None,
    ) -> List[Employee]:
        if company_id not in allowed:
            return []
        q = self.db.query(Employee).filter(Employee.company_id == company_id)
        st = (coverage or "all").strip().lower()
        if employee_ids:
            q = q.filter(Employee.id.in_(employee_ids))
        elif st == "code_range":
            a = (employee_code_from or "").strip()
            b = (employee_code_to or "").strip()
            if a:
                q = q.filter(Employee.employee_number >= a)
            if b:
                q = q.filter(Employee.employee_number <= b)
        elif st == "department":
            dc = (department_code or "").strip()
            if dc:
                q = q.filter(Employee.department == dc)
        q = q.filter(func.coalesce(Employee.status, "active") == "active")
        return q.order_by(Employee.employee_number.asc()).all()

    def _load_additional_ot_map(
        self,
        employee_ids: List[int],
        date_from: date,
        date_to: date,
        allowed: List[int],
    ) -> Dict[Tuple[int, date], Dict[str, int]]:
        if not employee_ids or date_from > date_to:
            return {}
        deltas: Dict[Tuple[int, date], Dict[str, int]] = defaultdict(
            lambda: {"oth1": 0, "oth2": 0, "oth3": 0, "oth4": 0, "oth5": 0, "oth6": 0}
        )
        q = (
            self.db.query(AttendanceAdditionalOt)
            .join(Employee, AttendanceAdditionalOt.employee_id == Employee.id)
            .filter(
                AttendanceAdditionalOt.employee_id.in_(employee_ids),
                AttendanceAdditionalOt.work_date >= date_from,
                AttendanceAdditionalOt.work_date <= date_to,
                or_(Employee.company_id.is_(None), Employee.company_id.in_(allowed)),
            )
        )
        for r in q.all():
            if not _additional_ot_approve_included(getattr(r, "approve_status", None)):
                continue
            if bool(getattr(r, "block_payment", False)):
                continue
            wd = getattr(r, "work_date", None)
            if not wd:
                continue
            tm = r.total_minutes
            if tm is None:
                tm = compute_total_minutes(str(r.ot_start or ""), str(r.ot_end or ""))
            mins = max(0, int(tm or 0))
            if mins <= 0:
                continue
            bk = _additional_ot_bucket_key(getattr(r, "ot_type", None))
            key = (int(r.employee_id), wd)
            deltas[key][bk] += mins
        return deltas

    def _aggregate_orm_to_api(self, r: AttendancePayrollBucketAggregate) -> Dict[str, Any]:
        return {
            "employee_id": int(r.employee_id),
            "employee_number": r.employee_number or "",
            "employee_name": r.employee_name or "",
            "department": (r.department or "").strip(),
            "pay_type": r.pay_type or "",
            "calendar_year": int(r.calendar_year),
            "calendar_month": int(r.calendar_month),
            "period_label": r.period_label or "Period 1",
            "range_main_start": _date_to_iso(r.range_main_start),
            "range_main_end": _date_to_iso(r.range_main_end),
            "range_ot_start": _date_to_iso(r.range_ot_start),
            "range_ot_end": _date_to_iso(r.range_ot_end),
            "income_ot_only": bool(r.income_ot_only),
            "holiday_days": int(r.holiday_days or 0),
            "days_worked": int(r.days_worked or 0),
            "working_minutes": int(r.working_minutes or 0),
            "absent_minutes": int(r.absent_minutes or 0),
            "late_minutes": int(r.late_minutes or 0),
            "early_minutes": int(r.early_minutes or 0),
            "leave_with_pay_minutes": int(r.leave_with_pay_minutes or 0),
            "leave_without_pay_minutes": int(r.leave_without_pay_minutes or 0),
            "oth1": int(r.oth1 or 0),
            "oth2": int(r.oth2 or 0),
            "oth3": int(r.oth3 or 0),
            "oth4": int(r.oth4 or 0),
            "oth5": int(r.oth5 or 0),
            "oth6": int(r.oth6 or 0),
            "oth1_weekday": int(getattr(r, "oth1_weekday", None) or 0),
            "oth1_holiday": int(getattr(r, "oth1_holiday", None) or 0),
            "oth2_weekday": int(getattr(r, "oth2_weekday", None) or 0),
            "oth2_holiday": int(getattr(r, "oth2_holiday", None) or 0),
            "oth3_weekday": int(getattr(r, "oth3_weekday", None) or 0),
            "oth3_holiday": int(getattr(r, "oth3_holiday", None) or 0),
            "oth4_weekday": int(getattr(r, "oth4_weekday", None) or 0),
            "oth4_holiday": int(getattr(r, "oth4_holiday", None) or 0),
            "oth5_weekday": int(getattr(r, "oth5_weekday", None) or 0),
            "oth5_holiday": int(getattr(r, "oth5_holiday", None) or 0),
            "oth6_weekday": int(getattr(r, "oth6_weekday", None) or 0),
            "oth6_holiday": int(getattr(r, "oth6_holiday", None) or 0),
            "othb": round(float(r.othb or 0), 2),
            "othb_weekday": round(float(getattr(r, "othb_weekday", None) or 0), 2),
            "othb_holiday": round(float(getattr(r, "othb_holiday", None) or 0), 2),
            "shift_allowance": round(float(r.shift_allowance or 0), 2),
            "food_allowance": round(float(r.food_allowance or 0), 2),
            "special_allowance": round(float(r.special_allowance or 0), 2),
            "fuel_allowance": round(float(r.fuel_allowance or 0), 2),
            "standing_allowance": round(float(r.standing_allowance or 0), 2),
            "other_allowance": round(float(r.other_allowance or 0), 2),
            "shift_ot_allowance": round(float(r.shift_ot_allowance or 0), 2),
            "shift_over_ot_allowance": round(float(r.shift_over_ot_allowance or 0), 2),
            "food_ot_allowance": round(float(r.food_ot_allowance or 0), 2),
            "food_over_ot_allowance": round(float(r.food_over_ot_allowance or 0), 2),
            "special_ot_allowance": round(float(r.special_ot_allowance or 0), 2),
            "overtime_pay_local": round(float(r.overtime_pay_local or 0), 2),
            "overtime_pay_local_weekday": round(float(getattr(r, "overtime_pay_local_weekday", None) or 0), 2),
            "overtime_pay_local_holiday": round(float(getattr(r, "overtime_pay_local_holiday", None) or 0), 2),
        }

    def _upsert_aggregate_rows(
        self,
        company_id: int,
        prow: AttendancePaymentPeriod,
        rows_out: List[Dict[str, Any]],
        user_id: Optional[int],
    ) -> None:
        """집계 결과를 `attendance_payroll_bucket_aggregate`에 자연키 기준 UPSERT."""
        if not rows_out:
            return
        table = AttendancePayrollBucketAggregate.__table__
        payloads: List[Dict[str, Any]] = []
        for r in rows_out:
            payloads.append(
                {
                    "company_id": company_id,
                    "employee_id": int(r["employee_id"]),
                    "attendance_payment_period_id": int(prow.id),
                    "calendar_year": int(r["calendar_year"]),
                    "calendar_month": int(r["calendar_month"]),
                    "period_label": r["period_label"],
                    "income_ot_only": bool(r["income_ot_only"]),
                    "pay_type": r.get("pay_type"),
                    "range_main_start": _parse_iso_date(r.get("range_main_start")),
                    "range_main_end": _parse_iso_date(r.get("range_main_end")),
                    "range_ot_start": _parse_iso_date(r.get("range_ot_start")),
                    "range_ot_end": _parse_iso_date(r.get("range_ot_end")),
                    "holiday_days": int(r["holiday_days"]),
                    "days_worked": int(r["days_worked"]),
                    "working_minutes": int(r["working_minutes"]),
                    "absent_minutes": int(r["absent_minutes"]),
                    "late_minutes": int(r["late_minutes"]),
                    "early_minutes": int(r["early_minutes"]),
                    "leave_with_pay_minutes": int(r["leave_with_pay_minutes"]),
                    "leave_without_pay_minutes": int(r["leave_without_pay_minutes"]),
                    "oth1": int(r["oth1"]),
                    "oth2": int(r["oth2"]),
                    "oth3": int(r["oth3"]),
                    "oth4": int(r["oth4"]),
                    "oth5": int(r["oth5"]),
                    "oth6": int(r["oth6"]),
                    "oth1_weekday": int(r["oth1_weekday"]),
                    "oth1_holiday": int(r["oth1_holiday"]),
                    "oth2_weekday": int(r["oth2_weekday"]),
                    "oth2_holiday": int(r["oth2_holiday"]),
                    "oth3_weekday": int(r["oth3_weekday"]),
                    "oth3_holiday": int(r["oth3_holiday"]),
                    "oth4_weekday": int(r["oth4_weekday"]),
                    "oth4_holiday": int(r["oth4_holiday"]),
                    "oth5_weekday": int(r["oth5_weekday"]),
                    "oth5_holiday": int(r["oth5_holiday"]),
                    "oth6_weekday": int(r["oth6_weekday"]),
                    "oth6_holiday": int(r["oth6_holiday"]),
                    "othb": float(r["othb"]),
                    "othb_weekday": float(r["othb_weekday"]),
                    "othb_holiday": float(r["othb_holiday"]),
                    "shift_allowance": float(r["shift_allowance"]),
                    "food_allowance": float(r["food_allowance"]),
                    "special_allowance": float(r["special_allowance"]),
                    "fuel_allowance": float(r["fuel_allowance"]),
                    "standing_allowance": float(r["standing_allowance"]),
                    "other_allowance": float(r["other_allowance"]),
                    "shift_ot_allowance": float(r["shift_ot_allowance"]),
                    "shift_over_ot_allowance": float(r["shift_over_ot_allowance"]),
                    "food_ot_allowance": float(r["food_ot_allowance"]),
                    "food_over_ot_allowance": float(r["food_over_ot_allowance"]),
                    "special_ot_allowance": float(r["special_ot_allowance"]),
                    "overtime_pay_local": float(r["overtime_pay_local"]),
                    "overtime_pay_local_weekday": float(r["overtime_pay_local_weekday"]),
                    "overtime_pay_local_holiday": float(r["overtime_pay_local_holiday"]),
                    "employee_number": r.get("employee_number"),
                    "employee_name": r.get("employee_name"),
                    "department": ((r.get("department") or "").strip() or None),
                    "computed_by_user_id": user_id,
                }
            )

        stmt = pg_insert(table).values(payloads)
        ex = stmt.excluded
        stmt = stmt.on_conflict_do_update(
            index_elements=[
                table.c.employee_id,
                table.c.calendar_year,
                table.c.calendar_month,
                table.c.period_label,
                table.c.income_ot_only,
            ],
            set_={
                "company_id": ex.company_id,
                "attendance_payment_period_id": ex.attendance_payment_period_id,
                "pay_type": ex.pay_type,
                "range_main_start": ex.range_main_start,
                "range_main_end": ex.range_main_end,
                "range_ot_start": ex.range_ot_start,
                "range_ot_end": ex.range_ot_end,
                "holiday_days": ex.holiday_days,
                "days_worked": ex.days_worked,
                "working_minutes": ex.working_minutes,
                "absent_minutes": ex.absent_minutes,
                "late_minutes": ex.late_minutes,
                "early_minutes": ex.early_minutes,
                "leave_with_pay_minutes": ex.leave_with_pay_minutes,
                "leave_without_pay_minutes": ex.leave_without_pay_minutes,
                "oth1": ex.oth1,
                "oth2": ex.oth2,
                "oth3": ex.oth3,
                "oth4": ex.oth4,
                "oth5": ex.oth5,
                "oth6": ex.oth6,
                "oth1_weekday": ex.oth1_weekday,
                "oth1_holiday": ex.oth1_holiday,
                "oth2_weekday": ex.oth2_weekday,
                "oth2_holiday": ex.oth2_holiday,
                "oth3_weekday": ex.oth3_weekday,
                "oth3_holiday": ex.oth3_holiday,
                "oth4_weekday": ex.oth4_weekday,
                "oth4_holiday": ex.oth4_holiday,
                "oth5_weekday": ex.oth5_weekday,
                "oth5_holiday": ex.oth5_holiday,
                "oth6_weekday": ex.oth6_weekday,
                "oth6_holiday": ex.oth6_holiday,
                "othb": ex.othb,
                "othb_weekday": ex.othb_weekday,
                "othb_holiday": ex.othb_holiday,
                "shift_allowance": ex.shift_allowance,
                "food_allowance": ex.food_allowance,
                "special_allowance": ex.special_allowance,
                "fuel_allowance": ex.fuel_allowance,
                "standing_allowance": ex.standing_allowance,
                "other_allowance": ex.other_allowance,
                "shift_ot_allowance": ex.shift_ot_allowance,
                "shift_over_ot_allowance": ex.shift_over_ot_allowance,
                "food_ot_allowance": ex.food_ot_allowance,
                "food_over_ot_allowance": ex.food_over_ot_allowance,
                "special_ot_allowance": ex.special_ot_allowance,
                "overtime_pay_local": ex.overtime_pay_local,
                "overtime_pay_local_weekday": ex.overtime_pay_local_weekday,
                "overtime_pay_local_holiday": ex.overtime_pay_local_holiday,
                "employee_number": ex.employee_number,
                "employee_name": ex.employee_name,
                "department": ex.department,
                "computed_by_user_id": ex.computed_by_user_id,
                "updated_at": func.now(),
            },
        )
        self.db.execute(stmt)
        self.db.commit()

    def _build_bucket_row_for_employee(
        self,
        emp: Employee,
        *,
        type_by: Dict[str, EmployeeType],
        prow: AttendancePaymentPeriod,
        calendar_year: int,
        calendar_month: int,
        pl: str,
        income_ot_only: bool,
        add_map: Dict[Tuple[int, date], Dict[str, int]],
        auto_ot_eids: Set[int],
        exclude_cal_ot_eids: Set[int],
        holiday_keys: Set[Tuple[int, date]],
        company_id: int,
    ) -> Optional[Dict[str, Any]]:
        mp = _is_monthly_pay(emp, type_by)
        main_s, main_e = _period_main_range(prow, mp)
        ot_s, ot_e = _period_ot_range(prow, mp)
        if not main_s or not main_e:
            return None
        if income_ot_only:
            filt_s, filt_e = ot_s or main_s, ot_e or main_e
        else:
            filt_s, filt_e = main_s, main_e
        if not filt_s or not filt_e:
            return None

        q = self.db.query(AttendanceTimeDay).filter(
            AttendanceTimeDay.employee_id == emp.id,
            AttendanceTimeDay.work_day >= filt_s,
            AttendanceTimeDay.work_day <= filt_e,
        )
        day_rows = q.all()

        sums: Dict[str, Any] = defaultdict(float)
        holiday_days = 0
        days_with_in = 0
        for dr in day_rows:
            wd = dr.work_day
            eid = int(dr.employee_id)
            add_sub = add_map.get((eid, wd), {}) if wd else {}
            if eid not in auto_ot_eids:
                add_sub = {}
            elif eid in exclude_cal_ot_eids and bool(getattr(dr, "day_off", False)):
                add_sub = {}
            is_hol_ot = bool(wd) and _is_holiday_ot_day(company_id, wd, dr, holiday_keys)

            if dr.day_off:
                holiday_days += 1
            if dr.time_in:
                days_with_in += 1
                late = _nz_int(dr.late_time_in)
                early = _nz_int(dr.before_time_out)
                sums["working_minutes"] += max(0, 480 - late - early)

            sums["late_minutes"] += _nz_int(dr.late_time_in)
            sums["early_minutes"] += _nz_int(dr.before_time_out)
            sums["leave_with_pay_minutes"] += _nz_int(getattr(dr, "leave_time", None))
            sums["leave_without_pay_minutes"] += _nz_int(getattr(dr, "leave_without_pay", None))
            sums["absent_minutes"] += _nz_int(getattr(dr, "absent_time", None))

            for i in range(1, 7):
                k = f"oth{i}"
                base = _nz_int(getattr(dr, k, None))
                total_m = base + _nz_int(add_sub.get(k, 0))
                sums[k] += total_m
                wk_key = f"{k}_weekday"
                hol_key = f"{k}_holiday"
                if is_hol_ot:
                    sums[hol_key] += total_m
                else:
                    sums[wk_key] += total_m

            v_othb = _nz_f(dr.othb)
            sums["othb"] += v_othb
            if is_hol_ot:
                sums["othb_holiday"] += v_othb
            else:
                sums["othb_weekday"] += v_othb
            sums["shift_allowance"] += _nz_f(dr.shift_allowance)
            sums["food_allowance"] += _nz_f(dr.food_allowance)
            sums["special_allowance"] += _nz_f(dr.special_allowance)
            sums["shift_ot_allowance"] += _nz_f(dr.shift_ot_allowance)
            sums["shift_over_ot_allowance"] += _nz_f(dr.shift_over_ot_allowance)
            sums["food_ot_allowance"] += _nz_f(dr.food_ot_allowance)
            sums["food_over_ot_allowance"] += _nz_f(dr.food_over_ot_allowance)
            sums["special_ot_allowance"] += _nz_f(dr.special_ot_allowance)
            v_otloc = _nz_f(dr.overtime_pay_local)
            sums["overtime_pay_local"] += v_otloc
            if is_hol_ot:
                sums["overtime_pay_local_holiday"] += v_otloc
            else:
                sums["overtime_pay_local_weekday"] += v_otloc
            sums["fuel_allowance"] += _nz_f(getattr(dr, "fuel_allowance", None))
            sums["standing_allowance"] += _nz_f(getattr(dr, "standing_allowance", None))
            sums["other_allowance"] += _nz_f(getattr(dr, "other_allowance", None))

        return {
            "employee_id": int(emp.id),
            "employee_number": emp.employee_number or "",
            "employee_name": emp.name or "",
            "department": (emp.department or "").strip(),
            "pay_type": "monthly" if mp else "daily",
            "calendar_year": int(calendar_year),
            "calendar_month": int(calendar_month),
            "period_label": pl,
            "range_main_start": main_s.isoformat(),
            "range_main_end": main_e.isoformat(),
            "range_ot_start": (ot_s or main_s).isoformat(),
            "range_ot_end": (ot_e or main_e).isoformat(),
            "income_ot_only": bool(income_ot_only),
            "holiday_days": holiday_days,
            "days_worked": days_with_in,
            "working_minutes": int(sums["working_minutes"]),
            "absent_minutes": int(sums["absent_minutes"]),
            "late_minutes": int(sums["late_minutes"]),
            "early_minutes": int(sums["early_minutes"]),
            "leave_with_pay_minutes": int(sums["leave_with_pay_minutes"]),
            "leave_without_pay_minutes": int(sums["leave_without_pay_minutes"]),
            "oth1": int(sums["oth1"]),
            "oth2": int(sums["oth2"]),
            "oth3": int(sums["oth3"]),
            "oth4": int(sums["oth4"]),
            "oth5": int(sums["oth5"]),
            "oth6": int(sums["oth6"]),
            "oth1_weekday": int(sums["oth1_weekday"]),
            "oth1_holiday": int(sums["oth1_holiday"]),
            "oth2_weekday": int(sums["oth2_weekday"]),
            "oth2_holiday": int(sums["oth2_holiday"]),
            "oth3_weekday": int(sums["oth3_weekday"]),
            "oth3_holiday": int(sums["oth3_holiday"]),
            "oth4_weekday": int(sums["oth4_weekday"]),
            "oth4_holiday": int(sums["oth4_holiday"]),
            "oth5_weekday": int(sums["oth5_weekday"]),
            "oth5_holiday": int(sums["oth5_holiday"]),
            "oth6_weekday": int(sums["oth6_weekday"]),
            "oth6_holiday": int(sums["oth6_holiday"]),
            "othb": round(float(sums["othb"]), 2),
            "othb_weekday": round(float(sums["othb_weekday"]), 2),
            "othb_holiday": round(float(sums["othb_holiday"]), 2),
            "shift_allowance": round(float(sums["shift_allowance"]), 2),
            "food_allowance": round(float(sums["food_allowance"]), 2),
            "special_allowance": round(float(sums["special_allowance"]), 2),
            "fuel_allowance": round(float(sums["fuel_allowance"]), 2),
            "standing_allowance": round(float(sums["standing_allowance"]), 2),
            "other_allowance": round(float(sums["other_allowance"]), 2),
            "shift_ot_allowance": round(float(sums["shift_ot_allowance"]), 2),
            "shift_over_ot_allowance": round(float(sums["shift_over_ot_allowance"]), 2),
            "food_ot_allowance": round(float(sums["food_ot_allowance"]), 2),
            "food_over_ot_allowance": round(float(sums["food_over_ot_allowance"]), 2),
            "special_ot_allowance": round(float(sums["special_ot_allowance"]), 2),
            "overtime_pay_local": round(float(sums["overtime_pay_local"]), 2),
            "overtime_pay_local_weekday": round(float(sums["overtime_pay_local_weekday"]), 2),
            "overtime_pay_local_holiday": round(float(sums["overtime_pay_local_holiday"]), 2),
        }

    def iter_compute_for_period(
        self,
        user: User,
        company_id: int,
        calendar_year: int,
        calendar_month: int,
        period_label: str,
        coverage: str = "all",
        employee_code_from: Optional[str] = None,
        employee_code_to: Optional[str] = None,
        department_code: Optional[str] = None,
        income_ot_only: bool = False,
        employee_ids: Optional[List[int]] = None,
    ) -> Iterator[Dict[str, Any]]:
        """NDJSON 스트림용: 직원 단위 progress 후 마지막에 done."""
        allowed = self._accessible_company_ids(user)
        if not allowed or company_id not in allowed:
            raise ValueError("회사에 대한 접근 권한이 없습니다.")
        pl = (period_label or "Period 1").strip() or "Period 1"
        prow = (
            self.db.query(AttendancePaymentPeriod)
            .filter(
                AttendancePaymentPeriod.company_id == company_id,
                AttendancePaymentPeriod.calendar_year == int(calendar_year),
                AttendancePaymentPeriod.calendar_month == int(calendar_month),
                AttendancePaymentPeriod.period_label == pl,
            )
            .first()
        )
        if not prow:
            raise ValueError(
                f"급여근태기간을 찾을 수 없습니다. ({calendar_year}-{calendar_month:02d}, {pl}) 근태기준정보에서 등록하세요."
            )
        if bool(getattr(prow, "is_closed", False)):
            raise ValueError("해당 기간은 급여정보 집계 마감 상태입니다. 마감 해제 후 실행하세요.")

        type_by = self._type_by_code(company_id)
        employees = self._filter_employees(
            company_id, allowed, coverage, employee_code_from, employee_code_to, department_code, employee_ids
        )
        if not employees:
            yield {
                "type": "done",
                "result": {
                    "period": self._period_meta(prow),
                    "employee_count": 0,
                },
            }
            return

        emp_ids = [int(e.id) for e in employees]
        union_from: Optional[date] = None
        union_to: Optional[date] = None
        for e in employees:
            mp = _is_monthly_pay(e, type_by)
            s, t = _period_main_range(prow, mp)
            u, v = _period_ot_range(prow, mp)
            for a, b in ((s, t), (u, v)):
                if a and b:
                    if union_from is None or a < union_from:
                        union_from = a
                    if union_to is None or b > union_to:
                        union_to = b
        if union_from is None or union_to is None:
            raise ValueError("급여근태기간에 유효한 시작·종료일이 없습니다.")
        add_map = self._load_additional_ot_map(emp_ids, union_from, union_to, allowed)
        auto_ot_eids = _employee_ids_auto_ot_generation_enabled(self.db, emp_ids)
        exclude_cal_ot_eids = _employee_ids_auto_ot_exclude_calendar_holidays(self.db, emp_ids)
        holiday_keys = _company_holiday_key_set(self.db, company_id, union_from, union_to)

        rows_out: List[Dict[str, Any]] = []
        n = len(employees)
        try:
            for i, emp in enumerate(employees):
                row = self._build_bucket_row_for_employee(
                    emp,
                    type_by=type_by,
                    prow=prow,
                    calendar_year=calendar_year,
                    calendar_month=calendar_month,
                    pl=pl,
                    income_ot_only=income_ot_only,
                    add_map=add_map,
                    auto_ot_eids=auto_ot_eids,
                    exclude_cal_ot_eids=exclude_cal_ot_eids,
                    holiday_keys=holiday_keys,
                    company_id=company_id,
                )
                if row:
                    rows_out.append(row)
                yield {
                    "type": "progress",
                    "done": i + 1,
                    "total": n,
                    "percent": int(100 * (i + 1) / n) if n else 100,
                }
            self._upsert_aggregate_rows(company_id, prow, rows_out, getattr(user, "id", None))
        except Exception:
            self.db.rollback()
            raise

        yield {
            "type": "done",
            "result": {
                "period": self._period_meta(prow),
                "employee_count": len(rows_out),
            },
        }

    def compute_for_period(
        self,
        user: User,
        company_id: int,
        calendar_year: int,
        calendar_month: int,
        period_label: str,
        coverage: str = "all",
        employee_code_from: Optional[str] = None,
        employee_code_to: Optional[str] = None,
        department_code: Optional[str] = None,
        income_ot_only: bool = False,
        employee_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        allowed = self._accessible_company_ids(user)
        if not allowed or company_id not in allowed:
            raise ValueError("회사에 대한 접근 권한이 없습니다.")
        pl = (period_label or "Period 1").strip() or "Period 1"
        prow = (
            self.db.query(AttendancePaymentPeriod)
            .filter(
                AttendancePaymentPeriod.company_id == company_id,
                AttendancePaymentPeriod.calendar_year == int(calendar_year),
                AttendancePaymentPeriod.calendar_month == int(calendar_month),
                AttendancePaymentPeriod.period_label == pl,
            )
            .first()
        )
        if not prow:
            raise ValueError(
                f"급여근태기간을 찾을 수 없습니다. ({calendar_year}-{calendar_month:02d}, {pl}) 근태기준정보에서 등록하세요."
            )
        if bool(getattr(prow, "is_closed", False)):
            raise ValueError("해당 기간은 급여정보 집계 마감 상태입니다. 마감 해제 후 실행하세요.")

        type_by = self._type_by_code(company_id)
        employees = self._filter_employees(
            company_id, allowed, coverage, employee_code_from, employee_code_to, department_code, employee_ids
        )
        if not employees:
            return {
                "period": self._period_meta(prow),
                "rows": [],
                "employee_count": 0,
            }

        emp_ids = [int(e.id) for e in employees]

        # 넓은 범위로 추가 OT 맵(메인·OT 구간의 합집합)
        union_from: Optional[date] = None
        union_to: Optional[date] = None
        for e in employees:
            mp = _is_monthly_pay(e, type_by)
            s, t = _period_main_range(prow, mp)
            u, v = _period_ot_range(prow, mp)
            for a, b in ((s, t), (u, v)):
                if a and b:
                    if union_from is None or a < union_from:
                        union_from = a
                    if union_to is None or b > union_to:
                        union_to = b
        if union_from is None or union_to is None:
            raise ValueError("급여근태기간에 유효한 시작·종료일이 없습니다.")
        add_map = self._load_additional_ot_map(emp_ids, union_from, union_to, allowed)
        auto_ot_eids = _employee_ids_auto_ot_generation_enabled(self.db, emp_ids)
        exclude_cal_ot_eids = _employee_ids_auto_ot_exclude_calendar_holidays(self.db, emp_ids)
        holiday_keys = _company_holiday_key_set(self.db, company_id, union_from, union_to)

        rows_out: List[Dict[str, Any]] = []
        for emp in employees:
            row = self._build_bucket_row_for_employee(
                emp,
                type_by=type_by,
                prow=prow,
                calendar_year=calendar_year,
                calendar_month=calendar_month,
                pl=pl,
                income_ot_only=income_ot_only,
                add_map=add_map,
                auto_ot_eids=auto_ot_eids,
                exclude_cal_ot_eids=exclude_cal_ot_eids,
                holiday_keys=holiday_keys,
                company_id=company_id,
            )
            if row:
                rows_out.append(row)

        self._upsert_aggregate_rows(company_id, prow, rows_out, getattr(user, "id", None))

        return {
            "period": self._period_meta(prow),
            "rows": rows_out,
            "employee_count": len(rows_out),
        }

    def _period_meta(self, prow: AttendancePaymentPeriod) -> Dict[str, Any]:
        return {
            "id": int(prow.id),
            "calendar_year": int(prow.calendar_year),
            "calendar_month": int(prow.calendar_month),
            "period_label": prow.period_label or "Period 1",
        }

    def yearly_status_for_employee(
        self,
        user: User,
        company_id: int,
        employee_id: int,
        calendar_year: int,
        income_ot_only: bool = False,
    ) -> Dict[str, Any]:
        """한 직원·연도에 대해 저장된 집계(`attendance_payroll_bucket_aggregate`)만 조회."""
        self._require_employee_company(user, employee_id, company_id)
        q = (
            self.db.query(AttendancePayrollBucketAggregate)
            .filter(
                AttendancePayrollBucketAggregate.company_id == company_id,
                AttendancePayrollBucketAggregate.employee_id == employee_id,
                AttendancePayrollBucketAggregate.calendar_year == int(calendar_year),
                AttendancePayrollBucketAggregate.income_ot_only == bool(income_ot_only),
            )
            .order_by(
                AttendancePayrollBucketAggregate.calendar_month.asc(),
                AttendancePayrollBucketAggregate.period_label.asc(),
            )
        )
        rows = [self._aggregate_orm_to_api(r) for r in q.all()]
        return {"calendar_year": int(calendar_year), "employee_id": employee_id, "rows": rows}

    def period_status_all(
        self,
        user: User,
        company_id: Optional[int],
        calendar_year: int,
        calendar_month: int,
        status: str = "active",
        department: Optional[str] = None,
        search: Optional[str] = None,
        income_ot_only: bool = False,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        allowed = self._accessible_company_ids(user)
        if not allowed:
            return {"items": [], "total": 0, "page": 1, "page_size": max(1, int(page_size or 50))}

        q = (
            self.db.query(AttendancePayrollBucketAggregate, Employee, EmployeeReferenceItem)
            .join(Employee, AttendancePayrollBucketAggregate.employee_id == Employee.id)
            .outerjoin(EmployeeReferenceItem, EmployeeReferenceItem.id == Employee.department_item_id)
            .filter(
                AttendancePayrollBucketAggregate.calendar_year == int(calendar_year),
                AttendancePayrollBucketAggregate.calendar_month == int(calendar_month),
                AttendancePayrollBucketAggregate.income_ot_only == bool(income_ot_only),
                AttendancePayrollBucketAggregate.company_id.in_(allowed),
                or_(Employee.company_id.is_(None), Employee.company_id.in_(allowed)),
            )
        )

        if company_id is not None:
            if int(company_id) not in allowed:
                return {"items": [], "total": 0, "page": 1, "page_size": max(1, int(page_size or 50))}
            q = q.filter(AttendancePayrollBucketAggregate.company_id == int(company_id))

        dept_kw = (department or "").strip()
        if dept_kw:
            q = q.filter(
                or_(
                    AttendancePayrollBucketAggregate.department == dept_kw,
                    Employee.department == dept_kw,
                )
            )

        st = (status or "active").strip().lower()
        if st in ("active", "terminated", "inactive"):
            q = q.filter(func.coalesce(Employee.status, "active") == st)
        elif st != "all":
            q = q.filter(func.coalesce(Employee.status, "active") == "active")

        kw = (search or "").strip()
        if kw:
            like = f"%{kw}%"
            q = q.filter(
                or_(
                    AttendancePayrollBucketAggregate.employee_number.ilike(like),
                    AttendancePayrollBucketAggregate.employee_name.ilike(like),
                    AttendancePayrollBucketAggregate.department.ilike(like),
                    EmployeeReferenceItem.name_kor.ilike(like),
                    EmployeeReferenceItem.name_eng.ilike(like),
                    EmployeeReferenceItem.name_thai.ilike(like),
                    Employee.employee_number.ilike(like),
                    Employee.name.ilike(like),
                    Employee.department.ilike(like),
                )
            )

        total = int(q.count())
        safe_page = max(1, int(page or 1))
        safe_page_size = max(1, min(int(page_size or 50), 1000))
        offset = (safe_page - 1) * safe_page_size

        rows = (
            q.order_by(
                AttendancePayrollBucketAggregate.period_label.asc(),
                AttendancePayrollBucketAggregate.employee_number.asc(),
                AttendancePayrollBucketAggregate.employee_id.asc(),
            )
            .offset(offset)
            .limit(safe_page_size)
            .all()
        )

        items: List[Dict[str, Any]] = []
        for agg, emp, dept_ref in rows:
            item = self._aggregate_orm_to_api(agg)
            item["company_id"] = int(agg.company_id)
            item["employee_status"] = str(emp.status or "active")
            if dept_ref is not None:
                item["department_name"] = (
                    str(
                        dept_ref.name_kor
                        or dept_ref.name_eng
                        or dept_ref.name_thai
                        or agg.department
                        or emp.department
                        or ""
                    ).strip()
                    or None
                )
            items.append(item)

        return {"items": items, "total": total, "page": safe_page, "page_size": safe_page_size}

    def _require_employee_company(self, user: User, employee_id: int, company_id: int) -> None:
        if CompanyService(self.db).get(company_id, current_user=user) is None:
            raise ValueError("회사에 대한 접근 권한이 없습니다.")
        emp = MasterDataService(self.db).get_employee(employee_id)
        if not emp or emp.company_id != company_id:
            raise ValueError("직원을 찾을 수 없습니다.")
