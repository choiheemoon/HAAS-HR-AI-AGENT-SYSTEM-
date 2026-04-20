"""
AAA 회사 교대근무(D6, 01, 02, D4, 6D, N6) 일괄 upsert.
실행: 프로젝트 루트에서 PYTHONPATH=. python scripts/bulk_upsert_aaa_shifts_d6_01_02_d4.py
"""
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


def ot8(
    rows: list[tuple[str, str, Any, Any, Any, Any, Any, Any]],
) -> list[dict[str, Any]]:
    """(start,end, m_a,m_b,m_h, d_a,d_b,d_h) × 8행 패딩."""
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "range_start": r[0],
                "range_end": r[1],
                "monthly_rate_a": r[2],
                "monthly_rate_b": r[3],
                "monthly_rate_holiday": r[4],
                "daily_rate_a": r[5],
                "daily_rate_b": r[6],
                "daily_rate_holiday": r[7],
            }
        )
    while len(out) < 8:
        out.append(
            {
                "range_start": "00:00",
                "range_end": "00:00",
                "monthly_rate_a": None,
                "monthly_rate_b": None,
                "monthly_rate_holiday": None,
                "daily_rate_a": None,
                "daily_rate_b": None,
                "daily_rate_holiday": None,
            }
        )
    return out[:8]


def base_rule(
    *,
    work_on_holiday: bool,
    leave_food_d: int,
    leave_food_m: int,
    food_d: int,
    food_m: int,
    continuous_ot: int,
    continuous_ot_after: bool = False,
    continuous_ot_before: bool = False,
) -> dict[str, Any]:
    return {
        "work_on_holiday": work_on_holiday,
        "work_holiday_threshold_minutes": 0,
        "work_holiday_daily": 0,
        "work_holiday_monthly": 0,
        "late_enabled": False,
        "late_threshold_minutes": 0,
        "late_daily": 0,
        "late_monthly": 0,
        "late_shift_note": "0",
        "late_monthly_note": "0",
        "early_enabled": False,
        "early_threshold_minutes": 0,
        "early_daily": 0,
        "early_monthly": 0,
        "leaves_enabled": False,
        "leaves_threshold_minutes": 0,
        "leaves_daily": 0,
        "leaves_monthly": 0,
        "continuous_ot_minutes": continuous_ot,
        "continuous_ot_after": continuous_ot_after,
        "continuous_ot_before": continuous_ot_before,
        "food_daily": food_d,
        "food_monthly": food_m,
        "leave_food_daily": leave_food_d,
        "leave_food_monthly": leave_food_m,
        "leave_food_minutes": leave_food_d or leave_food_m,
        "allowance_food_daily": 0,
        "allowance_food_monthly": 0,
        "allowance_food": 0,
        "allowance_shift": 0,
    }


