from __future__ import annotations

import calendar
from typing import Dict

from sqlalchemy import func, text

from app.database import SessionLocal
from app.models.attendance_standard import (
    AttendanceShift,
    AttendanceShiftGroupMaster,
    AttendanceWorkCalendar,
    AttendanceWorkCalendarDay,
)


YEAR = 2026
COMPANY_CODE = "AAA"

# Image-based April templates (day -> shift_code)
APRIL_TEMPLATE: Dict[str, Dict[int, str]] = {
    "Office A": {
        1: "O1", 2: "O1", 3: "O1", 4: "DD", 5: "D4", 6: "O1", 7: "O1", 8: "O1", 9: "O1", 10: "O1",
        11: "D6", 12: "D4", 13: "D6", 14: "D6", 15: "D6", 16: "O1", 17: "O1", 18: "O2", 19: "D4", 20: "O1",
        21: "O1", 22: "O1", 23: "O1", 24: "O1", 25: "DD", 26: "D4", 27: "O1", 28: "O1", 29: "O1", 30: "O1",
    },
    "Office B": {
        1: "O1", 2: "O1", 3: "O1", 4: "O2", 5: "D4", 6: "O1", 7: "O1", 8: "O1", 9: "O1", 10: "O1",
        11: "D6", 12: "D4", 13: "D6", 14: "D6", 15: "D6", 16: "O1", 17: "O1", 18: "DD", 19: "D4", 20: "O1",
        21: "O1", 22: "O1", 23: "O1", 24: "O1", 25: "O2", 26: "D4", 27: "O1", 28: "O1", 29: "O1", 30: "O1",
    },
    "Pro A": {
        1: "NN", 2: "NN", 3: "NN", 4: "NN", 5: "N6", 6: "DD", 7: "DD", 8: "DD", 9: "DD", 10: "DD",
        11: "D6", 12: "D4", 13: "D6", 14: "D6", 15: "D6", 16: "DD", 17: "DD", 18: "DD", 19: "D4", 20: "NN",
        21: "NN", 22: "NN", 23: "NN", 24: "NN", 25: "NN", 26: "N6", 27: "NN", 28: "NN", 29: "NN", 30: "NN",
    },
    "Pro B": {
        1: "DD", 2: "DD", 3: "DD", 4: "DD", 5: "D4", 6: "NN", 7: "NN", 8: "NN", 9: "NN", 10: "NN",
        11: "N6", 12: "N6", 13: "N6", 14: "N6", 15: "N6", 16: "NN", 17: "NN", 18: "NN", 19: "N6", 20: "DD",
        21: "DD", 22: "DD", 23: "DD", 24: "DD", 25: "DD", 26: "D4", 27: "DD", 28: "DD", 29: "DD", 30: "DD",
    },
    "Support TSE": {
        1: "6D", 2: "6D", 3: "6D", 4: "6D", 5: "D4", 6: "6D", 7: "6D", 8: "6D", 9: "6D", 10: "6D",
        11: "D6", 12: "D4", 13: "D6", 14: "D6", 15: "D6", 16: "6D", 17: "6D", 18: "6D", 19: "D4", 20: "6D",
        21: "6D", 22: "6D", 23: "6D", 24: "6D", 25: "6D", 26: "D4", 27: "6D", 28: "6D", 29: "6D", 30: "6D",
    },
    "Trainee": {
        1: "DD", 2: "DD", 3: "DD", 4: "DD", 5: "D4", 6: "DD", 7: "DD", 8: "DD", 9: "DD", 10: "DD",
        11: "DD", 12: "D4", 13: "DD", 14: "DD", 15: "DD", 16: "DD", 17: "DD", 18: "DD", 19: "D4", 20: "DD",
        21: "DD", 22: "DD", 23: "DD", 24: "DD", 25: "DD", 26: "D4", 27: "DD", 28: "DD", 29: "DD", 30: "DD",
    },
}

