'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock3, HelpCircle, LayoutGrid, Moon, Sun, Users } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import type { Locale } from '@/i18n/types';

const NUMBER_LOCALE_BY_APP: Record<Locale, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  th: 'th-TH',
};

/** 천단위 구분 표시 (UI 언어와 맞춤) */
function formatInteger(n: number, locale: Locale): string {
  if (!Number.isFinite(n)) return '0';
  return Math.trunc(n).toLocaleString(NUMBER_LOCALE_BY_APP[locale]);
}

type TimeInOutRow = {
  employee_id?: number | null;
  company_id?: number | null;
  employee_number?: string | null;
  employee_name?: string | null;
  employee_department?: string | null;
  date_i?: string | null;
  date_in_out?: string | null;
  shift_group_name?: string | null;
  shift_work_code?: string | null;
};

type TimeDayRow = {
  employee_id?: number | null;
  company_id?: number | null;
  employee_department?: string | null;
  shift_code?: string | null;
  no_of_shift?: string | null;
  day_off?: boolean | null;
  without_pay_public_holiday?: boolean | null;
  doc_sick?: boolean | null;
  leave?: number | string | null;
  leave_w?: number | string | null;
  leave_days?: number | string | null;
  leave_minutes?: number | string | null;
};

type PersonReportRow = {
  employeeId: number;
  companyId: number | null;
  companyName: string;
  employeeNo: string;
  name: string;
  department: string;
  /** 근무조(출퇴근현황과 동일 출처) */
  shiftGroupName: string;
  /** 교대근무 코드 */
  shiftWorkCode: string;
  /** 근태일 행의 교대구분(있으면 주·야 추정에 사용) */
  noOfShift: string | null;
  firstPunch: string;
  lastPunch: string;
  firstPunchAt: string;
  lastPunchAt: string;
  punchCount: number;
  isLeave: boolean;
};

type ShiftBand = 'day' | 'night' | 'unknown';

type DetailCategory = 'checkIn' | 'checkOut' | 'leave' | 'dayShift' | 'nightShift' | 'shiftUnknown';

type BreakdownTab = 'company' | 'department' | 'shiftGroup' | 'shiftWork';

type BreakdownTableRow = {
  dim1: string;
  dim2: string | null;
  total: number;
  checkedIn: number;
  checkedOut: number;
  leave: number;
};

type GroupSummaryRow = {
  key: string;
  total: number;
  checkedIn: number;
  checkedOut: number;
  leave: number;
};

type CoSubSummaryRow = {
  company: string;
  sub: string;
  total: number;
  checkedIn: number;
  checkedOut: number;
  leave: number;
};

type TrendDayCompany = { companyName: string; present: number; checkedOut: number };

