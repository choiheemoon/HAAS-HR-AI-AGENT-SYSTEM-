from __future__ import annotations

from datetime import date

from sqlalchemy import text

from app.database import SessionLocal
from app.models.attendance_standard import AttendancePaymentPeriod


COMPANY_CODE = "AAA"
YEAR = 2026


PERIODS = [
    (1, date(2025, 12, 21), date(2026, 1, 20)),
    (2, date(2026, 1, 21), date(2026, 2, 20)),
    (3, date(2026, 2, 21), date(2026, 3, 20)),
    (4, date(2026, 3, 21), date(2026, 4, 20)),
    (5, date(2026, 4, 21), date(2026, 5, 20)),
    (6, date(2026, 5, 21), date(2026, 6, 20)),
    (7, date(2026, 6, 21), date(2026, 7, 20)),
    (8, date(2026, 7, 21), date(2026, 8, 20)),
    (9, date(2026, 8, 21), date(2026, 9, 20)),
    (10, date(2026, 9, 21), date(2026, 10, 20)),
    (11, date(2026, 10, 21), date(2026, 11, 20)),
    (12, date(2026, 11, 21), date(2026, 12, 20)),
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

        inserted = 0
        updated = 0
        for month, start_d, end_d in PERIODS:
            row = (
                db.query(AttendancePaymentPeriod)
                .filter(
                    AttendancePaymentPeriod.company_id == company_id,
                    AttendancePaymentPeriod.calendar_year == YEAR,
                    AttendancePaymentPeriod.calendar_month == month,
                    AttendancePaymentPeriod.period_label == "Period 1",
                )
                .first()
            )
            if row is None:
                row = AttendancePaymentPeriod(
                    company_id=company_id,
                    calendar_year=YEAR,
                    calendar_month=month,
                    period_label="Period 1",
                )
                db.add(row)
                inserted += 1
            else:
                updated += 1

            row.start_date_daily = start_d
            row.end_date_daily = end_d
            row.start_date_monthly = start_d
            row.end_date_monthly = end_d
            row.ot_start_daily = start_d
            row.ot_end_daily = end_d
            row.ot_start_monthly = start_d
            row.ot_end_monthly = end_d
            row.remarks = None

        db.commit()
        print(
            f"imported payment periods for company_id={company_id}, year={YEAR} "
            f"(inserted={inserted}, updated={updated}, total={len(PERIODS)})"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

