'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarRange,
  FileSpreadsheet,
  Flag,
  GitBranch,
  Layers2,
  LayoutGrid,
  Percent,
  PieChart as PieChartIcon,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Users,
  UsersRound,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { downloadHrReportExcel } from '@/lib/hrReportExcelExport';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import { cn } from '@/lib/utils';

type CompanyOption = {
  id: number;
  name_kor?: string | null;
  company_code?: string | null;
};

type MonthlyRow = {
  year_month: string;
  headcount: number;
  hires: number;
  terminations: number;
};

type AgeGenderRow = {
  age_bucket: string;
  male: number;
  female: number;
  unknown: number;
};

type CountLabelRow = { label: string; count: number };
type DeptWorkforceRow = {
  department: string;
  headcount: number;
  avg_age: number | null;
  terminations_12m: number;
  turnover_rate_pct: number;
};
type EmpWorkMatrixRow = { employment_type: string; work_status: string; count: number };
type JobStatRow = { label: string; headcount: number; avg_tenure_years: number | null };
type CohortSummaryRow = {
  hire_year: number;
  hired_total: number;
  still_active: number;
  retention_pct: number;
};
type CohortSurvivalSeries = { hire_year: number; points: { year: number; headcount: number }[] };

type HrAnalyticsSummary = {
  as_of: string;
  company_id: number | null;
  monthly_trend: MonthlyRow[];
  gender_totals: { male: number; female: number; unknown: number };
  age_gender: AgeGenderRow[];
  tenure_buckets: Record<string, number>;
  by_department: { department: string; headcount: number }[];
  by_employment_type?: CountLabelRow[];
  by_work_status?: CountLabelRow[];
  by_nationality?: CountLabelRow[];
  employment_work_matrix?: EmpWorkMatrixRow[];
  by_job_level?: JobStatRow[];
  by_position?: JobStatRow[];
  hire_cohort_summary?: CohortSummaryRow[];
  hire_cohort_survival?: CohortSurvivalSeries[];
  department_workforce?: DeptWorkforceRow[];
  terminations_window_days?: number;
  totals: { employees_all: number; employees_active: number };
};

const PIE_COLORS = ['#4f46e5', '#db2777', '#94a3b8'];
const LINE_COLORS = { headcount: '#4f46e5', hires: '#059669', terms: '#e11d48' };
const DEPARTMENT_CHART_TOP_N = 20;
const COHORT_LINE_TOP_N = 8;
const COHORT_LINE_PALETTE = [
  '#4f46e5',
  '#059669',
  '#d97706',
  '#db2777',
  '#0ea5e9',
  '#8b5cf6',
  '#64748b',
  '#ca8a04',
];
const CHART_TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  backgroundColor: 'rgba(255,255,255,0.96)',
  fontSize: 12,
  boxShadow: '0 10px 40px -10px rgb(15 23 42 / 0.15)',
};

function intlLocaleTag(locale: string): string {
  if (locale === 'ko') return 'ko-KR';
  if (locale === 'th') return 'th-TH';
  return 'en-US';
}

