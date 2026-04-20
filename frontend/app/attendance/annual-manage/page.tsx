'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';

type Company = {
  id: number;
  company_code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

type RefItem = {
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

type AnnualRow = {
  company_id?: number | null;
  company_name?: string | null;
  employee_number: string;
  employee_name: string;
  employee_department?: string | null;
  employee_status?: string | null;
  hire_date?: string | null;
  employee_id: number;
  leave_year: number;
  generated_days: number;
  prev_hours: number | null;
  prev_minutes: number | null;
  transferred_days: number | null;
  transferred_hours: number | null;
  transferred_minutes: number | null;
  used_days: number | null;
  used_hours: number | null;
  used_minutes: number | null;
  year_days: number | null;
  year_hours: number | null;
  year_minutes: number | null;
  service_days: number;
};

type RowFilterKey =
  | 'company_name'
  | 'employee_number'
  | 'employee_name'
  | 'employee_department'
  | 'hire_date'
  | 'service_days'
  | 'leave_year'
  | 'generated_days';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function asNum(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function asNullableInt(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function departmentRefItemsToMap(items: RefItem[], locale: string): Record<string, string> {
  const next: Record<string, string> = {};
  for (const it of items) {
    const label =
      locale === 'ko'
        ? it.name_kor || it.name_eng || it.name_thai || it.code
        : locale === 'en'
          ? it.name_eng || it.name_kor || it.name_thai || it.code
          : it.name_thai || it.name_kor || it.name_eng || it.code;
    next[it.code] = label;
  }
  return next;
}

export default function AttendanceAnnualManagePage() {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-annual-manage', 'can_read');
  const allowSave = can('attendance-annual-manage', 'can_update');
  const allowCreate = can('attendance-annual-manage', 'can_create');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [rows, setRows] = useState<AnnualRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'terminated' | 'inactive' | 'all'>('active');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<RowFilterKey, string[]>>({
    company_name: [],
    employee_number: [],
    employee_name: [],
    employee_department: [],
    hire_date: [],
    service_days: [],
    leave_year: [],
    generated_days: [],
  });

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [loadingList, setLoadingList] = useState(false);
  const [savingRowId, setSavingRowId] = useState<number | null>(null);
  const [openFilterKey, setOpenFilterKey] = useState<RowFilterKey | null>(null);
  /** 회사별 부서코드 → 표시명 (전체 회사 조회 시 코드 충돌 방지) */
  const [departmentLabelByCompanyId, setDepartmentLabelByCompanyId] = useState<Record<number, Record<string, string>>>({});
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  const [batchMinYears, setBatchMinYears] = useState(1);
  const [batchGrantDays, setBatchGrantDays] = useState(6);
  const [batchUnderDays, setBatchUnderDays] = useState(0);
  const [batchOverwrite, setBatchOverwrite] = useState(false);
  const [batchBaseDate, setBatchBaseDate] = useState<string>(`${new Date().getFullYear()}-01-01`);
  const [bulkGenerating, setBulkGenerating] = useState(false);

  useEffect(() => {
    if (!bulkGenerating) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [bulkGenerating]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await apiClient.getMyCompanies();
        setCompanies((data as typeof companies) || []);
      } catch {
        setCompanies([]);
      }
    })();
  }, []);

  const rowsCompanyIdsKey = useMemo(() => {
    if (companyFilter) return '';
    const ids = Array.from(
      new Set(
        rows
          .map((r) => r.company_id)
          .filter((x): x is number => typeof x === 'number' && !Number.isNaN(x))
      )
    ).sort((a, b) => a - b);
    return ids.join(',');
  }, [companyFilter, rows]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (companyFilter) {
        const cid = parseInt(companyFilter, 10);
        if (!Number.isFinite(cid)) {
          if (!cancelled) setDepartmentLabelByCompanyId({});
          return;
        }
        try {
          const { data } = await apiClient.getEmployeeReferenceItemsAllCategories(cid);
          if (cancelled) return;
          const departmentItems = ((data as Record<string, unknown>)?.department as RefItem[]) || [];
          setDepartmentLabelByCompanyId({ [cid]: departmentRefItemsToMap(departmentItems, locale) });
        } catch {
          if (!cancelled) setDepartmentLabelByCompanyId({});
        }
        return;
      }

      const ids = rowsCompanyIdsKey
        ? rowsCompanyIdsKey.split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n))
        : [];
      if (!ids.length) {
        if (!cancelled) setDepartmentLabelByCompanyId({});
        return;
      }

      const entries = await Promise.all(
        ids.map(async (cid) => {
          try {
            const { data } = await apiClient.getEmployeeReferenceItemsAllCategories(cid);
            const departmentItems = ((data as Record<string, unknown>)?.department as RefItem[]) || [];
            return [cid, departmentRefItemsToMap(departmentItems, locale)] as const;
          } catch {
            return [cid, {}] as const;
          }
        })
      );
      if (cancelled) return;
      setDepartmentLabelByCompanyId((prev) => {
        const next = { ...prev };
        for (const [cid, map] of entries) {
          next[cid] = map;
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [companyFilter, locale, rowsCompanyIdsKey]);

  const loadGrid = async () => {
    if (!allowRead) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoadingList(true);
    try {
      const cid = companyFilter ? parseInt(companyFilter, 10) : undefined;
      const { data } = await apiClient.listCompanyAnnualLeaveBalances({
        ...(cid != null && Number.isFinite(cid) && cid > 0 ? { company_id: cid } : {}),
        leave_year: year,
        page,
        page_size: pageSize,
        search: searchTerm || undefined,
        department: departmentFilter || undefined,
        status: statusFilter,
      });
      const payload = data as { items?: AnnualRow[]; total?: number };
      setRows(Array.isArray(payload.items) ? payload.items.map((r) => ({ ...r })) : []);
      setTotal(Number(payload.total ?? 0));
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void loadGrid();
  }, [allowRead, companyFilter, year, page, pageSize, searchTerm, departmentFilter, statusFilter]);

  useEffect(() => {
    setBatchBaseDate(`${year}-01-01`);
  }, [year]);

  const rowsWithCompanyLabels = useMemo(() => {
    const label = (cid: number | null | undefined) => {
      if (cid == null) return '-';
      const c = companies.find((x) => x.id === cid);
      return c ? c.name_kor || c.name_eng || c.name_thai || c.company_code : '-';
    };
    return rows.map((r) => ({
      ...r,
      company_name: label(r.company_id ?? null),
    }));
  }, [rows, companies]);

  const getFilterValue = (r: AnnualRow, k: RowFilterKey): string => {
    if (k === 'service_days' || k === 'leave_year' || k === 'generated_days') {
      return String((r as unknown as Record<string, number | null>)[k] ?? '');
    }
    if (k === 'employee_department') {
      const code = String(r.employee_department ?? '').trim();
      if (!code) return '-';
      const cid = r.company_id;
      if (cid != null) {
        const label = departmentLabelByCompanyId[cid]?.[code];
        if (label) return label;
      }
      if (companyFilter) {
        const cf = parseInt(companyFilter, 10);
        if (Number.isFinite(cf)) {
          const label = departmentLabelByCompanyId[cf]?.[code];
          if (label) return label;
        }
      }
      return code;
    }
    return String((r as unknown as Record<string, unknown>)[k] ?? '').trim();
  };

  const gridRows = useMemo(() => {
    return rowsWithCompanyLabels.filter((r) =>
      (Object.keys(columnFilters) as RowFilterKey[]).every((k) => {
        const selected = columnFilters[k];
        if (!selected.length) return true;
        const val = getFilterValue(r, k) || '-';
        return selected.includes(val);
      })
    );
  }, [rowsWithCompanyLabels, columnFilters, departmentLabelByCompanyId, companyFilter]);

  const listFilterValues = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort();
    return {
      company_name: uniq(rowsWithCompanyLabels.map((r) => getFilterValue(r, 'company_name') || '-')),
      employee_number: uniq(rowsWithCompanyLabels.map((r) => r.employee_number || '-')),
      employee_name: uniq(rowsWithCompanyLabels.map((r) => r.employee_name || '-')),
      employee_department: uniq(rowsWithCompanyLabels.map((r) => getFilterValue(r, 'employee_department') || '-')),
      hire_date: uniq(rowsWithCompanyLabels.map((r) => getFilterValue(r, 'hire_date') || '-')),
      service_days: uniq(rowsWithCompanyLabels.map((r) => getFilterValue(r, 'service_days') || '-')),
      leave_year: uniq(rowsWithCompanyLabels.map((r) => getFilterValue(r, 'leave_year') || '-')),
      generated_days: uniq(rowsWithCompanyLabels.map((r) => getFilterValue(r, 'generated_days') || '-')),
    } as Record<RowFilterKey, string[]>;
  }, [rowsWithCompanyLabels, departmentLabelByCompanyId, companyFilter]);

  const toggleColumnFilter = (key: RowFilterKey, value: string) => {
    setColumnFilters((prev) => {
      const arr = prev[key] ?? [];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  };

  const clearColumnFilter = (key: RowFilterKey) => {
    setColumnFilters((prev) => ({ ...prev, [key]: [] }));
    setOpenFilterKey(null);
  };

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  if (!allowRead) {
    return <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">{t('permission.noAccess')}</div>;
  }

  return (
    <>
    <div
      className={`space-y-4 p-3 ${bulkGenerating ? 'pointer-events-none select-none' : ''}`}
      aria-busy={bulkGenerating}
    >
      <div className="border rounded-lg bg-white p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{t('attendanceAnnualManage.title')}</span>
          <span className="text-xs text-gray-600">{t('employees.field.company')}</span>
          <select
            className="border rounded px-2 py-1 text-sm min-w-[220px]"
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('employees.companyFilter.all')}</option>
            {companies.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name_kor || c.name_eng || c.name_thai || c.company_code}
              </option>
            ))}
          </select>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => {
              const v = e.target.value as 'active' | 'terminated' | 'inactive' | 'all';
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <option value="active">{t('employees.status.active')}</option>
            <option value="terminated">{t('employees.status.terminated')}</option>
            <option value="inactive">{t('employees.status.inactive')}</option>
            <option value="all">{t('employees.filter.status.all')}</option>
          </select>
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 absolute left-2 top-2 text-gray-400" />
            <input
              className="w-full border rounded pl-8 pr-2 py-1 text-sm"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearchTerm(searchInput);
                  setPage(1);
                }
              }}
              placeholder={t('employees.searchPlaceholder')}
            />
          </div>
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder={t('employees.field.department')}
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setPage(1);
            }}
          />
          <label className="text-xs text-gray-700">
            <span className="mb-1 mr-1 inline-block">{t('attendanceAnnualManage.occurrenceYear')}</span>
            <input
              type="number"
              className="border rounded px-2 py-1 text-sm w-28"
              value={year}
              onChange={(e) => {
                setYear(parseInt(e.target.value || '0', 10) || new Date().getFullYear());
                setPage(1);
              }}
            />
          </label>
          <button type="button" className="px-3 py-1.5 rounded bg-gray-100 text-sm" onClick={() => void loadGrid()}>
            {t('attendanceInquiry.reload')}
          </button>
        </div>

        <div className="border rounded p-2 bg-amber-50 space-y-2">
          <div className="text-sm font-medium">{t('attendanceAnnualManage.bulkGenerate')}</div>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
            <label className="text-xs text-gray-700">
              <span className="mb-1 block">{t('attendanceAnnualManage.occurrenceYear')}</span>
              <input
                type="number"
                className="border rounded px-2 py-1 w-full"
                value={year}
                onChange={(e) => {
                  setYear(parseInt(e.target.value || '0', 10) || new Date().getFullYear());
                  setPage(1);
                }}
              />
            </label>
            <label className="text-xs text-gray-700">
              <span className="mb-1 block">{t('attendanceAnnualManage.baseDate')}</span>
              <input type="date" className="border rounded px-2 py-1 w-full" value={batchBaseDate} onChange={(e) => setBatchBaseDate(e.target.value)} />
            </label>
            <label className="text-xs text-gray-700">
              <span className="mb-1 block">{t('attendanceAnnualManage.minServiceYears')}</span>
              <input type="number" className="border rounded px-2 py-1 w-full" value={batchMinYears} onChange={(e) => setBatchMinYears(asNum(e.target.value))} />
            </label>
            <label className="text-xs text-gray-700">
              <span className="mb-1 block">{t('attendanceAnnualManage.grantDays')}</span>
              <input type="number" className="border rounded px-2 py-1 w-full" value={batchGrantDays} onChange={(e) => setBatchGrantDays(asNum(e.target.value))} />
            </label>
            <label className="text-xs text-gray-700">
              <span className="mb-1 block">{t('attendanceAnnualManage.underGrantDays')}</span>
              <input type="number" className="border rounded px-2 py-1 w-full" value={batchUnderDays} onChange={(e) => setBatchUnderDays(asNum(e.target.value))} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={batchOverwrite} onChange={(e) => setBatchOverwrite(e.target.checked)} />
              <span>{t('attendanceAnnualManage.overwriteExisting')}</span>
            </label>
            <button
              type="button"
              disabled={!allowCreate || bulkGenerating}
              className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-50"
              onClick={async () => {
                const cidRaw = companyFilter ? parseInt(companyFilter, 10) : NaN;
                const companyId = Number.isFinite(cidRaw) && cidRaw > 0 ? cidRaw : undefined;
                if (!companyId && !window.confirm(t('attendanceAnnualManage.bulkConfirmAllCompanies'))) {
                  return;
                }
                const body: Parameters<typeof apiClient.bulkGenerateAnnualLeaveBalances>[1] = {
                  base_date: batchBaseDate,
                  min_service_years: batchMinYears,
                  grant_days: batchGrantDays,
                  under_min_service_grant_days: batchUnderDays,
                  overwrite_existing: batchOverwrite,
                };
                if (companyId != null) {
                  body.company_id = companyId;
                }
                setBulkGenerating(true);
                try {
                  const { data } = await apiClient.bulkGenerateAnnualLeaveBalances(year, body);
                  const d = data as { created?: number; updated?: number; processed?: number };
                  alert(
                    `${t('attendanceAnnualManage.bulkDone')}: processed=${d.processed ?? '-'}, created=${d.created ?? 0}, updated=${d.updated ?? 0}`
                  );
                  await loadGrid();
                } catch {
                  alert(t('attendanceAnnualManage.bulkFailed'));
                } finally {
                  setBulkGenerating(false);
                }
              }}
            >
              {t('attendanceAnnualManage.bulkGenerate')}
            </button>
          </div>
        </div>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="p-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-gray-600">
            {t('appList.pagination.summary')
              .replace('{total}', String(total))
              .replace('{start}', String(startItem))
              .replace('{end}', String(endItem))}
            {gridRows.length !== rows.length ? (
              <span className="ml-1 text-blue-600">{t('appList.pagination.filtered').replace('{count}', String(gridRows.length))}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">{t('appList.pagination.perPage')}</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {t('appList.pagination.countUnit').replace('{count}', String(n))}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="border p-2">No.</th>
                {([
                  ['company_name', t('employees.field.company')],
                  ['employee_number', t('employees.field.employeeNumber')],
                  ['employee_name', t('employees.field.name')],
                  ['employee_department', t('employees.field.department')],
                  ['hire_date', t('employees.field.hireDate')],
                  ['service_days', t('attendanceAnnualManage.serviceDays')],
                  ['leave_year', t('attendanceAnnualManage.occurrenceYear')],
                  ['generated_days', t('attendanceAnnualManage.generatedDays')],
                ] as const).map(([k, label]) => {
                  const key = k as RowFilterKey;
                  const selected = columnFilters[key];
                  return (
                    <th key={key} className="border p-2 text-left whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span>{label}</span>
                        <div className="relative">
                          <button
                            type="button"
                            className={`p-0.5 rounded hover:bg-gray-200 ${selected.length ? 'text-blue-600' : 'text-gray-400'}`}
                            onClick={() => setOpenFilterKey((k) => (k === key ? null : key))}
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
                                <button type="button" onClick={() => clearColumnFilter(key)} className="text-xs text-blue-600 hover:underline">
                                  {t('common.reset')}
                                </button>
                              </div>
                              <div className="max-h-48 overflow-y-auto py-1">
                                {listFilterValues[key].length === 0 ? (
                                  <p className="px-2 py-1 text-xs text-gray-500">{t('appList.filter.noValues')}</p>
                                ) : (
                                  listFilterValues[key].map((val) => (
                                    <label key={val} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={selected.includes(val)}
                                        onChange={() => toggleColumnFilter(key, val)}
                                        className="rounded border-gray-300"
                                      />
                                      <span className="text-xs truncate flex-1" title={val}>{val || t('common.emptyValue')}</span>
                                    </label>
                                  ))
                                )}
                              </div>
                              {selected.length > 0 && (
                                <p className="px-2 pt-1 text-xs text-gray-500">{t('appList.filter.selectedCount').replace('{count}', String(selected.length))}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </th>
                  );
                })}
                <th className="border p-2">{t('attendanceAnnualManage.leaveGeneratedDays')}</th>
                <th className="border p-2">{t('attendanceAnnualManage.leaveGeneratedHours')}</th>
                <th className="border p-2">{t('attendanceAnnualManage.leaveGeneratedMinutes')}</th>
                <th className="border p-2">{t('employees.toolbar.save')}</th>
              </tr>
            </thead>
            <tbody>
              {gridRows.map((r, index) => (
                <tr key={r.employee_id} className="hover:bg-gray-50">
                  <td className="border p-1 text-right">{Math.max(0, total - (page - 1) * pageSize - index)}</td>
                  <td className="border p-1">{r.company_name || '-'}</td>
                  <td className="border p-1">{r.employee_number}</td>
                  <td className="border p-1">{r.employee_name}</td>
                  <td className="border p-1">{getFilterValue(r, 'employee_department')}</td>
                  <td className="border p-1">{r.hire_date || '-'}</td>
                  <td className="border p-1 text-right">{Number(r.service_days || 0).toLocaleString()}</td>
                  <td className="border p-1 text-right">{r.leave_year}</td>
                  <td className="border p-1 text-right">{r.generated_days}</td>
                  <td className="border p-1">
                    <input className="w-16 border rounded px-1 py-0.5 text-right" type="number" value={r.year_days ?? ''} onChange={(e) => setRows((prev) => prev.map((x) => (x.employee_id === r.employee_id ? { ...x, year_days: asNullableInt(e.target.value) } : x)))} />
                  </td>
                  <td className="border p-1">
                    <input
                      className="w-14 border rounded px-1 py-0.5 text-right"
                      type="number"
                      value={r.year_hours ?? ''}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x) =>
                            x.employee_id === r.employee_id ? { ...x, year_hours: asNullableInt(e.target.value) } : x
                          )
                        )
                      }
                    />
                  </td>
                  <td className="border p-1">
                    <input
                      className="w-14 border rounded px-1 py-0.5 text-right"
                      type="number"
                      value={r.year_minutes ?? ''}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x) =>
                            x.employee_id === r.employee_id ? { ...x, year_minutes: asNullableInt(e.target.value) } : x
                          )
                        )
                      }
                    />
                  </td>
                  <td className="border p-1 text-center">
                    <button
                      type="button"
                      disabled={!allowSave || savingRowId === r.employee_id}
                      className="px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
                      onClick={async () => {
                        setSavingRowId(r.employee_id);
                        try {
                          await apiClient.putEmployeeAnnualLeaveBalance(r.employee_id, year, {
                            generated_days: r.generated_days,
                            prev_hours: r.prev_hours,
                            prev_minutes: r.prev_minutes,
                            transferred_days: r.transferred_days,
                            transferred_hours: r.transferred_hours,
                            transferred_minutes: r.transferred_minutes,
                            year_days: r.year_days,
                            year_hours: r.year_hours,
                            year_minutes: r.year_minutes,
                          });
                        } catch {
                          alert(t('attendanceMaster.saveError'));
                        } finally {
                          setSavingRowId(null);
                        }
                      }}
                    >
                      {t('employees.toolbar.save')}
                    </button>
                  </td>
                </tr>
              ))}
              {!loadingList && gridRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-6 text-center text-gray-500">
                    {t('attendanceLeaveManage.noEmployees')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-1">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 text-sm border rounded disabled:opacity-50">
            {t('common.prev')}
          </button>
          <span className="px-2 text-sm text-gray-600">{page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 text-sm border rounded disabled:opacity-50">
            {t('common.next')}
          </button>
        </div>
      </div>
      {loadingList && !bulkGenerating ? (
        <div className="fixed bottom-4 right-4 text-xs bg-gray-800 text-white px-2 py-1 rounded z-[150]">{t('common.loading')}</div>
      ) : null}
    </div>
    {bulkGenerating ? (
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 pointer-events-auto"
        role="alertdialog"
        aria-modal="true"
        aria-live="polite"
        aria-labelledby="annual-bulk-progress-title"
      >
        <div className="rounded-xl bg-white px-8 py-7 shadow-xl flex flex-col items-center gap-4 max-w-sm mx-4 border border-gray-100">
          <Loader2 className="w-10 h-10 text-amber-600 animate-spin shrink-0" aria-hidden />
          <p id="annual-bulk-progress-title" className="text-base font-semibold text-gray-900 text-center">
            {t('attendanceAnnualManage.bulkInProgress')}
          </p>
          <p className="text-xs text-gray-500 text-center leading-relaxed">{t('attendanceAnnualManage.bulkInProgressHint')}</p>
        </div>
      </div>
    ) : null}
    </>
  );
}