def main() -> None:
    session = SessionLocal()
    try:
        company = session.query(Company).filter(Company.company_code == "AAA").first()
        if not company:
            raise RuntimeError("Company code AAA not found")

        # D6 — 첨부 스크린샷 기준
        d6 = {
            "shift_code": "D6",
            "title": "D6",
            "start_check_in": "05:30",
            "start_work": "08:00",
            "lateness_count_start": "08:01",
            "break_late_enabled": False,
            "break_late_time": "12:00",
            "break_early_enabled": False,
            "break_early_time": "13:00",
            "break_sum": "01:00",
            "time_out": "17:00",
            "continue_shift_without_zip_minutes": 0,
            **base_rule(
                work_on_holiday=True,
                leave_food_d=60,
                leave_food_m=60,
                food_d=60,
                food_m=60,
                continuous_ot=0,
            ),
            "ot_ranges": ot8(
                [
                    ("08:00", "17:00", None, 1.0, 1.0, None, 2.0, 1.0),
                    ("17:01", "17:30", None, None, None, None, None, None),
                    ("17:31", "00:01", None, 3.0, 3.0, None, 3.0, 3.0),
                    ("00:02", "01:00", None, None, None, None, None, None),
                    ("01:01", "05:00", None, 3.0, 3.0, None, 3.0, 3.0),
                    ("05:01", "05:30", None, None, None, None, None, None),
                    ("05:31", "12:00", None, 3.0, 3.0, None, 3.0, 3.0),
                ]
            ),
        }

        # 01
        s01 = {
            "shift_code": "01",
            "title": "01",
            "start_check_in": "05:00",
            "start_work": "08:00",
            "lateness_count_start": "08:01",
            "break_late_enabled": False,
            "break_late_time": "12:00",
            "break_early_enabled": False,
            "break_early_time": "13:00",
            "break_sum": "01:00",
            "time_out": "18:00",
            "continue_shift_without_zip_minutes": 0,
            **base_rule(
                work_on_holiday=False,
                leave_food_d=0,
                leave_food_m=0,
                food_d=0,
                food_m=0,
                continuous_ot=0,
            ),
            "ot_ranges": ot8(
                [
                    ("08:00", "18:00", None, 1.0, 1.0, None, 2.0, 1.0),
                    ("18:01", "18:30", None, None, None, None, None, None),
                    ("18:31", "08:00", 1.5, 3.0, 3.0, 1.5, 3.0, 3.0),
                ]
            ),
        }

        # 02
        s02 = {
            "shift_code": "02",
            "title": "02",
            "start_check_in": "05:00",
            "start_work": "08:00",
            "lateness_count_start": "08:01",
            "break_late_enabled": False,
            "break_late_time": "12:00",
            "break_early_enabled": False,
            "break_early_time": "13:00",
            "break_sum": "01:00",
            "time_out": "15:00",
            "continue_shift_without_zip_minutes": 0,
            **base_rule(
                work_on_holiday=False,
                leave_food_d=0,
                leave_food_m=0,
                food_d=0,
                food_m=0,
                continuous_ot=0,
            ),
            "ot_ranges": ot8(
                [
                    ("08:00", "15:00", None, 1.0, 1.0, None, 2.0, 1.0),
                    ("15:01", "17:00", 1.5, 3.0, 3.0, 1.5, 3.0, 3.0),
                    ("17:01", "17:30", None, None, None, None, None, None),
                    ("17:31", "08:00", 1.5, 3.0, 3.0, 1.5, 3.0, 3.0),
                ]
            ),
        }

        # D4
        d4 = {
            "shift_code": "D4",
            "title": "D4",
            "start_check_in": "04:30",
            "start_work": "08:00",
            "lateness_count_start": "08:01",
            "break_late_enabled": False,
            "break_late_time": "12:00",
            "break_early_enabled": False,
            "break_early_time": "13:00",
            "break_sum": "01:00",
            "time_out": "17:00",
            "continue_shift_without_zip_minutes": 0,
            **base_rule(
                work_on_holiday=True,
                leave_food_d=40,
                leave_food_m=40,
                food_d=40,
                food_m=40,
                continuous_ot=30,
                continuous_ot_before=False,
            ),
            "ot_ranges": ot8(
                [
                    ("08:00", "17:00", None, 1.0, 1.0, None, 2.0, 1.0),
                    ("17:01", "17:30", None, None, None, None, None, None),
                    ("17:31", "00:00", None, 3.0, 3.0, None, 3.0, 3.0),
                    ("00:01", "01:00", None, None, None, None, None, None),
                    ("01:01", "05:00", None, 3.0, 3.0, None, 3.0, 3.0),
                    ("05:01", "05:30", None, None, None, None, None, None),
                    ("05:31", "12:00", None, 3.0, 3.0, None, 3.0, 3.0),
                ]
            ),
        }

        # 6D — 첨부 스크린샷 (지각>0 체크, 휴일근무, 퇴근식대 60/60, Early Food 그리드 60·0·0)
        s6d = {
            "shift_code": "6D",
            "title": "6D",
            "start_check_in": "05:00",
            "start_work": "08:00",
            "lateness_count_start": "08:01",
            "break_late_enabled": False,
            "break_late_time": "12:00",
            "break_early_enabled": False,
            "break_early_time": "13:00",
            "break_sum": "01:00",
            "time_out": "17:00",
            "continue_shift_without_zip_minutes": 0,
            **base_rule(
                work_on_holiday=True,
                leave_food_d=60,
                leave_food_m=60,
                food_d=60,
                food_m=0,
                continuous_ot=0,
            ),
            "late_enabled": True,
            "late_daily": 0,
            "late_monthly": 0,
            "late_shift_note": "0",
            "late_monthly_note": "0",
            "ot_ranges": ot8(
                [
                    ("08:00", "17:00", None, 1.0, 1.0, None, 2.0, 1.0),
                    ("17:01", "17:30", None, None, None, None, None, None),
                    ("17:31", "08:00", 1.5, 3.0, 3.0, 1.5, 3.0, 3.0),
                ]
            ),
        }

        # N6 — 야간 (18:30~05:00 퇴근), 휴일근무, 지각 미사용 시에도 일/월 20 표기, 퇴근식대 60
        n6 = {
            "shift_code": "N6",
            "title": "N6",
            "start_check_in": "18:30",
            "start_work": "20:00",
            "lateness_count_start": "20:01",
            "break_late_enabled": False,
            "break_late_time": "00:00",
            "break_early_enabled": False,
            "break_early_time": "00:00",
            "break_sum": "01:00",
            "time_out": "05:00",
            "continue_shift_without_zip_minutes": 0,
            **base_rule(
                work_on_holiday=True,
                leave_food_d=60,
                leave_food_m=60,
                food_d=0,
                food_m=0,
                continuous_ot=0,
            ),
            "late_enabled": False,
            "late_daily": 20,
            "late_monthly": 20,
            "late_shift_note": "20",
            "late_monthly_note": "20",
            "ot_ranges": ot8(
                [
                    ("20:00", "05:00", 1.0, 1.0, None, None, 2.0, 1.0),
                    ("05:01", "05:30", None, None, None, None, None, None),
                    ("05:31", "18:30", 1.5, 3.0, 3.0, 1.5, 3.0, 3.0),
                ]
            ),
        }

        for pl in (d6, s01, s02, d4, s6d, n6):
            upsert_shift(session, company.id, pl)

        session.commit()
        codes = ["D6", "01", "02", "D4", "6D", "N6"]
        count = (
            session.query(AttendanceShift)
            .filter(AttendanceShift.company_id == company.id, AttendanceShift.shift_code.in_(codes))
            .count()
        )
        print(f"company_id={company.id} company_code=AAA upserted_shifts={count} codes={codes}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
