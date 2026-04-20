'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { fmtShortYmd } from '@/lib/payrollBucketFormat';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import { cn } from '@/lib/utils';

type Company = {
  id: number;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
  company_code: string;
};

type PaymentPeriodRow = {
  id: number;
  calendar_year: number;
  calendar_month: number;
  period_label: string;
  start_date_daily: string | null;
  end_date_daily: string | null;
  start_date_monthly: string | null;
  end_date_monthly: string | null;
  ot_start_daily: string | null;
  ot_end_daily: string | null;
  ot_start_monthly: string | null;
  ot_end_monthly: string | null;
  is_closed?: boolean;
  closed_at?: string | null;
};

const COVERAGE_OPTIONS = ['all', 'code_range', 'department'] as const;
type Coverage = (typeof COVERAGE_OPTIONS)[number];

function companyLabel(c: Company, locale: string): string {
  const name =
    locale === 'th'
      ? c.name_thai || c.name_eng || c.name_kor
      : locale === 'en'
        ? c.name_eng || c.name_kor || c.name_thai
        : c.name_kor || c.name_eng || c.name_thai;
  return (name || c.company_code).trim();
}

function monthOptionLabel(m: number, locale: string): string {
  if (locale === 'ko') return `${m}월`;
  if (locale === 'th') return `เดือน ${m}`;
  return `Month ${m}`;
}

