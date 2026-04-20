from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import text

from app.database import SessionLocal
from app.models.attendance_standard import AttendanceLeaveLevel, AttendanceLeaveLevelRow

COMPANY_CODE = "AAA"
LEVEL_NUMBER = 1

# Image-based template for "휴가등급1"
# Columns: Leave | No. Of..(days) | No. Of ho..(hours) | No. Of Mi..(minutes)
ROW_TEMPLATE = [
    ("Sick Leave", Decimal("30"), 0, 0),
    ("Business leave", Decimal("7"), 0, 0),
    ("-", Decimal("0"), 0, 0),
    ("Ordination leave", Decimal("14"), 0, 0),
    ("Maternity leave", Decimal("120"), 0, 0),
    ("Other Leave", Decimal("0"), 0, 0),
    ("-", Decimal("0"), 0, 0),
    ("Training leave", Decimal("0"), 0, 0),
    ("-", Decimal("60"), 0, 0),
    ("-", Decimal("0"), 0, 0),
    ("-", Decimal("0"), 0, 0),
    ("-", Decimal("0"), 0, 0),
    ("-", Decimal("0"), 0, 0),
    ("Absent", Decimal("0"), 0, 0),
    ("-", Decimal("15"), 0, 0),
]


def main():
    db = SessionLocal()
    try:
        company_id = db.execute(
            text("select id from companies where company_code = :code order by id limit 1"),
            {"code": COMPANY_CODE},
        ).scalar()
        if not company_id:
            raise RuntimeError(f"company_code='{COMPANY_CODE}' 회사를 찾을 수 없습니다.")

        level = (
            db.query(AttendanceLeaveLevel)
            .filter(
                AttendanceLeaveLevel.company_id == company_id,
                AttendanceLeaveLevel.level_number == LEVEL_NUMBER,
            )
            .first()
        )
        if level is None:
            level = AttendanceLeaveLevel(company_id=company_id, level_number=LEVEL_NUMBER)
            db.add(level)
            db.flush()

        # Right-side settings from image
        level.statutory_start_date = date(2026, 1, 1)
        level.leave_other_start_date = date(2026, 1, 1)
        level.cumulative_year = 2025
        level.summer_employee_plus_one = False
        level.display_start_date = date(2025, 12, 21)

        existing_rows = (
            db.query(AttendanceLeaveLevelRow)
            .filter(AttendanceLeaveLevelRow.leave_level_id == level.id)
            .order_by(AttendanceLeaveLevelRow.sort_order.asc(), AttendanceLeaveLevelRow.id.asc())
            .all()
        )
        existing_by_order = {int(r.sort_order): r for r in existing_rows}

        for idx, (name, days, hours, minutes) in enumerate(ROW_TEMPLATE, start=1):
            row = existing_by_order.get(idx)
            if row is None:
                row = AttendanceLeaveLevelRow(leave_level_id=level.id, sort_order=idx)
                db.add(row)
                db.flush()
            row.sort_order = idx
            row.leave_type_name = name
            row.days_quota = days
            row.hours_quota = int(hours)
            row.minutes_quota = int(minutes)
            row.option_checked = False

        # Remove trailing rows not present in the imported template
        for r in existing_rows:
            if int(r.sort_order or 0) > len(ROW_TEMPLATE):
                db.delete(r)

        db.commit()
        print(
            f"imported leave_level={LEVEL_NUMBER} for company_id={company_id} "
            f"(rows={len(ROW_TEMPLATE)})"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