function ReportSection({
  id,
  icon: Icon,
  title,
  hint,
  children,
  className,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-900/[0.04] ring-1 ring-slate-900/[0.03]',
        className
      )}
    >
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-indigo-50/30 px-5 py-4">
        <div className="flex gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
            aria-hidden
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
            {hint ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:max-w-3xl">{hint}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  variant,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  variant: 'indigo' | 'slate' | 'emerald';
}) {
  const ring =
    variant === 'indigo'
      ? 'ring-indigo-100/80 hover:border-indigo-200/80'
      : variant === 'emerald'
        ? 'ring-emerald-100/80 hover:border-emerald-200/80'
        : 'ring-slate-100/80 hover:border-slate-200/80';
  const iconBg =
    variant === 'indigo'
      ? 'bg-indigo-600 text-white'
      : variant === 'emerald'
        ? 'bg-emerald-600 text-white'
        : 'bg-slate-700 text-white';

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:shadow-slate-900/5 ring-1',
        ring
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-slate-100/0 to-slate-100/80 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start gap-4">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm',
            iconBg
          )}
        >
          <Icon className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-3xl">
            {value}
          </p>
          {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function HrMasterReportPage() {
  const { t, locale } = useI18n();
  const fmtInt = useCallback(
    (n: number) => Number(n).toLocaleString(intlLocaleTag(locale)),
    [locale]
  );
  const fmtPct1 = useCallback((n: number) => `${n.toFixed(1)}%`, []);
  const { can, loading: permLoading } = useMenuPermissions();
  const allowRead = can('hr-master-report', 'can_read');

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState<number | ''>('');
  const [trendMonths, setTrendMonths] = useState(12);
  const [data, setData] = useState<HrAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [excelBusy, setExcelBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: { months: number; company_id?: number } = { months: trendMonths };
      if (companyId !== '') params.company_id = companyId;
      const res = await apiClient.getHrAnalyticsSummary(params);
      setData((res.data as HrAnalyticsSummary) ?? null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail || t('employees.hrReport.loadError'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, trendMonths, t]);

  useEffect(() => {
    if (permLoading || !allowRead) return;
    void (async () => {
      try {
        const companyRes = await apiClient.getMyCompanies();
        const list = (companyRes.data as CompanyOption[]) ?? [];
        setCompanies(list);
        if (list.length === 1) setCompanyId(list[0].id);
      } catch {
        setCompanies([]);
      }
    })();
  }, [permLoading, allowRead]);

  useEffect(() => {
    if (permLoading || !allowRead) return;
    void load();
  }, [permLoading, allowRead, load]);

  const departmentWorkforce = useMemo(() => {
    if (!data) return [];
    if (data.department_workforce?.length) return data.department_workforce;
    return data.by_department.map((r) => ({
      department: r.department,
      headcount: r.headcount,
      avg_age: null as number | null,
      terminations_12m: 0,
      turnover_rate_pct: 0,
    }));
  }, [data]);

  const handleExcelExport = useCallback(async () => {
    if (!data) return;
    setExcelBusy(true);
    try {
      await downloadHrReportExcel(
        {
          as_of: data.as_of,
          totals: data.totals,
          monthly_trend: data.monthly_trend ?? [],
          age_gender: data.age_gender ?? [],
          gender_totals: data.gender_totals ?? { male: 0, female: 0, unknown: 0 },
          tenure_buckets: data.tenure_buckets ?? {},
          department_workforce: departmentWorkforce,
          by_employment_type: data.by_employment_type ?? [],
          by_work_status: data.by_work_status ?? [],
          by_nationality: data.by_nationality ?? [],
          employment_work_matrix: data.employment_work_matrix ?? [],
          by_job_level: data.by_job_level ?? [],
          by_position: data.by_position ?? [],
          hire_cohort_summary: data.hire_cohort_summary ?? [],
          hire_cohort_survival: data.hire_cohort_survival ?? [],
        },
        {
          sheetSummary: t('employees.hrReport.excel.sheetSummary'),
          sheetTrend: t('employees.hrReport.excel.sheetTrend'),
          sheetAgeGender: t('employees.hrReport.excel.sheetAgeGender'),
          sheetGender: t('employees.hrReport.excel.sheetGender'),
          sheetTenure: t('employees.hrReport.excel.sheetTenure'),
          sheetNationality: t('employees.hrReport.excel.sheetNationality'),
          sheetDept: t('employees.hrReport.excel.sheetDept'),
          sheetEmployment: t('employees.hrReport.excel.sheetEmployment'),
          sheetWorkStatus: t('employees.hrReport.excel.sheetWorkStatus'),
          sheetMatrix: t('employees.hrReport.excel.sheetMatrix'),
          sheetJobLevel: t('employees.hrReport.excel.sheetJobLevel'),
          sheetPosition: t('employees.hrReport.excel.sheetPosition'),
          sheetCohort: t('employees.hrReport.excel.sheetCohort'),
          sheetCohortTrend: t('employees.hrReport.excel.sheetCohortTrend'),
          colAsOf: t('employees.hrReport.excel.colAsOf'),
          colMonth: t('employees.hrReport.excel.colMonth'),
          colHires: t('employees.hrReport.legend.hires'),
          colTerminations: t('employees.hrReport.legend.terms'),
          colActive: t('employees.hrReport.excel.colActive'),
          colAll: t('employees.hrReport.excel.colAll'),
          colMale: t('employees.hrReport.gender.male'),
          colFemale: t('employees.hrReport.gender.female'),
          colUnknown: t('employees.hrReport.gender.unknown'),
          colAgeBucket: t('employees.hrReport.excel.colAgeBucket'),
          colDepartment: t('employees.hrReport.table.department'),
          colHeadcount: t('employees.hrReport.table.headcount'),
          colAvgAge: t('employees.hrReport.table.avgAge'),
          colTerms12m: t('employees.hrReport.table.terms12m'),
          colTurnover: t('employees.hrReport.table.turnover'),
          colLabel: t('employees.hrReport.table.label'),
          colCount: t('employees.hrReport.table.count'),
          colEmployment: t('employees.hrReport.table.employmentType'),
          colWorkStatus: t('employees.hrReport.table.workStatus'),
          colAvgTenure: t('employees.hrReport.table.avgTenureYears'),
          colHireYear: t('employees.hrReport.table.hireYear'),
          colHiredTotal: t('employees.hrReport.table.hiredTotal'),
          colStillActive: t('employees.hrReport.table.stillActive'),
          colRetention: t('employees.hrReport.table.retentionPct'),
          colCalendarYear: t('employees.hrReport.table.calendarYear'),
        }
      );
    } finally {
      setExcelBusy(false);
    }
  }, [data, departmentWorkforce, t]);

  const ageLabel = useCallback(
    (key: string) => {
      const map: Record<string, string> = {
        lt20: t('employees.hrReport.age.lt20'),
        '20s': t('employees.hrReport.age.20s'),
        '30s': t('employees.hrReport.age.30s'),
        '40s': t('employees.hrReport.age.40s'),
        '50s': t('employees.hrReport.age.50s'),
        '60p': t('employees.hrReport.age.60p'),
        unknown: t('employees.hrReport.age.unknown'),
      };
      return map[key] ?? key;
    },
    [t]
  );

  const tenureLabel = useCallback(
    (key: string) => {
      const map: Record<string, string> = {
        lt1y: t('employees.hrReport.tenure.lt1y'),
        '1to3y': t('employees.hrReport.tenure.1to3y'),
        '3to5y': t('employees.hrReport.tenure.3to5y'),
        '5to10y': t('employees.hrReport.tenure.5to10y'),
        '10yp': t('employees.hrReport.tenure.10yp'),
        unknown: t('employees.hrReport.tenure.unknown'),
      };
      return map[key] ?? key;
    },
    [t]
  );

  const ageChartData = useMemo(() => {
    if (!data?.age_gender?.length) return [];
    return data.age_gender.map((row) => ({
      name: ageLabel(row.age_bucket),
      male: row.male,
      female: row.female,
      unknown: row.unknown,
    }));
  }, [data?.age_gender, ageLabel]);

  const tenureChartData = useMemo(() => {
    if (!data?.tenure_buckets) return [];
    const order = ['lt1y', '1to3y', '3to5y', '5to10y', '10yp', 'unknown'];
    return order
      .filter((k) => k in data.tenure_buckets)
      .map((k) => ({
        name: tenureLabel(k),
        count: data.tenure_buckets[k] ?? 0,
      }));
  }, [data?.tenure_buckets, tenureLabel]);

  const pieData = useMemo(() => {
    if (!data?.gender_totals) return [];
    const g = data.gender_totals;
    return [
      { name: t('employees.hrReport.gender.male'), value: g.male },
      { name: t('employees.hrReport.gender.female'), value: g.female },
      { name: t('employees.hrReport.gender.unknown'), value: g.unknown },
    ].filter((x) => x.value > 0);
  }, [data?.gender_totals, t]);

  const departmentChartData = useMemo(() => {
    if (!departmentWorkforce.length) return [];
    const slice = departmentWorkforce.slice(0, DEPARTMENT_CHART_TOP_N);
    return slice.map((row) => {
      const full = row.department;
      const maxLen = 28;
      const short = full.length > maxLen ? `${full.slice(0, maxLen - 1)}…` : full;
      return { name: short, fullName: full, headcount: row.headcount };
    });
  }, [departmentWorkforce]);

  const employmentTypeChartData = useMemo(() => {
    const rows = data?.by_employment_type ?? [];
    return rows.map((r) => ({ name: r.label, count: r.count }));
  }, [data?.by_employment_type]);

  const workStatusChartData = useMemo(() => {
    const rows = data?.by_work_status ?? [];
    return rows.map((r) => ({ name: r.label, count: r.count }));
  }, [data?.by_work_status]);

  const nationalityChartData = useMemo(() => {
    const rows = data?.by_nationality ?? [];
    return rows.map((r) => ({ name: r.label, count: r.count }));
  }, [data?.by_nationality]);

  const jobLevelChartData = useMemo(() => {
    const rows = data?.by_job_level ?? [];
    return rows.slice(0, 16).map((r) => ({
      name: r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label,
      fullName: r.label,
      headcount: r.headcount,
      avgTenure: r.avg_tenure_years,
    }));
  }, [data?.by_job_level]);

  const positionChartData = useMemo(() => {
    const rows = data?.by_position ?? [];
    return rows.slice(0, 16).map((r) => ({
      name: r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label,
      fullName: r.label,
      headcount: r.headcount,
      avgTenure: r.avg_tenure_years,
    }));
  }, [data?.by_position]);

  const topCohortSeries = useMemo(() => {
    const list = data?.hire_cohort_survival ?? [];
    if (!list.length) return [];
    return [...list].sort((a, b) => b.hire_year - a.hire_year).slice(0, COHORT_LINE_TOP_N);
  }, [data?.hire_cohort_survival]);

  const cohortLineChartData = useMemo(() => {
    if (!topCohortSeries.length) return [];
    const years = new Set<number>();
    topCohortSeries.forEach((c) => c.points.forEach((p) => years.add(p.year)));
    const sorted = Array.from(years).sort((a, b) => a - b);
    return sorted.map((y) => {
      const row: Record<string, string | number> = { calendar_year: String(y) };
      topCohortSeries.forEach((c) => {
        const pt = c.points.find((p) => p.year === y);
        row[`c${c.hire_year}`] = pt?.headcount ?? 0;
      });
      return row;
    });
  }, [topCohortSeries]);

  const departmentChartHeight = useMemo(() => {
    const n = departmentChartData.length;
    if (n === 0) return 280;
    return Math.min(720, Math.max(240, n * 36 + 48));
  }, [departmentChartData.length]);

  const insights = useMemo(() => {
    if (!data) return null;
    const { employees_active: active, employees_all: all } = data.totals;
    const ratePct = all > 0 ? Math.round((active / all) * 1000) / 10 : 0;
    const trend = data.monthly_trend;
    const last = trend.length > 0 ? trend[trend.length - 1] : null;
    const net = last ? last.hires - last.terminations : 0;
    return { ratePct, last, net };
  }, [data]);

  const navItems = useMemo(
    () => [
      { href: '#hr-report-kpi', label: t('employees.hrReport.nav.overview') },
      { href: '#hr-report-trend', label: t('employees.hrReport.nav.trend') },
      { href: '#hr-report-demographics', label: t('employees.hrReport.nav.demographics') },
      { href: '#hr-report-nationality', label: t('employees.hrReport.nav.nationality') },
      { href: '#hr-report-tenure', label: t('employees.hrReport.nav.tenure') },
      { href: '#hr-report-org', label: t('employees.hrReport.nav.org') },
      { href: '#hr-report-employment', label: t('employees.hrReport.nav.employment') },
      { href: '#hr-report-job-position', label: t('employees.hrReport.nav.jobPosition') },
      { href: '#hr-report-cohort', label: t('employees.hrReport.nav.cohort') },
    ],
    [t]
  );

  const selectCls =
    'rounded-xl border border-white/25 bg-white/95 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur-sm focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40 min-w-[160px]';

  if (permLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        {t('common.loading')}
      </div>
    );
  }

  if (!allowRead) {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 p-8 text-amber-950 shadow-sm">
        {t('permission.noAccess')}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/50 bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-800 p-6 text-white shadow-xl shadow-indigo-900/25 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-indigo-100 ring-1 ring-white/20">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden />
              {t('employees.hrReport.badge')}
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{t('employees.hrReport.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-indigo-100/95">
              {t('employees.hrReport.subtitle')}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-2 text-sm text-indigo-100">
              <Building2 className="h-4 w-4 shrink-0 opacity-90" />
              <select
                className={selectCls}
                value={companyId === '' ? '' : String(companyId)}
                onChange={(e) => setCompanyId(e.target.value === '' ? '' : Number(e.target.value))}
                aria-label={t('employees.hrReport.allCompanies')}
              >
                <option value="">{t('employees.hrReport.allCompanies')}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_kor || c.company_code || `#${c.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm text-indigo-100">
              <CalendarRange className="h-4 w-4 shrink-0 opacity-90" />
              <select
                className={selectCls}
                value={trendMonths}
                onChange={(e) => setTrendMonths(Number(e.target.value))}
                aria-label={t('employees.hrReport.months12')}
              >
                <option value={6}>{t('employees.hrReport.months6')}</option>
                <option value={12}>{t('employees.hrReport.months12')}</option>
                <option value={24}>{t('employees.hrReport.months24')}</option>
                <option value={36}>{t('employees.hrReport.months36')}</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-md transition hover:bg-indigo-50 disabled:opacity-60'
              )}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              {t('employees.hrReport.refresh')}
            </button>
            <button
              type="button"
              onClick={() => void handleExcelExport()}
              disabled={loading || excelBusy || !data}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:bg-white/20 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {t('employees.hrReport.excel.export')}
            </button>
          </div>
        </div>

        {data && insights?.last ? (
          <div className="relative mt-6 flex flex-wrap gap-3 rounded-xl bg-black/15 px-4 py-3 text-sm text-indigo-50 ring-1 ring-white/10 backdrop-blur-sm">
            <span className="font-medium text-white">{t('employees.hrReport.insight.title')}</span>
            <span className="text-indigo-100/90">
              {t('employees.hrReport.insight.lastMonthNet')
                .replace('{month}', insights.last.year_month)
                .replace(
                  '{net}',
                  `${insights.net >= 0 ? '+' : ''}${fmtInt(insights.net)}`
                )}
            </span>
          </div>
        ) : null}
      </div>

      {/* 목차 */}
      <nav
        className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 shadow-sm"
        aria-label={t('employees.hrReport.nav.title')}
      >
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-indigo-50 hover:text-indigo-800 hover:ring-indigo-200"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900 shadow-sm">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-2xl bg-slate-200/60" />
        </div>
      ) : null}

      {data && (
        <div id="hr-report-kpi" className="scroll-mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            icon={UserCheck}
            label={t('employees.hrReport.kpi.active')}
            value={fmtInt(data.totals.employees_active)}
            variant="indigo"
          />
          <KpiCard
            icon={Users}
            label={t('employees.hrReport.kpi.all')}
            value={fmtInt(data.totals.employees_all)}
            variant="slate"
          />
          <KpiCard
            icon={Percent}
            label={t('employees.hrReport.kpi.activeRate')}
            value={
              data.totals.employees_all > 0
                ? `${insights?.ratePct ?? 0}%`
                : '—'
            }
            sub={t('employees.hrReport.kpi.activeRateHint')}
            variant="emerald"
          />
        </div>
      )}

      {!loading && data && (
        <div className="space-y-8">
          <ReportSection
            id="hr-report-trend"
            icon={TrendingUp}
            title={t('employees.hrReport.section.trend')}
            hint={t('employees.hrReport.section.trendHint')}
          >
            <div className="h-[320px] w-full min-w-0">
              {data.monthly_trend.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400">
                  {t('employees.hrReport.empty')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.monthly_trend} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="year_month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      allowDecimals={false}
                      tickFormatter={(v) => fmtInt(Number(v))}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number | string) =>
                        typeof value === 'number' ? fmtInt(value) : String(value)
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                    <Line
                      type="monotone"
                      dataKey="headcount"
                      name={t('employees.hrReport.legend.headcount')}
                      stroke={LINE_COLORS.headcount}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="hires"
                      name={t('employees.hrReport.legend.hires')}
                      stroke={LINE_COLORS.hires}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="terminations"
                      name={t('employees.hrReport.legend.terms')}
                      stroke={LINE_COLORS.terms}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </ReportSection>

          <div id="hr-report-demographics" className="scroll-mt-24 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ReportSection
              icon={UsersRound}
              title={t('employees.hrReport.section.ageGender')}
              hint={t('employees.hrReport.section.ageGenderHint')}
            >
              <div className="h-[300px] w-full min-w-0">
                {ageChartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400">
                    {t('employees.hrReport.empty')}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageChartData} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        interval={0}
                        angle={-22}
                        textAnchor="end"
                        height={58}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        allowDecimals={false}
                        tickFormatter={(v) => fmtInt(Number(v))}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number | string) =>
                          typeof value === 'number' ? fmtInt(value) : String(value)
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Bar dataKey="male" name={t('employees.hrReport.gender.male')} stackId="a" fill="#4f46e5" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="female" name={t('employees.hrReport.gender.female')} stackId="a" fill="#db2777" radius={[0, 0, 0, 0]} />
                      <Bar
                        dataKey="unknown"
                        name={t('employees.hrReport.gender.unknown')}
                        stackId="a"
                        fill="#94a3b8"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ReportSection>

            <ReportSection
              icon={PieChartIcon}
              title={t('employees.hrReport.section.genderPie')}
              hint={t('employees.hrReport.section.genderPieHint')}
            >
              <div className="h-[300px] w-full min-w-0">
                {pieData.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400">
                    {t('employees.hrReport.empty')}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={88}
                        paddingAngle={2}
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#fff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number | string) =>
                          typeof value === 'number' ? fmtInt(value) : String(value)
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ReportSection>
          </div>

          <ReportSection
            id="hr-report-nationality"
            icon={Flag}
            title={t('employees.hrReport.section.nationality')}
            hint={t('employees.hrReport.section.nationalityHint')}
          >
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-slate-200/80">
                <div className="max-h-[min(380px,55vh)] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-200 bg-slate-100/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-4 py-3">{t('employees.hrReport.table.nationality')}</th>
                        <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.count')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {nationalityChartData.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-10 text-center text-slate-400">
                            {t('employees.hrReport.empty')}
                          </td>
                        </tr>
                      ) : (
                        nationalityChartData.map((row, idx) => (
                          <tr
                            key={row.name}
                            className={cn(
                              'transition-colors hover:bg-indigo-50/40',
                              idx % 2 === 1 && 'bg-slate-50/50'
                            )}
                          >
                            <td className="px-4 py-2.5 font-medium text-slate-800">{row.name}</td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                              {fmtInt(row.count)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  {t('employees.hrReport.section.nationalityChart')}
                </h3>
                <div className="mt-3 h-[300px] w-full min-w-0">
                  {nationalityChartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400">
                      {t('employees.hrReport.empty')}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={nationalityChartData} margin={{ top: 8, right: 8, left: 4, bottom: 72 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          interval={0}
                          angle={-24}
                          textAnchor="end"
                          height={84}
                          axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          allowDecimals={false}
                          tickFormatter={(v) => fmtInt(Number(v))}
                          axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number | string) =>
                            typeof value === 'number' ? fmtInt(value) : String(value)
                          }
                        />
                        <Bar dataKey="count" fill="#7c3aed" name={t('employees.hrReport.legend.count')} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="hr-report-tenure"
            icon={GitBranch}
            title={t('employees.hrReport.section.tenure')}
            hint={t('employees.hrReport.section.tenureHint')}
          >
            <div className="h-[300px] w-full min-w-0">
              {tenureChartData.every((r) => r.count === 0) ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400">
                  {t('employees.hrReport.empty')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tenureChartData} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id="tenureGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0.85} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={64}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      allowDecimals={false}
                      tickFormatter={(v) => fmtInt(Number(v))}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number | string) =>
                        typeof value === 'number' ? fmtInt(value) : String(value)
                      }
                    />
                    <Bar
                      dataKey="count"
                      name={t('employees.hrReport.legend.count')}
                      fill="url(#tenureGrad)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ReportSection>

          <ReportSection
            id="hr-report-org"
            icon={LayoutGrid}
            title={t('employees.hrReport.section.department')}
            hint={t('employees.hrReport.section.departmentHint')}
          >
            <p className="mb-4 text-xs text-slate-500">{t('employees.hrReport.section.deptWorkforceHint')}</p>
            <div className="overflow-hidden rounded-xl border border-slate-200/80">
              <div className="max-h-[min(520px,70vh)] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-200 bg-slate-100/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 backdrop-blur-sm">
                      <th className="px-4 py-3">{t('employees.hrReport.table.department')}</th>
                      <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.headcount')}</th>
                      <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.avgAge')}</th>
                      <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.terms12m')}</th>
                      <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.turnover')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {departmentWorkforce.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                          {t('employees.hrReport.empty')}
                        </td>
                      </tr>
                    ) : (
                      departmentWorkforce.map((row, idx) => (
                        <tr
                          key={row.department}
                          className={cn(
                            'transition-colors hover:bg-indigo-50/40',
                            idx % 2 === 1 && 'bg-slate-50/50'
                          )}
                        >
                          <td className="px-4 py-2.5 font-medium text-slate-800">{row.department}</td>
                          <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {fmtInt(row.headcount)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                            {row.avg_age != null ? row.avg_age.toFixed(1) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                            {fmtInt(row.terminations_12m)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">
                            {fmtPct1(row.turnover_rate_pct)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {departmentWorkforce.length > 0 ? (
              <div className="mt-8 border-t border-slate-100 pt-8">
                <h3 className="text-sm font-semibold text-slate-900">
                  {t('employees.hrReport.section.departmentChart')}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {departmentWorkforce.length > DEPARTMENT_CHART_TOP_N
                    ? t('employees.hrReport.section.departmentChartHintTopN').replace(
                        '{n}',
                        String(DEPARTMENT_CHART_TOP_N)
                      )
                    : t('employees.hrReport.section.departmentChartHint')}
                </p>
                <div className="mt-4 w-full min-w-0 rounded-xl border border-slate-100 bg-slate-50/30 p-2">
                  <div className="w-full min-w-0" style={{ height: departmentChartHeight }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={[...departmentChartData].reverse()}
                        margin={{ top: 8, right: 20, left: 12, bottom: 8 }}
                        barCategoryGap={8}
                      >
                        <defs>
                          <linearGradient id="deptBarGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.85} />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity={1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          allowDecimals={false}
                          tickFormatter={(v) => fmtInt(Number(v))}
                          axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={140}
                          tick={{ fontSize: 10, fill: '#475569' }}
                          interval={0}
                          axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number | string, _name: string, item) => {
                            const n = typeof value === 'number' ? value : Number(value);
                            const payload = (item as { payload?: { fullName?: string } })?.payload;
                            const label = payload?.fullName ?? '';
                            return [Number.isFinite(n) ? fmtInt(n) : String(value), label];
                          }}
                        />
                        <Bar
                          dataKey="headcount"
                          name={t('employees.hrReport.table.headcount')}
                          fill="url(#deptBarGrad)"
                          radius={[0, 6, 6, 0]}
                          maxBarSize={26}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : null}

            <p className="mt-6 flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-block h-1 w-1 rounded-full bg-slate-300" aria-hidden />
              {t('employees.hrReport.asOf')}:{' '}
              <time dateTime={data.as_of} className="font-medium text-slate-500">
                {data.as_of}
              </time>
            </p>
          </ReportSection>

          <ReportSection
            id="hr-report-employment"
            icon={Briefcase}
            title={t('employees.hrReport.section.employmentWork')}
            hint={t('employees.hrReport.section.employmentWorkHint')}
          >
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  {t('employees.hrReport.section.employmentTypeChart')}
                </h3>
                <div className="mt-3 h-[260px] w-full min-w-0">
                  {employmentTypeChartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400">
                      {t('employees.hrReport.empty')}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={employmentTypeChartData} margin={{ top: 8, right: 8, left: 4, bottom: 48 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={56}
                          axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          allowDecimals={false}
                          tickFormatter={(v) => fmtInt(Number(v))}
                          axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number | string) =>
                            typeof value === 'number' ? fmtInt(value) : String(value)
                          }
                        />
                        <Bar dataKey="count" fill="#4f46e5" name={t('employees.hrReport.legend.count')} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  {t('employees.hrReport.section.workStatusChart')}
                </h3>
                <div className="mt-3 h-[260px] w-full min-w-0">
                  {workStatusChartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400">
                      {t('employees.hrReport.empty')}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={workStatusChartData} margin={{ top: 8, right: 8, left: 4, bottom: 48 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={56}
                          axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          allowDecimals={false}
                          tickFormatter={(v) => fmtInt(Number(v))}
                          axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number | string) =>
                            typeof value === 'number' ? fmtInt(value) : String(value)
                          }
                        />
                        <Bar dataKey="count" fill="#059669" name={t('employees.hrReport.legend.count')} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-slate-800">
                {t('employees.hrReport.section.employmentMatrix')}
              </h3>
              <p className="mt-1 text-xs text-slate-500">{t('employees.hrReport.section.employmentMatrixHint')}</p>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200/80">
                <div className="max-h-[min(360px,50vh)] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-200 bg-slate-100/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-4 py-3">{t('employees.hrReport.table.employmentType')}</th>
                        <th className="px-4 py-3">{t('employees.hrReport.table.workStatus')}</th>
                        <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.count')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(data.employment_work_matrix ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                            {t('employees.hrReport.empty')}
                          </td>
                        </tr>
                      ) : (
                        (data.employment_work_matrix ?? []).map((row, idx) => (
                          <tr
                            key={`${row.employment_type}-${row.work_status}-${idx}`}
                            className={cn(
                              'transition-colors hover:bg-indigo-50/40',
                              idx % 2 === 1 && 'bg-slate-50/50'
                            )}
                          >
                            <td className="px-4 py-2.5 text-slate-800">{row.employment_type}</td>
                            <td className="px-4 py-2.5 text-slate-800">{row.work_status}</td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                              {fmtInt(row.count)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </ReportSection>

          <div id="hr-report-job-position" className="scroll-mt-24 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ReportSection
              icon={Layers2}
              title={t('employees.hrReport.section.jobLevel')}
              hint={t('employees.hrReport.section.jobLevelHint')}
            >
              <div className="overflow-hidden rounded-xl border border-slate-200/80">
                <div className="max-h-[min(400px,55vh)] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-200 bg-slate-100/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-4 py-3">{t('employees.hrReport.table.jobLevel')}</th>
                        <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.headcount')}</th>
                        <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.avgTenureYears')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(data.by_job_level ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                            {t('employees.hrReport.empty')}
                          </td>
                        </tr>
                      ) : (
                        (data.by_job_level ?? []).map((row, idx) => (
                          <tr
                            key={row.label}
                            className={cn(
                              'transition-colors hover:bg-indigo-50/40',
                              idx % 2 === 1 && 'bg-slate-50/50'
                            )}
                          >
                            <td className="px-4 py-2.5 font-medium text-slate-800">{row.label}</td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                              {fmtInt(row.headcount)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                              {row.avg_tenure_years != null ? row.avg_tenure_years.toFixed(2) : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {jobLevelChartData.length > 0 ? (
                <div className="mt-6 h-[280px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={[...jobLevelChartData].reverse()}
                      margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        allowDecimals={false}
                        tickFormatter={(v) => fmtInt(Number(v))}
                      />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: '#475569' }} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number | string, _n, item) => {
                          const payload = (item as { payload?: { fullName?: string; avgTenure?: number | null } })
                            ?.payload;
                          const tenure =
                            payload?.avgTenure != null ? ` · ${payload.avgTenure.toFixed(2)}y` : '';
                          const v = typeof value === 'number' ? fmtInt(value) : String(value);
                          return [`${v}${tenure}`, payload?.fullName ?? ''];
                        }}
                      />
                      <Bar dataKey="headcount" fill="#6366f1" radius={[0, 6, 6, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </ReportSection>

            <ReportSection
              icon={Users}
              title={t('employees.hrReport.section.position')}
              hint={t('employees.hrReport.section.positionHint')}
            >
              <div className="overflow-hidden rounded-xl border border-slate-200/80">
                <div className="max-h-[min(400px,55vh)] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-200 bg-slate-100/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-4 py-3">{t('employees.hrReport.table.position')}</th>
                        <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.headcount')}</th>
                        <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.avgTenureYears')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(data.by_position ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                            {t('employees.hrReport.empty')}
                          </td>
                        </tr>
                      ) : (
                        (data.by_position ?? []).map((row, idx) => (
                          <tr
                            key={row.label}
                            className={cn(
                              'transition-colors hover:bg-indigo-50/40',
                              idx % 2 === 1 && 'bg-slate-50/50'
                            )}
                          >
                            <td className="px-4 py-2.5 font-medium text-slate-800">{row.label}</td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                              {fmtInt(row.headcount)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                              {row.avg_tenure_years != null ? row.avg_tenure_years.toFixed(2) : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {positionChartData.length > 0 ? (
                <div className="mt-6 h-[280px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={[...positionChartData].reverse()}
                      margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        allowDecimals={false}
                        tickFormatter={(v) => fmtInt(Number(v))}
                      />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: '#475569' }} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number | string, _n, item) => {
                          const payload = (item as { payload?: { fullName?: string; avgTenure?: number | null } })
                            ?.payload;
                          const tenure =
                            payload?.avgTenure != null ? ` · ${payload.avgTenure.toFixed(2)}y` : '';
                          const v = typeof value === 'number' ? fmtInt(value) : String(value);
                          return [`${v}${tenure}`, payload?.fullName ?? ''];
                        }}
                      />
                      <Bar dataKey="headcount" fill="#0d9488" radius={[0, 6, 6, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </ReportSection>
          </div>

          <ReportSection
            id="hr-report-cohort"
            icon={CalendarRange}
            title={t('employees.hrReport.section.cohort')}
            hint={t('employees.hrReport.section.cohortHint')}
          >
            <div className="overflow-hidden rounded-xl border border-slate-200/80">
              <div className="max-h-[min(320px,45vh)] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-200 bg-slate-100/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <th className="px-4 py-3">{t('employees.hrReport.table.hireYear')}</th>
                      <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.hiredTotal')}</th>
                      <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.stillActive')}</th>
                      <th className="px-4 py-3 text-right tabular-nums">{t('employees.hrReport.table.retentionPct')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(data.hire_cohort_summary ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                          {t('employees.hrReport.empty')}
                        </td>
                      </tr>
                    ) : (
                      (data.hire_cohort_summary ?? []).map((row, idx) => (
                        <tr
                          key={row.hire_year}
                          className={cn(
                            'transition-colors hover:bg-indigo-50/40',
                            idx % 2 === 1 && 'bg-slate-50/50'
                          )}
                        >
                          <td className="px-4 py-2.5 font-medium text-slate-800">{row.hire_year}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(row.hired_total)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(row.still_active)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">
                            {fmtPct1(row.retention_pct)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">{t('employees.hrReport.section.cohortSurvivalHint')}</p>
            <div className="mt-6 h-[340px] w-full min-w-0">
              {cohortLineChartData.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-400">
                  {t('employees.hrReport.empty')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cohortLineChartData} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="calendar_year"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      allowDecimals={false}
                      tickFormatter={(v) => fmtInt(Number(v))}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number | string) =>
                        typeof value === 'number' ? fmtInt(value) : String(value)
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    {topCohortSeries.map((c, i) => (
                      <Line
                        key={c.hire_year}
                        type="monotone"
                        dataKey={`c${c.hire_year}`}
                        name={String(c.hire_year)}
                        stroke={COHORT_LINE_PALETTE[i % COHORT_LINE_PALETTE.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </ReportSection>
        </div>
      )}
    </div>
  );
}
