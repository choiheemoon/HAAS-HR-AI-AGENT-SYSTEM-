'use client';

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { apiClient } from '@/lib/api';
import { Building2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';

type CompanyRow = {
  id: number;
  company_code: string;
  name_kor?: string | null;
  name_thai?: string | null;
  name_eng?: string | null;
};

type OtRangeRow = {
  /** attendance_shift_ot_range.id */
  id?: number;
  sort_order: number;
  range_start: string;
  range_end: string;
  /** 월급(M) 평일 / 일요 / 전통휴 — 급여처리 Monthly 유형 */
  monthly_rate_a: number | null;
  monthly_rate_b: number | null;
  monthly_rate_holiday: number | null;
  /** 시급(D) 평일 / 일요 / 전통휴 — 급여처리 Daily 유형 */
  daily_rate_a: number | null;
  daily_rate_b: number | null;
  daily_rate_holiday: number | null;
};

/** OT 표 하단 지각 포함·Shift / 조퇴 포함·식대 수당 (월급·시급 × 평일·일요·휴일) */
type AllowanceBand3 = { weekday: number; sunday: number; holiday: number };
type ShiftAllowanceRow = { enabled: boolean; monthly: AllowanceBand3; daily: AllowanceBand3 };

type ShiftRow = {
  /** 서버 attendance_shift.id — 저장 시 UPDATE에 필요 */
  id?: number;
  shift_code: string;
  title: string;
  start_check_in: string;
  start_work: string;
  lateness_count_start: string;
  break_late_time: string;
  break_late_enabled: boolean;
  break_early_time: string;
  break_early_enabled: boolean;
  break_sum: string;
  time_out: string;
  continue_shift_without_zip_minutes: number;
  work_on_holiday: boolean;
  late_enabled: boolean;
  late_threshold_minutes: number;
  late_shift_note: string;
  late_monthly_note: string;
  early_enabled: boolean;
  leaves_enabled: boolean;
  leave_food_minutes: number;
  leave_food_monthly: number;
  leave_food_daily: number;
  continuous_ot_minutes: number;
  continuous_ot_after: boolean;
  continuous_ot_before: boolean;
  allowance_food: number;
  allowance_food_monthly: number;
  allowance_food_daily: number;
  allowance_shift: number;
  work_holiday_threshold_minutes: number;
  work_holiday_daily: number;
  work_holiday_monthly: number;
  late_daily: number;
  late_monthly: number;
  early_threshold_minutes: number;
  early_daily: number;
  early_monthly: number;
  leaves_threshold_minutes: number;
  leaves_daily: number;
  leaves_monthly: number;
  food_daily: number;
  food_monthly: number;
  late_shift_allowance: ShiftAllowanceRow;
  early_food_allowance: ShiftAllowanceRow;
  ot_ranges: OtRangeRow[];
};

type RoundTier = {
  id?: number;
  row_index: number;
  value_from: number;
  value_to: number;
  rounded_minutes: number;
};
type RoundSection = {
  id?: number;
  tab_key: string;
  section_key: string;
  mode_code: string;
  flag_payroll_include: boolean;
  flag_first_minute: boolean;
  flag_footer: boolean;
  flag_use_late_count: boolean;
  tiers: RoundTier[];
  extra_json?: Record<string, unknown> | null;
};

const ROUND_LATENESS_ROWS = 8;
const ROUND_OT_ROWS = 11;
const ROUND_OTHER_ROWS = 6;

type LateDayMode = 'exceed_hour' | 'sum_minutes';
type LateCountChargeMode = 'charge_per' | 'charge_in';

function parseExtraJson(x: unknown): Record<string, unknown> {
  if (x && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return {};
}

/** Parse "HH:mm" clock time to minutes from midnight (0–23h). */
function parseClockHmToMinutes(s: string): number | null {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min < 0 || min > 59 || h < 0 || h > 23) return null;
  return h * 60 + min;
}

/** Parse "HH:mm" as duration (e.g. 00:20 → 20 minutes). */
function parseDurationHmToMinutes(s: string): number | null {
  return parseClockHmToMinutes(s);
}

/** Net work minutes: (time_out − start_work) − break_sum; if time_out ≤ start_work, assume next calendar day. */
function computeShiftNetWorkMinutes(startWork: string, timeOut: string, breakSum: string): number | null {
  const ws = parseClockHmToMinutes(startWork);
  const te = parseClockHmToMinutes(timeOut);
  if (ws === null || te === null) return null;
  let endM = te;
  if (endM <= ws) endM += 24 * 60;
  const bs = String(breakSum ?? '').trim();
  let breakMin = 0;
  if (bs) {
    const parsed = parseDurationHmToMinutes(bs);
    if (parsed === null) return null;
    breakMin = parsed;
  }
  const net = endM - ws - breakMin;
  if (net < 0) return null;
  return net;
}

function formatMinutesAsHM(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

const _pad2 = (n: number) => String(Math.trunc(n)).padStart(2, '0');

/**
 * Blur-time HH:mm normalization: "0500" → "05:00", "930" → "09:30", "17" → "17:00".
 * Keeps invalid or ambiguous input unchanged.
 */
function normalizeHmInput(raw: string): string {
  const t = raw.trim();
  if (!t) return '';

  const withColon = t.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
  if (withColon) {
    const h = parseInt(withColon[1], 10);
    const m = parseInt(withColon[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(m) || m < 0 || m > 59 || h < 0 || h > 23) return t;
    return `${_pad2(h)}:${_pad2(m)}`;
  }

  const digits = t.replace(/\D/g, '');
  if (!digits) return t;

  let h: number;
  let m: number;
  if (digits.length === 1) {
    h = parseInt(digits, 10);
    m = 0;
  } else if (digits.length === 2) {
    h = parseInt(digits, 10);
    m = 0;
  } else if (digits.length === 3) {
    h = parseInt(digits.slice(0, 1), 10);
    m = parseInt(digits.slice(1), 10);
  } else {
    const chunk = digits.length > 4 ? digits.slice(0, 4) : digits;
    h = parseInt(chunk.slice(0, 2), 10);
    m = parseInt(chunk.slice(2), 10);
  }

  if (!Number.isFinite(h) || !Number.isFinite(m) || m < 0 || m > 59 || h < 0 || h > 23) return t;
  return `${_pad2(h)}:${_pad2(m)}`;
}

function addMinutesToHm(hm: string, deltaMin: number): string | null {
  const base = parseClockHmToMinutes(hm);
  if (base == null) return null;
  const normalized = ((base + deltaMin) % (24 * 60) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${_pad2(h)}:${_pad2(m)}`;
}

function recalcOtRangeStarts(rows: OtRangeRow[]): OtRangeRow[] {
  const next = rows.map((row) => ({ ...row }));
  for (let i = 1; i < next.length; i += 1) {
    const currentEnd = normalizeHmInput(String(next[i]?.range_end ?? ''));
    const hasCurrentEnd = parseClockHmToMinutes(currentEnd) != null;
    if (!hasCurrentEnd) {
      next[i] = { ...next[i], range_start: '' };
      continue;
    }
    const prevEnd = normalizeHmInput(String(next[i - 1]?.range_end ?? ''));
    const autoStart = addMinutesToHm(prevEnd, 1);
    next[i] = { ...next[i], range_start: autoStart ?? '' };
  }
  return next;
}

function normalizeRoundTiers(tiers: RoundTier[] | undefined, n: number): RoundTier[] {
  return Array.from({ length: n }, (_, i) => {
    const t = tiers?.[i];
    return {
      row_index: i,
      value_from: t?.value_from ?? 0,
      value_to: t?.value_to ?? 0,
      rounded_minutes: t?.rounded_minutes ?? 0,
    };
  });
}

function tiersFromExtraArray(arr: unknown, n: number): RoundTier[] {
  if (!Array.isArray(arr)) return normalizeRoundTiers(undefined, n);
  return Array.from({ length: n }, (_, i) => {
    const raw = arr[i];
    if (!raw || typeof raw !== 'object')
      return { row_index: i, value_from: 0, value_to: 0, rounded_minutes: 0 };
    const o = raw as Record<string, unknown>;
    return {
      row_index: i,
      value_from: _tierInt(o.value_from),
      value_to: _tierInt(o.value_to),
      rounded_minutes: _tierInt(o.rounded_minutes),
    };
  });
}

function _tierInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function serializeTiersForExtra(rows: RoundTier[]) {
  return rows.map((r) => ({
    value_from: r.value_from,
    value_to: r.value_to,
    rounded_minutes: r.rounded_minutes,
  }));
}

function lateModesFromExtra(ex: Record<string, unknown>) {
  const dm = ex.late_day_mode === 'exceed_hour' || ex.late_day_mode === 'sum_minutes' ? ex.late_day_mode : 'sum_minutes';
  const pm =
    ex.late_period_mode === 'exceed_hour' || ex.late_period_mode === 'sum_minutes' ? ex.late_period_mode : 'exceed_hour';
  const cm =
    ex.late_count_charge_mode === 'charge_in' || ex.late_count_charge_mode === 'charge_per'
      ? ex.late_count_charge_mode
      : 'charge_per';
  const earlyOut = ex.late_count_with_early_out === true;
  return { late_day_mode: dm as LateDayMode, late_period_mode: pm as LateDayMode, late_count_charge_mode: cm as LateCountChargeMode, late_count_with_early_out: earlyOut };
}

/** 조퇴 탭 전용 extra_json (TigerSoft) */
function earlyModesFromExtra(ex: Record<string, unknown>) {
  const dm =
    ex.early_day_mode === 'exceed_hour' || ex.early_day_mode === 'sum_minutes' ? ex.early_day_mode : 'exceed_hour';
  const pm =
    ex.early_period_mode === 'exceed_hour' || ex.early_period_mode === 'sum_minutes'
      ? ex.early_period_mode
      : 'exceed_hour';
  const cm =
    ex.early_count_charge_mode === 'charge_in' || ex.early_count_charge_mode === 'charge_per'
      ? ex.early_count_charge_mode
      : 'charge_per';
  return {
    early_day_mode: dm as LateDayMode,
    early_period_mode: pm as LateDayMode,
    early_count_charge_mode: cm as LateCountChargeMode,
  };
}

/** OT 탭 전용 extra_json (TigerSoft) */
function otConfigFromExtra(ex: Record<string, unknown>) {
  const dm = ex.ot_day_mode === 'sum_minutes' || ex.ot_day_mode === 'exceed_hour' ? ex.ot_day_mode : 'exceed_hour';
  const pm =
    ex.ot_period_mode === 'sum_minutes' || ex.ot_period_mode === 'exceed_hour' ? ex.ot_period_mode : 'exceed_hour';
  const payrollNoSeparate = ex.ot_payroll_no_separate_ot_holiday === true;
  const roundWorking = ex.ot_round_up_working !== false;
  return {
    ot_day_mode: dm as LateDayMode,
    ot_period_mode: pm as LateDayMode,
    ot_payroll_no_separate_ot_holiday: payrollNoSeparate,
    ot_round_up_working: roundWorking,
  };
}

type LeaveRow = {
  id?: number;
  sort_order: number;
  leave_type_name: string;
  days_quota: number;
  hours_quota: number;
  minutes_quota: number;
  option_checked: boolean;
};

type LeaveLevel = {
  id?: number;
  level_number: number;
  statutory_start_date?: string | null;
  leave_other_start_date?: string | null;
  display_start_date?: string | null;
  cumulative_year?: number | null;
  summer_employee_plus_one?: boolean;
  thai_notice_text?: string;
  certificate_web_path?: string;
  rows: LeaveRow[];
};

type HolidayRow = { id?: number; holiday_date: string; remarks: string };

type PaymentRow = {
  id?: number;
  calendar_year: number;
  calendar_month: number;
  period_label: string;
  start_date_daily: string;
  end_date_daily: string;
  start_date_monthly: string;
  end_date_monthly: string;
  ot_start_daily: string;
  ot_end_daily: string;
  ot_start_monthly: string;
  ot_end_monthly: string;
  remarks: string;
};

type ShiftGroupMasterRow = {
  id?: number;
  sort_order: number;
  name: string;
  description: string;
};

type Bundle = {
  company_id: number;
  company_settings: Record<string, unknown>;
  special_allowances: Array<{
    slot_index: number;
    name: string;
    working_ot_on_holiday: boolean;
    payment_full_day: boolean;
    no_payment_late_early: boolean;
  }>;
  shifts: ShiftRow[];
  shift_group_masters: ShiftGroupMasterRow[];
  round_up_sections: RoundSection[];
  leave_levels: LeaveLevel[];
  leave_global: Record<string, unknown>;
  holidays: HolidayRow[];
  payment_periods: PaymentRow[];
};

function emptyAllowanceRow(): ShiftAllowanceRow {
  return {
    enabled: false,
    monthly: { weekday: 0, sunday: 0, holiday: 0 },
    daily: { weekday: 0, sunday: 0, holiday: 0 },
  };
}

function normalizeAllowanceRow(raw: unknown): ShiftAllowanceRow {
  const d = emptyAllowanceRow();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const o = raw as Record<string, unknown>;
  d.enabled = Boolean(o.enabled);
  for (const band of ['monthly', 'daily'] as const) {
    const sub = o[band];
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      const s = sub as Record<string, unknown>;
      d[band] = {
        weekday: Math.max(0, Math.floor(Number(s.weekday) || 0)),
        sunday: Math.max(0, Math.floor(Number(s.sunday) || 0)),
        holiday: Math.max(0, Math.floor(Number(s.holiday) || 0)),
      };
    }
  }
  return d;
}

function mergeAllowanceRow(base: ShiftAllowanceRow, patch: Partial<ShiftAllowanceRow>): ShiftAllowanceRow {
  return {
    enabled: patch.enabled !== undefined ? patch.enabled : base.enabled,
    monthly: patch.monthly ? { ...base.monthly, ...patch.monthly } : base.monthly,
    daily: patch.daily ? { ...base.daily, ...patch.daily } : base.daily,
  };
}

function emptyOtRanges(): OtRangeRow[] {
  return Array.from({ length: 8 }, (_, i) => ({
    sort_order: i,
    range_start: '',
    range_end: '',
    monthly_rate_a: null,
    monthly_rate_b: null,
    monthly_rate_holiday: null,
    daily_rate_a: null,
    daily_rate_b: null,
    daily_rate_holiday: null,
  }));
}

function emptyShift(code: string): ShiftRow {
  return {
    shift_code: code,
    title: code,
    start_check_in: '',
    start_work: '',
    lateness_count_start: '',
    break_late_time: '',
    break_late_enabled: false,
    break_early_time: '',
    break_early_enabled: false,
    break_sum: '',
    time_out: '',
    continue_shift_without_zip_minutes: 0,
    work_on_holiday: false,
    late_enabled: false,
    late_threshold_minutes: 0,
    late_shift_note: '',
    late_monthly_note: '',
    early_enabled: false,
    leaves_enabled: false,
    leave_food_minutes: 0,
    leave_food_monthly: 0,
    leave_food_daily: 0,
    continuous_ot_minutes: 0,
    continuous_ot_after: false,
    continuous_ot_before: false,
    allowance_food: 0,
    allowance_food_monthly: 0,
    allowance_food_daily: 0,
    allowance_shift: 0,
    work_holiday_threshold_minutes: 0,
    work_holiday_daily: 0,
    work_holiday_monthly: 0,
    late_daily: 0,
    late_monthly: 0,
    early_threshold_minutes: 0,
    early_daily: 0,
    early_monthly: 0,
    leaves_threshold_minutes: 0,
    leaves_daily: 0,
    leaves_monthly: 0,
    food_daily: 0,
    food_monthly: 0,
    late_shift_allowance: emptyAllowanceRow(),
    early_food_allowance: emptyAllowanceRow(),
    ot_ranges: emptyOtRanges(),
  };
}

function normalizeShiftRow(s: Partial<ShiftRow> & { shift_code?: string }): ShiftRow {
  const code = (s.shift_code && String(s.shift_code).trim()) || 'SHIFT';
  const otr = emptyOtRanges();
  const rows = s.ot_ranges?.length ? s.ot_ranges : [];
  const z = (v: unknown) => (v == null || v === '' ? '' : String(v));
  rows.slice(0, 8).forEach((r, i) => {
    otr[i] = {
      id: coerceOptionalInt((r as { id?: unknown }).id),
      sort_order: i,
      range_start: z(r.range_start),
      range_end: z(r.range_end),
      monthly_rate_a: r.monthly_rate_a ?? null,
      monthly_rate_b: r.monthly_rate_b ?? null,
      monthly_rate_holiday: r.monthly_rate_holiday ?? null,
      daily_rate_a: r.daily_rate_a ?? null,
      daily_rate_b: r.daily_rate_b ?? null,
      daily_rate_holiday: r.daily_rate_holiday ?? null,
    };
  });
  const leg = typeof s.leave_food_minutes === 'number' ? s.leave_food_minutes : 0;
  const ag = typeof s.allowance_food === 'number' ? s.allowance_food : 0;
  return {
    id: coerceOptionalInt(
      (s as { id?: unknown }).id ?? (s as { shift_id?: unknown }).shift_id ?? (s as { shiftId?: unknown }).shiftId
    ),
    shift_code: code,
    title: z(s.title) || code,
    start_check_in: z(s.start_check_in),
    start_work: z(s.start_work),
    lateness_count_start: z(s.lateness_count_start),
    break_late_time: z(s.break_late_time),
    break_late_enabled: Boolean(s.break_late_enabled),
    break_early_time: z(s.break_early_time),
    break_early_enabled: Boolean(s.break_early_enabled),
    break_sum: z(s.break_sum),
    time_out: z(s.time_out),
    continue_shift_without_zip_minutes:
      typeof s.continue_shift_without_zip_minutes === 'number' ? s.continue_shift_without_zip_minutes : 0,
    work_on_holiday: Boolean(s.work_on_holiday),
    late_enabled: Boolean(s.late_enabled),
    late_threshold_minutes: typeof s.late_threshold_minutes === 'number' ? s.late_threshold_minutes : 0,
    late_shift_note: z(s.late_shift_note),
    late_monthly_note: z(s.late_monthly_note),
    early_enabled: Boolean(s.early_enabled),
    leaves_enabled: Boolean(s.leaves_enabled),
    leave_food_minutes: typeof s.leave_food_minutes === 'number' ? s.leave_food_minutes : leg,
    leave_food_monthly: typeof s.leave_food_monthly === 'number' ? s.leave_food_monthly : leg,
    leave_food_daily: typeof s.leave_food_daily === 'number' ? s.leave_food_daily : leg,
    continuous_ot_minutes: typeof s.continuous_ot_minutes === 'number' ? s.continuous_ot_minutes : 0,
    continuous_ot_after: Boolean(s.continuous_ot_after),
    continuous_ot_before: Boolean(s.continuous_ot_before),
    allowance_food: typeof s.allowance_food === 'number' ? s.allowance_food : ag,
    allowance_food_monthly: typeof s.allowance_food_monthly === 'number' ? s.allowance_food_monthly : ag,
    allowance_food_daily: typeof s.allowance_food_daily === 'number' ? s.allowance_food_daily : ag,
    allowance_shift: typeof s.allowance_shift === 'number' ? s.allowance_shift : 0,
    ot_ranges: otr,
    work_holiday_threshold_minutes:
      typeof s.work_holiday_threshold_minutes === 'number'
        ? s.work_holiday_threshold_minutes
        : typeof s.allowance_shift === 'number'
          ? s.allowance_shift
          : 0,
    work_holiday_daily:
      typeof s.work_holiday_daily === 'number'
        ? s.work_holiday_daily
        : typeof s.allowance_food_daily === 'number'
          ? s.allowance_food_daily
          : 0,
    work_holiday_monthly:
      typeof s.work_holiday_monthly === 'number'
        ? s.work_holiday_monthly
        : typeof s.allowance_food_monthly === 'number'
          ? s.allowance_food_monthly
          : 0,
    late_daily:
      typeof s.late_daily === 'number'
        ? s.late_daily
        : Number.isFinite(Number(s.late_shift_note))
          ? Number(s.late_shift_note)
          : 0,
    late_monthly:
      typeof s.late_monthly === 'number'
        ? s.late_monthly
        : Number.isFinite(Number(s.late_monthly_note))
          ? Number(s.late_monthly_note)
          : 0,
    early_threshold_minutes: typeof s.early_threshold_minutes === 'number' ? s.early_threshold_minutes : 0,
    early_daily: typeof s.early_daily === 'number' ? s.early_daily : 0,
    early_monthly: typeof s.early_monthly === 'number' ? s.early_monthly : 0,
    leaves_threshold_minutes: typeof s.leaves_threshold_minutes === 'number' ? s.leaves_threshold_minutes : 0,
    leaves_daily: typeof s.leaves_daily === 'number' ? s.leaves_daily : 0,
    leaves_monthly: typeof s.leaves_monthly === 'number' ? s.leaves_monthly : 0,
    food_daily:
      typeof s.food_daily === 'number'
        ? s.food_daily
        : typeof s.leave_food_daily === 'number'
          ? s.leave_food_daily
          : 0,
    food_monthly:
      typeof s.food_monthly === 'number'
        ? s.food_monthly
        : typeof s.leave_food_monthly === 'number'
          ? s.leave_food_monthly
          : 0,
    late_shift_allowance: normalizeAllowanceRow((s as Partial<ShiftRow>).late_shift_allowance),
    early_food_allowance: normalizeAllowanceRow((s as Partial<ShiftRow>).early_food_allowance),
  };
}

function defaultTiers(n = 6): RoundTier[] {
  return Array.from({ length: n }, (_, i) => ({
    row_index: i,
    value_from: 0,
    value_to: 0,
    rounded_minutes: 0,
  }));
}

function emptyLeaveLevelMeta(n: number): LeaveLevel {
  return {
    level_number: n,
    statutory_start_date: null,
    leave_other_start_date: null,
    display_start_date: null,
    cumulative_year: null,
    summer_employee_plus_one: false,
    thai_notice_text: '',
    certificate_web_path: '',
    rows: [],
  };
}

function padLeaveLevels(levels: LeaveLevel[]): LeaveLevel[] {
  const m = new Map(
    levels.map((l) => [
      l.level_number,
      { ...emptyLeaveLevelMeta(l.level_number), ...l, rows: l.rows ?? [] },
    ])
  );
  const out: LeaveLevel[] = [];
  for (let i = 1; i <= 6; i++) {
    out.push(m.get(i) ?? emptyLeaveLevelMeta(i));
  }
  return out;
}

function daysInCalendarMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function padIsoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** API·JSON에서 id가 문자열로 올 때도 유지 (근무달력 FK 해석에 shift_group_masters.id 필요) */
function coerceOptionalInt(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  }
  return undefined;
}

/** 저장 본문용 — 문자열 id·누락 시에도 서버가 PK로 UPDATE 할 수 있게 숫자만 통과 */
function entityPayloadId(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = Number(String(v).trim());
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
}

function shiftRowPayloadId(s: ShiftRow): number | null {
  return entityPayloadId(s.id as unknown);
}

function toShiftPayloadRows(rows: ShiftRow[]): Record<string, unknown>[] {
  return rows.map((s) => {
    const row = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    row.id = shiftRowPayloadId(s);
    row.ot_ranges = (s.ot_ranges || []).map((otr) => {
      const o = JSON.parse(JSON.stringify(otr)) as Record<string, unknown>;
      o.id = entityPayloadId((otr as { id?: unknown }).id);
      return o;
    });
    return row;
  });
}

function cloneBundle(b: Bundle): Bundle {
  return JSON.parse(JSON.stringify(b)) as Bundle;
}

const inputCls =
  'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100';
const fieldsetCls = 'rounded-md border border-rose-200/80 bg-rose-50/30 p-2 sm:p-3 space-y-2';
const shiftPanelCls =
  'rounded-md border border-slate-200 bg-white shadow-sm p-3 space-y-2.5 min-w-0';

type MainTab = 'company' | 'shift' | 'shift_group' | 'round' | 'leave' | 'holiday' | 'payment';

export default function AttendanceStandardManagePage() {
  const { t, locale } = useI18n();
  const { can, loading: permLoading } = useMenuPermissions();
  const allowRead = can('attendance-standard-manage', 'can_read');
  const allowSave = can('attendance-standard-manage', 'can_update');

  const toolbarT = useCallback((key: string) => t(key), [t]);

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [draft, setDraft] = useState<Bundle | null>(null);
  const [uiMode, setUiMode] = useState<MasterUiMode>('browse');
  const [saving, setSaving] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('company');
  const [shiftIdx, setShiftIdx] = useState(0);
  const [shiftGroupIdx, setShiftGroupIdx] = useState(0);
  const [deletedShiftIds, setDeletedShiftIds] = useState<number[]>([]);
  const [deletedShiftGroupIds, setDeletedShiftGroupIds] = useState<number[]>([]);
  const [deletedHolidayIds, setDeletedHolidayIds] = useState<number[]>([]);
  const [deletedPaymentPeriodIds, setDeletedPaymentPeriodIds] = useState<number[]>([]);
  const [leaveLv, setLeaveLv] = useState(1);
  const [roundTab, setRoundTab] = useState<'lateness' | 'early_checkout' | 'ot'>('lateness');
  const [payFilterYear, setPayFilterYear] = useState<string>('');
  const [bundleLoadError, setBundleLoadError] = useState<string | null>(null);
  const [holidayCal, setHolidayCal] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await apiClient.getCompanies();
      setCompanies((res.data as CompanyRow[]) ?? []);
    } catch {
      setCompanies([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCompanies();
  }, [fetchCompanies]);

  const loadBundle = useCallback(
    async (id: number) => {
      setBundleLoading(true);
      setBundleLoadError(null);
      try {
      const res = await apiClient.getAttendanceStandard(id);
      const raw = res.data as Bundle;
      const lg = raw.leave_global;
      if (lg && typeof lg === 'object') {
        const g = lg as Record<string, unknown>;
        const levels = raw.leave_levels || [];
        for (const lv of levels) {
          if (lv.statutory_start_date == null && g.statutory_start_date != null)
            lv.statutory_start_date = String(g.statutory_start_date).slice(0, 10);
          if (lv.leave_other_start_date == null && g.leave_other_start_date != null)
            lv.leave_other_start_date = String(g.leave_other_start_date).slice(0, 10);
          if (lv.display_start_date == null && g.display_start_date != null)
            lv.display_start_date = String(g.display_start_date).slice(0, 10);
          if (lv.cumulative_year == null && g.cumulative_year != null && g.cumulative_year !== '')
            lv.cumulative_year = Number(g.cumulative_year);
          if (
            (lv.summer_employee_plus_one === undefined || lv.summer_employee_plus_one === false) &&
            g.summer_employee_plus_one === true
          )
            lv.summer_employee_plus_one = true;
          if (
            (!lv.thai_notice_text || String(lv.thai_notice_text).trim() === '') &&
            g.thai_notice_text != null
          )
            lv.thai_notice_text = String(g.thai_notice_text);
          if (
            (!lv.certificate_web_path || String(lv.certificate_web_path).trim() === '') &&
            g.certificate_web_path != null
          )
            lv.certificate_web_path = String(g.certificate_web_path);
        }
      }
      raw.leave_levels = padLeaveLevels(raw.leave_levels || []).map((lv) => ({
          ...lv,
          id: coerceOptionalInt((lv as { id?: unknown }).id),
          rows: (lv.rows || []).map((r) => ({
            ...r,
            id: coerceOptionalInt((r as { id?: unknown }).id),
          })),
        }));
        raw.shifts = (raw.shifts || []).map((s) => normalizeShiftRow(s as Partial<ShiftRow>));
        raw.round_up_sections = (raw.round_up_sections || []).map((sec) => ({
          ...(sec as RoundSection),
          id: coerceOptionalInt((sec as { id?: unknown }).id),
          tiers: ((sec as RoundSection).tiers || []).map((t) => ({
            ...t,
            id: coerceOptionalInt((t as { id?: unknown }).id),
          })),
        }));
        raw.shift_group_masters = (raw.shift_group_masters || []).map((x, i) => ({
          id: coerceOptionalInt(x?.id),
          sort_order: typeof x?.sort_order === 'number' ? x.sort_order : i,
          name: String(x?.name ?? ''),
          description: String(x?.description ?? ''),
        }));
        raw.holidays = (raw.holidays || []).map((h) => ({
          ...h,
          id: coerceOptionalInt((h as { id?: unknown }).id),
        }));
        raw.payment_periods = (raw.payment_periods || []).map((p) => ({
          ...p,
          id: coerceOptionalInt((p as { id?: unknown }).id),
        }));
        if (raw.shifts.length === 0) setShiftIdx(0);
        else setShiftIdx(0);
        if ((raw.shift_group_masters || []).length === 0) setShiftGroupIdx(0);
        else setShiftGroupIdx(0);
        setDeletedShiftIds([]);
        setDeletedShiftGroupIds([]);
        setDeletedHolidayIds([]);
        setDeletedPaymentPeriodIds([]);
        setDraft(cloneBundle(raw));
      } catch (e: unknown) {
        setDeletedShiftIds([]);
        setDeletedShiftGroupIds([]);
        setDeletedHolidayIds([]);
        setDeletedPaymentPeriodIds([]);
        setDraft(null);
        const err = e as { response?: { data?: { detail?: unknown } } };
        const d = err?.response?.data?.detail;
        let msg = '';
        if (typeof d === 'string') msg = d;
        else if (Array.isArray(d))
          msg = d
            .map((x: { msg?: string }) => (typeof x?.msg === 'string' ? x.msg : ''))
            .filter(Boolean)
            .join(' ');
        setBundleLoadError(msg || t('attendanceStandard.loadError'));
      } finally {
        setBundleLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (selectedId != null) void loadBundle(selectedId);
    else {
      setDraft(null);
      setBundleLoadError(null);
    }
  }, [selectedId, loadBundle]);

  const pickName = useCallback(
    (c: CompanyRow) => {
      if (locale === 'ko') return c.name_kor || c.name_eng || c.name_thai || c.company_code;
      if (locale === 'en') return c.name_eng || c.name_kor || c.name_thai || c.company_code;
      return c.name_thai || c.name_kor || c.name_eng || c.company_code;
    },
    [locale]
  );

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return companies.filter(
      (c) =>
        c.company_code.toLowerCase().includes(q) ||
        (c.name_kor || '').toLowerCase().includes(q) ||
        (c.name_thai || '').toLowerCase().includes(q) ||
        (c.name_eng || '').toLowerCase().includes(q)
    );
  }, [companies, searchTerm]);

  const sortedList = useMemo(
    () => [...filtered].sort((a, b) => a.company_code.localeCompare(b.company_code)),
    [filtered]
  );

  const selectedIndex = useMemo(
    () => (selectedId != null ? sortedList.findIndex((c) => c.id === selectedId) : -1),
    [sortedList, selectedId]
  );

  const selectedCompany = useMemo(() => {
    if (selectedId == null) return null;
    return sortedList.find((c) => c.id === selectedId) ?? companies.find((c) => c.id === selectedId) ?? null;
  }, [sortedList, companies, selectedId]);

  const goNav = (idx: number) => {
    const row = sortedList[idx];
    if (row) {
      const nid = Number(row.id);
      if (!Number.isFinite(nid)) return;
      setUiMode('browse');
      setSelectedId(nid);
    }
  };

  const handleSave = async () => {
    if (!draft || selectedId == null || !allowSave) return;
    setSaving(true);
    try {
      /* JSON.stringify는 id: undefined 키를 제거하므로 UPDATE 매칭용 id를 명시 */
      const shiftsPayload = toShiftPayloadRows(draft.shifts);
      const shiftGroupPayload = (draft.shift_group_masters || []).map((g) => {
        const row = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
        row.id = entityPayloadId(g.id as unknown);
        return row;
      });
      const roundPayload = (draft.round_up_sections || []).map((sec) => {
        const row = JSON.parse(JSON.stringify(sec)) as Record<string, unknown>;
        row.id = entityPayloadId((sec as { id?: unknown }).id);
        row.tiers = (sec.tiers || []).map((t) => {
          const tr = JSON.parse(JSON.stringify(t)) as Record<string, unknown>;
          tr.id = entityPayloadId((t as { id?: unknown }).id);
          return tr;
        });
        return row;
      });
      const leaveLevelsPayload = (draft.leave_levels || []).map((lv) => {
        const row = JSON.parse(JSON.stringify(lv)) as Record<string, unknown>;
        row.id = entityPayloadId((lv as { id?: unknown }).id);
        row.rows = (lv.rows || []).map((r) => {
          const rr = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
          rr.id = entityPayloadId((r as { id?: unknown }).id);
          return rr;
        });
        return row;
      });
      const holidaysPayload = (draft.holidays || []).map((h) => {
        const row = JSON.parse(JSON.stringify(h)) as Record<string, unknown>;
        row.id = entityPayloadId((h as { id?: unknown }).id);
        return row;
      });
      const paymentPayload = (draft.payment_periods || []).map((p) => {
        const row = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
        row.id = entityPayloadId((p as { id?: unknown }).id);
        return row;
      });

      let body: Record<string, unknown>;
      if (mainTab === 'company') {
        body = {
          save_scope: 'company',
          company_settings: draft.company_settings,
          special_allowances: draft.special_allowances,
        };
      } else if (mainTab === 'shift') {
        body = { save_scope: 'shift', shifts: shiftsPayload, deleted_shift_ids: deletedShiftIds };
      } else if (mainTab === 'shift_group') {
        body = {
          save_scope: 'shift_group',
          shift_group_masters: shiftGroupPayload,
          deleted_shift_group_ids: deletedShiftGroupIds,
        };
      } else if (mainTab === 'round') {
        body = { save_scope: 'round', round_up_sections: roundPayload };
      } else if (mainTab === 'leave') {
        body = {
          save_scope: 'leave',
          leave_levels: leaveLevelsPayload,
          leave_global: JSON.parse(JSON.stringify(draft.leave_global)) as Record<string, unknown>,
        };
      } else if (mainTab === 'holiday') {
        body = {
          save_scope: 'holiday',
          holidays: holidaysPayload,
          deleted_holiday_ids: deletedHolidayIds,
        };
      } else {
        body = {
          save_scope: 'payment',
          payment_periods: paymentPayload,
          deleted_payment_period_ids: deletedPaymentPeriodIds,
        };
      }

      await apiClient.putAttendanceStandard(selectedId, body);
      setDeletedShiftIds([]);
      setDeletedShiftGroupIds([]);
      setDeletedHolidayIds([]);
      setDeletedPaymentPeriodIds([]);
      await loadBundle(selectedId);
      setUiMode('browse');
      alert(t('attendanceStandard.saved'));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      alert(err?.response?.data?.detail || t('attendanceStandard.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (selectedId != null) void loadBundle(selectedId);
    setUiMode('browse');
  };

  /** 교대·반올림·휴가등급·휴가(연휴)·급여근태기간 탭: 상단 툴바 「추가」 (조회 모드면 수정 모드로 전환 후 반영) */
  const handleToolbarAdd = useCallback(() => {
    if (selectedId == null || !allowSave) return;
    const wasBrowse = uiMode === 'browse';

    if (mainTab === 'shift') {
      const code = window.prompt(t('attendanceStandard.shiftCodePrompt'), 'SHIFT1');
      if (!code?.trim()) return;
      const trim = code.trim();
      let newIdx = 0;
      let added = false;
      setDraft((d) => {
        if (!d) return d;
        const base = wasBrowse ? cloneBundle(d) : d;
        if (base.shifts.some((s) => s.shift_code === trim)) return d;
        newIdx = base.shifts.length;
        added = true;
        return { ...base, shifts: [...base.shifts, emptyShift(trim)] };
      });
      if (added) {
        if (wasBrowse) setUiMode('edit');
        setShiftIdx(newIdx);
      }
      return;
    }

    if (mainTab === 'shift_group') {
      let added = false;
      let newIdx = 0;
      setDraft((d) => {
        if (!d) return d;
        const base = wasBrowse ? cloneBundle(d) : d;
        const next = [...(base.shift_group_masters || [])];
        newIdx = next.length;
        next.push({ sort_order: newIdx, name: '', description: '' });
        added = true;
        return { ...base, shift_group_masters: next };
      });
      if (added) {
        if (wasBrowse) setUiMode('edit');
        setShiftGroupIdx(newIdx);
      }
      return;
    }

    if (mainTab === 'round') {
      const roundSingleTab =
        roundTab === 'lateness' || roundTab === 'early_checkout' || roundTab === 'ot';
      if (
        roundSingleTab &&
        draft?.round_up_sections.some((s) => s.tab_key === roundTab)
      ) {
        alert(t('attendanceStandard.roundOneSectionOnly'));
        return;
      }
      const trim = roundSingleTab
        ? 'section_1'
        : window.prompt(t('attendanceStandard.sectionKeyPrompt'), 'section_1')?.trim();
      if (!trim) return;
      let added = false;
      setDraft((d) => {
        if (!d) return d;
        const base = wasBrowse ? cloneBundle(d) : d;
        if (roundSingleTab && base.round_up_sections.some((s) => s.tab_key === roundTab)) {
          return d;
        }
        if (base.round_up_sections.some((s) => s.tab_key === roundTab && s.section_key === trim)) {
          return d;
        }
        added = true;
        const rowN =
          roundTab === 'ot'
            ? ROUND_OT_ROWS
            : roundTab === 'lateness' || roundTab === 'early_checkout'
              ? ROUND_LATENESS_ROWS
              : ROUND_OTHER_ROWS;
        const blank = defaultTiers(rowN);
        return {
          ...base,
          round_up_sections: [
            ...base.round_up_sections,
            {
              tab_key: roundTab,
              section_key: trim,
              mode_code: '',
              flag_payroll_include: false,
              flag_first_minute: false,
              flag_footer: false,
              flag_use_late_count: false,
              tiers: blank,
              extra_json:
                roundTab === 'lateness'
                  ? {
                      late_day_mode: 'sum_minutes',
                      late_period_mode: 'exceed_hour',
                      late_count_charge_mode: 'charge_per',
                      late_count_with_early_out: false,
                      tiers_period: serializeTiersForExtra(defaultTiers(ROUND_LATENESS_ROWS)),
                      tiers_count: serializeTiersForExtra(defaultTiers(ROUND_LATENESS_ROWS)),
                    }
                  : roundTab === 'early_checkout'
                    ? {
                        early_day_mode: 'exceed_hour',
                        early_period_mode: 'exceed_hour',
                        early_count_charge_mode: 'charge_per',
                        early_tiers_period: serializeTiersForExtra(defaultTiers(ROUND_LATENESS_ROWS)),
                        early_tiers_count: serializeTiersForExtra(defaultTiers(ROUND_LATENESS_ROWS)),
                      }
                    : roundTab === 'ot'
                      ? {
                          ot_payroll_no_separate_ot_holiday: false,
                          ot_round_up_working: true,
                          ot_day_mode: 'exceed_hour',
                          ot_period_mode: 'exceed_hour',
                          ot_tiers_period: serializeTiersForExtra(defaultTiers(ROUND_OT_ROWS)),
                        }
                      : undefined,
            },
          ],
        };
      });
      if (added && wasBrowse) setUiMode('edit');
      return;
    }

    if (mainTab === 'leave') {
      let added = false;
      setDraft((d) => {
        if (!d) return d;
        const base = wasBrowse ? cloneBundle(d) : d;
        const li = base.leave_levels.findIndex((l) => l.level_number === leaveLv);
        if (li < 0) return d;
        const lvls = [...base.leave_levels];
        const rows = [...lvls[li].rows];
        rows.push({
          sort_order: rows.length,
          leave_type_name: '',
          days_quota: 0,
          hours_quota: 0,
          minutes_quota: 0,
          option_checked: false,
        });
        lvls[li] = { ...lvls[li], rows };
        added = true;
        return { ...base, leave_levels: lvls };
      });
      if (added && wasBrowse) setUiMode('edit');
      return;
    }

    if (mainTab === 'holiday') {
      let added = false;
      setDraft((d) => {
        if (!d) return d;
        const base = wasBrowse ? cloneBundle(d) : d;
        added = true;
        return { ...base, holidays: [...base.holidays, { holiday_date: '', remarks: '' }] };
      });
      if (added && wasBrowse) setUiMode('edit');
      return;
    }

    if (mainTab === 'payment') {
      const fy = parseInt(payFilterYear, 10);
      const calendarYear =
        payFilterYear && Number.isFinite(fy) ? fy : new Date().getFullYear();
      let added = false;
      setDraft((d) => {
        if (!d) return d;
        const base = wasBrowse ? cloneBundle(d) : d;
        added = true;
        return {
          ...base,
          payment_periods: [
            ...base.payment_periods,
            {
              calendar_year: calendarYear,
              calendar_month: 1,
              period_label: 'Period 1',
              start_date_daily: '',
              end_date_daily: '',
              start_date_monthly: '',
              end_date_monthly: '',
              ot_start_daily: '',
              ot_end_daily: '',
              ot_start_monthly: '',
              ot_end_monthly: '',
              remarks: '',
            },
          ],
        };
      });
      if (added && wasBrowse) setUiMode('edit');
    }
  }, [allowSave, draft, leaveLv, mainTab, payFilterYear, roundTab, selectedId, t, uiMode]);

  /** 교대근무 탭: 상단 공통 「삭제」로 현재 선택 교대 삭제 */
  const handleToolbarDelete = useCallback(() => {
    if (selectedId == null || !allowSave || !draft) return;
    const wasBrowse = uiMode === 'browse';

    const deleteShiftGroupAtIndex = (idx: number) => {
      const row = draft.shift_group_masters?.[idx];
      if (!row) return;
      const deletedId = entityPayloadId(row?.id as unknown);
      if (deletedId != null) {
        setDeletedShiftGroupIds((prev) => (prev.includes(deletedId) ? prev : [...prev, deletedId]));
      }
      setDraft((d) => {
        if (!d) return d;
        const base = wasBrowse ? cloneBundle(d) : d;
        const next = (base.shift_group_masters || [])
          .filter((_, i) => i !== idx)
          .map((x, i) => ({ ...x, sort_order: i }));
        return { ...base, shift_group_masters: next };
      });
      setShiftGroupIdx((prev) => {
        const nextLen = Math.max(0, (draft.shift_group_masters?.length || 0) - 1);
        if (nextLen === 0) return 0;
        if (prev === idx) return Math.min(idx, nextLen - 1);
        return Math.min(prev, nextLen - 1);
      });
    };

    if (mainTab === 'shift') {
      if (!draft.shifts?.length || !draft.shifts[shiftIdx]) return;
      const shiftName = String(draft.shifts[shiftIdx]?.shift_code || '').trim() || '-';
      if (!window.confirm(`'${shiftName}' 교대를 삭제할까요?`)) return;
      const row = draft.shifts[shiftIdx];
      const deletedId = entityPayloadId(row?.id as unknown);
      const nextDeletedShiftIds =
        deletedId != null && !deletedShiftIds.includes(deletedId)
          ? [...deletedShiftIds, deletedId]
          : [...deletedShiftIds];
      const newShifts = draft.shifts.filter((_, i) => i !== shiftIdx);
      setDraft((d) => {
        if (!d) return d;
        const base = wasBrowse ? cloneBundle(d) : d;
        return { ...base, shifts: base.shifts.filter((_, i) => i !== shiftIdx) };
      });
      setShiftIdx((prev) => {
        const nextLen = Math.max(0, (draft.shifts?.length || 0) - 1);
        if (nextLen === 0) return 0;
        return Math.min(prev, nextLen - 1);
      });
      void (async () => {
        if (selectedId == null) return;
        setSaving(true);
        try {
          await apiClient.putAttendanceStandard(selectedId, {
            save_scope: 'shift',
            shifts: toShiftPayloadRows(newShifts),
            deleted_shift_ids: nextDeletedShiftIds,
          });
          setDeletedShiftIds([]);
          await loadBundle(selectedId);
          setUiMode('browse');
        } catch (e: unknown) {
          const err = e as { response?: { data?: { detail?: string } } };
          alert(err?.response?.data?.detail || t('attendanceStandard.saveError'));
        } finally {
          setSaving(false);
        }
      })();
    } else if (mainTab === 'shift_group') {
      if (!draft.shift_group_masters?.length || !draft.shift_group_masters[shiftGroupIdx]) return;
      if (!window.confirm('선택한 근무조를 삭제할까요?')) return;
      deleteShiftGroupAtIndex(shiftGroupIdx);
    } else {
      return;
    }
    if (wasBrowse) setUiMode('edit');
  }, [allowSave, deletedShiftIds, draft, loadBundle, mainTab, selectedId, shiftIdx, shiftGroupIdx, t, uiMode]);

  const disabled = uiMode === 'browse';

  const currentShift = draft?.shifts?.[shiftIdx];
  const currentShiftGroup = draft?.shift_group_masters?.[shiftGroupIdx];
  const patchCurrentShift = useCallback(
    (patch: Partial<ShiftRow>) => {
      setDraft((d) => {
        if (!d) return d;
        const next = [...d.shifts];
        next[shiftIdx] = { ...next[shiftIdx], ...patch };
        return { ...d, shifts: next };
      });
    },
    [shiftIdx]
  );

  useEffect(() => {
    const n = draft?.shift_group_masters?.length ?? 0;
    if (n <= 0) {
      if (shiftGroupIdx !== 0) setShiftGroupIdx(0);
      return;
    }
    if (shiftGroupIdx >= n) setShiftGroupIdx(n - 1);
  }, [draft?.shift_group_masters?.length, shiftGroupIdx]);

  const shiftWorkAggregateDisplay = useMemo(() => {
    const sh = draft?.shifts?.[shiftIdx];
    if (!sh) return null;
    const net = computeShiftNetWorkMinutes(sh.start_work, sh.time_out, sh.break_sum);
    if (net === null) return null;
    return formatMinutesAsHM(net);
  }, [draft?.shifts, shiftIdx]);

  const roundSections = useMemo(() => {
    if (!draft) return [];
    return draft.round_up_sections.filter((s) => s.tab_key === roundTab);
  }, [draft, roundTab]);

  const filteredPayments = useMemo(() => {
    if (!draft) return [];
    const y = parseInt(payFilterYear, 10);
    if (!payFilterYear || !Number.isFinite(y)) return draft.payment_periods;
    return draft.payment_periods.filter((p) => p.calendar_year === y);
  }, [draft, payFilterYear]);

  const holidaysByDate = useMemo(() => {
    const m = new Map<string, { index: number; remarks: string }>();
    if (!draft) return m;
    draft.holidays.forEach((h, index) => {
      const k = (h.holiday_date || '').slice(0, 10);
      if (k) m.set(k, { index, remarks: h.remarks || '' });
    });
    return m;
  }, [draft]);

  const activeLeaveLevelIndex = useMemo(
    () => (draft ? draft.leave_levels.findIndex((l) => l.level_number === leaveLv) : -1),
    [draft, leaveLv]
  );

  if (permLoading) {
    return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
  }
  if (!allowRead) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">{t('permission.noAccess')}</div>
    );
  }

  if (listLoading) {
    return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
  }

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: 'company', label: t('attendanceStandard.tab.company') },
    { key: 'shift', label: t('attendanceStandard.tab.shift') },
    { key: 'shift_group', label: t('attendanceStandard.tab.shiftGroup') },
    { key: 'round', label: t('attendanceStandard.tab.round') },
    { key: 'leave', label: t('attendanceStandard.tab.leave') },
    { key: 'holiday', label: t('attendanceStandard.tab.holiday') },
    { key: 'payment', label: t('attendanceStandard.tab.payment') },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-stretch min-h-0 lg:min-h-[min(560px,calc(100vh-7.5rem))]">
      <aside
        className={cn(
          'lg:col-span-4 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden',
          uiMode !== 'browse' && 'opacity-60 pointer-events-none'
        )}
      >
        <div className="p-3 md:p-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t('attendanceStandard.listTitle')}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={t('attendanceStandard.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[50vh] lg:max-h-none">
          {sortedList.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                const nid = Number(c.id);
                if (!Number.isFinite(nid)) return;
                setSelectedId(nid);
                setUiMode('browse');
              }}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-gray-100 flex gap-2 hover:bg-gray-50',
                selectedId === c.id && 'bg-indigo-50 border-l-4 border-l-indigo-600'
              )}
            >
              <Building2 className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{pickName(c)}</div>
                <div className="text-xs text-gray-500">{c.company_code}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="lg:col-span-8 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden min-h-0 max-h-[min(100vh-7rem,920px)] lg:max-h-[calc(100vh-7.5rem)]">
        <div className="px-3 md:px-4 pt-3 md:pt-4 pb-2 border-b border-gray-100 shrink-0">
          <HrMasterToolbar
            mode={uiMode}
            listLength={sortedList.length}
            selectedIndex={selectedIndex}
            saving={saving}
            allowAdd={
              (mainTab === 'shift' ||
                mainTab === 'shift_group' ||
                (mainTab === 'round' && roundSections.length === 0) ||
                mainTab === 'leave' ||
                mainTab === 'holiday' ||
                mainTab === 'payment') &&
              allowSave &&
              selectedId != null &&
              !!draft &&
              !bundleLoading
            }
            allowDelete={
              (mainTab === 'shift' && !!draft?.shifts?.length) &&
              allowSave &&
              selectedId != null &&
              !!draft
            }
            allowEdit={allowSave}
            allowSave={allowSave}
            onAdd={handleToolbarAdd}
            onEdit={() => {
              if (selectedId == null || !draft) return;
              setDraft(cloneBundle(draft));
              setUiMode('edit');
            }}
            onDelete={handleToolbarDelete}
            onSave={() => void handleSave()}
            onCancel={handleCancel}
            onFirst={() => goNav(0)}
            onPrev={() => goNav(Math.max(0, selectedIndex - 1))}
            onNext={() => goNav(Math.min(sortedList.length - 1, selectedIndex + 1))}
            onLast={() => goNav(sortedList.length - 1)}
            t={toolbarT}
          />
        </div>

        <div className="px-4 md:px-6 pt-2 md:pt-3 pb-0 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2 min-h-0">
            {selectedId == null ? (
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('attendanceStandard.detailPanel')}</h2>
                <p className="text-sm text-gray-500">{t('attendanceStandard.detailSubtitle')}</p>
              </div>
            ) : bundleLoading ? (
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedCompany ? pickName(selectedCompany) : '—'}
                </h2>
                <p className="text-sm text-gray-500">{t('common.loading')}</p>
              </div>
            ) : draft ? (
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedCompany ? pickName(selectedCompany) : `#${draft.company_id}`}
                </h2>
                <p className="text-sm text-gray-500">
                  {selectedCompany?.company_code ?? String(draft.company_id)}
                </p>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedCompany ? pickName(selectedCompany) : '—'}
                </h2>
                <p className="text-sm text-rose-600">{bundleLoadError ?? t('attendanceStandard.loadError')}</p>
              </div>
            )}
          </div>
          <nav
            className="flex gap-1 -mb-px overflow-x-auto"
            role="tablist"
            aria-label={t('attendanceStandard.detailPanel')}
          >
            {mainTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={mainTab === tab.key}
                onClick={() => setMainTab(tab.key)}
                className={cn(
                  'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  mainTab === tab.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {!bundleLoading &&
          draft &&
          draft.company_id === selectedId &&
          mainTab !== 'shift' &&
          mainTab !== 'round' &&
          mainTab !== 'leave' &&
          mainTab !== 'holiday' &&
          mainTab !== 'payment' && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-100 bg-slate-50/90 shrink-0">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              {t('attendanceStandard.tabActions')}
            </span>
            {mainTab === 'company' && (
              <span className="text-xs text-gray-400">{t('attendanceStandard.companyTabHint')}</span>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 p-3 md:p-4 overflow-y-auto space-y-4">
          {selectedId == null && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-gray-500 text-center text-sm">
              <p>{t('attendanceStandard.selectHint')}</p>
            </div>
          )}
          {selectedId != null && bundleLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 text-sm">
              <p>{t('common.loading')}</p>
            </div>
          )}
          {selectedId != null && !bundleLoading && !draft && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-rose-600 text-center text-sm max-w-lg mx-auto">
              <p>{bundleLoadError ?? t('attendanceStandard.loadError')}</p>
            </div>
          )}
          {!bundleLoading && draft && draft.company_id === selectedId && (
            <>
              {mainTab === 'company' && (
                <>
                  <div className={fieldsetCls}>
                    <p className="text-xs font-semibold text-rose-900">
                      {t('attendanceStandard.companySetting')}
                      <span className="ml-2 font-normal text-gray-500">
                        ID: {entityPayloadId((draft.company_settings as { id?: unknown })?.id) ?? '-'}
                      </span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="text-xs text-gray-600">
                        {t('attendanceStandard.dailyHours')}
                        <input
                          className={inputCls}
                          disabled={disabled}
                          value={String(draft.company_settings.daily_work_hours ?? '')}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    company_settings: { ...d.company_settings, daily_work_hours: e.target.value },
                                  }
                                : d
                            )
                          }
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        {t('attendanceStandard.monthlyHours')}
                        <input
                          className={inputCls}
                          disabled={disabled}
                          value={String(draft.company_settings.monthly_work_hours ?? '')}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    company_settings: { ...d.company_settings, monthly_work_hours: e.target.value },
                                  }
                                : d
                            )
                          }
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        {t('attendanceStandard.dayBaseMonth')}
                        <input
                          type="number"
                          className={inputCls}
                          disabled={disabled}
                          value={String(draft.company_settings.day_base_days_per_month ?? 30)}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    company_settings: {
                                      ...d.company_settings,
                                      day_base_days_per_month: parseInt(e.target.value, 10) || 0,
                                    },
                                  }
                                : d
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((lv) => (
                        <label key={lv} className="text-xs text-gray-600">
                          {t('attendanceStandard.otLevel').replace('{n}', String(lv))}
                          <input
                            type="number"
                            step="0.01"
                            className={inputCls}
                            disabled={disabled}
                            value={String(draft.company_settings[`ot_rate_level_${lv}`] ?? '')}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      company_settings: {
                                        ...d.company_settings,
                                        [`ot_rate_level_${lv}`]: parseFloat(e.target.value) || 0,
                                      },
                                    }
                                  : d
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <label className="text-xs text-gray-600 block">
                      {t('attendanceStandard.processingFormat')}
                      <input
                        className={inputCls}
                        disabled={disabled}
                        value={String(draft.company_settings.processing_format ?? '')}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  company_settings: { ...d.company_settings, processing_format: e.target.value },
                                }
                              : d
                          )
                        }
                      />
                    </label>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {(
                        [
                          ['backward_cross_company', t('attendanceStandard.opt.backwardCross')],
                          ['hide_time_status_no_check', t('attendanceStandard.opt.hideTimeStatus')],
                        ] as const
                      ).map(([k, lab]) => (
                        <label key={k} className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={!!draft.company_settings[k]}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      company_settings: { ...d.company_settings, [k]: e.target.checked },
                                    }
                                  : d
                              )
                            }
                          />
                          {lab}
                        </label>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="text-xs text-gray-600">
                        {t('attendanceStandard.zipPolicy')}
                        <select
                          className={inputCls}
                          disabled={disabled}
                          value={String(draft.company_settings.zip_card_policy ?? 'warning_full_day')}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    company_settings: { ...d.company_settings, zip_card_policy: e.target.value },
                                  }
                                : d
                            )
                          }
                        >
                          <option value="warning_count">{t('attendanceStandard.zip.warningCount')}</option>
                          <option value="warning_half_day">{t('attendanceStandard.zip.warningHalf')}</option>
                          <option value="warning_full_day">{t('attendanceStandard.zip.warningFull')}</option>
                        </select>
                      </label>
                      <label className="text-xs text-gray-600">
                        {t('attendanceStandard.statusIn')}
                        <input
                          className={inputCls}
                          disabled={disabled}
                          value={String(draft.company_settings.zip_status_in ?? '')}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    company_settings: { ...d.company_settings, zip_status_in: e.target.value },
                                  }
                                : d
                            )
                          }
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        {t('attendanceStandard.noMachine')}
                        <input
                          className={inputCls}
                          disabled={disabled}
                          value={String(draft.company_settings.zip_no_machine ?? '')}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    company_settings: { ...d.company_settings, zip_no_machine: e.target.value },
                                  }
                                : d
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {(
                        [
                          'opt_remark_time_off',
                          'opt_message_time_off_charge',
                          'opt_message_leave',
                          'opt_late_check_half_day_leave',
                          'opt_process_record_leaves',
                          'opt_count_leave_in_schedule',
                          'opt_half_day_leave_half_base',
                        ] as const
                      ).map((k) => (
                        <label key={k} className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={!!draft.company_settings[k]}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      company_settings: { ...d.company_settings, [k]: e.target.checked },
                                    }
                                  : d
                              )
                            }
                          />
                          {t(`attendanceStandard.opt.${k}`)}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className={fieldsetCls}>
                    <p className="text-xs font-semibold text-rose-900">{t('attendanceStandard.specialAllowance')}</p>
                    <div className="space-y-3">
                      {draft.special_allowances.map((sp, idx) => (
                        <div key={sp.slot_index} className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-rose-100 pt-2 first:border-0 first:pt-0">
                          <label className="text-xs text-gray-600 sm:col-span-2">
                            {t('attendanceStandard.specialName').replace('{n}', String(sp.slot_index))}
                            <input
                              className={inputCls}
                              disabled={disabled}
                              value={sp.name ?? ''}
                              onChange={(e) =>
                                setDraft((d) => {
                                  if (!d) return d;
                                  const next = [...d.special_allowances];
                                  next[idx] = { ...next[idx], name: e.target.value };
                                  return { ...d, special_allowances: next };
                                })
                              }
                            />
                          </label>
                          <label className="inline-flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={sp.working_ot_on_holiday}
                              onChange={(e) =>
                                setDraft((d) => {
                                  if (!d) return d;
                                  const next = [...d.special_allowances];
                                  next[idx] = { ...next[idx], working_ot_on_holiday: e.target.checked };
                                  return { ...d, special_allowances: next };
                                })
                              }
                            />
                            {t('attendanceSpecial.workingOtHoliday')}
                          </label>
                          <label className="inline-flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={sp.payment_full_day}
                              onChange={(e) =>
                                setDraft((d) => {
                                  if (!d) return d;
                                  const next = [...d.special_allowances];
                                  next[idx] = { ...next[idx], payment_full_day: e.target.checked };
                                  return { ...d, special_allowances: next };
                                })
                              }
                            />
                            {t('attendanceSpecial.paymentFullDay')}
                          </label>
                          <label className="inline-flex items-center gap-1 text-xs sm:col-span-2">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={sp.no_payment_late_early}
                              onChange={(e) =>
                                setDraft((d) => {
                                  if (!d) return d;
                                  const next = [...d.special_allowances];
                                  next[idx] = { ...next[idx], no_payment_late_early: e.target.checked };
                                  return { ...d, special_allowances: next };
                                })
                              }
                            />
                            {t('attendanceSpecial.noPayLateEarly')}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {mainTab === 'shift' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-3 border border-gray-200 rounded-lg p-2 max-h-[min(420px,50vh)] overflow-y-auto bg-slate-50/40">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-gray-800">
                        {t('attendanceStandard.shiftList')}
                      </span>
                    </div>
                    {draft.shifts.map((s, i) => (
                      <button
                        key={`${s.shift_code}-${i}`}
                        type="button"
                        onClick={() => setShiftIdx(i)}
                        className={cn(
                          'w-full text-left px-2 py-1.5 rounded text-xs mb-1 border bg-white',
                          shiftIdx === i ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                        )}
                      >
                        <div className="font-medium text-gray-900">
                          {s.shift_code}
                          <span className="ml-1 text-[10px] font-normal text-gray-500">
                            (ID: {entityPayloadId((s as { id?: unknown }).id) ?? '-'})
                          </span>
                        </div>
                        <div className="text-gray-500 truncate">{s.title}</div>
                      </button>
                    ))}
                  </div>
                  <div className="lg:col-span-9 space-y-3 min-w-0">
                    {currentShift ? (
                      <>
                        <div className={shiftPanelCls}>
                          <div className="text-xs font-semibold text-gray-800 border-b border-gray-100 pb-1.5 mb-2">
                            {t('attendanceStandard.shiftHeader')}
                            <span className="ml-2 font-normal text-gray-500">
                              ID: {entityPayloadId((currentShift as { id?: unknown }).id) ?? '-'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(['shift_code', 'title'] as const).map((field) => (
                              <label key={field} className="text-xs text-gray-600">
                                {field === 'shift_code'
                                  ? t('attendanceStandard.shiftCode')
                                  : t('attendanceStandard.shiftTitle')}
                                <input
                                  className={inputCls}
                                  disabled={disabled}
                                  value={String((currentShift as never)[field] ?? '')}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d) return d;
                                      const next = [...d.shifts];
                                      next[shiftIdx] = { ...next[shiftIdx], [field]: e.target.value };
                                      return { ...d, shifts: next };
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-3">
                          <fieldset className={cn(shiftPanelCls, 'max-w-xl')}>
                            <legend className="text-xs font-semibold text-gray-800 px-0.5 mb-1">
                              {t('attendanceStandard.shiftSectionTime')}
                            </legend>
                            <div className="space-y-2">
                              {(
                                [
                                  ['start_check_in', t('attendanceStandard.startCheckIn')],
                                  ['start_work', t('attendanceStandard.startWork')],
                                  ['lateness_count_start', t('attendanceStandard.latenessStart')],
                                ] as const
                              ).map(([field, lab]) => (
                                <label key={field} className="block text-xs text-gray-600">
                                  {lab}
                                  <input
                                    className={inputCls}
                                    disabled={disabled}
                                    placeholder="HH:mm"
                                    value={String((currentShift as never)[field] ?? '')}
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const next = [...d.shifts];
                                        next[shiftIdx] = { ...next[shiftIdx], [field]: e.target.value };
                                        return { ...d, shifts: next };
                                      })
                                    }
                                    onBlur={(e) => {
                                      const v = normalizeHmInput(e.target.value);
                                      if (v === String((currentShift as never)[field] ?? '').trim()) return;
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const next = [...d.shifts];
                                        next[shiftIdx] = { ...next[shiftIdx], [field]: v };
                                        return { ...d, shifts: next };
                                      });
                                    }}
                                  />
                                </label>
                              ))}
                              <div className="flex flex-wrap items-center gap-2 pt-0.5 border-t border-dashed border-gray-200">
                                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 shrink-0">
                                  <input
                                    type="checkbox"
                                    disabled={disabled}
                                    checked={currentShift.break_late_enabled}
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const next = [...d.shifts];
                                        next[shiftIdx] = {
                                          ...next[shiftIdx],
                                          break_late_enabled: e.target.checked,
                                        };
                                        return { ...d, shifts: next };
                                      })
                                    }
                                  />
                                  {t('attendanceStandard.breakLate')}
                                </label>
                                <input
                                  className={cn(inputCls, 'max-w-[140px]')}
                                  disabled={disabled}
                                  placeholder="HH:mm"
                                  value={currentShift.break_late_time ?? ''}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d) return d;
                                      const next = [...d.shifts];
                                      next[shiftIdx] = { ...next[shiftIdx], break_late_time: e.target.value };
                                      return { ...d, shifts: next };
                                    })
                                  }
                                  onBlur={(e) => {
                                    const v = normalizeHmInput(e.target.value);
                                    if (v === String(currentShift.break_late_time ?? '').trim()) return;
                                    setDraft((d) => {
                                      if (!d) return d;
                                      const next = [...d.shifts];
                                      next[shiftIdx] = { ...next[shiftIdx], break_late_time: v };
                                      return { ...d, shifts: next };
                                    });
                                  }}
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 shrink-0">
                                  <input
                                    type="checkbox"
                                    disabled={disabled}
                                    checked={currentShift.break_early_enabled}
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const next = [...d.shifts];
                                        next[shiftIdx] = {
                                          ...next[shiftIdx],
                                          break_early_enabled: e.target.checked,
                                        };
                                        return { ...d, shifts: next };
                                      })
                                    }
                                  />
                                  {t('attendanceStandard.breakEarly')}
                                </label>
                                <input
                                  className={cn(inputCls, 'max-w-[140px]')}
                                  disabled={disabled}
                                  placeholder="HH:mm"
                                  value={currentShift.break_early_time ?? ''}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d) return d;
                                      const next = [...d.shifts];
                                      next[shiftIdx] = { ...next[shiftIdx], break_early_time: e.target.value };
                                      return { ...d, shifts: next };
                                    })
                                  }
                                  onBlur={(e) => {
                                    const v = normalizeHmInput(e.target.value);
                                    if (v === String(currentShift.break_early_time ?? '').trim()) return;
                                    setDraft((d) => {
                                      if (!d) return d;
                                      const next = [...d.shifts];
                                      next[shiftIdx] = { ...next[shiftIdx], break_early_time: v };
                                      return { ...d, shifts: next };
                                    });
                                  }}
                                />
                              </div>
                              <label className="block text-xs text-gray-600">
                                {t('attendanceStandard.breakSum')}
                                <input
                                  className={inputCls}
                                  disabled={disabled}
                                  placeholder="HH:mm"
                                  value={currentShift.break_sum ?? ''}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d) return d;
                                      const next = [...d.shifts];
                                      next[shiftIdx] = { ...next[shiftIdx], break_sum: e.target.value };
                                      return { ...d, shifts: next };
                                    })
                                  }
                                  onBlur={(e) => {
                                    const v = normalizeHmInput(e.target.value);
                                    if (v === String(currentShift.break_sum ?? '').trim()) return;
                                    setDraft((d) => {
                                      if (!d) return d;
                                      const next = [...d.shifts];
                                      next[shiftIdx] = { ...next[shiftIdx], break_sum: v };
                                      return { ...d, shifts: next };
                                    });
                                  }}
                                />
                              </label>
                              <div className="flex flex-wrap items-end gap-2">
                                <div
                                  className="shrink-0 rounded border border-amber-300 bg-amber-100 px-2 py-1 min-w-[4.25rem] text-center"
                                  title={t('attendanceStandard.workAggregateHint')}
                                >
                                  <div className="text-[9px] font-medium text-amber-900/80 leading-tight">
                                    {t('attendanceStandard.workAggregateTime')}
                                  </div>
                                  <div className="text-sm font-semibold tabular-nums text-amber-950">
                                    {shiftWorkAggregateDisplay ?? '—'}
                                  </div>
                                </div>
                                <label className="flex-1 min-w-[120px] text-xs text-gray-600">
                                  {t('attendanceStandard.timeOut')}
                                  <input
                                    className={inputCls}
                                    disabled={disabled}
                                    placeholder="HH:mm"
                                    value={currentShift.time_out ?? ''}
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const next = [...d.shifts];
                                        next[shiftIdx] = { ...next[shiftIdx], time_out: e.target.value };
                                        return { ...d, shifts: next };
                                      })
                                    }
                                    onBlur={(e) => {
                                      const v = normalizeHmInput(e.target.value);
                                      if (v === String(currentShift.time_out ?? '').trim()) return;
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const next = [...d.shifts];
                                        next[shiftIdx] = { ...next[shiftIdx], time_out: v };
                                        return { ...d, shifts: next };
                                      });
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          </fieldset>

                          <fieldset className={shiftPanelCls}>
                            <legend className="text-xs font-semibold text-gray-800 px-0.5 mb-1">
                              {t('attendanceStandard.shiftSectionOt')}
                            </legend>
                            <p className="text-xs text-gray-600 mb-2 leading-snug">
                              {t('attendanceStandard.shiftOtLegend')}
                            </p>
                            <div className="overflow-x-auto rounded border border-gray-200 -mx-0.5 sm:mx-0">
                              <table className="w-full min-w-[640px] text-xs sm:text-sm border-collapse table-fixed">
                                <colgroup>
                                  <col className="w-10" />
                                  <col className="w-[5.5rem] sm:w-[6.5rem]" />
                                  <col className="w-[5.5rem] sm:w-[6.5rem]" />
                                  <col />
                                  <col />
                                  <col />
                                  <col />
                                  <col />
                                  <col />
                                </colgroup>
                                <thead>
                                  <tr className="bg-slate-100 text-gray-800">
                                    <th rowSpan={2} className="p-1.5 border border-gray-200 align-middle">
                                      #
                                    </th>
                                    <th rowSpan={2} className="p-1.5 border border-gray-200 align-middle">
                                      {t('attendanceStandard.rangeStart')}
                                    </th>
                                    <th rowSpan={2} className="p-1.5 border border-gray-200 align-middle">
                                      {t('attendanceStandard.rangeEnd')}
                                    </th>
                                    <th colSpan={3} className="p-1.5 border border-gray-200 text-center font-semibold">
                                      {t('attendanceStandard.otColMonthly')}
                                    </th>
                                    <th colSpan={3} className="p-1.5 border border-gray-200 text-center font-semibold">
                                      {t('attendanceStandard.otColDaily')}
                                    </th>
                                  </tr>
                                  <tr>
                                    <th className="p-1 border border-gray-200 bg-gray-50 text-gray-800">
                                      {t('attendanceStandard.otWd')}
                                    </th>
                                    <th className="p-1 border border-gray-200 bg-emerald-100/90 text-emerald-950">
                                      {t('attendanceStandard.otSun')}
                                    </th>
                                    <th className="p-1 border border-gray-200 bg-red-100/90 text-red-900">
                                      {t('attendanceStandard.otHol')}
                                    </th>
                                    <th className="p-1 border border-gray-200 bg-gray-50 text-gray-800">
                                      {t('attendanceStandard.otWd')}
                                    </th>
                                    <th className="p-1 border border-gray-200 bg-emerald-100/90 text-emerald-950">
                                      {t('attendanceStandard.otSun')}
                                    </th>
                                    <th className="p-1 border border-gray-200 bg-red-100/90 text-red-900">
                                      {t('attendanceStandard.otHol')}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {currentShift.ot_ranges.map((r, ri) => (
                                    <tr key={r.sort_order} className="border-t border-gray-100">
                                      <td className="p-1.5 text-center text-gray-500 border-l border-gray-100">
                                        {ri + 1}
                                      </td>
                                      {(['range_start', 'range_end'] as const).map((f) => (
                                        <td key={f} className="p-1 border-l border-gray-100">
                                          <input
                                            className={cn(inputCls, 'min-w-0 tabular-nums')}
                                            disabled={disabled || (f === 'range_start' && ri >= 1)}
                                            placeholder="HH:mm"
                                            value={r[f] ?? ''}
                                            onChange={(e) =>
                                              setDraft((d) => {
                                                if (!d) return d;
                                                const next = [...d.shifts];
                                                const otr = [...next[shiftIdx].ot_ranges];
                                                if (f === 'range_start' && ri >= 1) return d;
                                                const raw = e.target.value;
                                                const compactDigits = raw.replace(/\D/g, '');
                                                const normalizedInline =
                                                  !raw.includes(':') && compactDigits.length === 4
                                                    ? normalizeHmInput(compactDigits)
                                                    : raw;
                                                otr[ri] = { ...otr[ri], [f]: normalizedInline };
                                                next[shiftIdx] = { ...next[shiftIdx], ot_ranges: otr };
                                                return { ...d, shifts: next };
                                              })
                                            }
                                            onBlur={(e) => {
                                              const v = normalizeHmInput(e.target.value);
                                              setDraft((d) => {
                                                if (!d) return d;
                                                const next = [...d.shifts];
                                                let otr = [...next[shiftIdx].ot_ranges];
                                                if (f === 'range_start' && ri >= 1) return d;
                                                const current = String(otr[ri]?.[f] ?? '').trim();
                                                const valueChanged = current !== v;
                                                if (valueChanged) {
                                                  otr[ri] = { ...otr[ri], [f]: v };
                                                }
                                                // 모든 시작시간(N행)은 이전행 종료시간(N-1) + 1분으로 연쇄 재계산
                                                if (f === 'range_end') {
                                                  const recalced = recalcOtRangeStarts(otr);
                                                  const startChanged = recalced.some(
                                                    (row, idx) => row.range_start !== otr[idx]?.range_start
                                                  );
                                                  if (startChanged) otr = recalced;
                                                }
                                                if (!valueChanged && f !== 'range_end') return d;
                                                next[shiftIdx] = { ...next[shiftIdx], ot_ranges: otr };
                                                return { ...d, shifts: next };
                                              });
                                            }}
                                          />
                                        </td>
                                      ))}
                                      {(
                                        [
                                          ['monthly_rate_a', 'bg-gray-50/40'],
                                          ['monthly_rate_b', 'bg-emerald-50/50'],
                                          ['monthly_rate_holiday', 'bg-red-50/60'],
                                          ['daily_rate_a', 'bg-gray-50/40'],
                                          ['daily_rate_b', 'bg-emerald-50/50'],
                                          ['daily_rate_holiday', 'bg-red-50/60'],
                                        ] as const
                                      ).map(([f, cellBg]) => (
                                        <td key={f} className={cn('p-1 border-l border-gray-100', cellBg)}>
                                          <input
                                            type="number"
                                            step="0.0001"
                                            className={cn(inputCls, 'min-w-0 tabular-nums')}
                                            disabled={disabled}
                                            value={r[f] == null ? '' : String(r[f])}
                                            onChange={(e) =>
                                              setDraft((d) => {
                                                if (!d) return d;
                                                const next = [...d.shifts];
                                                const otr = [...next[shiftIdx].ot_ranges];
                                                const v = e.target.value;
                                                otr[ri] = {
                                                  ...otr[ri],
                                                  [f]: v === '' ? null : parseFloat(v),
                                                };
                                                next[shiftIdx] = { ...next[shiftIdx], ot_ranges: otr };
                                                return { ...d, shifts: next };
                                              })
                                            }
                                          />
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                  {(
                                    [
                                      {
                                        key: 'late_shift_allowance' as const,
                                        label: t('attendanceStandard.shiftAllowanceLateShift'),
                                      },
                                      {
                                        key: 'early_food_allowance' as const,
                                        label: t('attendanceStandard.shiftAllowanceEarlyFood'),
                                      },
                                    ] as const
                                  ).map((spec) => {
                                    const row = currentShift[spec.key];
                                    return (
                                      <tr key={spec.key} className="border-t-2 border-slate-200 bg-slate-50/40">
                                        <td
                                          colSpan={3}
                                          className="p-1.5 border-l border-gray-100 align-middle"
                                        >
                                          <label className="inline-flex items-start gap-2 text-gray-800">
                                            <input
                                              type="checkbox"
                                              disabled={disabled}
                                              className="mt-0.5"
                                              checked={row.enabled}
                                              onChange={(e) =>
                                                patchCurrentShift({
                                                  [spec.key]: mergeAllowanceRow(row, {
                                                    enabled: e.target.checked,
                                                  }),
                                                })
                                              }
                                            />
                                            <span className="text-xs font-medium leading-snug">{spec.label}</span>
                                          </label>
                                        </td>
                                        {(['monthly', 'daily'] as const).flatMap((band) =>
                                          (['weekday', 'sunday', 'holiday'] as const).map((hk) => {
                                            const cellBg =
                                              hk === 'weekday'
                                                ? 'bg-gray-50/40'
                                                : hk === 'sunday'
                                                  ? 'bg-emerald-50/50'
                                                  : 'bg-red-50/60';
                                            const val = row[band][hk];
                                            return (
                                              <td
                                                key={`${spec.key}-${band}-${hk}`}
                                                className={cn('p-1 border-l border-gray-100', cellBg)}
                                              >
                                                <input
                                                  type="number"
                                                  min={0}
                                                  className={cn(inputCls, 'min-w-0 tabular-nums')}
                                                  disabled={disabled}
                                                  value={val ?? 0}
                                                  onChange={(e) => {
                                                    const v = parseInt(e.target.value, 10);
                                                    const n = Number.isFinite(v) ? Math.max(0, v) : 0;
                                                    patchCurrentShift({
                                                      [spec.key]: mergeAllowanceRow(row, {
                                                        [band]: { ...row[band], [hk]: n },
                                                      }),
                                                    });
                                                  }}
                                                />
                                              </td>
                                            );
                                          })
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </fieldset>
                        </div>

                        <fieldset className={shiftPanelCls}>
                          <legend className="text-xs font-semibold text-gray-800 px-0.5 mb-1">
                            {t('attendanceStandard.shiftSectionRules')}
                          </legend>
                          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                            <table className="w-full min-w-[520px] text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-100 text-gray-700">
                                  <th className="p-1 border border-gray-200 text-left"> </th>
                                  <th className="p-1 border border-gray-200 text-left">
                                    {t('attendanceStandard.shiftThresholdCol')}
                                  </th>
                                  <th className="p-1 border border-gray-200 text-center">{t('attendanceStandard.otColDaily')}</th>
                                  <th className="p-1 border border-gray-200 text-center">{t('attendanceStandard.otColMonthly')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {([
                                  {
                                    key: 'work_on_holiday',
                                    label: t('attendanceStandard.workOnHoliday'),
                                    enabled: currentShift.work_on_holiday,
                                    threshold: currentShift.work_holiday_threshold_minutes,
                                    daily: currentShift.work_holiday_daily,
                                    monthly: currentShift.work_holiday_monthly,
                                    update: (x: Record<string, unknown>) =>
                                      patchCurrentShift({
                                        work_on_holiday: Boolean(x.enabled ?? currentShift.work_on_holiday),
                                        work_holiday_threshold_minutes: Number(x.threshold ?? currentShift.work_holiday_threshold_minutes),
                                        work_holiday_daily: Number(x.daily ?? currentShift.work_holiday_daily),
                                        work_holiday_monthly: Number(x.monthly ?? currentShift.work_holiday_monthly),
                                      }),
                                  },
                                  {
                                    key: 'late',
                                    label: t('attendanceStandard.lateEnabled'),
                                    enabled: currentShift.late_enabled,
                                    threshold: currentShift.late_threshold_minutes,
                                    daily: currentShift.late_daily,
                                    monthly: currentShift.late_monthly,
                                    update: (x: Record<string, unknown>) =>
                                      patchCurrentShift({
                                        late_enabled: Boolean(x.enabled ?? currentShift.late_enabled),
                                        late_threshold_minutes: Number(x.threshold ?? currentShift.late_threshold_minutes),
                                        late_daily: Number(x.daily ?? currentShift.late_daily),
                                        late_monthly: Number(x.monthly ?? currentShift.late_monthly),
                                        // 레거시 필드 동기화
                                        late_shift_note: String(x.daily ?? currentShift.late_daily ?? ''),
                                        late_monthly_note: String(x.monthly ?? currentShift.late_monthly ?? ''),
                                      }),
                                  },
                                  {
                                    key: 'early',
                                    label: t('attendanceStandard.earlyEnabled'),
                                    enabled: currentShift.early_enabled,
                                    threshold: currentShift.early_threshold_minutes,
                                    daily: currentShift.early_daily,
                                    monthly: currentShift.early_monthly,
                                    update: (x: Record<string, unknown>) =>
                                      patchCurrentShift({
                                        early_enabled: Boolean(x.enabled ?? currentShift.early_enabled),
                                        early_threshold_minutes: Number(x.threshold ?? currentShift.early_threshold_minutes),
                                        early_daily: Number(x.daily ?? currentShift.early_daily),
                                        early_monthly: Number(x.monthly ?? currentShift.early_monthly),
                                      }),
                                  },
                                  {
                                    key: 'leaves',
                                    label: t('attendanceStandard.leavesEnabled'),
                                    enabled: currentShift.leaves_enabled,
                                    threshold: currentShift.leaves_threshold_minutes,
                                    daily: currentShift.leaves_daily,
                                    monthly: currentShift.leaves_monthly,
                                    update: (x: Record<string, unknown>) =>
                                      patchCurrentShift({
                                        leaves_enabled: Boolean(x.enabled ?? currentShift.leaves_enabled),
                                        leaves_threshold_minutes: Number(x.threshold ?? currentShift.leaves_threshold_minutes),
                                        leaves_daily: Number(x.daily ?? currentShift.leaves_daily),
                                        leaves_monthly: Number(x.monthly ?? currentShift.leaves_monthly),
                                      }),
                                  },
                                ] as const).map((row) => (
                                  <tr key={row.key}>
                                    <td className="p-1 border border-gray-200">
                                      <label className="inline-flex items-center gap-1.5 text-gray-700">
                                        <input
                                          type="checkbox"
                                          disabled={disabled}
                                          checked={row.enabled}
                                          onChange={(e) => row.update({ enabled: e.target.checked })}
                                        />
                                        {row.label}
                                      </label>
                                    </td>
                                    <td className="p-1 border border-gray-200">
                                      <div className="inline-flex items-center gap-1">
                                        <input
                                          type="number"
                                          min={0}
                                          disabled={disabled}
                                          className={cn(inputCls, 'w-[4.5rem]')}
                                          value={row.threshold ?? 0}
                                          onChange={(e) => {
                                            const v = parseInt(e.target.value, 10);
                                            row.update({ threshold: Number.isFinite(v) ? Math.max(0, v) : 0 });
                                          }}
                                        />
                                        <span className="text-gray-500">
                                          {t('attendanceStandard.shiftThresholdSuffix')}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="p-1 border border-gray-200">
                                      <input
                                        type="number"
                                        min={0}
                                        disabled={disabled}
                                        className={cn(inputCls, 'w-[4.5rem] mx-auto')}
                                        value={row.daily ?? 0}
                                        onChange={(e) => {
                                          const v = parseInt(e.target.value, 10);
                                          row.update({ daily: Number.isFinite(v) ? Math.max(0, v) : 0 });
                                        }}
                                      />
                                    </td>
                                    <td className="p-1 border border-gray-200">
                                      <input
                                        type="number"
                                        min={0}
                                        disabled={disabled}
                                        className={cn(inputCls, 'w-[4.5rem] mx-auto')}
                                        value={row.monthly ?? 0}
                                        onChange={(e) => {
                                          const v = parseInt(e.target.value, 10);
                                          row.update({ monthly: Number.isFinite(v) ? Math.max(0, v) : 0 });
                                        }}
                                      />
                                    </td>
                                  </tr>
                                ))}
                                <tr>
                                  <td className="p-1 border border-gray-200 text-gray-700 font-medium">
                                    {t('attendanceStandard.ruleMealAllowance')}
                                  </td>
                                  <td className="p-1 border border-gray-200 text-gray-400">-</td>
                                  <td className="p-1 border border-gray-200">
                                    <input
                                      type="number"
                                      min={0}
                                      disabled={disabled}
                                      className={cn(inputCls, 'w-[4.5rem] mx-auto')}
                                      value={currentShift.food_daily ?? 0}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        const n = Number.isFinite(v) ? Math.max(0, v) : 0;
                                        patchCurrentShift({
                                          food_daily: n,
                                          leave_food_daily: n,
                                          leave_food_minutes: n || currentShift.food_monthly,
                                        });
                                      }}
                                    />
                                  </td>
                                  <td className="p-1 border border-gray-200">
                                    <input
                                      type="number"
                                      min={0}
                                      disabled={disabled}
                                      className={cn(inputCls, 'w-[4.5rem] mx-auto')}
                                      value={currentShift.food_monthly ?? 0}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        const n = Number.isFinite(v) ? Math.max(0, v) : 0;
                                        patchCurrentShift({
                                          food_monthly: n,
                                          leave_food_monthly: n,
                                          leave_food_minutes: n || currentShift.food_daily,
                                        });
                                      }}
                                    />
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </fieldset>

                      </>
                    ) : (
                      <p className="text-sm text-gray-500">{t('attendanceStandard.noShift')}</p>
                    )}
                  </div>
                </div>
              )}

              {mainTab === 'shift_group' && (
                <div className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="text-xs font-semibold text-gray-800 border-b border-gray-100 pb-1.5 mb-2">
                    근무조 마스터
                  </div>
                  <div className="overflow-x-auto rounded border border-gray-200">
                    <table className="w-full min-w-[640px] text-xs border-collapse">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-1 w-10">#</th>
                          <th className="p-1 w-16">ID</th>
                          <th className="p-1 text-left">근무조명</th>
                          <th className="p-1 text-left">설명</th>
                          {!disabled && <th className="p-1 w-12" />}
                        </tr>
                      </thead>
                      <tbody>
                        {((draft.shift_group_masters || []) as ShiftGroupMasterRow[]).map((g, gi) => (
                          <tr
                            key={`${g.id ?? 'new'}-${gi}`}
                            className={cn('border-t border-gray-100', shiftGroupIdx === gi && 'bg-indigo-50/50')}
                            onClick={() => setShiftGroupIdx(gi)}
                          >
                            <td className="p-1 text-center text-gray-500">{gi + 1}</td>
                            <td className="p-1 text-center text-gray-500">{entityPayloadId(g.id) ?? '-'}</td>
                            <td className="p-1">
                              <input
                                className={inputCls}
                                disabled={disabled}
                                value={g.name ?? ''}
                                placeholder="근무조명"
                                onChange={(e) =>
                                  setDraft((d) => {
                                    if (!d) return d;
                                    const next = [...(d.shift_group_masters || [])];
                                    next[gi] = { ...next[gi], name: e.target.value, sort_order: gi };
                                    return { ...d, shift_group_masters: next };
                                  })
                                }
                              />
                            </td>
                            <td className="p-1">
                              <input
                                className={inputCls}
                                disabled={disabled}
                                value={g.description ?? ''}
                                placeholder="설명"
                                onChange={(e) =>
                                  setDraft((d) => {
                                    if (!d) return d;
                                    const next = [...(d.shift_group_masters || [])];
                                    next[gi] = { ...next[gi], description: e.target.value, sort_order: gi };
                                    return { ...d, shift_group_masters: next };
                                  })
                                }
                              />
                            </td>
                            {!disabled && (
                              <td className="p-1 text-center">
                                <button
                                  type="button"
                                  className="text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!window.confirm('선택한 근무조를 삭제할까요?')) return;
                                    const row = draft.shift_group_masters?.[gi];
                                    if (!row) return;
                                    const deletedId = entityPayloadId(row?.id as unknown);
                                    if (deletedId != null) {
                                      setDeletedShiftGroupIds((prev) =>
                                        prev.includes(deletedId) ? prev : [...prev, deletedId]
                                      );
                                    }
                                    setDraft((d) => {
                                      if (!d) return d;
                                      const next = (d.shift_group_masters || [])
                                        .filter((_, i) => i !== gi)
                                        .map((x, i) => ({ ...x, sort_order: i }));
                                      return { ...d, shift_group_masters: next };
                                    });
                                    setShiftGroupIdx((prev) => {
                                      const nextLen = Math.max(
                                        0,
                                        (draft.shift_group_masters?.length || 0) - 1
                                      );
                                      if (nextLen === 0) return 0;
                                      if (prev === gi) return Math.min(gi, nextLen - 1);
                                      return Math.min(prev, nextLen - 1);
                                    });
                                  }}
                                >
                                  ×
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {mainTab === 'round' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ['lateness', t('attendanceStandard.roundTab.lateness')],
                        ['early_checkout', t('attendanceStandard.roundTab.early')],
                        ['ot', t('attendanceStandard.roundTab.ot')],
                      ] as const
                    ).map(([k, lab]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setRoundTab(k)}
                        className={cn(
                          'px-3 py-1 rounded-lg text-xs border',
                          roundTab === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200'
                        )}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                  {roundSections.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('attendanceStandard.noRoundSection')}</p>
                  ) : (
                    roundSections.map((sec) => {
                      const gi = draft.round_up_sections.findIndex(
                        (x) => x.tab_key === sec.tab_key && x.section_key === sec.section_key
                      );
                      const isLateTab = roundTab === 'lateness';
                      const isEarlyTab = roundTab === 'early_checkout';
                      const isOtTab = roundTab === 'ot';
                      const isTigerTab = isLateTab || isEarlyTab || isOtTab;
                      const ex = parseExtraJson(sec.extra_json);
                      const lateModes = isLateTab ? lateModesFromExtra(ex) : null;
                      const earlyModes = isEarlyTab ? earlyModesFromExtra(ex) : null;
                      const otConfig = isOtTab ? otConfigFromExtra(ex) : null;
                      const tiersDaily = normalizeRoundTiers(
                        sec.tiers,
                        isOtTab ? ROUND_OT_ROWS : ROUND_LATENESS_ROWS
                      );
                      const tiersPeriod = isOtTab
                        ? tiersFromExtraArray(ex.ot_tiers_period, ROUND_OT_ROWS)
                        : isEarlyTab
                          ? tiersFromExtraArray(ex.early_tiers_period, ROUND_LATENESS_ROWS)
                          : tiersFromExtraArray(ex.tiers_period, ROUND_LATENESS_ROWS);
                      const tiersCount = isEarlyTab
                        ? tiersFromExtraArray(ex.early_tiers_count, ROUND_LATENESS_ROWS)
                        : tiersFromExtraArray(ex.tiers_count, ROUND_LATENESS_ROWS);

                      const patchExtra = (patch: Record<string, unknown>) =>
                        setDraft((d) => {
                          if (!d || gi < 0) return d;
                          const next = [...d.round_up_sections];
                          const cur = next[gi];
                          next[gi] = {
                            ...cur,
                            extra_json: { ...parseExtraJson(cur.extra_json), ...patch },
                          };
                          return { ...d, round_up_sections: next };
                        });

                      const roundTierTable = (
                        rows: RoundTier[],
                        which: string,
                        setRows: (ti: number, field: keyof RoundTier, n: number) => void
                      ) => (
                        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                          <table className="w-full min-w-[280px] text-[11px] border-collapse">
                            <thead className="bg-slate-100 text-gray-700">
                              <tr>
                                <th className="p-1 w-8 border-b border-gray-200">#</th>
                                <th className="p-1 border-b border-gray-200">ID</th>
                                <th className="p-1 border-b border-gray-200">{t('attendanceStandard.from')}</th>
                                <th className="p-1 border-b border-gray-200">{t('attendanceStandard.to')}</th>
                                <th className="p-0.5 w-7 border-b border-gray-200 text-center">=</th>
                                <th className="p-1 border-b border-gray-200">{t('attendanceStandard.roundMin')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((tier, ti) => (
                                <tr key={`${which}-${ti}`} className="border-t border-gray-100">
                                  <td className="p-1 text-center text-gray-500">{ti + 1}</td>
                                  <td className="p-1 text-center text-gray-500">
                                    {entityPayloadId((tier as { id?: unknown }).id) ?? '-'}
                                  </td>
                                  {(['value_from', 'value_to'] as const).map((f) => (
                                    <td key={f} className="p-0.5">
                                      <input
                                        type="number"
                                        className={inputCls}
                                        disabled={disabled}
                                        value={tier[f] ?? 0}
                                        onChange={(e) =>
                                          setRows(ti, f, parseInt(e.target.value, 10) || 0)
                                        }
                                      />
                                    </td>
                                  ))}
                                  <td className="p-0.5 text-center text-gray-400">=</td>
                                  <td className="p-0.5">
                                    <input
                                      type="number"
                                      className={inputCls}
                                      disabled={disabled}
                                      value={tier.rounded_minutes ?? 0}
                                      onChange={(e) =>
                                        setRows(ti, 'rounded_minutes', parseInt(e.target.value, 10) || 0)
                                      }
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );

                      return (
                        <div
                          key={`${sec.tab_key}-${sec.section_key}`}
                          className={
                            isTigerTab
                              ? 'rounded-lg border border-sky-200 bg-sky-50/60 shadow-sm p-3 space-y-3'
                              : fieldsetCls
                          }
                        >
                          <div className="text-[11px] text-gray-500">
                            ID: {entityPayloadId((sec as { id?: unknown }).id) ?? '-'}
                          </div>
                          {isLateTab ? (
                            <>
                              <label className="inline-flex items-center gap-2 text-xs text-gray-800">
                                <input
                                  type="checkbox"
                                  disabled={disabled}
                                  checked={sec.flag_payroll_include}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d || gi < 0) return d;
                                      const next = [...d.round_up_sections];
                                      next[gi] = { ...next[gi], flag_payroll_include: e.target.checked };
                                      return { ...d, round_up_sections: next };
                                    })
                                  }
                                />
                                {t('attendanceStandard.flag.payroll')}
                              </label>

                              <fieldset className="rounded-md border border-slate-200 bg-white/90 px-2 py-2 space-y-2">
                                <legend className="text-xs font-semibold text-gray-800 px-1">
                                  {t('attendanceStandard.late.groupCounting')}
                                </legend>
                                <label className="inline-flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    disabled={disabled}
                                    checked={sec.flag_first_minute}
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d || gi < 0) return d;
                                        const next = [...d.round_up_sections];
                                        next[gi] = { ...next[gi], flag_first_minute: e.target.checked };
                                        return { ...d, round_up_sections: next };
                                      })
                                    }
                                  />
                                  {t('attendanceStandard.flag.firstMin')}
                                </label>
                              </fieldset>

                              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                                <fieldset className="rounded-md border border-slate-200 bg-white/90 p-2 space-y-2 min-w-0">
                                  <legend className="text-xs font-semibold text-gray-800 px-1">
                                    {t('attendanceStandard.late.boxDaily')}
                                  </legend>
                                  <div className="space-y-1.5 text-xs">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`late-day-${gi}`}
                                        disabled={disabled}
                                        checked={lateModes!.late_day_mode === 'exceed_hour'}
                                        onChange={() => patchExtra({ late_day_mode: 'exceed_hour' })}
                                      />
                                      {t('attendanceStandard.late.modeExceedHour')}
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`late-day-${gi}`}
                                        disabled={disabled}
                                        checked={lateModes!.late_day_mode === 'sum_minutes'}
                                        onChange={() => patchExtra({ late_day_mode: 'sum_minutes' })}
                                      />
                                      {t('attendanceStandard.late.modeSumMinutes')}
                                    </label>
                                  </div>
                                  {roundTierTable(tiersDaily, 'daily', (ti, field, n) =>
                                    setDraft((d) => {
                                      if (!d || gi < 0) return d;
                                      const next = [...d.round_up_sections];
                                      const tiers = normalizeRoundTiers(next[gi].tiers, ROUND_LATENESS_ROWS);
                                      tiers[ti] = { ...tiers[ti], [field]: n };
                                      next[gi] = { ...next[gi], tiers };
                                      return { ...d, round_up_sections: next };
                                    })
                                  )}
                                </fieldset>

                                <fieldset className="rounded-md border border-slate-200 bg-white/90 p-2 space-y-2 min-w-0">
                                  <legend className="text-xs font-semibold text-gray-800 px-1">
                                    {t('attendanceStandard.late.boxPeriod')}
                                  </legend>
                                  <div className="space-y-1.5 text-xs">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`late-period-${gi}`}
                                        disabled={disabled}
                                        checked={lateModes!.late_period_mode === 'exceed_hour'}
                                        onChange={() => patchExtra({ late_period_mode: 'exceed_hour' })}
                                      />
                                      {t('attendanceStandard.late.modeExceedHour')}
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`late-period-${gi}`}
                                        disabled={disabled}
                                        checked={lateModes!.late_period_mode === 'sum_minutes'}
                                        onChange={() => patchExtra({ late_period_mode: 'sum_minutes' })}
                                      />
                                      {t('attendanceStandard.late.modeSumMinutes')}
                                    </label>
                                  </div>
                                  {roundTierTable(tiersPeriod, 'period', (ti, field, n) =>
                                    setDraft((d) => {
                                      if (!d || gi < 0) return d;
                                      const cur = d.round_up_sections[gi];
                                      const ex0 = parseExtraJson(cur.extra_json);
                                      const rows = tiersFromExtraArray(ex0.tiers_period, ROUND_LATENESS_ROWS);
                                      rows[ti] = { ...rows[ti], [field]: n };
                                      const next = [...d.round_up_sections];
                                      next[gi] = {
                                        ...cur,
                                        extra_json: { ...ex0, tiers_period: serializeTiersForExtra(rows) },
                                      };
                                      return { ...d, round_up_sections: next };
                                    })
                                  )}
                                  <label className="inline-flex items-center gap-2 text-xs pt-1 border-t border-gray-100">
                                    <input
                                      type="checkbox"
                                      disabled={disabled}
                                      checked={sec.flag_footer}
                                      onChange={(e) =>
                                        setDraft((d) => {
                                          if (!d || gi < 0) return d;
                                          const next = [...d.round_up_sections];
                                          next[gi] = { ...next[gi], flag_footer: e.target.checked };
                                          return { ...d, round_up_sections: next };
                                        })
                                      }
                                    />
                                    {t('attendanceStandard.late.periodFooter')}
                                  </label>
                                </fieldset>

                                <fieldset className="rounded-md border border-slate-200 bg-white/90 p-2 space-y-2 min-w-0">
                                  <legend className="text-xs font-semibold text-gray-800 px-1">
                                    {t('attendanceStandard.late.boxCount')}
                                  </legend>
                                  <label className="inline-flex items-center gap-2 text-xs">
                                    <input
                                      type="checkbox"
                                      disabled={disabled}
                                      checked={sec.flag_use_late_count}
                                      onChange={(e) =>
                                        setDraft((d) => {
                                          if (!d || gi < 0) return d;
                                          const next = [...d.round_up_sections];
                                          next[gi] = { ...next[gi], flag_use_late_count: e.target.checked };
                                          return { ...d, round_up_sections: next };
                                        })
                                      }
                                    />
                                    {t('attendanceStandard.flag.lateCount')}
                                  </label>
                                  <div className="space-y-1.5 text-xs pl-0.5">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`late-charge-${gi}`}
                                        disabled={disabled}
                                        checked={lateModes!.late_count_charge_mode === 'charge_per'}
                                        onChange={() => patchExtra({ late_count_charge_mode: 'charge_per' })}
                                      />
                                      {t('attendanceStandard.late.chargePer')}
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`late-charge-${gi}`}
                                        disabled={disabled}
                                        checked={lateModes!.late_count_charge_mode === 'charge_in'}
                                        onChange={() => patchExtra({ late_count_charge_mode: 'charge_in' })}
                                      />
                                      {t('attendanceStandard.late.chargeIn')}
                                    </label>
                                  </div>
                                  {roundTierTable(tiersCount, 'count', (ti, field, n) =>
                                    setDraft((d) => {
                                      if (!d || gi < 0) return d;
                                      const cur = d.round_up_sections[gi];
                                      const ex0 = parseExtraJson(cur.extra_json);
                                      const rows = tiersFromExtraArray(ex0.tiers_count, ROUND_LATENESS_ROWS);
                                      rows[ti] = { ...rows[ti], [field]: n };
                                      const next = [...d.round_up_sections];
                                      next[gi] = {
                                        ...cur,
                                        extra_json: { ...ex0, tiers_count: serializeTiersForExtra(rows) },
                                      };
                                      return { ...d, round_up_sections: next };
                                    })
                                  )}
                                  <label className="inline-flex items-center gap-2 text-xs pt-1 border-t border-gray-100">
                                    <input
                                      type="checkbox"
                                      disabled={disabled}
                                      checked={lateModes!.late_count_with_early_out}
                                      onChange={(e) =>
                                        patchExtra({ late_count_with_early_out: e.target.checked })
                                      }
                                    />
                                    {t('attendanceStandard.late.countWithEarlyOut')}
                                  </label>
                                </fieldset>
                              </div>
                            </>
                          ) : isEarlyTab ? (
                            <>
                              <label className="inline-flex items-center gap-2 text-xs text-gray-800">
                                <input
                                  type="checkbox"
                                  disabled={disabled}
                                  checked={sec.flag_payroll_include}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d || gi < 0) return d;
                                      const next = [...d.round_up_sections];
                                      next[gi] = { ...next[gi], flag_payroll_include: e.target.checked };
                                      return { ...d, round_up_sections: next };
                                    })
                                  }
                                />
                                {t('attendanceStandard.early.payrollBefore')}
                              </label>

                              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                                <fieldset className="rounded-md border border-slate-200 bg-white/90 p-2 space-y-2 min-w-0">
                                  <legend className="text-xs font-semibold text-gray-800 px-1">
                                    {t('attendanceStandard.early.boxDaily')}
                                  </legend>
                                  <div className="space-y-1.5 text-xs">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`early-day-${gi}`}
                                        disabled={disabled}
                                        checked={earlyModes!.early_day_mode === 'exceed_hour'}
                                        onChange={() => patchExtra({ early_day_mode: 'exceed_hour' })}
                                      />
                                      {t('attendanceStandard.late.modeExceedHour')}
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`early-day-${gi}`}
                                        disabled={disabled}
                                        checked={earlyModes!.early_day_mode === 'sum_minutes'}
                                        onChange={() => patchExtra({ early_day_mode: 'sum_minutes' })}
                                      />
                                      {t('attendanceStandard.late.modeSumMinutes')}
                                    </label>
                                  </div>
                                  {roundTierTable(tiersDaily, 'daily', (ti, field, n) =>
                                    setDraft((d) => {
                                      if (!d || gi < 0) return d;
                                      const next = [...d.round_up_sections];
                                      const tiers = normalizeRoundTiers(next[gi].tiers, ROUND_LATENESS_ROWS);
                                      tiers[ti] = { ...tiers[ti], [field]: n };
                                      next[gi] = { ...next[gi], tiers };
                                      return { ...d, round_up_sections: next };
                                    })
                                  )}
                                </fieldset>

                                <fieldset className="rounded-md border border-slate-200 bg-white/90 p-2 space-y-2 min-w-0">
                                  <legend className="text-xs font-semibold text-gray-800 px-1">
                                    {t('attendanceStandard.early.boxPeriod')}
                                  </legend>
                                  <div className="space-y-1.5 text-xs">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`early-period-${gi}`}
                                        disabled={disabled}
                                        checked={earlyModes!.early_period_mode === 'exceed_hour'}
                                        onChange={() => patchExtra({ early_period_mode: 'exceed_hour' })}
                                      />
                                      {t('attendanceStandard.late.modeExceedHour')}
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`early-period-${gi}`}
                                        disabled={disabled}
                                        checked={earlyModes!.early_period_mode === 'sum_minutes'}
                                        onChange={() => patchExtra({ early_period_mode: 'sum_minutes' })}
                                      />
                                      {t('attendanceStandard.late.modeSumMinutes')}
                                    </label>
                                  </div>
                                  {roundTierTable(tiersPeriod, 'period', (ti, field, n) =>
                                    setDraft((d) => {
                                      if (!d || gi < 0) return d;
                                      const cur = d.round_up_sections[gi];
                                      const ex0 = parseExtraJson(cur.extra_json);
                                      const rows = tiersFromExtraArray(ex0.early_tiers_period, ROUND_LATENESS_ROWS);
                                      rows[ti] = { ...rows[ti], [field]: n };
                                      const next = [...d.round_up_sections];
                                      next[gi] = {
                                        ...cur,
                                        extra_json: { ...ex0, early_tiers_period: serializeTiersForExtra(rows) },
                                      };
                                      return { ...d, round_up_sections: next };
                                    })
                                  )}
                                </fieldset>

                                <fieldset className="rounded-md border border-slate-200 bg-white/90 p-2 space-y-2 min-w-0">
                                  <legend className="text-xs font-semibold text-gray-800 px-1">
                                    {t('attendanceStandard.early.boxCount')}
                                  </legend>
                                  <label className="inline-flex items-center gap-2 text-xs">
                                    <input
                                      type="checkbox"
                                      disabled={disabled}
                                      checked={sec.flag_use_late_count}
                                      onChange={(e) =>
                                        setDraft((d) => {
                                          if (!d || gi < 0) return d;
                                          const next = [...d.round_up_sections];
                                          next[gi] = { ...next[gi], flag_use_late_count: e.target.checked };
                                          return { ...d, round_up_sections: next };
                                        })
                                      }
                                    />
                                    {t('attendanceStandard.early.useCount')}
                                  </label>
                                  <div className="space-y-1.5 text-xs pl-0.5">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`early-charge-${gi}`}
                                        disabled={disabled}
                                        checked={earlyModes!.early_count_charge_mode === 'charge_per'}
                                        onChange={() => patchExtra({ early_count_charge_mode: 'charge_per' })}
                                      />
                                      {t('attendanceStandard.late.chargePer')}
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`early-charge-${gi}`}
                                        disabled={disabled}
                                        checked={earlyModes!.early_count_charge_mode === 'charge_in'}
                                        onChange={() => patchExtra({ early_count_charge_mode: 'charge_in' })}
                                      />
                                      {t('attendanceStandard.late.chargeIn')}
                                    </label>
                                  </div>
                                  {roundTierTable(tiersCount, 'count', (ti, field, n) =>
                                    setDraft((d) => {
                                      if (!d || gi < 0) return d;
                                      const cur = d.round_up_sections[gi];
                                      const ex0 = parseExtraJson(cur.extra_json);
                                      const rows = tiersFromExtraArray(ex0.early_tiers_count, ROUND_LATENESS_ROWS);
                                      rows[ti] = { ...rows[ti], [field]: n };
                                      const next = [...d.round_up_sections];
                                      next[gi] = {
                                        ...cur,
                                        extra_json: { ...ex0, early_tiers_count: serializeTiersForExtra(rows) },
                                      };
                                      return { ...d, round_up_sections: next };
                                    })
                                  )}
                                </fieldset>
                              </div>
                            </>
                          ) : (
                            <>
                              <label className="inline-flex items-start gap-2 text-xs text-gray-800 max-w-3xl">
                                <input
                                  type="checkbox"
                                  disabled={disabled}
                                  checked={otConfig!.ot_payroll_no_separate_ot_holiday}
                                  onChange={(e) =>
                                    patchExtra({ ot_payroll_no_separate_ot_holiday: e.target.checked })
                                  }
                                  className="mt-0.5 shrink-0"
                                />
                                <span>{t('attendanceStandard.ot.payrollMerge')}</span>
                              </label>

                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                <fieldset className="rounded-md border border-slate-200 bg-white/90 p-2 min-w-0">
                                  <legend className="text-xs font-semibold text-gray-800 px-1">
                                    {t('attendanceStandard.ot.boxDaily')}
                                  </legend>
                                  <div className="flex flex-col md:flex-row gap-3 mt-1">
                                    <div className="space-y-2 text-xs shrink-0 md:w-44">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          disabled={disabled}
                                          checked={otConfig!.ot_round_up_working}
                                          onChange={(e) =>
                                            patchExtra({ ot_round_up_working: e.target.checked })
                                          }
                                        />
                                        {t('attendanceStandard.ot.roundUpWorking')}
                                      </label>
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`ot-day-${gi}`}
                                          disabled={disabled}
                                          checked={otConfig!.ot_day_mode === 'exceed_hour'}
                                          onChange={() => patchExtra({ ot_day_mode: 'exceed_hour' })}
                                        />
                                        {t('attendanceStandard.late.modeExceedHour')}
                                      </label>
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`ot-day-${gi}`}
                                          disabled={disabled}
                                          checked={otConfig!.ot_day_mode === 'sum_minutes'}
                                          onChange={() => patchExtra({ ot_day_mode: 'sum_minutes' })}
                                        />
                                        {t('attendanceStandard.ot.modeSumThen')}
                                      </label>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      {roundTierTable(tiersDaily, `ot-d-${gi}`, (ti, field, n) =>
                                        setDraft((d) => {
                                          if (!d || gi < 0) return d;
                                          const next = [...d.round_up_sections];
                                          const tiers = normalizeRoundTiers(next[gi].tiers, ROUND_OT_ROWS);
                                          tiers[ti] = { ...tiers[ti], [field]: n };
                                          next[gi] = { ...next[gi], tiers };
                                          return { ...d, round_up_sections: next };
                                        })
                                      )}
                                    </div>
                                  </div>
                                </fieldset>

                                <fieldset className="rounded-md border border-slate-200 bg-white/90 p-2 min-w-0">
                                  <legend className="text-xs font-semibold text-gray-800 px-1">
                                    {t('attendanceStandard.ot.boxPeriod')}
                                  </legend>
                                  <div className="flex flex-col md:flex-row gap-3 mt-1">
                                    <div className="space-y-2 text-xs shrink-0 md:w-44">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`ot-period-${gi}`}
                                          disabled={disabled}
                                          checked={otConfig!.ot_period_mode === 'exceed_hour'}
                                          onChange={() => patchExtra({ ot_period_mode: 'exceed_hour' })}
                                        />
                                        {t('attendanceStandard.late.modeExceedHour')}
                                      </label>
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`ot-period-${gi}`}
                                          disabled={disabled}
                                          checked={otConfig!.ot_period_mode === 'sum_minutes'}
                                          onChange={() => patchExtra({ ot_period_mode: 'sum_minutes' })}
                                        />
                                        {t('attendanceStandard.ot.modeSumThen')}
                                      </label>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      {roundTierTable(tiersPeriod, `ot-p-${gi}`, (ti, field, n) =>
                                        setDraft((d) => {
                                          if (!d || gi < 0) return d;
                                          const cur = d.round_up_sections[gi];
                                          const ex0 = parseExtraJson(cur.extra_json);
                                          const rows = tiersFromExtraArray(ex0.ot_tiers_period, ROUND_OT_ROWS);
                                          rows[ti] = { ...rows[ti], [field]: n };
                                          const next = [...d.round_up_sections];
                                          next[gi] = {
                                            ...cur,
                                            extra_json: { ...ex0, ot_tiers_period: serializeTiersForExtra(rows) },
                                          };
                                          return { ...d, round_up_sections: next };
                                        })
                                      )}
                                    </div>
                                  </div>
                                </fieldset>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {mainTab === 'leave' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {[1, 2, 3, 4, 5, 6].map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        onClick={() => setLeaveLv(lv)}
                        className={cn(
                          'px-3 py-1 rounded-lg text-xs border',
                          leaveLv === lv ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200'
                        )}
                      >
                        {t('attendanceStandard.leaveLevel').replace('{n}', String(lv))}
                      </button>
                    ))}
                  </div>
                  <div className={fieldsetCls}>
                    <p className="text-xs font-semibold mb-1">{t('attendanceStandard.leaveGlobal')}</p>
                    <p className="text-[11px] text-gray-500 mb-2">
                      {t('attendanceStandard.leaveGlobalPerLevel').replace('{n}', String(leaveLv))}
                    </p>
                    <p className="text-[11px] text-gray-500 mb-2">
                      ID:{' '}
                      {activeLeaveLevelIndex >= 0
                        ? (entityPayloadId(draft.leave_levels[activeLeaveLevelIndex]?.id as unknown) ?? '-')
                        : '-'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(
                        [
                          ['statutory_start_date', t('attendanceStandard.statutoryStart')],
                          ['leave_other_start_date', t('attendanceStandard.leaveOtherStart')],
                          ['display_start_date', t('attendanceStandard.displayStart')],
                        ] as const
                      ).map(([k, lab]) => {
                        const curLv =
                          activeLeaveLevelIndex >= 0
                            ? draft.leave_levels[activeLeaveLevelIndex]
                            : undefined;
                        const dateVal =
                          k === 'statutory_start_date'
                            ? curLv?.statutory_start_date
                            : k === 'leave_other_start_date'
                              ? curLv?.leave_other_start_date
                              : curLv?.display_start_date;
                        return (
                          <label key={k} className="text-xs text-gray-600">
                            {lab}
                            <input
                              type="date"
                              className={inputCls}
                              disabled={disabled || activeLeaveLevelIndex < 0}
                              value={String(dateVal || '').slice(0, 10)}
                              onChange={(e) =>
                                setDraft((d) => {
                                  if (!d || activeLeaveLevelIndex < 0) return d;
                                  const lvls = [...d.leave_levels];
                                  const cur = { ...lvls[activeLeaveLevelIndex], [k]: e.target.value || null };
                                  lvls[activeLeaveLevelIndex] = cur;
                                  return { ...d, leave_levels: lvls };
                                })
                              }
                            />
                          </label>
                        );
                      })}
                      <label className="text-xs text-gray-600">
                        {t('attendanceStandard.cumulativeYear')}
                        <input
                          type="number"
                          className={inputCls}
                          disabled={disabled || activeLeaveLevelIndex < 0}
                          value={String(
                            activeLeaveLevelIndex >= 0
                              ? (draft.leave_levels[activeLeaveLevelIndex]?.cumulative_year ?? '')
                              : ''
                          )}
                          onChange={(e) =>
                            setDraft((d) => {
                              if (!d || activeLeaveLevelIndex < 0) return d;
                              const lvls = [...d.leave_levels];
                              lvls[activeLeaveLevelIndex] = {
                                ...lvls[activeLeaveLevelIndex],
                                cumulative_year: e.target.value ? parseInt(e.target.value, 10) : null,
                              };
                              return { ...d, leave_levels: lvls };
                            })
                          }
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs sm:col-span-2">
                        <input
                          type="checkbox"
                          disabled={disabled || activeLeaveLevelIndex < 0}
                          checked={!!draft.leave_levels[activeLeaveLevelIndex]?.summer_employee_plus_one}
                          onChange={(e) =>
                            setDraft((d) => {
                              if (!d || activeLeaveLevelIndex < 0) return d;
                              const lvls = [...d.leave_levels];
                              lvls[activeLeaveLevelIndex] = {
                                ...lvls[activeLeaveLevelIndex],
                                summer_employee_plus_one: e.target.checked,
                              };
                              return { ...d, leave_levels: lvls };
                            })
                          }
                        />
                        {t('attendanceStandard.summerPlusOne')}
                      </label>
                      <label className="text-xs text-gray-600 sm:col-span-2">
                        {t('attendanceStandard.thaiNotice')}
                        <textarea
                          className={inputCls + ' min-h-[60px]'}
                          disabled={disabled || activeLeaveLevelIndex < 0}
                          value={String(draft.leave_levels[activeLeaveLevelIndex]?.thai_notice_text ?? '')}
                          onChange={(e) =>
                            setDraft((d) => {
                              if (!d || activeLeaveLevelIndex < 0) return d;
                              const lvls = [...d.leave_levels];
                              lvls[activeLeaveLevelIndex] = {
                                ...lvls[activeLeaveLevelIndex],
                                thai_notice_text: e.target.value,
                              };
                              return { ...d, leave_levels: lvls };
                            })
                          }
                        />
                      </label>
                      <label className="text-xs text-gray-600 sm:col-span-2">
                        {t('attendanceStandard.certPath')}
                        <input
                          className={inputCls}
                          disabled={disabled || activeLeaveLevelIndex < 0}
                          value={String(draft.leave_levels[activeLeaveLevelIndex]?.certificate_web_path ?? '')}
                          onChange={(e) =>
                            setDraft((d) => {
                              if (!d || activeLeaveLevelIndex < 0) return d;
                              const lvls = [...d.leave_levels];
                              lvls[activeLeaveLevelIndex] = {
                                ...lvls[activeLeaveLevelIndex],
                                certificate_web_path: e.target.value,
                              };
                              return { ...d, leave_levels: lvls };
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                  <div className="overflow-x-auto border border-gray-200 rounded">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left w-20">ID</th>
                          <th className="p-2 text-left">{t('attendanceStandard.leaveType')}</th>
                          <th className="p-2">{t('attendanceStandard.days')}</th>
                          <th className="p-2">{t('attendanceStandard.hours')}</th>
                          <th className="p-2">{t('attendanceStandard.minutes')}</th>
                          <th className="p-2 whitespace-nowrap">{t('attendanceStandard.leaveLevelOnce')}</th>
                          {!disabled && <th className="p-2" />}
                        </tr>
                      </thead>
                      <tbody>
                        {(draft.leave_levels.find((l) => l.level_number === leaveLv)?.rows || []).map((row, ri) => {
                          const li = draft.leave_levels.findIndex((l) => l.level_number === leaveLv);
                          return (
                            <tr key={ri} className="border-t border-gray-100">
                              <td className="p-1 text-gray-500">{entityPayloadId((row as { id?: unknown }).id) ?? '-'}</td>
                              <td className="p-1">
                                <input
                                  className={inputCls}
                                  disabled={disabled}
                                  value={row.leave_type_name ?? ''}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d || li < 0) return d;
                                      const lvls = [...d.leave_levels];
                                      const rows = [...lvls[li].rows];
                                      rows[ri] = { ...rows[ri], leave_type_name: e.target.value };
                                      lvls[li] = { ...lvls[li], rows };
                                      return { ...d, leave_levels: lvls };
                                    })
                                  }
                                />
                              </td>
                              {(['days_quota', 'hours_quota', 'minutes_quota'] as const).map((f) => (
                                <td key={f} className="p-1">
                                  <input
                                    type="number"
                                    className={inputCls}
                                    disabled={disabled}
                                    value={String(row[f] ?? '')}
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d || li < 0) return d;
                                        const lvls = [...d.leave_levels];
                                        const rows = [...lvls[li].rows];
                                        const v =
                                          f === 'days_quota'
                                            ? parseFloat(e.target.value) || 0
                                            : parseInt(e.target.value, 10) || 0;
                                        rows[ri] = { ...rows[ri], [f]: v };
                                        lvls[li] = { ...lvls[li], rows };
                                        return { ...d, leave_levels: lvls };
                                      })
                                    }
                                  />
                                </td>
                              ))}
                              <td className="p-1 text-center">
                                <input
                                  type="checkbox"
                                  disabled={disabled}
                                  aria-label={t('attendanceStandard.leaveLevelOnce')}
                                  checked={row.option_checked}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d || li < 0) return d;
                                      const lvls = [...d.leave_levels];
                                      const rows = [...lvls[li].rows];
                                      rows[ri] = { ...rows[ri], option_checked: e.target.checked };
                                      lvls[li] = { ...lvls[li], rows };
                                      return { ...d, leave_levels: lvls };
                                    })
                                  }
                                />
                              </td>
                              {!disabled && (
                                <td className="p-1">
                                  <button
                                    type="button"
                                    className="text-red-600"
                                    onClick={() =>
                                      setDraft((d) => {
                                        if (!d || li < 0) return d;
                                        const lvls = [...d.leave_levels];
                                        lvls[li] = {
                                          ...lvls[li],
                                          rows: lvls[li].rows.filter((_, i) => i !== ri),
                                        };
                                        return { ...d, leave_levels: lvls };
                                      })
                                    }
                                  >
                                    ×
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {mainTab === 'holiday' && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-800">
                        {t('attendanceStandard.holidayCalendarTitle')}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="p-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                          disabled={disabled}
                          aria-label={t('attendanceStandard.calendarPrev')}
                          onClick={() =>
                            setHolidayCal((c) => {
                              let m = c.m - 1;
                              let y = c.y;
                              if (m < 1) {
                                m = 12;
                                y -= 1;
                              }
                              return { y, m };
                            })
                          }
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium min-w-[9rem] text-center tabular-nums">
                          {holidayCal.y}-{String(holidayCal.m).padStart(2, '0')}
                        </span>
                        <button
                          type="button"
                          className="p-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                          disabled={disabled}
                          aria-label={t('attendanceStandard.calendarNext')}
                          onClick={() =>
                            setHolidayCal((c) => {
                              let m = c.m + 1;
                              let y = c.y;
                              if (m > 12) {
                                m = 1;
                                y += 1;
                              }
                              return { y, m };
                            })
                          }
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="ml-1 text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                          disabled={disabled}
                          onClick={() => {
                            const d = new Date();
                            setHolidayCal({ y: d.getFullYear(), m: d.getMonth() + 1 });
                          }}
                        >
                          {t('attendanceStandard.calendarToday')}
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-2">{t('attendanceStandard.holidayCalendarHint')}</p>
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-gray-500 mb-1">
                      {(t('attendanceStandard.calWeekdays') as string).split(',').map((w) => (
                        <div key={w} className="py-0.5">
                          {w}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {(() => {
                        const y = holidayCal.y;
                        const mo = holidayCal.m;
                        const firstJs = new Date(y, mo - 1, 1).getDay();
                        const startPad = (firstJs + 6) % 7;
                        const dim = daysInCalendarMonth(y, mo);
                        const cells: ReactElement[] = [];
                        for (let i = 0; i < startPad; i++) {
                          cells.push(<div key={`pad-${i}`} className="min-h-[2.25rem]" />);
                        }
                        for (let d = 1; d <= dim; d++) {
                          const iso = padIsoDate(y, mo, d);
                          const hit = holidaysByDate.get(iso);
                          const isSunday = new Date(y, mo - 1, d).getDay() === 0;
                          cells.push(
                            <button
                              key={iso}
                              type="button"
                              disabled={disabled}
                              title={hit ? hit.remarks || iso : iso}
                              onClick={() => {
                                if (disabled) return;
                                if (hit) {
                                  if (!window.confirm(t('attendanceStandard.removeHolidayConfirm'))) return;
                                  const hid = entityPayloadId((draft.holidays[hit.index] as { id?: unknown })?.id);
                                  if (hid != null) {
                                    setDeletedHolidayIds((prev) => (prev.includes(hid) ? prev : [...prev, hid]));
                                  }
                                  setDraft((bd) =>
                                    bd ? { ...bd, holidays: bd.holidays.filter((_, i) => i !== hit.index) } : bd
                                  );
                                } else {
                                  const remarks = window.prompt(t('attendanceStandard.holidayRemarkPrompt'), '') ?? '';
                                  setDraft((bd) =>
                                    bd ? { ...bd, holidays: [...bd.holidays, { holiday_date: iso, remarks }] } : bd
                                  );
                                }
                              }}
                              className={cn(
                                'min-h-[2.25rem] rounded-md text-xs font-medium border transition-colors',
                                hit
                                  ? 'bg-red-100 border-red-400 text-red-900 shadow-sm'
                                  : isSunday
                                  ? 'bg-emerald-100/80 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                                  : 'border-transparent hover:bg-gray-100 text-gray-800'
                              )}
                            >
                              {d}
                            </button>
                          );
                        }
                        const tail = (7 - ((startPad + dim) % 7)) % 7;
                        for (let i = 0; i < tail; i++) {
                          cells.push(<div key={`tail-${i}`} className="min-h-[2.25rem]" />);
                        }
                        return cells;
                      })()}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2">{t('attendanceStandard.holidayListTitle')}</p>
                    <div className="overflow-x-auto border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="p-2 text-left w-20">ID</th>
                            <th className="p-2 text-left">{t('attendanceStandard.holidayDate')}</th>
                            <th className="p-2 text-left">{t('attendanceStandard.holidayRemark')}</th>
                            {!disabled && <th className="p-2 w-10" />}
                          </tr>
                        </thead>
                        <tbody>
                          {draft.holidays.map((h, hi) => (
                            <tr key={hi} className="border-t border-gray-100">
                              <td className="p-1 text-gray-500">{entityPayloadId((h as { id?: unknown }).id) ?? '-'}</td>
                              <td className="p-1">
                                <input
                                  type="date"
                                  className={inputCls}
                                  disabled={disabled}
                                  value={h.holiday_date?.slice(0, 10) || ''}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d) return d;
                                      const next = [...d.holidays];
                                      next[hi] = { ...next[hi], holiday_date: e.target.value };
                                      return { ...d, holidays: next };
                                    })
                                  }
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  className={inputCls}
                                  disabled={disabled}
                                  value={h.remarks ?? ''}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d) return d;
                                      const next = [...d.holidays];
                                      next[hi] = { ...next[hi], remarks: e.target.value };
                                      return { ...d, holidays: next };
                                    })
                                  }
                                />
                              </td>
                              {!disabled && (
                                <td className="p-1">
                                  <button
                                    type="button"
                                    className="text-red-600"
                                    onClick={() => {
                                      const hid = entityPayloadId((h as { id?: unknown })?.id);
                                      if (hid != null) {
                                        setDeletedHolidayIds((prev) => (prev.includes(hid) ? prev : [...prev, hid]));
                                      }
                                      setDraft((d) =>
                                        d ? { ...d, holidays: d.holidays.filter((_, i) => i !== hi) } : d
                                      );
                                    }}
                                  >
                                    ×
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {mainTab === 'payment' && (
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <label className="text-xs text-gray-600 flex items-center gap-2">
                      {t('attendanceStandard.filterYear')}
                      <input
                        className={inputCls + ' w-28'}
                        placeholder="2026"
                        value={payFilterYear}
                        onChange={(e) => setPayFilterYear(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="overflow-x-auto border border-gray-200 rounded text-[10px] sm:text-xs">
                    <table className="min-w-[1280px] w-full table-fixed">
                      <colgroup>
                        <col className="w-[68px]" />
                        <col className="w-[68px]" />
                        <col className="w-[64px]" />
                        <col className="w-[72px]" />
                        <col className="w-[126px]" />
                        <col className="w-[126px]" />
                        <col className="w-[126px]" />
                        <col className="w-[126px]" />
                        <col className="w-[126px]" />
                        <col className="w-[126px]" />
                        <col className="w-[126px]" />
                        <col className="w-[126px]" />
                      </colgroup>
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-1 whitespace-nowrap">ID</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.year')}</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.month')}</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.periodLabel')}</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.pStartD')}</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.pEndD')}</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.pStartM')}</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.pEndM')}</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.otStartD')}</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.otEndD')}</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.otStartM')}</th>
                          <th className="p-1 whitespace-nowrap">{t('attendanceStandard.otEndM')}</th>
                          {!disabled && <th className="p-1" />}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPayments.map((p, pi) => {
                          const idx = draft.payment_periods.indexOf(p);
                          return (
                            <tr key={`${p.calendar_year}-${p.calendar_month}-${pi}`} className="border-t border-gray-100">
                              <td className="p-1 text-center text-gray-500">{entityPayloadId((p as { id?: unknown }).id) ?? '-'}</td>
                              <td className="p-0.5">
                                <input
                                  type="number"
                                  className={cn(inputCls, 'text-center')}
                                  disabled={disabled}
                                  value={p.calendar_year ?? ''}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d || idx < 0) return d;
                                      const next = [...d.payment_periods];
                                      next[idx] = {
                                        ...next[idx],
                                        calendar_year: parseInt(e.target.value, 10) || 0,
                                      };
                                      return { ...d, payment_periods: next };
                                    })
                                  }
                                />
                              </td>
                              <td className="p-0.5">
                                <input
                                  type="number"
                                  className={cn(inputCls, 'text-center')}
                                  disabled={disabled}
                                  value={p.calendar_month ?? ''}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d || idx < 0) return d;
                                      const next = [...d.payment_periods];
                                      next[idx] = {
                                        ...next[idx],
                                        calendar_month: parseInt(e.target.value, 10) || 1,
                                      };
                                      return { ...d, payment_periods: next };
                                    })
                                  }
                                />
                              </td>
                              <td className="p-0.5">
                                <input
                                  className={cn(inputCls, 'text-center')}
                                  disabled={disabled}
                                  value={p.period_label ?? ''}
                                  onChange={(e) =>
                                    setDraft((d) => {
                                      if (!d || idx < 0) return d;
                                      const next = [...d.payment_periods];
                                      next[idx] = { ...next[idx], period_label: e.target.value };
                                      return { ...d, payment_periods: next };
                                    })
                                  }
                                />
                              </td>
                              {(
                                [
                                  'start_date_daily',
                                  'end_date_daily',
                                  'start_date_monthly',
                                  'end_date_monthly',
                                  'ot_start_daily',
                                  'ot_end_daily',
                                  'ot_start_monthly',
                                  'ot_end_monthly',
                                ] as const
                              ).map((f) => (
                                <td key={f} className="p-0.5">
                                  <input
                                    type="date"
                                    className={inputCls}
                                    disabled={disabled}
                                    value={String((p as never)[f] || '').slice(0, 10)}
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d || idx < 0) return d;
                                        const next = [...d.payment_periods];
                                        next[idx] = { ...next[idx], [f]: e.target.value || '' };
                                        return { ...d, payment_periods: next };
                                      })
                                    }
                                  />
                                </td>
                              ))}
                              {!disabled && (
                                <td className="p-0.5">
                                  <button
                                    type="button"
                                    className="text-red-600"
                                    onClick={() => {
                                      const pid = entityPayloadId((p as { id?: unknown })?.id);
                                      if (pid != null) {
                                        setDeletedPaymentPeriodIds((prev) =>
                                          prev.includes(pid) ? prev : [...prev, pid]
                                        );
                                      }
                                      setDraft((d) =>
                                        d
                                          ? {
                                              ...d,
                                              payment_periods: d.payment_periods.filter((_, i) => i !== idx),
                                            }
                                          : d
                                      );
                                    }}
                                  >
                                    ×
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
