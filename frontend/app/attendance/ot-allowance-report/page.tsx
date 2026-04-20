'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { FileDown, RefreshCw } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '@/lib/api';
import { downloadTextFile } from '@/lib/downloadTextFile';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import type { Locale } from '@/i18n/types';

const NUMBER_LOCALE_BY_APP: Record<Locale, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  th: 'th-TH',
};

function formatInteger(n: number, locale: Locale): string {
  if (!Number.isFinite(n)) return '0';
  return Math.trunc(n).toLocaleString(NUMBER_LOCALE_BY_APP[locale]);
}

function formatMoney(n: number, locale: Locale): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(NUMBER_LOCALE_BY_APP[locale], { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** DB·집계 분 단위 합계 → 표시용 `시간:분` (예: 125:40, 0:05) */
function formatHourMinuteFromTotalMinutes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0:00';
  const total = Math.round(n);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function fmtYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shiftYmdYear(ymd: string, yearDelta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return ymd;
  const nextY = y + yearDelta;
  const lastDay = new Date(nextY, mo, 0).getDate();
  const safeD = Math.min(d, lastDay);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${nextY}-${p(mo)}-${p(safeD)}`;
}

function shiftYearMonth(ym: string, yearDelta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return ym;
  return `${String(y + yearDelta)}-${String(mo).padStart(2, '0')}`;
}

type ReportTab = 'department' | 'ot';

type SummaryPayload = {
  date_from: string | null;
  date_to: string | null;
  source_row_count: number;
  by_department: Record<string, unknown>[];
  ot_buckets: Record<string, number>;
};

type TrendRow = Record<string, unknown>;

const DEPT_VALUE_KEYS = [
  'oth1',
  'oth2',
  'oth3',
  'oth4',
  'oth5',
  'oth6',
  'shift_allowance',
  'shift_ot_allowance',
  'shift_over_ot_allowance',
  'food_allowance',
  'food_ot_allowance',
  'food_over_ot_allowance',
  'special_ot_allowance',
  'special_allowance',
  'overtime_pay_local',
  'shift_pay_local',
  'day_food',
  'day_wages',
  'day_food_ot',
  'day_wages_ot',
  'fuel_allowance',
  'standing_allowance',
  'other_allowance',
] as const;

function OtTrendCharts({
  byDay,
  byMonth,
  byDayPrevYear,
  byMonthPrevYear,
  t,
  locale,
}: {
  byDay: TrendRow[];
  byMonth: TrendRow[];
  byDayPrevYear: TrendRow[];
  byMonthPrevYear: TrendRow[];
  t: (k: string) => string;
  locale: Locale;
}) {
  const chartId = useId().replace(/[^a-zA-Z0-9]/g, '');

  const dayChart = useMemo(
    () => {
      const curMap = new Map<string, { total_ot_minutes: number; othb: number }>();
      const prevMap = new Map<string, { total_ot_minutes: number; othb: number }>();
      for (const r of byDay || []) {
        const key = String(r.work_day ?? '');
        if (!key) continue;
        curMap.set(key, {
          total_ot_minutes: Number(r.total_ot_minutes ?? 0),
          othb: Number(r.othb ?? 0),
        });
      }
      for (const r of byDayPrevYear || []) {
        const prevDay = String(r.work_day ?? '');
        if (!prevDay) continue;
        const alignKey = shiftYmdYear(prevDay, 1);
        prevMap.set(alignKey, {
          total_ot_minutes: Number(r.total_ot_minutes ?? 0),
          othb: Number(r.othb ?? 0),
        });
      }
      const keys = Array.from(new Set([...Array.from(curMap.keys()), ...Array.from(prevMap.keys())])).sort((a, b) => a.localeCompare(b));
      return keys.map((k) => ({
        x: k.slice(5),
        xFull: k,
        total_ot_minutes: curMap.get(k)?.total_ot_minutes ?? 0,
        othb: curMap.get(k)?.othb ?? 0,
        prev_total_ot_minutes: prevMap.get(k)?.total_ot_minutes ?? 0,
        prev_othb: prevMap.get(k)?.othb ?? 0,
      }));
    },
    [byDay, byDayPrevYear]
  );
  const monthChart = useMemo(
    () => {
      const curMap = new Map<string, { total_ot_minutes: number; othb: number }>();
      const prevMap = new Map<string, { total_ot_minutes: number; othb: number }>();
      for (const r of byMonth || []) {
        const key = String(r.year_month ?? '');
        if (!key) continue;
        curMap.set(key, {
          total_ot_minutes: Number(r.total_ot_minutes ?? 0),
          othb: Number(r.othb ?? 0),
        });
      }
      for (const r of byMonthPrevYear || []) {
        const prevMonth = String(r.year_month ?? '');
        if (!prevMonth) continue;
        const alignKey = shiftYearMonth(prevMonth, 1);
        prevMap.set(alignKey, {
          total_ot_minutes: Number(r.total_ot_minutes ?? 0),
          othb: Number(r.othb ?? 0),
        });
      }
      const keys = Array.from(new Set([...Array.from(curMap.keys()), ...Array.from(prevMap.keys())])).sort((a, b) => a.localeCompare(b));
      return keys.map((k) => ({
        x: k,
        xFull: k,
        total_ot_minutes: curMap.get(k)?.total_ot_minutes ?? 0,
        othb: curMap.get(k)?.othb ?? 0,
        prev_total_ot_minutes: prevMap.get(k)?.total_ot_minutes ?? 0,
        prev_othb: prevMap.get(k)?.othb ?? 0,
      }));
    },
    [byMonth, byMonthPrevYear]
  );

  const tipFormatter = (value: number, name: string) => {
    if (name === t('attendanceOtAllowanceReport.seriesOthb')) return [formatMoney(value, locale), name];
    return [formatHourMinuteFromTotalMinutes(value), name];
  };

  const renderChart = (data: typeof dayChart, title: string, xLabel: string, gradSuffix: string) => (
    <div className="w-full rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-md ring-1 ring-slate-100/90">
      <div className="text-base font-semibold text-slate-900 tracking-tight">{title}</div>
      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{t('attendanceOtAllowanceReport.chartAxisHint')}</p>
      {data.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">{t('attendanceStatusInquiry.empty')}</div>
      ) : (
        <div className="h-[320px] xl:h-[380px] w-full min-w-0 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 32, left: 4, bottom: 28 }}>
              <defs>
                <linearGradient id={`otFill-${chartId}-${gradSuffix}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                label={{ value: xLabel, position: 'insideBottom', offset: -18, fontSize: 11, fill: '#64748b' }}
              />
              <YAxis
                yAxisId="min"
                tick={{ fontSize: 11, fill: '#4f46e5' }}
                tickLine={false}
                axisLine={{ stroke: '#c7d2fe' }}
                tickFormatter={(v) => formatHourMinuteFromTotalMinutes(Number(v))}
                width={62}
                label={{
                  value: t('attendanceOtAllowanceReport.axisOtMinutes'),
                  angle: -90,
                  position: 'insideLeft',
                  offset: 4,
                  fontSize: 11,
                  fill: '#4f46e5',
                }}
              />
              <YAxis
                yAxisId="thb"
                orientation="right"
                tick={{ fontSize: 11, fill: '#059669' }}
                tickLine={false}
                axisLine={{ stroke: '#a7f3d0' }}
                tickFormatter={(v) => formatMoney(Number(v), locale)}
                width={52}
                label={{
                  value: t('attendanceOtAllowanceReport.axisOthb'),
                  angle: 90,
                  position: 'insideRight',
                  offset: 4,
                  fontSize: 11,
                  fill: '#059669',
                }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 10px 40px -12px rgb(15 23 42 / 0.2)',
                }}
                formatter={tipFormatter as (...args: unknown[]) => [string, string]}
                labelFormatter={(_label, payload) => {
                  const p = payload?.[0]?.payload as { xFull?: string } | undefined;
                  return p?.xFull ? p.xFull : '';
                }}
              />
              <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12 }} iconType="circle" />
              <Area
                yAxisId="min"
                type="monotone"
                dataKey="total_ot_minutes"
                stroke="none"
                fill={`url(#otFill-${chartId}-${gradSuffix})`}
                isAnimationActive={false}
                legendType="none"
              />
              <Line
                yAxisId="min"
                type="monotone"
                dataKey="total_ot_minutes"
                name={t('attendanceOtAllowanceReport.seriesTotalOtMin')}
                stroke="#4f46e5"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#4f46e5', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="thb"
                type="monotone"
                dataKey="othb"
                name={t('attendanceOtAllowanceReport.seriesOthb')}
                stroke="#059669"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#059669', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="min"
                type="monotone"
                dataKey="prev_total_ot_minutes"
                name={t('attendanceOtAllowanceReport.seriesTotalOtMinPrevYear')}
                stroke="#7c3aed"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                yAxisId="thb"
                type="monotone"
                dataKey="prev_othb"
                name={t('attendanceOtAllowanceReport.seriesOthbPrevYear')}
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  return (
    <div className="mt-8 flex flex-col gap-6 w-full">
      <div className="min-w-0 w-full">
        {renderChart(dayChart, t('attendanceOtAllowanceReport.chartDailyOt'), t('attendanceOtAllowanceReport.chartAxisDay'), 'd')}
      </div>
      <div className="min-w-0 w-full">
        {renderChart(monthChart, t('attendanceOtAllowanceReport.chartMonthlyOt'), t('attendanceOtAllowanceReport.chartAxisMonth'), 'm')}
      </div>
    </div>
  );
}

