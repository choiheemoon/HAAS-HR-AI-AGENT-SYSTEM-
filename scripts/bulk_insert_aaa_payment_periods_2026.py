from datetime import date

from app.database import SessionLocal
from app.models.attendance_standard import AttendancePaymentPeriod
from app.models.company import Company


def month_range_21_to_20(year: int, month: int) -> tuple[date, date]:
    if month == 1:
        start_date = date(year - 1, 12, 21)
    else:
        start_date = date(year, month - 1, 21)
    end_date = date(year, month, 20)
    return start_date, end_date


def main() -> None:
    target_year = 2026
    session = SessionLocal()
    try:
        company = session.query(Company).filter(Company.company_code == "AAA").first()
        if not company:
            raise RuntimeError("Company code AAA not found")

        session.query(AttendancePaymentPeriod).filter(
            AttendancePaymentPeriod.company_id == company.id,
            AttendancePaymentPeriod.calendar_year == target_year,
        ).delete(synchronize_session=False)

        for month in range(1, 13):
            start_date, end_date = month_range_21_to_20(target_year, month)
            session.add(
                AttendancePaymentPeriod(
                    company_id=company.id,
                    calendar_year=target_year,
                    calendar_month=month,
                    period_label="Period 1",
                    start_date_daily=start_date,
                    end_date_daily=end_date,
                    start_date_monthly=start_date,
                    end_date_monthly=end_date,
                    ot_start_daily=start_date,
                    ot_end_daily=end_date,
                    ot_start_monthly=start_date,
                    ot_end_monthly=end_date,
                    remarks=None,
                )
            )

        session.commit()
        count = session.query(AttendancePaymentPeriod).filter(
            AttendancePaymentPeriod.company_id == company.id,
            AttendancePaymentPeriod.calendar_year == target_year,
        ).count()
        print(f"company_id={company.id}, year={target_year}, inserted={count}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
