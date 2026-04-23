"""근태/OT/수당 일괄 집계 → attendance_time_day."""
from __future__ import annotations

import math
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Callable, DefaultDict, Dict, Iterator, List, Optional, Set, Tuple, FrozenSet

from sqlalchemy import func, or_, tuple_
from sqlalchemy.orm import Session, joinedload

from app.models.attendance import Leave
from app.models.attendance_additional_ot import AttendanceAdditionalOt
from app.models.attendance_standard import (
    AttendanceCompanyHoliday,
    AttendanceCompanySettings,
    AttendanceRoundUpSection,
    AttendanceShift,
    AttendanceShiftOtRange,
    AttendanceWorkCalendar,
    AttendanceWorkCalendarDay,
)
from app.models.attendance_special_ot import AttendanceSpecialOt
from app.models.attendance_time_in_out import AttendanceTimeInOut
from app.models.attendance_time_day import AttendanceTimeDay
from app.models.employee import Employee
from app.models.employee_attendance_master import (
    EmployeeAttendanceMaster,
    EmployeeAttendanceMasterBasic,
    EmployeeAttendanceMasterOt,
    EmployeeAttendanceShiftSetting,
)
from app.models.employee_type import EmployeeType
from app.models.user import User
from app.services.attendance_time_day_service import AttendanceTimeDayService
from app.services.attendance_period_lock_service import AttendancePeriodLockService
from app.services.system_rbac_service import SystemRbacService

def _attendance_master_special_allowances(
    master: Optional[EmployeeAttendanceMaster],
) -> Tuple[float, float, float]:
    """근태마스터 특별 비용/수당: slot_index 1=주유(유류비), 2=서서일하는 수당, 3=기타(근태마스터 UI와 동일).

    slot_index 4 이상은 구데이터·확장 슬롯으로 보고 기타에 합산한다.
    """
    fuel = 0.0
    stand = 0.0
    other = 0.0
    if not master or not getattr(master, "special_charges", None):
        return fuel, stand, other
    for sc in master.special_charges:
        try:
            si = int(getattr(sc, "slot_index", 0) or 0)
        except (TypeError, ValueError):
            continue
        try:
            amt = float(sc.amount_baht or 0)
        except (TypeError, ValueError):
            amt = 0.0
        if si == 1:
            fuel += amt
        elif si == 2:
            stand += amt
        elif si == 3:
            other += amt
        elif si >= 4:
            other += amt
    return fuel, stand, other


def _parse_hhmm(s: Optional[str]) -> Optional[Tuple[int, int]]:
    if not s:
        return None
    t = str(s).strip()
    m = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$", t)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if 0 <= h <= 47 and 0 <= mi <= 59:
        return h, mi
    return None


def _combine_local(d: date, hm: Optional[str], next_day: bool = False) -> Optional[datetime]:
    p = _parse_hhmm(hm)
    if not p:
        return None
    h, mi = p
    base = d + timedelta(days=1) if next_day else d
    return datetime(base.year, base.month, base.day, h % 24, mi, 0)


def _hm_norm(s: Optional[str]) -> str:
    """교대·OT 표 시각 문자열 비교용 (앞뒤 공백, 시:분 정규화)."""
    p = _parse_hhmm(s)
    if not p:
        return ""
    h, mi = p
    return f"{h % 24:02d}:{mi:02d}"


def _break_sum_minutes(shift_def: Optional[AttendanceShift]) -> int:
    """교대 기본정보 휴식합계(break_sum) → 분."""
    if not shift_def:
        return 0
    p = _parse_hhmm(getattr(shift_def, "break_sum", None))
    if not p:
        return 0
    return max(0, p[0] * 60 + p[1])


def _ot_range_matches_core_shift(rng: AttendanceShiftOtRange, shift_def: AttendanceShift) -> bool:
    """OT 표 행이 근무시작~퇴근(핵심 근무창)과 동일 시각이면 휴식합계 차감 대상."""
    sw = _hm_norm(getattr(shift_def, "start_work", None)) or _hm_norm(getattr(shift_def, "start_check_in", None))
    eo = _hm_norm(getattr(shift_def, "time_out", None))
    if not sw or not eo:
        return False
    return _hm_norm(getattr(rng, "range_start", None)) == sw and _hm_norm(getattr(rng, "range_end", None)) == eo


def _iter_ot_range_bounds(
    work_day: date, shift_def: Optional[AttendanceShift]
) -> List[Tuple[AttendanceShiftOtRange, datetime, datetime]]:
    """OT 표 행을 sort_order대로 해석. 전날 야간(17:31~00:00 등) 이후 행은 `re.date()`를 앵커로 익일 새벽·오전 구간에 붙인다.

    근태기준 UI에서 17:31~00:00 다음 05:31~12:00은 '익일 05:31~12:00' 의미인데,
    모든 시작/종료를 근무일(cur)만으로 `_combine_local(cur, …)` 하면 05:31이 당일로 잡혀
    익일 08:08 퇴근 타각이 OT 마감 밖으로 빠지는 문제가 생긴다.

    """
    if not shift_def:
        return []
    ranges = getattr(shift_def, "ot_ranges", None) or []
    if not ranges:
        return []
    out: List[Tuple[AttendanceShiftOtRange, datetime, datetime]] = []
    segment_base = work_day
    for rng in sorted(ranges, key=lambda r: int(getattr(r, "sort_order", 0) or 0)):
        rs = _combine_local(segment_base, getattr(rng, "range_start", None), next_day=False)
        re = _combine_local(segment_base, getattr(rng, "range_end", None), next_day=False)
        if not rs or not re:
            continue
        if re <= rs:
            re = _combine_local(segment_base, getattr(rng, "range_end", None), next_day=True)
        if not re or re <= rs:
            continue
        out.append((rng, rs, re))
        segment_base = re.date()
    return out


def _max_ot_range_end(work_day: date, shift_def: AttendanceShift) -> Optional[datetime]:
    """교대 OT 구간 중 시각상 가장 늦은 종료 시각(익일 정오 등 연속 OT 표 반영)."""
    segs = _iter_ot_range_bounds(work_day, shift_def)
    if not segs:
        return None
    return max(re for _, _, re in segs)


def _shift_earliest_checkin(anchor: date, shift_def: Optional[AttendanceShift]) -> Optional[datetime]:
    """해당 근무일(달력)에 배정된 교대의 '체크인 시작' 시각. 다음날 카드가 이 교대의 출근인지 판별."""
    if not shift_def:
        return None
    raw = (shift_def.start_check_in or shift_def.start_work or "").strip()
    if not raw:
        return None
    return _combine_local(anchor, raw, next_day=False)


def _is_cross_midnight_shift(shift_def: Optional[AttendanceShift]) -> bool:
    """근무시작~퇴근 핵심창이 자정을 넘기는 야간 교대인지."""
    if not shift_def:
        return False
    sw_raw = (shift_def.start_work or shift_def.start_check_in or "").strip()
    eo_raw = (shift_def.time_out or "").strip()
    sw_hm = _parse_hhmm(sw_raw)
    eo_hm = _parse_hhmm(eo_raw)
    if not sw_hm or not eo_hm:
        return False
    sw_min = sw_hm[0] * 60 + sw_hm[1]
    eo_min = eo_hm[0] * 60 + eo_hm[1]
    return eo_min <= sw_min


