"""회사별 근태 기준정보 조회·저장."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.attendance_standard import (
    AttendanceCompanyHoliday,
    AttendanceCompanySettings,
    AttendanceLeaveGlobal,
    AttendanceLeaveLevel,
    AttendanceLeaveLevelRow,
    AttendancePaymentPeriod,
    AttendanceRoundUpSection,
    AttendanceRoundUpTier,
    AttendanceShift,
    AttendanceShiftGroupMaster,
    AttendanceShiftOtRange,
    AttendanceSpecialAllowance,
    AttendanceWorkCalendar,
    AttendanceWorkCalendarDay,
)
from app.models.user import User
from app.services.company_service import CompanyService


def _d(v: Optional[date]) -> Optional[str]:
    return v.isoformat() if v else None


def _pd(v: Any) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, date):
        return v
    s = str(v).strip()[:10]
    if not s:
        return None
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def _num(v: Any, default: Any = 0) -> Any:
    if v is None:
        return default
    try:
        return Decimal(str(v))
    except Exception:
        return default


def _int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except Exception:
        return default


def _bool(v: Any, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    return s in ("1", "true", "yes", "y", "on")


def _norm_shift_code_key(v: Any) -> str:
    """교대코드 비교용(앞뒤 공백 제거). dict 키·DB 매칭 불일치로 INSERT가 반복되는 것을 막는다."""
    return str(v or "").strip()[:50]


def _norm_shift_allowance_json(val: Any) -> Dict[str, Any]:
    """OT 표 하단 지각·Shift / 조퇴·식대 수당 (enabled + monthly/daily × weekday·sunday·holiday)."""
    base = {
        "enabled": False,
        "monthly": {"weekday": 0, "sunday": 0, "holiday": 0},
        "daily": {"weekday": 0, "sunday": 0, "holiday": 0},
    }
    if not isinstance(val, dict):
        return dict(base)
    out = dict(base)
    out["enabled"] = _bool(val.get("enabled"))
    for band in ("monthly", "daily"):
        sub = val.get(band)
        if isinstance(sub, dict):
            out[band] = {
                "weekday": max(0, _int(sub.get("weekday"), 0)),
                "sunday": max(0, _int(sub.get("sunday"), 0)),
                "holiday": max(0, _int(sub.get("holiday"), 0)),
            }
    return out


def _populate_shift_from_payload(row: AttendanceShift, sh: Dict[str, Any]) -> None:
    code = _norm_shift_code_key(sh.get("shift_code") or sh.get("shiftCode"))
    row.shift_code = code
    row.title = str(sh.get("title") or "")[:500] or None
    row.start_check_in = str(sh.get("start_check_in") or "")[:16] or None
    row.start_work = str(sh.get("start_work") or "")[:16] or None
    row.lateness_count_start = str(sh.get("lateness_count_start") or "")[:16] or None
    row.break_late_time = str(sh.get("break_late_time") or "")[:16] or None
    row.break_late_enabled = _bool(sh.get("break_late_enabled"))
    row.break_early_time = str(sh.get("break_early_time") or "")[:16] or None
    row.break_early_enabled = _bool(sh.get("break_early_enabled"))
    row.break_sum = str(sh.get("break_sum") or "")[:16] or None
    row.time_out = str(sh.get("time_out") or "")[:16] or None
    row.continue_shift_without_zip_minutes = _int(sh.get("continue_shift_without_zip_minutes"), 0)
    row.work_on_holiday = _bool(sh.get("work_on_holiday"))
    row.late_enabled = _bool(sh.get("late_enabled"))
    row.late_threshold_minutes = _int(sh.get("late_threshold_minutes"), 0)
    row.late_shift_note = str(sh.get("late_shift_note") or "")[:100] or None
    row.late_monthly_note = str(sh.get("late_monthly_note") or "")[:100] or None
    row.early_enabled = _bool(sh.get("early_enabled"))
    row.leaves_enabled = _bool(sh.get("leaves_enabled"))
    row.leave_food_monthly = _int(sh.get("leave_food_monthly"), 0)
    row.leave_food_daily = _int(sh.get("leave_food_daily"), 0)
    row.leave_food_minutes = _int(
        sh.get("leave_food_minutes"),
        _int(sh.get("leave_food_daily"), 0) or _int(sh.get("leave_food_monthly"), 0),
    )
    row.continuous_ot_minutes = _int(sh.get("continuous_ot_minutes"), 0)
    row.continuous_ot_after = _bool(sh.get("continuous_ot_after"))
    row.continuous_ot_before = _bool(sh.get("continuous_ot_before"))
    row.allowance_food_monthly = _int(sh.get("allowance_food_monthly"), 0)
    row.allowance_food_daily = _int(sh.get("allowance_food_daily"), 0)
    row.allowance_food = _int(
        sh.get("allowance_food"),
        _int(sh.get("allowance_food_daily"), 0) or _int(sh.get("allowance_food_monthly"), 0),
    )
    row.allowance_shift = _int(sh.get("allowance_shift"), 0)
    row.work_holiday_threshold_minutes = _int(
        sh.get("work_holiday_threshold_minutes"),
        _int(sh.get("allowance_shift"), 0),
    )
    row.work_holiday_daily = _int(
        sh.get("work_holiday_daily"),
        _int(sh.get("allowance_food_daily"), 0),
    )
    row.work_holiday_monthly = _int(
        sh.get("work_holiday_monthly"),
        _int(sh.get("allowance_food_monthly"), 0),
    )
    row.late_daily = _int(sh.get("late_daily"), _int(sh.get("late_shift_note"), 0))
    row.late_monthly = _int(sh.get("late_monthly"), _int(sh.get("late_monthly_note"), 0))
    row.early_threshold_minutes = _int(sh.get("early_threshold_minutes"), 0)
    row.early_daily = _int(sh.get("early_daily"), 0)
    row.early_monthly = _int(sh.get("early_monthly"), 0)
    row.leaves_threshold_minutes = _int(sh.get("leaves_threshold_minutes"), 0)
    row.leaves_daily = _int(sh.get("leaves_daily"), 0)
    row.leaves_monthly = _int(sh.get("leaves_monthly"), 0)
    row.food_daily = _int(sh.get("food_daily"), _int(sh.get("leave_food_daily"), 0))
    row.food_monthly = _int(sh.get("food_monthly"), _int(sh.get("leave_food_monthly"), 0))
    row.shift_allowance_late_shift_json = _norm_shift_allowance_json(sh.get("late_shift_allowance"))
    row.shift_allowance_early_food_json = _norm_shift_allowance_json(sh.get("early_food_allowance"))


def _norm_group_name(s: Any) -> str:
    return str(s or "").strip()[:200]


def _work_calendar_shift_group_name_hint(
    cal_payload: Dict[str, Any],
    payload_group_rows: List[Dict[str, Any]],
) -> str:
    """근무달력 헤더에서 근무조 명칭만 추출 (클라이언트 shift_group_id는 힌트로만 사용)."""
    gname = _norm_group_name(cal_payload.get("shift_group_name"))
    if gname:
        return gname
    old_id = _int(cal_payload.get("shift_group_id"), 0)
    if old_id > 0:
        for sg in payload_group_rows:
            if _int(sg.get("id"), 0) != old_id:
                continue
            return _norm_group_name(sg.get("name"))
    return ""


def _resolve_shift_group_id_live(
    db: Session, company_id: int, name_hint: str
) -> Tuple[int, str]:
    """
    근무달력 INSERT 직전 DB에서 근무조 id를 확정한다.
    인메모리 맵·ORM 캐시와 무관하게, 이번 트랜잭션에 flush된 행과 FK가 항상 일치한다.
    """
    nm = _norm_group_name(name_hint)
    if not nm:
        return 0, ""
    key = nm.lower()
    row = (
        db.query(AttendanceShiftGroupMaster)
        .filter(AttendanceShiftGroupMaster.company_id == company_id)
        .filter(func.lower(func.trim(AttendanceShiftGroupMaster.name)) == key)
        .first()
    )
    if row:
        return int(row.id), (row.name or nm)
    return 0, ""


def _resolve_calendar_shift_group_for_upsert(
    db: Session,
    company_id: int,
    cal_payload: Dict[str, Any],
    payload_group_rows: List[Dict[str, Any]],
) -> Tuple[int, str]:
    """페이로드의 shift_group_id가 해당 회사 마스터에 있으면 PK 유지, 아니면 이름으로 조회."""
    cal_gid = _int(cal_payload.get("shift_group_id"), 0)
    if cal_gid > 0:
        g = (
            db.query(AttendanceShiftGroupMaster)
            .filter(
                AttendanceShiftGroupMaster.company_id == company_id,
                AttendanceShiftGroupMaster.id == cal_gid,
            )
            .first()
        )
        if g:
            nm = (g.name or "").strip() or _norm_group_name(cal_payload.get("shift_group_name"))
            return int(g.id), nm
    hint = _work_calendar_shift_group_name_hint(cal_payload, payload_group_rows)
    return _resolve_shift_group_id_live(db, company_id, hint)


class AttendanceStandardService:
    def __init__(self, db: Session):
        self.db = db

    def _require_company(self, company_id: int, user: User):
        row = CompanyService(self.db).get(company_id, current_user=user)
        if not row:
            raise ValueError("회사를 찾을 수 없거나 접근 권한이 없습니다.")
        return row

    def default_company_settings(self) -> Dict[str, Any]:
        return {
            "daily_work_hours": "08:00",
            "monthly_work_hours": "08:00",
            "day_base_days_per_month": 30,
            "ot_rate_level_1": 1,
            "ot_rate_level_2": 1.5,
            "ot_rate_level_3": 2,
            "ot_rate_level_4": 2.5,
            "ot_rate_level_5": 3,
            "processing_format": "normal",
            "backward_cross_company": False,
            "hide_time_status_no_check": False,
            "zip_card_policy": "warning_full_day",
            "zip_status_in": "",
            "zip_no_machine": "",
            "opt_remark_time_off": False,
            "opt_message_time_off_charge": False,
            "opt_message_leave": False,
            "opt_late_check_half_day_leave": False,
            "opt_process_record_leaves": False,
            "opt_count_leave_in_schedule": False,
            "opt_half_day_leave_half_base": False,
        }

    def _serialize_settings(self, row: Optional[AttendanceCompanySettings]) -> Dict[str, Any]:
        d = self.default_company_settings()
        if not row:
            return d
        d.update(
            {
                "id": int(row.id),
                "daily_work_hours": row.daily_work_hours or "08:00",
                "monthly_work_hours": row.monthly_work_hours or "08:00",
                "day_base_days_per_month": row.day_base_days_per_month or 30,
                "ot_rate_level_1": float(row.ot_rate_level_1 or 1),
                "ot_rate_level_2": float(row.ot_rate_level_2 or 1.5),
                "ot_rate_level_3": float(row.ot_rate_level_3 or 2),
                "ot_rate_level_4": float(row.ot_rate_level_4 or 2.5),
                "ot_rate_level_5": float(row.ot_rate_level_5 or 3),
                "processing_format": row.processing_format or "normal",
                "backward_cross_company": bool(row.backward_cross_company),
                "hide_time_status_no_check": bool(row.hide_time_status_no_check),
                "zip_card_policy": row.zip_card_policy or "warning_full_day",
                "zip_status_in": row.zip_status_in or "",
                "zip_no_machine": row.zip_no_machine or "",
                "opt_remark_time_off": bool(row.opt_remark_time_off),
                "opt_message_time_off_charge": bool(row.opt_message_time_off_charge),
                "opt_message_leave": bool(row.opt_message_leave),
                "opt_late_check_half_day_leave": bool(row.opt_late_check_half_day_leave),
                "opt_process_record_leaves": bool(row.opt_process_record_leaves),
                "opt_count_leave_in_schedule": bool(row.opt_count_leave_in_schedule),
                "opt_half_day_leave_half_base": bool(row.opt_half_day_leave_half_base),
            }
        )
        return d

    def get_bundle(self, company_id: int, user: User) -> Dict[str, Any]:
        self._require_company(company_id, user)

        st = (
            self.db.query(AttendanceCompanySettings)
            .filter(AttendanceCompanySettings.company_id == company_id)
            .first()
        )
        specials = (
            self.db.query(AttendanceSpecialAllowance)
            .filter(AttendanceSpecialAllowance.company_id == company_id)
            .order_by(AttendanceSpecialAllowance.slot_index)
            .all()
        )
        spec_out: List[Dict[str, Any]] = []
        for i in range(1, 4):
            row = next((x for x in specials if x.slot_index == i), None)
            spec_out.append(
                {
                    "slot_index": i,
                    "name": row.name if row else "",
                    "working_ot_on_holiday": bool(row.working_ot_on_holiday) if row else False,
                    "payment_full_day": bool(row.payment_full_day) if row else True,
                    "no_payment_late_early": bool(row.no_payment_late_early) if row else False,
                }
            )

        shifts = (
            self.db.query(AttendanceShift)
            .filter(AttendanceShift.company_id == company_id)
            .order_by(AttendanceShift.shift_code)
            .all()
        )
        shift_groups = (
            self.db.query(AttendanceShiftGroupMaster)
            .filter(AttendanceShiftGroupMaster.company_id == company_id)
            .order_by(AttendanceShiftGroupMaster.sort_order.asc(), AttendanceShiftGroupMaster.id.asc())
            .all()
        )
        shift_group_out = [
            {
                "id": g.id,
                "sort_order": g.sort_order,
                "name": g.name or "",
                "description": g.description or "",
            }
            for g in shift_groups
        ]
        shifts_out: List[Dict[str, Any]] = []
        for sh in shifts:
            ot_rows = sorted(sh.ot_ranges, key=lambda x: x.sort_order)
            lfm = _int(getattr(sh, "leave_food_monthly", None), 0)
            lfd = _int(getattr(sh, "leave_food_daily", None), 0)
            if lfm == 0 and lfd == 0:
                leg = sh.leave_food_minutes or 0
                lfm = lfd = leg
            afm = _int(getattr(sh, "allowance_food_monthly", None), 0)
            afd = _int(getattr(sh, "allowance_food_daily", None), 0)
            if afm == 0 and afd == 0:
                ag = sh.allowance_food or 0
                afm = afd = ag
            wh_shift = _int(getattr(sh, "work_holiday_threshold_minutes", None), _int(getattr(sh, "allowance_shift", None), 0))
            wh_daily = _int(getattr(sh, "work_holiday_daily", None), afd)
            wh_monthly = _int(getattr(sh, "work_holiday_monthly", None), afm)
            late_daily = _int(getattr(sh, "late_daily", None), _int(getattr(sh, "late_shift_note", None), 0))
            late_monthly = _int(getattr(sh, "late_monthly", None), _int(getattr(sh, "late_monthly_note", None), 0))
            early_shift = _int(getattr(sh, "early_threshold_minutes", None), 0)
            early_daily = _int(getattr(sh, "early_daily", None), 0)
            early_monthly = _int(getattr(sh, "early_monthly", None), 0)
            leaves_shift = _int(getattr(sh, "leaves_threshold_minutes", None), 0)
            leaves_daily = _int(getattr(sh, "leaves_daily", None), 0)
            leaves_monthly = _int(getattr(sh, "leaves_monthly", None), 0)
            food_daily = _int(getattr(sh, "food_daily", None), lfd)
            food_monthly = _int(getattr(sh, "food_monthly", None), lfm)
            shifts_out.append(
                {
                    "id": sh.id,
                    "shift_code": sh.shift_code,
                    "title": sh.title or "",
                    "start_check_in": sh.start_check_in or "",
                    "start_work": sh.start_work or "",
                    "lateness_count_start": sh.lateness_count_start or "",
                    "break_late_time": sh.break_late_time or "",
                    "break_late_enabled": bool(sh.break_late_enabled),
                    "break_early_time": sh.break_early_time or "",
                    "break_early_enabled": bool(sh.break_early_enabled),
                    "break_sum": sh.break_sum or "",
                    "time_out": sh.time_out or "",
                    "continue_shift_without_zip_minutes": sh.continue_shift_without_zip_minutes or 0,
                    "work_on_holiday": bool(sh.work_on_holiday),
                    "late_enabled": bool(sh.late_enabled),
                    "late_threshold_minutes": sh.late_threshold_minutes or 0,
                    "late_shift_note": sh.late_shift_note or "",
                    "late_monthly_note": sh.late_monthly_note or "",
                    "early_enabled": bool(sh.early_enabled),
                    "leaves_enabled": bool(sh.leaves_enabled),
                    "leave_food_minutes": sh.leave_food_minutes or 0,
                    "leave_food_monthly": lfm,
                    "leave_food_daily": lfd,
                    "continuous_ot_minutes": sh.continuous_ot_minutes or 0,
                    "continuous_ot_after": bool(sh.continuous_ot_after),
                    "continuous_ot_before": bool(sh.continuous_ot_before),
                    "allowance_food": sh.allowance_food or 0,
                    "allowance_food_monthly": afm,
                    "allowance_food_daily": afd,
                    "allowance_shift": sh.allowance_shift or 0,
                    "work_holiday_threshold_minutes": wh_shift,
                    "work_holiday_daily": wh_daily,
                    "work_holiday_monthly": wh_monthly,
                    "late_daily": late_daily,
                    "late_monthly": late_monthly,
                    "early_threshold_minutes": early_shift,
                    "early_daily": early_daily,
                    "early_monthly": early_monthly,
                    "leaves_threshold_minutes": leaves_shift,
                    "leaves_daily": leaves_daily,
                    "leaves_monthly": leaves_monthly,
                    "food_daily": food_daily,
                    "food_monthly": food_monthly,
                    "late_shift_allowance": _norm_shift_allowance_json(
                        getattr(sh, "shift_allowance_late_shift_json", None)
                    ),
                    "early_food_allowance": _norm_shift_allowance_json(
                        getattr(sh, "shift_allowance_early_food_json", None)
                    ),
                    "ot_ranges": [
                        {
                            "id": r.id,
                            "sort_order": r.sort_order,
                            "range_start": r.range_start or "",
                            "range_end": r.range_end or "",
                            "monthly_rate_a": float(r.monthly_rate_a) if r.monthly_rate_a is not None else None,
                            "monthly_rate_b": float(r.monthly_rate_b) if r.monthly_rate_b is not None else None,
                            "monthly_rate_holiday": float(getattr(r, "monthly_rate_holiday", None))
                            if getattr(r, "monthly_rate_holiday", None) is not None
                            else None,
                            "daily_rate_a": float(r.daily_rate_a) if r.daily_rate_a is not None else None,
                            "daily_rate_b": float(r.daily_rate_b) if r.daily_rate_b is not None else None,
                            "daily_rate_holiday": float(getattr(r, "daily_rate_holiday", None))
                            if getattr(r, "daily_rate_holiday", None) is not None
                            else None,
                        }
                        for r in ot_rows
                    ],
                }
            )

        sections = (
            self.db.query(AttendanceRoundUpSection)
            .filter(AttendanceRoundUpSection.company_id == company_id)
            .order_by(AttendanceRoundUpSection.tab_key, AttendanceRoundUpSection.section_key)
            .all()
        )
        ru_out: List[Dict[str, Any]] = []
        for sec in sections:
            tiers = sorted(sec.tiers, key=lambda x: x.row_index)
            ru_out.append(
                {
                    "id": sec.id,
                    "tab_key": sec.tab_key,
                    "section_key": sec.section_key,
                    "mode_code": sec.mode_code or "",
                    "flag_payroll_include": bool(sec.flag_payroll_include),
                    "flag_first_minute": bool(sec.flag_first_minute),
                    "flag_footer": bool(sec.flag_footer),
                    "flag_use_late_count": bool(sec.flag_use_late_count),
                    "extra_json": sec.extra_json,
                    "tiers": [
                        {
                            "id": t.id,
                            "row_index": t.row_index,
                            "value_from": t.value_from,
                            "value_to": t.value_to,
                            "rounded_minutes": t.rounded_minutes,
                        }
                        for t in tiers
                    ],
                }
            )

        levels = (
            self.db.query(AttendanceLeaveLevel)
            .filter(AttendanceLeaveLevel.company_id == company_id)
            .order_by(AttendanceLeaveLevel.level_number)
            .all()
        )
        gl = (
            self.db.query(AttendanceLeaveGlobal)
            .filter(AttendanceLeaveGlobal.company_id == company_id)
            .first()
        )

        def _lv_date(v: Any, fallback: Any) -> Optional[str]:
            if v is not None:
                return _d(v)
            if fallback is not None:
                return _d(fallback)
            return None

        lv_out: List[Dict[str, Any]] = []
        for lv in levels:
            rows = sorted(lv.rows, key=lambda x: x.sort_order)
            cy = getattr(lv, "cumulative_year", None)
            lv_out.append(
                {
                    "id": lv.id,
                    "level_number": lv.level_number,
                    "statutory_start_date": _lv_date(
                        getattr(lv, "statutory_start_date", None),
                        gl.statutory_start_date if gl else None,
                    ),
                    "leave_other_start_date": _lv_date(
                        getattr(lv, "leave_other_start_date", None),
                        gl.leave_other_start_date if gl else None,
                    ),
                    "cumulative_year": cy if cy is not None else (gl.cumulative_year if gl else None),
                    "summer_employee_plus_one": bool(getattr(lv, "summer_employee_plus_one", False)),
                    "display_start_date": _lv_date(
                        getattr(lv, "display_start_date", None),
                        gl.display_start_date if gl else None,
                    ),
                    "thai_notice_text": (getattr(lv, "thai_notice_text", None) or "").strip()
                    or ((gl.thai_notice_text or "") if gl else ""),
                    "certificate_web_path": (getattr(lv, "certificate_web_path", None) or "").strip()
                    or ((gl.certificate_web_path or "") if gl else ""),
                    "rows": [
                        {
                            "id": r.id,
                            "sort_order": r.sort_order,
                            "leave_type_name": r.leave_type_name,
                            "days_quota": float(r.days_quota or 0),
                            "hours_quota": r.hours_quota or 0,
                            "minutes_quota": r.minutes_quota or 0,
                            "option_checked": bool(r.option_checked),
                        }
                        for r in rows
                    ],
                }
            )

        # 하위 호환: 구 클라이언트용 — 1등급(또는 첫 등급) 기준으로 leave_global 채움
        lv1 = next((x for x in levels if x.level_number == 1), None) or (levels[0] if levels else None)
        lv1_cy = getattr(lv1, "cumulative_year", None) if lv1 else None
        global_out = {
            "statutory_start_date": _lv_date(
                getattr(lv1, "statutory_start_date", None) if lv1 else None,
                gl.statutory_start_date if gl else None,
            ),
            "leave_other_start_date": _lv_date(
                getattr(lv1, "leave_other_start_date", None) if lv1 else None,
                gl.leave_other_start_date if gl else None,
            ),
            "cumulative_year": lv1_cy if lv1_cy is not None else (gl.cumulative_year if gl else None),
            "summer_employee_plus_one": bool(getattr(lv1, "summer_employee_plus_one", False))
            if lv1
            else (bool(gl.summer_employee_plus_one) if gl else False),
            "display_start_date": _lv_date(
                getattr(lv1, "display_start_date", None) if lv1 else None,
                gl.display_start_date if gl else None,
            ),
            "thai_notice_text": (getattr(lv1, "thai_notice_text", None) or "")
            if lv1
            else ((gl.thai_notice_text or "") if gl else ""),
            "certificate_web_path": (getattr(lv1, "certificate_web_path", None) or "")
            if lv1
            else ((gl.certificate_web_path or "") if gl else ""),
        }

        hols = (
            self.db.query(AttendanceCompanyHoliday)
            .filter(AttendanceCompanyHoliday.company_id == company_id)
            .order_by(AttendanceCompanyHoliday.holiday_date.desc())
            .all()
        )
        hol_out = [
            {"id": h.id, "holiday_date": _d(h.holiday_date), "remarks": h.remarks or ""} for h in hols
        ]

        pays = (
            self.db.query(AttendancePaymentPeriod)
            .filter(AttendancePaymentPeriod.company_id == company_id)
            .order_by(
                AttendancePaymentPeriod.calendar_year.desc(),
                AttendancePaymentPeriod.calendar_month.desc(),
            )
            .all()
        )
        pay_out = [
            {
                "id": p.id,
                "calendar_year": p.calendar_year,
                "calendar_month": p.calendar_month,
                "period_label": p.period_label or "Period 1",
                "start_date_daily": _d(p.start_date_daily),
                "end_date_daily": _d(p.end_date_daily),
                "start_date_monthly": _d(p.start_date_monthly),
                "end_date_monthly": _d(p.end_date_monthly),
                "ot_start_daily": _d(p.ot_start_daily),
                "ot_end_daily": _d(p.ot_end_daily),
                "ot_start_monthly": _d(p.ot_start_monthly),
                "ot_end_monthly": _d(p.ot_end_monthly),
                "remarks": p.remarks or "",
            }
            for p in pays
        ]

        calendars = (
            self.db.query(AttendanceWorkCalendar)
            .options(joinedload(AttendanceWorkCalendar.shift_group))
            .filter(AttendanceWorkCalendar.company_id == company_id)
            .order_by(
                AttendanceWorkCalendar.calendar_year.desc(),
                AttendanceWorkCalendar.calendar_month.desc(),
                AttendanceWorkCalendar.shift_group_id.asc(),
            )
            .all()
        )
        cal_out = [
            {
                "id": c.id,
                "calendar_year": c.calendar_year,
                "calendar_month": c.calendar_month,
                "shift_group_id": c.shift_group_id,
                "shift_group_name": (
                    (c.shift_group.name or "")
                    if getattr(c, "shift_group", None)
                    else (getattr(c, "shift_group_name", None) or "")
                ),
                "days": [
                    {
                        "day_of_month": d.day_of_month,
                        "shift_code": d.shift_code or "",
                        "shift_id": int(d.shift_id) if getattr(d, "shift_id", None) else None,
                        "is_workday": bool(d.is_workday),
                    }
                    for d in sorted(c.days, key=lambda x: x.day_of_month)
                ],
            }
            for c in calendars
        ]

        return {
            "company_id": company_id,
            "company_settings": self._serialize_settings(st),
            "special_allowances": spec_out,
            "shifts": shifts_out,
            "shift_group_masters": shift_group_out,
            "round_up_sections": ru_out,
            "leave_levels": lv_out,
            "leave_global": global_out,
            "holidays": hol_out,
            "payment_periods": pay_out,
            "work_calendars": cal_out,
        }

    def save_bundle(self, company_id: int, user: User, payload: Dict[str, Any]) -> Dict[str, Any]:
        self._require_company(company_id, user)

        _raw_scope = str(payload.get("save_scope") or "").strip().lower()
        _valid_scopes = frozenset(
            {"all", "company", "shift", "shift_group", "round", "leave", "holiday", "payment"}
        )
        if _raw_scope in _valid_scopes:
            _scope = _raw_scope
        else:
            # 안전장치: save_scope 누락/오입력 시 payload 키로 탭 범위를 자동 추론
            if "work_calendars" in payload:
                _scope = "all"
            elif "shifts" in payload or "deleted_shift_ids" in payload:
                _scope = "shift"
            elif "shift_group_masters" in payload or "deleted_shift_group_ids" in payload:
                _scope = "shift_group"
            elif "round_up_sections" in payload:
                _scope = "round"
            elif "leave_levels" in payload or "leave_global" in payload:
                _scope = "leave"
            elif "holidays" in payload:
                _scope = "holiday"
            elif "payment_periods" in payload:
                _scope = "payment"
            elif "company_settings" in payload or "special_allowances" in payload:
                _scope = "company"
            else:
                _scope = "all"

        if _scope in ("all", "company"):
            if _scope == "company" or "company_settings" in payload:
                cs = payload.get("company_settings") or {}
                cs_id = _int((cs or {}).get("id"), 0) if isinstance(cs, dict) else 0
                st_row = (
                    self.db.query(AttendanceCompanySettings)
                    .filter(AttendanceCompanySettings.company_id == company_id)
                    .first()
                )
                if st_row is None and cs_id > 0:
                    st_row = (
                        self.db.query(AttendanceCompanySettings)
                        .filter(
                            AttendanceCompanySettings.company_id == company_id,
                            AttendanceCompanySettings.id == cs_id,
                        )
                        .first()
                    )
                if st_row:
                    st_row.daily_work_hours = str(cs.get("daily_work_hours") or "08:00")[:16]
                    st_row.monthly_work_hours = str(cs.get("monthly_work_hours") or "08:00")[:16]
                    st_row.day_base_days_per_month = _int(cs.get("day_base_days_per_month"), 30)
                    st_row.ot_rate_level_1 = _num(cs.get("ot_rate_level_1"), 1)
                    st_row.ot_rate_level_2 = _num(cs.get("ot_rate_level_2"), 1.5)
                    st_row.ot_rate_level_3 = _num(cs.get("ot_rate_level_3"), 2)
                    st_row.ot_rate_level_4 = _num(cs.get("ot_rate_level_4"), 2.5)
                    st_row.ot_rate_level_5 = _num(cs.get("ot_rate_level_5"), 3)
                    st_row.processing_format = str(cs.get("processing_format") or "normal")[:100]
                    st_row.backward_cross_company = _bool(cs.get("backward_cross_company"))
                    st_row.hide_time_status_no_check = _bool(cs.get("hide_time_status_no_check"))
                    st_row.zip_card_policy = str(cs.get("zip_card_policy") or "warning_full_day")[:40]
                    st_row.zip_status_in = (cs.get("zip_status_in") or None) and str(cs.get("zip_status_in"))[:200]
                    st_row.zip_no_machine = (cs.get("zip_no_machine") or None) and str(cs.get("zip_no_machine"))[:200]
                    st_row.opt_remark_time_off = _bool(cs.get("opt_remark_time_off"))
                    st_row.opt_message_time_off_charge = _bool(cs.get("opt_message_time_off_charge"))
                    st_row.opt_message_leave = _bool(cs.get("opt_message_leave"))
                    st_row.opt_late_check_half_day_leave = _bool(cs.get("opt_late_check_half_day_leave"))
                    st_row.opt_process_record_leaves = _bool(cs.get("opt_process_record_leaves"))
                    st_row.opt_count_leave_in_schedule = _bool(cs.get("opt_count_leave_in_schedule"))
                    st_row.opt_half_day_leave_half_base = _bool(cs.get("opt_half_day_leave_half_base"))
                else:
                    self.db.add(
                        AttendanceCompanySettings(
                            company_id=company_id,
                            daily_work_hours=str(cs.get("daily_work_hours") or "08:00")[:16],
                            monthly_work_hours=str(cs.get("monthly_work_hours") or "08:00")[:16],
                            day_base_days_per_month=_int(cs.get("day_base_days_per_month"), 30),
                            ot_rate_level_1=_num(cs.get("ot_rate_level_1"), 1),
                            ot_rate_level_2=_num(cs.get("ot_rate_level_2"), 1.5),
                            ot_rate_level_3=_num(cs.get("ot_rate_level_3"), 2),
                            ot_rate_level_4=_num(cs.get("ot_rate_level_4"), 2.5),
                            ot_rate_level_5=_num(cs.get("ot_rate_level_5"), 3),
                            processing_format=str(cs.get("processing_format") or "normal")[:100],
                            backward_cross_company=_bool(cs.get("backward_cross_company")),
                            hide_time_status_no_check=_bool(cs.get("hide_time_status_no_check")),
                            zip_card_policy=str(cs.get("zip_card_policy") or "warning_full_day")[:40],
                            zip_status_in=(cs.get("zip_status_in") or None) and str(cs.get("zip_status_in"))[:200],
                            zip_no_machine=(cs.get("zip_no_machine") or None) and str(cs.get("zip_no_machine"))[:200],
                            opt_remark_time_off=_bool(cs.get("opt_remark_time_off")),
                            opt_message_time_off_charge=_bool(cs.get("opt_message_time_off_charge")),
                            opt_message_leave=_bool(cs.get("opt_message_leave")),
                            opt_late_check_half_day_leave=_bool(cs.get("opt_late_check_half_day_leave")),
                            opt_process_record_leaves=_bool(cs.get("opt_process_record_leaves")),
                            opt_count_leave_in_schedule=_bool(cs.get("opt_count_leave_in_schedule")),
                            opt_half_day_leave_half_base=_bool(cs.get("opt_half_day_leave_half_base")),
                        )
                    )

            if _scope == "company" or "special_allowances" in payload:
                spec_slots_kept: List[int] = []
                for sp in payload.get("special_allowances") or []:
                    si = _int(sp.get("slot_index"), 0)
                    if si < 1 or si > 3:
                        continue
                    spec_slots_kept.append(si)
                    row_sp = (
                        self.db.query(AttendanceSpecialAllowance)
                        .filter(
                            AttendanceSpecialAllowance.company_id == company_id,
                            AttendanceSpecialAllowance.slot_index == si,
                        )
                        .first()
                    )
                    if row_sp:
                        row_sp.name = str(sp.get("name") or "")[:300] or None
                        row_sp.working_ot_on_holiday = _bool(sp.get("working_ot_on_holiday"))
                        row_sp.payment_full_day = _bool(sp.get("payment_full_day"), True)
                        row_sp.no_payment_late_early = _bool(sp.get("no_payment_late_early"))
                    else:
                        self.db.add(
                            AttendanceSpecialAllowance(
                                company_id=company_id,
                                slot_index=si,
                                name=str(sp.get("name") or "")[:300] or None,
                                working_ot_on_holiday=_bool(sp.get("working_ot_on_holiday")),
                                payment_full_day=_bool(sp.get("payment_full_day"), True),
                                no_payment_late_early=_bool(sp.get("no_payment_late_early")),
                            )
                        )
                if spec_slots_kept:
                    self.db.query(AttendanceSpecialAllowance).filter(
                        AttendanceSpecialAllowance.company_id == company_id,
                        ~AttendanceSpecialAllowance.slot_index.in_(spec_slots_kept),
                    ).delete(synchronize_session=False)
                elif "special_allowances" in payload:
                    self.db.query(AttendanceSpecialAllowance).filter(
                        AttendanceSpecialAllowance.company_id == company_id,
                    ).delete(synchronize_session=False)

        if _scope in ("all", "shift") and "shifts" in payload:
            existing_by_code: Dict[str, AttendanceShift] = {}
            for s in (
                self.db.query(AttendanceShift)
                .filter(AttendanceShift.company_id == company_id)
                .all()
            ):
                k = _norm_shift_code_key(s.shift_code)
                if not k:
                    continue
                existing_by_code[k] = s
            seen_code_set: set = set()
            for sh in payload.get("shifts") or []:
                if not isinstance(sh, dict):
                    continue
                code = _norm_shift_code_key(sh.get("shift_code") or sh.get("shiftCode"))
                if not code or code in seen_code_set:
                    continue
                seen_code_set.add(code)
                sid = _int(sh.get("id"), 0) or _int(sh.get("shift_id"), 0) or _int(sh.get("shiftId"), 0)
                shift: Optional[AttendanceShift] = None
                if sid > 0:
                    shift = (
                        self.db.query(AttendanceShift)
                        .filter(
                            AttendanceShift.company_id == company_id,
                            AttendanceShift.id == sid,
                        )
                        .first()
                    )
                if shift is None:
                    shift = existing_by_code.get(code)
                if shift is None and sid <= 0:
                    # trim 불일치·dict 누락 시에도 동일 교대코드 행이 있으면 UPDATE (PK 유지)
                    shift = (
                        self.db.query(AttendanceShift)
                        .filter(
                            AttendanceShift.company_id == company_id,
                            func.trim(AttendanceShift.shift_code) == code,
                        )
                        .first()
                    )
                    if shift is not None:
                        existing_by_code[_norm_shift_code_key(shift.shift_code)] = shift
                if shift is None:
                    shift = AttendanceShift(company_id=company_id, shift_code=code)
                    self.db.add(shift)
                    self.db.flush()
                    existing_by_code[code] = shift
                else:
                    old_code = _norm_shift_code_key(shift.shift_code)
                    if old_code and old_code != code:
                        self.db.query(AttendanceWorkCalendarDay).filter(
                            AttendanceWorkCalendarDay.company_id == company_id,
                            AttendanceWorkCalendarDay.shift_code == old_code,
                        ).update(
                            {AttendanceWorkCalendarDay.shift_code: code},
                            synchronize_session=False,
                        )
                        self.db.query(AttendanceWorkCalendar).filter(
                            AttendanceWorkCalendar.company_id == company_id,
                            AttendanceWorkCalendar.shift_code == old_code,
                        ).update(
                            {AttendanceWorkCalendar.shift_code: code},
                            synchronize_session=False,
                        )
                        if old_code in existing_by_code and existing_by_code[old_code] is shift:
                            del existing_by_code[old_code]
                        existing_by_code[code] = shift
                _populate_shift_from_payload(shift, sh)
                self.db.flush()
                payload_ot = [x for x in (sh.get("ot_ranges") or []) if isinstance(x, dict)]
                sorted_ot = sorted(
                    self.db.query(AttendanceShiftOtRange)
                    .filter(AttendanceShiftOtRange.shift_id == shift.id)
                    .all(),
                    key=lambda x: x.sort_order,
                )
                for bump_i, otr in enumerate(sorted_ot):
                    otr.sort_order = 900 + bump_i
                self.db.flush()
                ot_by_id = {int(x.id): x for x in sorted_ot}
                used_ot: set = set()
                matched_ot: List[AttendanceShiftOtRange] = []
                for r in payload_ot:
                    oid = _int(r.get("id"), 0) or _int(r.get("ot_range_id"), 0)
                    otr: Optional[AttendanceShiftOtRange] = None
                    if oid > 0 and oid in ot_by_id:
                        otr = ot_by_id[oid]
                    if otr is None:
                        for cand in sorted_ot:
                            if int(cand.id) not in used_ot:
                                otr = cand
                                break
                    if otr is None:
                        # (shift_id, sort_order) unique 제약 충돌 방지: 임시 정렬값도 항상 유니크하게 부여
                        next_tmp_order = 800 + len(sorted_ot) + 1
                        otr = AttendanceShiftOtRange(shift_id=shift.id, sort_order=next_tmp_order)
                        self.db.add(otr)
                        self.db.flush()
                        sorted_ot.append(otr)
                        ot_by_id[int(otr.id)] = otr
                    used_ot.add(int(otr.id))
                    matched_ot.append(otr)
                    otr.range_start = str(r.get("range_start") or "")[:16] or None
                    otr.range_end = str(r.get("range_end") or "")[:16] or None
                    otr.monthly_rate_a = (
                        _num(r.get("monthly_rate_a"), None)
                        if r.get("monthly_rate_a") not in (None, "")
                        else None
                    )
                    otr.monthly_rate_b = (
                        _num(r.get("monthly_rate_b"), None)
                        if r.get("monthly_rate_b") not in (None, "")
                        else None
                    )
                    otr.daily_rate_a = (
                        _num(r.get("daily_rate_a"), None) if r.get("daily_rate_a") not in (None, "") else None
                    )
                    otr.daily_rate_b = (
                        _num(r.get("daily_rate_b"), None) if r.get("daily_rate_b") not in (None, "") else None
                    )
                    otr.monthly_rate_holiday = (
                        _num(r.get("monthly_rate_holiday"), None)
                        if r.get("monthly_rate_holiday") not in (None, "")
                        else None
                    )
                    otr.daily_rate_holiday = (
                        _num(r.get("daily_rate_holiday"), None)
                        if r.get("daily_rate_holiday") not in (None, "")
                        else None
                    )
                self.db.flush()
                for otr, r in zip(matched_ot, payload_ot):
                    otr.sort_order = _int(r.get("sort_order"), 0)
                self.db.flush()
                keep_ot_ids = {int(x.id) for x in matched_ot}
                for old in (
                    self.db.query(AttendanceShiftOtRange)
                    .filter(AttendanceShiftOtRange.shift_id == shift.id)
                    .all()
                ):
                    if int(old.id) not in keep_ot_ids:
                        self.db.delete(old)

            deleted_shift_ids = {
                _int(x, 0)
                for x in (payload.get("deleted_shift_ids") or [])
                if _int(x, 0) > 0
            }
            for sid_del in deleted_shift_ids:
                rm_shift = (
                    self.db.query(AttendanceShift)
                    .filter(
                        AttendanceShift.company_id == company_id,
                        AttendanceShift.id == sid_del,
                    )
                    .first()
                )
                if rm_shift is None:
                    continue
                rm_code = _norm_shift_code_key(rm_shift.shift_code)
                has_calendar_ref = (
                    self.db.query(AttendanceWorkCalendar)
                    .filter(
                        AttendanceWorkCalendar.company_id == company_id,
                        AttendanceWorkCalendar.shift_id == rm_shift.id,
                    )
                    .first()
                    is not None
                )
                has_calendar_ref_by_code = False
                if rm_code:
                    has_calendar_ref_by_code = (
                        self.db.query(AttendanceWorkCalendar)
                        .filter(
                            AttendanceWorkCalendar.company_id == company_id,
                            func.trim(AttendanceWorkCalendar.shift_code) == rm_code,
                        )
                        .first()
                        is not None
                    )
                has_calendar_day_ref = (
                    self.db.query(AttendanceWorkCalendarDay)
                    .filter(
                        AttendanceWorkCalendarDay.company_id == company_id,
                        AttendanceWorkCalendarDay.shift_id == rm_shift.id,
                    )
                    .first()
                    is not None
                )
                has_calendar_day_ref_by_code = False
                if rm_code:
                    has_calendar_day_ref_by_code = (
                        self.db.query(AttendanceWorkCalendarDay)
                        .filter(
                            AttendanceWorkCalendarDay.company_id == company_id,
                            func.trim(AttendanceWorkCalendarDay.shift_code) == rm_code,
                        )
                        .first()
                        is not None
                    )
                if (
                    has_calendar_ref
                    or has_calendar_ref_by_code
                    or has_calendar_day_ref
                    or has_calendar_day_ref_by_code
                ):
                    raise ValueError(
                        f"교대근무 '{rm_shift.shift_code or rm_shift.id}' 는 근무달력에서 사용 중이라 삭제할 수 없습니다. "
                        "먼저 근무달력마스터관리에서 해당 교대를 해제/정리하세요."
                    )
                self.db.query(AttendanceShiftOtRange).filter(
                    AttendanceShiftOtRange.shift_id == rm_shift.id
                ).delete(synchronize_session=False)
                self.db.delete(rm_shift)
            self.db.flush()

        if _scope in ("all", "shift_group") and "shift_group_masters" in payload:
            kept_group_ids: set = set()
            for i, sg in enumerate(payload.get("shift_group_masters") or []):
                nm = _norm_group_name(sg.get("name"))
                if not nm:
                    continue
                gid_master = _int(sg.get("id"), 0) or _int(sg.get("group_id"), 0) or _int(sg.get("groupId"), 0)
                row_g: Optional[AttendanceShiftGroupMaster] = None
                if gid_master > 0:
                    row_g = (
                        self.db.query(AttendanceShiftGroupMaster)
                        .filter(
                            AttendanceShiftGroupMaster.company_id == company_id,
                            AttendanceShiftGroupMaster.id == gid_master,
                        )
                        .first()
                    )
                if row_g is None:
                    row_g = (
                        self.db.query(AttendanceShiftGroupMaster)
                        .filter(
                            AttendanceShiftGroupMaster.company_id == company_id,
                            func.lower(func.trim(AttendanceShiftGroupMaster.name)) == nm.lower(),
                        )
                        .first()
                    )
                if row_g is None:
                    row_g = AttendanceShiftGroupMaster(company_id=company_id, name=nm)
                    self.db.add(row_g)
                    self.db.flush()
                else:
                    row_g.name = nm
                row_g.sort_order = _int(sg.get("sort_order"), i)
                row_g.description = str(sg.get("description") or "") or None
                kept_group_ids.add(int(row_g.id))
            deleted_group_ids = {
                _int(x, 0)
                for x in (payload.get("deleted_shift_group_ids") or [])
                if _int(x, 0) > 0
            }
            for gid_del in deleted_group_ids:
                orphan_g = (
                    self.db.query(AttendanceShiftGroupMaster)
                    .filter(
                        AttendanceShiftGroupMaster.company_id == company_id,
                        AttendanceShiftGroupMaster.id == gid_del,
                    )
                    .first()
                )
                if orphan_g is None:
                    continue
                has_calendar_ref = (
                    self.db.query(AttendanceWorkCalendar)
                    .filter(
                        AttendanceWorkCalendar.company_id == company_id,
                        AttendanceWorkCalendar.shift_group_id == orphan_g.id,
                    )
                    .first()
                    is not None
                )
                has_calendar_ref_by_name = False
                if (orphan_g.name or "").strip():
                    has_calendar_ref_by_name = (
                        self.db.query(AttendanceWorkCalendar)
                        .filter(
                            AttendanceWorkCalendar.company_id == company_id,
                            func.lower(func.trim(AttendanceWorkCalendar.shift_group_name))
                            == func.lower(func.trim(orphan_g.name)),
                        )
                        .first()
                        is not None
                    )
                if has_calendar_ref or has_calendar_ref_by_name:
                    raise ValueError(
                        f"근무조 '{orphan_g.name or orphan_g.id}' 는 근무달력에서 사용 중이라 삭제할 수 없습니다. "
                        "먼저 근무달력마스터관리에서 해당 근무조를 해제/정리하세요."
                    )
                self.db.delete(orphan_g)
            self.db.flush()

        if _scope in ("all", "round") and "round_up_sections" in payload:
            kept_section_ids: set = set()
            for sec in payload.get("round_up_sections") or []:
                tk = str(sec.get("tab_key") or "").strip()[:32]
                sk = str(sec.get("section_key") or "").strip()[:64]
                if not tk or not sk:
                    continue
                sid_sec = _int(sec.get("id"), 0) or _int(sec.get("section_id"), 0) or _int(sec.get("sectionId"), 0)
                srow: Optional[AttendanceRoundUpSection] = None
                if sid_sec > 0:
                    srow = (
                        self.db.query(AttendanceRoundUpSection)
                        .filter(
                            AttendanceRoundUpSection.company_id == company_id,
                            AttendanceRoundUpSection.id == sid_sec,
                        )
                        .first()
                    )
                if srow is None:
                    srow = (
                        self.db.query(AttendanceRoundUpSection)
                        .filter(
                            AttendanceRoundUpSection.company_id == company_id,
                            AttendanceRoundUpSection.tab_key == tk,
                            AttendanceRoundUpSection.section_key == sk,
                        )
                        .first()
                    )
                if srow is None:
                    srow = AttendanceRoundUpSection(
                        company_id=company_id,
                        tab_key=tk,
                        section_key=sk,
                    )
                    self.db.add(srow)
                    self.db.flush()
                srow.tab_key = tk
                srow.section_key = sk
                srow.mode_code = str(sec.get("mode_code") or "")[:64] or None
                srow.flag_payroll_include = _bool(sec.get("flag_payroll_include"))
                srow.flag_first_minute = _bool(sec.get("flag_first_minute"))
                srow.flag_footer = _bool(sec.get("flag_footer"))
                srow.flag_use_late_count = _bool(sec.get("flag_use_late_count"))
                srow.extra_json = (
                    sec.get("extra_json") if isinstance(sec.get("extra_json"), (dict, list)) else None
                )
                self.db.flush()
                kept_section_ids.add(int(srow.id))
                payload_tiers = [x for x in (sec.get("tiers") or []) if isinstance(x, dict)]
                sorted_tiers = sorted(
                    self.db.query(AttendanceRoundUpTier)
                    .filter(AttendanceRoundUpTier.section_id == srow.id)
                    .all(),
                    key=lambda x: x.row_index,
                )
                for bump_i, tr in enumerate(sorted_tiers):
                    tr.row_index = 900 + bump_i
                self.db.flush()
                tier_by_id = {int(x.id): x for x in sorted_tiers}
                used_t: set = set()
                matched_t: List[AttendanceRoundUpTier] = []
                for t in payload_tiers:
                    tid = _int(t.get("id"), 0) or _int(t.get("tier_id"), 0)
                    trow: Optional[AttendanceRoundUpTier] = None
                    if tid > 0 and tid in tier_by_id:
                        trow = tier_by_id[tid]
                    if trow is None:
                        for cand in sorted_tiers:
                            if int(cand.id) not in used_t:
                                trow = cand
                                break
                    if trow is None:
                        # (section_id, row_index) unique 제약 충돌 방지
                        next_tmp_idx = 800 + len(sorted_tiers) + 1
                        trow = AttendanceRoundUpTier(section_id=srow.id, row_index=next_tmp_idx)
                        self.db.add(trow)
                        self.db.flush()
                        sorted_tiers.append(trow)
                        tier_by_id[int(trow.id)] = trow
                    used_t.add(int(trow.id))
                    matched_t.append(trow)
                    trow.value_from = _int(t.get("value_from"), 0)
                    trow.value_to = _int(t.get("value_to"), 0)
                    trow.rounded_minutes = _int(t.get("rounded_minutes"), 0)
                self.db.flush()
                for trow, t in zip(matched_t, payload_tiers):
                    trow.row_index = _int(t.get("row_index"), 0)
                self.db.flush()
                keep_tier_ids = {int(x.id) for x in matched_t}
                for old in (
                    self.db.query(AttendanceRoundUpTier)
                    .filter(AttendanceRoundUpTier.section_id == srow.id)
                    .all()
                ):
                    if int(old.id) not in keep_tier_ids:
                        self.db.delete(old)
            deleted_section_ids = {
                _int(x, 0)
                for x in (payload.get("deleted_round_section_ids") or [])
                if _int(x, 0) > 0
            }
            for sid_del in deleted_section_ids:
                s_orphan = (
                    self.db.query(AttendanceRoundUpSection)
                    .filter(
                        AttendanceRoundUpSection.company_id == company_id,
                        AttendanceRoundUpSection.id == sid_del,
                    )
                    .first()
                )
                if s_orphan is not None:
                    self.db.delete(s_orphan)
            self.db.flush()

        if _scope in ("all", "leave"):
            if "leave_levels" in payload:
                wanted_level_numbers: set = set()
                for lv in payload.get("leave_levels") or []:
                    ln = _int(lv.get("level_number"), 0)
                    if ln < 1 or ln > 6:
                        continue
                    wanted_level_numbers.add(ln)
                    cy_raw = lv.get("cumulative_year")
                    cy_val: Optional[int] = None
                    if cy_raw not in (None, ""):
                        try:
                            cy_val = int(cy_raw)
                        except Exception:
                            cy_val = None
                    lev = (
                        self.db.query(AttendanceLeaveLevel)
                        .filter(
                            AttendanceLeaveLevel.company_id == company_id,
                            AttendanceLeaveLevel.level_number == ln,
                        )
                        .first()
                    )
                    if lev is None:
                        lev = AttendanceLeaveLevel(company_id=company_id, level_number=ln)
                        self.db.add(lev)
                        self.db.flush()
                    lev.statutory_start_date = _pd(lv.get("statutory_start_date"))
                    lev.leave_other_start_date = _pd(lv.get("leave_other_start_date"))
                    lev.cumulative_year = cy_val
                    lev.summer_employee_plus_one = _bool(lv.get("summer_employee_plus_one"))
                    lev.display_start_date = _pd(lv.get("display_start_date"))
                    lev.thai_notice_text = str(lv.get("thai_notice_text") or "") or None
                    lev.certificate_web_path = str(lv.get("certificate_web_path") or "")[:500] or None
                    self.db.flush()
                    payload_lrows = [x for x in (lv.get("rows") or []) if isinstance(x, dict)]
                    sorted_lrows = sorted(
                        self.db.query(AttendanceLeaveLevelRow)
                        .filter(AttendanceLeaveLevelRow.leave_level_id == lev.id)
                        .all(),
                        key=lambda x: x.sort_order,
                    )
                    for bump_i, lr in enumerate(sorted_lrows):
                        lr.sort_order = 900 + bump_i
                    self.db.flush()
                    lrow_by_id = {int(x.id): x for x in sorted_lrows}
                    used_lr: set = set()
                    matched_lr: List[AttendanceLeaveLevelRow] = []
                    for i, r in enumerate(payload_lrows):
                        rid = _int(r.get("id"), 0) or _int(r.get("leave_row_id"), 0)
                        lrow: Optional[AttendanceLeaveLevelRow] = None
                        if rid > 0 and rid in lrow_by_id:
                            lrow = lrow_by_id[rid]
                        if lrow is None:
                            for cand in sorted_lrows:
                                if int(cand.id) not in used_lr:
                                    lrow = cand
                                    break
                        if lrow is None:
                            # leave row 임시 정렬값도 유니크하게 부여
                            next_tmp_order = 800 + len(sorted_lrows) + 1
                            lrow = AttendanceLeaveLevelRow(leave_level_id=lev.id, sort_order=next_tmp_order)
                            self.db.add(lrow)
                            self.db.flush()
                            sorted_lrows.append(lrow)
                            lrow_by_id[int(lrow.id)] = lrow
                        used_lr.add(int(lrow.id))
                        matched_lr.append(lrow)
                        lrow.sort_order = _int(r.get("sort_order"), i)
                        lrow.leave_type_name = str(r.get("leave_type_name") or "")[:200]
                        lrow.days_quota = _num(r.get("days_quota"), 0)
                        lrow.hours_quota = _int(r.get("hours_quota"), 0)
                        lrow.minutes_quota = _int(r.get("minutes_quota"), 0)
                        lrow.option_checked = _bool(r.get("option_checked"))
                    self.db.flush()
                    keep_lrow_ids = {int(x.id) for x in matched_lr}
                    for old in (
                        self.db.query(AttendanceLeaveLevelRow)
                        .filter(AttendanceLeaveLevelRow.leave_level_id == lev.id)
                        .all()
                    ):
                        if int(old.id) not in keep_lrow_ids:
                            self.db.delete(old)
                deleted_leave_level_ids = {
                    _int(x, 0)
                    for x in (payload.get("deleted_leave_level_ids") or [])
                    if _int(x, 0) > 0
                }
                for lev_id in deleted_leave_level_ids:
                    lev_o = (
                        self.db.query(AttendanceLeaveLevel)
                        .filter(
                            AttendanceLeaveLevel.company_id == company_id,
                            AttendanceLeaveLevel.id == lev_id,
                        )
                        .first()
                    )
                    if lev_o is not None:
                        self.db.delete(lev_o)
                self.db.flush()

            if "leave_global" in payload:
                lgp = payload.get("leave_global")
                if isinstance(lgp, dict):
                    gl_row = (
                        self.db.query(AttendanceLeaveGlobal)
                        .filter(AttendanceLeaveGlobal.company_id == company_id)
                        .first()
                    )
                    if gl_row is None:
                        gl_row = AttendanceLeaveGlobal(company_id=company_id)
                        self.db.add(gl_row)
                    gl_row.statutory_start_date = _pd(lgp.get("statutory_start_date"))
                    gl_row.leave_other_start_date = _pd(lgp.get("leave_other_start_date"))
                    cy_g = lgp.get("cumulative_year")
                    if cy_g not in (None, ""):
                        try:
                            gl_row.cumulative_year = int(cy_g)
                        except Exception:
                            gl_row.cumulative_year = None
                    else:
                        gl_row.cumulative_year = None
                    gl_row.summer_employee_plus_one = _bool(lgp.get("summer_employee_plus_one"))
                    gl_row.display_start_date = _pd(lgp.get("display_start_date"))
                    gl_row.thai_notice_text = str(lgp.get("thai_notice_text") or "") or None
                    gl_row.certificate_web_path = str(lgp.get("certificate_web_path") or "")[:500] or None
                    self.db.flush()

        if _scope in ("all", "holiday") and "holidays" in payload:
            kept_hol_ids: set = set()
            seen_hol_dates: set = set()
            for h in payload.get("holidays") or []:
                if not isinstance(h, dict):
                    continue
                hd = _pd(h.get("holiday_date"))
                if not hd:
                    continue
                if hd in seen_hol_dates:
                    continue
                seen_hol_dates.add(hd)
                hid = _int(h.get("id"), 0) or _int(h.get("holiday_id"), 0)
                h_row: Optional[AttendanceCompanyHoliday] = None
                if hid > 0:
                    h_row = (
                        self.db.query(AttendanceCompanyHoliday)
                        .filter(
                            AttendanceCompanyHoliday.company_id == company_id,
                            AttendanceCompanyHoliday.id == hid,
                        )
                        .first()
                    )
                if h_row is None:
                    h_row = (
                        self.db.query(AttendanceCompanyHoliday)
                        .filter(
                            AttendanceCompanyHoliday.company_id == company_id,
                            AttendanceCompanyHoliday.holiday_date == hd,
                        )
                        .first()
                    )
                if h_row is None:
                    h_row = AttendanceCompanyHoliday(
                        company_id=company_id,
                        holiday_date=hd,
                        remarks=str(h.get("remarks") or "") or None,
                    )
                    self.db.add(h_row)
                    self.db.flush()
                else:
                    h_row.holiday_date = hd
                    h_row.remarks = str(h.get("remarks") or "") or None
                kept_hol_ids.add(int(h_row.id))
            deleted_holiday_ids = {
                _int(x, 0)
                for x in (payload.get("deleted_holiday_ids") or [])
                if _int(x, 0) > 0
            }
            for hid_del in deleted_holiday_ids:
                h_del = (
                    self.db.query(AttendanceCompanyHoliday)
                    .filter(
                        AttendanceCompanyHoliday.company_id == company_id,
                        AttendanceCompanyHoliday.id == hid_del,
                    )
                    .first()
                )
                if h_del is not None:
                    self.db.delete(h_del)
            self.db.flush()

        if _scope in ("all", "payment") and "payment_periods" in payload:
            kept_pay_ids: set = set()
            seen_pay_keys: set = set()
            for p in payload.get("payment_periods") or []:
                if not isinstance(p, dict):
                    continue
                y = _int(p.get("calendar_year"), 0)
                m = _int(p.get("calendar_month"), 0)
                pl = str(p.get("period_label") or "Period 1")[:100]
                if y < 1900 or m < 1 or m > 12:
                    continue
                key = (y, m, pl)
                if key in seen_pay_keys:
                    continue
                seen_pay_keys.add(key)
                pid = _int(p.get("id"), 0) or _int(p.get("payment_period_id"), 0)
                prow: Optional[AttendancePaymentPeriod] = None
                if pid > 0:
                    prow = (
                        self.db.query(AttendancePaymentPeriod)
                        .filter(
                            AttendancePaymentPeriod.company_id == company_id,
                            AttendancePaymentPeriod.id == pid,
                        )
                        .first()
                    )
                if prow is None:
                    prow = (
                        self.db.query(AttendancePaymentPeriod)
                        .filter(
                            AttendancePaymentPeriod.company_id == company_id,
                            AttendancePaymentPeriod.calendar_year == y,
                            AttendancePaymentPeriod.calendar_month == m,
                            AttendancePaymentPeriod.period_label == pl,
                        )
                        .first()
                    )
                if prow is None:
                    prow = AttendancePaymentPeriod(
                        company_id=company_id,
                        calendar_year=y,
                        calendar_month=m,
                        period_label=pl,
                        start_date_daily=_pd(p.get("start_date_daily")),
                        end_date_daily=_pd(p.get("end_date_daily")),
                        start_date_monthly=_pd(p.get("start_date_monthly")),
                        end_date_monthly=_pd(p.get("end_date_monthly")),
                        ot_start_daily=_pd(p.get("ot_start_daily")),
                        ot_end_daily=_pd(p.get("ot_end_daily")),
                        ot_start_monthly=_pd(p.get("ot_start_monthly")),
                        ot_end_monthly=_pd(p.get("ot_end_monthly")),
                        remarks=str(p.get("remarks") or "") or None,
                    )
                    self.db.add(prow)
                    self.db.flush()
                else:
                    prow.calendar_year = y
                    prow.calendar_month = m
                    prow.period_label = pl
                    prow.start_date_daily = _pd(p.get("start_date_daily"))
                    prow.end_date_daily = _pd(p.get("end_date_daily"))
                    prow.start_date_monthly = _pd(p.get("start_date_monthly"))
                    prow.end_date_monthly = _pd(p.get("end_date_monthly"))
                    prow.ot_start_daily = _pd(p.get("ot_start_daily"))
                    prow.ot_end_daily = _pd(p.get("ot_end_daily"))
                    prow.ot_start_monthly = _pd(p.get("ot_start_monthly"))
                    prow.ot_end_monthly = _pd(p.get("ot_end_monthly"))
                    prow.remarks = str(p.get("remarks") or "") or None
                kept_pay_ids.add(int(prow.id))
            deleted_payment_ids = {
                _int(x, 0)
                for x in (payload.get("deleted_payment_period_ids") or [])
                if _int(x, 0) > 0
            }
            for p_del_id in deleted_payment_ids:
                p_del = (
                    self.db.query(AttendancePaymentPeriod)
                    .filter(
                        AttendancePaymentPeriod.company_id == company_id,
                        AttendancePaymentPeriod.id == p_del_id,
                    )
                    .first()
                )
                if p_del is not None:
                    self.db.delete(p_del)
            self.db.flush()

        if _scope == "all" and "work_calendars" in payload:
            shift_id_by_code: Dict[str, int] = {}
            for row in (
                self.db.query(AttendanceShift)
                .filter(AttendanceShift.company_id == company_id)
                .all()
            ):
                kc = _norm_shift_code_key(row.shift_code)
                if kc:
                    shift_id_by_code[kc] = int(row.id)
            valid_shift_ids = set(shift_id_by_code.values())

            payload_groups = payload.get("shift_group_masters") or []
            kept_cal_ids: set = set()
            for c in payload.get("work_calendars") or []:
                y = _int(c.get("calendar_year"), 0)
                m = _int(c.get("calendar_month"), 0)
                gid, gname_resolved = _resolve_calendar_shift_group_for_upsert(
                    self.db, company_id, c, payload_groups
                )
                if y < 1900 or m < 1 or m > 12 or gid <= 0:
                    continue
                cid = _int(c.get("id"), 0)
                cal_row: Optional[AttendanceWorkCalendar] = None
                if cid > 0:
                    cal_row = (
                        self.db.query(AttendanceWorkCalendar)
                        .filter(
                            AttendanceWorkCalendar.company_id == company_id,
                            AttendanceWorkCalendar.id == cid,
                        )
                        .first()
                    )
                if cal_row is None:
                    cal_row = (
                        self.db.query(AttendanceWorkCalendar)
                        .filter(
                            AttendanceWorkCalendar.company_id == company_id,
                            AttendanceWorkCalendar.calendar_year == y,
                            AttendanceWorkCalendar.calendar_month == m,
                            AttendanceWorkCalendar.shift_group_id == gid,
                        )
                        .first()
                    )
                if cal_row is None:
                    cal_row = AttendanceWorkCalendar(
                        company_id=company_id,
                        calendar_year=y,
                        calendar_month=m,
                        shift_group_id=gid,
                        shift_group_name=gname_resolved or None,
                        shift_id=None,
                        shift_code=None,
                    )
                    self.db.add(cal_row)
                    self.db.flush()
                else:
                    cal_row.calendar_year = y
                    cal_row.calendar_month = m
                    cal_row.shift_group_id = gid
                    cal_row.shift_group_name = gname_resolved or None
                    cal_row.shift_id = None
                    cal_row.shift_code = None
                self.db.flush()
                kept_cal_ids.add(int(cal_row.id))

                wanted_days: set = set()
                for d in c.get("days") or []:
                    day = _int(d.get("day_of_month"), 0)
                    if day < 1 or day > 31 or day in wanted_days:
                        continue
                    wanted_days.add(day)
                    code = str(d.get("shift_code") or "").strip()[:50]
                    day_shift_id: Optional[int] = None
                    if code and code in shift_id_by_code:
                        day_shift_id = int(shift_id_by_code[code])
                    elif _int(d.get("shift_id"), 0) > 0:
                        sid_cand = _int(d.get("shift_id"), 0)
                        if sid_cand in valid_shift_ids:
                            day_shift_id = sid_cand
                    day_row = (
                        self.db.query(AttendanceWorkCalendarDay)
                        .filter(
                            AttendanceWorkCalendarDay.calendar_id == cal_row.id,
                            AttendanceWorkCalendarDay.day_of_month == day,
                        )
                        .first()
                    )
                    if day_row:
                        day_row.company_id = company_id
                        day_row.shift_code = code or None
                        day_row.shift_id = day_shift_id
                        day_row.is_workday = _bool(d.get("is_workday"), True)
                    else:
                        self.db.add(
                            AttendanceWorkCalendarDay(
                                calendar_id=cal_row.id,
                                company_id=company_id,
                                day_of_month=day,
                                shift_code=code or None,
                                shift_id=day_shift_id,
                                is_workday=_bool(d.get("is_workday"), True),
                            )
                        )
                for d_del in (
                    self.db.query(AttendanceWorkCalendarDay)
                    .filter(AttendanceWorkCalendarDay.calendar_id == cal_row.id)
                    .all()
                ):
                    if d_del.day_of_month not in wanted_days:
                        self.db.delete(d_del)
            for cal_o in (
                self.db.query(AttendanceWorkCalendar)
                .filter(AttendanceWorkCalendar.company_id == company_id)
                .all()
            ):
                if int(cal_o.id) not in kept_cal_ids:
                    self.db.delete(cal_o)
            self.db.flush()

        self.db.commit()
        return self.get_bundle(company_id, user)
