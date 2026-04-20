from __future__ import annotations

from datetime import date

from sqlalchemy import text

from app.database import SessionLocal
from app.models.attendance_standard import AttendanceCompanyHoliday


# Source: user-provided 2026 holiday image
HOLIDAYS_2026 = [
    (date(2026, 12, 31), "New Year's Eve"),
    (date(2026, 12, 30), "Switching with Constitution Day"),
    (date(2026, 12, 29), "Switching with The National Father's Day"),
    (date(2026, 12, 28), "Switching with King Chulalongkorn Memorial Day"),
    (date(2026, 12, 26), "Switching with H.M. King Rama IX The Great Memorial Day"),
    (date(2026, 10, 31), "Switching with National Mother's Day"),
    (date(2026, 10, 30), "Switching with H.M. The King Rama X's Birthday"),
    (date(2026, 5, 2), "Switching with Buddhist Lent Day"),
    (date(2026, 5, 1), "National Labor Day"),
    (date(2026, 4, 15), "Songkran Festival"),
    (date(2026, 4, 14), "Songkran Festival"),
    (date(2026, 4, 13), "Songkran Festival"),
    (date(2026, 4, 11), "Switching with Asanha Bucha Day"),
    (date(2026, 1, 3), "Switching with The Queen's Birthday"),
    (date(2026, 1, 2), "Switching with Visakha Bucha Day"),
]


def main():
    db = SessionLocal()
    try:
        company_id = db.execute(
            text("select id from companies where company_code = :code order by id limit 1"),
            {"code": "AAA"},
        ).scalar()
        if not company_id:
            raise RuntimeError("company_code='AAA' 회사를 찾을 수 없습니다.")

        inserted = 0
        updated = 0
        for h_date, remark in HOLIDAYS_2026:
            row = (
                db.query(AttendanceCompanyHoliday)
                .filter(
                    AttendanceCompanyHoliday.company_id == company_id,
                    AttendanceCompanyHoliday.holiday_date == h_date,
                )
                .first()
            )
            if row is None:
                row = AttendanceCompanyHoliday(
                    company_id=company_id,
                    holiday_date=h_date,
                )
                db.add(row)
                inserted += 1
            else:
                updated += 1
            row.remarks = remark

        db.commit()
        print(
            f"imported holidays for company_id={company_id}, year=2026 "
            f"(inserted={inserted}, updated={updated}, total={len(HOLIDAYS_2026)})"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

