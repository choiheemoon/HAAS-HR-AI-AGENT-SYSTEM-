'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { ColumnFilterPopover } from '@/components/ui/ColumnFilterPopover';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';

type EmpRow = {
  id: number;
  company_id?: number | null;
  employee_number: string;
  name: string;
  department?: string | null;
  status?: string | null;
};

type RefItem = {
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

type AttendanceLeaveLevelRow = {
  leave_type_name?: string | null;
  sort_order?: number | null;
  days_quota?: number | null;
  hours_quota?: number | null;
  minutes_quota?: number | null;
};

type AttendanceLeaveLevelApi = {
  level_number?: number | null;
  rows?: AttendanceLeaveLevelRow[] | null;
};

type LeaveRecord = {
  purpose_of_leave?: string;
  total_days?: number;
  with_pay?: boolean;
  from_date?: string;
  to_date?: string;
};

type LeaveBundle = {
  records?: LeaveRecord[];
};

/** 휴가관리(leave-manage)와 동일 localStorage 구조 */
type LeaveHistoryStoredRecord = {
  id: string;
  no_document: string;
  purpose_of_leave: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  start_hh: string;
  start_mm: string;
  end_hh: string;
  end_mm: string;
  total_days: number;
  with_pay: boolean;
  approve_status: string;
  doctor_guarantee: boolean;
  leave_reason: string;
  memo: string;
  date_of_leave_record: string;
  comments: {
    level1: string;
    level2: string;
    level3: string;
    level4: string;
    level5: string;
    level6: string;
    hr: string;
  };
  created_by: string;
};

const LEAVE_TYPE_OPTIONS = ['Full-day leave', 'Part-time leave', 'First-half day leave', 'Second-half day leave'] as const;
type LeaveTypeStoredValue = (typeof LEAVE_TYPE_OPTIONS)[number];
const LEAVE_TYPE_TO_I18N: Record<LeaveTypeStoredValue, string> = {
  'Full-day leave': 'attendanceLeaveManage.leaveType.fullDay',
  'Part-time leave': 'attendanceLeaveManage.leaveType.partTime',
  'First-half day leave': 'attendanceLeaveManage.leaveType.firstHalfDay',
  'Second-half day leave': 'attendanceLeaveManage.leaveType.secondHalfDay',
};

function formatLeaveTypeLabel(stored: string, t: (key: string, fallback?: string) => string): string {
  const key = LEAVE_TYPE_TO_I18N[stored as LeaveTypeStoredValue];
  return key ? t(key) : stored;
}

function formatHistoryTimeCell(hh: string, mm: string): string {
  const h = String(hh ?? '').trim();
  const m = String(mm ?? '').trim();
  if (!h && !m) return '-';
  const hd = h.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
  const md = (m.replace(/\D/g, '').slice(0, 2) || '00').padStart(2, '0');
  return `${hd}:${md}`;
}

function normalizeHistoryComments(raw: unknown): LeaveHistoryStoredRecord['comments'] {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const s = (k: string) => String(o[k] ?? '');
  return {
    level1: s('level1'),
    level2: s('level2'),
    level3: s('level3'),
    level4: s('level4'),
    level5: s('level5'),
    level6: s('level6'),
    hr: s('hr'),
  };
}

function readStoredHistoryRecords(employeeId: number): LeaveHistoryStoredRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(leaveStorageKey(employeeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { records?: unknown[] };
    const list = Array.isArray(parsed.records) ? parsed.records : [];
    return list.map((r) => {
      const x = r as Record<string, unknown>;
      return {
        id: String(x.id ?? ''),
        no_document: String(x.no_document ?? ''),
        purpose_of_leave: String(x.purpose_of_leave ?? ''),
        leave_type: String(x.leave_type ?? ''),
        from_date: String(x.from_date ?? ''),
        to_date: String(x.to_date ?? ''),
        start_hh: String(x.start_hh ?? ''),
        start_mm: String(x.start_mm ?? ''),
        end_hh: String(x.end_hh ?? ''),
        end_mm: String(x.end_mm ?? ''),
        total_days: asNum(x.total_days),
        with_pay: Boolean(x.with_pay),
        approve_status: String(x.approve_status ?? ''),
        doctor_guarantee: Boolean(x.doctor_guarantee),
        leave_reason: String(x.leave_reason ?? ''),
        memo: String(x.memo ?? ''),
        date_of_leave_record: String(x.date_of_leave_record ?? ''),
        comments: normalizeHistoryComments(x.comments),
        created_by: String(x.created_by ?? ''),
      };
    });
  } catch {
    return [];
  }
}

type LeaveSummaryRow = {
  leaveType: string;
  statutoryDays: number;
  statutoryHours: number;
  statutoryMinutes: number;
  usedWithPayDays: number;
  usedWithoutPayDays: number;
};
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function leaveStorageKey(employeeId: number) {
  return `attendance.leave.manage.v2.${employeeId}`;
}

function asNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDayHourMinute(days: number, hours: number, minutes: number): string {
  return `${asNum(days)}-${asNum(hours)}:${asNum(minutes)}`;
}

function parseEmployeeLeaveGrade(levelRaw: unknown): number {
  const n = parseInt(String(levelRaw ?? '').trim(), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 6) return n;
  return 1;
}

function formatLeaveGradeLabel(levelRaw: unknown, t: (key: string) => string): string {
  const s = String(levelRaw ?? '').trim();
  if (!s) return '-';
  const grade = parseEmployeeLeaveGrade(levelRaw);
  return t('attendanceStandard.leaveLevel').replace('{n}', String(grade));
}

function getLeaveRecords(employeeId: number): LeaveRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(leaveStorageKey(employeeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LeaveBundle;
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

function toDateSafe(ymd: string): Date | null {
  const s = String(ymd ?? '').trim();
  if (!s) return null;
  const d = new Date(`${s.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 기간과 해당 연도가 겹치는 달력일 수(포함). */
function daysOverlappedWithYear(fromYmd: string, toYmd: string, year: number): number {
  const from = toDateSafe(fromYmd);
  const to = toDateSafe(toYmd);
  if (!from || !to || to.getTime() < from.getTime()) return 0;
  const yearStart = new Date(`${year}-01-01T12:00:00`);
  const yearEnd = new Date(`${year}-12-31T12:00:00`);
  const start = from.getTime() < yearStart.getTime() ? yearStart : from;
  const end = to.getTime() > yearEnd.getTime() ? yearEnd : to;
  if (end.getTime() < start.getTime()) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

function inclusiveCalendarDays(fromYmd: string, toYmd: string): number {
  const from = toDateSafe(fromYmd);
  const to = toDateSafe(toYmd);
  if (!from || !to || to.getTime() < from.getTime()) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
}

/** 조회 연도에 해당하는 사용 일수(연말·연초 걸친 휴가는 total_days 비율로 배분). */
function leaveRecordDaysForYear(rec: LeaveRecord, year: number): number {
  const fromYmd = String(rec.from_date ?? '').trim();
  const toYmd = String(rec.to_date ?? '').trim();
  if (!fromYmd || !toYmd) return 0;
  const overlap = daysOverlappedWithYear(fromYmd, toYmd, year);
  if (overlap <= 0) return 0;
  const span = inclusiveCalendarDays(fromYmd, toYmd);
  if (span <= 0) return 0;
  const td = asNum(rec.total_days);
  return td * (overlap / span);
}

function pickRefLabel(it: RefItem): string {
  return it.name_kor || it.name_eng || it.name_thai || it.code;
}

export default function AttendanceLeaveStatusPage() {
  const { t, locale } = useI18n();
  const numberLocale = locale === 'ko' ? 'ko-KR' : locale === 'th' ? 'th-TH' : 'en-US';
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-leave-status', 'can_read');

  const [companies, setCompanies] = useState<
    Array<{ id: number; company_code: string; name_kor?: string | null; name_thai?: string | null; name_eng?: string | null }>
  >([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<'active' | 'terminated' | 'all'>('active');
  const [listLoading, setListLoading] = useState(false);
  const [leaveYear, setLeaveYear] = useState(() => new Date().getFullYear());

  const [departmentRefByCompany, setDepartmentRefByCompany] = useState<Record<number, RefItem[]>>({});
  const [masterByEmployee, setMasterByEmployee] = useState<Record<number, Record<string, unknown> | null>>({});
  const [annualByEmployee, setAnnualByEmployee] = useState<Record<number, Record<string, unknown> | null | undefined>>({});
  const [leaveLevelsByCompany, setLeaveLevelsByCompany] = useState<Record<number, AttendanceLeaveLevelApi[]>>({});

  const [detailEmp, setDetailEmp] = useState<EmpRow | null>(null);
  const [mainTab, setMainTab] = useState<'status' | 'history'>('status');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  const loadEmployees = useCallback(async () => {
    setListLoading(true);
    try {
      const cid = companyFilter ? Number(companyFilter) : undefined;
      const { data } = await apiClient.getEmployees(cid && Number.isFinite(cid) ? { company_id: cid } : undefined);
      setEmployees((data as EmpRow[]) || []);
    } catch {
      setEmployees([]);
    } finally {
      setListLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => {
    void apiClient
      .getMyCompanies()
      .then(({ data }) => setCompanies((data as typeof companies) || []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!allowRead) return;
    void loadEmployees();
  }, [allowRead, loadEmployees]);

  useEffect(() => {
    const ids = new Set<number>();
    for (const e of employees) if (e.company_id != null) ids.add(e.company_id);
    ids.forEach((cid) => {
      if (departmentRefByCompany[cid]) return;
      void apiClient
        .getEmployeeReferenceItems('department', cid)
        .then(({ data }) =>
          setDepartmentRefByCompany((prev) => ({ ...prev, [cid]: (Array.isArray(data) ? (data as RefItem[]) : []) }))
        )
        .catch(() => {});
    });
  }, [employees, departmentRefByCompany]);

  useEffect(() => {
    const ids = Array.from(new Set(employees.map((e) => e.company_id).filter((x): x is number => x != null)));
    ids.forEach((cid) => {
      if (leaveLevelsByCompany[cid]) return;
      void apiClient
        .getAttendanceStandard(cid)
        .then(({ data }) => {
          const bundle = (data as { leave_levels?: AttendanceLeaveLevelApi[] }) || {};
          setLeaveLevelsByCompany((prev) => ({ ...prev, [cid]: Array.isArray(bundle.leave_levels) ? bundle.leave_levels : [] }));
        })
        .catch(() => {
          setLeaveLevelsByCompany((prev) => ({ ...prev, [cid]: [] }));
        });
    });
  }, [employees, leaveLevelsByCompany]);

  const ensureMasterForEmployees = useCallback(async (ids: number[]) => {
    const uniqueIds = Array.from(new Set(ids)).filter((id) => masterByEmployee[id] === undefined);
    if (!uniqueIds.length) return;
    const rows = await Promise.all(
      uniqueIds.map((id) =>
        apiClient
          .getEmployeeAttendanceMaster(id)
          .then(({ data }) => ({ id, data: (data as Record<string, unknown>) || null }))
          .catch(() => ({ id, data: null }))
      )
    );
    setMasterByEmployee((prev) => {
      const next = { ...prev };
      for (const r of rows) next[r.id] = r.data;
      return next;
    });
  }, [masterByEmployee]);

  const ensureAnnualForEmployees = useCallback(async (ids: number[], year: number) => {
    const y = Math.trunc(Number(year));
    if (!Number.isFinite(y)) return;
    const uniqueIds = Array.from(new Set(ids)).filter((id) => annualByEmployee[id] === undefined);
    if (!uniqueIds.length) return;
    const rows = await Promise.all(
      uniqueIds.map((id) =>
        apiClient
          .getEmployeeAnnualLeaveBalance(id, y)
          .then(({ data }) => ({ id, data: (data as Record<string, unknown>) || null }))
          .catch(() => ({ id, data: null }))
      )
    );
    setAnnualByEmployee((prev) => {
      const next = { ...prev };
      for (const r of rows) next[r.id] = r.data;
      return next;
    });
  }, [annualByEmployee]);

  const companyLabel = (c: (typeof companies)[number]) => c.name_kor || c.name_eng || c.name_thai || c.company_code;

  const leaveYearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    const list: number[] = [];
    for (let y = cy - 6; y <= cy + 2; y++) list.push(y);
    if (!list.includes(leaveYear)) {
      list.push(leaveYear);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [leaveYear]);

  const getDepartmentText = useCallback(
    (emp: EmpRow) => {
      const raw = String(emp.department || '').trim();
      if (!raw) return t('attendanceMaster.deptUnassigned');
      const cid = emp.company_id;
      if (cid == null) return raw;
      const refs = departmentRefByCompany[cid] || [];
      const hit = refs.find((x) => x.code === raw);
      return hit ? pickRefLabel(hit) : raw;
    },
    [departmentRefByCompany, t]
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return employees
      .filter((emp) => {
        const st = emp.status || 'active';
        if (employmentStatusFilter !== 'all' && st !== employmentStatusFilter) return false;
        if (!q) return true;
        return (
          (emp.name || '').toLowerCase().includes(q) ||
          (emp.employee_number || '').toLowerCase().includes(q) ||
          getDepartmentText(emp).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.employee_number.localeCompare(b.employee_number));
  }, [employees, employmentStatusFilter, searchTerm, getDepartmentText]);

  const buildLeaveSummaryRowsCore = useCallback(
    (emp: EmpRow, annualSnap: Record<string, unknown> | null | undefined, year: number): LeaveSummaryRow[] => {
      const leave = (masterByEmployee[emp.id]?.leave as Record<string, unknown> | undefined) || {};
      const grade = parseEmployeeLeaveGrade(annualSnap?.level_of_leave ?? leave.level_of_leave);
      const levels = emp.company_id != null ? leaveLevelsByCompany[emp.company_id] || [] : [];
      const levelRows =
        levels.find((x) => Number(x.level_number) === grade)?.rows ??
        levels.find((x) => Number(x.level_number) === 1)?.rows ??
        [];
      const quotaRows = [...(Array.isArray(levelRows) ? levelRows : [])]
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((r) => ({
          leaveType: String(r.leave_type_name ?? '').trim(),
          statutoryDays: asNum(r.days_quota),
          statutoryHours: asNum(r.hours_quota),
          statutoryMinutes: asNum(r.minutes_quota),
        }))
        .filter((r) => r.leaveType);

      const y = Math.trunc(Number(year));
      const records = getLeaveRecords(emp.id);
      const usedMap = new Map<string, { withPay: number; withoutPay: number }>();
      if (Number.isFinite(y)) {
        for (const rec of records) {
          const key = String(rec.purpose_of_leave ?? '').trim().toLowerCase();
          if (!key) continue;
          const portion = leaveRecordDaysForYear(rec, y);
          if (portion <= 0) continue;
          const cur = usedMap.get(key) ?? { withPay: 0, withoutPay: 0 };
          if (rec.with_pay) cur.withPay += portion;
          else cur.withoutPay += portion;
          usedMap.set(key, cur);
        }
      }

      const annualLeave = annualSnap
        ? {
            leaveType: 'Annual leave',
            statutoryDays: asNum(annualSnap.year_days),
            statutoryHours: asNum(annualSnap.year_hours),
            statutoryMinutes: asNum(annualSnap.year_minutes),
          }
        : {
            leaveType: 'Annual leave',
            statutoryDays: asNum(leave.year_days),
            statutoryHours: asNum(leave.year_hours),
            statutoryMinutes: asNum(leave.year_minutes),
          };
      const hasAnnual = quotaRows.some((r) => r.leaveType.toLowerCase() === 'annual leave');
      const merged = hasAnnual
        ? quotaRows.map((r) => (r.leaveType.toLowerCase() === 'annual leave' ? annualLeave : r))
        : [annualLeave, ...quotaRows];

      return merged.map((q) => {
        if (annualSnap && q.leaveType.toLowerCase() === 'annual leave') {
          return {
            ...q,
            usedWithPayDays: asNum(annualSnap.used_days),
            usedWithoutPayDays: 0,
          };
        }
        const used = usedMap.get(q.leaveType.toLowerCase()) ?? { withPay: 0, withoutPay: 0 };
        return {
          ...q,
          usedWithPayDays: used.withPay,
          usedWithoutPayDays: used.withoutPay,
        };
      });
    },
    [leaveLevelsByCompany, masterByEmployee]
  );

  const summaryByEmp = useMemo(() => {
    const out: Record<
      number,
      {
        leaveGrade: string;
        annualDays: number;
        annualHours: number;
        annualMinutes: number;
        annualUsed: number;
        annualUsedHours: number;
        annualUsedMinutes: number;
        annualRemain: number;
      }
    > = {};
    for (const emp of filtered) {
      const leave = (masterByEmployee[emp.id]?.leave as Record<string, unknown> | undefined) || {};
      const snap = annualByEmployee[emp.id];
      const gradeSource = (() => {
        if (snap !== undefined && snap) {
          const sl = snap.level_of_leave;
          if (sl != null && String(sl).trim() !== '') return sl;
        }
        return leave.level_of_leave;
      })();
      const leaveGrade = formatLeaveGradeLabel(gradeSource, t);

      let annualDays: number;
      let annualHours: number;
      let annualMinutes: number;
      let annualUsed: number;
      let annualUsedHours: number;
      let annualUsedMinutes: number;

      if (snap !== undefined && snap) {
        annualDays = asNum(snap.year_days);
        annualHours = asNum(snap.year_hours);
        annualMinutes = asNum(snap.year_minutes);
        annualUsed = asNum(snap.used_days);
        annualUsedHours = asNum(snap.used_hours);
        annualUsedMinutes = asNum(snap.used_minutes);
      } else if (snap === null) {
        annualDays = 0;
        annualHours = 0;
        annualMinutes = 0;
        annualUsed = 0;
        annualUsedHours = 0;
        annualUsedMinutes = 0;
      } else {
        const rows = buildLeaveSummaryRowsCore(emp, undefined, leaveYear);
        const annual = rows.find((r) => r.leaveType === 'Annual leave');
        annualDays = asNum(annual?.statutoryDays ?? leave.year_days);
        annualHours = asNum(annual?.statutoryHours ?? leave.year_hours);
        annualMinutes = asNum(annual?.statutoryMinutes ?? leave.year_minutes);
        annualUsed = asNum(annual?.usedWithPayDays) + asNum(annual?.usedWithoutPayDays);
        annualUsedHours = 0;
        annualUsedMinutes = 0;
      }
      const annualRemain = annualDays - annualUsed;
      out[emp.id] = {
        leaveGrade,
        annualDays,
        annualHours,
        annualMinutes,
        annualUsed,
        annualUsedHours,
        annualUsedMinutes,
        annualRemain,
      };
    }
    return out;
  }, [filtered, masterByEmployee, annualByEmployee, buildLeaveSummaryRowsCore, leaveYear, t]);

  const rowsForTable = useMemo(() => {
    const out: Array<{
      emp: EmpRow;
      factory: string;
      department: string;
      employeeNo: string;
      employeeName: string;
      leaveGrade: string;
    }> = [];
    for (const emp of filtered) {
      const comp = companies.find((c) => c.id === emp.company_id);
      out.push({
        emp,
        factory: comp ? companyLabel(comp) : '-',
        department: getDepartmentText(emp),
        employeeNo: emp.employee_number || '-',
        employeeName: emp.name || '-',
        leaveGrade: summaryByEmp[emp.id]?.leaveGrade || '-',
      });
    }
    return out.sort((a, b) => {
      const c1 = a.factory.localeCompare(b.factory);
      if (c1 !== 0) return c1;
      const c2 = a.department.localeCompare(b.department);
      if (c2 !== 0) return c2;
      return a.employeeName.localeCompare(b.employeeName);
    });
  }, [filtered, companies, getDepartmentText, summaryByEmp]);

  const uniqueValuesByKey = useMemo(() => {
    const keys = ['factory', 'department', 'employeeNo', 'employeeName', 'leaveGrade'] as const;
    const map: Record<string, string[]> = {};
    for (const key of keys) {
      const set = new Set<string>();
      for (const row of rowsForTable) set.add(String(row[key] || '-'));
      map[key] = Array.from(set).sort((a, b) => a.localeCompare(b));
    }
    return map;
  }, [rowsForTable]);

  const valueCountsByKey = useMemo(() => {
    const keys = ['factory', 'department', 'employeeNo', 'employeeName', 'leaveGrade'] as const;
    const map: Record<string, Record<string, number>> = {};
    for (const key of keys) {
      map[key] = {};
      for (const row of rowsForTable) {
        const v = String(row[key] || '-');
        map[key][v] = (map[key][v] ?? 0) + 1;
      }
    }
    return map;
  }, [rowsForTable]);

  const columnFilterLabels = useMemo(
    () => ({
      title: t('appList.filter.title'),
      reset: t('common.reset'),
      noValues: t('appList.filter.noValues'),
      noMatchingValues: t('appList.filter.noMatchingValues'),
      valueSearchPlaceholder: t('appList.filter.valueSearchPlaceholder'),
      selectAll: t('appList.table.selectAll'),
      deselectAll: t('appList.filter.deselectAll'),
      emptyValue: t('common.emptyValue'),
      selectedCountTemplate: t('appList.filter.selectedCount'),
    }),
    [t]
  );

  const filteredRows = useMemo(() => {
    if (Object.keys(columnFilters).every((k) => !columnFilters[k]?.length)) return rowsForTable;
    return rowsForTable.filter((row) => {
      const keys = ['factory', 'department', 'employeeNo', 'employeeName', 'leaveGrade'] as const;
      for (const key of keys) {
        const selected = columnFilters[key];
        if (!selected || selected.length === 0) continue;
        const cellVal = String(row[key] || '-');
        if (!selected.includes(cellVal)) return false;
      }
      return true;
    });
  }, [rowsForTable, columnFilters]);

  const clearColumnFilter = (key: string) => {
    setColumnFilters((prev) => {
      const u = { ...prev };
      delete u[key];
      return u;
    });
    setOpenFilterKey(null);
  };

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const startItem = filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, filteredRows.length);
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const leaveHistoryRows = useMemo(() => {
    const y = Math.trunc(Number(leaveYear));
    const out: Array<{
      emp: EmpRow;
      factory: string;
      department: string;
      record: LeaveHistoryStoredRecord;
    }> = [];
    for (const row of filteredRows) {
      const emp = row.emp;
      const recs = readStoredHistoryRecords(emp.id);
      for (const rec of recs) {
        const lr: LeaveRecord = {
          purpose_of_leave: rec.purpose_of_leave,
          total_days: rec.total_days,
          with_pay: rec.with_pay,
          from_date: rec.from_date,
          to_date: rec.to_date,
        };
        if (!Number.isFinite(y) || leaveRecordDaysForYear(lr, y) <= 0) continue;
        out.push({
          emp,
          factory: row.factory,
          department: row.department,
          record: rec,
        });
      }
    }
    out.sort((a, b) => {
      const da = String(a.record.from_date || '');
      const db = String(b.record.from_date || '');
      if (da !== db) return db.localeCompare(da);
      return (a.emp.employee_number || '').localeCompare(b.emp.employee_number || '');
    });
    return out;
  }, [filteredRows, leaveYear]);

  const historyTotalPages = Math.max(1, Math.ceil(leaveHistoryRows.length / pageSize));
  const historyStartItem = leaveHistoryRows.length === 0 ? 0 : (historyPage - 1) * pageSize + 1;
  const historyEndItem = Math.min(historyPage * pageSize, leaveHistoryRows.length);
  const historyPaged = useMemo(() => {
    const start = (historyPage - 1) * pageSize;
    return leaveHistoryRows.slice(start, start + pageSize);
  }, [leaveHistoryRows, historyPage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [companyFilter, employmentStatusFilter, searchTerm, columnFilters, pageSize, leaveYear]);

  useEffect(() => {
    setHistoryPage(1);
  }, [companyFilter, employmentStatusFilter, searchTerm, columnFilters, pageSize, leaveYear, mainTab]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

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

  useEffect(() => {
    const ids = new Set<number>();
    if (mainTab === 'status') {
      for (const r of paged) ids.add(r.emp.id);
    } else {
      for (const row of historyPaged) ids.add(row.emp.id);
    }
    if (detailEmp) ids.add(detailEmp.id);
    const list = Array.from(ids);
    void ensureMasterForEmployees(list);
    void ensureAnnualForEmployees(list, leaveYear);
  }, [mainTab, paged, historyPaged, detailEmp, ensureMasterForEmployees, ensureAnnualForEmployees, leaveYear]);

  const buildLeaveSummaryRows = useCallback(
    (emp: EmpRow): LeaveSummaryRow[] => buildLeaveSummaryRowsCore(emp, annualByEmployee[emp.id], leaveYear),
    [buildLeaveSummaryRowsCore, annualByEmployee, leaveYear]
  );

  if (!allowRead) {
    return (
      <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">{t('permission.noAccess')}</div>
    );
  }

  return (
    <div className="p-2 sm:p-3 space-y-3">
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <select
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value);
              setSearchInput('');
              setSearchTerm('');
            }}
          >
            <option value="">{t('employees.companyFilter.all')}</option>
            {companies.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {companyLabel(c)}
              </option>
            ))}
          </select>
          <select
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
            value={employmentStatusFilter}
            onChange={(e) =>
              setEmploymentStatusFilter(e.target.value === 'terminated' ? 'terminated' : e.target.value === 'all' ? 'all' : 'active')
            }
          >
            <option value="active">{t('employees.status.active')}</option>
            <option value="terminated">{t('employees.status.terminated')}</option>
            <option value="all">{t('employees.filter.status.all')}</option>
          </select>
          <select
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
            aria-label={t('attendanceLeaveStatus.leaveYear')}
            title={t('attendanceLeaveStatus.leaveYear')}
            value={leaveYear}
            onChange={(e) => {
              const y = Number(e.target.value);
              setLeaveYear(Number.isFinite(y) ? y : new Date().getFullYear());
              setAnnualByEmployee({});
            }}
          >
            {leaveYearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
              placeholder={t('attendanceLeaveStatus.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearchTerm(searchInput);
              }}
            />
          </div>
          <button
            className="text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
            disabled={listLoading}
            onClick={() => void loadEmployees()}
          >
            {t('attendanceInquiry.reload')}
          </button>
        </div>
      </div>

      <div className="flex gap-1 items-end border-b border-gray-200 px-1">
        <button
          type="button"
          onClick={() => setMainTab('status')}
          className={`px-3 py-2 text-sm border rounded-t-md ${
            mainTab === 'status' ? 'bg-white border-blue-500 border-b-white text-blue-700 -mb-px z-[1] relative' : 'bg-gray-100 border-gray-300 text-gray-600'
          }`}
        >
          {t('attendanceLeaveStatus.tab.status')}
        </button>
        <button
          type="button"
          onClick={() => setMainTab('history')}
          className={`px-3 py-2 text-sm border rounded-t-md ${
            mainTab === 'history' ? 'bg-white border-blue-500 border-b-white text-blue-700 -mb-px z-[1] relative' : 'bg-gray-100 border-gray-300 text-gray-600'
          }`}
        >
          {t('attendanceLeaveStatus.tab.history')}
        </button>
      </div>

      {mainTab === 'status' && (
        <>
      <div className="rounded-lg border border-gray-200 bg-white overflow-auto">
        <div className="px-3 py-2 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 bg-gray-50">
          <span className="text-sm text-gray-600">
            {t('appList.pagination.summary', '총 {total}건 중 {start}-{end} 표시')
              .replace('{total}', String(filteredRows.length))
              .replace('{start}', String(startItem))
              .replace('{end}', String(endItem))}
          </span>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">{t('attendanceLeaveStatus.pagination.pageSize')}</label>
            <select
              className="border border-gray-300 rounded px-2 py-1 text-sm"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.prev')}
            </button>
            <span className="px-1 text-sm text-gray-700">{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
        <table className="w-full min-w-[980px] text-xs border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white sticky top-0 z-10">
              <th className="p-2 border border-slate-700 text-center w-[60px]">No.</th>
              {(
                [
                  { key: 'factory', label: t('attendanceLeaveStatus.col.factory'), align: 'text-left' },
                  { key: 'department', label: t('attendanceLeaveStatus.col.department'), align: 'text-left' },
                  { key: 'employeeNo', label: t('attendanceLeaveStatus.col.employeeNo'), align: 'text-left' },
                  { key: 'employeeName', label: t('attendanceLeaveStatus.col.employeeName'), align: 'text-left' },
                  { key: 'leaveGrade', label: t('attendanceLeaveStatus.col.leaveGrade'), align: 'text-center' },
                ] as const
              ).map((col) => {
                const selectedList = columnFilters[col.key] ?? [];
                const hasFilter = selectedList.length > 0;
                const options = uniqueValuesByKey[col.key] ?? [];
                return (
                  <th key={col.key} className={`p-2 border border-slate-700 ${col.align}`}>
                    <div className="flex items-center gap-1">
                      <span>{col.label}</span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenFilterKey((k) => (k === col.key ? null : col.key))}
                          className={`p-0.5 rounded hover:bg-slate-700 ${hasFilter ? 'text-emerald-300' : 'text-slate-300'}`}
                          title={t('appList.filter.title', '필터')}
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        {openFilterKey === col.key && (
                          <div ref={filterPopoverRef} className="absolute left-0 top-full mt-1 z-20">
                            <ColumnFilterPopover
                              options={options}
                              selected={selectedList}
                              valueCounts={valueCountsByKey[col.key] ?? {}}
                              numberLocale={numberLocale}
                              labels={columnFilterLabels}
                              onReset={() => clearColumnFilter(col.key)}
                              onSelectionChange={(next) => {
                                setColumnFilters((prev) => {
                                  if (next.length === 0) {
                                    const u = { ...prev };
                                    delete u[col.key];
                                    return u;
                                  }
                                  return { ...prev, [col.key]: next };
                                });
                              }}
                              showSelectedFooter
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                );
              })}
              <th className="p-2 border border-slate-700 text-right">{t('attendanceLeaveStatus.col.statutoryAnnual')}</th>
              <th className="p-2 border border-slate-700 text-right">{t('attendanceLeaveStatus.col.usedAnnual')}</th>
              <th className="p-2 border border-slate-700 text-right">{t('attendanceLeaveStatus.col.remainAnnual')}</th>
              <th className="p-2 border border-slate-700 text-center">{t('attendanceLeaveStatus.col.history')}</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-gray-500">
                  {t('attendanceMaster.noEmployees')}
                </td>
              </tr>
            ) : (
              paged.map((row, idx) => {
                const emp = row.emp;
                const summary = summaryByEmp[emp.id] || {
                  leaveGrade: '-',
                  annualDays: 0,
                  annualHours: 0,
                  annualMinutes: 0,
                  annualUsed: 0,
                  annualUsedHours: 0,
                  annualUsedMinutes: 0,
                  annualRemain: 0,
                };

                return (
                  <tr key={emp.id} className="odd:bg-white even:bg-gray-50/60">
                    <td className="p-2 border border-gray-200 text-center text-gray-600">{startItem + idx}</td>
                    <td className="p-2 border border-gray-200">{row.factory}</td>
                    <td className="p-2 border border-gray-200">{row.department}</td>
                    <td className="p-2 border border-gray-200">{row.employeeNo}</td>
                    <td className="p-2 border border-gray-200 font-medium">{row.employeeName}</td>
                    <td className="p-2 border border-gray-200 text-center">{row.leaveGrade || summary.leaveGrade}</td>
                    <td className="p-2 border border-gray-200 text-right tabular-nums">{formatDayHourMinute(summary.annualDays, summary.annualHours, summary.annualMinutes)}</td>
                    <td className="p-2 border border-gray-200 text-right tabular-nums">
                      {formatDayHourMinute(summary.annualUsed, summary.annualUsedHours, summary.annualUsedMinutes)}
                    </td>
                    <td className="p-2 border border-gray-200 text-right tabular-nums">{formatDayHourMinute(summary.annualRemain, 0, 0)}</td>
                    <td className="p-2 border border-gray-200 text-center">
                      <button
                        type="button"
                        className="px-2 py-1 text-[11px] border border-sky-300 rounded bg-sky-50 text-sky-800 hover:bg-sky-100"
                        onClick={() => setDetailEmp(emp)}
                      >
                        {t('common.detail')}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-3 flex flex-wrap items-center justify-between gap-2 bg-gray-50">
        <div className="text-sm text-gray-600">
          {t('attendanceLeaveStatus.pagination.summary')
            .replace('{total}', String(filteredRows.length))
            .replace('{page}', String(page))
            .replace('{totalPages}', String(totalPages))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">{t('attendanceLeaveStatus.pagination.pageSize')}</label>
          <select
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.prev')}
          </button>
          <span className="px-2 text-sm text-gray-700">{page} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.next')}
          </button>
        </div>
      </div>
        </>
      )}

      {mainTab === 'history' && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white overflow-auto">
            <div className="px-3 py-2 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 bg-gray-50">
              <span className="text-sm text-gray-600">
                {t('appList.pagination.summary', '총 {total}건 중 {start}-{end} 표시')
                  .replace('{total}', String(leaveHistoryRows.length))
                  .replace('{start}', String(historyStartItem))
                  .replace('{end}', String(historyEndItem))}
              </span>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">{t('attendanceLeaveStatus.pagination.pageSize')}</label>
                <select
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage <= 1}
                  className="px-2.5 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.prev')}
                </button>
                <span className="px-1 text-sm text-gray-700">
                  {historyPage} / {historyTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                  disabled={historyPage >= historyTotalPages}
                  className="px-2.5 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
            <div className="max-h-[min(70vh,720px)] overflow-auto">
              <table className="w-full text-[11px] border-collapse min-w-[2100px]">
                <thead>
                  <tr className="bg-slate-800 text-white sticky top-0 z-10">
                    <th className="p-1 border border-slate-700 text-left">{t('attendanceLeaveStatus.col.factory')}</th>
                    <th className="p-1 border border-slate-700 text-left">{t('attendanceLeaveStatus.col.department')}</th>
                    <th className="p-1 border border-slate-700 text-left">{t('attendanceLeaveStatus.col.employeeNo')}</th>
                    <th className="p-1 border border-slate-700 text-left">{t('attendanceLeaveStatus.col.employeeName')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.year')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.noDocument')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.leave')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.typeOfLeave')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.startDate')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.to')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.total')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.startTime')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.endTime')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.total')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.leaveWithOrWithoutPay')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.dateOfLeaveRecord')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.memo')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.approveStatus')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.doctorGuarantee')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.commentLevel1')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.commentLevel2')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.commentLevel3')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.commentLevel4')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.commentLevel5')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.commentLevel6')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.commentHr')}</th>
                    <th className="p-1 border border-slate-700">{t('attendanceLeaveManage.history.createdBy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyPaged.length === 0 ? (
                    <tr>
                      <td colSpan={27} className="p-6 text-center text-gray-500">
                        {t('attendanceLeaveManage.history.empty')}
                      </td>
                    </tr>
                  ) : (
                    historyPaged.map(({ emp, factory, department, record: r }) => (
                      <tr key={`${emp.id}-${r.id}`} className="odd:bg-white even:bg-gray-50/60">
                        <td className="p-1 border border-gray-200">{factory}</td>
                        <td className="p-1 border border-gray-200">{department}</td>
                        <td className="p-1 border border-gray-200">{emp.employee_number || '—'}</td>
                        <td className="p-1 border border-gray-200 font-medium">{emp.name || '—'}</td>
                        <td className="p-1 border border-gray-200">{r.from_date ? r.from_date.slice(0, 4) : '—'}</td>
                        <td className="p-1 border border-gray-200">{r.no_document || '—'}</td>
                        <td className="p-1 border border-gray-200">{r.purpose_of_leave}</td>
                        <td className="p-1 border border-gray-200">{formatLeaveTypeLabel(r.leave_type, t)}</td>
                        <td className="p-1 border border-gray-200">{r.from_date}</td>
                        <td className="p-1 border border-gray-200">{r.to_date}</td>
                        <td className="p-1 border border-gray-200 text-right">{r.total_days}</td>
                        <td className="p-1 border border-gray-200 font-mono tabular-nums">{formatHistoryTimeCell(r.start_hh, r.start_mm)}</td>
                        <td className="p-1 border border-gray-200 font-mono tabular-nums">{formatHistoryTimeCell(r.end_hh, r.end_mm)}</td>
                        <td className="p-1 border border-gray-200 text-right">{r.total_days}</td>
                        <td className="p-1 border border-gray-200">
                          {r.with_pay ? t('attendanceLeaveManage.main.leaveWithPay') : t('attendanceLeaveManage.main.leaveWithoutPay')}
                        </td>
                        <td className="p-1 border border-gray-200">{r.date_of_leave_record}</td>
                        <td className="p-1 border border-gray-200">{r.memo}</td>
                        <td className="p-1 border border-gray-200">{r.approve_status}</td>
                        <td className="p-1 border border-gray-200 text-center">{r.doctor_guarantee ? '☑' : '☐'}</td>
                        <td className="p-1 border border-gray-200">{r.comments.level1}</td>
                        <td className="p-1 border border-gray-200">{r.comments.level2}</td>
                        <td className="p-1 border border-gray-200">{r.comments.level3}</td>
                        <td className="p-1 border border-gray-200">{r.comments.level4}</td>
                        <td className="p-1 border border-gray-200">{r.comments.level5}</td>
                        <td className="p-1 border border-gray-200">{r.comments.level6}</td>
                        <td className="p-1 border border-gray-200">{r.comments.hr}</td>
                        <td className="p-1 border border-gray-200">{r.created_by}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 flex flex-wrap items-center justify-between gap-2 bg-gray-50">
            <div className="text-sm text-gray-600">
              {t('attendanceLeaveStatus.pagination.summary')
                .replace('{total}', String(leaveHistoryRows.length))
                .replace('{page}', String(historyPage))
                .replace('{totalPages}', String(historyTotalPages))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">{t('attendanceLeaveStatus.pagination.pageSize')}</label>
              <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyPage <= 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.prev')}
              </button>
              <span className="px-2 text-sm text-gray-700">
                {historyPage} / {historyTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                disabled={historyPage >= historyTotalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        </>
      )}

      {detailEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3" onClick={() => setDetailEmp(null)}>
          <div
            className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-lg border border-sky-300 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-sky-200 bg-sky-50 px-3 py-2">
              <h3 className="text-sm font-semibold text-sky-900">
                {t('attendanceLeaveStatus.detailTitle')} - {detailEmp.employee_number} / {detailEmp.name}
              </h3>
              <button
                type="button"
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => setDetailEmp(null)}
              >
                {t('common.close')}
              </button>
            </div>
            <div className="max-h-[calc(85vh-3rem)] overflow-auto p-2 space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="rounded border p-2 bg-gray-50">
                  <div className="text-gray-500">{t('attendanceLeaveStatus.col.factory')}</div>
                  <div className="font-medium">{companies.find((c) => c.id === detailEmp.company_id)?.name_kor || '-'}</div>
                </div>
                <div className="rounded border p-2 bg-gray-50">
                  <div className="text-gray-500">{t('attendanceLeaveStatus.col.department')}</div>
                  <div className="font-medium">{getDepartmentText(detailEmp)}</div>
                </div>
                <div className="rounded border p-2 bg-gray-50">
                  <div className="text-gray-500">{t('attendanceLeaveStatus.col.employeeNo')}</div>
                  <div className="font-medium">{detailEmp.employee_number}</div>
                </div>
                <div className="rounded border p-2 bg-gray-50">
                  <div className="text-gray-500">{t('attendanceLeaveStatus.col.leaveGrade')}</div>
                  <div className="font-medium">
                    {formatLeaveGradeLabel(
                      (() => {
                        const snapLv = annualByEmployee[detailEmp.id]?.level_of_leave;
                        if (snapLv != null && String(snapLv).trim() !== '') return snapLv;
                        return ((masterByEmployee[detailEmp.id]?.leave as Record<string, unknown> | undefined) || {}).level_of_leave;
                      })(),
                      t
                    )}
                  </div>
                </div>
              </div>

              <table className="w-full text-xs border-collapse min-w-[860px]">
                <thead>
                  <tr className="bg-sky-100 text-sky-900">
                    <th className="p-1 border border-sky-300 text-left">{t('attendanceMaster.leaveHistory.col.type')}</th>
                    <th className="p-1 border border-sky-300">{t('attendanceMaster.leaveHistory.col.statutory')}</th>
                    <th className="p-1 border border-sky-300">{t('attendanceMaster.leaveHistory.col.used')}</th>
                    <th className="p-1 border border-sky-300">{t('attendanceMaster.leaveHistory.col.remain')}</th>
                    <th className="p-1 border border-sky-300">{t('attendanceMaster.leaveHistory.col.withPay')}</th>
                    <th className="p-1 border border-sky-300">{t('attendanceMaster.leaveHistory.col.withoutPay')}</th>
                  </tr>
                </thead>
                <tbody>
                  {buildLeaveSummaryRows(detailEmp).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 border border-gray-200 text-center text-gray-500">
                        {t('attendanceMaster.leaveHistory.empty')}
                      </td>
                    </tr>
                  ) : (
                    buildLeaveSummaryRows(detailEmp).map((row, idx) => {
                      const usedDays = row.usedWithPayDays + row.usedWithoutPayDays;
                      const remainDays = row.statutoryDays - usedDays;
                      return (
                        <tr key={`${row.leaveType}-${idx}`} className="odd:bg-white even:bg-gray-50/60">
                          <td className="p-1 border border-gray-200 font-medium">{row.leaveType}</td>
                          <td className="p-1 border border-gray-200 text-right tabular-nums">
                            {formatDayHourMinute(row.statutoryDays, row.statutoryHours, row.statutoryMinutes)}
                          </td>
                          <td className="p-1 border border-gray-200 text-right tabular-nums">{formatDayHourMinute(usedDays, 0, 0)}</td>
                          <td className="p-1 border border-gray-200 text-right tabular-nums">{formatDayHourMinute(remainDays, 0, 0)}</td>
                          <td className="p-1 border border-gray-200 text-right tabular-nums">{formatDayHourMinute(row.usedWithPayDays, 0, 0)}</td>
                          <td className="p-1 border border-gray-200 text-right tabular-nums">{formatDayHourMinute(row.usedWithoutPayDays, 0, 0)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
