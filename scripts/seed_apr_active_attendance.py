from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
import random

from sqlalchemy import and_, func

from app.database import SessionLocal
from app.models.attendance_standard import (
    AttendanceShift,
    AttendanceShiftGroupMaster,
    AttendanceWorkCalendar,
    AttendanceWorkCalendarDay,
)
from app.models.attendance_time_in_out import AttendanceTimeInOut
from app.models.employee import Employee
from app.models.employee_attendance_master import (
    EmployeeAttendanceMaster,
    EmployeeAttendanceMasterBasic,
    EmployeeAttendanceShiftSetting,
)


START_DATE = date(2026, 4, 1)
END_DATE = date.today()
MACHINE_NO = "AUTOSEED"
USER_CHANGE = "seed_script"


def parse_hhmm(v: str | None) -> time | None:
    if not v:
        return None
    s = str(v).strip()
    if not s:
        return None
    parts = s.split(":")
    if len(parts) < 2:
        return None
    try:
        h = max(0, min(23, int(parts[0])))
        m = max(0, min(59, int(parts[1])))
        return time(hour=h, minute=m)
    except Exception:
        return None


def build_shift_datetimes(work_day: date, start_t: time, end_t: time, rng: random.Random) -> tuple[datetime, datetime]:
    check_in_dt = datetime.combine(work_day, start_t) + timedelta(minutes=rng.randint(-8, 18))
    end_base_day = work_day + timedelta(days=1) if (end_t.hour, end_t.minute) <= (start_t.hour, start_t.minute) else work_day
    check_out_dt = datetime.combine(end_base_day, end_t) + timedelta(minutes=rng.randint(-12, 32))
    if check_out_dt <= check_in_dt:
        check_out_dt = check_in_dt + timedelta(hours=8, minutes=rng.randint(0, 20))
    return check_in_dt, check_out_dt