export default function AttendanceOtAllowanceReportPage() {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-ot-allowance-report', 'can_read');

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState(fmtYmd(monthStart));
  const [dateTo, setDateTo] = useState(fmtYmd(today));
  const [companyFilter, setCompanyFilter] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState<'active' | 'terminated' | 'inactive' | 'all'>('active');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<ReportTab>('department');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [trends, setTrends] = useState<{
    by_day: TrendRow[];
    by_month: TrendRow[];
    by_day_prev_year: TrendRow[];
    by_month_prev_year: TrendRow[];
  }>({ by_day: [], by_month: [], by_day_prev_year: [], by_month_prev_year: [] });
  const [companies, setCompanies] = useState<
    Array<{ id: number; company_code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>
  >([]);

  useEffect(() => {
    void apiClient
      .getMyCompanies()
      .then(({ data }) => setCompanies((data as typeof companies) || []))
      .catch(() => setCompanies([]));
  }, []);

  const companyNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of companies) {
      m.set(c.id, c.name_kor || c.name_eng || c.name_thai || c.company_code);
    }
    return m;
  }, [companies]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cid = companyFilter ? Number(companyFilter) : undefined;
      const resolvedSearch = searchTerm.trim();
      const params = {
        company_id: cid && Number.isFinite(cid) ? cid : undefined,
        status: employmentStatus,
        search: resolvedSearch || undefined,
        date_from: dateFrom,
        date_to: dateTo,
      };
      const prevParams = {
        ...params,
        date_from: shiftYmdYear(dateFrom, -1),
        date_to: shiftYmdYear(dateTo, -1),
      };
      const [sumRes, trRes, trPrevRes] = await Promise.all([
        apiClient.getAttendanceTimeDayReportSummary(params),
        apiClient.getAttendanceTimeDayReportTrends(params),
        apiClient.getAttendanceTimeDayReportTrends(prevParams),
      ]);
      setSummary(sumRes.data as SummaryPayload);
      const tr = trRes.data as { by_day?: TrendRow[]; by_month?: TrendRow[] };
      const trPrev = trPrevRes.data as { by_day?: TrendRow[]; by_month?: TrendRow[] };
      setTrends({
        by_day: tr.by_day || [],
        by_month: tr.by_month || [],
        by_day_prev_year: trPrev.by_day || [],
        by_month_prev_year: trPrev.by_month || [],
      });
    } catch {
      setSummary(null);
      setTrends({ by_day: [], by_month: [], by_day_prev_year: [], by_month_prev_year: [] });
    } finally {
      setLoading(false);
    }
  }, [companyFilter, dateFrom, dateTo, employmentStatus, searchTerm]);

  useEffect(() => {
    if (!allowRead) return;
    void load();
  }, [allowRead, load]);

  const unitHm = t('attendanceOtAllowanceReport.unitHourMinute');

  const otRows = useMemo(() => {
    const b = summary?.ot_buckets;
    if (!b) return [];
    return [
      { label: t('attendanceStatusInquiry.col.ot1'), minutes: Number(b.oth1 ?? 0), unit: unitHm },
      { label: t('attendanceStatusInquiry.col.ot15'), minutes: Number(b.oth2 ?? 0), unit: unitHm },
      { label: t('attendanceStatusInquiry.col.ot2'), minutes: Number(b.oth3 ?? 0), unit: unitHm },
      { label: t('attendanceStatusInquiry.col.ot25'), minutes: Number(b.oth4 ?? 0), unit: unitHm },
      { label: t('attendanceStatusInquiry.col.ot3'), minutes: Number(b.oth5 ?? 0), unit: unitHm },
      { label: t('attendanceStatusInquiry.col.ot6'), minutes: Number(b.oth6 ?? 0), unit: unitHm },
      { label: t('attendanceStatusInquiry.col.otBaht'), minutes: Number(b.othb ?? 0), unit: t('attendanceOtAllowanceReport.unitOthb'), isMoney: true },
    ];
  }, [summary?.ot_buckets, t, unitHm]);

  const exportCsv = () => {
    if (!summary) return;
    const df = summary.date_from ?? dateFrom;
    const dt = summary.date_to ?? dateTo;
    if (tab === 'department') {
      const headers = [
        t('employees.field.company'),
        t('attendanceOverview.col.department'),
        t('attendanceOtAllowanceReport.dayRows'),
        ...DEPT_VALUE_KEYS.map((k) => (k.startsWith('oth') ? `${k}(h:mm)` : `${k}(amt)`)),
      ];
      const lines = [
        headers.map(csvEscape).join(','),
        ...summary.by_department.map((r) => {
          const cells: unknown[] = [r.company_name, r.department, r.day_rows];
          for (const k of DEPT_VALUE_KEYS) {
            if (k.startsWith('oth')) {
              cells.push(formatHourMinuteFromTotalMinutes(Number(r[k] ?? 0)));
            } else {
              cells.push(r[k]);
            }
          }
          return cells.map(csvEscape).join(',');
        }),
      ];
      downloadTextFile(`attendance-report-dept-${df}_${dt}.csv`, lines.join('\n'));
      return;
    }
    const lines = [
      [t('attendanceOtAllowanceReport.colLabel'), t('attendanceOtAllowanceReport.colSum'), t('attendanceOtAllowanceReport.colUnit')].map(csvEscape).join(','),
      ...otRows.map((r) =>
        [r.label, r.isMoney ? formatMoney(r.minutes, locale) : formatHourMinuteFromTotalMinutes(r.minutes), r.unit].map(csvEscape).join(','),
      ),
    ];
    downloadTextFile(`attendance-report-ot-${df}_${dt}.csv`, lines.join('\n'));
  };

  const otHeaderLabel = (k: 'oth1' | 'oth2' | 'oth3' | 'oth4' | 'oth5' | 'oth6') =>
    t(
      `attendanceStatusInquiry.col.${
        k === 'oth1' ? 'ot1' : k === 'oth2' ? 'ot15' : k === 'oth3' ? 'ot2' : k === 'oth4' ? 'ot25' : k === 'oth5' ? 'ot3' : 'ot6'
      }`,
    );

  if (!allowRead) {
    return <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">{t('permission.noAccess')}</div>;
  }

  return (
    <div className="p-2 sm:p-4 max-w-[min(100%,1920px)] w-full mx-auto relative" aria-busy={loading}>
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-indigo-50/40 shadow-lg shadow-slate-200/50 p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-start gap-4 justify-end">
          {summary != null ? (
            <div className="text-sm text-slate-500 tabular-nums text-right bg-white/80 rounded-xl px-3 py-2 border border-slate-100 shadow-sm">
              {t('attendanceOtAllowanceReport.sourceRows')}:{' '}
              <span className="font-semibold text-slate-800">{formatInteger(summary.source_row_count, locale)}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-white/85 border border-slate-100 shadow-sm backdrop-blur-sm">
          <div className="min-w-[160px]">
            <label className="text-xs font-medium text-slate-600 block mb-1.5">{t('employees.field.company')}</label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
            >
              <option value="">{t('employees.companyFilter.all')}</option>
              {companies.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {companyNameById.get(c.id) || c.company_code}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="text-xs font-medium text-slate-600 block mb-1.5">{t('employees.filter.status')}</label>
            <select
              value={employmentStatus}
              onChange={(e) => setEmploymentStatus(e.target.value as typeof employmentStatus)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="active">{t('employees.status.active')}</option>
              <option value="terminated">{t('employees.status.terminated')}</option>
              <option value="inactive">{t('employees.status.inactive')}</option>
              <option value="all">{t('employees.filter.status.all')}</option>
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="text-xs font-medium text-slate-600 block mb-1.5">{t('attendanceInquiry.dateFrom')}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="min-w-[130px]">
            <label className="text-xs font-medium text-slate-600 block mb-1.5">{t('attendanceInquiry.dateTo')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="text-xs font-medium text-slate-600 block mb-1.5">{t('attendanceOverview.search')}</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  setSearchTerm(searchInput.trim());
                }
              }}
              placeholder={t('attendanceOverview.searchPlaceholder')}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <button
            type="button"
            onClick={() => setSearchTerm(searchInput.trim())}
            disabled={loading}
            className="h-[42px] px-4 rounded-xl border border-indigo-300 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 inline-flex items-center gap-2 shadow-md shadow-indigo-200/50"
          >
            <RefreshCw className="w-4 h-4" />
            {loading ? t('common.loading') : t('attendanceOtAllowanceReport.reload')}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!summary || loading}
            className="h-[42px] px-4 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2 shadow-sm"
          >
            <FileDown className="w-4 h-4" />
            {t('attendanceOtAllowanceReport.exportCsv')}
          </button>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist">
          {(
            [
              ['department', t('attendanceOtAllowanceReport.tabDepartment')],
              ['ot', t('attendanceOtAllowanceReport.tabOtBuckets')],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium rounded-xl border transition-all',
                tab === k
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200/60'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/40',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'ot' ? (
          <>
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-slate-100 overflow-hidden">
              <div className="px-4 py-3 text-sm text-slate-600 border-b border-slate-100 bg-slate-50/80">{t('attendanceOtAllowanceReport.otTableHint')}</div>
              <div className="overflow-auto max-h-[min(520px,70vh)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-900 text-white sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">{t('attendanceOtAllowanceReport.colLabel')}</th>
                      <th className="px-4 py-3 text-right font-semibold">{t('attendanceOtAllowanceReport.colSum')}</th>
                      <th className="px-4 py-3 text-right font-semibold w-[8rem]">{t('attendanceOtAllowanceReport.colUnit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otRows.map((r, idx) => (
                      <tr key={r.label} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                        <td className="px-4 py-2.5 text-slate-800">{r.label}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                          {r.isMoney ? formatMoney(r.minutes, locale) : formatHourMinuteFromTotalMinutes(r.minutes)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{r.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <OtTrendCharts
              byDay={trends.by_day}
              byMonth={trends.by_month}
              byDayPrevYear={trends.by_day_prev_year}
              byMonthPrevYear={trends.by_month_prev_year}
              t={t}
              locale={locale}
            />
          </>
        ) : null}

        {tab === 'department' ? (
          <>
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-slate-100 overflow-hidden">
              <div className="px-4 py-3 text-sm text-slate-600 border-b border-slate-100 bg-slate-50/80 space-y-1">
                <div>{t('attendanceOtAllowanceReport.deptTableHintOt')}</div>
                <div>{t('attendanceOtAllowanceReport.deptTableHintMoney')}</div>
              </div>
              <div className="overflow-auto max-h-[min(560px,72vh)]">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead className="bg-slate-900 text-white sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-3 text-left whitespace-nowrap font-semibold">{t('employees.field.company')}</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap font-semibold">{t('attendanceOverview.col.department')}</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap font-semibold">{t('attendanceOtAllowanceReport.dayRows')}</th>
                      {(['oth1', 'oth2', 'oth3', 'oth4', 'oth5', 'oth6'] as const).map((k) => (
                        <th key={k} className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                          <span className="block">{otHeaderLabel(k)}</span>
                          <span className="block text-[10px] font-normal text-slate-400 normal-case mt-0.5">({unitHm})</span>
                        </th>
                      ))}
                      <th className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                        <span className="block">{t('attendanceStatusInquiry.col.shiftAllw')}</span>
                        <span className="block text-[10px] font-normal text-slate-400">({t('attendanceOtAllowanceReport.unitAllowanceShort')})</span>
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                        <span className="block">{t('attendanceStatusInquiry.col.foodAllw')}</span>
                        <span className="block text-[10px] font-normal text-slate-400">({t('attendanceOtAllowanceReport.unitAllowanceShort')})</span>
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                        <span className="block">{t('attendanceStatusInquiry.col.foodOtAllw')}</span>
                        <span className="block text-[10px] font-normal text-slate-400">({t('attendanceOtAllowanceReport.unitAllowanceShort')})</span>
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                        <span className="block">{t('attendanceStatusInquiry.col.special')}</span>
                        <span className="block text-[10px] font-normal text-slate-400">({t('attendanceOtAllowanceReport.unitAllowanceShort')})</span>
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                        <span className="block">{t('attendanceStatusInquiry.col.fuelAllw')}</span>
                        <span className="block text-[10px] font-normal text-slate-400">({t('attendanceOtAllowanceReport.unitAllowanceShort')})</span>
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                        <span className="block">{t('attendanceStatusInquiry.col.standingAllw')}</span>
                        <span className="block text-[10px] font-normal text-slate-400">({t('attendanceOtAllowanceReport.unitAllowanceShort')})</span>
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                        <span className="block">{t('attendanceStatusInquiry.col.otherAllw')}</span>
                        <span className="block text-[10px] font-normal text-slate-400">({t('attendanceOtAllowanceReport.unitAllowanceShort')})</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {!summary || summary.by_department.length === 0 ? (
                      <tr>
                        <td colSpan={16} className="px-4 py-12 text-center text-slate-500">
                          {loading ? t('common.loading') : t('attendanceStatusInquiry.empty')}
                        </td>
                      </tr>
                    ) : (
                      summary.by_department.map((r, idx) => (
                        <tr key={`${r.company_id}-${r.department}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                          <td className="px-3 py-2 max-w-[160px] truncate text-slate-800">{String(r.company_name ?? '')}</td>
                          <td className="px-3 py-2 max-w-[120px] truncate text-slate-800">{String(r.department ?? '')}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatInteger(Number(r.day_rows ?? 0), locale)}</td>
                          {(['oth1', 'oth2', 'oth3', 'oth4', 'oth5', 'oth6'] as const).map((k) => (
                            <td key={k} className="px-3 py-2 text-right tabular-nums text-indigo-950/90 font-medium">
                              {formatHourMinuteFromTotalMinutes(Number(r[k] ?? 0))}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatMoney(Number(r.shift_allowance ?? 0), locale)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatMoney(Number(r.food_allowance ?? 0), locale)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatMoney(Number(r.food_ot_allowance ?? 0), locale)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatMoney(Number(r.special_allowance ?? 0), locale)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatMoney(Number(r.fuel_allowance ?? 0), locale)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatMoney(Number(r.standing_allowance ?? 0), locale)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatMoney(Number(r.other_allowance ?? 0), locale)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <OtTrendCharts
              byDay={trends.by_day}
              byMonth={trends.by_month}
              byDayPrevYear={trends.by_day_prev_year}
              byMonthPrevYear={trends.by_month_prev_year}
              t={t}
              locale={locale}
            />
          </>
        ) : null}
      </div>

      {loading ? (
        <div className="fixed inset-0 z-[70] bg-slate-900/15 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-xl text-sm font-medium text-slate-700 pointer-events-auto">
            {t('common.loading')}
          </div>
        </div>
      ) : null}
    </div>
  );
}