def _resolve_workday_shift(
    cur: date,
    cid: int,
    emp_id: int,
    *,
    shift_group_id: Optional[int],
    legacy_group_name: str,
    shift_st: Optional[EmployeeAttendanceShiftSetting],
    cal_index: Dict[Tuple[int, int, int, int], List[AttendanceWorkCalendar]],
    all_calendars: List[AttendanceWorkCalendar],
    shift_by_id: Dict[int, AttendanceShift],
    shift_by_co_code: Dict[Tuple[int, str], AttendanceShift],
    existing_day_by_emp_day: Dict[Tuple[int, date], AttendanceTimeDay],
) -> Tuple[str, Optional[AttendanceShift], bool, Optional[AttendanceWorkCalendarDay]]:
    cal_list = cal_index.get((cid, cur.year, cur.month, int(shift_group_id or 0)), [])
    cal: Optional[AttendanceWorkCalendar] = cal_list[0] if cal_list else None
    if not cal and legacy_group_name:
        for cals in all_calendars:
            if int(cals.company_id) != cid:
                continue
            if cals.calendar_year != cur.year or cals.calendar_month != cur.month:
                continue
            if (cals.shift_group_name or "").strip() == legacy_group_name:
                cal = cals
                break

    day_row: Optional[AttendanceWorkCalendarDay] = None
    if cal:
        day_row = next((x for x in cal.days if int(x.day_of_month) == cur.day), None)

    manual_day_row = existing_day_by_emp_day.get((emp_id, cur))
    manual_shift_code = (manual_day_row.shift_code or "").strip() if manual_day_row else ""
    shift_code = manual_shift_code or ((day_row.shift_code or "").strip() if day_row else "")
    is_workday = bool(day_row.is_workday) if day_row else True
    if not shift_code and shift_st:
        wd_ix = cur.weekday()
        mapping = [
            shift_st.mon_shift_id,
            shift_st.tue_shift_id,
            shift_st.wed_shift_id,
            shift_st.thu_shift_id,
            shift_st.fri_shift_id,
            shift_st.sat_shift_id,
            shift_st.sun_shift_id,
        ]
        sid = mapping[wd_ix] if 0 <= wd_ix < len(mapping) else None
        if sid and sid in shift_by_id:
            shift_code = (shift_by_id[sid].shift_code or "").strip()

    shift_def: Optional[AttendanceShift] = None
    if shift_code:
        shift_def = shift_by_co_code.get((cid, shift_code.lower()))
    return shift_code, shift_def, is_workday, day_row


def _time_out_cross_midnight(
    work_day: date,
    emp_id: int,
    punches_same_day: List[datetime],
    punch_by_emp_day: DefaultDict[Tuple[int, date], List[datetime]],
    shift_def: Optional[AttendanceShift],
    deadline: Optional[datetime],
    shift_def_on: Callable[[date], Optional[AttendanceShift]],
) -> Optional[datetime]:
    """교대 OT 구간 종료(deadline)까지 타각을 보고, 익일(근무일+1달력일)의 '체크인 시작' 이전 카드만 전일 퇴근으로 귀속.

    OT deadline이 멀리까지 잡혀 있어도 모레 이후 달력일로 퇴근 후보를 밀지 않는다.
    """
    if not punches_same_day:
        return None
    time_in = punches_same_day[0]
    base_out = punches_same_day[-1] if len(punches_same_day) > 1 else punches_same_day[0]
    if not shift_def or not getattr(shift_def, "ot_ranges", None) or not deadline:
        return base_out
    last_assigned = base_out
    for p in punches_same_day:
        if p >= time_in and p <= deadline:
            last_assigned = p
    next_cal_day = work_day + timedelta(days=1)
    gate = _shift_earliest_checkin(next_cal_day, shift_def_on(next_cal_day))
    for p in sorted(punch_by_emp_day.get((emp_id, next_cal_day), [])):
        if p > deadline:
            return last_assigned
        if gate is not None and p >= gate:
            return last_assigned
        last_assigned = p
    return last_assigned


def _fallback_time_out_from_following_days(
    work_day: date,
    emp_id: int,
    time_in: datetime,
    punch_by_emp_day: DefaultDict[Tuple[int, date], List[datetime]],
    max_days: int = 1,
) -> Optional[datetime]:
    """당일 카드만 있고 퇴근이 익일인 야간 근무: 익일(근무일+1일) 범위의 첫 타각만 퇴근 후보로 사용."""
    ti = time_in.replace(microsecond=0)
    for ddelta in range(1, max_days + 1):
        nx = work_day + timedelta(days=ddelta)
        for p in sorted(punch_by_emp_day.get((emp_id, nx), [])):
            pt = p.replace(microsecond=0)
            if pt > ti:
                return pt
    return None


def _daily_work_minutes(settings: Optional[AttendanceCompanySettings]) -> int:
    if not settings:
        return 480
    p = _parse_hhmm(settings.daily_work_hours)
    if not p:
        return 480
    return p[0] * 60 + p[1]


def _coerce_dt(p: AttendanceTimeInOut) -> Optional[datetime]:
    return p.date_in_out or p.date_i


def _is_monthly_pay(emp: Employee, type_by_code: Dict[str, EmployeeType]) -> bool:
    code = (emp.salary_process_type or "").strip()
    if not code:
        return True
    et = type_by_code.get(code.lower())
    if et:
        for nm in (et.name_kor, et.name_eng, et.name_thai):
            if not nm:
                continue
            n = nm.lower()
            if "월" in nm or "month" in n or "monthly" in n or "m" == n.strip():
                return True
            if "시" in nm or "일" in nm or "daily" in n or "hour" in n or "d" == n.strip():
                return False
    c = code.lower()
    if c in ("m", "monthly", "month"):
        return True
    if c in ("d", "daily", "day", "hourly"):
        return False
    return True


def _round_with_section(raw: int, sec: Optional[AttendanceRoundUpSection]) -> int:
    if raw <= 0 or not sec or not sec.tiers:
        return raw
    tiers = sorted(sec.tiers, key=lambda t: (t.value_from, t.row_index))
    for t in tiers:
        if t.value_from <= raw <= t.value_to:
            return int(t.rounded_minutes)
    return raw


