'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Calculator, ChevronDown, ChevronRight, RefreshCw, Search, User } from 'lucide-react';
import AttendanceAggregateBusyOverlay from '@/components/attendance/AttendanceAggregateBusyOverlay';
import AttendanceStatusInquiryAddTimeModal from '@/components/attendance/AttendanceStatusInquiryAddTimeModal';
import RegularOtAskingModal from '@/components/attendance/RegularOtAskingModal';
import SpecialOtModal from '@/components/attendance/SpecialOtModal';
import AttendanceLeaveRecordsModal from '@/components/attendance/AttendanceLeaveRecordsModal';
import { apiClient, getEmployeePhotoThumbnailUrl } from '@/lib/api';
import { runAttendanceTimeDayAggregateStream } from '@/lib/attendanceTimeDayAggregate';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';

type EmpRow = {
  id: number;
  company_id?: number | null;
  employee_number: string;
  name: string;
  department?: string | null;
  position?: string | null;
  swipe_card?: string | null;
  status?: string | null;
};
type RefItem = { code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null };
type RefByCompany = Record<number, Record<string, RefItem[]>>;
type DayRow = Record<string, unknown> & { id: number; work_day?: string };
type WorkCalendarDayItem = { day_of_month: number; shift_code?: string | null; is_workday?: boolean };
type WorkCalendarItem = {
  calendar_year: number;
  calendar_month: number;
  shift_group_id?: number | null;
  shift_group_name?: string | null;
  days?: WorkCalendarDayItem[];
};
type ContextMenuState = {
  x: number;
  y: number;
  rowId: number | null;
  /** 근무일자 YYYY-MM-DD (우클릭한 행) */
  workDay?: string;
};
type ContextMenuItem = { id: string; label: string };
type AttendanceShiftItem = {
  shift_code?: string | null;
  title?: string | null;
};
type PayrollPeriodLite = {
  calendar_year: number;
  calendar_month: number;
  period_label?: string;
  start_date_daily?: string | null;
  end_date_daily?: string | null;
  start_date_monthly?: string | null;
  end_date_monthly?: string | null;
  ot_start_daily?: string | null;
  ot_end_daily?: string | null;
  ot_start_monthly?: string | null;
  ot_end_monthly?: string | null;
  is_closed?: boolean;
};

type Col = { key: string; labelKey: string; fmt: 'date' | 'dt' | 'mins' | 'flt' | 'bool' | 'text'; w?: string; editable?: boolean };
const ZERO_DEFAULT_ALLOWANCE_KEYS = new Set([
  'shift_allowance',
  'food_allowance',
  'food_ot_allowance',
  'special_allowance',
  'fuel_allowance',
  'standing_allowance',
  'other_allowance',
  'othb',
]);
const COLS: Col[] = [
  { key: 'work_day', labelKey: 'attendanceStatusInquiry.col.date', fmt: 'date', w: 'w-[7rem] min-w-[7rem]', editable: true },
  { key: '__weekday', labelKey: 'attendanceInquiry.col.weekday', fmt: 'text', w: 'w-[2.75rem] min-w-[2.75rem]', editable: false },
  { key: 'shift_code', labelKey: 'attendanceStatusInquiry.col.shift', fmt: 'text', w: 'w-[4.5rem]', editable: true },
  { key: 'time_in', labelKey: 'attendanceStatusInquiry.col.timeIn', fmt: 'dt', w: 'w-[7.2rem]', editable: false },
  { key: 'time_out', labelKey: 'attendanceStatusInquiry.col.timeOut', fmt: 'dt', w: 'w-[7.2rem]', editable: false },
  { key: 'late_time_in', labelKey: 'attendanceStatusInquiry.col.late', fmt: 'mins', w: 'w-[4.8rem]', editable: true },
  { key: 'before_time_out', labelKey: 'attendanceStatusInquiry.col.earlyLeave', fmt: 'mins', w: 'w-[4.8rem]', editable: true },
  { key: 'leave_without_pay', labelKey: 'attendanceStatusInquiry.col.leaveW', fmt: 'mins', w: 'w-[5.6rem]', editable: true },
  { key: 'leave_time', labelKey: 'attendanceStatusInquiry.col.leave', fmt: 'mins', w: 'w-[5.6rem]', editable: true },
  { key: 'absent_time', labelKey: 'attendanceStatusInquiry.col.absent', fmt: 'mins', w: 'w-[5.6rem]', editable: true },
  { key: 'work_day_count', labelKey: 'attendanceStatusInquiry.col.workDay', fmt: 'text', w: 'w-[4.8rem]', editable: true },
  { key: 'oth1', labelKey: 'attendanceStatusInquiry.col.ot1', fmt: 'mins', w: 'w-[4.8rem]', editable: true },
  { key: 'oth2', labelKey: 'attendanceStatusInquiry.col.ot15', fmt: 'mins', w: 'w-[4.8rem]', editable: true },
  { key: 'oth3', labelKey: 'attendanceStatusInquiry.col.ot2', fmt: 'mins', w: 'w-[4.8rem]', editable: true },
  { key: 'oth4', labelKey: 'attendanceStatusInquiry.col.ot25', fmt: 'mins', w: 'w-[4.8rem]', editable: true },
  { key: 'oth5', labelKey: 'attendanceStatusInquiry.col.ot3', fmt: 'mins', w: 'w-[4.8rem]', editable: true },
  { key: 'oth6', labelKey: 'attendanceStatusInquiry.col.ot6', fmt: 'mins', w: 'w-[4.8rem]', editable: true },
  { key: 'shift_allowance', labelKey: 'attendanceStatusInquiry.col.shiftAllw', fmt: 'flt', w: 'w-[5.2rem]', editable: true },
  { key: 'food_allowance', labelKey: 'attendanceStatusInquiry.col.foodAllw', fmt: 'flt', w: 'w-[5.2rem]', editable: true },
  { key: 'food_ot_allowance', labelKey: 'attendanceStatusInquiry.col.foodOtAllw', fmt: 'flt', w: 'w-[5.2rem]', editable: true },
  { key: 'special_allowance', labelKey: 'attendanceStatusInquiry.col.special', fmt: 'flt', w: 'w-[5.2rem]', editable: true },
  { key: 'fuel_allowance', labelKey: 'attendanceStatusInquiry.col.fuelAllw', fmt: 'flt', w: 'w-[5.2rem]', editable: true },
  { key: 'standing_allowance', labelKey: 'attendanceStatusInquiry.col.standingAllw', fmt: 'flt', w: 'w-[5.2rem]', editable: true },
  { key: 'other_allowance', labelKey: 'attendanceStatusInquiry.col.otherAllw', fmt: 'flt', w: 'w-[5.2rem]', editable: true },
  { key: '__payroll_closed', labelKey: 'attendanceStatusInquiry.col.payrollClosed', fmt: 'text', w: 'w-[5rem]', editable: false },
  { key: '__shiftScheduled', labelKey: 'attendanceStatusInquiry.col.shiftScheduled', fmt: 'text', w: 'w-[7rem]', editable: false },
  { key: 'note', labelKey: 'attendanceStatusInquiry.col.note', fmt: 'text', w: 'w-[6.5rem]', editable: true },
  { key: 'day_memo', labelKey: 'attendanceStatusInquiry.col.memoName', fmt: 'text', w: 'w-[8rem]', editable: false },
];
/** Sticky left = sum of prior column widths (1rem=16px): 7+2.75+4.5+7.2 rem */
const STICKY_LEFT_COLS: Array<{ key: string; left: number }> = [
  { key: 'work_day', left: 0 },
  { key: '__weekday', left: 112 }, // +7rem
  { key: 'shift_code', left: 156 }, // +2.75rem
  { key: 'time_in', left: 228 }, // +4.5rem
  { key: 'time_out', left: 343 }, // +7.2rem
];