# Image-based April holiday checks (day -> checked)
APRIL_HOLIDAY_DAYS: Dict[str, set[int]] = {
    "Office A": {4, 5, 11, 12, 19, 25, 26},
    "Office B": {5, 11, 12, 18, 19},
    "Pro A": {5, 11, 12, 19, 26},
    "Pro B": {5, 11, 12, 19},
    "Support TSE": {5, 11, 12, 19, 26},
    "Trainee": {4, 5, 11, 12, 18, 19, 25, 26},
}


def norm_name(v: str) -> str:
    return (v or "").strip().lower()


def ensure_shift(db, company_id: int, code: str) -> int:
    row = (
        db.query(AttendanceShift)
        .filter(
            AttendanceShift.company_id == company_id,
            func.trim(AttendanceShift.shift_code) == code.strip(),
        )
        .first()
    )
    if row is None:
        row = AttendanceShift(company_id=company_id, shift_code=code.strip(), title=code.strip())
        db.add(row)
        db.flush()
    return int(row.id)


def main():
    db = SessionLocal()
    try:
        company_id = db.execute(
            text("select id from companies where company_code = :code order by id limit 1"),
            {"code": COMPANY_CODE},
        ).scalar()
        if not company_id:
            raise RuntimeError(f"company_code='{COMPANY_CODE}' 회사를 찾을 수 없습니다.")

        groups = (
            db.query(AttendanceShiftGroupMaster)
            .filter(AttendanceShiftGroupMaster.company_id == company_id)
            .all()
        )
        group_by_name = {norm_name(g.name or ""): g for g in groups}

        # Ensure all shift codes from template exist
        shift_id_by_code: Dict[str, int] = {}
        for tpl in APRIL_TEMPLATE.values():
            for code in tpl.values():
                shift_id_by_code[code] = ensure_shift(db, company_id, code)

        inserted = 0
        updated = 0
        for group_name, day_map in APRIL_TEMPLATE.items():
            g = group_by_name.get(norm_name(group_name))
            if g is None:
                print(f"[skip] shift_group not found: {group_name}")
                continue
            holiday_days = APRIL_HOLIDAY_DAYS.get(group_name, set())

            for month in range(1, 13):
                cal = (
                    db.query(AttendanceWorkCalendar)
                    .filter(
                        AttendanceWorkCalendar.company_id == company_id,
                        AttendanceWorkCalendar.calendar_year == YEAR,
                        AttendanceWorkCalendar.calendar_month == month,
                        AttendanceWorkCalendar.shift_group_id == g.id,
                    )
                    .first()
                )
                if cal is None:
                    cal = AttendanceWorkCalendar(
                        company_id=company_id,
                        calendar_year=YEAR,
                        calendar_month=month,
                        shift_group_id=g.id,
                        shift_group_name=g.name or group_name,
                    )
                    db.add(cal)
                    db.flush()
                    inserted += 1
                else:
                    cal.shift_group_name = g.name or group_name
                    updated += 1

                month_days = calendar.monthrange(YEAR, month)[1]
                for day in range(1, month_days + 1):
                    code = day_map.get(day)  # day 31 is intentionally left blank (no image source)
                    shift_id = shift_id_by_code.get(code) if code else None
                    is_workday = day not in holiday_days
                    row = (
                        db.query(AttendanceWorkCalendarDay)
                        .filter(
                            AttendanceWorkCalendarDay.calendar_id == cal.id,
                            AttendanceWorkCalendarDay.day_of_month == day,
                        )
                        .first()
                    )
                    if row is None:
                        row = AttendanceWorkCalendarDay(
                            calendar_id=cal.id,
                            company_id=company_id,
                            day_of_month=day,
                        )
                        db.add(row)
                        db.flush()
                    row.company_id = company_id
                    row.shift_code = code
                    row.shift_id = shift_id
                    row.is_workday = is_workday

        db.commit()
        print(
            f"imported work calendars for company_id={company_id}, year={YEAR} "
            f"(inserted={inserted}, updated={updated})"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