def _round_ot_daily_minutes(raw: int, sec: Optional[AttendanceRoundUpSection]) -> int:
    """일별 OT 반올림.

    OT 반올림 구간이 0~59분 기반으로 저장된 회사는
    총 OT분 전체가 아니라 "시간 나머지 분"에 반올림을 적용한다.
    예) 99분(1:39), 39분→30분 이면 최종 90분(1:30).

    나머지 분 표가 46~59분 등을 "60분(다음 정각)"으로 올리면,
    실근무 2:48(168분)이 3:00(180분)처럼 **타각·OT표로 합산한 분(raw)을 넘는** 결과가 나올 수 있다.
    이 경우 표 적용 후 **raw 이하로 상한**을 걸고, 30분 이상 구간은 **30분 단위 내림**해
    02:48 → 02:30 과 같이 과다 집계를 막는다. 30분 미만은 그대로 둔다(소액 OT 소멸 방지).
    """
    if raw <= 0 or not sec or not sec.tiers:
        return raw
    tiers = list(sec.tiers)
    # 일부 회사는 분 반올림 표에 "60 -> 60" 행을 함께 저장한다.
    # 이 경우도 "시간+나머지분" 반올림으로 해석해야 한다.
    only_minute_bucket = bool(tiers) and all(
        int(getattr(t, "value_from", 0)) >= 0 and int(getattr(t, "value_to", 0)) <= 60 for t in tiers
    )
    if not only_minute_bucket:
        return _round_with_section(raw, sec)
    base_hour = raw // 60
    minute_part = raw % 60
    rounded_minute = _round_with_section(minute_part, sec)
    sub = base_hour * 60 + rounded_minute
    if sub > raw:
        sub = raw
    if sub >= 30:
        sub = (sub // 30) * 30
    return sub


def _leave_approved(st: Optional[str]) -> bool:
    if not st:
        return True
    s = st.strip().lower()
    return s in ("approved", "approve", "승인", "승인완료", "completed", "complete")


def _leave_unpaid(leave: Leave) -> bool:
    t = (leave.leave_type or "").lower()
    return "unpaid" in t or "무급" in t or "without" in t


def _oth_index_from_rate(rate: Decimal) -> Optional[int]:
    """OT 배수 → oth1..oth6 인덱스 0..5. 표에 없는 배수는 None(해당 분 집계 생략)."""
    try:
        x = float(rate)
    except Exception:
        return None
    if x <= 0 or math.isnan(x):
        return None
    for i, t in enumerate([1.0, 1.5, 2.0, 2.5, 3.0]):
        if math.isclose(x, t, rel_tol=0.02, abs_tol=0.02):
            return i
    if x > 3.0:
        return 5
    return None


def _day_band(
    d: date,
    company_id: int,
    holiday_dates: Set[Tuple[int, date]],
    is_calendar_workday: Optional[bool] = None,
) -> str:
    """OT·식대 등 배수 구간용: `holiday` / `sun` / `wd`.

    - 회사 법정·연휴(`AttendanceCompanyHoliday`) → 휴일 칸
    - 일요일 → 일요일 칸
    - 근무달력에서 **유급 근무일이 아님**(`is_workday` False) → 휴일 칸 (토요 휴무 등 달력 휴일과 OT표 휴일열을 맞춤)
    - 그 외 → 평일 칸
    """
    if (company_id, d) in holiday_dates:
        return "holiday"
    if d.weekday() == 6:
        return "sun"
    if is_calendar_workday is False:
        return "holiday"
    return "wd"


def _ot_rate_for_range(
    rng: AttendanceShiftOtRange,
    monthly: bool,
    band: str,
) -> Optional[Decimal]:
    """해당 일자·급여형태·OT 구간의 배수. 비어 있거나 0이면 이 구간은 OT로 집계하지 않음."""
    if monthly:
        if band == "holiday":
            v = rng.monthly_rate_holiday
        elif band == "sun":
            v = rng.monthly_rate_b
        else:
            v = rng.monthly_rate_a
    else:
        if band == "holiday":
            v = rng.daily_rate_holiday
        elif band == "sun":
            v = rng.daily_rate_b
        else:
            v = rng.daily_rate_a
    if v is None:
        return None
    try:
        d = Decimal(str(v))
    except Exception:
        return None
    if d <= 0:
        return None
    return d


def _int_nonneg(v: Any) -> int:
    try:
        return max(0, int(v))
    except (TypeError, ValueError):
        return 0


def _approved_status(st: Optional[str]) -> bool:
    if not st:
        return True
    s = str(st).strip().lower()
    return s in ("approved", "approve", "승인", "승인완료", "completed", "complete")


def _parse_minutes_hhmm(raw: Any) -> int:
    p = _parse_hhmm(str(raw or "").strip())
    if not p:
        return 0
    return max(0, int(p[0]) * 60 + int(p[1]))


def _minutes_to_buckets_for_interval(
    day: date,
    start_dt: datetime,
    end_dt: datetime,
    shift_def: Optional[AttendanceShift],
    monthly_pay: bool,
    band: str,
) -> List[int]:
    """구간 [start_dt, end_dt)를 교대 OT 표(시간대·배수)와 교집합만 버킷에 넣는다.

    - OT 표 행이 없거나(`None`·빈 목록) 비어 있으면 타각 OT 분은 **0**(임의로 oth1에 넣지 않음).
      Python에서 `not []`가 참이라 예전에는 빈 표인 야간 교대가 전 구간 oth1로 쌓이는 문제가 있었다.
    - 행이 있으면 **배수가 정의된(0·빈칸이 아닌) 교집합 분만** 해당 버킷에 합산한다.
      평일 0배·빈 칸 구간은 집계하지 않으며 잔여를 oth1로 흘리지 않는다.
    """
    out = [0, 0, 0, 0, 0, 0]
    lo = start_dt.replace(microsecond=0)
    hi = end_dt.replace(microsecond=0)
    if hi <= lo:
        return out
    if not shift_def:
        return out
    try:
        _ot_rows = list(getattr(shift_def, "ot_ranges", ()) or ())
    except TypeError:
        _ot_rows = []
    if len(_ot_rows) == 0:
        return out
    for rng, rs, re in _iter_ot_range_bounds(day, shift_def):
        seg_lo = max(lo, rs.replace(microsecond=0))
        seg_hi = min(hi, re.replace(microsecond=0))
        if seg_hi <= seg_lo:
            continue
        mins = int((seg_hi - seg_lo).total_seconds() // 60)
        if mins <= 0:
            continue
        # 핵심 근무창(start_work~time_out)과 동일한 OT 표 행에서는 휴식합계(break_sum)를 차감한다.
        # 일요/휴일에 핵심 근무창 자체를 OT로 집계하는 경우(예: D4 08:00~17:00, 일요일 1배)
        # break_sum 미차감 시 9:00처럼 과다 집계되므로, 교대 공통 규칙으로 분 단위 차감한다.
        if _ot_range_matches_core_shift(rng, shift_def):
            mins = max(0, mins - _break_sum_minutes(shift_def))
            if mins <= 0:
                continue
        rate = _ot_rate_for_range(rng, monthly_pay, band)
        if rate is None:
            continue
        bi = _oth_index_from_rate(rate)
        if bi is None:
            continue
        out[bi] += mins
    return out


def _compute_punch_ot_buckets(
    work_day: date,
    time_in: Optional[datetime],
    time_out: Optional[datetime],
    shift_def: Optional[AttendanceShift],
    monthly_pay: bool,
    band: str,
) -> List[int]:
    """정규 근로 시작·종료(`start_work`~`time_out`) 밖의 실근무 구간을 OT로 분배.

    - 정규 시작 전 출근: [실출근, 정규시작) 교차 구간
    - 정규 종료 후 근무: [정규종료, 실퇴근) 교차 구간
    교대에 근무 시작·퇴근 시각이 없으면 0.

    야간 교대(NN 등): 근무시작·퇴근이 서로 다른 달력일이면 핵심 근무창이 자정을 넘긴다.
    **평일(`wd`)** 에는 근무시작(`start_work`) 이전의 조기 출근(예: 19:23~20:00)이
    OT 표의 낮 구간(12:01~20:00)과 겹쳐 1.5배로 잡힐 수 있으나, 현장 규칙상 야간 핵심(20:00~익일 퇴근시각) **이후**
    익일 새벽 OT(05:31~…)만 집계하는 경우가 많아 이 구간은 타각 OT에서 제외한다.
    일요·휴일(`sun`/`holiday`)은 기존처럼 시작 전 구간도 OT 표로 분배한다.
    """
    out = [0, 0, 0, 0, 0, 0]
    if not time_in or not time_out or not shift_def:
        return out
    lo = time_in.replace(microsecond=0)
    hi = time_out.replace(microsecond=0)
    # 익일 새벽 퇴근이 같은 달력일·이른 시각으로만 들어온 경우(야간 NN 등)
    if hi <= lo:
        hi = hi + timedelta(days=1)
    if hi <= lo:
        return out
    st_in_s = (shift_def.start_work or shift_def.start_check_in or "").strip()
    st_out_s = (shift_def.time_out or "").strip()
    if not st_in_s or not st_out_s:
        return out
    sw = _combine_local(work_day, st_in_s, next_day=False)
    ew = _combine_local(work_day, st_out_s, next_day=False)
    if not sw or not ew:
        return out
    if ew <= sw:
        ew = _combine_local(work_day, st_out_s, next_day=True)

    # 야간 핵심: 정규 시작·종료가 서로 다른 달력일(대개 start_work 당일 저녁 ~ 익일 새벽 time_out)
    night_core_cross_midnight = sw.date() != ew.date() and ew > sw
    skip_pre_start_on_weekday_night = bool(night_core_cross_midnight and band == "wd")

    intervals: List[Tuple[datetime, datetime]] = []
    # 일요/휴일 근무는 핵심 근무창(sw~ew)도 OT 표로 집계한다.
    # (예: D4 일요일 08:00~17:00은 OT 1배)
    if band in ("sun", "holiday"):
        core_lo = max(lo, sw)
        core_hi = min(hi, ew)
        if core_hi > core_lo:
            intervals.append((core_lo, core_hi))
    if lo < sw and not skip_pre_start_on_weekday_night:
        seg_hi = min(hi, sw)
        if seg_hi > lo:
            intervals.append((lo, seg_hi))
    if hi > ew:
        seg_lo = max(lo, ew)
        if hi > seg_lo:
            intervals.append((seg_lo, hi))

    for a, b in intervals:
        bks = _minutes_to_buckets_for_interval(work_day, a, b, shift_def, monthly_pay, band)
        for j in range(6):
            out[j] += int(bks[j] or 0)
    return out


def _collect_auto_ot_day_buckets(
    cur: date,
    emp_id: int,
    time_in: Optional[datetime],
    time_out: Optional[datetime],
    shift_def: Optional[AttendanceShift],
    monthly_pay: bool,
    ot_band: str,
    suppress_holiday_calendar_ot: bool,
    additional_by_emp_day: DefaultDict[Tuple[int, date], List[AttendanceAdditionalOt]],
    special_by_emp_day: DefaultDict[Tuple[int, date], List[AttendanceSpecialOt]],
) -> Tuple[List[int], List[int], List[int]]:
    """자동OT가 켜졌을 때(휴일제외로 막히지 않은 날) 당일 합산될 타각·추가·특별 OT 버킷."""
    z = [0, 0, 0, 0, 0, 0]
    if suppress_holiday_calendar_ot:
        return z[:], z[:], z[:]
    punch = _compute_punch_ot_buckets(cur, time_in, time_out, shift_def, monthly_pay, ot_band)
    add = [0, 0, 0, 0, 0, 0]
    for ao in additional_by_emp_day.get((emp_id, cur), []):
        st = str(getattr(ao, "ot_start", "") or "")
        ed = str(getattr(ao, "ot_end", "") or "")
        sa = _combine_local(cur, st, next_day=False)
        ea = _combine_local(cur, ed, next_day=False)
        if not sa or not ea:
            continue
        if ea <= sa:
            ea = _combine_local(cur, ed, next_day=True)
        if not ea or ea <= sa:
            continue
        bks = _minutes_to_buckets_for_interval(cur, sa, ea, shift_def, monthly_pay, ot_band)
        for j in range(6):
            add[j] += int(bks[j] or 0)
    special = [0, 0, 0, 0, 0, 0]
    for so in special_by_emp_day.get((emp_id, cur), []):
        special[0] += _parse_minutes_hhmm(getattr(so, "ot_1", None))
        special[1] += _parse_minutes_hhmm(getattr(so, "ot_1_5", None))
        special[2] += _parse_minutes_hhmm(getattr(so, "ot_2", None))
        special[3] += _parse_minutes_hhmm(getattr(so, "ot_2_5", None))
        special[4] += _parse_minutes_hhmm(getattr(so, "ot_3", None))
        special[5] += _parse_minutes_hhmm(getattr(so, "ot_6", None))
    return punch, add, special


def _extract_prev_applied(row: Optional[AttendanceTimeDay], prefix: str) -> List[int]:
    out = [0, 0, 0, 0, 0, 0]
    if not row:
        return out
    for i in range(6):
        key = f"{prefix}_oth{i + 1}"
        out[i] = _int_nonneg(getattr(row, key, None))
    return out


def _fmt_minutes_hhmm(total_minutes: int) -> str:
    """비고용 시:분 (예: 90 → 01:30)."""
    m = max(0, int(total_minutes))
    h, mi = divmod(m, 60)
    return f"{h:02d}:{mi:02d}"


def _food_allowance_base_from_shift(
    shift_def: Optional[AttendanceShift],
    monthly_pay: bool,
    band: str,
) -> int:
    """일반 식대(food_allowance).

    - OT 표 하단 「조퇴·식대」(`shift_allowance_early_food_json`)이 **enabled**이면
      월급(M)/시급(D)×평일·일요·휴일(band) 값만 사용한다.
    - 그렇지 않으면 **휴일·지각·조퇴·휴가** 표 식대(`food_monthly`/`food_daily`)와
      구 `allowance_food_*` 중 큰 값만 쓴다(동일 금액이 양쪽에 있으면 이중 지급 방지).
    """
    if not shift_def:
        return 0
    raw = getattr(shift_def, "shift_allowance_early_food_json", None)
    if isinstance(raw, dict) and raw.get("enabled"):
        pay_key = "monthly" if monthly_pay else "daily"
        sub = raw.get(pay_key)
        if not isinstance(sub, dict):
            return 0
        if band == "holiday":
            return _int_nonneg(sub.get("holiday"))
        if band == "sun":
            return _int_nonneg(sub.get("sunday"))
        return _int_nonneg(sub.get("weekday"))

    grid_amt = _int_nonneg(getattr(shift_def, "food_monthly", None)) if monthly_pay else _int_nonneg(
        getattr(shift_def, "food_daily", None)
    )
    if monthly_pay:
        legacy = _int_nonneg(getattr(shift_def, "allowance_food_monthly", None))
    else:
        daily = _int_nonneg(getattr(shift_def, "allowance_food_daily", None))
        legacy = daily if daily else _int_nonneg(getattr(shift_def, "allowance_food", None))
    return max(grid_amt, legacy)


def _ot_food_allowance_from_shift(
    shift_def: Optional[AttendanceShift],
    monthly_pay: bool,
    band: str,
    early_minutes: int,
) -> int:
    """OT 식대(조퇴 포함·식대).

    - 값 소스: OT 표 하단 `shift_allowance_early_food_json`의 월급/시급 × 평일/일요/휴일.
    - `enabled=True`이면 조퇴가 있어도 지급, `enabled=False`이면 조퇴일 때 미지급.
    - JSON이 없거나 값이 0이면 0.
    """
    if not shift_def:
        return 0
    raw = getattr(shift_def, "shift_allowance_early_food_json", None)
    if not isinstance(raw, dict):
        return 0
    include_when_early = bool(raw.get("enabled"))
    if early_minutes > 0 and not include_when_early:
        return 0
    pay_key = "monthly" if monthly_pay else "daily"
    sub = raw.get(pay_key)
    if not isinstance(sub, dict):
        return 0
    if band == "holiday":
        return _int_nonneg(sub.get("holiday"))
    if band == "sun":
        return _int_nonneg(sub.get("sunday"))
    return _int_nonneg(sub.get("weekday"))


class AttendanceAggregateService:
    def __init__(self, db: Session):
        self.db = db

    def _allowed_company_ids(self, user: User) -> List[int]:
        return SystemRbacService(self.db).get_user_company_ids(user.id, current_user=user)

    def iter_run(
        self,
        user: User,
        date_from: date,
        date_to: date,
        company_id: Optional[int] = None,
        employee_ids: Optional[List[int]] = None,
        work_dates: Optional[Set[date]] = None,
        *,
        preserve_manual_ot: bool = False,
    ) -> Iterator[Dict[str, Any]]:
        """직원 단위로 진행률 이벤트를 내보낸 뒤 최종 결과를 `type==done` 으로 반환.

        work_dates가 주어지면 해당 일자만 집계하며, 조회 구간은 min~max로 자동 좁힙니다.

        preserve_manual_ot: False(기본)이면 oth1~6은 타각·추가·특별 자동분만 저장(과거 잘못된 oth·agg 불일치로 남은 수기 잔여 미보존).
        True이면 기존처럼 (저장된 oth − 직전 agg_* 적용분)을 수기로 간주해 자동분과 합산합니다.
        """
        allowed = self._allowed_company_ids(user)
        if not allowed:
            raise ValueError("접근 가능한 회사가 없습니다.")
        only_days: Optional[FrozenSet[date]] = None
        if work_dates is not None:
            if len(work_dates) == 0:
                raise ValueError("work_dates가 비어 있습니다.")
            only_days = frozenset(work_dates)
            date_from = min(work_dates)
            date_to = max(work_dates)
        if date_from > date_to:
            raise ValueError("시작일이 종료일보다 늦습니다.")
        if company_id is not None and company_id not in allowed:
            raise ValueError("회사를 찾을 수 없습니다.")

        warnings: List[str] = []
        unmapped: List[str] = [
            "근태마스터 「자동OT생성」이 꺼진 직원은 집계 시 oth1~6·agg_*·othb(OT분 0일 때)를 모두 0으로 맞춥니다. 켜진 직원만 타각·추가·특별 OT를 집계합니다.",
            "기본 정책: 일괄 집계 시 oth1~6은 이전 행에서 남은 「수기 잔여」를 더하지 않고, 타각·추가·특별 OT 자동분만 저장합니다. 화면에서 oth를 직접 넣은 값을 직전 집계분과 합산해 유지하려면 API 본문에 preserve_manual_ot: true 를 넣습니다.",
            "타각 OT는 교대의 근무시작·퇴근 시각 바깥 구간만 OT 표(월급/시급·평일/일요/휴일) 배수로 나눕니다. 칸이 비어 있거나 0이면 해당 교집합 분은 어떤 oth 버킷에도 넣지 않습니다.",
            "일반 식대(food_allowance)는 출근(time_in)이 있을 때만 지급합니다. 조퇴·식대 JSON이 enabled이면 그 표만 쓰고, 아니면 food_monthly/food_daily와 allowance_food_* 중 큰 값만 사용합니다.",
            "overtime_pay_local(태국어 현지 OT표시 등)은 별도 단가 테이블이 없어 집계하지 않습니다. othb는 근태마스터 OT 탭의 OT6 시간당(바트)이 있을 때만 총 OT분×단가로 채웁니다.",
            "휴가는 DB `leaves` 테이블(승인 건)만 집계하며, 휴가관리 UI 전용 테이블이 따로 있으면 연동이 필요합니다.",
            "반올림은 회사당 `lateness`/`early_checkout`/`ot` 탭의 첫 번째 섹션만 적용합니다(복수 섹션은 미적용).",
            "추가OT는 해당 일자의 교대 OT 시간대와 월급/시급·평일/일요/휴일 배수로 분배합니다. 배수가 없는 교집합 분은 oth에 넣지 않습니다.",
            "특별OT는 date_from~date_to 기간의 각 일자에 OT1/1.5/2/2.5/3/6 값을 분 단위로 합산합니다.",
        ]

        q = self.db.query(Employee).filter(
            or_(Employee.company_id.is_(None), Employee.company_id.in_(allowed)),
        )
        if company_id is not None:
            q = q.filter(Employee.company_id == company_id)
        if employee_ids:
            q = q.filter(Employee.id.in_(employee_ids))
        q = q.filter(func.coalesce(Employee.status, "active") == "active")
        employees: List[Employee] = q.all()
        if not employees:
            yield {
                "type": "done",
                "result": {
                    "ok": True,
                    "employee_count": 0,
                    "day_rows_written": 0,
                    "warnings": warnings + ["대상 직원이 없습니다."],
                    "unmapped_or_partial": unmapped,
                },
            }
            return

        emp_ids = [e.id for e in employees if e.id]
        co_ids = list({int(e.company_id) for e in employees if e.company_id})

        type_by_code: Dict[str, EmployeeType] = {}
        if co_ids:
            for et in self.db.query(EmployeeType).filter(EmployeeType.company_id.in_(co_ids)).all():
                type_by_code[(et.employee_type_code or "").strip().lower()] = et

        masters = (
            self.db.query(EmployeeAttendanceMaster)
            .options(
                joinedload(EmployeeAttendanceMaster.basic),
                joinedload(EmployeeAttendanceMaster.ot),
                joinedload(EmployeeAttendanceMaster.special_charges),
                joinedload(EmployeeAttendanceMaster.shift_setting),
            )
            .filter(EmployeeAttendanceMaster.employee_id.in_(emp_ids))
            .all()
        )
        master_by_emp: Dict[int, EmployeeAttendanceMaster] = {m.employee_id: m for m in masters}

        shifts: List[AttendanceShift] = (
            self.db.query(AttendanceShift)
            .options(joinedload(AttendanceShift.ot_ranges))
            .filter(AttendanceShift.company_id.in_(co_ids))
            .all()
        )
        shift_by_co_code: Dict[Tuple[int, str], AttendanceShift] = {}
        shift_by_id: Dict[int, AttendanceShift] = {}
        for sh in shifts:
            shift_by_id[sh.id] = sh
            key = (int(sh.company_id), (sh.shift_code or "").strip().lower())
            shift_by_co_code[key] = sh

        settings_by_co: Dict[int, AttendanceCompanySettings] = {}
        for s in self.db.query(AttendanceCompanySettings).filter(AttendanceCompanySettings.company_id.in_(co_ids)).all():
            settings_by_co[int(s.company_id)] = s

        round_sections = (
            self.db.query(AttendanceRoundUpSection)
            .options(joinedload(AttendanceRoundUpSection.tiers))
            .filter(AttendanceRoundUpSection.company_id.in_(co_ids))
            .all()
        )
        late_sec_by_co: Dict[int, Optional[AttendanceRoundUpSection]] = {}
        early_sec_by_co: Dict[int, Optional[AttendanceRoundUpSection]] = {}
        ot_sec_by_co: Dict[int, Optional[AttendanceRoundUpSection]] = {}
        for sec in round_sections:
            cid = int(sec.company_id)
            if sec.tab_key == "lateness" and cid not in late_sec_by_co:
                late_sec_by_co[cid] = sec
            elif sec.tab_key == "early_checkout" and cid not in early_sec_by_co:
                early_sec_by_co[cid] = sec
            elif sec.tab_key in ("ot", "overtime", "ot_rounding") and cid not in ot_sec_by_co:
                ot_sec_by_co[cid] = sec

        holiday_dates: Set[Tuple[int, date]] = set()
        holiday_remarks_by_date: Dict[Tuple[int, date], str] = {}
        for h in (
            self.db.query(AttendanceCompanyHoliday)
            .filter(AttendanceCompanyHoliday.company_id.in_(co_ids))
            .filter(AttendanceCompanyHoliday.holiday_date >= date_from)
            .filter(AttendanceCompanyHoliday.holiday_date <= date_to)
            .all()
        ):
            key = (int(h.company_id), h.holiday_date)
            holiday_dates.add(key)
            holiday_remarks_by_date[key] = (h.remarks or "").strip()

        month_keys: Set[Tuple[int, int, int]] = set()
        d = date_from
        while d <= date_to:
            for cid in co_ids:
                month_keys.add((cid, d.year, d.month))
            d += timedelta(days=1)

        calendars: List[AttendanceWorkCalendar] = (
            self.db.query(AttendanceWorkCalendar)
            .options(joinedload(AttendanceWorkCalendar.days))
            .filter(AttendanceWorkCalendar.company_id.in_(co_ids))
            .filter(
                tuple_(
                    AttendanceWorkCalendar.company_id,
                    AttendanceWorkCalendar.calendar_year,
                    AttendanceWorkCalendar.calendar_month,
                ).in_(list(month_keys))
            )
            .all()
        )
        cal_index: Dict[Tuple[int, int, int, int], List[AttendanceWorkCalendar]] = defaultdict(list)
        for cal in calendars:
            cal_index[(int(cal.company_id), int(cal.calendar_year), int(cal.calendar_month), int(cal.shift_group_id))].append(
                cal
            )

        punches = (
            self.db.query(AttendanceTimeInOut)
            .filter(AttendanceTimeInOut.status_del.is_(False))
            .filter(AttendanceTimeInOut.employee_id.in_(emp_ids))
            .filter(
                func.coalesce(AttendanceTimeInOut.date_in_out, AttendanceTimeInOut.date_i) >= datetime(
                    date_from.year, date_from.month, date_from.day
                )
            )
            .filter(
                func.coalesce(AttendanceTimeInOut.date_in_out, AttendanceTimeInOut.date_i)
                <= datetime(
                    (date_to + timedelta(days=2)).year,
                    (date_to + timedelta(days=2)).month,
                    (date_to + timedelta(days=2)).day,
                    23,
                    59,
                    59,
                )
            )
            .all()
        )
        punch_by_emp_day: DefaultDict[Tuple[int, date], List[datetime]] = defaultdict(list)
        for p in punches:
            dt = _coerce_dt(p)
            if not dt:
                continue
            punch_by_emp_day[(int(p.employee_id), dt.date())].append(dt)

        leaves = (
            self.db.query(Leave)
            .filter(Leave.employee_id.in_(emp_ids))
            .filter(Leave.end_date >= date_from)
            .filter(Leave.start_date <= date_to)
            .all()
        )
        leaves_by_emp: DefaultDict[int, List[Leave]] = defaultdict(list)
        for lv in leaves:
            leaves_by_emp[int(lv.employee_id)].append(lv)

        existing_day_rows = (
            self.db.query(AttendanceTimeDay)
            .filter(AttendanceTimeDay.employee_id.in_(emp_ids))
            .filter(AttendanceTimeDay.work_day >= date_from)
            .filter(AttendanceTimeDay.work_day <= date_to)
            .all()
        )
        existing_day_by_emp_day: Dict[Tuple[int, date], AttendanceTimeDay] = {
            (int(r.employee_id), r.work_day): r for r in existing_day_rows if r.work_day
        }
        lock_svc = AttendancePeriodLockService(self.db)
        closed_day_map_by_company: Dict[int, Dict[str, bool]] = {}
        for cid in co_ids:
            closed_day_map_by_company[int(cid)] = lock_svc.build_closed_day_map(int(cid), date_from, date_to)

        additional_by_emp_day: DefaultDict[Tuple[int, date], List[AttendanceAdditionalOt]] = defaultdict(list)
        additional_rows = (
            self.db.query(AttendanceAdditionalOt)
            .filter(AttendanceAdditionalOt.employee_id.in_(emp_ids))
            .filter(AttendanceAdditionalOt.work_date >= date_from)
            .filter(AttendanceAdditionalOt.work_date <= date_to)
            .all()
        )
        for ao in additional_rows:
            if not _approved_status(getattr(ao, "approve_status", None)):
                continue
            if bool(getattr(ao, "block_payment", False)):
                continue
            wd = getattr(ao, "work_date", None)
            if wd is None:
                continue
            additional_by_emp_day[(int(ao.employee_id), wd)].append(ao)

        special_by_emp_day: DefaultDict[Tuple[int, date], List[AttendanceSpecialOt]] = defaultdict(list)
        special_rows = (
            self.db.query(AttendanceSpecialOt)
            .filter(AttendanceSpecialOt.employee_id.in_(emp_ids))
            .filter(AttendanceSpecialOt.date_from <= date_to)
            .filter(AttendanceSpecialOt.date_to >= date_from)
            .all()
        )
        for so in special_rows:
            if not _approved_status(getattr(so, "status", None)):
                continue
            df = getattr(so, "date_from", None)
            dt = getattr(so, "date_to", None)
            if not df or not dt:
                continue
            s = max(df, date_from)
            e = min(dt, date_to)
            cur_d = s
            while cur_d <= e:
                special_by_emp_day[(int(so.employee_id), cur_d)].append(so)
                cur_d += timedelta(days=1)

        day_svc = AttendanceTimeDayService(self.db)
        rows_written = 0
        n_emp = len(employees)

        try:
            for i, emp in enumerate(employees):
                if not emp.id or not emp.company_id:
                    warnings.append(f"직원 {emp.id} ({emp.name}): company_id 없음 — 건너뜀")
                    yield {
                        "type": "progress",
                        "done": i + 1,
                        "total": n_emp,
                        "percent": int(100 * (i + 1) / n_emp) if n_emp else 100,
                    }
                    continue
                cid = int(emp.company_id)
                master = master_by_emp.get(int(emp.id))
                basic: Optional[EmployeeAttendanceMasterBasic] = master.basic if master else None
                ot_m: Optional[EmployeeAttendanceMasterOt] = master.ot if master else None
                shift_st: Optional[EmployeeAttendanceShiftSetting] = master.shift_setting if master else None
                calc_ot = bool(ot_m and getattr(ot_m, "auto_ot_on_holiday", False))
                exclude_non_wd_ot = bool(ot_m and getattr(ot_m, "auto_ot_exclude_holidays", False))

                shift_group_id: Optional[int] = int(basic.master_shiftwork_id) if basic and basic.master_shiftwork_id else None
                legacy_group_name = (basic.master_shiftwork or "").strip() if basic else ""

                co_settings = settings_by_co.get(cid)
                daily_min = _daily_work_minutes(co_settings)
                monthly_pay = _is_monthly_pay(emp, type_by_code)

                fuel_amt, stand_amt, other_amt = _attendance_master_special_allowances(master)

                spill_closing_punch: Optional[datetime] = None
                cur = date_from
                while cur <= date_to:
                    if closed_day_map_by_company.get(cid, {}).get(cur.isoformat(), False):
                        cur += timedelta(days=1)
                        continue
                    if spill_closing_punch is not None and spill_closing_punch.date() < cur:
                        spill_closing_punch = None
                    if only_days is not None and cur not in only_days:
                        cur += timedelta(days=1)
                        continue
                    shift_code, shift_def, is_workday, day_row = _resolve_workday_shift(
                        cur,
                        cid,
                        int(emp.id),
                        shift_group_id=shift_group_id,
                        legacy_group_name=legacy_group_name,
                        shift_st=shift_st,
                        cal_index=cal_index,
                        all_calendars=calendars,
                        shift_by_id=shift_by_id,
                        shift_by_co_code=shift_by_co_code,
                        existing_day_by_emp_day=existing_day_by_emp_day,
                    )
                    manual_day_row = existing_day_by_emp_day.get((int(emp.id), cur))

                    band = _day_band(cur, cid, holiday_dates, is_calendar_workday=is_workday)
                    # 자동OT생성: 타각 OT + 추가OT + 특별OT를 근무달력(`is_workday`, `ot_band`) 기준으로 가산.
                    # 휴일제외: 달력상 비근무일이어도 **해당 일에 교대가 배정된 경우**는 타각 OT를 집계한다.
                    # (일요·휴무일이어도 D4 등 교대가 찍혀 있으면 OT표의 일요/휴일 칸을 써야 함)
                    has_assigned_shift = bool((shift_code or "").strip() and shift_def)
                    suppress_holiday_calendar_ot = bool(
                        calc_ot and exclude_non_wd_ot and not is_workday and not has_assigned_shift
                    )
                    calc_ot_day = bool(calc_ot and not suppress_holiday_calendar_ot)
                    raw_pd = sorted(punch_by_emp_day.get((int(emp.id), cur), []))
                    if spill_closing_punch is not None and spill_closing_punch.date() == cur:
                        sp0 = spill_closing_punch.replace(microsecond=0)
                        raw_pd = [p for p in raw_pd if p.replace(microsecond=0) != sp0]
                    # 야간 교대에서 당일 새벽 카드(예: 03:53)와 당일 저녁 출근 카드(예: 19:59)가 함께 있으면
                    # 새벽 카드는 전일 퇴근 후보로만 쓰고, 당일 출근/퇴근 계산에서는 제외한다.
                    # (전일 집계는 _time_out_cross_midnight 에서 punch_by_emp_day 원본을 사용하므로 영향 없음)
                    if raw_pd and _is_cross_midnight_shift(shift_def):
                        gate_today = _shift_earliest_checkin(cur, shift_def)
                        if gate_today is not None:
                            has_before_gate = any(p < gate_today for p in raw_pd)
                            has_after_gate = any(p >= gate_today for p in raw_pd)
                            if has_before_gate and has_after_gate:
                                raw_pd = [p for p in raw_pd if p >= gate_today]
                    punches_day = raw_pd
                    time_in = punches_day[0] if punches_day else None
                    deadline_ot = _max_ot_range_end(cur, shift_def) if shift_def else None

                    def _shift_def_for_calendar_day(d: date) -> Optional[AttendanceShift]:
                        _, sd, _, _ = _resolve_workday_shift(
                            d,
                            cid,
                            int(emp.id),
                            shift_group_id=shift_group_id,
                            legacy_group_name=legacy_group_name,
                            shift_st=shift_st,
                            cal_index=cal_index,
                            all_calendars=calendars,
                            shift_by_id=shift_by_id,
                            shift_by_co_code=shift_by_co_code,
                            existing_day_by_emp_day=existing_day_by_emp_day,
                        )
                        return sd

                    time_out = (
                        _time_out_cross_midnight(
                            cur,
                            int(emp.id),
                            punches_day,
                            punch_by_emp_day,
                            shift_def,
                            deadline_ot,
                            _shift_def_for_calendar_day,
                        )
                        if punches_day
                        else None
                    )
                    # 야간 교대: 익일 퇴근 타각이 당일 punch 리스트에 없으면 cross_midnight가
                    # 당일만 보고 time_out <= time_in 이 되어 None 처리됨 → OT 역산(hypo)이 0으로 남는 문제.
                    if time_in is not None and (time_out is None or time_out <= time_in):
                        fb = _fallback_time_out_from_following_days(
                            cur, int(emp.id), time_in, punch_by_emp_day
                        )
                        if fb is not None:
                            time_out = fb
                    if time_in is not None and (time_out is None or time_out <= time_in):
                        sto = getattr(manual_day_row, "time_out", None) if manual_day_row else None
                        if sto is not None and sto > time_in:
                            time_out = sto.replace(microsecond=0)
                    # 전일 spill로 당일 첫 타각이 빠진 뒤 저녁 출근만 남은 경우 등: 퇴근 타각이 없으면
                    # 단일 타각을 퇴근으로 쓰지 않는다(출근=퇴근 동일시각 방지).
                    if time_in is not None and time_out is not None and time_out <= time_in:
                        time_out = None

                    leave_frac = 0.0
                    unpaid_touch = False
                    leave_name_set: Set[str] = set()
                    for lv in leaves_by_emp.get(int(emp.id), []):
                        if not _leave_approved(lv.status):
                            continue
                        if lv.start_date <= cur <= lv.end_date:
                            span = (lv.end_date - lv.start_date).days + 1
                            leave_frac += float(lv.days or 0) / span if span > 0 else float(lv.days or 0)
                            if _leave_unpaid(lv):
                                unpaid_touch = True
                            lv_name = (lv.leave_type or "").strip()
                            if lv_name:
                                leave_name_set.add(lv_name)
                    leave_frac = min(1.0, leave_frac)

                    st_in_s = (shift_def.start_work or shift_def.start_check_in) if shift_def else None
                    st_out_s = shift_def.time_out if shift_def else None
                    sw = _combine_local(cur, st_in_s, next_day=False) if shift_def else None
                    ew = _combine_local(cur, st_out_s, next_day=False) if shift_def else None
                    if sw and ew and ew <= sw:
                        ew = _combine_local(cur, st_out_s, next_day=True)

                    late_raw = 0
                    early_raw = 0
                    prev_add_applied = _extract_prev_applied(manual_day_row, "agg_additional")
                    prev_special_applied = _extract_prev_applied(manual_day_row, "agg_special")
                    prev_punch_applied = _extract_prev_applied(manual_day_row, "agg_punch")
                    existing_raw = [
                        _int_nonneg(getattr(manual_day_row, "oth1", 0) if manual_day_row else 0),
                        _int_nonneg(getattr(manual_day_row, "oth2", 0) if manual_day_row else 0),
                        _int_nonneg(getattr(manual_day_row, "oth3", 0) if manual_day_row else 0),
                        _int_nonneg(getattr(manual_day_row, "oth4", 0) if manual_day_row else 0),
                        _int_nonneg(getattr(manual_day_row, "oth5", 0) if manual_day_row else 0),
                        _int_nonneg(getattr(manual_day_row, "oth6", 0) if manual_day_row else 0),
                    ]

                    absent = False
                    is_sun = cur.weekday() == 6  # 월=0 … 일=6

                    def _absent_attendance_day() -> bool:
                        """출근 의무로 결석을 볼 날: 유급 근무일, 또는 (일요가 아니고) 교대가 배정된 비근무일."""
                        if is_workday:
                            return True
                        if is_sun:
                            return False
                        return bool((shift_code or "").strip())

                    # 법정휴일·전일 휴가 등 제외. 타각 없음 또는 출근만 있고 퇴근 없음 → 결석.
                    if shift_def and (cid, cur) not in holiday_dates and leave_frac < 1.0:
                        if _absent_attendance_day():
                            if (not time_in and not time_out) or (time_in and not time_out):
                                absent = True

                    # 지각: 「지각 포함」이 켜져 있거나, 교대에 「지각 집계 시작」 시각이 있으면 집계한다.
                    # (UI에서 집계 시작만 입력하고 지각 포함 체크를 빼둔 경우에도 집계되도록 함)
                    ls_raw = (shift_def.lateness_count_start or "").strip() if shift_def else ""
                    late_ls_ok = bool(ls_raw and _parse_hhmm(ls_raw))
                    late_should_calc = bool(
                        shift_def and time_in and (shift_def.late_enabled or late_ls_ok)
                    )
                    if late_should_calc:
                        boundary: Optional[datetime] = None
                        if late_ls_ok:
                            # 지각 집계 시작 시각 기준(야간 교대는 익일로 보정)
                            boundary = _combine_local(cur, ls_raw, next_day=False)
                            if boundary and sw and boundary <= sw:
                                boundary = _combine_local(cur, ls_raw, next_day=True)
                        elif sw and shift_def.late_enabled:
                            thr = int(shift_def.late_threshold_minutes or 0)
                            boundary = sw + timedelta(minutes=thr)
                        if boundary and time_in > boundary:
                            # 집계 시작 시각은 판정용; 분 수는 근무 시작(sw) 기준(집계 시작만 있을 때).
                            if late_ls_ok and sw:
                                late_raw = int((time_in - sw).total_seconds() // 60)
                            else:
                                late_raw = int((time_in - boundary).total_seconds() // 60)

                    # 조퇴: 「조퇴 포함」이거나 교대에 퇴근 시각(time_out)이 있으면 집계(퇴근 기준 ew, 허용분 early_threshold).
                    eo_raw = (shift_def.time_out or "").strip() if shift_def else ""
                    early_out_ok = bool(eo_raw and _parse_hhmm(eo_raw))
                    early_should_calc = bool(
                        shift_def and ew and time_out and (shift_def.early_enabled or early_out_ok)
                    )
                    if early_should_calc:
                        thr = int(shift_def.early_threshold_minutes or 0)
                        boundary = ew - timedelta(minutes=thr)
                        if time_out < boundary:
                            early_raw = int((boundary - time_out).total_seconds() // 60)

                    late_fin = _round_with_section(late_raw, late_sec_by_co.get(cid))
                    early_fin = _round_with_section(early_raw, early_sec_by_co.get(cid))
                    if basic and getattr(basic, "not_rounding_lateness", False):
                        late_fin = max(0, int(late_raw))
                    if basic and getattr(basic, "not_rounding_early", False):
                        early_fin = max(0, int(early_raw))

                    # 자동OT생성 ON: 타각+추가+특별(휴일제외일은 가산 안 함). OFF: OT 전부 0(역산 없음).
                    ot_band = _day_band(cur, cid, holiday_dates, is_calendar_workday=is_workday)
                    apply_auto_ot = bool(calc_ot and not suppress_holiday_calendar_ot)
                    if calc_ot:
                        hypo_punch, hypo_add, hypo_spec = _collect_auto_ot_day_buckets(
                            cur,
                            int(emp.id),
                            time_in,
                            time_out,
                            shift_def,
                            monthly_pay,
                            ot_band,
                            suppress_holiday_calendar_ot,
                            additional_by_emp_day,
                            special_by_emp_day,
                        )
                        if preserve_manual_ot:
                            manual_base_buckets = [
                                max(
                                    0,
                                    existing_raw[j]
                                    - prev_add_applied[j]
                                    - prev_special_applied[j]
                                    - prev_punch_applied[j],
                                )
                                for j in range(6)
                            ]
                        else:
                            manual_base_buckets = [0, 0, 0, 0, 0, 0]
                        if apply_auto_ot:
                            day_punch_buckets = hypo_punch
                            day_additional_buckets = hypo_add
                            day_special_buckets = hypo_spec
                        else:
                            day_punch_buckets = [0, 0, 0, 0, 0, 0]
                            day_additional_buckets = [0, 0, 0, 0, 0, 0]
                            day_special_buckets = [0, 0, 0, 0, 0, 0]
                    else:
                        manual_base_buckets = [0, 0, 0, 0, 0, 0]
                        day_punch_buckets = [0, 0, 0, 0, 0, 0]
                        day_additional_buckets = [0, 0, 0, 0, 0, 0]
                        day_special_buckets = [0, 0, 0, 0, 0, 0]

                    ot_minutes_by_bucket = manual_base_buckets[:]
                    for j in range(6):
                        ot_minutes_by_bucket[j] += (
                            day_punch_buckets[j] + day_additional_buckets[j] + day_special_buckets[j]
                        )

                    # OT 반올림(근태기준정보관리 > 반올림 > OT) 적용
                    if calc_ot_day:
                        ot_round_sec = ot_sec_by_co.get(cid)
                        if ot_round_sec:
                            ot_minutes_by_bucket = [
                                _round_ot_daily_minutes(v, ot_round_sec) if v and v > 0 else v
                                for v in ot_minutes_by_bucket
                            ]

                    leave_minutes = int(round(leave_frac * daily_min))
                    absent_minutes = daily_min if absent else 0
                    absent_days = round(absent_minutes / daily_min, 2) if absent_minutes and daily_min > 0 else 0.0
                    leave_days = round(leave_frac, 4) if leave_frac > 0 else 0.0

                    food_base = _food_allowance_base_from_shift(shift_def, monthly_pay, band)

                    # 정책: 휴가/무급휴가/결석일에는 수당 미계산.
                    # 단, OT(수기 잔여는 preserve_manual_ot 일 때만 + 타각·추가·특별 자동분)는 유지한다.
                    block_ot_and_allowance = bool(absent or leave_frac > 0.0 or unpaid_touch)

                    ot_total_min = sum(ot_minutes_by_bucket)
                    food_ot = 0
                    if shift_def and ot_total_min > 0:
                        food_ot = _ot_food_allowance_from_shift(
                            shift_def,
                            monthly_pay,
                            band,
                            early_fin,
                        )

                    shift_allow = int(shift_def.allowance_shift or 0) if shift_def else 0
                    if block_ot_and_allowance:
                        shift_allow = 0
                        food_base = 0
                        food_ot = 0

                    if not time_in:
                        food_base = 0
                        food_ot = 0

                    day_fuel_amt = fuel_amt
                    day_stand_amt = stand_amt
                    day_other_amt = other_amt
                    if block_ot_and_allowance or not time_in:
                        day_fuel_amt = 0.0
                        day_stand_amt = 0.0
                        day_other_amt = 0.0

                    work_day_count_str = "0"
                    if absent:
                        work_day_count_str = "0"
                    elif leave_frac >= 1.0:
                        work_day_count_str = "0"
                    elif time_in and time_out:
                        work_day_count_str = f"{max(0.0, 1.0 - leave_frac):.2f}"

                    memo_parts: List[str] = []
                    if shift_def:
                        memo_parts.append(
                            f"근무(교대) {st_in_s or '-'}~{st_out_s or '-'} / 반올림 지각 {late_raw}→{late_fin} 조퇴 {early_raw}→{early_fin}"
                        )
                    if (cid, cur) in holiday_dates:
                        memo_parts.append("법정휴일(유급)")
                    if not is_workday:
                        memo_parts.append("근무달력 휴무")
                    day_memo = " | ".join(memo_parts) if memo_parts else None

                    # 비고(note): 근무달력/휴가(연휴)/타각 누락/지각·조퇴(반올림 후) 자동 입력
                    auto_note_parts: List[str] = []
                    if not is_workday:
                        auto_note_parts.append("정기휴일")
                    holiday_key = (cid, cur)
                    if holiday_key in holiday_dates:
                        holiday_remark = holiday_remarks_by_date.get(holiday_key, "")
                        auto_note_parts.append(f"연휴:{holiday_remark}" if holiday_remark else "연휴")
                    if leave_name_set:
                        for nm in sorted(leave_name_set):
                            auto_note_parts.append(f"휴가:{nm}")
                    # 타각 누락(결석 판정과 동일: 출근 의무일·법정휴일 아님·휴가 미포함)
                    if (
                        shift_def
                        and (cid, cur) not in holiday_dates
                        and leave_frac < 1.0
                        and _absent_attendance_day()
                    ):
                        if not time_in and "출근시간 미체크" not in auto_note_parts:
                            auto_note_parts.append("출근시간 미체크")
                        if not time_out and "퇴근시간 미체크" not in auto_note_parts:
                            auto_note_parts.append("퇴근시간 미체크")
                    if late_fin and late_fin > 0:
                        late_note = f"지각 {_fmt_minutes_hhmm(late_fin)}"
                        if late_note not in auto_note_parts:
                            auto_note_parts.append(late_note)
                    if early_fin and early_fin > 0:
                        early_note = f"조퇴 {_fmt_minutes_hhmm(early_fin)}"
                        if early_note not in auto_note_parts:
                            auto_note_parts.append(early_note)

                    existing_note = (manual_day_row.note or "").strip() if manual_day_row else ""
                    merged_note_parts: List[str] = []
                    if existing_note:
                        merged_note_parts.append(existing_note)
                    for p in auto_note_parts:
                        if p and p not in merged_note_parts:
                            merged_note_parts.append(p)
                    note_text = " / ".join(merged_note_parts) if merged_note_parts else None

                    body: Dict[str, Any] = {
                        "row_no": 1,
                        "shift_code": shift_code or None,
                        "time_in": time_in.isoformat() if time_in else None,
                        "time_out": time_out.isoformat() if time_out else None,
                        "late_time_in": late_fin if late_fin else None,
                        "before_time_out": early_fin if early_fin else None,
                        "oth1": ot_minutes_by_bucket[0] or None,
                        "oth2": ot_minutes_by_bucket[1] or None,
                        "oth3": ot_minutes_by_bucket[2] or None,
                        "oth4": ot_minutes_by_bucket[3] or None,
                        "oth5": ot_minutes_by_bucket[4] or None,
                        "oth6": ot_minutes_by_bucket[5] or None,
                        "st_in": str(st_in_s)[:10] if st_in_s else None,
                        "st_out": str(st_out_s)[:10] if st_out_s else None,
                        "food_allowance": float(food_base) if food_base else None,
                        "food_ot_allowance": float(food_ot) if food_ot else None,
                        "shift_allowance": float(shift_allow) if shift_allow else None,
                        # special_allowance 는 자동 계산/덮어쓰기하지 않는다.
                        # 사용자가 근태/OT/수당관리 화면에서 직접 입력·수정한 값을 유지한다.
                        "fuel_allowance": float(day_fuel_amt) if day_fuel_amt else None,
                        "standing_allowance": float(day_stand_amt) if day_stand_amt else None,
                        "other_allowance": float(day_other_amt) if day_other_amt else None,
                        "day_off": not is_workday,
                        "without_pay_public_holiday": unpaid_touch,
                        "note": note_text,
                        "day_memo": day_memo,
                        "leave_time": leave_minutes if leave_minutes else None,
                        "leave_without_pay": leave_minutes if unpaid_touch and leave_minutes else None,
                        "leave_days": leave_days if leave_days > 0 else None,
                        "leave_without_pay_days": leave_days if unpaid_touch and leave_days > 0 else None,
                        "absent_time": absent_minutes if absent_minutes else None,
                        "absent_days": absent_days if absent_days > 0 else None,
                        "work_day_count": work_day_count_str,
                        "agg_punch_oth1": day_punch_buckets[0],
                        "agg_punch_oth2": day_punch_buckets[1],
                        "agg_punch_oth3": day_punch_buckets[2],
                        "agg_punch_oth4": day_punch_buckets[3],
                        "agg_punch_oth5": day_punch_buckets[4],
                        "agg_punch_oth6": day_punch_buckets[5],
                        "agg_additional_oth1": day_additional_buckets[0],
                        "agg_additional_oth2": day_additional_buckets[1],
                        "agg_additional_oth3": day_additional_buckets[2],
                        "agg_additional_oth4": day_additional_buckets[3],
                        "agg_additional_oth5": day_additional_buckets[4],
                        "agg_additional_oth6": day_additional_buckets[5],
                        "agg_special_oth1": day_special_buckets[0],
                        "agg_special_oth2": day_special_buckets[1],
                        "agg_special_oth3": day_special_buckets[2],
                        "agg_special_oth4": day_special_buckets[3],
                        "agg_special_oth5": day_special_buckets[4],
                        "agg_special_oth6": day_special_buckets[5],
                    }

                    if ot_total_min > 0 and ot_m and ot_m.ot6_hourly_baht:
                        try:
                            hourly = float(ot_m.ot6_hourly_baht)
                            body["othb"] = round((ot_total_min / 60.0) * hourly, 2)
                        except Exception:
                            body["othb"] = None
                    else:
                        body["othb"] = None

                    day_svc.upsert_employee_day_row(int(emp.id), user, cur, body)
                    rows_written += 1
                    spill_closing_punch = time_out if (time_out and time_out.date() > cur) else None
                    cur += timedelta(days=1)

                yield {
                    "type": "progress",
                    "done": i + 1,
                    "total": n_emp,
                    "percent": int(100 * (i + 1) / n_emp) if n_emp else 100,
                }

            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        yield {
            "type": "done",
            "result": {
                "ok": True,
                "employee_count": len(employees),
                "day_rows_written": rows_written,
                "warnings": warnings,
                "unmapped_or_partial": unmapped,
            },
        }

    def run(
        self,
        user: User,
        date_from: date,
        date_to: date,
        company_id: Optional[int] = None,
        employee_ids: Optional[List[int]] = None,
        work_dates: Optional[Set[date]] = None,
        *,
        preserve_manual_ot: bool = False,
    ) -> Dict[str, Any]:
        result: Optional[Dict[str, Any]] = None
        for ev in self.iter_run(
            user,
            date_from,
            date_to,
            company_id,
            employee_ids,
            work_dates,
            preserve_manual_ot=preserve_manual_ot,
        ):
            if ev.get("type") == "done":
                result = ev.get("result")
        if not result:
            raise RuntimeError("집계가 완료되지 않았습니다.")
        return result
