from __future__ import annotations

from typing import Any

from app.database import SessionLocal
from app.models.attendance_standard import AttendanceShift, AttendanceShiftOtRange
from app.models.company import Company


def upsert_shift(session, company_id: int, payload: dict[str, Any]) -> None:
    shift = (
        session.query(AttendanceShift)
        .filter(AttendanceShift.company_id == company_id, AttendanceShift.shift_code == payload["shift_code"])
        .first()
    )
    if not shift:
        shift = AttendanceShift(company_id=company_id, shift_code=payload["shift_code"])
        session.add(shift)
        session.flush()

    for k, v in payload.items():
        if k in ("shift_code", "ot_ranges"):
            continue
        setattr(shift, k, v)

    session.query(AttendanceShiftOtRange).filter(AttendanceShiftOtRange.shift_id == shift.id).delete(
        synchronize_session=False
    )
    for i, row in enumerate(payload["ot_ranges"]):
        session.add(
            AttendanceShiftOtRange(
                shift_id=shift.id,
                sort_order=i,
                range_start=row["range_start"],
                range_end=row["range_end"],
                monthly_rate_a=row["monthly_rate_a"],
                monthly_rate_b=row["monthly_rate_b"],
                monthly_rate_holiday=row["monthly_rate_holiday"],
                daily_rate_a=row["daily_rate_a"],
                daily_rate_b=row["daily_rate_b"],
                daily_rate_holiday=row["daily_rate_holiday"],
            )
        )