def main() -> None:
    db = SessionLocal()
    try:
        active_employees = (
            db.query(Employee)
            .filter(
                Employee.status == "active",
                or_(Employee.termination_date.is_(None), Employee.termination_date >= START_DATE),
            )
            .all()
        )
        if not active_employees:
            print("No active employees.")
            return

        company_ids = sorted({e.company_id for e in active_employees if e.company_id is not None})

        shift_rows = (
            db.query(AttendanceShift)
            .filter(AttendanceShift.company_id.in_(company_ids))
            .all()
        )
        shift_by_id = {int(s.id): s for s in shift_rows}
        shift_by_company: dict[int, list[AttendanceShift]] = defaultdict(list)
        shift_by_company_code: dict[tuple[int, str], AttendanceShift] = {}
        for s in shift_rows:
            cid = int(s.company_id)
            shift_by_company[cid].append(s)
            if s.shift_code:
                shift_by_company_code[(cid, str(s.shift_code))] = s
        for cid in list(shift_by_company.keys()):
            shift_by_company[cid].sort(key=lambda x: x.id)

        group_rows = (
            db.query(AttendanceShiftGroupMaster)
            .filter(AttendanceShiftGroupMaster.company_id.in_(company_ids))
            .all()
        )
        groups_by_company: dict[int, list[AttendanceShiftGroupMaster]] = defaultdict(list)
        for g in group_rows:
            groups_by_company[int(g.company_id)].append(g)
        for cid in list(groups_by_company.keys()):
            groups_by_company[cid].sort(key=lambda x: ((x.sort_order or 0), x.id))

        cal_rows = (
            db.query(AttendanceWorkCalendar)
            .filter(
                AttendanceWorkCalendar.company_id.in_(company_ids),
                or_(
                    and_(
                        AttendanceWorkCalendar.calendar_year == 2026,
                        AttendanceWorkCalendar.calendar_month == 4,
                    ),
                    and_(
                        AttendanceWorkCalendar.calendar_year == END_DATE.year,
                        AttendanceWorkCalendar.calendar_month == END_DATE.month,
                    ),
                ),
            )
            .all()
        )
        cal_by_key: dict[tuple[int, int, int, int], AttendanceWorkCalendar] = {}
        calendar_ids: list[int] = []
        groups_with_calendar: dict[int, set[int]] = defaultdict(set)
        for c in cal_rows:
            key = (int(c.company_id), int(c.shift_group_id), int(c.calendar_year), int(c.calendar_month))
            cal_by_key[key] = c
            calendar_ids.append(int(c.id))
            groups_with_calendar[int(c.company_id)].add(int(c.shift_group_id))

        day_rows = (
            db.query(AttendanceWorkCalendarDay)
            .filter(AttendanceWorkCalendarDay.calendar_id.in_(calendar_ids) if calendar_ids else False)
            .all()
        )
        cal_days_by_cal_id: dict[int, dict[int, AttendanceWorkCalendarDay]] = defaultdict(dict)
        for d in day_rows:
            cal_days_by_cal_id[int(d.calendar_id)][int(d.day_of_month)] = d

        masters = (
            db.query(EmployeeAttendanceMaster)
            .filter(EmployeeAttendanceMaster.employee_id.in_([e.id for e in active_employees]))
            .all()
        )
        master_by_emp = {int(m.employee_id): m for m in masters}

        emp_ids = [e.id for e in active_employees]
        existing_rows = (
            db.query(AttendanceTimeInOut)
            .filter(
                AttendanceTimeInOut.employee_id.in_(emp_ids),
                AttendanceTimeInOut.status_del.is_(False),
                func.coalesce(AttendanceTimeInOut.date_i, AttendanceTimeInOut.date_in_out)
                >= datetime.combine(START_DATE, time(0, 0)),
                func.coalesce(AttendanceTimeInOut.date_i, AttendanceTimeInOut.date_in_out)
                <= datetime.combine(END_DATE, time(23, 59, 59)),
            )
            .all()
        )
        existing_map: dict[tuple[int, date, int], AttendanceTimeInOut] = {}
        for r in existing_rows:
            base = r.date_i or r.date_in_out
            if not base:
                continue
            key = (int(r.employee_id), base.date(), int(r.id_sin_out or 0))
            if key not in existing_map:
                existing_map[key] = r

        now = datetime.utcnow()
        created = 0
        updated = 0
        master_created = 0
        master_updated = 0

        weekday_keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

        for idx, emp in enumerate(active_employees, start=1):
            if emp.company_id is None:
                continue
            cid = int(emp.company_id)

            master = master_by_emp.get(int(emp.id))
            if not master:
                master = EmployeeAttendanceMaster(employee_id=emp.id, company_id=cid, created_at=now, updated_at=now)
                db.add(master)
                db.flush()
                master_by_emp[int(emp.id)] = master
                master_created += 1

            basic = master.basic
            if not basic:
                basic = EmployeeAttendanceMasterBasic(master_id=master.id, created_at=now, updated_at=now)
                db.add(basic)
                master.basic = basic
                master_updated += 1

            shift_setting = master.shift_setting
            if not shift_setting:
                shift_setting = EmployeeAttendanceShiftSetting(master_id=master.id, schedule_mode="week", created_at=now, updated_at=now)
                db.add(shift_setting)
                master.shift_setting = shift_setting
                master_updated += 1

            shift_group_id = int(basic.master_shiftwork_id) if basic.master_shiftwork_id else None
            groups = groups_by_company.get(cid, [])
            if shift_group_id is None or shift_group_id not in groups_with_calendar.get(cid, set()):
                picked = None
                for g in groups:
                    if int(g.id) in groups_with_calendar.get(cid, set()):
                        picked = g
                        break
                if picked is None and groups:
                    picked = groups[0]
                if picked is not None:
                    shift_group_id = int(picked.id)
                    if basic.master_shiftwork_id != shift_group_id:
                        basic.master_shiftwork_id = shift_group_id
                        basic.master_shiftwork = picked.name
                        basic.updated_at = now
                        master_updated += 1

            weekday_shift_id: dict[str, int | None] = {k: None for k in weekday_keys}
            if shift_group_id is not None:
                counter_by_weekday: dict[str, Counter[int]] = {k: Counter() for k in weekday_keys}
                cur = START_DATE
                while cur <= END_DATE:
                    ck = (cid, shift_group_id, cur.year, cur.month)
                    cal = cal_by_key.get(ck)
                    if cal:
                        day = cal_days_by_cal_id.get(int(cal.id), {}).get(cur.day)
                        if day and bool(day.is_workday):
                            sid = int(day.shift_id) if day.shift_id else None
                            if sid is None and day.shift_code:
                                by_code = shift_by_company_code.get((cid, str(day.shift_code)))
                                sid = int(by_code.id) if by_code else None
                            if sid:
                                wd = weekday_keys[cur.weekday()]
                                counter_by_weekday[wd][sid] += 1
                    cur += timedelta(days=1)
                for wd in weekday_keys:
                    if counter_by_weekday[wd]:
                        weekday_shift_id[wd] = counter_by_weekday[wd].most_common(1)[0][0]
            if all(v is None for v in weekday_shift_id.values()):
                fallback = None
                for s in shift_by_company.get(cid, []):
                    if parse_hhmm(s.start_work) and parse_hhmm(s.time_out):
                        fallback = int(s.id)
                        break
                if fallback is not None:
                    for wd in ("mon", "tue", "wed", "thu", "fri"):
                        weekday_shift_id[wd] = fallback

            # sync shift setting from derived weekday shift
            for wd in weekday_keys:
                sid = weekday_shift_id[wd]
                enabled = sid is not None
                val = shift_by_id[sid].shift_code if sid and sid in shift_by_id else None
                setattr(shift_setting, f"{wd}_enabled", bool(enabled))
                setattr(shift_setting, f"{wd}_shift_id", sid)
                setattr(shift_setting, f"{wd}_shift_value", val)
            shift_setting.updated_at = now
            master.company_id = cid
            master.updated_at = now

            cur = START_DATE
            while cur <= END_DATE:
                shift_id = None
                if shift_group_id is not None:
                    ck = (cid, shift_group_id, cur.year, cur.month)
                    cal = cal_by_key.get(ck)
                    if cal:
                        day = cal_days_by_cal_id.get(int(cal.id), {}).get(cur.day)
                        if day and bool(day.is_workday):
                            shift_id = int(day.shift_id) if day.shift_id else None
                            if shift_id is None and day.shift_code:
                                by_code = shift_by_company_code.get((cid, str(day.shift_code)))
                                shift_id = int(by_code.id) if by_code else None
                        elif day and not bool(day.is_workday):
                            cur += timedelta(days=1)
                            continue

                if shift_id is None:
                    wd = weekday_keys[cur.weekday()]
                    shift_id = weekday_shift_id.get(wd)
                    if shift_id is None:
                        cur += timedelta(days=1)
                        continue

                shift = shift_by_id.get(int(shift_id)) if shift_id else None
                if not shift:
                    cur += timedelta(days=1)
                    continue

                start_t = parse_hhmm(shift.start_work) or parse_hhmm(shift.start_check_in)
                end_t = parse_hhmm(shift.time_out)
                if not start_t or not end_t:
                    cur += timedelta(days=1)
                    continue

                rng = random.Random((int(emp.id) * 100000) + (cur.toordinal() % 100000))
                check_in_dt, check_out_dt = build_shift_datetimes(cur, start_t, end_t, rng)

                day_zero_dt = datetime.combine(cur, time(0, 0, 0))
                for sinout, punch_dt in ((1, check_in_dt), (2, check_out_dt)):
                    key = (int(emp.id), cur, sinout)
                    row = existing_map.get(key)
                    if row:
                        row.company_id = cid
                        row.id_card = emp.swipe_card
                        row.date_i = day_zero_dt
                        row.date_in_out = punch_dt
                        row.id_sin_out = sinout
                        row.user_change = USER_CHANGE
                        row.machine_no = MACHINE_NO
                        row.status_del = False
                        row.updated_at = now
                        updated += 1
                    else:
                        nr = AttendanceTimeInOut(
                            company_id=cid,
                            employee_id=emp.id,
                            id_card=emp.swipe_card,
                            date_i=day_zero_dt,
                            date_in_out=punch_dt,
                            id_sin_out=sinout,
                            user_change=USER_CHANGE,
                            machine_no=MACHINE_NO,
                            add_memo="auto-generated from work calendar",
                            status_del=False,
                            sync_status=None,
                            memo_=None,
                            created_at=now,
                            updated_at=now,
                        )
                        db.add(nr)
                        created += 1
                cur += timedelta(days=1)

            if idx % 200 == 0:
                db.commit()
                print(f"processed={idx} created={created} updated={updated}")

        db.commit()
        print(
            f"done employees={len(active_employees)} master_created={master_created} "
            f"master_updated={master_updated} created={created} updated={updated} "
            f"range={START_DATE}..{END_DATE}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    from sqlalchemy import or_  # late import to keep top tidy

    main()
