'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter, FileDown, ChevronDown } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { downloadTextFile } from '@/lib/downloadTextFile';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

type DayRow = Record<string, unknown> & {
  id: number;
  employee_id: number;
  work_day?: string | null;
  employee_number?: string | null;
  employee_name?: string | null;
  employee_department?: string | null;
};
/**
 * 앞부분: 근태/OT/수당관리(엑셀 양식)과 동일한 열 순서 — 사번·성명·부서는 목록 식별용으로 앞에 둠.
 * 이후: DB 확장 필드.
 */
const TABLE_COLUMN_KEYS = [
  'companyName',
  'empNo',
  'empName',
  'dept',
  'workDay',
  'shift',
  'workTime',
  'timeIn',
  'timeOut',
  'late',
  'early',
  'leaveMin',
  'absentMin',
  'workDayFrac',
  'oth1',
  'oth2',
  'oth3',
  'oth4',
  'oth5',
  'oth6',
  'shiftAllw',
  'mealAllw',
  'otMealAllw',
  'special',
  'fuelAllw',
  'standingAllw',
  'otherAllw',
  'leaveWithoutPay',
] as const;

type ColKey = (typeof TABLE_COLUMN_KEYS)[number];

function numOrEmpty(v: unknown): string {
  if (v == null || v === '') return '-';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '-';
}