function dtToLocalInput(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function localInputToIso(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 출/퇴근관리 `formatDateCell` 과 동일: ko/th → YYYY-MM-DD, en → MM-DD-YY */
function formatDateLikeInquiry(y: number, m: number, d: number, locale: string): string {
  if (locale === 'en') {
    return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}-${String(y).slice(-2)}`;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function fmtDate(v: unknown, locale: string): string {
  if (!v) return '';
  const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return formatDateLikeInquiry(d.getFullYear(), d.getMonth() + 1, d.getDate(), locale);
}

function weekdayShortForYmd(raw: unknown, locale: string): string {
  const base = String(raw ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return '';
  const d = new Date(`${base}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const loc = locale === 'en' ? 'en-US' : locale === 'th' ? 'th-TH' : 'ko-KR';
  return d.toLocaleDateString(loc, { weekday: 'short' });
}

/** 근태/OT/수당 재집계: 조회 기간의 모든 달력일을 백엔드에 넘겨 익일 퇴근·스필 처리 누락을 막음(기존 행만 넘기면 일자가 빠질 수 있음). */
function expandInclusiveYmd(from: string, to: string): string[] {
  const a = String(from || '').trim().slice(0, 10);
  const b = String(to || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return [];
  const start = new Date(`${a}T12:00:00`);
  const end = new Date(`${b}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function fmtDt(v: unknown, locale: string): string {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const datePart = formatDateLikeInquiry(d.getFullYear(), d.getMonth() + 1, d.getDate(), locale);
  return `${datePart} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function parseHHMMDuration(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const m = /^(-?\d+):(\d{1,2})$/.exec(s);
  if (!m) return null;
  const sign = m[1].startsWith('-') ? -1 : 1;
  const h = Math.abs(parseInt(m[1], 10));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return sign * (h * 60 + mm);
}

function autoFormatHHMMInput(v: string): string {
  const t = String(v || '').trim();
  if (!t) return '';
  const digitsOnly = t.replace(/\D/g, '');
  if (digitsOnly && /^\d+$/.test(digitsOnly) && digitsOnly.length <= 4) {
    // 출/퇴근관리 No.1 입력 규칙과 동일:
    // 7 -> 07:00, 19 -> 19:00, 730 -> 07:30, 0100 -> 01:00
    if (digitsOnly.length <= 2) {
      const h = Math.min(23, Math.max(0, parseInt(digitsOnly, 10) || 0));
      return `${String(h).padStart(2, '0')}:00`;
    }
    if (digitsOnly.length === 3) {
      const h = Math.min(23, Math.max(0, parseInt(digitsOnly.slice(0, 1), 10) || 0));
      const min = Math.min(59, Math.max(0, parseInt(digitsOnly.slice(1), 10) || 0));
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    const h = Math.min(23, Math.max(0, parseInt(digitsOnly.slice(0, 2), 10) || 0));
    const min = Math.min(59, Math.max(0, parseInt(digitsOnly.slice(2), 10) || 0));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const m = /^(\d{1,2})\s*:\s*(\d{1,2})$/.exec(t);
  if (!m) return '';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10) || 0));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function formatMinutesAsHHMM(v: unknown): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function autoFormatDayHHMMInput(v: string): string {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const hasDash = raw.includes('-');
  if (hasDash) {
    const [left, right] = raw.split('-', 2);
    const dayDigits = left.replace(/\D/g, '');
    const day = dayDigits ? String(Number(dayDigits)) : '0';
    const timeDigits = right.replace(/\D/g, '').slice(-4);
    const padded = timeDigits.padStart(4, '0');
    return `${day}-${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
  }
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (!digits) return '';
  const dayDigits = digits.length > 4 ? digits.slice(0, -4) : '0';
  const timeDigits = digits.slice(-4).padStart(4, '0');
  return `${String(Number(dayDigits))}-${timeDigits.slice(0, 2)}:${timeDigits.slice(2, 4)}`;
}

function formatMinutesAsDayHHMM(v: unknown): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  const minutesPerDay = 8 * 60;
  const days = Math.floor(abs / minutesPerDay);
  const rem = abs % minutesPerDay;
  const h = Math.floor(rem / 60);
  const m = rem % 60;
  return `${sign}${days}-${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseDayHHMMToMinutes(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const m = /^(-?\d+)-(\d{1,2}):(\d{1,2})$/.exec(s);
  if (!m) return null;
  const dayRaw = parseInt(m[1], 10);
  if (!Number.isFinite(dayRaw)) return null;
  const sign = dayRaw < 0 ? -1 : 1;
  const days = Math.abs(dayRaw);
  const hh = Math.max(0, Math.min(23, parseInt(m[2], 10) || 0));
  const mm = Math.max(0, Math.min(59, parseInt(m[3], 10) || 0));
  return sign * (days * 8 * 60 + hh * 60 + mm);
}
function normalizeShiftCode(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}
function normalizeWorkDayText(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '-';
  return s.slice(0, 10);
}

function eachDayInclusive(fromIso: string, toIso: string): string[] {
  const a = String(fromIso || '').slice(0, 10);
  const b = String(toIso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || a > b) return [];
  const out: string[] = [];
  let d = new Date(`${a}T12:00:00`);
  const end = new Date(`${b}T12:00:00`);
  while (d <= end) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function formatNumberWithCommas(v: unknown): string {
  if (v == null || v === '') return '';
  const s = String(v).replace(/,/g, '').trim();
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('en-US');
}

function normalizeNumericInput(raw: string): string {
  const cleaned = String(raw ?? '').replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return cleaned;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US');
}

function classifyDayRow(
  row: DayRow,
  calendarMetaByDate: Record<string, { isWorkday?: boolean; shiftCode?: string }>
): 'holiday_legal' | 'holiday' | 'weekday' {
  const memo = String(row.day_memo || '').toLowerCase();
  if (memo.includes('법정휴일') || memo.includes('public holiday') || memo.includes('holiday(유급)')) {
    return 'holiday_legal';
  }
  const key = String(row.work_day || '').slice(0, 10);
  const meta = key ? calendarMetaByDate[key] : undefined;
  if (meta && meta.isWorkday === false) return 'holiday';
  if (Boolean(row.day_off)) return 'holiday';
  return 'weekday';
}

function formatDraftForEdit(row: DayRow): Record<string, unknown> {
  const d: Record<string, unknown> = { ...row };
  d.late_time_in = formatMinutesAsHHMM(row.late_time_in);
  d.before_time_out = formatMinutesAsHHMM(row.before_time_out);
  d.oth1 = formatMinutesAsHHMM(row.oth1);
  d.oth2 = formatMinutesAsHHMM(row.oth2);
  d.oth3 = formatMinutesAsHHMM(row.oth3);
  d.oth4 = formatMinutesAsHHMM(row.oth4);
  d.oth5 = formatMinutesAsHHMM(row.oth5);
  d.oth6 = formatMinutesAsHHMM(row.oth6);
  d.leave_without_pay = formatMinutesAsDayHHMM(row.leave_without_pay);
  d.leave_time = formatMinutesAsDayHHMM(row.leave_time);
  d.absent_time = formatMinutesAsDayHHMM(row.absent_time);
  for (const c of COLS) {
    if (c.fmt === 'flt') {
      const raw = row[c.key];
      if ((raw == null || raw === '') && ZERO_DEFAULT_ALLOWANCE_KEYS.has(c.key)) {
        d[c.key] = '0';
      } else {
        d[c.key] = formatNumberWithCommas(raw);
      }
    }
  }
  return d;
}

export default function AttendanceStatusInquiryPage() {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-status-inquiry', 'can_read');
  const allowCreate = can('attendance-status-inquiry', 'can_create');
  const allowSave = can('attendance-status-inquiry', 'can_update');
  const allowDelete = can('attendance-status-inquiry', 'can_delete');
  const allowAggregateRun = can('attendance-aggregate', 'can_update');

  const [companies, setCompanies] = useState<Array<{ id: number; company_code: string; name_kor?: string | null; name_thai?: string | null; name_eng?: string | null }>>([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<'active' | 'terminated' | 'all'>('active');
  const deferredEmploymentStatus = useDeferredValue(employmentStatusFilter);
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [expandedDept, setExpandedDept] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [refsByCompany, setRefsByCompany] = useState<RefByCompany>({});
  const [rows, setRows] = useState<DayRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [mode, setMode] = useState<MasterUiMode>('edit');
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [editDrafts, setEditDrafts] = useState<Record<number, Record<string, unknown>>>({});
  const [rowsLoading, setRowsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [masterBundle, setMasterBundle] = useState<Record<string, unknown> | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [workCalendars, setWorkCalendars] = useState<WorkCalendarItem[]>([]);
  const [attendanceShifts, setAttendanceShifts] = useState<AttendanceShiftItem[]>([]);
  const [closedDayMap, setClosedDayMap] = useState<Record<string, boolean>>({});

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const toDateInput = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [dateFrom, setDateFrom] = useState(toDateInput(firstDayOfMonth));
  const [dateTo, setDateTo] = useState(toDateInput(now));
  const [runningAggregate, setRunningAggregate] = useState(false);
  const [aggregateProgress, setAggregateProgress] = useState<{ percent: number; done: number; total: number } | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [addTimeModalOpen, setAddTimeModalOpen] = useState(false);
  const [addTimeWorkDay, setAddTimeWorkDay] = useState('');
  const [regularOtModalOpen, setRegularOtModalOpen] = useState(false);
  const [regularOtContextWorkDay, setRegularOtContextWorkDay] = useState('');
  const [specialOtModalOpen, setSpecialOtModalOpen] = useState(false);
  const [specialOtContextWorkDay, setSpecialOtContextWorkDay] = useState('');
  const [leaveRecordsModalOpen, setLeaveRecordsModalOpen] = useState(false);
  const [leaveRecordsContextWorkDay, setLeaveRecordsContextWorkDay] = useState('');
  const stickyLeftByKey = useMemo(() => {
    const map = new Map<string, number>();
    STICKY_LEFT_COLS.forEach((x) => map.set(x.key, x.left));
    return map;
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);
  useEffect(() => {
    const onGlobalMouseDown = () => setContextMenu(null);
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('mousedown', onGlobalMouseDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('mousedown', onGlobalMouseDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, []);
  useEffect(() => {
    if (!runningAggregate) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [runningAggregate]);

  const companyLabel = (c: (typeof companies)[number]) => (locale === 'ko' ? c.name_kor || c.name_eng || c.name_thai || c.company_code : locale === 'en' ? c.name_eng || c.name_kor || c.name_thai || c.company_code : c.name_thai || c.name_kor || c.name_eng || c.company_code);
  const refLabel = useCallback((it: RefItem) => (locale === 'ko' ? it.name_kor || it.name_eng || it.name_thai || it.code : locale === 'en' ? it.name_eng || it.name_kor || it.name_thai || it.code : it.name_thai || it.name_kor || it.name_eng || it.code), [locale]);

  const loadEmployees = useCallback(async () => {
    setListLoading(true);
    try {
      const cid = companyFilter ? parseInt(companyFilter, 10) : undefined;
      const { data } = await apiClient.getEmployees(cid && Number.isFinite(cid) ? { company_id: cid } : undefined);
      setEmployees((data as EmpRow[]) || []);
    } catch {
      setEmployees([]);
    } finally {
      setListLoading(false);
    }
  }, [companyFilter]);

  const ensureRefs = useCallback(async (companyId: number) => {
    if (refsByCompany[companyId]) return;
    try {
      const cats = ['department', 'position', 'division', 'level', 'work_place', 'employment_type', 'employee_type'] as const;
      const vals = await Promise.all(cats.map((c) => apiClient.getEmployeeReferenceItems(c, companyId)));
      const next: Record<string, RefItem[]> = {};
      cats.forEach((c, i) => {
        next[c] = Array.isArray(vals[i].data) ? (vals[i].data as RefItem[]) : [];
      });
      setRefsByCompany((p) => ({ ...p, [companyId]: next }));
    } catch {}
  }, [refsByCompany]);

  useEffect(() => { void apiClient.getMyCompanies().then(({ data }) => setCompanies((data as typeof companies) || [])).catch(() => setCompanies([])); }, []);
  useEffect(() => { if (allowRead) void loadEmployees(); }, [allowRead, loadEmployees]);
  useEffect(() => { const ids = Array.from(new Set(employees.map((e) => e.company_id).filter((x): x is number => !!x))); ids.forEach((id) => void ensureRefs(id)); }, [employees, ensureRefs]);

  const mapCode = useCallback((cid: number | null | undefined, cat: string, code: string | null | undefined, fallback = '-') => {
    const raw = (code || '').trim();
    if (!raw) return fallback;
    const items = cid != null ? refsByCompany[cid]?.[cat] || [] : [];
    const hit = items.find((x) => x.code === raw);
    return hit ? refLabel(hit) : raw;
  }, [refsByCompany, refLabel]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return employees.filter((e) => {
      const st = e.status || 'active';
      if (deferredEmploymentStatus !== 'all' && st !== deferredEmploymentStatus) return false;
      if (!q) return true;
      return (e.name || '').toLowerCase().includes(q) || (e.employee_number || '').toLowerCase().includes(q) || (e.swipe_card || '').toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q);
    }).sort((a, b) => a.employee_number.localeCompare(b.employee_number));
  }, [employees, deferredEmploymentStatus, searchTerm]);

  const deptGroups = useMemo(() => {
    const m = new Map<string, EmpRow[]>();
    for (const e of filtered) {
      const d = mapCode(e.company_id ?? null, 'department', e.department, t('attendanceMaster.deptUnassigned'));
      m.set(d, [...(m.get(d) || []), e]);
    }
    return Array.from(m.entries()).map(([dept, rows]) => ({ dept, rows: rows.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [filtered, mapCode, t]);

  const selectedEmp = useMemo(() => (selectedId != null ? employees.find((e) => e.id === selectedId) : null), [employees, selectedId]);
  /** 재집계 시 work_dates — 조회 `dateFrom`~`dateTo` 전 구간(행 유무와 무관). */
  const recalcWorkDates = useMemo(() => expandInclusiveYmd(dateFrom, dateTo), [dateFrom, dateTo]);
  const selectedRowIndex = useMemo(() => rows.findIndex((r) => r.id === selectedRowId), [rows, selectedRowId]);
  const selectedRow = useMemo(
    () => (selectedRowId != null ? rows.find((r) => r.id === selectedRowId) || null : null),
    [rows, selectedRowId]
  );

  const loadRows = useCallback(async () => {
    if (selectedId == null) { setRows([]); setSelectedRowId(null); return; }
    setRowsLoading(true);
    try {
      const { data } = await apiClient.getAttendanceTimeDay({ employee_id: selectedId, date_from: dateFrom || undefined, date_to: dateTo || undefined });
      const items = ((data as { items?: DayRow[] })?.items || []).sort((a, b) => String(a.work_day || '').localeCompare(String(b.work_day || '')));
      setRows(items);
      setSelectedRowId(items[0]?.id ?? null);
      setMode('edit');
      setDraft({});
    } catch { setRows([]); } finally { setRowsLoading(false); }
  }, [selectedId, dateFrom, dateTo]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  useEffect(() => {
    if (selectedId == null) { setMasterBundle(null); return; }
    let cancel = false;
    setMasterLoading(true);
    void apiClient.getEmployeeAttendanceMaster(selectedId).then(({ data }) => {
      if (!cancel) setMasterBundle((data as Record<string, unknown>) || null);
    }).catch(() => !cancel && setMasterBundle(null)).finally(() => !cancel && setMasterLoading(false));
    return () => { cancel = true; };
  }, [selectedId]);

  useEffect(() => {
    const cid = selectedEmp?.company_id ?? null;
    if (cid == null) {
      setWorkCalendars([]);
      setAttendanceShifts([]);
      return;
    }
    let cancel = false;
    void apiClient
      .getAttendanceStandard(cid)
      .then(({ data }) => {
        if (cancel) return;
        const bundle = (data as { work_calendars?: WorkCalendarItem[]; shifts?: AttendanceShiftItem[] }) || {};
        const cals = (bundle.work_calendars || []) as WorkCalendarItem[];
        const shifts = (bundle.shifts || []) as AttendanceShiftItem[];
        setWorkCalendars(cals);
        setAttendanceShifts(shifts);
      })
      .catch(() => {
        if (cancel) return;
        setWorkCalendars([]);
        setAttendanceShifts([]);
      });
    return () => {
      cancel = true;
    };
  }, [selectedEmp?.company_id]);

  useEffect(() => {
    const companyId = selectedEmp?.company_id;
    if (!companyId || !dateFrom || !dateTo || dateFrom > dateTo) {
      setClosedDayMap({});
      return;
    }
    const ys = new Set<number>([Number(dateFrom.slice(0, 4)), Number(dateTo.slice(0, 4))].filter(Number.isFinite));
    let cancel = false;
    (async () => {
      const next: Record<string, boolean> = {};
      try {
        const years = Array.from(ys);
        const allItems: PayrollPeriodLite[] = [];
        for (const y of years) {
          const { data } = await apiClient.getPayrollBucketPaymentPeriods({ company_id: Number(companyId), calendar_year: y });
          const items = (((data as { items?: PayrollPeriodLite[] })?.items) || []) as PayrollPeriodLite[];
          allItems.push(...items);
        }
        for (const p of allItems) {
          if (!p.is_closed) continue;
          const ranges: Array<[string | null | undefined, string | null | undefined]> = [
            [p.start_date_daily, p.end_date_daily],
            [p.start_date_monthly, p.end_date_monthly],
            [p.ot_start_daily, p.ot_end_daily],
            [p.ot_start_monthly, p.ot_end_monthly],
          ];
          for (const [s, e] of ranges) {
            const ds = String(s || '').slice(0, 10);
            const de = String(e || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || !/^\d{4}-\d{2}-\d{2}$/.test(de)) continue;
            for (const d of eachDayInclusive(ds, de)) next[d] = true;
          }
        }
      } catch {
        // no-op
      }
      if (!cancel) setClosedDayMap(next);
    })();
    return () => {
      cancel = true;
    };
  }, [selectedEmp?.company_id, dateFrom, dateTo]);

  const headerEmployee = (masterBundle?.employee as Record<string, unknown> | undefined) || null;
  const headerBasic = (masterBundle?.basic as Record<string, unknown> | undefined) || null;
  const headerDivision = selectedEmp ? mapCode(selectedEmp.company_id ?? null, 'division', String(headerEmployee?.division || ''), '—') : '—';
  const headerDept = selectedEmp ? mapCode(selectedEmp.company_id ?? null, 'department', String(headerEmployee?.department || ''), '—') : '—';
  const headerLevel = selectedEmp ? mapCode(selectedEmp.company_id ?? null, 'level', String(headerEmployee?.job_level || ''), '—') : '—';
  const headerWork = selectedEmp ? mapCode(selectedEmp.company_id ?? null, 'work_place', String(headerEmployee?.work_place || ''), '—') : '—';
  const headerHireDate = selectedEmp ? String(headerEmployee?.hire_date || '').slice(0, 10) || '—' : '—';
  const headerEmploymentType = selectedEmp
    ? mapCode(selectedEmp.company_id ?? null, 'employment_type', String(headerEmployee?.employment_type || ''), '—')
    : '—';
  const headerSalaryType = selectedEmp
    ? mapCode(selectedEmp.company_id ?? null, 'employee_type', String(headerEmployee?.salary_process_type || ''), '—')
    : '—';
  const headerWorkCalendar = selectedEmp ? String(headerBasic?.master_shiftwork ?? '').trim() || '—' : '—';
  const selectedShiftGroupId = Number(headerBasic?.master_shiftwork_id ?? 0) || null;
  const selectedShiftGroupName = String(headerBasic?.master_shiftwork ?? '').trim();
  const calendarShiftByDate = useMemo(() => {
    const out: Record<string, string> = {};
    if (!selectedEmp) return out;
    for (const r of rows) {
      const dateKey = String(r.work_day || '').slice(0, 10);
      if (!dateKey) continue;
      const [y, m, d] = dateKey.split('-').map(Number);
      if (!y || !m || !d) continue;
      const cal = workCalendars.find((x) => {
        if (Number(x.calendar_year) !== y || Number(x.calendar_month) !== m) return false;
        if (selectedShiftGroupId && Number(x.shift_group_id || 0) === selectedShiftGroupId) return true;
        if (!selectedShiftGroupId && selectedShiftGroupName) {
          return String(x.shift_group_name || '').trim() === selectedShiftGroupName;
        }
        return false;
      });
      const day = cal?.days?.find((dd) => Number(dd.day_of_month) === d);
      const sc = String(day?.shift_code || '').trim();
      if (sc) out[dateKey] = sc;
    }
    return out;
  }, [rows, selectedEmp, selectedShiftGroupId, selectedShiftGroupName, workCalendars]);
  const renderDisplay = useCallback(
    (r: Record<string, unknown>, c: Col): string => {
      const v = r[c.key];
      if (c.key === 'shift_code') {
        const base = String(r.work_day || '').slice(0, 10);
        const raw = String(v || '').trim();
        return raw || (base ? calendarShiftByDate[base] || '' : '');
      }
      if (c.key === '__weekday') return weekdayShortForYmd(r.work_day, locale);
      if (c.key === '__payroll_closed') {
        const key = String(r.work_day || '').slice(0, 10);
        return key && closedDayMap[key]
          ? t('attendanceStatusInquiry.closed')
          : t('attendanceStatusInquiry.open');
      }
      if (c.key === '__shiftScheduled') {
        const stIn = String(r.st_in || '').trim();
        const stOut = String(r.st_out || '').trim();
        if (!stIn && !stOut) return '';
        return `${stIn || '--:--'} - ${stOut || '--:--'}`;
      }
      if (c.fmt === 'date') return fmtDate(v, locale);
      if (c.fmt === 'dt') return fmtDt(v, locale);
      if (c.fmt === 'mins') {
        if (c.key === 'leave_without_pay' || c.key === 'leave_time' || c.key === 'absent_time') {
          return formatMinutesAsDayHHMM(v);
        }
        return formatMinutesAsHHMM(v);
      }
      if (c.fmt === 'flt') {
        if ((v == null || v === '') && ZERO_DEFAULT_ALLOWANCE_KEYS.has(c.key)) return '0';
        return formatNumberWithCommas(v);
      }
      if (c.fmt === 'bool') return v ? '✓' : '';
      return v == null ? '' : String(v);
    },
    [locale, calendarShiftByDate, closedDayMap, t]
  );
  const calendarMetaByDate = useMemo(() => {
    const out: Record<string, { isWorkday?: boolean; shiftCode?: string }> = {};
    if (!selectedEmp) return out;
    for (const r of rows) {
      const dateKey = String(r.work_day || '').slice(0, 10);
      if (!dateKey) continue;
      const [y, m, d] = dateKey.split('-').map(Number);
      if (!y || !m || !d) continue;
      const cal = workCalendars.find((x) => {
        if (Number(x.calendar_year) !== y || Number(x.calendar_month) !== m) return false;
        if (selectedShiftGroupId && Number(x.shift_group_id || 0) === selectedShiftGroupId) return true;
        if (!selectedShiftGroupId && selectedShiftGroupName) {
          return String(x.shift_group_name || '').trim() === selectedShiftGroupName;
        }
        return false;
      });
      const day = cal?.days?.find((dd) => Number(dd.day_of_month) === d);
      if (!day) continue;
      out[dateKey] = {
        isWorkday: Boolean(day.is_workday),
        shiftCode: String(day.shift_code || '').trim() || undefined,
      };
    }
    return out;
  }, [rows, selectedEmp, selectedShiftGroupId, selectedShiftGroupName, workCalendars]);
  const shiftCodeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ code: string; label: string }> = [];
    for (const s of attendanceShifts) {
      const code = String(s.shift_code || '').trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const title = String(s.title || '').trim();
      out.push({ code, label: title && title !== code ? `${code} (${title})` : code });
    }
    out.sort((a, b) => a.code.localeCompare(b.code));
    return out;
  }, [attendanceShifts]);
  const shiftCodeLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of shiftCodeOptions) {
      const key = normalizeShiftCode(opt.code);
      if (key && !map.has(key)) map.set(key, opt.code);
    }
    return map;
  }, [shiftCodeOptions]);
  const shiftCodeDatalistId = useMemo(
    () => `attendance-shift-code-options-${selectedEmp?.company_id ?? 'all'}`,
    [selectedEmp?.company_id]
  );
  const onAdd = () => {
    if (selectedId == null) return;
    setMode('new');
    setSelectedRowId(null);
    setDraft({ work_day: dateFrom });
  };
  const onEdit = () => {
    if (selectedRowId == null) return;
    setMode('edit');
    setEditDrafts({});
  };
  const onCancel = () => { setMode('edit'); setDraft({}); setEditDrafts({}); };
  const onDelete = async () => {
    if (selectedRowId == null || !confirm(t('attendanceInquiry.confirmDelete'))) return;
    setSaving(true);
    try { await apiClient.deleteAttendanceTimeDay(selectedRowId); await loadRows(); } finally { setSaving(false); }
  };

  const buildPayloadFromDraft = (src: Record<string, unknown>) => {
    const p: Record<string, unknown> = {};
    for (const c of COLS) {
      if (!c.editable) continue;
      const v = src[c.key];
      if (c.key === 'shift_code') {
        const normalized = normalizeShiftCode(v);
        p[c.key] = shiftCodeLookup.get(normalized) || normalized || null;
        continue;
      }
      if (c.fmt === 'date') p[c.key] = String(v || '').slice(0, 10) || null;
      else if (c.fmt === 'dt') p[c.key] = localInputToIso(String(v || ''));
      else if (c.fmt === 'mins') {
        if (c.key === 'leave_without_pay' || c.key === 'leave_time' || c.key === 'absent_time') {
          p[c.key] = parseDayHHMMToMinutes(String(v || ''));
        } else {
          p[c.key] = parseHHMMDuration(String(v || ''));
        }
      }
      else if (c.fmt === 'flt') {
        const raw = String(v ?? '').replace(/,/g, '').trim();
        p[c.key] = raw === '' ? null : Number(raw);
      }
      else if (c.fmt === 'bool') p[c.key] = !!v;
      else p[c.key] = String(v || '').trim() || null;
    }
    return p;
  };
  const validateDraftInput = (
    src: Record<string, unknown>,
    opts?: { allowLegacyShiftCode?: boolean; workDayText?: string }
  ): string | null => {
    const allowLegacyShiftCode = Boolean(opts?.allowLegacyShiftCode);
    const workDayText = opts?.workDayText || normalizeWorkDayText(src.work_day);
    const shiftCode = normalizeShiftCode(src.shift_code);
    if (!shiftCode) {
      return `${workDayText}: ${t('attendanceStatusInquiry.shiftCodeRequired', '교대근무조 코드는 필수입니다.')}`;
    }
    if (!allowLegacyShiftCode && shiftCodeOptions.length === 0) {
      return `${workDayText}: ${t(
        'attendanceStatusInquiry.shiftCodeMasterEmpty',
        '근태기준정보에서 교대근무 코드 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
      )}`;
    }
    if (!allowLegacyShiftCode && !shiftCodeLookup.has(shiftCode)) {
      return `${workDayText}: ${t(
        'attendanceStatusInquiry.shiftCodeInvalid',
        '근태기준정보에 없는 교대근무조 코드입니다. 드롭다운 목록에서 선택하거나 등록된 코드를 입력해주세요.'
      )}`;
    }
    const hhmmFields = ['late_time_in', 'before_time_out', 'oth1', 'oth2', 'oth3', 'oth4', 'oth5', 'oth6'] as const;
    for (const key of hhmmFields) {
      const raw = String(src[key] ?? '').trim();
      if (!raw) continue;
      if (parseHHMMDuration(raw) == null) {
        return `${t('attendanceStatusInquiry.col.' + (key === 'before_time_out' ? 'earlyLeave' : key === 'late_time_in' ? 'late' : key.replace('oth', 'ot')))}: 00:00 형식으로 입력해주세요.`;
      }
    }
    const dayHHMMFields = ['leave_without_pay', 'leave_time', 'absent_time'] as const;
    for (const key of dayHHMMFields) {
      const raw = String(src[key] ?? '').trim();
      if (!raw) continue;
      if (parseDayHHMMToMinutes(raw) == null) {
        return `${t('attendanceStatusInquiry.col.' + (key === 'leave_without_pay' ? 'leaveW' : key === 'leave_time' ? 'leave' : 'absent'))}: 0-00:00 형식으로 입력해주세요.`;
      }
    }
    return null;
  };
  const onSave = async () => {
    if (selectedId == null) return;
    setSaving(true);
    try {
      if (mode === 'new') {
        const err = validateDraftInput(draft, { workDayText: normalizeWorkDayText(draft.work_day) });
        if (err) {
          alert(err);
          return;
        }
        const payload = buildPayloadFromDraft(draft);
        if (!payload.work_day) { alert('work_day is required'); return; }
        await apiClient.createAttendanceTimeDay(selectedId, payload);
      } else if (mode === 'edit') {
        const changedEntries = Object.entries(editDrafts);
        if (changedEntries.length === 0) {
          alert(t('attendanceInquiry.saved'));
          setMode('edit');
          return;
        }
        for (const [rowIdText, rowDraft] of changedEntries) {
          const rowId = Number(rowIdText);
          if (!Number.isFinite(rowId)) continue;
          const originalRow = rows.find((x) => x.id === rowId);
          const originalShiftCode = normalizeShiftCode(originalRow?.shift_code);
          const draftShiftCode = normalizeShiftCode(rowDraft.shift_code);
          const allowLegacyShiftCode =
            Boolean(originalShiftCode) &&
            draftShiftCode === originalShiftCode &&
            !shiftCodeLookup.has(draftShiftCode);
          const err = validateDraftInput(rowDraft, {
            allowLegacyShiftCode,
            workDayText: normalizeWorkDayText((rowDraft.work_day ?? originalRow?.work_day) as unknown),
          });
          if (err) {
            alert(err);
            return;
          }
          const payload = buildPayloadFromDraft(rowDraft);
          if (!payload.work_day) {
            alert('work_day is required');
            return;
          }
          await apiClient.updateAttendanceTimeDay(rowId, payload);
        }
      }
      await loadRows();
      setMode('edit');
      setDraft({});
      setEditDrafts({});
      alert(t('attendanceInquiry.saved'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof msg === 'string' ? msg : t('attendanceInquiry.saveError'));
    } finally { setSaving(false); }
  };

  const setDraftValue = (k: string, v: unknown) => setDraft((p) => ({ ...p, [k]: v }));
  const setEditDraftValue = (rowId: number, k: string, v: unknown) =>
    setEditDrafts((prev) => {
      const base = prev[rowId] ?? formatDraftForEdit((rows.find((x) => x.id === rowId) || {}) as DayRow);
      return { ...prev, [rowId]: { ...base, [k]: v } };
    });
  const setDraftFormatted = (col: Col, raw: string, rowId?: number) => {
    let next = raw;
    if (col.fmt === 'mins') {
      const isDayFormat = col.key === 'leave_without_pay' || col.key === 'leave_time' || col.key === 'absent_time';
      if (!isDayFormat) {
        // 출/퇴근관리와 동일하게 입력 중에는 원문 유지(최대 4자리 숫자 또는 ':' 포함)
        // 포커스 이탈(onBlur) 시 normalize 한다.
        const digits = raw.replace(/\D/g, '');
        if (!(digits === '' || digits.length <= 4 || raw.includes(':'))) return;
      }
      next = raw;
    }
    if (mode === 'edit' && rowId != null) {
      if (col.fmt === 'flt') {
        setEditDraftValue(rowId, col.key, normalizeNumericInput(raw));
        return;
      }
      setEditDraftValue(rowId, col.key, next);
      return;
    }
    if (col.fmt === 'flt') {
      setDraftValue(col.key, normalizeNumericInput(raw));
      return;
    }
    setDraftValue(col.key, next);
  };
  const normalizeMinsFieldOnBlur = (col: Col, rowId?: number) => {
    if (col.fmt !== 'mins') return;
    const isDayFormat = col.key === 'leave_without_pay' || col.key === 'leave_time' || col.key === 'absent_time';
    if (mode === 'edit' && rowId != null) {
      const cur = String(getEditCellValue((rows.find((x) => x.id === rowId) || {}) as DayRow, col.key) ?? '');
      const normalized = isDayFormat ? autoFormatDayHHMMInput(cur) : autoFormatHHMMInput(cur);
      setEditDraftValue(rowId, col.key, normalized);
      return;
    }
    const cur = String(draft[col.key] ?? '');
    const normalized = isDayFormat ? autoFormatDayHHMMInput(cur) : autoFormatHHMMInput(cur);
    setDraftValue(col.key, normalized);
  };
  const showEditCell = (rowId: number | null, c: Col) =>
    (mode === 'new' && rowId === null) || (mode === 'edit' && rowId != null && c.editable);
  const getEditCellValue = (row: DayRow, key: string): unknown => {
    const rowDraft = editDrafts[row.id];
    if (rowDraft && key in rowDraft) return rowDraft[key];
    const base = formatDraftForEdit(row);
    return base[key];
  };
  const getMergedRowForDisplay = (row: DayRow): DayRow => {
    const rowDraft = editDrafts[row.id];
    if (!rowDraft) return row;
    return { ...row, ...buildPayloadFromDraft(rowDraft) };
  };
  const moveSelection = useCallback(
    (nextRowId: number | null) => {
      setSelectedRowId(nextRowId);
      if (mode !== 'new') setDraft({});
    },
    [mode]
  );

  const onRecalculateAggregateForGrid = async () => {
    if (!allowAggregateRun || selectedId == null || !selectedEmp?.company_id) return;
    if (recalcWorkDates.length === 0) {
      alert(t('attendanceStatusInquiry.recalcNeedWorkDays'));
      return;
    }
    setRunningAggregate(true);
    setAggregateProgress({ percent: 0, done: 0, total: 0 });
    try {
      await runAttendanceTimeDayAggregateStream(
        {
          date_from: recalcWorkDates[0],
          date_to: recalcWorkDates[recalcWorkDates.length - 1],
          company_id: selectedEmp.company_id,
          employee_ids: [selectedId],
          work_dates: recalcWorkDates,
        },
        (p) => setAggregateProgress(p)
      );
      await loadRows();
      alert(t('attendanceAggregate.success'));
    } catch (e: unknown) {
      const ax = e as { message?: string };
      alert(typeof ax?.message === 'string' ? ax.message : t('attendanceAggregate.runFailed'));
    } finally {
      setRunningAggregate(false);
      setAggregateProgress(null);
    }
  };
  const contextMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      { id: 'add_time', label: t('attendanceStatusInquiry.addTime.menuLabel') },
      { id: 'regular_ot_asking', label: t('additionalOt.regularOtAskingTitle') },
      { id: 'special_ot', label: t('specialOt.menuLabel') },
      { id: 'record_for_leaves', label: t('attendanceStatusInquiry.context.recordForLeaves') },
      { id: 'excel_save', label: t('attendanceStatusInquiry.context.excelSave') },
    ],
    [t]
  );
  const handleContextMenuPick = useCallback(
    (item: ContextMenuItem, menu: ContextMenuState | null) => {
      if (item.id === 'add_time') {
        if (selectedId == null) {
          alert(t('attendanceMaster.pickEmployee'));
          return;
        }
        const raw = (menu?.workDay || '').trim().slice(0, 10);
        const fallback = (dateFrom || '').trim().slice(0, 10);
        const wd = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : '';
        if (!wd) {
          alert(t('attendanceStatusInquiry.addTime.needWorkDay'));
          return;
        }
        if (wd && closedDayMap[wd]) {
          alert(t('attendanceStatusInquiry.payrollClosedBlocked'));
          return;
        }
        setAddTimeWorkDay(wd);
        setAddTimeModalOpen(true);
        return;
      }
      if (item.id === 'regular_ot_asking') {
        if (selectedId == null) {
          alert(t('attendanceMaster.pickEmployee'));
          return;
        }
        if (!can('attendance-additional-ot-manage', 'can_read')) {
          alert(t('permission.noAccess'));
          return;
        }
        const raw = (menu?.workDay || '').trim().slice(0, 10);
        const fallback = (dateFrom || '').trim().slice(0, 10);
        const wd = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : '';
        if (wd && closedDayMap[wd]) {
          alert(t('attendanceStatusInquiry.payrollClosedBlocked'));
          return;
        }
        setRegularOtContextWorkDay(wd);
        setRegularOtModalOpen(true);
        return;
      }
      if (item.id === 'special_ot') {
        if (selectedId == null) {
          alert(t('attendanceMaster.pickEmployee'));
          return;
        }
        if (!can('attendance-additional-ot-manage', 'can_read')) {
          alert(t('permission.noAccess'));
          return;
        }
        const raw = (menu?.workDay || '').trim().slice(0, 10);
        const fallback = (dateFrom || '').trim().slice(0, 10);
        const wd = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : '';
        if (wd && closedDayMap[wd]) {
          alert(t('attendanceStatusInquiry.payrollClosedBlocked'));
          return;
        }
        setSpecialOtContextWorkDay(wd);
        setSpecialOtModalOpen(true);
        return;
      }
      if (item.id === 'record_for_leaves') {
        if (selectedId == null) {
          alert(t('attendanceMaster.pickEmployee'));
          return;
        }
        if (!can('attendance-leave-manage', 'can_read')) {
          alert(t('permission.noAccess'));
          return;
        }
        const raw = (menu?.workDay || '').trim().slice(0, 10);
        const fallback = (dateFrom || '').trim().slice(0, 10);
        const wd = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : '';
        if (!wd) {
          alert(t('attendanceStatusInquiry.addTime.needWorkDay'));
          return;
        }
        if (closedDayMap[wd]) {
          alert(t('attendanceStatusInquiry.payrollClosedBlocked'));
          return;
        }
        setLeaveRecordsContextWorkDay(wd);
        setLeaveRecordsModalOpen(true);
        return;
      }
      if (item.id === 'excel_save') {
        if (selectedId == null) {
          alert(t('attendanceMaster.pickEmployee'));
          return;
        }
        void (async () => {
          try {
            const { downloadAttendanceStatusGridExcel } = await import('@/lib/attendanceStatusInquiryExcelExport');
            const headers = COLS.map((col) => t(col.labelKey));
            const dataRows = rows.map((row) => COLS.map((col) => renderDisplay(row, col)));
            const safeNum = String(selectedEmp?.employee_number ?? selectedId).replace(/[^\w.-]+/g, '_');
            const fn = `attendance-ot-allowance_${safeNum}_${dateFrom}_${dateTo}.xlsx`;
            await downloadAttendanceStatusGridExcel({
              filename: fn,
              sheetName: t('attendanceStatusInquiry.excelSheetName'),
              headers,
              rows: dataRows,
            });
          } catch {
            alert(t('attendanceStatusInquiry.excelSaveError'));
          }
        })();
        return;
      }
    },
    [can, dateFrom, dateTo, renderDisplay, rows, selectedEmp?.employee_number, selectedId, t, closedDayMap]
  );

  if (!allowRead) return <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">{t('permission.noAccess')}</div>;

  return (
    <div className="p-1.5 sm:p-3">
      <AttendanceAggregateBusyOverlay
        open={runningAggregate}
        portalReady={portalReady}
        progress={aggregateProgress}
        t={t}
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3 items-stretch min-h-0 lg:min-h-[min(520px,calc(100vh-5.5rem))]">
        <aside className={cn('lg:col-span-3 bg-white rounded-lg shadow border border-gray-200 overflow-hidden', mode === 'new' && 'opacity-60 pointer-events-none')}>
          <div className="p-3 md:p-4 border-b border-gray-100">
            <div className="grid grid-cols-1 gap-2 mb-2">
              <select className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white" value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setSelectedId(null); }}>
                <option value="">{t('employees.companyFilter.all')}</option>
                {companies.map((c) => <option key={c.id} value={String(c.id)}>{companyLabel(c)}</option>)}
              </select>
              <select className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white" value={employmentStatusFilter} onChange={(e) => setEmploymentStatusFilter(e.target.value as 'active' | 'terminated' | 'all')}>
                <option value="active">{t('employees.status.active')}</option>
                <option value="terminated">{t('employees.status.terminated')}</option>
                <option value="all">{t('employees.filter.status.all')}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg" placeholder={`${t('employees.searchPlaceholder')} / ${t('employees.general.swipeCard')}`} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setSearchTerm(searchInput)} />
              </div>
              <button className="text-xs px-2 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50" onClick={() => void loadEmployees()}>{t('attendanceMaster.refreshList')}</button>
            </div>
          </div>
          <div className="h-[calc(100vh-15rem)] overflow-auto">
            {deptGroups.map((g) => {
              const open = expandedDept.has(g.dept) || searchTerm.trim().length > 0;
              return (
                <div key={g.dept}>
                  <button type="button" className="flex items-center gap-2 w-full text-left px-3 py-2.5 border-b bg-slate-50" onClick={() => setExpandedDept((p) => { const n = new Set(p); if (n.has(g.dept)) n.delete(g.dept); else n.add(g.dept); return n; })}>
                    {open ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronRight className="w-4 h-4 text-indigo-500" />}
                    <span className="text-sm font-semibold text-indigo-950 truncate">{g.dept}</span>
                  </button>
                  {open && g.rows.map((emp) => (
                    <button key={emp.id} type="button" onClick={() => setSelectedId(emp.id)} className={cn('w-full text-left px-3 py-2.5 flex items-center gap-2 border-b hover:bg-gray-50', selectedId === emp.id && 'bg-sky-100 border-l-4 border-l-sky-600')}>
                      <User className="w-4 h-4 text-gray-500" />
                      <div className="text-xs min-w-0 flex-1">
                        <div className="font-semibold text-gray-900 truncate">{emp.name}</div>
                        <div className="text-gray-500 truncate">{emp.employee_number} · {(emp.swipe_card || '-')}</div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="lg:col-span-9 flex flex-col gap-2 min-h-0">
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:p-3 min-h-0 flex-1">
            <div className="flex justify-between items-center">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">{t('attendanceStatusInquiry.title')}</h2>
              <button className="inline-flex items-center gap-1.5 text-xs px-3 py-2 border rounded-lg bg-white" onClick={() => void loadRows()} disabled={rowsLoading}>
                <RefreshCw className={cn('w-3.5 h-3.5', rowsLoading && 'animate-spin')} />{t('attendanceStatusInquiry.reload')}
              </button>
            </div>

            <HrMasterToolbar
              mode={mode}
              listLength={rows.length}
              selectedIndex={selectedRowIndex}
              saving={saving}
              allowAdd={allowCreate}
              allowEdit={allowSave}
              allowDelete={allowDelete}
              allowSave={allowSave || allowCreate}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              onSave={onSave}
              onCancel={onCancel}
              onFirst={() => moveSelection(rows[0]?.id ?? null)}
              onPrev={() => selectedRowIndex > 0 && moveSelection(rows[selectedRowIndex - 1].id)}
              onNext={() => selectedRowIndex >= 0 && selectedRowIndex < rows.length - 1 && moveSelection(rows[selectedRowIndex + 1].id)}
              onLast={() => moveSelection(rows[rows.length - 1]?.id ?? null)}
              t={t}
            />

            <div className="flex items-center gap-3 text-[11px] border border-dashed rounded-md px-2 py-1.5 bg-gray-50 overflow-x-auto whitespace-nowrap">
              <span><span className="text-gray-500">{t('attendanceMaster.division')}:</span> <span className="font-medium">{masterLoading ? '…' : headerDivision}</span></span>
              <span><span className="text-gray-500">{t('attendanceMaster.department')}:</span> <span className="font-medium">{masterLoading ? '…' : headerDept}</span></span>
              <span><span className="text-gray-500">{t('attendanceStatusInquiry.shiftOnSelectedDate')}:</span> <span className="font-medium">{masterLoading ? '…' : headerWorkCalendar}</span></span>
              <span><span className="text-gray-500">{t('attendanceMaster.level')}:</span> <span className="font-medium">{masterLoading ? '…' : headerLevel}</span></span>
              <span><span className="text-gray-500">{t('attendanceMaster.workPlace')}:</span> <span className="font-medium">{masterLoading ? '…' : headerWork}</span></span>
              <span><span className="text-gray-500">{t('attendanceMaster.hireDate')}:</span> <span className="font-medium">{masterLoading ? '…' : headerHireDate}</span></span>
              <span><span className="text-gray-500">{t('attendanceMaster.employmentType')}:</span> <span className="font-medium">{masterLoading ? '…' : headerEmploymentType}</span></span>
              <span><span className="text-gray-500">{t('attendanceMaster.salaryProcessType')}:</span> <span className="font-medium">{masterLoading ? '…' : headerSalaryType}</span></span>
            </div>

            <div className="flex flex-wrap gap-2 border border-gray-200 rounded-md p-2">
              <div className="min-w-[220px] flex-1">
                <span className="text-xs text-gray-600">{t('attendanceStatusInquiry.code')}</span>
                <div className="text-sm font-medium border rounded px-2 py-1.5 bg-gray-50">
                  {selectedEmp
                    ? `${selectedEmp.employee_number} · ${selectedEmp.name} · ${t('employees.general.swipeCard')}: ${selectedEmp.swipe_card || '-'} · ID: ${selectedEmp.id}`
                    : t('attendanceMaster.pickEmployee')}
                </div>
              </div>
              {selectedId && allowAggregateRun ? (
                <button
                  type="button"
                  title={t('attendanceStatusInquiry.recalcAggregateHint')}
                  className="shrink-0 inline-flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[10px] sm:text-xs font-medium border border-slate-700 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 max-w-[5.5rem] sm:max-w-none"
                  disabled={
                    rowsLoading ||
                    runningAggregate ||
                    mode === 'new' ||
                    recalcWorkDates.length === 0 ||
                    !selectedEmp?.company_id
                  }
                  onClick={() => void onRecalculateAggregateForGrid()}
                >
                  <Calculator className="w-4 h-4 shrink-0" aria-hidden />
                  <span className="text-center leading-tight">{t('menu.attendanceAggregate')}</span>
                </button>
              ) : null}
              {selectedId ? <img src={getEmployeePhotoThumbnailUrl(selectedId)} alt="" className="w-12 h-12 rounded border object-cover" /> : null}
              <label className="text-xs text-gray-600"><span className="block">{t('attendanceInquiry.dateFrom')}</span><input type="date" className="border rounded px-2 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
              <label className="text-xs text-gray-600"><span className="block">{t('attendanceInquiry.dateTo')}</span><input type="date" className="border rounded px-2 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
              <button
                type="button"
                className="text-xs px-3 py-2 border border-sky-300 rounded-lg bg-sky-50 text-sky-900 font-medium hover:bg-sky-100"
                disabled={selectedId == null || rowsLoading || mode === 'new'}
                onClick={() => void loadRows()}
              >
                {t('attendanceInquiry.reload')}
              </button>
            </div>

            <div className="attendance-status-inquiry-grid-scroll flex-1 min-h-0 border border-slate-300 rounded-md bg-white shadow-[inset_0_-8px_10px_-8px_rgba(15,23,42,0.06)]">
              <table className="min-w-max w-full text-[10.5px] border-collapse">
                <thead>
                  <tr>
                    {COLS.map((c) => {
                      const stickyLeft = stickyLeftByKey.get(c.key);
                      return (
                        <th
                          key={c.key}
                          className={cn(
                            'sticky top-0 bg-slate-800 text-white px-1 py-1.5 border-b border-gray-300 whitespace-nowrap',
                            c.w,
                            (c.key === 'work_day' || c.key === '__weekday') && 'whitespace-nowrap',
                            stickyLeft != null && 'z-30'
                          )}
                          style={stickyLeft != null ? { left: `${stickyLeft}px` } : undefined}
                        >
                          {t(c.labelKey)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {mode === 'new' && (
                    <tr className="bg-amber-50">
                      {COLS.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            'px-1 py-0.5 border-b',
                            (c.fmt === 'flt' || c.fmt === 'mins') && 'text-center',
                            c.key === 'day_memo' && 'max-w-[14rem] whitespace-nowrap',
                            (c.key === 'work_day' || c.key === '__weekday') && 'whitespace-nowrap',
                            c.key === '__weekday' && 'text-gray-700',
                            stickyLeftByKey.has(c.key) && 'sticky z-20'
                          )}
                          style={stickyLeftByKey.has(c.key) ? { left: `${stickyLeftByKey.get(c.key)}px`, background: 'inherit' } : undefined}
                        >
                          {!c.editable ? (
                            <span
                              className={cn(c.key === '__weekday' ? 'text-gray-700' : 'text-gray-500', c.key === 'day_memo' && 'block truncate')}
                              title={c.key === 'day_memo' ? renderDisplay(draft as Record<string, unknown>, c) : undefined}
                            >
                              {renderDisplay(draft as Record<string, unknown>, c)}
                            </span>
                          ) : c.fmt === 'bool' ? (
                            <input type="checkbox" checked={!!draft[c.key]} onChange={(e) => setDraftValue(c.key, e.target.checked)} />
                          ) : c.fmt === 'date' ? (
                            <input
                              type="text"
                              className="w-full bg-transparent border border-transparent rounded-sm px-1 py-0.5 focus:bg-white focus:border-sky-300"
                              placeholder="YYYY-MM-DD"
                              value={String(draft[c.key] || '')}
                              onChange={(e) => setDraftValue(c.key, e.target.value)}
                            />
                          ) : c.fmt === 'dt' ? (
                            <input type="datetime-local" className="w-full border rounded px-1 py-0.5" value={dtToLocalInput(draft[c.key])} onChange={(e) => setDraftValue(c.key, e.target.value)} />
                          ) : c.key === 'shift_code' ? (
                            <input
                              list={shiftCodeDatalistId}
                              className="w-full border border-slate-300 rounded-sm px-1 py-0.5 text-[10px] bg-white"
                              placeholder={t('attendanceStatusInquiry.col.shift')}
                              value={String(draft[c.key] ?? '')}
                              onChange={(e) => setDraftValue(c.key, normalizeShiftCode(e.target.value))}
                            />
                          ) : (
                            <input
                              className="w-full bg-transparent border border-transparent rounded-sm px-1 py-0.5 focus:bg-white focus:border-sky-300"
                              placeholder={
                                c.fmt === 'mins'
                                  ? c.key === 'leave_without_pay' || c.key === 'leave_time' || c.key === 'absent_time'
                                    ? '0-00:00'
                                    : '00:00'
                                  : undefined
                              }
                              value={
                                String(draft[c.key] ?? '')
                              }
                              onChange={(e) => setDraftFormatted(c, e.target.value)}
                              onBlur={() => normalizeMinsFieldOnBlur(c)}
                              style={{ textAlign: c.fmt === 'flt' ? 'center' : 'inherit' }}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  )}
                  {rows.length === 0 && !rowsLoading ? <tr><td colSpan={COLS.length} className="px-4 py-10 text-center text-gray-500 text-sm">{t('attendanceStatusInquiry.empty')}</td></tr> : null}
                  {rows.map((r, idx) => (
                    <tr
                      key={r.id}
                      className={cn(
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50',
                        classifyDayRow(r, calendarMetaByDate) === 'holiday_legal' && 'bg-rose-50',
                        classifyDayRow(r, calendarMetaByDate) === 'holiday' && 'bg-amber-50',
                        classifyDayRow(r, calendarMetaByDate) === 'weekday' && 'bg-white',
                        selectedRowId === r.id && 'bg-sky-100'
                      )}
                      onClick={() => moveSelection(r.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        moveSelection(r.id);
                        const wd = String(r.work_day ?? '').trim().slice(0, 10);
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          rowId: r.id,
                          workDay: /^\d{4}-\d{2}-\d{2}$/.test(wd) ? wd : undefined,
                        });
                      }}
                    >
                      {COLS.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            'px-1 py-0.5 border-b',
                            (c.fmt === 'flt' || c.fmt === 'mins') && 'text-center',
                            c.key === 'day_memo' && 'max-w-[14rem] whitespace-nowrap',
                            (c.key === 'work_day' || c.key === '__weekday') && 'whitespace-nowrap',
                            c.key === '__weekday' && 'text-gray-700',
                            stickyLeftByKey.has(c.key) && 'sticky z-20'
                          )}
                          style={stickyLeftByKey.has(c.key) ? { left: `${stickyLeftByKey.get(c.key)}px`, background: 'inherit' } : undefined}
                        >
                          {showEditCell(r.id, c) ? (
                            c.fmt === 'bool' ? (
                              <input
                                type="checkbox"
                                checked={!!getEditCellValue(r, c.key)}
                                onChange={(e) => setEditDraftValue(r.id, c.key, e.target.checked)}
                              />
                            ) : c.fmt === 'date' ? (
                              <input
                                type="text"
                                className="w-full bg-transparent border border-transparent rounded-sm px-1 py-0.5 focus:bg-white focus:border-sky-300"
                                placeholder="YYYY-MM-DD"
                                value={String(getEditCellValue(r, c.key) || '')}
                                onChange={(e) => setEditDraftValue(r.id, c.key, e.target.value)}
                              />
                            ) : c.fmt === 'dt' ? (
                              <input
                                type="datetime-local"
                                className="w-full border rounded px-1 py-0.5"
                                value={dtToLocalInput(getEditCellValue(r, c.key))}
                                onChange={(e) => setEditDraftValue(r.id, c.key, e.target.value)}
                              />
                            ) : c.key === 'shift_code' ? (
                              <input
                                list={shiftCodeDatalistId}
                                className="w-full border border-slate-300 rounded-sm px-1 py-0.5 text-[10px] bg-white"
                                placeholder={t('attendanceStatusInquiry.col.shift')}
                                value={String(getEditCellValue(r, c.key) ?? '')}
                                onChange={(e) => setEditDraftValue(r.id, c.key, normalizeShiftCode(e.target.value))}
                              />
                            ) : (
                              <input
                                className="w-full bg-transparent border border-transparent rounded-sm px-1 py-0.5 focus:bg-white focus:border-sky-300"
                                placeholder={
                                  c.fmt === 'mins'
                                    ? c.key === 'leave_without_pay' || c.key === 'leave_time' || c.key === 'absent_time'
                                      ? '0-00:00'
                                      : '00:00'
                                    : undefined
                                }
                                value={
                                  String(getEditCellValue(r, c.key) ?? '')
                                }
                                onChange={(e) => setDraftFormatted(c, e.target.value, r.id)}
                                onBlur={() => normalizeMinsFieldOnBlur(c, r.id)}
                                style={{ textAlign: c.fmt === 'flt' ? 'center' : 'inherit' }}
                              />
                            )
                          ) : c.key === 'day_memo' ? (
                            <span className="block truncate" title={renderDisplay(getMergedRowForDisplay(r), c)}>
                              {renderDisplay(getMergedRowForDisplay(r), c)}
                            </span>
                          ) : c.key === 'work_day' ? (
                            <span className="inline-block max-w-full truncate" title={renderDisplay(getMergedRowForDisplay(r), c)}>
                              {renderDisplay(getMergedRowForDisplay(r), c)}
                            </span>
                          ) : (
                            renderDisplay(getMergedRowForDisplay(r), c)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id={shiftCodeDatalistId}>
                {shiftCodeOptions.map((opt) => (
                  <option key={opt.code} value={opt.code} label={opt.label} />
                ))}
              </datalist>
            </div>
            {contextMenu && (
              <div
                className="fixed z-50 min-w-[220px] max-w-[300px] max-h-[60vh] overflow-y-auto rounded-md border border-gray-300 bg-white shadow-xl py-1 text-xs text-gray-800"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                role="menu"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {contextMenuItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
                    onClick={() => {
                      const menu = contextMenu;
                      setContextMenu(null);
                      handleContextMenuPick(item, menu);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {selectedId != null && addTimeModalOpen && selectedEmp ? (
              <AttendanceStatusInquiryAddTimeModal
                key={`${selectedId}-${addTimeWorkDay}`}
                open={addTimeModalOpen}
                onClose={() => setAddTimeModalOpen(false)}
                employeeId={selectedId}
                employeeNumber={selectedEmp.employee_number}
                employeeName={selectedEmp.name}
                defaultSwipeCard={selectedEmp.swipe_card}
                initialWorkDay={addTimeWorkDay}
                canWrite={allowCreate || allowSave}
                canDelete={allowDelete}
                onSaved={() => void loadRows()}
              />
            ) : null}
            {regularOtModalOpen && selectedEmp ? (
              <RegularOtAskingModal
                open={regularOtModalOpen}
                onClose={() => setRegularOtModalOpen(false)}
                employee={selectedEmp}
                inquiryDateFrom={dateFrom}
                inquiryDateTo={dateTo}
                contextWorkDay={regularOtContextWorkDay}
                writeLocked={Boolean(regularOtContextWorkDay && closedDayMap[regularOtContextWorkDay])}
                onRecordsChanged={() => void loadRows()}
              />
            ) : null}
            {specialOtModalOpen && selectedEmp ? (
              <SpecialOtModal
                open={specialOtModalOpen}
                onClose={() => setSpecialOtModalOpen(false)}
                employee={selectedEmp}
                inquiryDateFrom={dateFrom}
                inquiryDateTo={dateTo}
                contextWorkDay={specialOtContextWorkDay}
                writeLocked={Boolean(specialOtContextWorkDay && closedDayMap[specialOtContextWorkDay])}
                onRecordsChanged={() => void loadRows()}
              />
            ) : null}
            {leaveRecordsModalOpen && selectedEmp ? (
              <AttendanceLeaveRecordsModal
                open={leaveRecordsModalOpen}
                onClose={() => setLeaveRecordsModalOpen(false)}
                employee={selectedEmp}
                contextWorkDay={leaveRecordsContextWorkDay}
                writeLocked={Boolean(leaveRecordsContextWorkDay && closedDayMap[leaveRecordsContextWorkDay])}
                onLeavesChanged={() => void loadRows()}
              />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
