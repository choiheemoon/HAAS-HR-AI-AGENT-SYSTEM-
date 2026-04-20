'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import AttendanceAggregateBusyOverlay from '@/components/attendance/AttendanceAggregateBusyOverlay';
import { runAttendanceTimeDayAggregateStream } from '@/lib/attendanceTimeDayAggregate';
import { apiClient } from '@/lib/api';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import { useI18n } from '@/contexts/I18nContext';

type Company = {
  id: number;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
  company_code: string;
};
type Employee = {
  id: number;
  employee_number?: string | null;
  name?: string | null;
  company_id?: number | null;
};

function toYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function previousDayYmd(base: Date): string {
  const d = new Date(base);
  d.setDate(d.getDate() - 1);
  return toYmd(d);
}

export default function AttendanceAggregatePage() {
  const { t, locale } = useI18n();
  const { can, loading: permLoading } = useMenuPermissions();
  const allowRead = can('attendance-aggregate', 'can_read');
  const allowRun = can('attendance-aggregate', 'can_update');

  const defaults = useMemo(() => {
    const prev = previousDayYmd(new Date());
    return { from: prev, to: prev };
  }, []);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const [loadingCos, setLoadingCos] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [running, setRunning] = useState(false);
  const [aggregateProgress, setAggregateProgress] = useState<{
    percent: number;
    done: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string>('');
  const [result, setResult] = useState<{
    employee_count: number;
    day_rows_written: number;
    warnings: string[];
    unmapped_or_partial: string[];
  } | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [running]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingCos(true);
      try {
        const { data } = await apiClient.getMyCompanies();
        if (!alive) return;
        const rows = (Array.isArray(data) ? data : []) as Company[];
        setCompanies(rows);
      } catch {
        if (alive) setCompanies([]);
      } finally {
        if (alive) setLoadingCos(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const companyLabel = useCallback(
    (c: Company) => {
      const ko = c.name_kor?.trim() || '';
      const en = c.name_eng?.trim() || '';
      const th = c.name_thai?.trim() || '';
      const code = c.company_code?.trim() || '';
      if (locale === 'en') return en || ko || th || code || `#${c.id}`;
      if (locale === 'th') return th || ko || en || code || `#${c.id}`;
      return ko || en || th || code || `#${c.id}`;
    },
    [locale]
  );
  const selectedCompanyNum = useMemo(() => {
    const n = Number(companyId);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [companyId]);
  const selectedEmployeeIdSet = useMemo(() => new Set(selectedEmployeeIds), [selectedEmployeeIds]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!selectedCompanyNum || !showEmployeeList) {
        if (alive) {
          setEmployees([]);
          setSelectedEmployeeIds([]);
          setLoadingEmployees(false);
        }
        return;
      }
      setLoadingEmployees(true);
      try {
        const { data } = await apiClient.getEmployees({ company_id: selectedCompanyNum, status: 'active' });
        if (!alive) return;
        const rows = (Array.isArray(data) ? data : []) as Employee[];
        setEmployees(rows);
        setSelectedEmployeeIds((prev) => prev.filter((id) => rows.some((e) => e.id === id)));
      } catch {
        if (alive) {
          setEmployees([]);
          setSelectedEmployeeIds([]);
        }
      } finally {
        if (alive) setLoadingEmployees(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedCompanyNum, showEmployeeList]);

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return [];
    const rows = employees.filter((e) => {
      const no = String(e.employee_number || '').toLowerCase();
      const nm = String(e.name || '').toLowerCase();
      return no.includes(q) || nm.includes(q);
    });
    return [...rows].sort((a, b) => String(a.employee_number || '').localeCompare(String(b.employee_number || '')));
  }, [employees, employeeQuery]);
  const employeeRowsForRender = useMemo(() => filteredEmployees.slice(0, 500), [filteredEmployees]);

  const toggleEmployee = (id: number) => {
    setSelectedEmployeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const onRun = async () => {
    setError('');
    setResult(null);
    const co =
      companyId.trim() === '' ? undefined : Number(companyId);
    if (co !== undefined && (!Number.isFinite(co) || co < 1)) {
      setError(t('attendanceAggregate.invalidCompany'));
      return;
    }
    const eids = selectedEmployeeIds.length > 0 ? selectedEmployeeIds : undefined;
    setRunning(true);
    setAggregateProgress({ percent: 0, done: 0, total: 0 });
    try {
      const data = await runAttendanceTimeDayAggregateStream(
        {
          date_from: dateFrom,
          date_to: dateTo,
          company_id: co,
          employee_ids: eids,
        },
        (p) => setAggregateProgress(p)
      );
      setResult({
        employee_count: data.employee_count,
        day_rows_written: data.day_rows_written,
        warnings: data.warnings ?? [],
        unmapped_or_partial: data.unmapped_or_partial ?? [],
      });
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: unknown } }; message?: string };
      const msg = ax?.response?.data?.detail;
      setError(
        typeof msg === 'string' ? msg : typeof ax?.message === 'string' ? ax.message : t('attendanceAggregate.runFailed')
      );
    } finally {
      setRunning(false);
      setAggregateProgress(null);
    }
  };

  if (!allowRead && !permLoading) {
    return (
      <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">
        {t('permission.noAccess')}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl relative">
      <AttendanceAggregateBusyOverlay open={running} portalReady={portalReady} progress={aggregateProgress} t={t} />
      <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
        <Calculator className="w-6 h-6 text-slate-600" aria-hidden />
        {t('attendanceAggregate.title')}
      </h1>
      <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed">{t('attendanceAggregate.description')}</p>
      <p className="mt-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        {t('attendanceAggregate.hint')}
      </p>

      {allowRun ? (
        <div className="mt-6 space-y-4 border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('attendanceAggregate.company')}</label>
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              disabled={loadingCos || running}
            >
              <option value="">{t('attendanceAggregate.companyAll')}</option>
              {companies.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {companyLabel(c)}{c.company_code?.trim() ? ` (${c.company_code})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('attendanceAggregate.dateFrom')}</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={running}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('attendanceAggregate.dateTo')}</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={running}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600">{t('attendanceAggregate.employeeIds', '집계 대상 직원')}</label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={showEmployeeList}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setShowEmployeeList(checked);
                  if (!checked) {
                    setEmployees([]);
                    setSelectedEmployeeIds([]);
                  }
                }}
                disabled={!selectedCompanyNum || running}
              />
              {t('attendanceAggregate.showEmployeeList', '목록표시 (체크 시 직원목록 조회)')}
            </label>
            <input
              type="search"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              placeholder={t('employees.searchPlaceholder', '사번/성명 검색')}
              value={employeeQuery}
              onChange={(e) => setEmployeeQuery(e.target.value)}
              disabled={!selectedCompanyNum || !showEmployeeList || running || loadingEmployees}
            />
            <div className="rounded-md border border-slate-200 bg-slate-50 max-h-56 overflow-auto">
              {!selectedCompanyNum ? (
                <p className="px-3 py-2 text-sm text-slate-500">
                  {t('attendanceAggregate.selectCompanyToLoadEmployees', '직원 목록은 회사 선택 후 불러옵니다.')}
                </p>
              ) : !showEmployeeList ? (
                <p className="px-3 py-2 text-sm text-slate-500">
                  {t('attendanceAggregate.checkToLoadEmployees', '목록표시 체크 시 직원 목록을 불러옵니다.')}
                </p>
              ) : loadingEmployees ? (
                <p className="px-3 py-2 text-sm text-slate-500">{t('common.loading')}</p>
              ) : employeeQuery.trim() === '' ? (
                <p className="px-3 py-2 text-sm text-slate-500">{t('attendanceAggregate.typeToSearchEmployees', '검색어를 입력해 직원을 찾으세요.')}</p>
              ) : filteredEmployees.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-500">{t('attendanceMaster.noEmployees', '직원 없음')}</p>
              ) : (
                employeeRowsForRender.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-white cursor-pointer border-b border-slate-200 last:border-b-0">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={selectedEmployeeIdSet.has(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      disabled={running}
                    />
                    <span className="font-mono text-slate-700">{String(emp.employee_number || '-')}</span>
                    <span className="text-slate-900">{String(emp.name || '-')}</span>
                  </label>
                ))
              )}
            </div>
            {selectedCompanyNum && showEmployeeList && filteredEmployees.length > employeeRowsForRender.length && (
              <p className="text-xs text-amber-700">
                {t(
                  'attendanceAggregate.employeeListTruncated',
                  '직원 목록이 많아 상위 500명만 표시됩니다. 이름/사번 검색으로 대상을 좁혀주세요.'
                )}
              </p>
            )}
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-600">
                {t('attendanceAggregate.resultEmployees', '직원 수')}: {selectedEmployeeIds.length === 0 ? t('attendanceAggregate.companyAll', '전체') : String(selectedEmployeeIds.length)}
              </p>
              {selectedEmployeeIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedEmployeeIds([])}
                  className="text-xs px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100"
                  disabled={running}
                >
                  {t('common.reset')}
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onRun()}
            disabled={running || loadingCos || loadingEmployees}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            {running ? t('attendanceAggregate.running') : t('attendanceAggregate.run')}
          </button>
        </div>
      ) : (
        !permLoading && (
          <p className="mt-4 text-sm text-slate-600 border border-slate-200 rounded-md px-3 py-2 bg-slate-50">
            {t('attendanceAggregate.noUpdatePermission')}
          </p>
        )
      )}

      {error && (
        <div className="mt-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-3 text-sm">
          <p className="text-green-800 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            {t('attendanceAggregate.success')} — {t('attendanceAggregate.resultEmployees')}: {result.employee_count},{' '}
            {t('attendanceAggregate.resultRows')}: {result.day_rows_written}
          </p>
          {result.warnings.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-md px-3 py-2">
              <p className="font-medium text-amber-950 mb-1">{t('attendanceAggregate.warnings')}</p>
              <ul className="list-disc pl-5 space-y-0.5 text-amber-900">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {result.unmapped_or_partial.length > 0 && (
            <div className="border border-slate-200 bg-slate-50 rounded-md px-3 py-2">
              <p className="font-medium text-slate-800 mb-1">{t('attendanceAggregate.limitations')}</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-700">
                {result.unmapped_or_partial.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