/** OT 분 → 표시용 시간:분 (예: 10 → 0:10, 90 → 1:30) */
function minsToHHMM(v: unknown): string {
  if (v == null || v === '') return '-';
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return '-';
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function minsToDayHHMM(v: unknown): string {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return '-';
  const minutesPerDay = 480;
  const days = Math.floor(n / minutesPerDay);
  const rem = n % minutesPerDay;
  const h = Math.floor(rem / 60);
  const m = rem % 60;
  return `${days}-${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function strOrDash(v: unknown): string {
  if (v == null || v === '') return '-';
  return String(v).trim() || '-';
}

function fmtDtShort(iso: unknown): string {
  if (!iso) return '-';
  try {
    const d = new Date(String(iso));
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '-';
  }
}

function firstFiniteNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = Number(row[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function shiftTimeText(start: unknown, end: unknown): string {
  const s = String(start ?? '').trim();
  const e = String(end ?? '').trim();
  if (!s && !e) return '-';
  if (s && e) return `${s} - ${e}`;
  return s || e;
}

function getRowDisplayValues(
  row: DayRow,
  t: (k: string, f?: string) => string,
  departmentNameByCode: Map<string, string>,
  departmentNameByCompany: Record<number, Map<string, string>>,
  companyNameById: Map<number, string>
): Record<ColKey, string> {
  const rawDept = String(row.employee_department || '').trim();
  const coId = Number(row.company_id);
  const scopedDeptMap = Number.isFinite(coId) ? departmentNameByCompany[coId] : undefined;
  const deptNameFromRow =
    String(
      row.employee_department_name ||
        row.department_name ||
        row.department_name_kor ||
        row.department_label ||
        ''
    ).trim() || '';
  const deptLabel = rawDept
    ? scopedDeptMap?.get(rawDept) || departmentNameByCode.get(rawDept) || deptNameFromRow || rawDept
    : deptNameFromRow || '-';
  const companyName = Number.isFinite(coId) ? companyNameById.get(coId) || String(row.company_id ?? '-') : '-';
  const fuelAllw = firstFiniteNumber(row, ['fuel_allowance', 'oil_allowance', 'gas_allowance', 'refuel_allowance']);
  const standingAllw = firstFiniteNumber(row, ['standing_allowance', 'stand_allowance', 'standing_work_allowance']);
  const otherAllw = firstFiniteNumber(row, ['other_allowance', 'other_allw', 'etc_allowance']);
  const mealAllw = firstFiniteNumber(row, ['meal_allowance', 'meal_allw', 'meal_amt']);
  const otMealAllw = firstFiniteNumber(row, ['ot_meal_allowance', 'ot_meal_allw', 'meal_ot_allowance']);
  const absentDays = Number(row.absent_days);
  const absentDisplay =
    Number.isFinite(absentDays) && absentDays > 0
      ? absentDays.toFixed(2)
      : numOrEmpty(row.absent_time);
  return {
    companyName: strOrDash(companyName),
    empNo: strOrDash(row.employee_number),
    empName: strOrDash(row.employee_name),
    dept: strOrDash(deptLabel),
    workDay: row.work_day ? String(row.work_day).slice(0, 10) : '-',
    shift: strOrDash(row.shift_code),
    workTime: shiftTimeText(row.st_in, row.st_out),
    timeIn: fmtDtShort(row.time_in),
    timeOut: fmtDtShort(row.time_out),
    late: minsToHHMM(row.late_time_in),
    early: minsToHHMM(row.before_time_out),
    leaveMin: minsToDayHHMM(row.leave_time),
    absentMin: absentDisplay,
    workDayFrac: row.work_day_count != null && String(row.work_day_count).trim() !== '' ? String(row.work_day_count) : '-',
    oth1: minsToHHMM(row.oth1),
    oth2: minsToHHMM(row.oth2),
    oth3: minsToHHMM(row.oth3),
    oth4: minsToHHMM(row.oth4),
    oth5: minsToHHMM(row.oth5),
    oth6: minsToHHMM(row.oth6),
    shiftAllw: numOrEmpty(row.shift_allowance),
    mealAllw: mealAllw == null ? '-' : String(mealAllw),
    otMealAllw: otMealAllw == null ? '-' : String(otMealAllw),
    special: numOrEmpty(row.special_allowance),
    fuelAllw: fuelAllw == null ? '-' : String(fuelAllw),
    standingAllw: standingAllw == null ? '-' : String(standingAllw),
    otherAllw: otherAllw == null ? '-' : String(otherAllw),
    leaveWithoutPay: minsToDayHHMM(row.leave_without_pay),
  };
}

/** 근태/OT/수당관리 그리드와 동일한 라벨 키 */
const EXCEL_FIELD_LABELS: Partial<Record<ColKey, string>> = {
  companyName: '회사명',
  empNo: '사번',
  empName: '성명',
  dept: '부서',
  workDay: 'attendanceStatusInquiry.col.date',
  shift: 'attendanceStatusInquiry.col.shift',
  workTime: '근무시간(교대)',
  timeIn: 'attendanceStatusInquiry.col.timeIn',
  timeOut: 'attendanceStatusInquiry.col.timeOut',
  late: 'attendanceStatusInquiry.col.late',
  early: 'attendanceStatusInquiry.col.earlyLeave',
  leaveWithoutPay: 'attendanceStatusInquiry.col.leaveW',
  leaveMin: 'attendanceStatusInquiry.col.leave',
  absentMin: 'attendanceStatusInquiry.col.absent',
  workDayFrac: 'attendanceStatusInquiry.col.workDay',
  oth1: 'attendanceStatusInquiry.col.ot1',
  oth2: 'attendanceStatusInquiry.col.ot15',
  oth3: 'attendanceStatusInquiry.col.ot2',
  oth4: 'attendanceStatusInquiry.col.ot25',
  oth5: 'attendanceStatusInquiry.col.ot3',
  oth6: 'attendanceStatusInquiry.col.ot6',
  shiftAllw: 'attendanceStatusInquiry.col.shiftAllw',
  mealAllw: '식대',
  otMealAllw: 'OT식대',
  special: '특별수당',
  fuelAllw: '유류비',
  standingAllw: '서서일하는 수당',
  otherAllw: '기타 수당',
};

function columnHeaderLabel(k: ColKey, t: (k: string, f?: string) => string): string {
  const raw = EXCEL_FIELD_LABELS[k];
  if (!raw) return k;
  return raw.includes('.') ? t(raw) : raw;
}

function cellClassForColumn(key: ColKey): string {
  if (key === 'oth1' || key === 'oth2' || key === 'oth3' || key === 'oth4' || key === 'oth5' || key === 'oth6') {
    return 'px-3 py-2 text-xs text-gray-700 min-w-[3.25rem] max-w-[6rem] tabular-nums align-top';
  }
  return 'px-3 py-2 text-xs text-gray-700 min-w-[4.5rem] max-w-[10rem] truncate align-top';
}

export default function AttendanceAllowanceStatusInquiryPage() {
  const { t } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-allowance-status-inquiry', 'can_read');

  const [items, setItems] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [status, setStatus] = useState<'active' | 'all' | 'terminated' | 'inactive'>('active');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [appliedSearchText, setAppliedSearchText] = useState('');
  const [departmentOptions, setDepartmentOptions] = useState<Array<{ code: string; label: string }>>([]);
  const [departmentNameByCompany, setDepartmentNameByCompany] = useState<Record<number, Map<string, string>>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${last.getFullYear()}-${p(last.getMonth() + 1)}-${p(last.getDate())}`;
  });
  const [companies, setCompanies] = useState<{ id: number; name_kor?: string | null; company_code: string }[]>([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [allItemsForFilter, setAllItemsForFilter] = useState<DayRow[] | null>(null);
  const [allItemsLoading, setAllItemsLoading] = useState(false);
  const [allItemsQueryKey, setAllItemsQueryKey] = useState('');
  const departmentNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    departmentOptions.forEach((d) => {
      const code = String(d.code || '').trim();
      const label = String(d.label || '').trim();
      if (code && label) map.set(code, label);
    });
    return map;
  }, [departmentOptions]);
  const companyNameById = useMemo(() => {
    const map = new Map<number, string>();
    companies.forEach((c) => {
      const label = String(c.name_kor || c.company_code || '').trim();
      if (Number.isFinite(Number(c.id)) && label) map.set(Number(c.id), label);
    });
    return map;
  }, [companies]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await apiClient.getCompanies();
        if (!alive) return;
        setCompanies(Array.isArray(data) ? data : []);
      } catch {
        if (alive) setCompanies([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setDepartmentFilter('');
  }, [companyId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const co = companyId.trim() === '' ? undefined : Number(companyId);
      if (co == null || !Number.isFinite(co) || co < 1) {
        if (alive) setDepartmentOptions([]);
        return;
      }
      try {
        const { data } = await apiClient.getEmployeeReferenceItems('department', co);
        if (!alive) return;
        const rows = Array.isArray(data) ? (data as Array<{ code?: string; name_kor?: string; name_eng?: string; name_thai?: string }>) : [];
        const list = rows
          .map((r) => {
            const code = String(r.code || '').trim();
            if (!code) return null;
            const label = String(r.name_kor || r.name_eng || r.name_thai || code).trim() || code;
            return { code, label };
          })
          .filter((v): v is { code: string; label: string } => v != null);
        setDepartmentOptions(list);
        setDepartmentNameByCompany((prev) => {
          const map = new Map<string, string>();
          list.forEach((x) => map.set(x.code, x.label));
          return { ...prev, [co]: map };
        });
      } catch {
        if (alive) setDepartmentOptions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [companyId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!items.length) return;
      const companyIds = Array.from(
        new Set(
          items
            .map((row) => Number(row.company_id))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      );
      const missing = companyIds.filter((id) => !departmentNameByCompany[id]);
      if (missing.length === 0) return;

      for (const co of missing) {
        try {
          const { data } = await apiClient.getEmployeeReferenceItems('department', co);
          if (!alive) return;
          const rows = Array.isArray(data)
            ? (data as Array<{ code?: string; name_kor?: string; name_eng?: string; name_thai?: string }>)
            : [];
          const map = new Map<string, string>();
          rows.forEach((r) => {
            const code = String(r.code || '').trim();
            if (!code) return;
            const label = String(r.name_kor || r.name_eng || r.name_thai || code).trim() || code;
            map.set(code, label);
          });
          setDepartmentNameByCompany((prev) => ({ ...prev, [co]: map }));
        } catch {
          /* noop */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [items, departmentNameByCompany]);

  const loadList = useCallback(
    async (nextPage?: number) => {
      setLoading(true);
      setError('');
      try {
        const co = companyId.trim() === '' ? undefined : Number(companyId);
        if (co !== undefined && (!Number.isFinite(co) || co < 1)) {
          setError(t('attendanceAllowanceStatus.invalidCompany'));
          setItems([]);
          return;
        }
        const { data } = await apiClient.getAttendanceTimeDayAll({
          company_id: co,
          department: departmentFilter.trim() || undefined,
          status,
          search: appliedSearchText.trim() || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page: nextPage ?? page,
          page_size: pageSize,
        });
        const bundle = (data as unknown as { items?: DayRow[]; total?: number }) || {};
        setItems(Array.isArray(bundle.items) ? bundle.items : []);
        setTotalCount(Number(bundle.total) || 0);
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(typeof msg === 'string' ? msg : t('attendanceAllowanceStatus.loadFailed'));
        setItems([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    [companyId, departmentFilter, status, appliedSearchText, dateFrom, dateTo, page, pageSize, t]
  );

  const filterQueryKey = useMemo(
    () => JSON.stringify({ companyId, departmentFilter, status, appliedSearchText, dateFrom, dateTo }),
    [companyId, departmentFilter, status, appliedSearchText, dateFrom, dateTo]
  );

  const loadAllRowsForFilter = useCallback(async () => {
    if (allItemsLoading && allItemsQueryKey === filterQueryKey) return;
    setAllItemsLoading(true);
    try {
      const co = companyId.trim() === '' ? undefined : Number(companyId);
      const fetchPageSize = 1000;
      let nextPage = 1;
      let expectedTotal = Number.POSITIVE_INFINITY;
      const all: DayRow[] = [];

      while (all.length < expectedTotal) {
        const { data } = await apiClient.getAttendanceTimeDayAll({
          company_id: co,
          department: departmentFilter.trim() || undefined,
          status,
          search: appliedSearchText.trim() || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page: nextPage,
          page_size: fetchPageSize,
        });
        const bundle = (data as unknown as { items?: DayRow[]; total?: number }) || {};
        const chunk = Array.isArray(bundle.items) ? bundle.items : [];
        const total = Number(bundle.total);
        expectedTotal = Number.isFinite(total) && total >= 0 ? total : all.length + chunk.length;
        all.push(...chunk);
        if (chunk.length < fetchPageSize) break;
        nextPage += 1;
      }
      setAllItemsForFilter(all);
      setAllItemsQueryKey(filterQueryKey);
    } catch {
      setAllItemsForFilter(null);
      setAllItemsQueryKey(filterQueryKey);
    } finally {
      setAllItemsLoading(false);
    }
  }, [
    allItemsLoading,
    allItemsQueryKey,
    filterQueryKey,
    companyId,
    departmentFilter,
    status,
    appliedSearchText,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    if (!allowRead) return;
    void loadList(page);
  }, [allowRead, loadList]);

  useEffect(() => {
    setPage(1);
    setAllItemsForFilter(null);
    setAllItemsQueryKey('');
  }, [companyId, departmentFilter, status, appliedSearchText, dateFrom, dateTo, pageSize]);

  const hasColumnFilter = useMemo(
    () => Object.keys(columnFilters).some((k) => (columnFilters[k] ?? []).length > 0),
    [columnFilters]
  );

  useEffect(() => {
    if (!hasColumnFilter) return;
    if (allItemsForFilter && allItemsQueryKey === filterQueryKey) return;
    void loadAllRowsForFilter();
  }, [hasColumnFilter, allItemsForFilter, allItemsQueryKey, filterQueryKey, loadAllRowsForFilter]);

  const pageSlice = items;
  const sourceItems = hasColumnFilter && allItemsForFilter ? allItemsForFilter : pageSlice;

  useEffect(() => {
    if (!openFilterKey) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(target)) {
        setOpenFilterKey(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [openFilterKey]);

  const filteredItems = useMemo(() => {
    if (Object.keys(columnFilters).every((k) => !columnFilters[k]?.length)) return pageSlice;
    return sourceItems.filter((row) => {
      const v = getRowDisplayValues(row, t, departmentNameByCode, departmentNameByCompany, companyNameById);
      return TABLE_COLUMN_KEYS.every((key) => {
        const selected = columnFilters[key];
        if (!selected || selected.length === 0) return true;
        const cellVal = String(v[key] ?? '-').trim();
        return selected.includes(cellVal);
      });
    });
  }, [pageSlice, sourceItems, columnFilters, t, departmentNameByCode, departmentNameByCompany, companyNameById]);

  const effectiveTotal = hasColumnFilter ? filteredItems.length : totalCount;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const startItem = effectiveTotal === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, effectiveTotal);
  const pagedFilteredItems = useMemo(() => {
    if (!hasColumnFilter) return filteredItems;
    const start = (safePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [hasColumnFilter, filteredItems, safePage, pageSize]);

  const uniqueValuesByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    TABLE_COLUMN_KEYS.forEach((key) => {
      const set = new Set<string>();
      sourceItems.forEach((row) => {
        const v = getRowDisplayValues(row, t, departmentNameByCode, departmentNameByCompany, companyNameById);
        const val = String(v[key] ?? '-').trim();
        if (val) set.add(val);
      });
      map[key] = Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
    });
    return map;
  }, [sourceItems, t, departmentNameByCode, departmentNameByCompany, companyNameById]);

  const toggleColumnFilter = (key: string, value: string) => {
    setColumnFilters((prev) => {
      const arr = prev[key] ?? [];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      if (next.length === 0) {
        const u = { ...prev };
        delete u[key];
        return u;
      }
      return { ...prev, [key]: next };
    });
  };

  const clearColumnFilter = (key: string) => {
    setColumnFilters((prev) => {
      const u = { ...prev };
      delete u[key];
      return u;
    });
    setOpenFilterKey(null);
  };

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (!allowRead) {
    return (
      <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">
        {t('permission.noAccess')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">{t('attendanceAllowanceStatus.title')}</h1>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="flex-1 min-w-0 text-sm text-gray-600">{t('attendanceAllowanceStatus.subtitle')}</p>
          <button
            type="button"
            onClick={() => {
              const header = TABLE_COLUMN_KEYS.map((k) => columnHeaderLabel(k, t));
              const rows = filteredItems.map((row) => {
                const v = getRowDisplayValues(row, t, departmentNameByCode, departmentNameByCompany, companyNameById);
                return TABLE_COLUMN_KEYS.map((k) => v[k] ?? '-');
              });
              const lines = [header.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
              downloadTextFile(`attendance-allowance-status-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'));
            }}
            className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 text-sm inline-flex items-center justify-center gap-1 shrink-0 w-full sm:w-auto"
          >
            <FileDown className="w-4 h-4" />
            {t('attendanceAllowanceStatus.csvExport')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-4 overflow-x-auto">
          <div className="flex items-center gap-3 whitespace-nowrap min-w-max">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{t('appList.filter.title')}</span>
            </div>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[10rem] shrink-0"
            >
              <option value="">{t('attendanceAllowanceStatus.allCompanies')}</option>
              {companies.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {(c.name_kor || c.company_code).trim()} ({c.company_code})
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm shrink-0"
            >
              <option value="active">{t('attendanceAllowanceStatus.statusActive')}</option>
              <option value="all">{t('attendanceAllowanceStatus.statusAll')}</option>
              <option value="terminated">{t('attendanceAllowanceStatus.statusTerminated')}</option>
              <option value="inactive">{t('attendanceAllowanceStatus.statusInactive')}</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm shrink-0"
            />
            <span className="text-gray-400">~</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm shrink-0"
            />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[10rem] bg-white shrink-0"
            >
              <option value="">{t('attendanceMaster.department', '부서 전체')}</option>
              {departmentOptions.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const kw = searchText.trim();
                  setAppliedSearchText(kw);
                  setPage(1);
                  void loadList(1);
                }
              }}
              placeholder="이름/사번 검색"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40 min-w-[8rem] shrink-0"
            />
            <button
              type="button"
              onClick={() => {
                const kw = searchText.trim();
                setAppliedSearchText(kw);
                setPage(1);
                void loadList(1);
              }}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm shrink-0"
            >
              {t('appList.filter.refresh')}
            </button>
          </div>

          {!loading && (
            <div className="flex items-center gap-3 ml-auto whitespace-nowrap min-w-max">
              <span className="text-sm text-gray-600">
                {t('appList.pagination.summary').replace('{total}', String(effectiveTotal)).replace('{start}', String(startItem)).replace('{end}', String(endItem))}
                {hasColumnFilter && allItemsLoading && (
                  <span className="ml-1 text-amber-600">({t('common.loading')})</span>
                )}
                {filteredItems.length !== sourceItems.length && (
                  <span className="ml-1 text-blue-600">{t('appList.pagination.filtered').replace('{count}', String(filteredItems.length))}</span>
                )}
              </span>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                {t('appList.pagination.perPage')}
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {t('appList.pagination.countUnit').replace('{count}', String(n))}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1, safePage - 1);
                    setPage(next);
                    if (!hasColumnFilter) void loadList(next);
                  }}
                  disabled={safePage <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.prev')}
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(totalPages, safePage + 1);
                    setPage(next);
                    if (!hasColumnFilter) void loadList(next);
                  }}
                  disabled={safePage >= totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-100" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-gray-500">{t('common.loading')}</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{t('attendanceAllowanceStatus.empty')}</div>
        ) : (
          <>
            <div className="max-h-[70vh] overflow-auto relative">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap bg-gray-50 border-b border-gray-200">
                      {t('appList.table.no')}
                    </th>
                    {TABLE_COLUMN_KEYS.map((key) => {
                      const label = columnHeaderLabel(key, t);
                      const selectedList = columnFilters[key] ?? [];
                      const hasFilter = selectedList.length > 0;
                      const options = uniqueValuesByKey[key] ?? [];
                      return (
                        <th
                          key={key}
                          className="px-3 py-2 text-left text-xs font-medium text-gray-600 bg-gray-50 border-b border-gray-200 align-bottom whitespace-nowrap"
                        >
                          <div className="flex items-center gap-1">
                            <span>{label}</span>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setOpenFilterKey((k) => (k === key ? null : key))}
                                className={`p-0.5 rounded hover:bg-gray-200 ${hasFilter ? 'text-blue-600' : 'text-gray-400'}`}
                                title={t('appList.filter.title')}
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                              {openFilterKey === key && (
                                <div
                                  ref={filterPopoverRef}
                                  className="absolute left-0 top-full mt-1 z-20 w-56 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-2"
                                >
                                  <div className="px-2 pb-2 border-b border-gray-100 flex justify-between items-center">
                                    <span className="text-xs font-medium text-gray-600">{t('appList.filter.title')}</span>
                                    <button
                                      type="button"
                                      onClick={() => clearColumnFilter(key)}
                                      className="text-xs text-blue-600 hover:underline"
                                    >
                                      {t('common.reset')}
                                    </button>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto py-1">
                                    {options.length === 0 ? (
                                      <p className="px-2 py-1 text-xs text-gray-500">{t('appList.filter.noValues')}</p>
                                    ) : (
                                      options.map((val) => (
                                        <label key={val} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={selectedList.includes(val)}
                                            onChange={() => toggleColumnFilter(key, val)}
                                            className="rounded border-gray-300"
                                          />
                                          <span className="text-xs truncate flex-1" title={val}>
                                            {val || t('common.emptyValue')}
                                          </span>
                                        </label>
                                      ))
                                    )}
                                  </div>
                                  {hasFilter && (
                                    <p className="px-2 pt-1 text-xs text-gray-500">
                                      {t('appList.filter.selectedCount').replace('{count}', String(selectedList.length))}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pagedFilteredItems.map((row, index) => {
                    const v = getRowDisplayValues(row, t, departmentNameByCode, departmentNameByCompany, companyNameById);
                    const rowNo = Math.max(1, effectiveTotal - ((safePage - 1) * pageSize + index));
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-600">{rowNo}</td>
                        {TABLE_COLUMN_KEYS.map((key) => (
                          <td key={key} className={cellClassForColumn(key)} title={v[key]}>
                            {v[key]}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!loading && (
              <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 bg-gray-50">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">
                    {t('appList.pagination.summary')
                      .replace('{total}', String(effectiveTotal))
                      .replace('{start}', String(startItem))
                      .replace('{end}', String(endItem))}
                  </span>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    {t('appList.pagination.perPage')}
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {t('appList.pagination.countUnit').replace('{count}', String(n))}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(1, safePage - 1);
                      setPage(next);
                      if (!hasColumnFilter) void loadList(next);
                    }}
                    disabled={safePage <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('common.prev')}
                  </button>
                  <span className="px-3 py-1.5 text-sm text-gray-600">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.min(totalPages, safePage + 1);
                      setPage(next);
                      if (!hasColumnFilter) void loadList(next);
                    }}
                    disabled={safePage >= totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('common.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
