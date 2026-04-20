"""일별 근태 집계(AttendanceTimeDay) 조회/수정."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Load, Session, aliased
from sqlalchemy.types import Float as SAFloat

from app.models.attendance_additional_ot import AttendanceAdditionalOt
from app.models.attendance_time_day import AttendanceTimeDay
from app.models.company import Company
from app.models.employee import Employee
from app.models.employee_reference_item import EmployeeReferenceItem
from app.models.user import User
from app.services.attendance_additional_ot_service import compute_total_minutes
from app.services.master_data.master_data_service import MasterDataService
from app.services.system_rbac_service import SystemRbacService


def _pd(v: Any) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, date):
        return v
    s = str(v).strip()[:10]
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def _dt(v: Any) -> Optional[datetime]:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v).strip().replace("Z", "+00:00").replace("+00:00", ""))
    except Exception:
        return None


def _int(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except Exception:
        return None


def _flt(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except Exception:
        return None


def _str(v: Any, max_len: int) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s[:max_len] if s else None


def _bool(v: Any, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("1", "true", "yes", "y", "on")


NUM_INT_FIELDS = {
    "row_no",
    "late_time_in",
    "before_time_out_break",
    "before_time_out",
    "oth1",
    "oth2",
    "oth3",
    "oth4",
    "oth5",
    "oth6",
}
NUM_FLOAT_FIELDS = {
    "othb",
    "day_food",
    "day_wages",
    "day_food_ot",
    "day_wages_ot",
    "day_food_over_ot",
    "day_wages_over_ot",
    "shift_allowance",
    "shift_ot_allowance",
    "shift_over_ot_allowance",
    "food_allowance",
    "food_ot_allowance",
    "food_over_ot_allowance",
    "special_ot_allowance",
    "special_allowance",
    "overtime_pay_local",
    "shift_pay_local",
}
DATETIME_FIELDS = {"time_in", "time_out_break", "time_in_break", "time_out"}
BOOL_FIELDS = {"ck_pay_ot", "doc_sick", "without_pay_public_holiday", "day_off"}
TEXT_FIELDS = {
    "no_of_shift",
    "shift_code",
    "type_ot",
    "day_memo",
    "note",
    "user_chang",
    "st_in",
    "st_out",
    "st_bin",
    "st_bout",
}

_OTH_KEYS: Tuple[str, ...] = ("oth1", "oth2", "oth3", "oth4", "oth5", "oth6")


def _additional_ot_approve_included(approve_status: Optional[str]) -> bool:
    """집계 테이블 합산에 포함할지 — `attendance_aggregate_service._leave_approved`와 동일 기준."""
    if not approve_status:
        return True
    s = str(approve_status).strip().lower()
    return s in ("approved", "approve", "승인", "승인완료", "completed", "complete")


def _additional_ot_bucket_key(ot_type: Optional[str]) -> str:
    """Regular OT asking `ot_type` → 표시용 oth1..oth6 칸(분 단위 합산).

    - 점심 구간 요청 → OT 1.5배 칸(oth2)
    - 출근 전/출근 후 등 그 외 → OT 1배 칸(oth1)
    """
    raw = ot_type or ""
    s = raw.strip().lower()
    if "lunchtime" in s or "점심" in raw:
        return "oth2"
    return "oth1"


def _row_to_dict(r: AttendanceTimeDay) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "id": int(r.id),
        "employee_id": r.employee_id,
        "work_day": r.work_day.isoformat() if r.work_day else None,
        "row_no": r.row_no,
        "no_of_shift": r.no_of_shift,
        "shift_code": r.shift_code,
        "time_in": r.time_in.isoformat() if r.time_in else None,
        "time_out_break": r.time_out_break.isoformat() if r.time_out_break else None,
        "time_in_break": r.time_in_break.isoformat() if r.time_in_break else None,
        "time_out": r.time_out.isoformat() if r.time_out else None,
        "late_time_in": r.late_time_in,
        "before_time_out_break": r.before_time_out_break,
        "before_time_out": r.before_time_out,
        "oth1": r.oth1,
        "oth2": r.oth2,
        "oth3": r.oth3,
        "oth4": r.oth4,
        "oth5": r.oth5,
        "oth6": r.oth6,
        "othb": r.othb,
        "type_ot": r.type_ot,
        "day_memo": r.day_memo,
        "note": r.note,
        "ck_pay_ot": bool(r.ck_pay_ot),
        "user_chang": r.user_chang,
        "st_in": r.st_in,
        "st_out": r.st_out,
        "st_bin": r.st_bin,
        "st_bout": r.st_bout,
        "day_food": r.day_food,
        "day_wages": r.day_wages,
        "day_food_ot": r.day_food_ot,
        "day_wages_ot": r.day_wages_ot,
        "day_food_over_ot": r.day_food_over_ot,
        "day_wages_over_ot": r.day_wages_over_ot,
        "shift_allowance": r.shift_allowance,
        "shift_ot_allowance": r.shift_ot_allowance,
        "shift_over_ot_allowance": r.shift_over_ot_allowance,
        "food_allowance": r.food_allowance,
        "food_ot_allowance": r.food_ot_allowance,
        "food_over_ot_allowance": r.food_over_ot_allowance,
        "special_ot_allowance": r.special_ot_allowance,
        "special_allowance": r.special_allowance,
        "overtime_pay_local": r.overtime_pay_local,
        "shift_pay_local": r.shift_pay_local,
        "doc_sick": bool(r.doc_sick),
        "without_pay_public_holiday": bool(r.without_pay_public_holiday),
        "day_off": bool(r.day_off),
    }
    if isinstance(r.extra_json, dict):
        for k, v in r.extra_json.items():
            if k not in out:
                out[k] = v
    return out


class AttendanceTimeDayService:
    def __init__(self, db: Session):
        self.db = db

    def _allowed_company_ids(self, user: User) -> List[int]:
        return SystemRbacService(self.db).get_user_company_ids(user.id, current_user=user)

    def _require_employee(self, employee_id: int, user: User) -> Employee:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        emp = MasterDataService(self.db).get_employee(employee_id)
        if not emp or (emp.company_id is not None and emp.company_id not in allowed):
            raise ValueError("직원을 찾을 수 없습니다.")
        return emp

    def _require_row(self, record_id: int, user: User) -> AttendanceTimeDay:
        r = self.db.query(AttendanceTimeDay).filter(AttendanceTimeDay.id == record_id).first()
        if not r:
            raise ValueError("기록을 찾을 수 없습니다.")
        self._require_employee(r.employee_id, user)
        return r

    def _merge_regular_ot_asking_into_items(
        self,
        user: User,
        items: List[Dict[str, Any]],
        date_from: Optional[date],
        date_to: Optional[date],
    ) -> None:
        """근태/OT/수당관리 조회용: `attendance_additional_ot`(Regular OT asking) 분을 oth1~oth6에 가산.

        DB `attendance_time_day` 값은 변경하지 않고 응답만 보정한다.
        """
        if not items:
            return
        allowed = self._allowed_company_ids(user)
        if not allowed:
            return
        eids = sorted({int(x["employee_id"]) for x in items if x.get("employee_id") is not None})
        if not eids:
            return

        df, dt = date_from, date_to
        if df is None or dt is None:
            wds = [w for w in (_pd(x.get("work_day")) for x in items) if w]
            if not wds:
                return
            if df is None:
                df = min(wds)
            if dt is None:
                dt = max(wds)

        q = (
            self.db.query(AttendanceAdditionalOt)
            .join(Employee, AttendanceAdditionalOt.employee_id == Employee.id)
            .filter(
                AttendanceAdditionalOt.employee_id.in_(eids),
                or_(Employee.company_id.is_(None), Employee.company_id.in_(allowed)),
            )
        )
        if df is not None:
            q = q.filter(AttendanceAdditionalOt.work_date >= df)
        if dt is not None:
            q = q.filter(AttendanceAdditionalOt.work_date <= dt)

        deltas: Dict[Tuple[int, date], Dict[str, int]] = defaultdict(lambda: {k: 0 for k in _OTH_KEYS})
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
            eid = int(r.employee_id)
            bk = _additional_ot_bucket_key(getattr(r, "ot_type", None))
            key = (eid, wd)
            deltas[key][bk] += mins

        for item in items:
            wd2 = _pd(item.get("work_day"))
            eid2 = item.get("employee_id")
            if wd2 is None or eid2 is None:
                continue
            sub = deltas.get((int(eid2), wd2))
            if not sub:
                continue
            for ok in _OTH_KEYS:
                addv = int(sub.get(ok, 0))
                if not addv:
                    continue
                cur = item.get(ok)
                base = int(cur) if cur is not None else 0
                nv = base + addv
                item[ok] = nv if nv else None

    def _apply(self, r: AttendanceTimeDay, body: Dict[str, Any], user: User) -> None:
        if "work_day" in body:
            wd = _pd(body.get("work_day"))
            if not wd:
                raise ValueError("work_day 값이 올바르지 않습니다.")
            r.work_day = wd
        for k, v in body.items():
            if k in NUM_INT_FIELDS:
                setattr(r, k, _int(v))
            elif k in NUM_FLOAT_FIELDS:
                setattr(r, k, _flt(v))
            elif k in DATETIME_FIELDS:
                setattr(r, k, _dt(v))
            elif k in BOOL_FIELDS:
                setattr(r, k, _bool(v, default=False))
            elif k in TEXT_FIELDS:
                max_len = 2000 if k in ("day_memo", "note") else (2 if k == "no_of_shift" else 200)
                setattr(r, k, _str(v, max_len))
        keep = NUM_INT_FIELDS | NUM_FLOAT_FIELDS | DATETIME_FIELDS | BOOL_FIELDS | TEXT_FIELDS | {"work_day"}
        extra = dict(r.extra_json) if isinstance(r.extra_json, dict) else {}
        for k, v in body.items():
            if k in keep or k in {"id", "employee_id"}:
                continue
            extra[k] = v
        r.extra_json = extra
        if "user_chang" not in body:
            r.user_chang = _str(getattr(user, "username", None) or str(user.id), 200)
        r.updated_at = datetime.utcnow()

    def list_for_employee(self, employee_id: int, user: User, date_from: Optional[date], date_to: Optional[date]) -> List[Dict[str, Any]]:
        self._require_employee(employee_id, user)
        q = self.db.query(AttendanceTimeDay).filter(AttendanceTimeDay.employee_id == employee_id)
        if date_from:
            q = q.filter(AttendanceTimeDay.work_day >= date_from)
        if date_to:
            q = q.filter(AttendanceTimeDay.work_day <= date_to)
        rows = q.order_by(AttendanceTimeDay.work_day.asc(), AttendanceTimeDay.row_no.asc()).all()
        items = [_row_to_dict(r) for r in rows]
        self._merge_regular_ot_asking_into_items(user, items, date_from, date_to)
        return items

    def list_all_for_period(
        self,
        user: User,
        company_id: Optional[int],
        employee_id: Optional[int],
        department: Optional[str],
        status: str,
        search: Optional[str],
        search_field: Optional[str],
        search_value: Optional[str],
        date_from: Optional[date],
        date_to: Optional[date],
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            return []

        DeptRef = aliased(EmployeeReferenceItem, name="dept_ref")
        q = (
            self.db.query(AttendanceTimeDay, Employee, DeptRef)
            .join(Employee, AttendanceTimeDay.employee_id == Employee.id)
            .outerjoin(DeptRef, DeptRef.id == Employee.department_item_id)
            .options(
                Load(Employee).load_only(
                    Employee.id,
                    Employee.employee_number,
                    Employee.name,
                    Employee.department,
                    Employee.status,
                    Employee.company_id,
                    Employee.department_item_id,
                ),
                Load(DeptRef).load_only(DeptRef.id, DeptRef.code, DeptRef.name_kor),
            )
            .filter(
                or_(
                    Employee.company_id.is_(None),
                    Employee.company_id.in_(allowed),
                )
            )
        )

        if company_id is not None:
            if company_id not in allowed:
                return []
            q = q.filter(Employee.company_id == company_id)

        if employee_id is not None:
            q = q.filter(Employee.id == int(employee_id))

        dept_kw = (department or "").strip()
        if dept_kw:
            q = q.filter(
                or_(
                    Employee.department == dept_kw,
                    DeptRef.code == dept_kw,
                    DeptRef.name_kor == dept_kw,
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
                    Employee.name.ilike(like),
                    Employee.employee_number.ilike(like),
                    Employee.department.ilike(like),
                    DeptRef.code.ilike(like),
                    DeptRef.name_kor.ilike(like),
                )
            )

        sf = (search_field or "").strip()
        sv = (search_value or "").strip()
        if sf and sv:
            like = f"%{sv}%"
            field_expr = {
                "companyName": cast(Employee.company_id, String),
                "empNo": Employee.employee_number,
                "empName": Employee.name,
                "dept": func.coalesce(DeptRef.name_kor, DeptRef.code, Employee.department),
                "workDay": cast(AttendanceTimeDay.work_day, String),
                "shift": AttendanceTimeDay.shift_code,
                "workTime": func.concat(
                    func.coalesce(AttendanceTimeDay.st_in, ""),
                    " - ",
                    func.coalesce(AttendanceTimeDay.st_out, ""),
                ),
                "timeIn": cast(AttendanceTimeDay.time_in, String),
                "timeOut": cast(AttendanceTimeDay.time_out, String),
                "late": cast(AttendanceTimeDay.late_time_in, String),
                "early": cast(AttendanceTimeDay.before_time_out, String),
                "leaveMin": cast(AttendanceTimeDay.extra_json["leave_time"].astext, String),
                "leaveWithoutPay": cast(AttendanceTimeDay.extra_json["leave_without_pay"].astext, String),
                "absentMin": cast(AttendanceTimeDay.extra_json["absent_time"].astext, String),
                "workDayFrac": cast(AttendanceTimeDay.extra_json["work_day_count"].astext, String),
                "oth1": cast(AttendanceTimeDay.oth1, String),
                "oth2": cast(AttendanceTimeDay.oth2, String),
                "oth3": cast(AttendanceTimeDay.oth3, String),
                "oth4": cast(AttendanceTimeDay.oth4, String),
                "oth5": cast(AttendanceTimeDay.oth5, String),
                "oth6": cast(AttendanceTimeDay.oth6, String),
                "othb": cast(AttendanceTimeDay.othb, String),
            }.get(sf)
            if field_expr is not None:
                q = q.filter(field_expr.ilike(like))

        if date_from:
            q = q.filter(AttendanceTimeDay.work_day >= date_from)
        if date_to:
            q = q.filter(AttendanceTimeDay.work_day <= date_to)

        total = int(q.count())
        safe_page = max(1, int(page or 1))
        safe_page_size = max(1, min(int(page_size or 50), 1000))
        offset = (safe_page - 1) * safe_page_size
        rows = (
            q.order_by(
                AttendanceTimeDay.work_day.asc(),
                AttendanceTimeDay.row_no.asc(),
                AttendanceTimeDay.id.asc(),
            )
            .offset(offset)
            .limit(safe_page_size)
            .all()
        )
        out: List[Dict[str, Any]] = []
        for r, e, dept_ref in rows:
            item = _row_to_dict(r)
            item["employee_number"] = e.employee_number
            item["employee_name"] = e.name
            dept_code = (dept_ref.code or "").strip() if dept_ref is not None else ""
            item["employee_department"] = dept_code or (e.department and str(e.department).strip()) or None
            item["employee_status"] = e.status or "active"
            item["company_id"] = e.company_id
            out.append(item)
        self._merge_regular_ot_asking_into_items(user, out, date_from, date_to)
        return {"items": out, "total": total, "page": safe_page, "page_size": safe_page_size}

    def _scope_time_day_rows_for_report(
        self,
        user: User,
        company_id: Optional[int],
        employee_id: Optional[int],
        department: Optional[str],
        status: str,
        search: Optional[str],
        search_field: Optional[str],
        search_value: Optional[str],
        date_from: Optional[date],
        date_to: Optional[date],
    ):
        """attendance_time_day 행만 조회하는 기본 쿼리(집계·회사명·부서 표시용 조인)."""
        allowed = self._allowed_company_ids(user)
        if not allowed:
            return None

        DeptRef = aliased(EmployeeReferenceItem, name="dept_ref")
        Co = aliased(Company, name="rep_co")
        q = (
            self.db.query(AttendanceTimeDay)
            .join(Employee, AttendanceTimeDay.employee_id == Employee.id)
            .outerjoin(DeptRef, DeptRef.id == Employee.department_item_id)
            .outerjoin(Co, Co.id == Employee.company_id)
            .filter(
                or_(
                    Employee.company_id.is_(None),
                    Employee.company_id.in_(allowed),
                )
            )
        )

        if company_id is not None:
            if company_id not in allowed:
                return None
            q = q.filter(Employee.company_id == company_id)

        if employee_id is not None:
            q = q.filter(Employee.id == int(employee_id))

        dept_kw = (department or "").strip()
        if dept_kw:
            q = q.filter(
                or_(
                    Employee.department == dept_kw,
                    DeptRef.code == dept_kw,
                    DeptRef.name_kor == dept_kw,
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
                    Employee.name.ilike(like),
                    Employee.employee_number.ilike(like),
                    Employee.department.ilike(like),
                    DeptRef.code.ilike(like),
                    DeptRef.name_kor.ilike(like),
                )
            )

        sf = (search_field or "").strip()
        sv = (search_value or "").strip()
        if sf and sv:
            like = f"%{sv}%"
            field_expr = {
                "companyName": cast(Employee.company_id, String),
                "empNo": Employee.employee_number,
                "empName": Employee.name,
                "dept": func.coalesce(DeptRef.name_kor, DeptRef.code, Employee.department),
                "workDay": cast(AttendanceTimeDay.work_day, String),
                "shift": AttendanceTimeDay.shift_code,
                "workTime": func.concat(
                    func.coalesce(AttendanceTimeDay.st_in, ""),
                    " - ",
                    func.coalesce(AttendanceTimeDay.st_out, ""),
                ),
                "timeIn": cast(AttendanceTimeDay.time_in, String),
                "timeOut": cast(AttendanceTimeDay.time_out, String),
                "late": cast(AttendanceTimeDay.late_time_in, String),
                "early": cast(AttendanceTimeDay.before_time_out, String),
                "leaveMin": cast(AttendanceTimeDay.extra_json["leave_time"].astext, String),
                "leaveWithoutPay": cast(AttendanceTimeDay.extra_json["leave_without_pay"].astext, String),
                "absentMin": cast(AttendanceTimeDay.extra_json["absent_time"].astext, String),
                "workDayFrac": cast(AttendanceTimeDay.extra_json["work_day_count"].astext, String),
                "oth1": cast(AttendanceTimeDay.oth1, String),
                "oth2": cast(AttendanceTimeDay.oth2, String),
                "oth3": cast(AttendanceTimeDay.oth3, String),
                "oth4": cast(AttendanceTimeDay.oth4, String),
                "oth5": cast(AttendanceTimeDay.oth5, String),
                "oth6": cast(AttendanceTimeDay.oth6, String),
                "othb": cast(AttendanceTimeDay.othb, String),
            }.get(sf)
            if field_expr is not None:
                q = q.filter(field_expr.ilike(like))

        if date_from:
            q = q.filter(AttendanceTimeDay.work_day >= date_from)
        if date_to:
            q = q.filter(AttendanceTimeDay.work_day <= date_to)

        return q, DeptRef, Co

    def ot_allowance_report_summary(
        self,
        user: User,
        company_id: Optional[int],
        employee_id: Optional[int],
        department: Optional[str],
        status: str,
        search: Optional[str],
        search_field: Optional[str],
        search_value: Optional[str],
        date_from: Optional[date],
        date_to: Optional[date],
    ) -> Dict[str, Any]:
        """근태/OT/수당 집계(`attendance_time_day`) 기준 기간 요약 — 직원별·부서별·OT구간 합계."""
        scoped = self._scope_time_day_rows_for_report(
            user,
            company_id=company_id,
            employee_id=employee_id,
            department=department,
            status=status,
            search=search,
            search_field=search_field,
            search_value=search_value,
            date_from=date_from,
            date_to=date_to,
        )
        empty: Dict[str, Any] = {
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "source_row_count": 0,
            "by_department": [],
            "ot_buckets": {
                "oth1": 0,
                "oth2": 0,
                "oth3": 0,
                "oth4": 0,
                "oth5": 0,
                "oth6": 0,
                "othb": 0.0,
            },
            "units": {
                "ot_minutes": "minutes",
                "ot_baht": "baht",
                "allowance": "currency",
            },
        }
        if scoped is None:
            return empty

        def _dept_co_exprs(DeptRef, Co):
            dd = func.coalesce(DeptRef.name_kor, DeptRef.code, Employee.department, "")
            cn = func.coalesce(Co.name_kor, Co.name_eng, Co.name_thai, Co.company_code, "")
            return dd, cn

        def _sum_float(col):
            return func.sum(func.coalesce(col, 0.0))

        def _sum_int(col):
            return func.sum(func.coalesce(col, 0))

        ej = AttendanceTimeDay.extra_json
        fuel_x = cast(ej["fuel_allowance"].astext, SAFloat)
        stand_x = cast(ej["standing_allowance"].astext, SAFloat)
        other_x = cast(ej["other_allowance"].astext, SAFloat)

        sum_entities = (
            _sum_int(AttendanceTimeDay.oth1),
            _sum_int(AttendanceTimeDay.oth2),
            _sum_int(AttendanceTimeDay.oth3),
            _sum_int(AttendanceTimeDay.oth4),
            _sum_int(AttendanceTimeDay.oth5),
            _sum_int(AttendanceTimeDay.oth6),
            _sum_float(AttendanceTimeDay.othb),
            _sum_float(AttendanceTimeDay.shift_allowance),
            _sum_float(AttendanceTimeDay.shift_ot_allowance),
            _sum_float(AttendanceTimeDay.shift_over_ot_allowance),
            _sum_float(AttendanceTimeDay.food_allowance),
            _sum_float(AttendanceTimeDay.food_ot_allowance),
            _sum_float(AttendanceTimeDay.food_over_ot_allowance),
            _sum_float(AttendanceTimeDay.special_ot_allowance),
            _sum_float(AttendanceTimeDay.special_allowance),
            _sum_float(AttendanceTimeDay.overtime_pay_local),
            _sum_float(AttendanceTimeDay.shift_pay_local),
            _sum_float(AttendanceTimeDay.day_food),
            _sum_float(AttendanceTimeDay.day_wages),
            _sum_float(AttendanceTimeDay.day_food_ot),
            _sum_float(AttendanceTimeDay.day_wages_ot),
            func.sum(func.coalesce(fuel_x, 0.0)),
            func.sum(func.coalesce(stand_x, 0.0)),
            func.sum(func.coalesce(other_x, 0.0)),
        )

        q_cnt = self._scope_time_day_rows_for_report(
            user,
            company_id=company_id,
            employee_id=employee_id,
            department=department,
            status=status,
            search=search,
            search_field=search_field,
            search_value=search_value,
            date_from=date_from,
            date_to=date_to,
        )
        source_row_count = int(q_cnt[0].count()) if q_cnt else 0

        q_ot = self._scope_time_day_rows_for_report(
            user,
            company_id=company_id,
            employee_id=employee_id,
            department=department,
            status=status,
            search=search,
            search_field=search_field,
            search_value=search_value,
            date_from=date_from,
            date_to=date_to,
        )
        ot_row = q_ot[0].with_entities(*sum_entities[:7]).one()
        ot_buckets = {
            "oth1": int(ot_row[0] or 0),
            "oth2": int(ot_row[1] or 0),
            "oth3": int(ot_row[2] or 0),
            "oth4": int(ot_row[3] or 0),
            "oth5": int(ot_row[4] or 0),
            "oth6": int(ot_row[5] or 0),
            "othb": float(ot_row[6] or 0),
        }

        sum_entities_dept = sum_entities[:6] + sum_entities[7:]

        q_dep = self._scope_time_day_rows_for_report(
            user,
            company_id=company_id,
            employee_id=employee_id,
            department=department,
            status=status,
            search=search,
            search_field=search_field,
            search_value=search_value,
            date_from=date_from,
            date_to=date_to,
        )
        q_dep, DeptRef_d, Co_d = q_dep
        dept_d, company_d = _dept_co_exprs(DeptRef_d, Co_d)
        dept_rows = (
            q_dep.with_entities(
                Employee.company_id.label("company_id"),
                func.max(company_d).label("company_name"),
                dept_d.label("department"),
                func.count(AttendanceTimeDay.id).label("day_rows"),
                *sum_entities_dept,
            )
            .group_by(Employee.company_id, dept_d)
            .order_by(Employee.company_id.nullsfirst(), dept_d)
            .all()
        )

        def _pack_row(r, offset: int) -> Dict[str, Any]:
            """with_entities 결과 튜플: 메타 컬럼 뒤에 sum_entities 순서(othb 포함)."""
            return {
                "day_rows": int(r[offset] or 0),
                "oth1": int(r[offset + 1] or 0),
                "oth2": int(r[offset + 2] or 0),
                "oth3": int(r[offset + 3] or 0),
                "oth4": int(r[offset + 4] or 0),
                "oth5": int(r[offset + 5] or 0),
                "oth6": int(r[offset + 6] or 0),
                "othb": float(r[offset + 7] or 0),
                "shift_allowance": float(r[offset + 8] or 0),
                "shift_ot_allowance": float(r[offset + 9] or 0),
                "shift_over_ot_allowance": float(r[offset + 10] or 0),
                "food_allowance": float(r[offset + 11] or 0),
                "food_ot_allowance": float(r[offset + 12] or 0),
                "food_over_ot_allowance": float(r[offset + 13] or 0),
                "special_ot_allowance": float(r[offset + 14] or 0),
                "special_allowance": float(r[offset + 15] or 0),
                "overtime_pay_local": float(r[offset + 16] or 0),
                "shift_pay_local": float(r[offset + 17] or 0),
                "day_food": float(r[offset + 18] or 0),
                "day_wages": float(r[offset + 19] or 0),
                "day_food_ot": float(r[offset + 20] or 0),
                "day_wages_ot": float(r[offset + 21] or 0),
                "fuel_allowance": float(r[offset + 22] or 0),
                "standing_allowance": float(r[offset + 23] or 0),
                "other_allowance": float(r[offset + 24] or 0),
            }

        def _pack_dept_row(r, offset: int) -> Dict[str, Any]:
            """부서별: othb 제외(oth1~6 다음 곧바로 수당)."""
            return {
                "day_rows": int(r[offset] or 0),
                "oth1": int(r[offset + 1] or 0),
                "oth2": int(r[offset + 2] or 0),
                "oth3": int(r[offset + 3] or 0),
                "oth4": int(r[offset + 4] or 0),
                "oth5": int(r[offset + 5] or 0),
                "oth6": int(r[offset + 6] or 0),
                "shift_allowance": float(r[offset + 7] or 0),
                "shift_ot_allowance": float(r[offset + 8] or 0),
                "shift_over_ot_allowance": float(r[offset + 9] or 0),
                "food_allowance": float(r[offset + 10] or 0),
                "food_ot_allowance": float(r[offset + 11] or 0),
                "food_over_ot_allowance": float(r[offset + 12] or 0),
                "special_ot_allowance": float(r[offset + 13] or 0),
                "special_allowance": float(r[offset + 14] or 0),
                "overtime_pay_local": float(r[offset + 15] or 0),
                "shift_pay_local": float(r[offset + 16] or 0),
                "day_food": float(r[offset + 17] or 0),
                "day_wages": float(r[offset + 18] or 0),
                "day_food_ot": float(r[offset + 19] or 0),
                "day_wages_ot": float(r[offset + 20] or 0),
                "fuel_allowance": float(r[offset + 21] or 0),
                "standing_allowance": float(r[offset + 22] or 0),
                "other_allowance": float(r[offset + 23] or 0),
            }

        by_department: List[Dict[str, Any]] = []
        for r in dept_rows:
            item = {
                "company_id": int(r[0]) if r[0] is not None else None,
                "company_name": str(r[1] or ""),
                "department": str(r[2] or ""),
            }
            item.update(_pack_dept_row(r, 3))
            by_department.append(item)

        return {
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "source_row_count": source_row_count,
            "by_department": by_department,
            "ot_buckets": ot_buckets,
            "units": {
                "ot_minutes": "minutes",
                "ot_baht": "baht",
                "allowance": "currency",
            },
        }

    def ot_allowance_report_trends(
        self,
        user: User,
        company_id: Optional[int],
        employee_id: Optional[int],
        department: Optional[str],
        status: str,
        search: Optional[str],
        search_field: Optional[str],
        search_value: Optional[str],
        date_from: Optional[date],
        date_to: Optional[date],
    ) -> Dict[str, Any]:
        """필터 범위 내 OT·OT금액 추이 — 일별·월별 (`attendance_time_day.work_day` 기준)."""
        scoped = self._scope_time_day_rows_for_report(
            user,
            company_id=company_id,
            employee_id=employee_id,
            department=department,
            status=status,
            search=search,
            search_field=search_field,
            search_value=search_value,
            date_from=date_from,
            date_to=date_to,
        )
        if scoped is None:
            return {"by_day": [], "by_month": []}

        def _sum_float(col):
            return func.sum(func.coalesce(col, 0.0))

        def _sum_int(col):
            return func.sum(func.coalesce(col, 0))

        q = scoped[0]
        day_entities = (
            AttendanceTimeDay.work_day.label("work_day"),
            _sum_int(AttendanceTimeDay.oth1),
            _sum_int(AttendanceTimeDay.oth2),
            _sum_int(AttendanceTimeDay.oth3),
            _sum_int(AttendanceTimeDay.oth4),
            _sum_int(AttendanceTimeDay.oth5),
            _sum_int(AttendanceTimeDay.oth6),
            _sum_float(AttendanceTimeDay.othb),
        )
        day_rows = q.with_entities(*day_entities).group_by(AttendanceTimeDay.work_day).order_by(AttendanceTimeDay.work_day.asc()).all()

        ym_expr = func.to_char(AttendanceTimeDay.work_day, "YYYY-MM")
        month_entities = (
            ym_expr.label("ym"),
            _sum_int(AttendanceTimeDay.oth1),
            _sum_int(AttendanceTimeDay.oth2),
            _sum_int(AttendanceTimeDay.oth3),
            _sum_int(AttendanceTimeDay.oth4),
            _sum_int(AttendanceTimeDay.oth5),
            _sum_int(AttendanceTimeDay.oth6),
            _sum_float(AttendanceTimeDay.othb),
        )
        month_rows = q.with_entities(*month_entities).group_by(ym_expr).order_by(ym_expr.asc()).all()

        def _pack_trend_row(r, date_key: str) -> Dict[str, Any]:
            key_val = r[0]
            if date_key == "work_day" and key_val is not None:
                if hasattr(key_val, "isoformat"):
                    dk = key_val.isoformat()
                else:
                    dk = str(key_val)[:10]
            else:
                dk = str(key_val or "")
            o1 = int(r[1] or 0)
            o2 = int(r[2] or 0)
            o3 = int(r[3] or 0)
            o4 = int(r[4] or 0)
            o5 = int(r[5] or 0)
            o6 = int(r[6] or 0)
            ob = float(r[7] or 0)
            return {
                date_key: dk,
                "oth1": o1,
                "oth2": o2,
                "oth3": o3,
                "oth4": o4,
                "oth5": o5,
                "oth6": o6,
                "total_ot_minutes": o1 + o2 + o3 + o4 + o5 + o6,
                "othb": ob,
            }

        by_day = [_pack_trend_row(row, "work_day") for row in day_rows]
        by_month = [_pack_trend_row(row, "year_month") for row in month_rows]

        return {"by_day": by_day, "by_month": by_month}

    def upsert_employee_day_row(
        self, employee_id: int, user: User, work_day: date, body: Dict[str, Any]
    ) -> AttendanceTimeDay:
        """커밋 없이 일별 행만 갱신·생성(일괄 집계용)."""
        emp = self._require_employee(employee_id, user)
        body = {**body, "work_day": work_day.isoformat()}
        existing = (
            self.db.query(AttendanceTimeDay)
            .filter(AttendanceTimeDay.employee_id == emp.id, AttendanceTimeDay.work_day == work_day)
            .first()
        )
        now = datetime.utcnow()
        if existing:
            self._apply(existing, body, user)
            return existing
        r = AttendanceTimeDay(employee_id=emp.id, work_day=work_day, created_at=now, updated_at=now)
        self._apply(r, body, user)
        self.db.add(r)
        return r

    def create(self, employee_id: int, user: User, body: Dict[str, Any]) -> Dict[str, Any]:
        emp = self._require_employee(employee_id, user)
        wd = _pd(body.get("work_day"))
        if not wd:
            raise ValueError("work_day는 필수입니다.")
        existing = self.db.query(AttendanceTimeDay).filter(
            AttendanceTimeDay.employee_id == emp.id,
            AttendanceTimeDay.work_day == wd,
        ).first()
        if existing:
            self._apply(existing, body, user)
            self.db.commit()
            self.db.refresh(existing)
            return _row_to_dict(existing)
        now = datetime.utcnow()
        r = AttendanceTimeDay(employee_id=emp.id, work_day=wd, created_at=now, updated_at=now)
        self._apply(r, body, user)
        self.db.add(r)
        self.db.commit()
        self.db.refresh(r)
        return _row_to_dict(r)

    def update(self, record_id: int, user: User, body: Dict[str, Any]) -> Dict[str, Any]:
        r = self._require_row(record_id, user)
        self._apply(r, body, user)
        self.db.commit()
        self.db.refresh(r)
        return _row_to_dict(r)

    def delete(self, record_id: int, user: User) -> None:
        r = self._require_row(record_id, user)
        self.db.delete(r)
        self.db.commit()
