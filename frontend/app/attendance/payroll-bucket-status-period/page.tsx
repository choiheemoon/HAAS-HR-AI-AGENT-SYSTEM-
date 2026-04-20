'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import { fmtDayHmLeave, fmtHmTotalMinutes, fmtMoney, fmtShortYmd } from '@/lib/payrollBucketFormat';
import {
  PAYROLL_STATUS_FROZEN_KEYS,
  PAYROLL_STATUS_SCROLL_KEYS,
  renderPayrollStatusCell,
  type PayrollStatusColKey,
} from '@/app/attendance/payroll-bucket-status/page';

type Company = {
  id: number;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
  company_code: string;
};

type RefItem = { code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null };
type Row = Record<string, unknown>;

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const ALL_COL_KEYS = [...PAYROLL_STATUS_FROZEN_KEYS, ...PAYROLL_STATUS_SCROLL_KEYS] as const;
type ColKey = (typeof ALL_COL_KEYS)[number];
type PrimaryColKey = 'company' | 'empNo' | 'empName' | 'dept';
const PRIMARY_COL_KEYS: PrimaryColKey[] = ['company', 'empNo', 'empName', 'dept'];
type FilterColKey = PrimaryColKey | ColKey;

function cellText(row: Row, k: ColKey, t: (key: string) => string, locale: string): string {
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
      return `${fmtShortYmd(row.range_main_start)} ~ ${fmtShortYmd(row.range_main_end)}`;
    case 'colRangeOt':
      return `${fmtShortYmd(row.range_ot_start)} ~ ${fmtShortYmd(row.range_ot_end)}`;
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
      return '-';
  }
}

function companyLabel(c: Company, locale: string): string {
  const name =
    locale === 'th'
      ? c.name_thai || c.name_eng || c.name_kor
      : locale === 'en'
        ? c.name_eng || c.name_kor || c.name_thai
        : c.name_kor || c.name_eng || c.name_thai;
  return (name || c.company_code).trim();
}