export default function AttendancePayrollBucketAggregatePage() {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-allowance-status-inquiry', 'can_read');

  const today = new Date();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth() + 1);
  const [periodLabel, setPeriodLabel] = useState('Period 1');
  const [paymentPeriods, setPaymentPeriods] = useState<PaymentPeriodRow[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  const [coverage, setCoverage] = useState<Coverage>('all');
  const [employeeCodeFrom, setEmployeeCodeFrom] = useState('');
  const [employeeCodeTo, setEmployeeCodeTo] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');

  const [running, setRunning] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  /** 집계 완료 안내(행 데이터는 화면에 표시하지 않음) */
  const [computeDoneCount, setComputeDoneCount] = useState<number | null>(null);

  useEffect(() => {
    void apiClient
      .getCompanies()
      .then(({ data }) => setCompanies((data as Company[]) || []))
      .catch(() => setCompanies([]));
  }, []);

  const cid = companyId ? Number(companyId) : NaN;

  const loadPeriods = useCallback(async () => {
    if (!Number.isFinite(cid)) {
      setPaymentPeriods([]);
      return;
    }
    setLoadingPeriods(true);
    try {
      const { data } = await apiClient.getPayrollBucketPaymentPeriods({
        company_id: cid,
        calendar_year: calendarYear,
      });
      const items = (data as { items?: PaymentPeriodRow[] })?.items || [];
      setPaymentPeriods(items);
    } catch {
      setPaymentPeriods([]);
    } finally {
      setLoadingPeriods(false);
    }
  }, [cid, calendarYear]);

  useEffect(() => {
    if (!allowRead || !Number.isFinite(cid)) return;
    void loadPeriods();
  }, [allowRead, cid, loadPeriods]);

  const periodsForMonth = useMemo(
    () =>
      paymentPeriods.filter(
        (p) =>
          Number(p.calendar_year) === Number(calendarYear) && Number(p.calendar_month) === Number(calendarMonth)
      ),
    [paymentPeriods, calendarMonth, calendarYear]
  );

  const periodLabels = useMemo(() => {
    const s = new Set<string>();
    for (const p of periodsForMonth) s.add(p.period_label || 'Period 1');
    return Array.from(s).sort();
  }, [periodsForMonth]);

  useEffect(() => {
    if (periodLabels.length && !periodLabels.includes(periodLabel)) {
      setPeriodLabel(periodLabels[0]);
    }
  }, [periodLabels, periodLabel]);

  const selectedPeriodRow = useMemo(
    () =>
      periodsForMonth.find(
        (p) => String(p.period_label || 'Period 1').trim() === String(periodLabel || 'Period 1').trim()
      ) || null,
    [periodsForMonth, periodLabel]
  );

  const runCompute = useCallback(async () => {
    setError('');
    setComputeDoneCount(null);
    if (!Number.isFinite(cid)) {
      setError(t('attendancePayrollBucket.errorSelectCompany'));
      return;
    }
    if (!selectedPeriodRow) {
      setError(t('attendancePayrollBucket.errorNoPaymentPeriod'));
      return;
    }
    if (selectedPeriodRow.is_closed) {
      setError(t('attendancePayrollBucket.periodClosedBlocked'));
      return;
    }
    setRunning(true);
    try {
      const { data } = await apiClient.computePayrollBucket({
        company_id: cid,
        calendar_year: calendarYear,
        calendar_month: calendarMonth,
        period_label: periodLabel,
        coverage,
        employee_code_from: coverage === 'code_range' ? employeeCodeFrom || undefined : undefined,
        employee_code_to: coverage === 'code_range' ? employeeCodeTo || undefined : undefined,
        department_code: coverage === 'department' ? departmentCode || undefined : undefined,
      });
      const payload = data as { employee_count?: number };
      setComputeDoneCount(Number(payload.employee_count ?? 0));
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || '')
          : '';
      setError(msg || t('attendancePayrollBucket.errorCompute'));
    } finally {
      setRunning(false);
    }
  }, [
    calendarMonth,
    calendarYear,
    cid,
    coverage,
    departmentCode,
    employeeCodeFrom,
    employeeCodeTo,
    periodLabel,
    selectedPeriodRow,
    t,
  ]);

  const togglePeriodClose = useCallback(async () => {
    if (!Number.isFinite(cid) || !selectedPeriodRow) return;
    setError('');
    setClosing(true);
    try {
      await apiClient.setPayrollBucketPeriodClosed({
        company_id: cid,
        calendar_year: calendarYear,
        calendar_month: calendarMonth,
        period_label: periodLabel,
        is_closed: !Boolean(selectedPeriodRow.is_closed),
      });
      await loadPeriods();
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || '')
          : '';
      setError(msg || t('attendancePayrollBucket.errorCompute'));
    } finally {
      setClosing(false);
    }
  }, [cid, selectedPeriodRow, calendarYear, calendarMonth, periodLabel, loadPeriods, t]);

  if (!allowRead) {
    return (
      <div className="p-6 text-sm text-slate-600">
        {t('attendancePayrollBucket.noPermission')}
      </div>
    );
  }

  const periodPreviewThCls =
    'border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[11px] font-semibold text-slate-700 whitespace-nowrap';
  const periodPreviewTdCls = 'border-b border-slate-100 px-2 py-1.5 text-[11px] text-slate-800 whitespace-nowrap';

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[100vw]">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700">
          <Calculator className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">{t('attendancePayrollBucket.aggregateTitle')}</h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">{t('attendancePayrollBucket.aggregateHint')}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-slate-100/80 overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <div className="text-sm font-semibold text-slate-800">{t('attendancePayrollBucket.dialogTitle')}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">{t('attendancePayrollBucket.dialogSub')}</p>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              {t('attendancePayrollBucket.company')}
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">{t('attendancePayrollBucket.selectCompany')}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {companyLabel(c, locale)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              {t('attendancePayrollBucket.year')}
              <input
                type="number"
                min={2000}
                max={2100}
                value={calendarYear}
                onChange={(e) => setCalendarYear(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              {t('attendancePayrollBucket.month')}
              <select
                value={calendarMonth}
                onChange={(e) => setCalendarMonth(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {monthOptionLabel(m, locale)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              {t('attendancePayrollBucket.period')}
              <select
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                disabled={periodLabels.length === 0}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
              >
                {periodLabels.length === 0 ? (
                  <option value="">{loadingPeriods ? '…' : t('attendancePayrollBucket.noPeriodOption')}</option>
                ) : (
                  periodLabels.map((pl) => (
                    <option key={pl} value={pl}>
                      {pl}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-800 mb-2">{t('attendancePayrollBucket.coverage')}</div>
            <div className="flex flex-wrap gap-4">
              {COVERAGE_OPTIONS.map((c) => (
                <label key={c} className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="payroll-coverage"
                    checked={coverage === c}
                    onChange={() => setCoverage(c)}
                    className="rounded-full border-slate-300 text-indigo-600"
                  />
                  {t(`attendancePayrollBucket.coverage.${c}`)}
                </label>
              ))}
            </div>
            {coverage === 'code_range' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  {t('attendancePayrollBucket.codeFrom')}
                  <input
                    value={employeeCodeFrom}
                    onChange={(e) => setEmployeeCodeFrom(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="AT000001"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  {t('attendancePayrollBucket.codeTo')}
                  <input
                    value={employeeCodeTo}
                    onChange={(e) => setEmployeeCodeTo(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="AT999999"
                  />
                </label>
              </div>
            )}
            {coverage === 'department' && (
              <div className="mt-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  {t('attendancePayrollBucket.departmentCode')}
                  <input
                    value={departmentCode}
                    onChange={(e) => setDepartmentCode(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder={t('attendancePayrollBucket.departmentPlaceholder')}
                  />
                </label>
              </div>
            )}
          </div>

          {selectedPeriodRow ? (
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-200 bg-slate-50">
                <div className="text-xs">
                  <span className="text-slate-600">{t('attendancePayrollBucket.closeStatusLabel')}: </span>
                  <span
                    className={cn(
                      'font-semibold',
                      selectedPeriodRow.is_closed ? 'text-rose-700' : 'text-emerald-700'
                    )}
                  >
                    {selectedPeriodRow.is_closed
                      ? t('attendancePayrollBucket.closeStatus.closed')
                      : t('attendancePayrollBucket.closeStatus.open')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void togglePeriodClose()}
                  disabled={running || closing}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium',
                    selectedPeriodRow.is_closed
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100',
                    (running || closing) && 'opacity-60'
                  )}
                >
                  {closing
                    ? t('common.loading')
                    : selectedPeriodRow.is_closed
                      ? t('attendancePayrollBucket.reopen')
                      : t('attendancePayrollBucket.close')}
                </button>
              </div>
              <table className="min-w-[640px] w-full text-xs">
                <thead>
                  <tr>
                    <th className={periodPreviewThCls} />
                    <th className={periodPreviewThCls}>{t('attendancePayrollBucket.grid.startEnd')}</th>
                    <th className={periodPreviewThCls}>{t('attendancePayrollBucket.grid.otStartEnd')}</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  <tr>
                    <td className={cn(periodPreviewTdCls, 'bg-slate-50/90 font-medium')}>{t('attendancePayrollBucket.grid.daily')}</td>
                    <td className={periodPreviewTdCls}>
                      {fmtShortYmd(selectedPeriodRow.start_date_daily)} ~ {fmtShortYmd(selectedPeriodRow.end_date_daily)}
                    </td>
                    <td className={periodPreviewTdCls}>
                      {fmtShortYmd(selectedPeriodRow.ot_start_daily)} ~ {fmtShortYmd(selectedPeriodRow.ot_end_daily)}
                    </td>
                  </tr>
                  <tr>
                    <td className={cn(periodPreviewTdCls, 'bg-slate-50/90 font-medium')}>{t('attendancePayrollBucket.grid.monthly')}</td>
                    <td className={periodPreviewTdCls}>
                      {fmtShortYmd(selectedPeriodRow.start_date_monthly)} ~ {fmtShortYmd(selectedPeriodRow.end_date_monthly)}
                    </td>
                    <td className={periodPreviewTdCls}>
                      {fmtShortYmd(selectedPeriodRow.ot_start_monthly)} ~ {fmtShortYmd(selectedPeriodRow.ot_end_monthly)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {t('attendancePayrollBucket.warnNoPeriodRow')}
            </div>
          )}

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setComputeDoneCount(null);
                setError('');
              }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('attendancePayrollBucket.clearResult')}
            </button>
            <button
              type="button"
              disabled={running || closing || !selectedPeriodRow || Boolean(selectedPeriodRow?.is_closed)}
              onClick={() => void runCompute()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('attendancePayrollBucket.process')}
            </button>
          </div>
        </div>
      </div>

      {computeDoneCount !== null ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900">
          {t('attendancePayrollBucket.computeDone').replace('{n}', String(computeDoneCount))}
        </div>
      ) : null}
    </div>
  );
}
