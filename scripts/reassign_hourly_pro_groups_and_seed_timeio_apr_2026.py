from __future__ import annotations

from datetime import date, datetime, time, timedelta
import random

from sqlalchemy import and_, func, or_

from app.database import SessionLocal
from app.models.attendance_standard import (
    AttendanceShift,
    AttendanceShiftGroupMaster,
    AttendanceWorkCalendar,
    AttendanceWorkCalendarDay,
)
from app.models.attendance_time_in_out import AttendanceTimeInOut
from app.models.company import Company
from app.models.employee import Employee
from app.models.employee_attendance_master import (
    EmployeeAttendanceMaster,
    EmployeeAttendanceMasterBasic,
)


COMPANY_CODE = "AAA"
START_DATE = date(2026, 4, 1)
END_DATE = date(2026, 4, 20)
HOURLY_CODE = "H"
OFFICE_A_GROUP = "Office A"
PRO_A_GROUP = "Pro A"
PRO_B_GROUP = "Pro B"
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
    check_in_dt = datetime.combine(work_day, start_t) + timedelta(minutes=rng.randint(-10, 20))
    end_base_day = work_day + timedelta(days=1) if (end_t.hour, end_t.minute) <= (start_t.hour, start_t.minute) else work_day
    check_out_dt = datetime.combine(end_base_day, end_t) + timedelta(minutes=rng.randint(-15, 35))
    if check_out_dt <= check_in_dt:
        check_out_dt = check_in_dt + timedelta(hours=8, minutes=rng.randint(0, 30))
    return check_in_dt, check_out_dt