function fmtHm(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtYmdHm(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtYmd(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function parseHmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** 주·야 추정: 마스터 키워드 → 교대구분(1/2) → 최초 타각 시각 순 */
function classifyShiftBand(r: PersonReportRow): ShiftBand {
  const ns = String(r.noOfShift ?? '')
    .trim()
    .toLowerCase()
    .replace(/^0+/, '');
  if (ns === '1' || ns === 'd') return 'day';
  if (ns === '2' || ns === 'n') return 'night';

  const blob = `${r.shiftGroupName} ${r.shiftWorkCode}`.toLowerCase();
  if (/(야간|night|n-?shift|graveyard|2교대|후반조|evening\s*shift)/i.test(blob)) return 'night';
  if (/(주간|day-?shift|데이|1교대|morning|오전조|day\s*crew)/i.test(blob)) return 'day';
  if (/office\s*a/i.test(blob)) return 'day';

  const mins = parseHmToMinutes(r.firstPunch);
  if (mins == null) return 'unknown';
  if (mins >= 6 * 60 && mins < 19 * 60) return 'day';
  return 'night';
}

export default function AttendanceReportPage() {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-report', 'can_read');

  const today = new Date();
  const [reportDate, setReportDate] = useState(fmtYmd(today));
  const [companyFilter, setCompanyFilter] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState<'active' | 'terminated' | 'inactive' | 'all'>('active');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [companies, setCompanies] = useState<Array<{ id: number; company_code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PersonReportRow[]>([]);
  const [trendRows, setTrendRows] = useState<Array<{ day: string; companies: TrendDayCompany[] }>>([]);
  const [detailModal, setDetailModal] = useState<{ open: boolean; title: string; rows: PersonReportRow[] }>({
    open: false,
    title: '',
    rows: [],
  });
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>('company');
  const deptMapByCompanyRef = useRef<Map<number, Map<string, string>>>(new Map());

  useEffect(() => {
    void apiClient.getMyCompanies().then(({ data }) => {
      setCompanies((data as typeof companies) || []);
    }).catch(() => setCompanies([]));
  }, []);

  const companyNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of companies) {
      m.set(c.id, c.name_kor || c.name_eng || c.name_thai || c.company_code);
    }
    return m;
  }, [companies]);

  const toNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const isLeaveRecord = (r?: TimeDayRow): boolean => {
    if (!r) return false;
    if (Boolean(r.day_off) || Boolean(r.without_pay_public_holiday) || Boolean(r.doc_sick)) return true;
    if (toNum(r.leave) > 0 || toNum(r.leave_w) > 0 || toNum(r.leave_days) > 0 || toNum(r.leave_minutes) > 0) return true;
    return false;
  };

  const load = useCallback(async (nextSearch?: string) => {
    setLoading(true);
    try {
      const cid = companyFilter ? Number(companyFilter) : undefined;
      const resolvedSearch = (nextSearch ?? searchTerm).trim();
      const trendFrom = new Date(`${reportDate}T12:00:00`);
      trendFrom.setDate(trendFrom.getDate() - 6);
      const trendStart = fmtYmd(trendFrom);

      const fetchTimeDayAllItems = async (): Promise<TimeDayRow[]> => {
        // Keep within backend validation range (422 prevention).
        const pageSize = 1000;
        let page = 1;
        let total = Number.POSITIVE_INFINITY;
        const all: TimeDayRow[] = [];
        while (all.length < total) {
          const { data } = await apiClient.getAttendanceTimeDayAll({
            company_id: cid && Number.isFinite(cid) ? cid : undefined,
            status: employmentStatus,
            search: resolvedSearch || undefined,
            date_from: reportDate,
            date_to: reportDate,
            page,
            page_size: pageSize,
          });
          const payload = (data || {}) as { items?: TimeDayRow[]; total?: number };
          const items = (payload.items || []) as TimeDayRow[];
          const rawTotal = Number(payload.total);
          total = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : all.length + items.length;
          all.push(...items);
          if (items.length < pageSize) break;
          page += 1;
        }
        return all;
      };

      const [ioRes, dayItems, trendRes] = await Promise.all([
        apiClient.getAttendanceTimeInOutAll({
          company_id: cid && Number.isFinite(cid) ? cid : undefined,
          status: employmentStatus,
          search: resolvedSearch || undefined,
          date_from: reportDate,
          date_to: reportDate,
          limit: 10000,
        }),
        fetchTimeDayAllItems(),
        apiClient.getAttendanceTimeInOutAll({
          company_id: cid && Number.isFinite(cid) ? cid : undefined,
          status: employmentStatus,
          search: resolvedSearch || undefined,
          date_from: trendStart,
          date_to: reportDate,
          limit: 20000,
        }),
      ]);
      const ioItems = ((ioRes.data as { items?: TimeInOutRow[] })?.items || []) as TimeInOutRow[];
      const dayByEmp = new Map<number, TimeDayRow>();
      for (const r of dayItems) {
        const empId = Number(r.employee_id || 0);
        if (!empId) continue;
        if (!dayByEmp.has(empId)) dayByEmp.set(empId, r);
      }

      const needDeptCompanyIds = new Set<number>();
      for (const row of ioItems) {
        const companyId = Number(row.company_id || 0);
        if (companyId) needDeptCompanyIds.add(companyId);
      }
      const missingDeptCompanyIds = Array.from(needDeptCompanyIds).filter((companyId) => !deptMapByCompanyRef.current.has(companyId));
      if (missingDeptCompanyIds.length > 0) {
        await Promise.all(
          missingDeptCompanyIds.map(async (companyId) => {
            try {
              const { data } = await apiClient.getEmployeeReferenceItems('department', companyId);
              const refs = (Array.isArray(data) ? data : []) as Array<{
                code: string;
                name_kor?: string | null;
                name_eng?: string | null;
                name_thai?: string | null;
              }>;
              const map = new Map<string, string>();
              for (const ref of refs) {
                const code = String(ref.code || '').trim();
                if (!code) continue;
                map.set(code, ref.name_kor || ref.name_eng || ref.name_thai || code);
              }
              deptMapByCompanyRef.current.set(companyId, map);
            } catch {
              deptMapByCompanyRef.current.set(companyId, new Map());
            }
          })
        );
      }
      const byEmp = new Map<number, { first: Date; last: Date; count: number }>();
      const firstRowByEmp = new Map<number, TimeInOutRow>();
      for (const r of ioItems) {
        const id = Number(r.employee_id || 0);
        if (!id) continue;
        const raw = r.date_in_out || r.date_i;
        if (!raw) continue;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) continue;
        const cur = byEmp.get(id);
        if (!cur) {
          byEmp.set(id, { first: d, last: d, count: 1 });
        } else {
          if (d.getTime() < cur.first.getTime()) cur.first = d;
          if (d.getTime() > cur.last.getTime()) cur.last = d;
          cur.count += 1;
        }
        if (!firstRowByEmp.has(id)) firstRowByEmp.set(id, r);
      }

      const personRows: PersonReportRow[] = [];
      for (const [empId, punchAgg] of Array.from(byEmp.entries())) {
        const base = firstRowByEmp.get(empId);
        if (!base) continue;
        const day = dayByEmp.get(empId);
        const first = punchAgg.first || null;
        const last = punchAgg.last || null;
        const companyId = base.company_id ?? null;
        const companyName = companyId != null ? companyNameById.get(companyId) || '-' : '-';
        const rawDept = String(base.employee_department || day?.employee_department || '-').trim() || '-';
        const deptName = companyId != null ? deptMapByCompanyRef.current.get(companyId)?.get(rawDept) || rawDept : rawDept;
        const shiftGroupName = String(base.shift_group_name ?? '').trim() || '-';
        const shiftWorkCode =
          String(base.shift_work_code ?? day?.shift_code ?? '').trim() || '-';
        const leave = isLeaveRecord(day);
        const noOfShift = day ? String(day.no_of_shift ?? '').trim() || null : null;

        personRows.push({
          employeeId: empId,
          companyId,
          companyName,
          employeeNo: String(base.employee_number || '-'),
          name: String(base.employee_name || '-'),
          department: deptName,
          shiftGroupName,
          shiftWorkCode,
          noOfShift,
          firstPunch: first ? fmtHm(first.toISOString()) : '-',
          lastPunch: last ? fmtHm(last.toISOString()) : '-',
          firstPunchAt: first ? fmtYmdHm(first.toISOString()) : '-',
          lastPunchAt: last ? fmtYmdHm(last.toISOString()) : '-',
          punchCount: punchAgg.count,
          isLeave: leave,
        });
      }

      personRows.sort((a, b) => a.department.localeCompare(b.department) || a.employeeNo.localeCompare(b.employeeNo));
      setRows(personRows);

      const trendItems = ((trendRes.data as { items?: TimeInOutRow[] })?.items || []) as TimeInOutRow[];
      const perDay = new Map<string, Map<number, Map<number, number>>>();
      for (const item of trendItems) {
        const id = Number(item.employee_id || 0);
        const cid = Number(item.company_id || 0);
        const raw = item.date_in_out || item.date_i;
        if (!id || !raw || !cid) continue;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) continue;
        const day = fmtYmd(d);
        if (day < trendStart || day > reportDate) continue;
        const byCo = perDay.get(day) || new Map<number, Map<number, number>>();
        const byEmp = byCo.get(cid) || new Map<number, number>();
        byEmp.set(id, (byEmp.get(id) || 0) + 1);
        byCo.set(cid, byEmp);
        perDay.set(day, byCo);
      }
      const trend: Array<{ day: string; companies: TrendDayCompany[] }> = [];
      const cursor = new Date(`${trendStart}T12:00:00`);
      const end = new Date(`${reportDate}T12:00:00`);
      while (cursor.getTime() <= end.getTime()) {
        const day = fmtYmd(cursor);
        const byCo = perDay.get(day) || new Map<number, Map<number, number>>();
        const sortedCids = Array.from(byCo.keys()).sort((a, b) => {
          const na = companyNameById.get(a) || '';
          const nb = companyNameById.get(b) || '';
          return na.localeCompare(nb, undefined, { sensitivity: 'base' });
        });
        const companies: TrendDayCompany[] = sortedCids.map((cid) => {
          const empCounts = byCo.get(cid)!;
          let checkedOut = 0;
          Array.from(empCounts.values()).forEach((n) => {
            if (n >= 2) checkedOut += 1;
          });
          return {
            companyName: companyNameById.get(cid) || `ID:${cid}`,
            present: empCounts.size,
            checkedOut,
          };
        });
        trend.push({ day, companies });
        cursor.setDate(cursor.getDate() + 1);
      }
      setTrendRows(trend);
    } catch {
      setRows([]);
      setTrendRows([]);
    } finally {
      setLoading(false);
    }
  }, [companyFilter, companyNameById, employmentStatus, reportDate, searchTerm]);

  const applySearchAndLoad = useCallback(() => {
    const nextSearch = searchInput.trim();
    if (nextSearch === searchTerm) {
      void load(nextSearch);
      return;
    }
    setSearchTerm(nextSearch);
  }, [load, searchInput, searchTerm]);

  useEffect(() => {
    if (!allowRead) return;
    void load();
  }, [allowRead, load]);

  const companySummary = useMemo(() => {
    const m = new Map<string, GroupSummaryRow>();
    for (const r of rows) {
      const key = r.companyName || '-';
      const cur = m.get(key) || { key, total: 0, checkedIn: 0, checkedOut: 0, leave: 0 };
      cur.total += 1;
      if (r.punchCount >= 1) cur.checkedIn += 1;
      if (r.punchCount >= 2) cur.checkedOut += 1;
      if (r.isLeave) cur.leave += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [rows]);

  const companyDepartmentSummary = useMemo(() => {
    const m = new Map<string, CoSubSummaryRow>();
    for (const r of rows) {
      const key = `${r.companyName}\u0000${r.department}`;
      const cur =
        m.get(key) ||
        ({ company: r.companyName, sub: r.department, total: 0, checkedIn: 0, checkedOut: 0, leave: 0 } satisfies CoSubSummaryRow);
      cur.total += 1;
      if (r.punchCount >= 1) cur.checkedIn += 1;
      if (r.punchCount >= 2) cur.checkedOut += 1;
      if (r.isLeave) cur.leave += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort(
      (a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) || a.sub.localeCompare(b.sub, undefined, { sensitivity: 'base' })
    );
  }, [rows]);

  const companyShiftGroupSummary = useMemo(() => {
    const m = new Map<string, CoSubSummaryRow>();
    for (const r of rows) {
      const key = `${r.companyName}\u0000${r.shiftGroupName}`;
      const cur =
        m.get(key) ||
        ({ company: r.companyName, sub: r.shiftGroupName, total: 0, checkedIn: 0, checkedOut: 0, leave: 0 } satisfies CoSubSummaryRow);
      cur.total += 1;
      if (r.punchCount >= 1) cur.checkedIn += 1;
      if (r.punchCount >= 2) cur.checkedOut += 1;
      if (r.isLeave) cur.leave += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort(
      (a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) || a.sub.localeCompare(b.sub, undefined, { sensitivity: 'base' })
    );
  }, [rows]);

  const companyShiftWorkSummary = useMemo(() => {
    const m = new Map<string, CoSubSummaryRow>();
    for (const r of rows) {
      const key = `${r.companyName}\u0000${r.shiftWorkCode}`;
      const cur =
        m.get(key) ||
        ({ company: r.companyName, sub: r.shiftWorkCode, total: 0, checkedIn: 0, checkedOut: 0, leave: 0 } satisfies CoSubSummaryRow);
      cur.total += 1;
      if (r.punchCount >= 1) cur.checkedIn += 1;
      if (r.punchCount >= 2) cur.checkedOut += 1;
      if (r.isLeave) cur.leave += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort(
      (a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) || a.sub.localeCompare(b.sub, undefined, { sensitivity: 'base' })
    );
  }, [rows]);

  const kpi = useMemo(() => {
    const total = rows.length;
    const checkedIn = rows.filter((r) => r.punchCount >= 1).length;
    const checkedOut = rows.filter((r) => r.punchCount >= 2).length;
    const leave = rows.filter((r) => r.isLeave).length;
    const checkOutRate = total > 0 ? Math.min(100, Math.round((checkedOut / total) * 100)) : 0;
    return { total, checkedIn, checkedOut, leave, checkOutRate };
  }, [rows]);

  const shiftBandKpi = useMemo(() => {
    const checked = rows.filter((r) => r.punchCount >= 1);
    let day = 0;
    let night = 0;
    let unknown = 0;
    for (const r of checked) {
      const b = classifyShiftBand(r);
      if (b === 'day') day += 1;
      else if (b === 'night') night += 1;
      else unknown += 1;
    }
    return { day, night, unknown, base: checked.length };
  }, [rows]);

  const breakdownTableRows = useMemo((): BreakdownTableRow[] => {
    switch (breakdownTab) {
      case 'company':
        return companySummary.map((r) => ({
          dim1: r.key,
          dim2: null,
          total: r.total,
          checkedIn: r.checkedIn,
          checkedOut: r.checkedOut,
          leave: r.leave,
        }));
      case 'department':
        return companyDepartmentSummary.map((r) => ({
          dim1: r.company,
          dim2: r.sub,
          total: r.total,
          checkedIn: r.checkedIn,
          checkedOut: r.checkedOut,
          leave: r.leave,
        }));
      case 'shiftGroup':
        return companyShiftGroupSummary.map((r) => ({
          dim1: r.company,
          dim2: r.sub,
          total: r.total,
          checkedIn: r.checkedIn,
          checkedOut: r.checkedOut,
          leave: r.leave,
        }));
      case 'shiftWork':
        return companyShiftWorkSummary.map((r) => ({
          dim1: r.company,
          dim2: r.sub,
          total: r.total,
          checkedIn: r.checkedIn,
          checkedOut: r.checkedOut,
          leave: r.leave,
        }));
      default:
        return [];
    }
  }, [breakdownTab, companySummary, companyDepartmentSummary, companyShiftGroupSummary, companyShiftWorkSummary]);

  const breakdownTabLabel = (tab: BreakdownTab) => {
    const map: Record<BreakdownTab, string> = {
      company: t('attendanceReport.breakdown.tabCompany'),
      department: t('attendanceReport.breakdown.tabDepartment'),
      shiftGroup: t('attendanceReport.breakdown.tabShiftGroup'),
      shiftWork: t('attendanceReport.breakdown.tabShiftWork'),
    };
    return map[tab];
  };

  const openDetail = (category: DetailCategory) => {
    const checked = rows.filter((r) => r.punchCount >= 1);
    const byCategory: Record<DetailCategory, PersonReportRow[]> = {
      checkIn: checked,
      checkOut: rows.filter((r) => r.punchCount >= 2),
      leave: rows.filter((r) => r.isLeave),
      dayShift: checked.filter((r) => classifyShiftBand(r) === 'day'),
      nightShift: checked.filter((r) => classifyShiftBand(r) === 'night'),
      shiftUnknown: checked.filter((r) => classifyShiftBand(r) === 'unknown'),
    };
    const titleByCategory: Record<DetailCategory, string> = {
      checkIn: t('attendanceReport.kpi.checkIn'),
      checkOut: t('attendanceReport.kpi.checkOut'),
      leave: t('attendanceReport.kpi.leave'),
      dayShift: t('attendanceReport.kpi.dayShift'),
      nightShift: t('attendanceReport.kpi.nightShift'),
      shiftUnknown: t('attendanceReport.kpi.shiftUnknown'),
    };
    setDetailModal({
      open: true,
      title: titleByCategory[category],
      rows: byCategory[category],
    });
  };

  if (!allowRead) {
    return <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">{t('permission.noAccess')}</div>;
  }

  return (
    <div className="p-1.5 sm:p-3 relative" aria-busy={loading}>
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-sky-50/60 to-white shadow-sm p-3 sm:p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px]">
            <label className="text-xs text-gray-600 block mb-1">{t('employees.field.company')}</label>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
              <option value="">{t('employees.companyFilter.all')}</option>
              {companies.map((c) => <option key={c.id} value={String(c.id)}>{companyNameById.get(c.id) || c.company_code}</option>)}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="text-xs text-gray-600 block mb-1">{t('employees.filter.status')}</label>
            <select value={employmentStatus} onChange={(e) => setEmploymentStatus((e.target.value as 'active' | 'terminated' | 'inactive' | 'all'))} className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
              <option value="active">{t('employees.status.active')}</option>
              <option value="terminated">{t('employees.status.terminated')}</option>
              <option value="inactive">{t('employees.status.inactive')}</option>
              <option value="all">{t('employees.filter.status.all')}</option>
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="text-xs text-gray-600 block mb-1">{t('attendanceReport.targetDate')}</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm bg-white" />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="text-xs text-gray-600 block mb-1">{t('attendanceOverview.search')}</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  applySearchAndLoad();
                }
              }}
              placeholder={t('attendanceOverview.searchPlaceholder')}
              className="w-full border rounded-lg px-2 py-2 text-sm bg-white"
            />
          </div>
          <button type="button" onClick={applySearchAndLoad} disabled={loading} className="h-[38px] px-4 rounded-lg border border-sky-300 bg-sky-50 text-sky-900 text-sm font-medium hover:bg-sky-100 disabled:opacity-60">
            {loading ? t('common.loading') : t('attendanceInquiry.reload')}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100/80">
            <div className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
              <Users className="w-4 h-4 text-slate-400" />
              {t('attendanceReport.kpi.total')}
            </div>
            <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{formatInteger(kpi.total, locale)}</div>
            <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${kpi.checkOutRate}%` }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500">
              {t('attendanceReport.kpi.checkOutRate')}: <span className="font-semibold text-slate-700">{kpi.checkOutRate}%</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openDetail('checkIn')}
            className="rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/80 to-white p-4 text-left shadow-sm ring-1 ring-emerald-100/60 hover:from-emerald-50 hover:shadow-md transition-all"
          >
            <div className="text-xs text-emerald-800/80 flex items-center gap-1.5 font-medium">
              <Clock3 className="w-4 h-4 text-emerald-600" />
              {t('attendanceReport.kpi.checkIn')}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{formatInteger(kpi.checkedIn, locale)}</div>
          </button>
          <button
            type="button"
            onClick={() => openDetail('checkOut')}
            className="rounded-xl border border-sky-200/90 bg-gradient-to-br from-sky-50/80 to-white p-4 text-left shadow-sm ring-1 ring-sky-100/60 hover:from-sky-50 hover:shadow-md transition-all"
          >
            <div className="text-xs text-sky-800/80 flex items-center gap-1.5 font-medium">
              <CalendarDays className="w-4 h-4 text-sky-600" />
              {t('attendanceReport.kpi.checkOut')}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-sky-700">{formatInteger(kpi.checkedOut, locale)}</div>
          </button>
          <button
            type="button"
            onClick={() => openDetail('leave')}
            className="rounded-xl border border-violet-200/90 bg-gradient-to-br from-violet-50/80 to-white p-4 text-left shadow-sm ring-1 ring-violet-100/60 hover:from-violet-50 hover:shadow-md transition-all"
          >
            <div className="text-xs text-violet-800/80 flex items-center gap-1.5 font-medium">
              <CalendarDays className="w-4 h-4 text-violet-600" />
              {t('attendanceReport.kpi.leave')}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-violet-700">{formatInteger(kpi.leave, locale)}</div>
          </button>
        </div>

        <div className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/70 via-white to-indigo-50/40 p-4 shadow-sm ring-1 ring-amber-100/50">
          <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-500" />
                {t('attendanceReport.kpi.dayShift')}
                <span className="text-slate-300 font-light">|</span>
                <Moon className="w-4 h-4 text-indigo-500" />
                {t('attendanceReport.kpi.nightShift')}
              </div>
              <p className="mt-2 text-[11px] text-slate-600 leading-relaxed max-w-3xl flex gap-2">
                <HelpCircle className="w-4 h-4 shrink-0 text-amber-600/80 mt-0.5" aria-hidden />
                <span>{t('attendanceReport.shiftBand.hint')}</span>
              </p>
            </div>
            <div className="text-[11px] text-slate-500 tabular-nums lg:text-right">
              {t('attendanceReport.kpi.checkIn')}:{' '}
              <span className="font-semibold text-slate-800">{formatInteger(shiftBandKpi.base, locale)}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <button
              type="button"
              onClick={() => openDetail('dayShift')}
              className="rounded-xl border border-amber-200/80 bg-white/90 p-4 text-left shadow-sm hover:bg-amber-50/40 hover:border-amber-300 transition-colors"
            >
              <div className="text-xs text-amber-900/70 flex items-center gap-1.5 font-medium">
                <Sun className="w-3.5 h-3.5" />
                {t('attendanceReport.kpi.dayShift')}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-amber-800">{formatInteger(shiftBandKpi.day, locale)}</div>
            </button>
            <button
              type="button"
              onClick={() => openDetail('nightShift')}
              className="rounded-xl border border-indigo-200/80 bg-white/90 p-4 text-left shadow-sm hover:bg-indigo-50/40 hover:border-indigo-300 transition-colors"
            >
              <div className="text-xs text-indigo-900/70 flex items-center gap-1.5 font-medium">
                <Moon className="w-3.5 h-3.5" />
                {t('attendanceReport.kpi.nightShift')}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-indigo-800">{formatInteger(shiftBandKpi.night, locale)}</div>
            </button>
            <button
              type="button"
              onClick={() => openDetail('shiftUnknown')}
              className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-left shadow-sm hover:bg-slate-50 transition-colors"
            >
              <div className="text-xs text-slate-600 flex items-center gap-1.5 font-medium">{t('attendanceReport.kpi.shiftUnknown')}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{formatInteger(shiftBandKpi.unknown, locale)}</div>
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden ring-1 ring-slate-100/80">
          <div className="px-3 py-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <LayoutGrid className="w-4 h-4 text-slate-500" />
              {t('attendanceReport.breakdown.title')}
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('attendanceReport.breakdown.title')}>
              {(['company', 'department', 'shiftGroup', 'shiftWork'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={breakdownTab === tab}
                  onClick={() => setBreakdownTab(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    breakdownTab === tab
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {breakdownTabLabel(tab)}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-auto max-h-[min(480px,62vh)]">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-800 text-white sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{t('employees.field.company')}</th>
                  {breakdownTab !== 'company' ? (
                    <th className="px-3 py-2.5 text-left font-semibold">
                      {breakdownTab === 'department'
                        ? t('attendanceOverview.col.department')
                        : breakdownTab === 'shiftGroup'
                          ? t('attendanceReport.col.shiftGroup')
                          : t('attendanceReport.col.rotatingShift')}
                    </th>
                  ) : null}
                  <th className="px-3 py-2.5 text-right font-semibold">{t('attendanceReport.kpi.total')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('attendanceReport.kpi.checkIn')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('attendanceReport.kpi.checkOut')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('attendanceReport.kpi.leave')}</th>
                </tr>
              </thead>
              <tbody>
                {breakdownTableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={breakdownTab === 'company' ? 5 : 6}
                      className="px-3 py-10 text-center text-gray-500"
                    >
                      {loading ? t('common.loading') : t('attendanceStatusInquiry.empty')}
                    </td>
                  </tr>
                ) : (
                  breakdownTableRows.map((r, idx) => (
                    <tr
                      key={`${r.dim1}-${r.dim2 ?? ''}-${idx}`}
                      className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      <td className="px-3 py-2 text-slate-900 whitespace-nowrap max-w-[200px] truncate" title={r.dim1}>
                        {r.dim1}
                      </td>
                      {breakdownTab !== 'company' ? (
                        <td className="px-3 py-2 text-slate-800 max-w-[180px] truncate" title={r.dim2 ?? ''}>
                          {r.dim2}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">{formatInteger(r.total, locale)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatInteger(r.checkedIn, locale)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-sky-700">{formatInteger(r.checkedOut, locale)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-violet-700">{formatInteger(r.leave, locale)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm ring-1 ring-slate-100/80">
          <div className="px-3 py-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white text-sm font-semibold text-slate-900">
            {t('attendanceReport.trendSection')}
          </div>
          <div className="p-3 overflow-x-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 min-w-0">
              {trendRows.map((r) => {
                const maxPresent = Math.max(1, ...r.companies.map((c) => c.present));
                return (
                  <div
                    key={r.day}
                    className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white p-3 flex flex-col min-h-[150px] shadow-sm"
                  >
                    <div className="text-[11px] font-bold text-white bg-slate-700 rounded-md px-2 py-1 inline-block w-fit mb-2 tabular-nums">
                      {r.day}
                    </div>
                    <div className="space-y-2 overflow-y-auto flex-1 max-h-56 pr-0.5">
                      {r.companies.length === 0 ? (
                        <div className="text-[11px] text-gray-400 py-3 text-center">—</div>
                      ) : (
                        r.companies.map((c) => {
                          const barH = Math.max(6, Math.round((c.present / maxPresent) * 44));
                          return (
                            <div
                              key={c.companyName}
                              className="rounded-lg border border-slate-100 bg-white px-2.5 py-2 shadow-sm"
                            >
                              <div
                                className="text-[10px] font-semibold text-slate-800 leading-tight line-clamp-2"
                                title={c.companyName}
                              >
                                {c.companyName}
                              </div>
                              <div className="mt-2 h-11 flex items-end gap-1.5">
                                <div
                                  className="flex-1 rounded-md bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-inner"
                                  style={{ height: `${barH}px` }}
                                  title={`${t('attendanceReport.kpi.checkIn')}: ${formatInteger(c.present, locale)}`}
                                />
                              </div>
                              <div className="mt-2 text-[10px] text-slate-800 tabular-nums font-medium">
                                {t('attendanceReport.kpi.checkIn')}: {formatInteger(c.present, locale)}
                              </div>
                              <div className="text-[10px] text-slate-500 tabular-nums">
                                {t('attendanceReport.kpi.checkOut')}: {formatInteger(c.checkedOut, locale)}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {detailModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailModal({ open: false, title: '', rows: [] })}>
          <div className="w-full max-w-5xl max-h-[85vh] bg-white rounded-lg border shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                {detailModal.title}{' '}
                <span className="font-normal text-slate-500 tabular-nums">
                  ({formatInteger(detailModal.rows.length, locale)})
                </span>
              </h3>
              <button type="button" className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50" onClick={() => setDetailModal({ open: false, title: '', rows: [] })}>
                {t('common.close')}
              </button>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="px-2 py-2 text-left">{t('employees.field.company')}</th>
                    <th className="px-2 py-2 text-left">{t('attendanceOverview.col.department')}</th>
                    <th className="px-2 py-2 text-left">{t('attendanceOverview.col.employeeNo')}</th>
                    <th className="px-2 py-2 text-left">{t('attendanceOverview.col.employeeName')}</th>
                    <th className="px-2 py-2 text-left">{t('attendanceReport.col.shiftGroup')}</th>
                    <th className="px-2 py-2 text-left">{t('attendanceReport.col.rotatingShift')}</th>
                    <th className="px-2 py-2 text-left">{t('attendanceReport.firstPunch')}</th>
                    <th className="px-2 py-2 text-left">{t('attendanceReport.lastPunch')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detailModal.rows.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">{t('attendanceStatusInquiry.empty')}</td></tr>
                  ) : detailModal.rows.map((r, idx) => (
                    <tr key={`${r.employeeId}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-2 py-1.5">{r.companyName}</td>
                      <td className="px-2 py-1.5">{r.department}</td>
                      <td className="px-2 py-1.5">{r.employeeNo}</td>
                      <td className="px-2 py-1.5 font-medium">{r.name}</td>
                      <td className="px-2 py-1.5">{r.shiftGroupName}</td>
                      <td className="px-2 py-1.5">{r.shiftWorkCode}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.firstPunchAt}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.lastPunchAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="fixed inset-0 z-[70] bg-black/25 backdrop-blur-[1px] flex items-center justify-center">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg text-sm font-medium text-slate-700">
            {t('common.loading')}
          </div>
        </div>
      ) : null}
    </div>
  );
}
