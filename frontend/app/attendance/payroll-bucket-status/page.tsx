'use client';

import type { ReactNode } from 'react';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Search, User } from 'lucide-react';
import { apiClient, getEmployeePhotoThumbnailUrl } from '@/lib/api';
import { fmtDayHmLeave, fmtHmTotalMinutes, fmtMoney, fmtShortYmd } from '@/lib/payrollBucketFormat';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';

type PayrollBucketStatusViewMode = 'yearly' | 'period';

type Company = {
  id: number;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
  company_code: string;
};

type EmpRow = {
  id: number;
  company_id?: number | null;
  employee_number: string;
  name: string;
  department?: string | null;
  swipe_card?: string | null;
  status?: string | null;
};

type RefItem = { code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null };
type RefByCompany = Record<number, Record<string, RefItem[]>>;

type BucketRow = Record<string, unknown>;

function companyLabel(c: Company, locale: string): string {
  const name =
    locale === 'th'
      ? c.name_thai || c.name_eng || c.name_kor
      : locale === 'en'
        ? c.name_eng || c.name_kor || c.name_thai
        : c.name_kor || c.name_eng || c.name_thai;
  return (name || c.company_code).trim();
}

/** 집계 현황: 연~OT기간 6열 고정, OT 열은 총합계 → 평일 → 휴일 순. */
export const PAYROLL_STATUS_FROZEN_KEYS = [
  'colYear',
  'colMonth',
  'colPeriod',
  'colPayType',
  'colRangeMain',
  'colRangeOt',
] as const;

export const PAYROLL_STATUS_ATTENDANCE_KEYS = [
  'colWorking',
  'colAbsent',
  'colHoliday',
  'colDaysWorked',
  'colLate',
  'colEarly',
  'colLeavePay',
  'colLeaveNoPay',
] as const;

export const PAYROLL_STATUS_OT_TOTAL_KEYS = [
  'colOth1',
  'colOth2',
  'colOth3',
  'colOth4',
  'colOth5',
  'colOth6',
  'colOthb',
  'colOtPayLocal',
] as const;

export const PAYROLL_STATUS_OT_WEEKDAY_KEYS = [
  'colOth1Weekday',
  'colOth2Weekday',
  'colOth3Weekday',
  'colOth4Weekday',
  'colOth5Weekday',
  'colOth6Weekday',
  'colOthbWeekday',
  'colOtPayLocalWeekday',
] as const;

export const PAYROLL_STATUS_OT_HOLIDAY_KEYS = [
  'colOth1Holiday',
  'colOth2Holiday',
  'colOth3Holiday',
  'colOth4Holiday',
  'colOth5Holiday',
  'colOth6Holiday',
  'colOthbHoliday',
  'colOtPayLocalHoliday',
] as const;

export const PAYROLL_STATUS_ALLOWANCE_KEYS = [
  'colShift',
  'colFood',
  'colSpecial',
  'colFuel',
  'colStanding',
  'colOther',
  'colShiftOt',
  'colShiftOverOt',
  'colFoodOt',
  'colFoodOverOt',
  'colSpecialOt',
] as const;

export const PAYROLL_STATUS_SCROLL_KEYS = [
  ...PAYROLL_STATUS_ATTENDANCE_KEYS,
  ...PAYROLL_STATUS_OT_TOTAL_KEYS,
  ...PAYROLL_STATUS_OT_WEEKDAY_KEYS,
  ...PAYROLL_STATUS_OT_HOLIDAY_KEYS,
  ...PAYROLL_STATUS_ALLOWANCE_KEYS,
] as const;

export type PayrollStatusColKey =
  | (typeof PAYROLL_STATUS_FROZEN_KEYS)[number]
  | (typeof PAYROLL_STATUS_SCROLL_KEYS)[number];

const FROZEN_WIDTHS_REM = [2.75, 2.5, 5.75, 4.25, 10.25, 10.25] as const;