export default function AttendancePayrollBucketStatusPeriodPage() {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-allowance-status-inquiry', 'can_read');

  const today = new Date();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState<'active' | 'terminated' | 'inactive' | 'all'>('active');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [department, setDepartment] = useState('');
  const [departmentOptions, setDepartmentOptions] = useState<Array<{ code: string; label: string }>>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [departmentNameByCompany, setDepartmentNameByCompany] = useState<Record<number, Map<string, string>>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const companyNameById = useMemo(() => {
    const m = new Map<number, string>();
    companies.forEach((c) => m.set(c.id, companyLabel(c, locale)));
    return m;
  }, [companies, locale]);

  useEffect(() => {
    void apiClient
      .getMyCompanies()
      .then(({ data }) => setCompanies((data as Company[]) || []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    const co = Number(companyId);
    if (!Number.isFinite(co) || co < 1) {
      setDepartmentOptions([]);
      setDepartment('');
      return;
    }
    void apiClient
      .getEmployeeReferenceItems('department', co)
      .then(({ data }) => {
        const list = (Array.isArray(data) ? data : [])
          .map((r) => {
            const it = r as RefItem;
            const code = String(it.code || '').trim();
            if (!code) return null;
            const label =
              locale === 'th'
                ? it.name_thai || it.name_eng || it.name_kor || code
                : locale === 'en'
                  ? it.name_eng || it.name_kor || it.name_thai || code
                  : it.name_kor || it.name_eng || it.name_thai || code;
            return { code, label: String(label).trim() || code };
          })
          .filter((x): x is { code: string; label: string } => x != null);
        setDepartmentOptions(list);
        setDepartmentNameByCompany((prev) => {
          const map = new Map<string, string>();
          list.forEach((x) => map.set(x.code, x.label));
          return { ...prev, [co]: map };
        });
      })
      .catch(() => setDepartmentOptions([]));
    setDepartment('');
  }, [companyId, locale]);

  useEffect(() => {
    const cids = Array.from(
      new Set(items.map((r) => Number(r.company_id)).filter((id) => Number.isFinite(id) && id > 0))
    );
    const missing = cids.filter((id) => !departmentNameByCompany[id]);
    if (missing.length === 0) return;
    missing.forEach((co) => {
      void apiClient
        .getEmployeeReferenceItems('department', co)
        .then(({ data }) => {
          const list = (Array.isArray(data) ? data : [])
            .map((r) => {
              const it = r as RefItem;
              const code = String(it.code || '').trim();
              if (!code) return null;
              const label =
                locale === 'th'
                  ? it.name_thai || it.name_eng || it.name_kor || code
                  : locale === 'en'
                    ? it.name_eng || it.name_kor || it.name_thai || code
                    : it.name_kor || it.name_eng || it.name_thai || code;
              return { code, label: String(label).trim() || code };
            })
            .filter((x): x is { code: string; label: string } => x != null);
          setDepartmentNameByCompany((prev) => {
            const map = new Map<string, string>();
            list.forEach((x) => map.set(x.code, x.label));
            return { ...prev, [co]: map };
          });
        })
        .catch(() => undefined);
    });
  }, [items, departmentNameByCompany, locale]);

  const departmentLabel = useCallback(
    (row: Row): string => {
      const co = Number(row.company_id);
      const code = String(row.department || '').trim();
      const fromRow = String(row.department_name || '').trim();
      if (!code) return fromRow || '-';
      const map = Number.isFinite(co) ? departmentNameByCompany[co] : undefined;
      return map?.get(code) || fromRow || code;
    },
    [departmentNameByCompany]
  );

  const primaryCellText = useCallback(
    (row: Row, k: PrimaryColKey): string => {
      if (k === 'company') return companyNameById.get(Number(row.company_id)) || '-';
      if (k === 'empNo') return String(row.employee_number || '-');
      if (k === 'empName') return String(row.employee_name || '-');
      return departmentLabel(row);
    },
    [companyNameById, departmentLabel]
  );

  const loadList = useCallback(
    async (nextPage?: number) => {
      setLoading(true);
      setError('');
      try {
        const co = companyId.trim() ? Number(companyId) : undefined;
        const { data } = await apiClient.getPayrollBucketPeriodStatusAll({
          company_id: Number.isFinite(co) && co! > 0 ? co : undefined,
          calendar_year: year,
          calendar_month: month,
          status,
          department: department.trim() || undefined,
          search: search.trim() || undefined,
          page: nextPage ?? page,
          page_size: pageSize,
        });
        const b = (data || {}) as { items?: Row[]; total?: number };
        setItems(Array.isArray(b.items) ? b.items : []);
        setTotal(Number(b.total) || 0);
      } catch (e: unknown) {
        const err = e as { response?: { status?: number; data?: { detail?: string } } };
        const msg = err?.response?.data?.detail;
        if (Number(err?.response?.status || 0) === 404) {
          setError(
            '급여마스터현황(기간) API를 찾을 수 없습니다. 백엔드를 최신 코드로 재시작한 뒤 다시 조회해주세요.'
          );
        } else {
          setError(typeof msg === 'string' ? msg : t('attendancePayrollBucket.errorLoadStatus'));
        }
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [companyId, year, month, status, department, search, page, pageSize, t]
  );

  useEffect(() => {
    if (!allowRead) return;
    void loadList(page);
  }, [allowRead, loadList, page]);

  useEffect(() => {
    setPage(1);
  }, [companyId, status, year, month, department, search, pageSize]);

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

  const uniqueValuesByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    [...PRIMARY_COL_KEYS, ...ALL_COL_KEYS].forEach((k) => {
      const s = new Set<string>();
      items.forEach((row) => {
        if (PRIMARY_COL_KEYS.includes(k as PrimaryColKey)) {
          s.add(primaryCellText(row, k as PrimaryColKey));
        } else {
          s.add(cellText(row, k as ColKey, t, locale));
        }
      });
      map[k] = Array.from(s).sort((a, b) => a.localeCompare(b, 'ko'));
    });
    return map;
  }, [items, locale, primaryCellText, t]);

  const filteredItems = useMemo(() => {
    if (Object.keys(columnFilters).length === 0) return items;
    return items.filter((row) =>
      [...PRIMARY_COL_KEYS, ...ALL_COL_KEYS].every((k) => {
        const selected = columnFilters[k];
        if (!selected || selected.length === 0) return true;
        const v = PRIMARY_COL_KEYS.includes(k as PrimaryColKey)
          ? primaryCellText(row, k as PrimaryColKey)
          : cellText(row, k as ColKey, t, locale);
        return selected.includes(v);
      })
    );
  }, [columnFilters, items, locale, primaryCellText, t]);

  const toggleColumnFilter = (key: FilterColKey, value: string) => {
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

  const clearColumnFilter = (key: FilterColKey) => {
    setColumnFilters((prev) => {
      const u = { ...prev };
      delete u[key];
      return u;
    });
    setOpenFilterKey(null);
  };

  if (!allowRead) {
    return <div className="p-6 text-sm text-slate-600">{t('attendancePayrollBucket.noPermission')}</div>;
  }

  const effectiveTotal = Object.keys(columnFilters).length > 0 ? filteredItems.length : total;
  const totalPages = Math.max(1, Math.ceil((effectiveTotal || 0) / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems =
    Object.keys(columnFilters).length > 0
      ? filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize)
      : filteredItems;

  const renderPager = () => (
    <div className="flex items-center gap-2">
      <select
        value={pageSize}
        onChange={(e) => setPageSize(Number(e.target.value))}
        className="border border-gray-300 rounded px-2 py-1 text-sm"
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {t('appList.pagination.countUnit').replace('{count}', String(n))}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setPage(Math.max(1, safePage - 1))}
        disabled={safePage <= 1}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
      >
        {t('common.prev')}
      </button>
      <span className="px-2 text-sm text-gray-600">
        {safePage} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => setPage(Math.min(totalPages, safePage + 1))}
        disabled={safePage >= totalPages}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
      >
        {t('common.next')}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">{t('menu.attendancePayrollBucketStatusPeriod')}</h1>
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
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[10rem]"
            >
              <option value="">{t('attendanceAllowanceStatus.allCompanies')}</option>
              {companies.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {companyLabel(c, locale)}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="active">{t('attendanceAllowanceStatus.statusActive')}</option>
              <option value="all">{t('attendanceAllowanceStatus.statusAll')}</option>
              <option value="terminated">{t('attendanceAllowanceStatus.statusTerminated')}</option>
              <option value="inactive">{t('attendanceAllowanceStatus.statusInactive')}</option>
            </select>
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24"
            />
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-20"
            />
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[10rem] bg-white"
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearch(searchInput);
              }}
              placeholder={t('attendanceAllowanceStatus.searchPlaceholder')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44"
            />
            <button
              type="button"
              onClick={() => {
                setSearch(searchInput);
                void loadList(1);
              }}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              {t('attendanceInquiry.reload')}
            </button>
          </div>
          {renderPager()}
        </div>
        {error ? <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-100">{error}</div> : null}
        {loading ? (
          <div className="p-12 text-center text-gray-500">{t('common.loading')}</div>
        ) : pageItems.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{t('attendancePayrollBucket.emptyStatusByMonth')}</div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-[2200px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-left text-xs text-gray-600 whitespace-nowrap">No</th>
                  {PRIMARY_COL_KEYS.map((key) => {
                    const selectedList = columnFilters[key] ?? [];
                    const hasFilter = selectedList.length > 0;
                    const options = uniqueValuesByKey[key] ?? [];
                    const label =
                      key === 'company'
                        ? t('attendancePayrollBucket.company')
                        : key === 'empNo'
                          ? t('attendancePayrollBucket.colEmployeeNo')
                          : key === 'empName'
                            ? t('attendancePayrollBucket.colEmployeeName')
                            : t('attendancePayrollBucket.colDepartment');
                    return (
                      <th key={key} className="px-2 py-2 text-left text-xs text-gray-600 whitespace-nowrap">
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
                              </div>
                            )}
                          </div>
                        </div>
                      </th>
                    );
                  })}
                  {ALL_COL_KEYS.map((key) => {
                    const selectedList = columnFilters[key] ?? [];
                    const hasFilter = selectedList.length > 0;
                    const options = uniqueValuesByKey[key] ?? [];
                    return (
                      <th key={key} className="px-2 py-2 text-left text-xs text-gray-600 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span>{t(`attendancePayrollBucket.${key}`)}</span>
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
                              </div>
                            )}
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  <th className="px-2 py-1 text-[11px] text-gray-500 bg-gray-100" colSpan={5 + PAYROLL_STATUS_FROZEN_KEYS.length}>
                    기본
                  </th>
                  <th className="px-2 py-1 text-[11px] text-gray-700 bg-slate-100" colSpan={8}>
                    {t('attendancePayrollBucket.sectionAttendance')}
                  </th>
                  <th className="px-2 py-1 text-[11px] text-amber-800 bg-amber-100" colSpan={8}>
                    {t('attendancePayrollBucket.sectionOtTotal')}
                  </th>
                  <th className="px-2 py-1 text-[11px] text-sky-800 bg-sky-100" colSpan={8}>
                    {t('attendancePayrollBucket.sectionOtWeekday')}
                  </th>
                  <th className="px-2 py-1 text-[11px] text-rose-800 bg-rose-100" colSpan={8}>
                    {t('attendancePayrollBucket.sectionOtHoliday')}
                  </th>
                  <th className="px-2 py-1 text-[11px] text-violet-800 bg-violet-100" colSpan={11}>
                    {t('attendancePayrollBucket.sectionAllowance')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {pageItems.map((row, idx) => (
                  <tr key={`${row.employee_id}-${row.period_label}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 text-xs text-gray-600">{Math.max(1, effectiveTotal - ((safePage - 1) * pageSize + idx))}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-700">{primaryCellText(row, 'company')}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-700">{primaryCellText(row, 'empNo')}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-700">{primaryCellText(row, 'empName')}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-700">{primaryCellText(row, 'dept')}</td>
                    {ALL_COL_KEYS.map((k) => (
                      <td key={k} className="px-2 py-1.5 text-xs text-gray-700 whitespace-nowrap">
                        {renderPayrollStatusCell(row, k as PayrollStatusColKey, t, locale)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 bg-gray-50">
          <span className="text-sm text-gray-600">
            {t('appList.pagination.summary')
              .replace('{total}', String(effectiveTotal))
              .replace('{start}', effectiveTotal === 0 ? '0' : String((safePage - 1) * pageSize + 1))
              .replace('{end}', String(Math.min(safePage * pageSize, effectiveTotal)))}
          </span>
          {renderPager()}
        </div>
      </div>
    </div>
  );
}