def main() -> None:
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.company_code == COMPANY_CODE).first()
        if not company:
            print(f"Company not found for code={COMPANY_CODE}")
            return
        company_id = int(company.id)

        groups = (
            db.query(AttendanceShiftGroupMaster)
            .filter(
                AttendanceShiftGroupMaster.company_id == company_id,
                AttendanceShiftGroupMaster.name.in_([OFFICE_A_GROUP, PRO_A_GROUP, PRO_B_GROUP]),
            )
            .all()
        )
        group_by_name = {str(g.name): g for g in groups}
        office_group = group_by_name.get(OFFICE_A_GROUP)
        pro_a_group = group_by_name.get(PRO_A_GROUP)
        pro_b_group = group_by_name.get(PRO_B_GROUP)
        if not office_group or not pro_a_group or not pro_b_group:
            print("Required shift groups missing. Need Office A, Pro A, Pro B.")
            return

        shift_rows = db.query(AttendanceShift).filter(AttendanceShift.company_id == company_id).all()
        shift_by_id = {int(s.id): s for s in shift_rows}
        shift_by_code = {str(s.shift_code): s for s in shift_rows if s.shift_code}

        cal_rows = (
            db.query(AttendanceWorkCalendar)
            .filter(
                AttendanceWorkCalendar.company_id == company_id,
                AttendanceWorkCalendar.shift_group_id.in_([int(pro_a_group.id), int(pro_b_group.id)]),
                or_(
                    and_(
                        AttendanceWorkCalendar.calendar_year == START_DATE.year,
                        AttendanceWorkCalendar.calendar_month == START_DATE.month,
                    ),
                    and_(
                        AttendanceWorkCalendar.calendar_year == END_DATE.year,
                        AttendanceWorkCalendar.calendar_month == END_DATE.month,
                    ),
                ),
            )
            .all()
        )
        cal_by_key: dict[tuple[int, int, int], AttendanceWorkCalendar] = {}
        cal_ids: list[int] = []
        for c in cal_rows:
            key = (int(c.shift_group_id), int(c.calendar_year), int(c.calendar_month))
            cal_by_key[key] = c
            cal_ids.append(int(c.id))

        day_rows = (
            db.query(AttendanceWorkCalendarDay)
            .filter(AttendanceWorkCalendarDay.calendar_id.in_(cal_ids) if cal_ids else False)
            .all()
        )
        days_by_cal: dict[int, dict[int, AttendanceWorkCalendarDay]] = {}
        for d in day_rows:
            bucket = days_by_cal.setdefault(int(d.calendar_id), {})
            bucket[int(d.day_of_month)] = d

        hourly_employees = (
            db.query(Employee)
            .filter(
                Employee.company_id == company_id,
                Employee.status == "active",
                Employee.salary_process_type == HOURLY_CODE,
            )
            .order_by(Employee.id)
            .all()
        )
        if not hourly_employees:
            print("No hourly employees found.")
            return

        emp_ids = [int(e.id) for e in hourly_employees]
        masters = db.query(EmployeeAttendanceMaster).filter(EmployeeAttendanceMaster.employee_id.in_(emp_ids)).all()
        master_by_emp = {int(m.employee_id): m for m in masters}

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
        for row in existing_rows:
            base = row.date_i or row.date_in_out
            if not base:
                continue
            k = (int(row.employee_id), base.date(), int(row.id_sin_out or 0))
            if k not in existing_map:
                existing_map[k] = row

        now = datetime.utcnow()
        master_created = 0
        master_updated = 0
        time_created = 0
        time_updated = 0

        for idx, emp in enumerate(hourly_employees):
            assigned_group = pro_a_group if idx % 2 == 0 else pro_b_group
            assigned_group_id = int(assigned_group.id)
            assigned_group_name = str(assigned_group.name or "")

            master = master_by_emp.get(int(emp.id))
            if not master:
                master = EmployeeAttendanceMaster(
                    employee_id=emp.id,
                    company_id=company_id,
                    created_at=now,
                    updated_at=now,
                )
                db.add(master)
                db.flush()
                master_by_emp[int(emp.id)] = master
                master_created += 1

            basic = master.basic
            if not basic:
                basic = EmployeeAttendanceMasterBasic(
                    master_id=master.id,
                    created_at=now,
                    updated_at=now,
                )
                db.add(basic)
                master.basic = basic
                master_updated += 1

            if int(basic.master_shiftwork_id or 0) != assigned_group_id:
                basic.master_shiftwork_id = assigned_group_id
                basic.master_shiftwork = assigned_group_name
                basic.updated_at = now
                master_updated += 1

            cur = START_DATE
            while cur <= END_DATE:
                cal = cal_by_key.get((assigned_group_id, cur.year, cur.month))
                if not cal:
                    cur += timedelta(days=1)
                    continue
                day = days_by_cal.get(int(cal.id), {}).get(cur.day)
                if not day or not bool(day.is_workday):
                    cur += timedelta(days=1)
                    continue

                shift = None
                if day.shift_id:
                    shift = shift_by_id.get(int(day.shift_id))
                if shift is None and day.shift_code:
                    shift = shift_by_code.get(str(day.shift_code))
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

                day_zero = datetime.combine(cur, time(0, 0, 0))
                for sinout, punch in ((1, check_in_dt), (2, check_out_dt)):
                    key = (int(emp.id), cur, sinout)
                    row = existing_map.get(key)
                    if row:
                        row.company_id = company_id
                        row.id_card = emp.swipe_card
                        row.date_i = day_zero
                        row.date_in_out = punch
                        row.id_sin_out = sinout
                        row.user_change = USER_CHANGE
                        row.machine_no = MACHINE_NO
                        row.status_del = False
                        row.updated_at = now
                        time_updated += 1
                    else:
                        row = AttendanceTimeInOut(
                            company_id=company_id,
                            employee_id=emp.id,
                            id_card=emp.swipe_card,
                            date_i=day_zero,
                            date_in_out=punch,
                            id_sin_out=sinout,
                            user_change=USER_CHANGE,
                            machine_no=MACHINE_NO,
                            add_memo=f"auto-generated from {assigned_group_name} calendar",
                            status_del=False,
                            sync_status=None,
                            memo_=None,
                            created_at=now,
                            updated_at=now,
                        )
                        db.add(row)
                        existing_map[key] = row
                        time_created += 1
                cur += timedelta(days=1)

        db.commit()
        print(
            "done "
            f"company={COMPANY_CODE} hourly_employees={len(hourly_employees)} "
            f"master_created={master_created} master_updated={master_updated} "
            f"time_created={time_created} time_updated={time_updated} "
            f"range={START_DATE}..{END_DATE}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