const FROZEN_LEFT_REM = FROZEN_WIDTHS_REM.map((_, i) =>
  FROZEN_WIDTHS_REM.slice(0, i).reduce((a, b) => a + b, 0)
);

function thBgForScrollKey(k: PayrollStatusColKey): string {
  if ((PAYROLL_STATUS_ATTENDANCE_KEYS as readonly string[]).includes(k)) return 'bg-slate-100/95';
  if ((PAYROLL_STATUS_OT_TOTAL_KEYS as readonly string[]).includes(k)) return 'bg-amber-50/95';
  if ((PAYROLL_STATUS_OT_WEEKDAY_KEYS as readonly string[]).includes(k)) return 'bg-sky-50/95';
  if ((PAYROLL_STATUS_OT_HOLIDAY_KEYS as readonly string[]).includes(k)) return 'bg-rose-50/90';
  return 'bg-violet-50/85';
}

function tdBgForScrollKey(k: PayrollStatusColKey): string {
  if ((PAYROLL_STATUS_ATTENDANCE_KEYS as readonly string[]).includes(k)) return 'bg-white group-hover:bg-slate-50';
  if ((PAYROLL_STATUS_OT_TOTAL_KEYS as readonly string[]).includes(k)) return 'bg-amber-50/35 group-hover:bg-amber-50/65';
  if ((PAYROLL_STATUS_OT_WEEKDAY_KEYS as readonly string[]).includes(k)) return 'bg-sky-50/30 group-hover:bg-sky-50/55';
  if ((PAYROLL_STATUS_OT_HOLIDAY_KEYS as readonly string[]).includes(k)) return 'bg-rose-50/30 group-hover:bg-rose-50/50';
  return 'bg-violet-50/20 group-hover:bg-violet-50/40';
}

