from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
import random

from sqlalchemy import and_, func

from app.database import SessionLocal
from app.models.attendance_time_day import AttendanceTimeDay
from app.models.attendance_time_in_out import AttendanceTimeInOut


START_DATE = date(2026, 4, 1)
END_DATE = date.today()
USER_CHANGE = "seed_script"
MACHINE_NO = "AUTOSEED"
NN_CODE = "NN"


def target_punches(emp_id: int, work_day: date) -> tuple[datetime, datetime]:
    rng = random.Random((int(emp_id) * 100000) + (work_day.toordinal() % 100000))
    check_in = datetime.combine(work_day, time(20, 0)) + timedelta(minutes=rng.randint(-8, 18))
    check_out = datetime.combine(work_day + timedelta(days=1), time(5, 0)) + timedelta(minutes=rng.randint(-12, 32))
    if check_out <= check_in:
        check_out = check_in + timedelta(hours=8, minutes=rng.randint(0, 20))
    return check_in, check_out


def main() -> None:
    db = SessionLocal()
    try:
        nn_days = (
            db.query(AttendanceTimeDay.employee_id, AttendanceTimeDay.work_day)
            .filter(
                AttendanceTimeDay.work_day >= START_DATE,
                AttendanceTimeDay.work_day <= END_DATE,
                func.upper(func.trim(func.coalesce(AttendanceTimeDay.shift_code, ""))) == NN_CODE,
            )
            .all()
        )
        if not nn_days:
            print("No NN work-day rows found.")
            return

        nn_keys = {(int(emp_id), work_day) for emp_id, work_day in nn_days if emp_id and work_day}
        emp_ids = sorted({emp_id for emp_id, _ in nn_keys})
        min_day = min(day for _, day in nn_keys)
        max_day = max(day for _, day in nn_keys)

        seed_rows = (
            db.query(AttendanceTimeInOut)
            .filter(
                AttendanceTimeInOut.employee_id.in_(emp_ids),
                AttendanceTimeInOut.status_del.is_(False),
                AttendanceTimeInOut.id_sin_out.in_([1, 2]),
                AttendanceTimeInOut.user_change == USER_CHANGE,
                AttendanceTimeInOut.date_i.isnot(None),
                AttendanceTimeInOut.date_i >= datetime.combine(min_day, time(0, 0)),
                AttendanceTimeInOut.date_i <= datetime.combine(max_day, time(23, 59, 59)),
                and_(
                    AttendanceTimeInOut.add_memo.isnot(None),
                    AttendanceTimeInOut.add_memo.ilike("auto-generated%"),
                ),
            )
            .all()
        )

        rows_by_key: dict[tuple[int, date], list[AttendanceTimeInOut]] = defaultdict(list)
        for row in seed_rows:
            if not row.employee_id or not row.date_i:
                continue
            key = (int(row.employee_id), row.date_i.date())
            if key in nn_keys:
                rows_by_key[key].append(row)

        now = datetime.utcnow()
        updated = 0
        created = 0

        for key in sorted(nn_keys):
            emp_id, work_day = key
            check_in, check_out = target_punches(emp_id, work_day)
            day_zero = datetime.combine(work_day, time(0, 0, 0))

            by_sin: dict[int, AttendanceTimeInOut] = {}
            for row in rows_by_key.get(key, []):
                sinout = int(row.id_sin_out or 0)
                if sinout in (1, 2) and sinout not in by_sin:
                    by_sin[sinout] = row

            for sinout, punch in ((1, check_in), (2, check_out)):
                row = by_sin.get(sinout)
                if row:
                    if row.date_i != day_zero or row.date_in_out != punch:
                        row.date_i = day_zero
                        row.date_in_out = punch
                        row.id_sin_out = sinout
                        row.machine_no = MACHINE_NO
                        row.user_change = USER_CHANGE
                        row.status_del = False
                        row.updated_at = now
                        updated += 1
                    continue

                nr = AttendanceTimeInOut(
                    employee_id=emp_id,
                    date_i=day_zero,
                    date_in_out=punch,
                    id_sin_out=sinout,
                    user_change=USER_CHANGE,
                    machine_no=MACHINE_NO,
                    add_memo=f"auto-generated NN shift fix ({work_day.isoformat()})",
                    status_del=False,
                    created_at=now,
                    updated_at=now,
                )
                db.add(nr)
                created += 1

        db.commit()
        print(
            f"done nn_workdays={len(nn_keys)} seed_rows={len(seed_rows)} "
            f"updated={updated} created={created} range={START_DATE}..{END_DATE}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
