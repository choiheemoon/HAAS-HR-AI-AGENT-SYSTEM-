'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';

type CompanyRow = {
  id: number;
  company_code: string;
  name_kor?: string | null;
  name_thai?: string | null;
  name_eng?: string | null;
};

type Row = {
  id_time_in_out: number;
  company_id?: number | null;
  employee_id?: number | null;
  employee_number?: string | null;
  employee_name?: string | null;
  employee_department?: string | null;
  employee_status?: string | null;
  date_i?: string | null;
  date_in_out?: string | null;
  id_sin_out?: number | null;
  machine_no?: string | null;
  location?: string | null;
  add_memo?: string | null;
  user_change?: string | null;
  shift_group_name?: string | null;
  shift_work_code?: string | null;
};
type RefItem = { code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null };

function fmtDt(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function punchIso(r: Row): string | null {
  const raw = (r.date_in_out || r.date_i || '').trim();
  if (!raw) return null;
  return raw.includes('T') ? raw : `${raw.slice(0, 10)}T12:00:00`;
}

function fmtWeekday(iso?: string | null, loc?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const tag = loc === 'en' ? 'en-US' : loc === 'th' ? 'th-TH' : 'ko-KR';
  return d.toLocaleDateString(tag, { weekday: 'short' });
}

export default function AttendanceOverviewPage() {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-overview', 'can_read');

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const defaultFrom = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'terminated' | 'inactive' | 'all'>('active');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const [deptRefsByCompany, setDeptRefsByCompany] = useState<Record<number, RefItem[]>>({});

  const companyLabel = (c: CompanyRow) => {
    if (locale === 'ko') return c.name_kor || c.name_eng || c.name_thai || c.company_code;
    if (locale === 'en') return c.name_eng || c.name_kor || c.name_thai || c.company_code;
    return c.name_thai || c.name_kor || c.name_eng || c.company_code;
  };

  useEffect(() => {
    void apiClient
      .getMyCompanies()
      .then(({ data }) => setCompanies((data as CompanyRow[]) || []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    const ids = Array.from(
      new Set(
        rows
          .map((r) => Number(r.company_id || 0))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );
    const need = ids.filter((id) => !deptRefsByCompany[id]);
    if (need.length === 0) return;
    need.forEach((companyId) => {
      void apiClient
        .getEmployeeReferenceItems('department', companyId)
        .then(({ data }) => {
          setDeptRefsByCompany((prev) => ({
            ...prev,
            [companyId]: Array.isArray(data) ? (data as RefItem[]) : [],
          }));
        })
        .catch(() => {
          setDeptRefsByCompany((prev) => ({ ...prev, [companyId]: [] }));
        });
    });
  }, [deptRefsByCompany, rows]);

  const invalidRange = (dateFrom || '').slice(0, 10) > (dateTo || '').slice(0, 10);

  const load = useCallback(async (nextSearch?: string) => {
    if (invalidRange) return;
    setLoading(true);
    try {
      const cid = companyFilter ? Number(companyFilter) : undefined;
      const resolvedSearch = (nextSearch ?? searchTerm).trim();
      const { data } = await apiClient.getAttendanceTimeInOutAll({
        company_id: Number.isFinite(cid) ? cid : undefined,
        status: statusFilter,
        search: resolvedSearch || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 10000,
      });
      const items = ((data as { items?: Row[] })?.items || []) as Row[];
      setRows(items);
      setPage(1);
    } catch {
      setRows([]);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }, [companyFilter, dateFrom, dateTo, invalidRange, searchTerm, statusFilter]);

  const applySearchAndLoad = useCallback(async () => {
    const nextSearch = searchInput.trim();
    setSearchTerm(nextSearch);
    await load(nextSearch);
  }, [load, searchInput]);

  useEffect(() => {
    if (!allowRead) return;
    void load();
  }, [allowRead, load]);

  const columns = useMemo(
    () => [
      {
        key: 'company_name',
        label: t('attendanceOverview.col.company'),
        getValue: (r: Row) => {
          const cid = Number(r.company_id || 0);
          const c = companies.find((x) => x.id === cid);
          if (!c) return '-';
          if (locale === 'ko') return c.name_kor || c.name_eng || c.name_thai || c.company_code;
          if (locale === 'en') return c.name_eng || c.name_kor || c.name_thai || c.company_code;
          return c.name_thai || c.name_kor || c.name_eng || c.company_code;
        },
      },
      { key: 'date_in_out', label: t('attendanceOverview.col.dateInOut'), getValue: (r: Row) => fmtDt(r.date_in_out || r.date_i) },
      {
        key: 'weekday',
        label: t('attendanceInquiry.col.weekday'),
        getValue: (r: Row) => fmtWeekday(punchIso(r), locale),
      },
      {
        key: 'shift_group_name',
        label: t('attendanceStandard.tab.shiftGroup'),
        getValue: (r: Row) => String(r.shift_group_name || '-').trim() || '-',
      },
      {
        key: 'shift_work_code',
        label: t('attendanceStandard.tab.shift'),
        getValue: (r: Row) => String(r.shift_work_code || '-').trim() || '-',
      },
      { key: 'employee_number', label: t('attendanceOverview.col.employeeNo'), getValue: (r: Row) => String(r.employee_number || '-') },
      { key: 'employee_name', label: t('attendanceOverview.col.employeeName'), getValue: (r: Row) => String(r.employee_name || '-') },
      {
        key: 'employee_department',
        label: t('attendanceOverview.col.department'),
        getValue: (r: Row) => {
          const raw = String(r.employee_department || '').trim();
          if (!raw) return '-';
          const cid = Number(r.company_id || 0);
          const refs = deptRefsByCompany[cid] || [];
          const hit = refs.find((x) => x.code === raw);
          if (!hit) return raw;
          if (locale === 'ko') return hit.name_kor || hit.name_eng || hit.name_thai || hit.code;
          if (locale === 'en') return hit.name_eng || hit.name_kor || hit.name_thai || hit.code;
          return hit.name_thai || hit.name_kor || hit.name_eng || hit.code;
        },
      },
      {
        key: 'register_type',
        label: t('attendanceOverview.col.registerType'),
        getValue: (r: Row) => (r.id_sin_out === 1 ? t('attendanceOverview.auto') : t('attendanceOverview.manual')),
      },
      { key: 'machine_no', label: t('attendanceOverview.col.machine'), getValue: (r: Row) => String(r.machine_no || '-') },
      { key: 'location', label: t('attendanceOverview.col.location'), getValue: (r: Row) => String(r.location || '-') },
      { key: 'add_memo', label: t('attendanceOverview.col.memo'), getValue: (r: Row) => String(r.add_memo || '-') },
      { key: 'user_change', label: t('attendanceOverview.col.userChange'), getValue: (r: Row) => String(r.user_change || '-') },
    ],
    [companies, deptRefsByCompany, locale, t]
  );

  const filteredRows = useMemo(() => {
    if (Object.keys(columnFilters).length === 0) return rows;
    return rows.filter((row) =>
      columns.every((c) => {
        const selected = columnFilters[c.key];
        if (!selected || selected.length === 0) return true;
        const v = c.getValue(row);
        return selected.includes(v);
      })
    );
  }, [columnFilters, columns, rows]);

  const uniqueValuesByKey = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of columns) {
      const set = new Set<string>();
      for (const r of rows) set.add(c.getValue(r));
      out[c.key] = Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
    }
    return out;
  }, [columns, rows]);

  const totalCount = filteredRows.length;
  const countText = useMemo(
    () => t('attendanceOverview.count').replace('{count}', String(totalCount)),
    [totalCount, t]
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(pageStart, pageStart + pageSize);
  const startItem = totalCount === 0 ? 0 : pageStart + 1;
  const endItem = Math.min(pageStart + pageRows.length, totalCount);

  const downloadExcel = useCallback(async () => {
    if (!filteredRows.length || downloading) return;
    setDownloading(true);
    try {
      const exceljs = await import('exceljs');
      const workbook = new exceljs.Workbook();
      const sheet = workbook.addWorksheet('attendance_overview');
      sheet.columns = [
        { header: t('attendanceOverview.col.seq'), key: 'seq', width: 10 },
        { header: t('attendanceOverview.col.dateInOut'), key: 'date_in_out', width: 20 },
        { header: t('attendanceInquiry.col.weekday'), key: 'weekday', width: 10 },
        { header: t('attendanceStandard.tab.shiftGroup'), key: 'shift_group_name', width: 14 },
        { header: t('attendanceStandard.tab.shift'), key: 'shift_work_code', width: 12 },
        { header: t('attendanceOverview.col.employeeNo'), key: 'employee_number', width: 16 },
        { header: t('attendanceOverview.col.employeeName'), key: 'employee_name', width: 18 },
        { header: t('attendanceOverview.col.department'), key: 'employee_department', width: 18 },
        { header: t('attendanceOverview.col.registerType'), key: 'register_type', width: 14 },
        { header: t('attendanceOverview.col.machine'), key: 'machine_no', width: 14 },
        { header: t('attendanceOverview.col.location'), key: 'location', width: 30 },
        { header: t('attendanceOverview.col.memo'), key: 'add_memo', width: 30 },
        { header: t('attendanceOverview.col.userChange'), key: 'user_change', width: 18 },
      ];
      filteredRows.forEach((r, idx) => {
        sheet.addRow({
          seq: totalCount - idx,
          date_in_out: fmtDt(r.date_in_out || r.date_i),
          weekday: fmtWeekday(punchIso(r), locale),
          shift_group_name: String(r.shift_group_name || '-').trim() || '-',
          shift_work_code: String(r.shift_work_code || '-').trim() || '-',
          employee_number: r.employee_number || '-',
          employee_name: r.employee_name || '-',
          employee_department: r.employee_department || '-',
          register_type: r.id_sin_out === 1 ? t('attendanceOverview.auto') : t('attendanceOverview.manual'),
          machine_no: r.machine_no || '-',
          location: r.location || '-',
          add_memo: r.add_memo || '-',
          user_change: r.user_change || '-',
        });
      });
      const buf = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const from = (dateFrom || '').slice(0, 10);
      const to = (dateTo || '').slice(0, 10);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `attendance_overview_${from}_${to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }, [dateFrom, dateTo, downloading, filteredRows, locale, t, totalCount]);

  const toggleColumnFilter = (key: string, value: string) => {
    setColumnFilters((prev) => {
      const arr = prev[key] ?? [];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      if (next.length === 0) {
        const cloned = { ...prev };
        delete cloned[key];
        return cloned;
      }
      return { ...prev, [key]: next };
    });
    setPage(1);
  };

  const clearColumnFilter = (key: string) => {
    setColumnFilters((prev) => {
      const cloned = { ...prev };
      delete cloned[key];
      return cloned;
    });
    setPage(1);
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

  if (!allowRead) {
    return (
      <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">
        {t('permission.noAccess')}
      </div>
    );
  }

  return (
    <div className="p-1.5 sm:p-3">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-3 flex flex-col gap-3 min-h-[560px]">
        <h2 className="text-sm sm:text-base font-bold text-slate-900">{t('attendanceOverview.title')}</h2>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-600">
            <span className="block mb-1 whitespace-nowrap">{t('employees.field.company')}</span>
            <select
              className="w-[170px] border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            >
              <option value="">{t('employees.companyFilter.all')}</option>
              {companies.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {companyLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            <span className="block mb-1 whitespace-nowrap">{t('employees.filter.status')}</span>
            <select
              className="w-[140px] border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value === 'terminated'
                    ? 'terminated'
                    : e.target.value === 'inactive'
                    ? 'inactive'
                    : e.target.value === 'all'
                    ? 'all'
                    : 'active'
                )
              }
            >
              <option value="active">{t('employees.status.active')}</option>
              <option value="terminated">{t('employees.status.terminated')}</option>
              <option value="inactive">{t('employees.status.inactive')}</option>
              <option value="all">{t('employees.filter.status.all')}</option>
            </select>
          </label>
          <label className="text-xs text-gray-600">
            <span className="block mb-1 whitespace-nowrap">{t('attendanceInquiry.dateFrom')}</span>
            <input
              type="date"
              className="w-[150px] border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="text-xs text-gray-600">
            <span className="block mb-1 whitespace-nowrap">{t('attendanceInquiry.dateTo')}</span>
            <input
              type="date"
              className="w-[150px] border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <label className="text-xs text-gray-600 w-[260px]">
            <span className="block mb-1 whitespace-nowrap">{t('attendanceOverview.search')}</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-2 py-2 text-sm bg-white"
                value={searchInput}
                placeholder={t('attendanceOverview.searchPlaceholder')}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void applySearchAndLoad();
                  }
                }}
              />
            </div>
          </label>
          <button
            type="button"
            className="text-xs px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-800 font-medium hover:bg-gray-50 h-[38px]"
            onClick={() => void applySearchAndLoad()}
            disabled={loading}
          >
            {t('appList.filter.refresh')}
          </button>
          <button
            type="button"
            className="text-xs px-3 py-2 border border-sky-300 rounded-lg bg-sky-50 text-sky-900 font-medium hover:bg-sky-100 h-[38px]"
            onClick={() => void load()}
            disabled={loading || invalidRange}
          >
            {t('attendanceInquiry.reload')}
          </button>
          <button
            type="button"
            className="text-xs px-3 py-2 border border-emerald-300 rounded-lg bg-emerald-50 text-emerald-900 font-medium hover:bg-emerald-100 disabled:opacity-60 h-[38px]"
            onClick={() => void downloadExcel()}
            disabled={!filteredRows.length || downloading}
          >
            {downloading ? t('common.loading') : t('attendanceOverview.excelDownload')}
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {countText}
          </span>
          <label className="text-xs text-gray-600 inline-flex items-center gap-1">
            <span>{t('attendanceOverview.pageSize')}</span>
            <select
              className="border border-gray-300 rounded px-1.5 py-1 bg-white"
              value={String(pageSize)}
              onChange={(e) => {
                const next = Number(e.target.value) || 50;
                setPageSize(next);
                setPage(1);
              }}
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </label>
          <span className="text-xs text-gray-600">
            {t('appList.pagination.summary')
              .replace('{total}', String(totalCount))
              .replace('{start}', String(startItem))
              .replace('{end}', String(endItem))}
          </span>
          <div className="ml-auto inline-flex items-center gap-1">
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded bg-white disabled:opacity-50"
              disabled={currentPage <= 1}
              onClick={() => setPage(1)}
            >
              {'<<'}
            </button>
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded bg-white disabled:opacity-50"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {'<'}
            </button>
            <span className="text-xs text-gray-700 px-2">
              {t('attendanceOverview.pageInfo')
                .replace('{page}', String(currentPage))
                .replace('{total}', String(totalPages))}
            </span>
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded bg-white disabled:opacity-50"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {'>'}
            </button>
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded bg-white disabled:opacity-50"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              {'>>'}
            </button>
          </div>
          {invalidRange ? <span className="text-xs text-amber-700">{t('attendanceInquiry.invalidRange')}</span> : null}
        </div>

        <div className="flex-1 min-h-0 overflow-auto border border-gray-200 rounded-md">
          <table className="min-w-max w-full text-xs">
            <thead className="sticky top-0 bg-slate-800 text-white z-[1]">
              <tr>
                <th className="px-2 py-2 text-center whitespace-nowrap">{t('attendanceOverview.col.seq')}</th>
                {columns.map((c) => {
                  const selected = columnFilters[c.key] ?? [];
                  const hasFilter = selected.length > 0;
                  const options = uniqueValuesByKey[c.key] ?? [];
                  return (
                    <Fragment key={c.key}>
                      <th className="px-2 py-2 text-left whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <span>{c.label}</span>
                          <div className="relative">
                            <button
                              type="button"
                              className={`p-0.5 rounded hover:bg-slate-700 ${hasFilter ? 'text-emerald-300' : 'text-slate-200'}`}
                              onClick={() => setOpenFilterKey((k) => (k === c.key ? null : c.key))}
                              title={t('appList.filter.title')}
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            {openFilterKey === c.key && (
                              <div
                                ref={filterPopoverRef}
                                className="absolute left-0 top-full mt-1 z-20 w-56 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-2 text-gray-800"
                              >
                                <div className="px-2 pb-2 border-b border-gray-100 flex justify-between items-center">
                                  <span className="text-xs font-medium text-gray-600">{t('appList.filter.title')}</span>
                                  <button
                                    type="button"
                                    onClick={() => clearColumnFilter(c.key)}
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                    {t('common.reset')}
                                  </button>
                                </div>
                                <div className="max-h-48 overflow-y-auto py-1">
                                  {options.length === 0 ? (
                                    <p className="px-2 py-1 text-xs text-gray-500">{t('appList.filter.noValues')}</p>
                                  ) : (
                                    options.map((v) => (
                                      <label key={v} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={selected.includes(v)}
                                          onChange={() => toggleColumnFilter(c.key, v)}
                                          className="rounded border-gray-300"
                                        />
                                        <span className="text-xs truncate flex-1">{v}</span>
                                      </label>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </th>
                    </Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-gray-500">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-gray-500">
                    {t('attendanceInquiry.noRows')}
                  </td>
                </tr>
              ) : (
                pageRows.map((r, idx) => (
                  <tr key={r.id_time_in_out} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-1.5 whitespace-nowrap text-center tabular-nums">
                      {totalCount - (pageStart + idx)}
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 whitespace-nowrap">
                        {c.getValue(r)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