export function renderPayrollStatusCell(row: BucketRow, k: PayrollStatusColKey, t: (key: string) => string, locale: string): ReactNode {
  switch (k) {
    case 'colYear':
      return String(row.calendar_year ?? '');
    case 'colMonth':
      return String(row.calendar_month ?? '');
    case 'colPeriod':
      return String(row.period_label ?? '');
    case 'colPayType':
      return row.pay_type === 'monthly' ? t('attendancePayrollBucket.payTypeMonthly') : t('attendancePayrollBucket.payTypeDaily');
    case 'colRangeMain':
      return (
        <>
          {fmtShortYmd(row.range_main_start)} ~ {fmtShortYmd(row.range_main_end)}
        </>
      );
    case 'colRangeOt':
      return (
        <>
          {fmtShortYmd(row.range_ot_start)} ~ {fmtShortYmd(row.range_ot_end)}
        </>
      );
    case 'colWorking':
      return fmtHmTotalMinutes(row.working_minutes);
    case 'colAbsent':
      return fmtHmTotalMinutes(row.absent_minutes);
    case 'colHoliday':
      return String(row.holiday_days ?? 0);
    case 'colDaysWorked':
      return String(row.days_worked ?? 0);
    case 'colLate':
      return fmtHmTotalMinutes(row.late_minutes);
    case 'colEarly':
      return fmtHmTotalMinutes(row.early_minutes);
    case 'colLeavePay':
      return fmtDayHmLeave(row.leave_with_pay_minutes);
    case 'colLeaveNoPay':
      return fmtDayHmLeave(row.leave_without_pay_minutes);
    case 'colOth1':
      return fmtHmTotalMinutes(row.oth1);
    case 'colOth2':
      return fmtHmTotalMinutes(row.oth2);
    case 'colOth3':
      return fmtHmTotalMinutes(row.oth3);
    case 'colOth4':
      return fmtHmTotalMinutes(row.oth4);
    case 'colOth5':
      return fmtHmTotalMinutes(row.oth5);
    case 'colOth6':
      return fmtHmTotalMinutes(row.oth6);
    case 'colOth1Weekday':
      return fmtHmTotalMinutes(row.oth1_weekday);
    case 'colOth1Holiday':
      return fmtHmTotalMinutes(row.oth1_holiday);
    case 'colOth2Weekday':
      return fmtHmTotalMinutes(row.oth2_weekday);
    case 'colOth2Holiday':
      return fmtHmTotalMinutes(row.oth2_holiday);
    case 'colOth3Weekday':
      return fmtHmTotalMinutes(row.oth3_weekday);
    case 'colOth3Holiday':
      return fmtHmTotalMinutes(row.oth3_holiday);
    case 'colOth4Weekday':
      return fmtHmTotalMinutes(row.oth4_weekday);
    case 'colOth4Holiday':
      return fmtHmTotalMinutes(row.oth4_holiday);
    case 'colOth5Weekday':
      return fmtHmTotalMinutes(row.oth5_weekday);
    case 'colOth5Holiday':
      return fmtHmTotalMinutes(row.oth5_holiday);
    case 'colOth6Weekday':
      return fmtHmTotalMinutes(row.oth6_weekday);
    case 'colOth6Holiday':
      return fmtHmTotalMinutes(row.oth6_holiday);
    case 'colOthb':
      return fmtMoney(row.othb, locale);
    case 'colOthbWeekday':
      return fmtMoney(row.othb_weekday, locale);
    case 'colOthbHoliday':
      return fmtMoney(row.othb_holiday, locale);
    case 'colShift':
      return fmtMoney(row.shift_allowance, locale);
    case 'colFood':
      return fmtMoney(row.food_allowance, locale);
    case 'colSpecial':
      return fmtMoney(row.special_allowance, locale);
    case 'colFuel':
      return fmtMoney(row.fuel_allowance, locale);
    case 'colStanding':
      return fmtMoney(row.standing_allowance, locale);
    case 'colOther':
      return fmtMoney(row.other_allowance, locale);
    case 'colShiftOt':
      return fmtMoney(row.shift_ot_allowance, locale);
    case 'colShiftOverOt':
      return fmtMoney(row.shift_over_ot_allowance, locale);
    case 'colFoodOt':
      return fmtMoney(row.food_ot_allowance, locale);
    case 'colFoodOverOt':
      return fmtMoney(row.food_over_ot_allowance, locale);
    case 'colSpecialOt':
      return fmtMoney(row.special_ot_allowance, locale);
    case 'colOtPayLocal':
      return fmtMoney(row.overtime_pay_local, locale);
    case 'colOtPayLocalWeekday':
      return fmtMoney(row.overtime_pay_local_weekday, locale);
    case 'colOtPayLocalHoliday':
      return fmtMoney(row.overtime_pay_local_holiday, locale);
    default:
      return '';
  }
}

