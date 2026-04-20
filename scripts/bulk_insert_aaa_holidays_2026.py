from datetime import date

from app.database import SessionLocal
from app.models.attendance_standard import AttendanceCompanyHoliday
from app.models.company import Company


def main() -> None:
    rows = [
        (date(2026, 1, 1), "New Year Day"),
        (date(2026, 1, 2), "Switching with Visakha Bucha Day"),
        (date(2026, 1, 3), "Switching with The Queen R.10 Birth day"),
        (date(2026, 4, 11), "Switching with Asanha Bucha Day"),
        (date(2026, 4, 13), "Songkran Festival"),
        (date(2026, 4, 14), "Songkran Festival"),
        (date(2026, 4, 15), "Songkran Festival"),
        (date(2026, 5, 1), "National Labor Day"),
        (date(2026, 5, 2), "Switching with Buddhist Lent Day"),
        (date(2026, 10, 30), "Switching with H.M.The King Rama10's Birthday"),
        (date(2026, 10, 31), "Switching with National Mother's Day"),
        (date(2026, 12, 26), "Switching with H.M.King R.9 The Great Memorial Day"),
        (date(2026, 12, 28), "Switching with King Chulalongkorn Memorial Day"),
        (date(2026, 12, 29), "Switching with The National Father's Day"),
        (date(2026, 12, 30), "Switching with Constitution Day"),
        (date(2026, 12, 31), "New Year's Eve"),
    ]

    session = SessionLocal()
    try:
        company = session.query(Company).filter(Company.company_code == "AAA").first()
        if not company:
            raise RuntimeError("Company code AAA not found")

        session.query(AttendanceCompanyHoliday).filter(
            AttendanceCompanyHoliday.company_id == company.id,
            AttendanceCompanyHoliday.holiday_date >= date(2026, 1, 1),
            AttendanceCompanyHoliday.holiday_date <= date(2026, 12, 31),
        ).delete(synchronize_session=False)

        for d, r in rows:
            session.add(
                AttendanceCompanyHoliday(
                    company_id=company.id,
                    holiday_date=d,
                    remarks=r,
                )
            )
        session.commit()

        count = session.query(AttendanceCompanyHoliday).filter(
            AttendanceCompanyHoliday.company_id == company.id,
            AttendanceCompanyHoliday.holiday_date >= date(2026, 1, 1),
            AttendanceCompanyHoliday.holiday_date <= date(2026, 12, 31),
        ).count()
        print(f"company_id={company.id}, inserted_2026={count}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