def main() -> None:
    session = SessionLocal()
    try:
        company = session.query(Company).filter(Company.company_code == "AAA").first()
        if not company:
            raise RuntimeError("Company code AAA not found")

        common_rule = {
            "work_on_holiday": True,
            "work_holiday_threshold_minutes": 0,
            "work_holiday_daily": 0,
            "work_holiday_monthly": 0,
            "late_enabled": False,
            "late_threshold_minutes": 0,
            "late_daily": 20,
            "late_monthly": 20,
            "late_shift_note": "20",
            "late_monthly_note": "20",
            "early_enabled": False,
            "early_threshold_minutes": 0,
            "early_daily": 0,
            "early_monthly": 0,
            "leaves_enabled": False,
            "leaves_threshold_minutes": 0,
            "leaves_daily": 20,
            "leaves_monthly": 20,
            "continuous_ot_minutes": 0,
            "continuous_ot_after": False,
            "continuous_ot_before": False,
            "food_daily": 0,
            "food_monthly": 0,
            "leave_food_daily": 0,
            "leave_food_monthly": 0,
            "leave_food_minutes": 0,
            "allowance_food_daily": 0,
            "allowance_food_monthly": 0,
            "allowance_food": 0,
            "allowance_shift": 0,
        }

        dd = {
            "shift_code": "DD",
            "title": "DD",
            "start_check_in": "03:20",
            "start_work": "08:00",
            "lateness_count_start": "08:05",
            "break_late_enabled": False,
            "break_late_time": "12:00",
            "break_early_enabled": False,
            "break_early_time": "13:00",
            "break_sum": "01:00",
            "time_out": "17:00",
            "continue_shift_without_zip_minutes": 0,
            **common_rule,
            "ot_ranges": [
                {"range_start": "08:00", "range_end": "17:00", "monthly_rate_a": 1.0, "monthly_rate_b": 1.0, "monthly_rate_holiday": None, "daily_rate_a": 2.0, "daily_rate_b": 1.0, "daily_rate_holiday": None},
                {"range_start": "17:01", "range_end": "17:30", "monthly_rate_a": None, "monthly_rate_b": None, "monthly_rate_holiday": None, "daily_rate_a": None, "daily_rate_b": None, "daily_rate_holiday": None},
                {"range_start": "17:31", "range_end": "00:00", "monthly_rate_a": 1.5, "monthly_rate_b": 3.0, "monthly_rate_holiday": 3.0, "daily_rate_a": 1.5, "daily_rate_b": 3.0, "daily_rate_holiday": 3.0},
                {"range_start": "00:01", "range_end": "01:00", "monthly_rate_a": None, "monthly_rate_b": None, "monthly_rate_holiday": None, "daily_rate_a": None, "daily_rate_b": None, "daily_rate_holiday": None},
                {"range_start": "01:01", "range_end": "05:00", "monthly_rate_a": 1.5, "monthly_rate_b": 3.0, "monthly_rate_holiday": 3.0, "daily_rate_a": 1.5, "daily_rate_b": 3.0, "daily_rate_holiday": 3.0},
                {"range_start": "05:01", "range_end": "05:30", "monthly_rate_a": 1.5, "monthly_rate_b": 3.0, "monthly_rate_holiday": 3.0, "daily_rate_a": 1.5, "daily_rate_b": 3.0, "daily_rate_holiday": 3.0},
                {"range_start": "05:31", "range_end": "12:00", "monthly_rate_a": 1.5, "monthly_rate_b": 3.0, "monthly_rate_holiday": 3.0, "daily_rate_a": 1.5, "daily_rate_b": 3.0, "daily_rate_holiday": 3.0},
                {"range_start": "00:00", "range_end": "00:00", "monthly_rate_a": None, "monthly_rate_b": None, "monthly_rate_holiday": None, "daily_rate_a": None, "daily_rate_b": None, "daily_rate_holiday": None},
            ],
        }

        nn = {
            "shift_code": "NN",
            "title": "NN",
            "start_check_in": "17:30",
            "start_work": "20:00",
            "lateness_count_start": "20:01",
            "break_late_enabled": False,
            "break_late_time": "00:00",
            "break_early_enabled": False,
            "break_early_time": "00:00",
            "break_sum": "01:00",
            "time_out": "05:00",
            "continue_shift_without_zip_minutes": 0,
            **common_rule,
            "ot_ranges": [
                {"range_start": "20:00", "range_end": "05:00", "monthly_rate_a": 1.0, "monthly_rate_b": 1.0, "monthly_rate_holiday": None, "daily_rate_a": 2.0, "daily_rate_b": 1.0, "daily_rate_holiday": None},
                {"range_start": "05:01", "range_end": "05:30", "monthly_rate_a": None, "monthly_rate_b": None, "monthly_rate_holiday": None, "daily_rate_a": None, "daily_rate_b": None, "daily_rate_holiday": None},
                {"range_start": "05:31", "range_end": "12:00", "monthly_rate_a": 1.5, "monthly_rate_b": 3.0, "monthly_rate_holiday": 3.0, "daily_rate_a": 1.5, "daily_rate_b": 3.0, "daily_rate_holiday": 3.0},
                {"range_start": "12:01", "range_end": "20:00", "monthly_rate_a": 1.5, "monthly_rate_b": 3.0, "monthly_rate_holiday": 3.0, "daily_rate_a": 1.5, "daily_rate_b": 3.0, "daily_rate_holiday": 3.0},
                {"range_start": "00:00", "range_end": "00:00", "monthly_rate_a": None, "monthly_rate_b": None, "monthly_rate_holiday": None, "daily_rate_a": None, "daily_rate_b": None, "daily_rate_holiday": None},
                {"range_start": "00:00", "range_end": "00:00", "monthly_rate_a": None, "monthly_rate_b": None, "monthly_rate_holiday": None, "daily_rate_a": None, "daily_rate_b": None, "daily_rate_holiday": None},
                {"range_start": "00:00", "range_end": "00:00", "monthly_rate_a": None, "monthly_rate_b": None, "monthly_rate_holiday": None, "daily_rate_a": None, "daily_rate_b": None, "daily_rate_holiday": None},
                {"range_start": "00:00", "range_end": "00:00", "monthly_rate_a": None, "monthly_rate_b": None, "monthly_rate_holiday": None, "daily_rate_a": None, "daily_rate_b": None, "daily_rate_holiday": None},
            ],
        }

        upsert_shift(session, company.id, dd)
        upsert_shift(session, company.id, nn)
        session.commit()

        count = (
            session.query(AttendanceShift)
            .filter(AttendanceShift.company_id == company.id, AttendanceShift.shift_code.in_(["DD", "NN"]))
            .count()
        )
        print(f"company_id={company.id}, upserted_shifts={count}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
