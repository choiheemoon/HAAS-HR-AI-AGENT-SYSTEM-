from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import func, text

from app.database import SessionLocal
from app.models.attendance_standard import AttendanceShift, AttendanceShiftOtRange


def dec(v: Any):
    if v in (None, ""):
        return None
    return Decimal(str(v))


SHIFT_DATA = [
    {
        "shift_code": "6D",
        "title": "6D",
        "start_check_in": "05:00",
        "start_work": "08:00",
        "lateness_count_start": "08:01",
        "break_late_time": "12:00",
        "break_early_time": "13:00",
        "break_sum": "01:00",
        "time_out": "17:00",
        "work_on_holiday": True,
        "continuous_ot_minutes": 0,
        "allowance_food_daily": 60,
        "allowance_food_monthly": 60,
        "ot_ranges": [
            ("08:00", "17:00", 1, 1, None, 2, 1, None),
            ("17:01", "17:30", None, None, None, None, None, None),
            ("17:31", "08:00", 1.5, 3, 3, 1.5, 3, 3),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
        ],
    },
    {
        "shift_code": "D4",
        "title": "D4",
        "start_check_in": "04:30",
        "start_work": "08:00",
        "lateness_count_start": "08:01",
        "break_late_time": "12:00",
        "break_early_time": "13:00",
        "break_sum": "01:00",
        "time_out": "17:00",
        "work_on_holiday": False,
        "continuous_ot_minutes": 0,
        "allowance_food_daily": 40,
        "allowance_food_monthly": 40,
        "ot_ranges": [
            ("08:00", "17:00", 1, 1, None, 2, 1, None),
            ("17:01", "17:30", None, None, None, None, None, None),
            ("17:31", "00:00", 3, 3, None, 3, 3, None),
            ("00:01", "01:00", None, None, None, None, None, None),
            ("01:01", "05:00", 3, 3, None, 3, 3, None),
            ("05:01", "05:30", None, None, None, None, None, None),
            ("05:31", "12:00", 3, 3, None, 3, 3, None),
            ("00:00", "00:00", None, None, None, None, None, None),
        ],
    },
    {
        "shift_code": "D6",
        "title": "D6",
        "start_check_in": "05:30",
        "start_work": "08:00",
        "lateness_count_start": "08:01",
        "break_late_time": "12:00",
        "break_early_time": "13:00",
        "break_sum": "01:00",
        "time_out": "17:00",
        "work_on_holiday": True,
        "continuous_ot_minutes": 0,
        "allowance_food_daily": 60,
        "allowance_food_monthly": 60,
        "ot_ranges": [
            ("08:00", "17:00", 1, 1, None, 2, 1, None),
            ("17:01", "17:30", None, None, None, None, None, None),
            ("17:31", "00:01", 3, 3, None, 3, 3, None),
            ("00:02", "01:00", None, None, None, None, None, None),
            ("01:01", "05:30", 3, 3, None, 3, 3, None),
            ("05:01", "05:30", None, None, None, None, None, None),
            ("05:31", "12:00", 3, 3, None, 3, 3, None),
            ("00:00", "00:00", None, None, None, None, None, None),
        ],
    },
    {
        "shift_code": "DD",
        "title": "DD",
        "start_check_in": "03:20",
        "start_work": "08:00",
        "lateness_count_start": "08:05",
        "break_late_time": "12:00",
        "break_early_time": "13:00",
        "break_sum": "01:00",
        "time_out": "17:00",
        "work_on_holiday": False,
        "continuous_ot_minutes": 0,
        "allowance_food_daily": 0,
        "allowance_food_monthly": 0,
        "ot_ranges": [
            ("08:00", "17:00", 1, 1, None, 2, 1, None),
            ("17:01", "17:30", None, None, None, None, None, None),
            ("17:31", "00:00", 1.5, 3, 3, 1.5, 3, 3),
            ("00:01", "01:00", None, None, None, None, None, None),
            ("01:01", "05:00", 1.5, 3, 3, 1.5, 3, 3),
            ("05:01", "05:30", None, None, None, None, None, None),
            ("05:31", "12:00", 1.5, 3, 3, 1.5, 3, 3),
            ("00:00", "00:00", None, None, None, None, None, None),
        ],
    },
    {
        "shift_code": "O1",
        "title": "O1",
        "start_check_in": "05:00",
        "start_work": "08:00",
        "lateness_count_start": "08:01",
        "break_late_time": "12:00",
        "break_early_time": "13:00",
        "break_sum": "01:00",
        "time_out": "18:00",
        "work_on_holiday": False,
        "continuous_ot_minutes": 0,
        "allowance_food_daily": 0,
        "allowance_food_monthly": 0,
        "ot_ranges": [
            ("08:00", "18:00", 1, 1, None, 2, 1, None),
            ("18:01", "18:30", None, None, None, None, None, None),
            ("18:31", "08:00", 1.5, 3, 3, 1.5, 3, 3),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
        ],
    },
    {
        "shift_code": "O2",
        "title": "O2",
        "start_check_in": "05:00",
        "start_work": "08:00",
        "lateness_count_start": "08:01",
        "break_late_time": "12:00",
        "break_early_time": "13:00",
        "break_sum": "01:00",
        "time_out": "15:00",
        "work_on_holiday": False,
        "continuous_ot_minutes": 0,
        "allowance_food_daily": 0,
        "allowance_food_monthly": 0,
        "ot_ranges": [
            ("08:00", "15:00", 1, 1, None, 2, 1, None),
            ("15:01", "17:00", 1.5, 3, 3, 1.5, 3, 3),
            ("17:01", "17:30", 1.5, 3, 3, 1.5, 3, 3),
            ("17:31", "08:00", 1.5, 3, 3, 1.5, 3, 3),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
        ],
    },
    {
        "shift_code": "NN",
        "title": "NN",
        "start_check_in": "17:30",
        "start_work": "20:00",
        "lateness_count_start": "20:01",
        "break_late_time": "00:00",
        "break_early_time": "00:00",
        "break_sum": "01:00",
        "time_out": "05:00",
        "work_on_holiday": True,
        "continuous_ot_minutes": 0,
        "allowance_shift": 20,
        "allowance_food_daily": 20,
        "allowance_food_monthly": 20,
        "ot_ranges": [
            ("20:00", "05:00", 1, 1, None, 2, 1, None),
            ("05:01", "05:30", None, None, None, None, None, None),
            ("05:31", "12:00", 1.5, 3, 3, 1.5, 3, 3),
            ("12:01", "20:00", 1.5, 3, 3, 1.5, 3, 3),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
        ],
    },
    {
        "shift_code": "D0",
        "title": "D0",
        "start_check_in": "03:30",
        "start_work": "08:00",
        "lateness_count_start": "08:01",
        "break_late_time": "00:00",
        "break_early_time": "00:00",
        "break_sum": "01:00",
        "time_out": "17:00",
        "work_on_holiday": True,
        "continuous_ot_minutes": 0,
        "allowance_food_daily": 40,
        "allowance_food_monthly": 40,
        "ot_ranges": [
            ("08:00", "12:00", 1, 1, None, 1, 1, None),
            ("12:01", "13:00", None, None, None, None, None, None),
            ("13:01", "17:00", 1, 1, None, 1, 1, None),
            ("17:01", "17:30", None, None, None, None, None, None),
            ("00:00", "00:00", 1.5, 3, 3, 1.5, 3, 3),
            ("00:01", "08:00", 1.5, 3, 3, 1.5, 3, 3),
            ("00:00", "00:00", None, None, None, None, None, None),
            ("00:00", "00:00", None, None, None, None, None, None),
        ],
    },
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

        for item in SHIFT_DATA:
            code = item["shift_code"].strip()
            row = (
                db.query(AttendanceShift)
                .filter(
                    AttendanceShift.company_id == company_id,
                    func.trim(AttendanceShift.shift_code) == code,
                )
                .first()
            )
            if row is None:
                row = AttendanceShift(company_id=company_id, shift_code=code)
                db.add(row)
                db.flush()

            row.shift_code = code
            row.title = item["title"]
            row.start_check_in = item["start_check_in"]
            row.start_work = item["start_work"]
            row.lateness_count_start = item["lateness_count_start"]
            row.break_late_time = item["break_late_time"]
            row.break_early_time = item["break_early_time"]
            row.break_sum = item["break_sum"]
            row.time_out = item["time_out"]
            row.work_on_holiday = bool(item.get("work_on_holiday", False))
            row.continue_shift_without_zip_minutes = int(item.get("continuous_ot_minutes", 0))
            row.allowance_shift = int(item.get("allowance_shift", 0))
            row.allowance_food_daily = int(item.get("allowance_food_daily", 0))
            row.allowance_food_monthly = int(item.get("allowance_food_monthly", 0))

            for idx, r in enumerate(item["ot_ranges"], start=1):
                ot = (
                    db.query(AttendanceShiftOtRange)
                    .filter(
                        AttendanceShiftOtRange.shift_id == row.id,
                        AttendanceShiftOtRange.sort_order == idx,
                    )
                    .first()
                )
                if ot is None:
                    ot = AttendanceShiftOtRange(shift_id=row.id, sort_order=idx)
                    db.add(ot)
                    db.flush()
                ot.range_start = r[0]
                ot.range_end = r[1]
                ot.monthly_rate_a = dec(r[2])
                ot.monthly_rate_b = dec(r[3])
                ot.monthly_rate_holiday = dec(r[4])
                ot.daily_rate_a = dec(r[5])
                ot.daily_rate_b = dec(r[6])
                ot.daily_rate_holiday = dec(r[7])

        db.commit()
        print(f"imported shifts for company_id={company_id}: {len(SHIFT_DATA)} rows")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