export function AttendancePayrollBucketStatusView({ mode = 'yearly' }: { mode?: PayrollBucketStatusViewMode }) {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-allowance-status-inquiry', 'can_read');

  const today = new Date();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<'active' | 'terminated' | 'all'>('active');
  const deferredEmploymentStatus = useDeferredValue(employmentStatusFilter);
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth() + 1);

  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [refsByCompany, setRefsByCompany] = useState<RefByCompany>({});
  const [expandedDept, setExpandedDept] = useState<Set<string>>(() => new Set());

  const [loadingList, setLoadingList] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [rows, setRows] = useState<BucketRow[]>([]);
  const [error, setError] = useState('');
  const [masterBundle, setMasterBundle] = useState<Record<string, unknown> | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);

  useEffect(() => {
    void apiClient
      .getMyCompanies()
      .then(({ data }) => setCompanies((data as Company[]) || []))
      .catch(() => setCompanies([]));
  }, []);

  const refLabel = useCallback(
    (it: RefItem) =>
      locale === 'ko'
        ? it.name_kor || it.name_eng || it.name_thai || it.code
        : locale === 'en'
          ? it.name_eng || it.name_kor || it.name_thai || it.code
          : it.name_thai || it.name_kor || it.name_eng || it.code,
    [locale]
  );

  const ensureRefs = useCallback(
    async (companyIdNum: number) => {
      if (refsByCompany[companyIdNum]) return;
      try {
        const cats = ['department', 'position', 'division', 'level', 'work_place', 'employment_type', 'employee_type'] as const;
        const vals = await Promise.all(cats.map((c) => apiClient.getEmployeeReferenceItems(c, companyIdNum)));
        const next: Record<string, RefItem[]> = {};
        cats.forEach((c, i) => {
          next[c] = Array.isArray(vals[i].data) ? (vals[i].data as RefItem[]) : [];
        });
        setRefsByCompany((p) => ({ ...p, [companyIdNum]: next }));
      } catch {
        setRefsByCompany((p) => ({ ...p, [companyIdNum]: {} }));
      }
    },
    [refsByCompany]
  );

  const mapCode = useCallback(
    (companyIdNum: number | null | undefined, cat: string, code: string | null | undefined, fallback = '-') => {
      const raw = (code || '').trim();
      if (!raw) return fallback;
      const items = companyIdNum != null ? refsByCompany[companyIdNum]?.[cat] || [] : [];
      const hit = items.find((x) => x.code === raw);
      return hit ? refLabel(hit) : raw;
    },
    [refsByCompany, refLabel]
  );

  const loadEmployees = useCallback(async () => {
    setLoadingList(true);
    try {
      const cid = companyFilter ? parseInt(companyFilter, 10) : undefined;
      const { data } = await apiClient.getEmployees(cid && Number.isFinite(cid) ? { company_id: cid } : undefined);
      setEmployees((data as EmpRow[]) || []);
      setSelectedId(null);
    } catch {
      setEmployees([]);
      setSelectedId(null);
    } finally {
      setLoadingList(false);
    }
  }, [companyFilter]);

  useEffect(() => {
    if (!allowRead) return;
    void loadEmployees();
  }, [allowRead, loadEmployees]);

  useEffect(() => {
    const ids = Array.from(new Set(employees.map((e) => e.company_id).filter((x): x is number => !!x)));
    ids.forEach((id) => void ensureRefs(id));
  }, [employees, ensureRefs]);

  useEffect(() => {
    setExpandedDept(new Set());
  }, [companyFilter]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return employees
      .filter((e) => {
        const st = e.status || 'active';
        if (deferredEmploymentStatus !== 'all' && st !== deferredEmploymentStatus) return false;
        if (!q) return true;
        return (
          (e.name || '').toLowerCase().includes(q) ||
          (e.employee_number || '').toLowerCase().includes(q) ||
          (e.swipe_card || '').toLowerCase().includes(q) ||
          (e.department || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.employee_number.localeCompare(b.employee_number));
  }, [employees, deferredEmploymentStatus, searchTerm]);

  const deptGroups = useMemo(() => {
    const m = new Map<string, EmpRow[]>();
    for (const e of filtered) {
      const d = mapCode(e.company_id ?? null, 'department', e.department, t('attendanceMaster.deptUnassigned'));
      m.set(d, [...(m.get(d) || []), e]);
    }
    return Array.from(m.entries()).map(([dept, rows]) => ({
      dept,
      rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [filtered, mapCode, t]);

  const selectedEmp = useMemo(
    () => (selectedId != null ? employees.find((e) => e.id === selectedId) : null),
    [employees, selectedId]
  );

  useEffect(() => {
    if (selectedId == null) {
      setMasterBundle(null);
      return;
    }
    let cancel = false;
    setMasterLoading(true);
    void apiClient
      .getEmployeeAttendanceMaster(selectedId)
      .then(({ data }) => {
        if (!cancel) setMasterBundle((data as Record<string, unknown>) || null);
      })
      .catch(() => {
        if (!cancel) setMasterBundle(null);
      })
      .finally(() => {
        if (!cancel) setMasterLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [selectedId]);

  const headerEmployee = (masterBundle?.employee as Record<string, unknown> | undefined) || null;
  const headerBasic = (masterBundle?.basic as Record<string, unknown> | undefined) || null;
  const headerDivision = selectedEmp
    ? mapCode(selectedEmp.company_id ?? null, 'division', String(headerEmployee?.division || ''), '—')
    : '—';
  const headerDept = selectedEmp
    ? mapCode(selectedEmp.company_id ?? null, 'department', String(headerEmployee?.department || ''), '—')
    : '—';
  const headerWorkCalendar = selectedEmp ? String(headerBasic?.master_shiftwork ?? '').trim() || '—' : '—';
  const headerLevel = selectedEmp
    ? mapCode(selectedEmp.company_id ?? null, 'level', String(headerEmployee?.job_level || ''), '—')
    : '—';
  const headerWork = selectedEmp
    ? mapCode(selectedEmp.company_id ?? null, 'work_place', String(headerEmployee?.work_place || ''), '—')
    : '—';
  const headerHireDate = selectedEmp ? String(headerEmployee?.hire_date || '').slice(0, 10) || '—' : '—';
  const headerEmploymentType = selectedEmp
    ? mapCode(selectedEmp.company_id ?? null, 'employment_type', String(headerEmployee?.employment_type || ''), '—')
    : '—';
  const headerSalaryType = selectedEmp
    ? mapCode(selectedEmp.company_id ?? null, 'employee_type', String(headerEmployee?.salary_process_type || ''), '—')
    : '—';

  const selectedStatusCompanyId = useMemo(() => {
    if (selectedId == null) return NaN;
    const co = employees.find((e) => e.id === selectedId)?.company_id;
    return co != null && Number.isFinite(Number(co)) ? Number(co) : NaN;
  }, [employees, selectedId]);

  const loadStatus = useCallback(async () => {
    setError('');
    setRows([]);
    if (selectedId == null || !Number.isFinite(selectedStatusCompanyId)) {
      setError(t('attendancePayrollBucket.statusNeedSelection'));
      return;
    }
    setLoadingStatus(true);
    try {
      const { data } = await apiClient.getPayrollBucketYearlyStatus({
        company_id: selectedStatusCompanyId,
        employee_id: selectedId,
        calendar_year: calendarYear,
      });
      const r = (data as { rows?: BucketRow[] })?.rows || [];
      const filteredRows =
        mode === 'period'
          ? r.filter((x) => Number(x.calendar_month ?? 0) === Number(calendarMonth))
          : r;
      setRows(filteredRows);
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || '')
          : '';
      setError(msg || t('attendancePayrollBucket.errorLoadStatus'));
    } finally {
      setLoadingStatus(false);
    }
  }, [calendarMonth, calendarYear, mode, selectedId, selectedStatusCompanyId, t]);

  useEffect(() => {
    if (!allowRead || selectedId == null || !Number.isFinite(selectedStatusCompanyId)) return;
    void loadStatus();
  }, [allowRead, calendarMonth, calendarYear, loadStatus, selectedId, selectedStatusCompanyId]);

  if (!allowRead) {
    return <div className="p-6 text-sm text-slate-600">{t('attendancePayrollBucket.noPermission')}</div>;
  }

  const thBase =
    'border-b border-slate-200 px-2 py-2 text-[11px] font-semibold text-slate-700 whitespace-nowrap align-middle';
  const thFrozen =
    `${thBase} sticky top-0 z-[42] bg-slate-100 border-r border-slate-300 shadow-[2px_0_6px_-3px_rgba(15,23,42,0.18)] text-center`;
  const thSection =
    `${thBase} sticky top-0 z-[28] text-center border-b-2 border-slate-300 text-slate-800 tracking-tight`;
  const thSub =
    `${thBase} sticky top-[2.75rem] z-[28] text-left border-b border-slate-200`;
  const tdBase = 'border-b border-slate-100 px-2 py-1.5 text-[11px] text-slate-800 whitespace-nowrap';
  const tdCls = `${tdBase} align-top`;
  const tdFrozen = `${tdBase} sticky z-[18] border-r border-slate-200 bg-white group-hover:bg-slate-50 shadow-[2px_0_6px_-3px_rgba(15,23,42,0.08)] text-center align-middle`;

  return (
    <div className="flex flex-col h-[min(100vh-4rem,100%)] min-h-0 gap-3 p-3 md:p-5">
      <div className="flex flex-1 min-h-0 gap-3">
        <aside className="w-full max-w-[320px] shrink-0 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-2.5 sm:p-3 border-b border-slate-100 space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <select
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white"
                value={companyFilter}
                onChange={(e) => {
                  setCompanyFilter(e.target.value);
                  setRows([]);
                }}
              >
                <option value="">{t('employees.companyFilter.all')}</option>
                {companies.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {companyLabel(c, locale)}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white"
                value={employmentStatusFilter}
                onChange={(e) => setEmploymentStatusFilter(e.target.value as 'active' | 'terminated' | 'all')}
              >
                <option value="active">{t('employees.status.active')}</option>
                <option value="terminated">{t('employees.status.terminated')}</option>
                <option value="all">{t('employees.filter.status.all')}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setSearchTerm(searchInput)}
                  placeholder={`${t('employees.searchPlaceholder')} / ${t('employees.general.swipeCard')}`}
                  className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                className="text-xs px-2 py-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 shrink-0 whitespace-nowrap"
                onClick={() => void loadEmployees()}
              >
                {t('attendanceMaster.refreshList')}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[min(520px,calc(100vh-14rem))]">
            {loadingList ? (
              <div className="flex justify-center py-8 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : deptGroups.length === 0 ? (
              <div className="p-4 text-xs text-slate-500">{t('attendancePayrollBucket.emptyEmployeeList')}</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {deptGroups.map((g) => {
                  const open = expandedDept.has(g.dept) || searchTerm.trim().length > 0;
                  return (
                    <div key={g.dept}>
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full text-left px-3 py-2.5 border-b border-slate-100 bg-slate-50 hover:bg-slate-100/80"
                        onClick={() =>
                          setExpandedDept((p) => {
                            const n = new Set(p);
                            if (n.has(g.dept)) n.delete(g.dept);
                            else n.add(g.dept);
                            return n;
                          })
                        }
                      >
                        {open ? (
                          <ChevronDown className="w-4 h-4 text-indigo-500 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-indigo-500 shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-indigo-950 truncate">{g.dept}</span>
                      </button>
                      {open &&
                        g.rows.map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setSelectedId(e.id)}
                            className={cn(
                              'w-full text-left px-3 py-2.5 flex items-center gap-2 border-b border-slate-100 text-xs transition-colors',
                              selectedId === e.id
                                ? 'bg-sky-100 border-l-4 border-l-sky-600 text-slate-900'
                                : 'hover:bg-slate-50 text-slate-800'
                            )}
                          >
                            <User className="w-4 h-4 text-slate-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-900 truncate">{e.name}</div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {e.employee_number} · {e.swipe_card || '-'}
                              </div>
                            </div>
                          </button>
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="shrink-0 p-2 sm:p-3 border-b border-slate-100 space-y-2">
            {selectedEmp ? (
              <>
                <div className="flex items-center gap-3 text-[11px] border border-dashed border-slate-200 rounded-md px-2 py-1.5 bg-slate-50 overflow-x-auto whitespace-nowrap">
                  <span>
                    <span className="text-slate-500">{t('attendanceMaster.division')}:</span>{' '}
                    <span className="font-medium text-slate-900">{masterLoading ? '…' : headerDivision}</span>
                  </span>
                  <span>
                    <span className="text-slate-500">{t('attendanceMaster.department')}:</span>{' '}
                    <span className="font-medium text-slate-900">{masterLoading ? '…' : headerDept}</span>
                  </span>
                  <span>
                    <span className="text-slate-500">{t('attendanceStatusInquiry.shiftOnSelectedDate')}:</span>{' '}
                    <span className="font-medium text-slate-900">{masterLoading ? '…' : headerWorkCalendar}</span>
                  </span>
                  <span>
                    <span className="text-slate-500">{t('attendanceMaster.level')}:</span>{' '}
                    <span className="font-medium text-slate-900">{masterLoading ? '…' : headerLevel}</span>
                  </span>
                  <span>
                    <span className="text-slate-500">{t('attendanceMaster.workPlace')}:</span>{' '}
                    <span className="font-medium text-slate-900">{masterLoading ? '…' : headerWork}</span>
                  </span>
                  <span>
                    <span className="text-slate-500">{t('attendanceMaster.hireDate')}:</span>{' '}
                    <span className="font-medium text-slate-900">{masterLoading ? '…' : headerHireDate}</span>
                  </span>
                  <span>
                    <span className="text-slate-500">{t('attendanceMaster.employmentType')}:</span>{' '}
                    <span className="font-medium text-slate-900">{masterLoading ? '…' : headerEmploymentType}</span>
                  </span>
                  <span>
                    <span className="text-slate-500">{t('attendanceMaster.salaryProcessType')}:</span>{' '}
                    <span className="font-medium text-slate-900">{masterLoading ? '…' : headerSalaryType}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-2 border border-slate-200 rounded-md p-2 bg-white">
                  <div className="min-w-[220px] flex-1">
                    <span className="text-xs text-slate-600">{t('attendanceStatusInquiry.code')}</span>
                    <div className="text-sm font-medium border border-slate-200 rounded px-2 py-1.5 bg-slate-50 text-slate-900">
                      {`${selectedEmp.employee_number} · ${selectedEmp.name} · ${t('employees.general.swipeCard')}: ${selectedEmp.swipe_card || '-'} · ID: ${selectedEmp.id}`}
                    </div>
                  </div>
                  {selectedId ? (
                    <img
                      src={getEmployeePhotoThumbnailUrl(selectedId)}
                      alt=""
                      className="w-12 h-12 rounded border border-slate-200 object-cover shrink-0"
                    />
                  ) : null}
                  <label className="text-xs text-slate-600">
                    <span className="block mb-0.5">{t('attendancePayrollBucket.year')}</span>
                    <input
                      type="number"
                      min={2000}
                      max={2100}
                      value={calendarYear}
                      onChange={(e) => setCalendarYear(Number(e.target.value))}
                      className="border border-slate-200 rounded px-2 py-1.5 text-sm w-[7rem]"
                    />
                  </label>
                  {mode === 'period' ? (
                    <label className="text-xs text-slate-600">
                      <span className="block mb-0.5">{t('attendancePayrollBucket.month')}</span>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={calendarMonth}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setCalendarMonth(Number.isFinite(next) ? Math.min(12, Math.max(1, next)) : 1);
                        }}
                        className="border border-slate-200 rounded px-2 py-1.5 text-sm w-[6rem]"
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs px-3 py-2 border border-sky-300 rounded-lg bg-sky-50 text-sky-900 font-medium hover:bg-sky-100 disabled:opacity-50"
                    disabled={loadingStatus || !Number.isFinite(selectedStatusCompanyId)}
                    onClick={() => void loadStatus()}
                  >
                    {loadingStatus ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t('attendanceInquiry.reload')}
                      </span>
                    ) : (
                      t('attendanceInquiry.reload')
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500 py-1">{t('attendancePayrollBucket.pickEmployee')}</div>
            )}
          </div>

          {error ? <div className="shrink-0 px-3 py-2 text-xs text-red-600 bg-red-50">{error}</div> : null}

          <div className="flex-1 overflow-auto min-h-0">
            {!selectedId ? (
              <div className="p-8 text-center text-sm text-slate-400">{t('attendancePayrollBucket.pickEmployee')}</div>
            ) : loadingStatus ? (
              <div className="flex justify-center py-16 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {mode === 'period'
                  ? t('attendancePayrollBucket.emptyStatusByMonth')
                  : t('attendancePayrollBucket.emptyStatus')}
              </div>
            ) : (
              <table className="min-w-[3600px] w-full border-collapse">
                <thead>
                  <tr>
                    {PAYROLL_STATUS_FROZEN_KEYS.map((k, i) => (
                      <th
                        key={k}
                        rowSpan={2}
                        className={thFrozen}
                        style={{
                          left: `${FROZEN_LEFT_REM[i]}rem`,
                          minWidth: `${FROZEN_WIDTHS_REM[i]}rem`,
                          width: `${FROZEN_WIDTHS_REM[i]}rem`,
                        }}
                      >
                        {t(`attendancePayrollBucket.${k}`)}
                      </th>
                    ))}
                    <th
                      colSpan={PAYROLL_STATUS_ATTENDANCE_KEYS.length}
                      className={cn(thSection, 'bg-slate-200/90')}
                    >
                      {t('attendancePayrollBucket.sectionAttendance')}
                    </th>
                    <th
                      colSpan={PAYROLL_STATUS_OT_TOTAL_KEYS.length}
                      className={cn(thSection, 'bg-amber-100/95 text-amber-950')}
                    >
                      {t('attendancePayrollBucket.sectionOtTotal')}
                    </th>
                    <th
                      colSpan={PAYROLL_STATUS_OT_WEEKDAY_KEYS.length}
                      className={cn(thSection, 'bg-sky-100/95 text-sky-950')}
                    >
                      {t('attendancePayrollBucket.sectionOtWeekday')}
                    </th>
                    <th
                      colSpan={PAYROLL_STATUS_OT_HOLIDAY_KEYS.length}
                      className={cn(thSection, 'bg-rose-100/90 text-rose-950')}
                    >
                      {t('attendancePayrollBucket.sectionOtHoliday')}
                    </th>
                    <th
                      colSpan={PAYROLL_STATUS_ALLOWANCE_KEYS.length}
                      className={cn(thSection, 'bg-violet-100/85 text-violet-950')}
                    >
                      {t('attendancePayrollBucket.sectionAllowance')}
                    </th>
                  </tr>
                  <tr>
                    {PAYROLL_STATUS_SCROLL_KEYS.map((k) => (
                      <th key={k} className={cn(thSub, thBgForScrollKey(k))}>
                        {t(`attendancePayrollBucket.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={`${row.calendar_year}-${row.calendar_month}-${row.period_label}-${idx}`} className="group">
                      {PAYROLL_STATUS_FROZEN_KEYS.map((k, i) => (
                        <td
                          key={k}
                          className={tdFrozen}
                          style={{
                            left: `${FROZEN_LEFT_REM[i]}rem`,
                            minWidth: `${FROZEN_WIDTHS_REM[i]}rem`,
                            width: `${FROZEN_WIDTHS_REM[i]}rem`,
                          }}
                        >
                          {renderPayrollStatusCell(row, k, t, locale)}
                        </td>
                      ))}
                      {PAYROLL_STATUS_SCROLL_KEYS.map((k) => (
                        <td key={k} className={cn(tdCls, tdBgForScrollKey(k))}>
                          {renderPayrollStatusCell(row, k, t, locale)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AttendancePayrollBucketStatusPage() {
  return <AttendancePayrollBucketStatusView mode="yearly" />;
}
