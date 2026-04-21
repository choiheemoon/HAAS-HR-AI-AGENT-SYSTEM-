"""근태 조회(타각) CRUD."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import func, or_, tuple_
from sqlalchemy.orm import Session, selectinload

from app.models.attendance_standard import AttendanceShiftGroupMaster, AttendanceWorkCalendar
from app.models.company import Company
from app.models.attendance_time_day import AttendanceTimeDay
from app.models.attendance_time_in_out import AttendanceTimeInOut
from app.models.employee import Employee
from app.models.employee_attendance_master import EmployeeAttendanceMaster, EmployeeAttendanceMasterBasic
from app.models.user import User
from app.services.attendance_period_lock_service import AttendancePeriodLockService
from app.services.master_data.master_data_service import MasterDataService
from app.services.system_rbac_service import SystemRbacService

PAYROLL_MASTER_CLOSED_MSG = "급여마스터집계의 마감으로 추가, 수정할수 없습니다."


def _d(v: Optional[date]) -> Optional[str]:
    return v.isoformat() if v else None


def _dt(v: Any) -> Optional[datetime]:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v
    s = str(v).strip()
    if not s:
        return None
    try:
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            y, m, d = s.split("-")
            return datetime(int(y), int(m), int(d))
        return datetime.fromisoformat(s.replace("Z", "+00:00").replace("+00:00", ""))
    except Exception:
        return None


def _str(v: Any, max_len: int) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    return s[:max_len]


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


def _id_sin_out(v: Any, default: int = 2) -> int:
    """
    ID_SInOut 규칙:
    - 단말기 자동 등록: 1
    - 수기 등록: 2 (기본)
    """
    n = _int(v)
    if n in (1, 2, 3):
        return int(n)
    return default


def _parse_dat_punch_datetime(date_raw: str, time_raw: str) -> Optional[datetime]:
    d = (date_raw or "").strip()
    t = (time_raw or "").strip()
    if not d or not t:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y%m%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y%m%d %H:%M"):
        try:
            return datetime.strptime(f"{d} {t}", fmt)
        except Exception:
            continue
    return None


def _punch_local_date(r: AttendanceTimeInOut) -> Optional[date]:
    dt = r.date_in_out or r.date_i
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.date()
    return None


def _row_to_dict(r: AttendanceTimeInOut) -> Dict[str, Any]:
    return {
        "id_time_in_out": int(r.id_time_in_out),
        "company_id": r.company_id,
        "employee_id": r.employee_id,
        "id_card": r.id_card,
        "date_i": r.date_i.isoformat() if r.date_i else None,
        "date_in_out": r.date_in_out.isoformat() if r.date_in_out else None,
        "id_sin_out": r.id_sin_out,
        "user_change": r.user_change,
        "machine_no": r.machine_no,
        "location": r.location,
        "add_memo": r.add_memo,
        "status_del": bool(r.status_del),
        "id_time_in_out_approve": int(r.id_time_in_out_approve) if r.id_time_in_out_approve is not None else None,
        "sync_status": r.sync_status,
        "memo_": r.memo_,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


class AttendanceTimeInOutService:
    def __init__(self, db: Session):
        self.db = db

    def _enrich_overview_shift_fields(
        self,
        items: List[Dict[str, Any]],
        row_pairs: List[Tuple[AttendanceTimeInOut, Employee]],
    ) -> None:
        """출/퇴근현황용: 직원 근태마스터 근무조명 + 해당일 교대(일별근태 우선, 없으면 근무달력)."""
        if not items or len(items) != len(row_pairs):
            return

        pairs: List[Tuple[int, date]] = []
        for r, e in row_pairs:
            d = _punch_local_date(r)
            if d and e.id:
                pairs.append((e.id, d))
        uniq_pairs: List[Tuple[int, date]] = list(dict.fromkeys(pairs))
        td_map: Dict[Tuple[int, date], AttendanceTimeDay] = {}
        if uniq_pairs:
            chunk = 400
            for i in range(0, len(uniq_pairs), chunk):
                part = uniq_pairs[i : i + chunk]
                for td in (
                    self.db.query(AttendanceTimeDay)
                    .filter(tuple_(AttendanceTimeDay.employee_id, AttendanceTimeDay.work_day).in_(part))
                    .all()
                ):
                    td_map[(td.employee_id, td.work_day)] = td

        emp_ids = list({e.id for _, e in row_pairs if e.id})
        master_map: Dict[int, Tuple[Optional[int], Optional[str]]] = {}
        if emp_ids:
            mast_rows = (
                self.db.query(
                    EmployeeAttendanceMaster.employee_id,
                    EmployeeAttendanceMasterBasic.master_shiftwork_id,
                    EmployeeAttendanceMasterBasic.master_shiftwork,
                )
                .select_from(EmployeeAttendanceMaster)
                .join(
                    EmployeeAttendanceMasterBasic,
                    EmployeeAttendanceMasterBasic.master_id == EmployeeAttendanceMaster.id,
                )
                .filter(EmployeeAttendanceMaster.employee_id.in_(emp_ids))
                .all()
            )
            for m in mast_rows:
                master_map[int(m.employee_id)] = (m.master_shiftwork_id, m.master_shiftwork)

        group_name_by_id: Dict[int, str] = {}
        gids = {int(mid) for mid, _ in master_map.values() if mid is not None}
        if gids:
            for g in self.db.query(AttendanceShiftGroupMaster).filter(AttendanceShiftGroupMaster.id.in_(gids)).all():
                group_name_by_id[int(g.id)] = (g.name or "").strip() or str(g.id)

        month_keys: List[Tuple[int, int, int]] = []
        seen_m = set()
        for r, e in row_pairs:
            d = _punch_local_date(r)
            cid = r.company_id if r.company_id is not None else e.company_id
            if d and cid:
                key = (int(cid), d.year, d.month)
                if key not in seen_m:
                    seen_m.add(key)
                    month_keys.append(key)

        cal_by_month: Dict[Tuple[int, int, int], List[AttendanceWorkCalendar]] = defaultdict(list)
        if month_keys:
            cals = (
                self.db.query(AttendanceWorkCalendar)
                .options(selectinload(AttendanceWorkCalendar.days))
                .filter(
                    tuple_(
                        AttendanceWorkCalendar.company_id,
                        AttendanceWorkCalendar.calendar_year,
                        AttendanceWorkCalendar.calendar_month,
                    ).in_(month_keys)
                )
                .all()
            )
            for c in cals:
                cal_by_month[(int(c.company_id), int(c.calendar_year), int(c.calendar_month))].append(c)

        def shift_group_label(emp_id: int) -> Optional[str]:
            mid, legacy = master_map.get(emp_id, (None, None))
            leg = (legacy or "").strip()
            if mid is not None and int(mid) in group_name_by_id:
                return group_name_by_id[int(mid)]
            return leg or None

        def calendar_shift_code(
            company_id: int,
            punch_d: date,
            shift_group_id: Optional[int],
            shift_group_name_legacy: Optional[str],
        ) -> Optional[str]:
            cals = cal_by_month.get((company_id, punch_d.year, punch_d.month), [])
            cal: Optional[AttendanceWorkCalendar] = None
            if shift_group_id is not None:
                sid = int(shift_group_id)
                for c in cals:
                    if int(c.shift_group_id) == sid:
                        cal = c
                        break
            if cal is None and shift_group_name_legacy:
                want = shift_group_name_legacy.strip()
                for c in cals:
                    if (c.shift_group_name or "").strip() == want:
                        cal = c
                        break
            if cal is None:
                return None
            day = next((x for x in cal.days if int(x.day_of_month) == punch_d.day), None)
            sc = day.shift_code if day else None
            s = (sc or "").strip()
            return s or None

        for item, (r, e) in zip(items, row_pairs):
            emp_id = int(e.id) if e.id else 0
            punch_d = _punch_local_date(r)
            cid = r.company_id if r.company_id is not None else e.company_id
            mid, legacy = master_map.get(emp_id, (None, None))
            item["shift_group_name"] = shift_group_label(emp_id) if emp_id else None

            time_day_shift: Optional[str] = None
            if emp_id and punch_d:
                td = td_map.get((emp_id, punch_d))
                if td and (td.shift_code or "").strip():
                    time_day_shift = (td.shift_code or "").strip()

            sched: Optional[str] = None
            if time_day_shift:
                sched = time_day_shift
            elif cid and punch_d:
                sched = calendar_shift_code(int(cid), punch_d, mid, legacy)
            item["shift_work_code"] = sched

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

    def _assert_not_payroll_master_closed(self, company_id: Optional[int], punch_dt: Optional[datetime]) -> None:
        if company_id is None or punch_dt is None:
            return
        if AttendancePeriodLockService(self.db).is_day_closed(int(company_id), punch_dt.date()):
            raise ValueError(PAYROLL_MASTER_CLOSED_MSG)

    def list_for_employee(
        self,
        employee_id: int,
        user: User,
        date_from: Optional[date],
        date_to: Optional[date],
    ) -> List[Dict[str, Any]]:
        emp = self._require_employee(employee_id, user)
        q = self.db.query(AttendanceTimeInOut).filter(
            AttendanceTimeInOut.status_del.is_(False),
            AttendanceTimeInOut.employee_id == employee_id,
        )
        coalesced = func.coalesce(AttendanceTimeInOut.date_in_out, AttendanceTimeInOut.date_i)
        if date_from:
            start = datetime(date_from.year, date_from.month, date_from.day)
            q = q.filter(coalesced >= start)
        if date_to:
            end = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, 999999)
            q = q.filter(coalesced <= end)
        rows = q.order_by(
            AttendanceTimeInOut.date_in_out.desc(),
            AttendanceTimeInOut.date_i.desc(),
            AttendanceTimeInOut.id_time_in_out.desc(),
        ).all()
        return [_row_to_dict(r) for r in rows]

    def list_all_for_period(
        self,
        user: User,
        company_id: Optional[int],
        status: str,
        search: Optional[str],
        date_from: Optional[date],
        date_to: Optional[date],
        limit: int = 5000,
    ) -> List[Dict[str, Any]]:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            return []

        q = (
            self.db.query(AttendanceTimeInOut, Employee)
            .join(Employee, AttendanceTimeInOut.employee_id == Employee.id)
            .filter(AttendanceTimeInOut.status_del.is_(False))
            .filter(
                or_(
                    AttendanceTimeInOut.company_id.is_(None),
                    AttendanceTimeInOut.company_id.in_(allowed),
                )
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
            q = q.filter(
                or_(
                    AttendanceTimeInOut.company_id == company_id,
                    Employee.company_id == company_id,
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
                )
            )

        coalesced = func.coalesce(AttendanceTimeInOut.date_in_out, AttendanceTimeInOut.date_i)
        if date_from:
            start = datetime(date_from.year, date_from.month, date_from.day)
            q = q.filter(coalesced >= start)
        if date_to:
            end = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, 999999)
            q = q.filter(coalesced <= end)

        rows = (
            q.order_by(
                coalesced.desc(),
                AttendanceTimeInOut.id_time_in_out.desc(),
            )
            .limit(max(1, min(int(limit or 5000), 20000)))
            .all()
        )
        out: List[Dict[str, Any]] = []
        for r, e in rows:
            item = _row_to_dict(r)
            item["employee_number"] = e.employee_number
            item["employee_name"] = e.name
            item["employee_department"] = e.department
            item["employee_status"] = e.status or "active"
            out.append(item)
        self._enrich_overview_shift_fields(out, rows)
        return out

    def create(self, employee_id: int, user: User, body: Dict[str, Any]) -> Dict[str, Any]:
        emp = self._require_employee(employee_id, user)
        punch_dt = _dt(body.get("date_in_out")) or _dt(body.get("date_i"))
        self._assert_not_payroll_master_closed(emp.company_id, punch_dt)
        now = datetime.utcnow()
        # 기본은 수기 등록(2). 자동 등록 플래그가 오면 1로 저장.
        default_id_sin_out = 1 if _bool(body.get("is_auto"), False) else 2
        r = AttendanceTimeInOut(
            company_id=emp.company_id,
            employee_id=emp.id,
            id_card=_str(body.get("id_card"), 20) or (_str(emp.swipe_card, 20) if emp.swipe_card else None),
            date_i=_dt(body.get("date_i")),
            date_in_out=_dt(body.get("date_in_out")),
            id_sin_out=_id_sin_out(body.get("id_sin_out"), default=default_id_sin_out),
            user_change=_str(getattr(user, "username", None) or str(user.id), 100),
            machine_no=_str(body.get("machine_no"), 20),
            location=_str(body.get("location"), 255),
            add_memo=_str(body.get("add_memo"), 200),
            status_del=False,
            id_time_in_out_approve=_int(body.get("id_time_in_out_approve")),
            sync_status=_str(body.get("sync_status"), 1),
            memo_=_str(body.get("memo_"), 250),
            created_at=now,
            updated_at=now,
        )
        self.db.add(r)
        self.db.commit()
        self.db.refresh(r)
        return _row_to_dict(r)

    def update(self, record_id: int, user: User, body: Dict[str, Any]) -> Dict[str, Any]:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        r = self.db.query(AttendanceTimeInOut).filter(AttendanceTimeInOut.id_time_in_out == record_id).first()
        if not r or r.status_del:
            raise ValueError("기록을 찾을 수 없습니다.")
        if r.company_id is not None and r.company_id not in allowed:
            raise ValueError("기록을 찾을 수 없습니다.")
        punch_dt = _dt(body.get("date_in_out")) if "date_in_out" in body else None
        if punch_dt is None and "date_i" in body:
            punch_dt = _dt(body.get("date_i"))
        if punch_dt is None:
            punch_dt = r.date_in_out or r.date_i
        self._assert_not_payroll_master_closed(r.company_id, punch_dt)
        if "id_card" in body:
            r.id_card = _str(body.get("id_card"), 20)
        if "date_i" in body:
            r.date_i = _dt(body.get("date_i"))
        if "date_in_out" in body:
            r.date_in_out = _dt(body.get("date_in_out"))
        if "id_sin_out" in body:
            r.id_sin_out = _id_sin_out(body.get("id_sin_out"), default=2)
        if "machine_no" in body:
            r.machine_no = _str(body.get("machine_no"), 20)
        if "location" in body:
            r.location = _str(body.get("location"), 255)
        if "add_memo" in body:
            r.add_memo = _str(body.get("add_memo"), 200)
        if "id_time_in_out_approve" in body:
            r.id_time_in_out_approve = _int(body.get("id_time_in_out_approve"))
        if "sync_status" in body:
            r.sync_status = _str(body.get("sync_status"), 1)
        if "memo_" in body:
            r.memo_ = _str(body.get("memo_"), 250)
        r.user_change = _str(getattr(user, "username", None) or str(user.id), 100)
        r.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(r)
        return _row_to_dict(r)

    def soft_delete(self, record_id: int, user: User) -> None:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        r = self.db.query(AttendanceTimeInOut).filter(AttendanceTimeInOut.id_time_in_out == record_id).first()
        if not r:
            raise ValueError("기록을 찾을 수 없습니다.")
        if r.company_id is not None and r.company_id not in allowed:
            raise ValueError("기록을 찾을 수 없습니다.")
        punch_dt = r.date_in_out or r.date_i
        if r.company_id is not None and punch_dt is not None:
            AttendancePeriodLockService(self.db).assert_day_not_closed(int(r.company_id), punch_dt.date())
        r.status_del = True
        r.user_change = _str(getattr(user, "username", None) or str(user.id), 100)
        r.updated_at = datetime.utcnow()
        self.db.commit()

    def bulk_import_dat_file(
        self,
        *,
        user: User,
        filename: str,
        file_bytes: bytes,
        company_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        if company_id is not None and company_id not in allowed:
            raise ValueError("회사를 찾을 수 없습니다.")

        text: Optional[str] = None
        for enc in ("utf-8-sig", "utf-8", "cp949", "euc-kr", "latin-1"):
            try:
                text = file_bytes.decode(enc)
                break
            except Exception:
                continue
        if text is None:
            raise ValueError("파일 인코딩을 해석할 수 없습니다.")

        company_name_by_id: Dict[int, str] = {}
        for c in self.db.query(Company).filter(Company.id.in_(allowed)).all():
            cid = int(c.id)
            cname = (c.name_kor or c.name_eng or c.name_thai or c.company_code or str(cid)).strip()
            company_name_by_id[cid] = cname

        emq = self.db.query(Employee).filter(or_(Employee.company_id.is_(None), Employee.company_id.in_(allowed)))
        if company_id is not None:
            emq = emq.filter(Employee.company_id == int(company_id))
        employees = emq.all()
        card_to_emps: Dict[str, List[Employee]] = defaultdict(list)
        for e in employees:
            card = str(getattr(e, "swipe_card", "") or "").strip()
            if not card:
                continue
            card_to_emps[card].append(e)

        card_to_emp: Dict[str, Employee] = {}
        ambiguous_card_to_emps: Dict[str, List[Employee]] = {}
        for card, emps in card_to_emps.items():
            if len(emps) == 1:
                card_to_emp[card] = emps[0]
                continue
            ambiguous_card_to_emps[card] = sorted(
                emps,
                key=lambda x: ((x.employee_number or ""), int(x.id or 0)),
            )

        parsed: List[Tuple[str, datetime]] = []
        malformed = 0
        for ln in text.splitlines():
            row = (ln or "").strip()
            if not row:
                continue
            parts = row.split()
            if len(parts) < 3:
                malformed += 1
                continue
            card_no = parts[0].strip()
            if not card_no:
                malformed += 1
                continue
            punch_dt = _parse_dat_punch_datetime(parts[1], parts[2])
            if punch_dt is None:
                malformed += 1
                continue
            parsed.append((card_no, punch_dt))

        if not parsed:
            return {
                "ok": True,
                "filename": filename,
                "parsed_rows": 0,
                "inserted": 0,
                "skipped_unknown_card": 0,
                "skipped_ambiguous_card": 0,
                "skipped_duplicate": 0,
                "malformed_rows": malformed,
                "unknown_cards_sample": [],
                "ambiguous_cards_sample": [],
                "mapped_cards_sample": [],
            }

        # dedupe keys from DB first to avoid duplicate punches on repeated upload
        emp_ids = sorted({int(e.id) for _, e in card_to_emp.items() if e.id})
        dt_min = min(dt for _, dt in parsed)
        dt_max = max(dt for _, dt in parsed)
        existing_keys: Set[Tuple[int, datetime]] = set()
        if emp_ids:
            ex_rows = (
                self.db.query(AttendanceTimeInOut.employee_id, AttendanceTimeInOut.date_in_out)
                .filter(
                    AttendanceTimeInOut.status_del.is_(False),
                    AttendanceTimeInOut.employee_id.in_(emp_ids),
                    AttendanceTimeInOut.date_in_out >= dt_min,
                    AttendanceTimeInOut.date_in_out <= dt_max,
                )
                .all()
            )
            for eid, pdt in ex_rows:
                if eid and pdt:
                    existing_keys.add((int(eid), pdt.replace(microsecond=0)))

        now = datetime.utcnow()
        inserted = 0
        skipped_unknown = 0
        skipped_ambiguous = 0
        skipped_dup = 0
        unknown_cards: Dict[str, int] = defaultdict(int)
        ambiguous_cards: Dict[str, int] = defaultdict(int)
        for card_no, pdt in parsed:
            if card_no in ambiguous_card_to_emps:
                skipped_ambiguous += 1
                ambiguous_cards[card_no] += 1
                continue
            emp = card_to_emp.get(card_no)
            if not emp or not emp.id:
                skipped_unknown += 1
                unknown_cards[card_no] += 1
                continue
            key = (int(emp.id), pdt.replace(microsecond=0))
            if key in existing_keys:
                skipped_dup += 1
                continue
            row = AttendanceTimeInOut(
                company_id=emp.company_id,
                employee_id=int(emp.id),
                id_card=card_no[:20],
                date_i=datetime(pdt.year, pdt.month, pdt.day, 0, 0, 0),
                date_in_out=pdt.replace(microsecond=0),
                id_sin_out=3,  # 일괄 등록
                user_change=_str(getattr(user, "username", None) or str(user.id), 100),
                machine_no="파일",
                location=None,
                add_memo="일괄 업로드(DAT)",
                status_del=False,
                id_time_in_out_approve=None,
                sync_status=None,
                memo_=None,
                created_at=now,
                updated_at=now,
            )
            self.db.add(row)
            existing_keys.add(key)
            inserted += 1

        self.db.commit()
        top_unknown = sorted(unknown_cards.items(), key=lambda x: (-x[1], x[0]))[:20]
        top_ambiguous = sorted(ambiguous_cards.items(), key=lambda x: (-x[1], x[0]))[:20]

        def _emp_meta(e: Employee) -> Dict[str, Any]:
            cid = int(e.company_id) if e.company_id is not None else None
            return {
                "employee_id": int(e.id),
                "employee_number": e.employee_number,
                "employee_name": e.name,
                "company_id": cid,
                "company_name": company_name_by_id.get(cid, str(cid) if cid is not None else "-"),
            }

        mapped_cards_sample: List[Dict[str, Any]] = []
        for c in sorted({card for card, _ in parsed})[:50]:
            one = card_to_emp.get(c)
            if one is None:
                continue
            mapped_cards_sample.append(
                {
                    "card_no": c,
                    "users": [_emp_meta(one)],
                }
            )
        return {
            "ok": True,
            "filename": filename,
            "parsed_rows": len(parsed),
            "inserted": inserted,
            "skipped_unknown_card": skipped_unknown,
            "skipped_ambiguous_card": skipped_ambiguous,
            "skipped_duplicate": skipped_dup,
            "malformed_rows": malformed,
            "unknown_cards_sample": [{"card_no": c, "count": n} for c, n in top_unknown],
            "ambiguous_cards_sample": [
                {
                    "card_no": c,
                    "count": n,
                    "users": [_emp_meta(e) for e in ambiguous_card_to_emps.get(c, [])[:20]],
                }
                for c, n in top_ambiguous
            ],
            "mapped_cards_sample": mapped_cards_sample,
        }

