'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, User } from 'lucide-react';
import { apiClient, getEmployeePhotoThumbnailUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';

type EmpRow = {
  id: number;
  company_id?: number | null;
  employee_number: string;
  name: string;
  department?: string | null;
  position?: string | null;
  swipe_card?: string | null;
  status?: string | null;
};

type RefItem = { code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null };
type DepartmentPositionRefByCompany = Record<number, { department: RefItem[]; position: RefItem[] }>;
type RefByCompany = Record<number, Record<string, RefItem[]>>;
type WorkCalendarDayItem = { day_of_month: number; shift_code?: string | null; is_workday?: boolean };
type WorkCalendarItem = {
  calendar_year: number;
  calendar_month: number;
  shift_group_id?: number | null;
  shift_group_name?: string | null;
  days?: WorkCalendarDayItem[];
};

type TimeRow = {
  id_time_in_out: number;
  id_card?: string | null;
  date_i?: string | null;
  date_in_out?: string | null;
  id_sin_out?: number | null;
  user_change?: string | null;
  machine_no?: string | null;
  add_memo?: string | null;
  status_del?: boolean;
  id_time_in_out_approve?: number | null;
  sync_status?: string | null;
  memo_?: string | null;
};

const SLOT_COUNT = 7;

type DayGridRow = {
  dateKey: string;
  slots: string[];
  slotRecordIds: (number | null)[];
};

function effectivePunchIso(r: TimeRow): string | null {
  return r.date_in_out || r.date_i || null;
}

function localDateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function enumerateDateKeys(from: string, to: string): string[] {
  const a = (from || '').slice(0, 10);
  const b = (to || '').slice(0, 10);
  if (!a || !b || a > b) return [];
  const out: string[] = [];
  const cur = new Date(`${a}T12:00:00`);
  const end = new Date(`${b}T12:00:00`);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function formatHHmm(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeTimeInput(s: string): string {
  const t = s.trim();
  if (!t) return '';
  const digitsOnly = t.replace(/\D/g, '');
  if (digitsOnly && /^\d+$/.test(digitsOnly) && digitsOnly.length <= 4) {
    // Numeric-only auto conversion:
    // 7 -> 07:00, 19 -> 19:00, 730 -> 07:30, 0730 -> 07:30
    if (digitsOnly.length <= 2) {
      const h = Math.min(23, Math.max(0, parseInt(digitsOnly, 10) || 0));
      return `${String(h).padStart(2, '0')}:00`;
    }
    if (digitsOnly.length === 3) {
      const h = Math.min(23, Math.max(0, parseInt(digitsOnly.slice(0, 1), 10) || 0));
      const min = Math.min(59, Math.max(0, parseInt(digitsOnly.slice(1), 10) || 0));
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    const h = Math.min(23, Math.max(0, parseInt(digitsOnly.slice(0, 2), 10) || 0));
    const min = Math.min(59, Math.max(0, parseInt(digitsOnly.slice(2), 10) || 0));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const m = /^(\d{1,2})\s*:\s*(\d{1,2})$/.exec(t);
  if (!m) return '';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10) || 0));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Local wall-clock instant for dateKey + HH:mm → ISO (UTC string for API). */
function parseHHMMAsLocalIso(dateKey: string, hhmm: string): string | null {
  const s = normalizeTimeInput(hhmm);
  if (!s) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const [y, mo, da] = dateKey.split('-').map(Number);
  if (!y || !mo || !da) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  // Keep local wall-clock value; backend stores timestamp without timezone.
  return `${y}-${pad(mo)}-${pad(da)}T${pad(h)}:${pad(min)}:00`;
}

function dayStartIso(dateKey: string): string | null {
  const [y, mo, da] = dateKey.split('-').map(Number);
  if (!y || !mo || !da) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(da)}T00:00:00`;
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

function buildDailyGrid(rows: TimeRow[], dateFrom: string, dateTo: string): DayGridRow[] {
  const keys = enumerateDateKeys(dateFrom, dateTo);
  if (keys.length === 0) return [];

  const sorted = [...rows]
    .filter((r) => !r.status_del)
    .sort((a, b) => {
      const ia = effectivePunchIso(a);
      const ib = effectivePunchIso(b);
      const ta = ia ? new Date(ia).getTime() : 0;
      const tb = ib ? new Date(ib).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return (a.id_time_in_out ?? 0) - (b.id_time_in_out ?? 0);
    });

  const byDay = new Map<string, TimeRow[]>();
  const keySet = new Set(keys);
  for (const r of sorted) {
    const iso = effectivePunchIso(r);
    if (!iso) continue;
    const dk = localDateKeyFromIso(iso);
    if (!dk || !keySet.has(dk)) continue;
    const arr = byDay.get(dk) || [];
    arr.push(r);
    byDay.set(dk, arr);
  }

  return keys.map((dateKey) => {
    const list = (byDay.get(dateKey) || []).slice().sort((a, b) => {
      const ia = effectivePunchIso(a)!;
      const ib = effectivePunchIso(b)!;
      const ta = new Date(ia).getTime();
      const tb = new Date(ib).getTime();
      return ta - tb || (a.id_time_in_out ?? 0) - (b.id_time_in_out ?? 0);
    });
    const slots: string[] = Array(SLOT_COUNT).fill('');
    const slotRecordIds: (number | null)[] = Array(SLOT_COUNT).fill(null);
    for (let i = 0; i < Math.min(SLOT_COUNT, list.length); i++) {
      const iso = effectivePunchIso(list[i]);
      if (iso) slots[i] = formatHHmm(iso);
      slotRecordIds[i] = list[i].id_time_in_out;
    }
    return { dateKey, slots, slotRecordIds };
  });
}

function cloneGrid(g: DayGridRow[]): DayGridRow[] {
  return g.map((r) => ({
    dateKey: r.dateKey,
    slots: [...r.slots],
    slotRecordIds: [...r.slotRecordIds],
  }));
}

function formatDateCell(dateKey: string, locale: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  if (locale === 'en') {
    return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}-${String(y).slice(-2)}`;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function weekdayShort(dateKey: string, locale: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const loc = locale === 'en' ? 'en-US' : locale === 'th' ? 'th-TH' : 'ko-KR';
  return dt.toLocaleDateString(loc, { weekday: 'short' });
}

export default function AttendanceInquiryPage() {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-inquiry', 'can_read');
  const allowSave = can('attendance-inquiry', 'can_update');
  const allowDelete = can('attendance-inquiry', 'can_delete');
  const allowCreate = can('attendance-inquiry', 'can_create');

  const [companies, setCompanies] = useState<
    Array<{ id: number; company_code: string; name_kor?: string | null; name_thai?: string | null; name_eng?: string | null }>
  >([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<'active' | 'terminated' | 'all'>('active');
  const deferredEmploymentStatus = useDeferredValue(employmentStatusFilter);
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [expandedDept, setExpandedDept] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [flatIds, setFlatIds] = useState<number[]>([]);

  const [departmentPositionRefByCompany, setDepartmentPositionRefByCompany] =
    useState<DepartmentPositionRefByCompany>({});
  const [refsByCompany, setRefsByCompany] = useState<RefByCompany>({});
  const deptPosRef = useRef<DepartmentPositionRefByCompany>({});
  deptPosRef.current = departmentPositionRefByCompany;
  const [masterBundle, setMasterBundle] = useState<Record<string, unknown> | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [shiftCodeByDate, setShiftCodeByDate] = useState<Record<string, string>>({});
  const [workCalendars, setWorkCalendars] = useState<WorkCalendarItem[]>([]);

  const today = new Date();
  const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);

  const [rawRows, setRawRows] = useState<TimeRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(-1);
  const [mode, setMode] = useState<MasterUiMode>('browse');
  const [saving, setSaving] = useState(false);
  const [editBuffer, setEditBuffer] = useState<DayGridRow[] | null>(null);
  const initialAtEditRef = useRef<DayGridRow[] | null>(null);

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

  const companyLabel = (c: (typeof companies)[number]) => {
    if (locale === 'ko') return c.name_kor || c.name_eng || c.name_thai || c.company_code;
    if (locale === 'en') return c.name_eng || c.name_kor || c.name_thai || c.company_code;
    return c.name_thai || c.name_kor || c.name_eng || c.company_code;
  };

  const pickRefItemLabel = useCallback(
    (it: RefItem) => {
      if (locale === 'ko') return it.name_kor || it.name_eng || it.name_thai || it.code;
      if (locale === 'en') return it.name_eng || it.name_kor || it.name_thai || it.code;
      return it.name_thai || it.name_kor || it.name_eng || it.code;
    },
    [locale]
  );

  const ensureDepartmentPositionRefs = useCallback(async (companyId: number) => {
    if (deptPosRef.current[companyId]) return;
    try {
      const [deptRes, posRes] = await Promise.all([
        apiClient.getEmployeeReferenceItems('department', companyId),
        apiClient.getEmployeeReferenceItems('position', companyId),
      ]);
      setDepartmentPositionRefByCompany((prev) => {
        if (prev[companyId]) return prev;
        return {
          ...prev,
          [companyId]: {
            department: Array.isArray(deptRes.data) ? (deptRes.data as RefItem[]) : [],
            position: Array.isArray(posRes.data) ? (posRes.data as RefItem[]) : [],
          },
        };
      });
    } catch {
      /* noop */
    }
  }, []);

  const ensureRefs = useCallback(async (companyId: number) => {
    if (refsByCompany[companyId]) return;
    try {
      const cats = ['division', 'department', 'level', 'work_place', 'employment_type', 'employee_type'] as const;
      const vals = await Promise.all(cats.map((c) => apiClient.getEmployeeReferenceItems(c, companyId)));
      const next: Record<string, RefItem[]> = {};
      cats.forEach((c, i) => {
        next[c] = Array.isArray(vals[i].data) ? (vals[i].data as RefItem[]) : [];
      });
      setRefsByCompany((p) => ({ ...p, [companyId]: next }));
    } catch {
      /* noop */
    }
  }, [refsByCompany]);

  useEffect(() => {
    if (!employees.length) return;
    const ids = new Set<number>();
    for (const e of employees) {
      if (e.company_id != null) ids.add(e.company_id);
    }
    Array.from(ids).forEach((cid) => {
      void ensureDepartmentPositionRefs(cid);
      void ensureRefs(cid);
    });
  }, [employees, ensureDepartmentPositionRefs, ensureRefs]);

  const getStatusText = useCallback(
    (status: string) => {
      if (status === 'active') return t('employees.status.active');
      if (status === 'terminated') return t('employees.status.terminated');
      return t('employees.status.inactive');
    },
    [t]
  );

  const getDepartmentText = useCallback(
    (emp: EmpRow) => {
      const cid = emp.company_id ?? null;
      const raw = (emp.department || '').trim();
      if (!raw) return t('attendanceMaster.deptUnassigned');
      const refs = cid != null ? departmentPositionRefByCompany[cid] : undefined;
      const map = new Map<string, string>();
      for (const it of refs?.department ?? []) map.set(it.code, pickRefItemLabel(it));
      return map.get(raw) || raw;
    },
    [departmentPositionRefByCompany, pickRefItemLabel, t]
  );

  const getPositionText = useCallback(
    (emp: EmpRow) => {
      const cid = emp.company_id ?? null;
      const raw = (emp.position || '').trim();
      if (!raw) return '-';
      const refs = cid != null ? departmentPositionRefByCompany[cid] : undefined;
      const map = new Map<string, string>();
      for (const it of refs?.position ?? []) map.set(it.code, pickRefItemLabel(it));
      return map.get(raw) || raw;
    },
    [departmentPositionRefByCompany, pickRefItemLabel]
  );

  const loadEmployees = useCallback(async () => {
    setListLoading(true);
    try {
      const cid = companyFilter ? parseInt(companyFilter, 10) : undefined;
      const { data } = await apiClient.getEmployees(
        cid && Number.isFinite(cid) ? { company_id: cid } : undefined
      );
      setEmployees((data as EmpRow[]) || []);
    } catch {
      setEmployees([]);
    } finally {
      setListLoading(false);
    }
  }, [companyFilter]);

  useEffect(() => {
    if (!allowRead) return;
    void loadEmployees();
  }, [allowRead, loadEmployees]);

  const baseFilteredEmployees = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return employees.filter((emp) => {
      const st = emp.status || 'active';
      const statusMatched = deferredEmploymentStatus === 'all' ? true : st === deferredEmploymentStatus;
      if (!statusMatched) return false;
      if (!q) return true;
      const deptLabel = getDepartmentText(emp).toLowerCase();
      const posLabel = getPositionText(emp).toLowerCase();
      return (
        (emp.name || '').toLowerCase().includes(q) ||
        (emp.employee_number || '').toLowerCase().includes(q) ||
        (emp.department || '').toLowerCase().includes(q) ||
        deptLabel.includes(q) ||
        (emp.position || '').toLowerCase().includes(q) ||
        posLabel.includes(q)
      );
    });
  }, [employees, searchTerm, deferredEmploymentStatus, getDepartmentText, getPositionText]);

  const sortedFiltered = useMemo(
    () =>
      [...baseFilteredEmployees].sort((a, b) => a.employee_number.localeCompare(b.employee_number)),
    [baseFilteredEmployees]
  );

  const deptGroups = useMemo(() => {
    const m = new Map<string, EmpRow[]>();
    for (const emp of sortedFiltered) {
      const deptKey = getDepartmentText(emp);
      const arr = m.get(deptKey) || [];
      arr.push(emp);
      m.set(deptKey, arr);
    }
    const keys = Array.from(m.keys()).sort((a, b) => a.localeCompare(b));
    return keys.map((k) => ({ dept: k, rows: (m.get(k) || []).sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [sortedFiltered, getDepartmentText]);

  useEffect(() => {
    const ids: number[] = [];
    for (const g of deptGroups) for (const r of g.rows) ids.push(r.id);
    setFlatIds(ids);
  }, [deptGroups]);

  useEffect(() => {
    if (selectedId == null) {
      setSelectedIndex(-1);
      return;
    }
    setSelectedIndex(flatIds.indexOf(selectedId));
  }, [selectedId, flatIds]);

  const loadRows = useCallback(async () => {
    setEditBuffer(null);
    initialAtEditRef.current = null;
    setMode('browse');
    if (selectedId == null) {
      setRawRows([]);
      setSelectedDayIndex(-1);
      return;
    }
    setRowsLoading(true);
    try {
      const [ioRes, dayRes] = await Promise.all([
        apiClient.getAttendanceTimeInOut({
          employee_id: selectedId,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
        apiClient.getAttendanceTimeDay({
          employee_id: selectedId,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }).catch(() => ({ data: { items: [] } })),
      ]);
      const items = ((ioRes.data as { items?: TimeRow[] })?.items || []) as TimeRow[];
      const dayItems = ((dayRes.data as { items?: Array<Record<string, unknown>> })?.items || []) as Array<
        Record<string, unknown>
      >;
      const shiftMap: Record<string, string> = {};
      for (const r of dayItems) {
        const dk = String(r.work_day ?? '').slice(0, 10);
        if (!dk) continue;
        const sc = String(r.shift_code ?? '').trim();
        if (sc) shiftMap[dk] = sc;
      }
      setRawRows(items);
      setShiftCodeByDate(shiftMap);
      setSelectedDayIndex(-1);
    } catch {
      setRawRows([]);
      setShiftCodeByDate({});
      setSelectedDayIndex(-1);
    } finally {
      setRowsLoading(false);
    }
  }, [selectedId, dateFrom, dateTo]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    setEditBuffer(null);
    initialAtEditRef.current = null;
    setMode('browse');
  }, [selectedId]);

  useEffect(() => {
    const emp = selectedId != null ? employees.find((e) => e.id === selectedId) : null;
    const cid = emp?.company_id ?? null;
    if (cid == null) {
      setWorkCalendars([]);
      return;
    }
    let cancel = false;
    void apiClient
      .getAttendanceStandard(cid)
      .then(({ data }) => {
        if (cancel) return;
        const cals = ((data as { work_calendars?: WorkCalendarItem[] })?.work_calendars || []) as WorkCalendarItem[];
        setWorkCalendars(cals);
      })
      .catch(() => !cancel && setWorkCalendars([]));
    return () => {
      cancel = true;
    };
  }, [selectedId, employees]);

  const invalidRange = (dateFrom || '').slice(0, 10) > (dateTo || '').slice(0, 10);

  const builtGrid = useMemo(() => {
    if (invalidRange) return [];
    return buildDailyGrid(rawRows, dateFrom, dateTo);
  }, [rawRows, dateFrom, dateTo, invalidRange]);

  const displayGrid = editBuffer ?? builtGrid;

  useEffect(() => {
    if (invalidRange) {
      setSelectedDayIndex(-1);
      return;
    }
    const len = builtGrid.length;
    if (len === 0) {
      setSelectedDayIndex(-1);
      return;
    }
    setSelectedDayIndex((idx) => {
      if (idx >= 0 && idx < len) return idx;
      return 0;
    });
  }, [selectedId, dateFrom, dateTo, invalidRange, builtGrid]);

  const selectedEmp = useMemo(
    () => (selectedId != null ? employees.find((e) => e.id === selectedId) : null),
    [employees, selectedId]
  );

  useEffect(() => {
    if (selectedId == null) {
      setMasterBundle(null);
      return;
    }
    let cancel = false;
    setMasterLoading(true);
    void apiClient
      .getEmployeeAttendanceMaster(selectedId)
      .then(({ data }) => {
        if (!cancel) setMasterBundle((data as Record<string, unknown>) || null);
      })
      .catch(() => !cancel && setMasterBundle(null))
      .finally(() => !cancel && setMasterLoading(false));
    return () => {
      cancel = true;
    };
  }, [selectedId]);

  const mapCode = useCallback(
    (cid: number | null | undefined, cat: string, code: string | null | undefined, fallback = '—') => {
      const raw = (code || '').trim();
      if (!raw) return fallback;
      const items = cid != null ? refsByCompany[cid]?.[cat] || [] : [];
      const hit = items.find((x) => x.code === raw);
      return hit ? pickRefItemLabel(hit) : raw;
    },
    [pickRefItemLabel, refsByCompany]
  );
  const headerEmployee = (masterBundle?.employee as Record<string, unknown> | undefined) || null;
  const headerBasic = (masterBundle?.basic as Record<string, unknown> | undefined) || null;
  const headerDivision = selectedEmp ? mapCode(selectedEmp.company_id ?? null, 'division', String(headerEmployee?.division || ''), '—') : '—';
  const headerDept = selectedEmp ? mapCode(selectedEmp.company_id ?? null, 'department', String(headerEmployee?.department || ''), '—') : '—';
  const headerLevel = selectedEmp ? mapCode(selectedEmp.company_id ?? null, 'level', String(headerEmployee?.job_level || ''), '—') : '—';
  const headerWork = selectedEmp ? mapCode(selectedEmp.company_id ?? null, 'work_place', String(headerEmployee?.work_place || ''), '—') : '—';
  const headerHireDate = selectedEmp ? String(headerEmployee?.hire_date || '').slice(0, 10) || '—' : '—';
  const headerEmploymentType = selectedEmp
    ? mapCode(selectedEmp.company_id ?? null, 'employment_type', String(headerEmployee?.employment_type || ''), '—')
    : '—';
  const headerSalaryType = selectedEmp
    ? mapCode(selectedEmp.company_id ?? null, 'employee_type', String(headerEmployee?.salary_process_type || ''), '—')
    : '—';
  const headerWorkCalendar = selectedEmp
    ? String(headerBasic?.master_shiftwork ?? '').trim() || '—'
    : '—';
  const selectedShiftGroupId = Number(headerBasic?.master_shiftwork_id ?? 0) || null;
  const selectedShiftGroupName = String(headerBasic?.master_shiftwork ?? '').trim();
  const calendarShiftByDate = useMemo(() => {
    const out: Record<string, string> = {};
    if (!selectedEmp) return out;
    for (const r of displayGrid) {
      const [y, m, d] = r.dateKey.split('-').map(Number);
      if (!y || !m || !d) continue;
      const cal = workCalendars.find((x) => {
        if (Number(x.calendar_year) !== y || Number(x.calendar_month) !== m) return false;
        if (selectedShiftGroupId && Number(x.shift_group_id || 0) === selectedShiftGroupId) return true;
        if (!selectedShiftGroupId && selectedShiftGroupName) {
          return String(x.shift_group_name || '').trim() === selectedShiftGroupName;
        }
        return false;
      });
      const day = cal?.days?.find((dd) => Number(dd.day_of_month) === d);
      const sc = String(day?.shift_code || '').trim();
      out[r.dateKey] = sc || '-';
    }
    return out;
  }, [displayGrid, selectedEmp, selectedShiftGroupId, selectedShiftGroupName, workCalendars]);
  const calendarMetaByDate = useMemo(() => {
    const out: Record<string, { isWorkday?: boolean }> = {};
    if (!selectedEmp) return out;
    for (const r of displayGrid) {
      const [y, m, d] = r.dateKey.split('-').map(Number);
      if (!y || !m || !d) continue;
      const cal = workCalendars.find((x) => {
        if (Number(x.calendar_year) !== y || Number(x.calendar_month) !== m) return false;
        if (selectedShiftGroupId && Number(x.shift_group_id || 0) === selectedShiftGroupId) return true;
        if (!selectedShiftGroupId && selectedShiftGroupName) {
          return String(x.shift_group_name || '').trim() === selectedShiftGroupName;
        }
        return false;
      });
      const day = cal?.days?.find((dd) => Number(dd.day_of_month) === d);
      if (!day) continue;
      out[r.dateKey] = { isWorkday: Boolean(day.is_workday) };
    }
    return out;
  }, [displayGrid, selectedEmp, selectedShiftGroupId, selectedShiftGroupName, workCalendars]);
  const classifyRowByCalendar = useCallback(
    (dateKey: string): 'weekday' | 'holiday' | 'sunday' => {
      const dt = new Date(`${dateKey}T12:00:00`);
      if (!Number.isNaN(dt.getTime()) && dt.getDay() === 0) return 'sunday';
      const meta = calendarMetaByDate[dateKey];
      if (meta && meta.isWorkday === false) return 'holiday';
      return 'weekday';
    },
    [calendarMetaByDate]
  );

  const beginEdit = useCallback(() => {
    if (invalidRange || builtGrid.length === 0) return;
    initialAtEditRef.current = cloneGrid(builtGrid);
    setEditBuffer(cloneGrid(builtGrid));
    setMode('edit');
  }, [builtGrid, invalidRange]);

  const onAdd = () => {
    if (selectedId == null || invalidRange) return;
    if (builtGrid.length === 0) return;
    if (selectedDayIndex < 0) setSelectedDayIndex(0);
    beginEdit();
  };

  const onEdit = () => {
    if (selectedDayIndex < 0) return;
    beginEdit();
  };

  const onCancel = () => {
    setEditBuffer(null);
    initialAtEditRef.current = null;
    setMode('browse');
  };

  const getIsoForRecordId = (id: number) => {
    const r = rawRows.find((x) => x.id_time_in_out === id);
    return r ? effectivePunchIso(r) : null;
  };

  const onSave = async () => {
    if (!editBuffer || !initialAtEditRef.current || selectedId == null) return;
    const initial = initialAtEditRef.current;
    if (editBuffer.length !== initial.length) {
      alert(t('attendanceInquiry.saveError'));
      return;
    }
    setSaving(true);
    try {
      const ops: Array<() => Promise<unknown>> = [];
      for (let i = 0; i < editBuffer.length; i++) {
        const dRow = editBuffer[i];
        const iRow = initial[i];
        if (dRow.dateKey !== iRow.dateKey) {
          alert(t('attendanceInquiry.saveError'));
          return;
        }
        for (let s = 0; s < SLOT_COUNT; s++) {
          const rawSlot = dRow.slots[s].trim();
          const normalized = rawSlot ? normalizeTimeInput(rawSlot) : '';
          const newIso = normalized ? parseHHMMAsLocalIso(dRow.dateKey, normalized) : null;
          if (rawSlot && !newIso) {
            alert(t('attendanceInquiry.invalidTime'));
            return;
          }
          const oldId = iRow.slotRecordIds[s];
          // 출/퇴근조회 화면에서 저장되는 값은 수기 등록으로 간주(2)
          const idSinOut = 2;
          const dateI = dayStartIso(dRow.dateKey);
          if (newIso && !dateI) {
            alert(t('attendanceInquiry.saveError'));
            return;
          }
          if (oldId != null) {
            const oldIso = getIsoForRecordId(oldId);
            if (!newIso) {
              ops.push(() => apiClient.deleteAttendanceTimeInOut(oldId));
            } else if (!sameInstant(oldIso, newIso)) {
              ops.push(() =>
                apiClient.updateAttendanceTimeInOut(oldId, {
                  date_i: dateI,
                  date_in_out: newIso,
                  id_sin_out: idSinOut,
                })
              );
            }
          } else if (newIso) {
            ops.push(() =>
              apiClient.createAttendanceTimeInOut(selectedId, {
                date_i: dateI,
                date_in_out: newIso,
                id_sin_out: idSinOut,
              })
            );
          }
        }
      }

      const batchSize = 20;
      for (let i = 0; i < ops.length; i += batchSize) {
        await Promise.all(ops.slice(i, i + batchSize).map((run) => run()));
      }

      await loadRows();
      setEditBuffer(null);
      initialAtEditRef.current = null;
      setMode('browse');
      alert(t('attendanceInquiry.saved'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof msg === 'string' ? msg : t('attendanceInquiry.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (selectedDayIndex < 0 || displayGrid.length === 0) return;
    const dk = displayGrid[selectedDayIndex].dateKey;
    const ids = rawRows
      .filter((r) => {
        const iso = effectivePunchIso(r);
        return iso && localDateKeyFromIso(iso) === dk;
      })
      .map((r) => r.id_time_in_out);
    if (ids.length === 0) return;
    if (!confirm(t('attendanceInquiry.confirmDelete'))) return;
    setSaving(true);
    try {
      for (const id of ids) {
        await apiClient.deleteAttendanceTimeInOut(id);
      }
      await loadRows();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof msg === 'string' ? msg : t('attendanceInquiry.deleteError'));
    } finally {
      setSaving(false);
    }
  };

  const goFirstRecord = () => {
    if (displayGrid.length === 0) return;
    setSelectedDayIndex(0);
  };
  const goPrevRecord = () => {
    if (selectedDayIndex <= 0) return;
    setSelectedDayIndex(selectedDayIndex - 1);
  };
  const goNextRecord = () => {
    if (selectedDayIndex < 0 || selectedDayIndex >= displayGrid.length - 1) return;
    setSelectedDayIndex(selectedDayIndex + 1);
  };
  const goLastRecord = () => {
    if (displayGrid.length === 0) return;
    setSelectedDayIndex(displayGrid.length - 1);
  };

  const updateSlot = (dayIdx: number, slotIdx: number, value: string) => {
    setEditBuffer((prev) => {
      if (!prev) return prev;
      const next = cloneGrid(prev);
      if (!next[dayIdx]) return prev;
      const row = { ...next[dayIdx], slots: [...next[dayIdx].slots] };
      row.slots[slotIdx] = value;
      next[dayIdx] = row;
      return next;
    });
  };

  const inputCls =
    'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100 disabled:text-gray-600';
  const cellInputCls =
    'w-[4.25rem] min-w-0 border border-gray-300 rounded px-1 py-0.5 text-center text-xs font-mono tabular-nums bg-white disabled:bg-gray-100';

  if (!allowRead) {
    return (
      <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">{t('permission.noAccess')}</div>
    );
  }

  const listBlockingOverlay = listLoading || employmentStatusFilter !== deferredEmploymentStatus;
  const editing = mode === 'edit';
  const dateInputsLocked = rowsLoading || editing;

  return (
    <div className="p-1.5 sm:p-3 h-[calc(100vh-5.5rem)] overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3 items-stretch h-full min-h-0">
        <aside
          className={cn(
            'lg:col-span-4 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden',
            editing && 'opacity-60 pointer-events-none'
          )}
        >
          <div className="p-3 md:p-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('employees.listTitle')}</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-[11px] font-medium text-gray-600 whitespace-nowrap">{t('employees.field.company')}</p>
                <select
                  className="w-full min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
                  value={companyFilter}
                  disabled={listLoading}
                  onChange={(e) => {
                    setCompanyFilter(e.target.value);
                    setSelectedId(null);
                    setSearchInput('');
                    setSearchTerm('');
                    setExpandedDept(new Set());
                  }}
                >
                  <option value="">{t('employees.companyFilter.all')}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {companyLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-[11px] font-medium text-gray-600 whitespace-nowrap">{t('employees.filter.status')}</p>
                <select
                  className="w-full min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
                  value={employmentStatusFilter}
                  disabled={listLoading}
                  onChange={(e) =>
                    setEmploymentStatusFilter(
                      e.target.value === 'terminated' ? 'terminated' : e.target.value === 'all' ? 'all' : 'active'
                    )
                  }
                >
                  <option value="active">{t('employees.status.active')}</option>
                  <option value="terminated">{t('employees.status.terminated')}</option>
                  <option value="all">{t('employees.filter.status.all')}</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder={t('employees.searchPlaceholder')}
                  value={searchInput}
                  disabled={listLoading}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      setSearchTerm(searchInput);
                    }
                  }}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <span className="shrink-0 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {t('employees.list.count').replace('{count}', String(sortedFiltered.length))}
              </span>
              <button
                type="button"
                className="shrink-0 text-xs px-2 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
                disabled={listLoading}
                onClick={() => void loadEmployees()}
              >
                {t('attendanceMaster.refreshList')}
              </button>
            </div>
          </div>

          <div className="relative flex-1 min-h-0 max-h-[min(480px,calc(100vh-14rem))] lg:max-h-[calc(100vh-7.5rem)]">
            <div
              className={cn('h-full overflow-y-auto', listBlockingOverlay && 'pointer-events-none select-none')}
              aria-busy={listBlockingOverlay}
            >
              {sortedFiltered.length === 0 ? (
                <p className="p-4 text-sm text-gray-500 text-center">{t('attendanceMaster.noEmployees')}</p>
              ) : (
                <div className="divide-y divide-sky-100/70">
                  {deptGroups.map((g) => {
                    const open = expandedDept.has(g.dept) || searchTerm.trim().length > 0;
                    return (
                      <div key={g.dept}>
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full text-left px-3 py-2.5 border-b transition-colors bg-gradient-to-r from-sky-50 via-indigo-50/70 to-slate-50"
                          onClick={() =>
                            setExpandedDept((prev) => {
                              const n = new Set(prev);
                              if (n.has(g.dept)) n.delete(g.dept);
                              else n.add(g.dept);
                              return n;
                            })
                          }
                        >
                          {open ? (
                            <ChevronDown className="w-4 h-4 shrink-0 text-indigo-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 shrink-0 text-indigo-500" />
                          )}
                          <span className="text-sm font-semibold text-indigo-950 truncate">{g.dept}</span>
                          <span className="ml-auto text-xs font-medium text-indigo-700">{g.rows.length}</span>
                        </button>
                        {open && (
                          <ul className="divide-y divide-gray-100">
                            {g.rows.map((emp) => {
                              const active = selectedId === emp.id;
                              return (
                                <li key={emp.id}>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedId(emp.id)}
                                    className={cn(
                                      'w-full text-left px-3 md:px-4 py-3 flex items-center gap-2 transition-colors',
                                      active ? 'bg-sky-100 border-l-4 border-l-sky-600' : 'hover:bg-gray-50'
                                    )}
                                  >
                                    <User className="w-4 h-4 shrink-0 text-gray-500" />
                                    <div className="min-w-0 flex-1 text-xs overflow-hidden">
                                      <div className="font-semibold text-gray-900 truncate">{emp.name}</div>
                                      <div className="text-gray-500 truncate">
                                        {emp.employee_number} · {getDepartmentText(emp)}
                                      </div>
                                    </div>
                                    <span
                                      className={cn(
                                        'shrink-0 text-[10px] px-1.5 py-0.5 rounded',
                                        (emp.status || 'active') === 'active'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-gray-200 text-gray-700'
                                      )}
                                    >
                                      {getStatusText(emp.status || 'active')}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="lg:col-span-8 flex flex-col gap-2 min-h-0 h-full">
          <div className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-gradient-to-br from-sky-50/80 to-white shadow-sm p-2 sm:p-3 min-h-0 flex-1 h-full overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm sm:text-base font-bold text-sky-950">{t('attendanceInquiry.title')}</h2>
            </div>

            <HrMasterToolbar
              mode={mode}
              listLength={displayGrid.length}
              selectedIndex={selectedDayIndex}
              saving={saving}
              allowAdd={allowCreate}
              allowEdit={allowSave}
              allowDelete={allowDelete}
              allowSave={allowSave || allowCreate}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              onSave={onSave}
              onCancel={onCancel}
              onFirst={goFirstRecord}
              onPrev={goPrevRecord}
              onNext={goNextRecord}
              onLast={goLastRecord}
              t={t}
            />
            {saving && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {t('employees.personnelRecord.saving', '저장 중...')}
              </div>
            )}

            <div className="flex flex-wrap gap-3 items-end border border-gray-200 rounded-md bg-white/90 p-2">
              <div className="min-w-[200px] flex-1">
                <span className="text-xs text-gray-600 block mb-0.5">{t('attendanceInquiry.selectedEmployee')}</span>
                <div className="text-sm font-medium text-gray-900 border border-gray-200 rounded px-2 py-1.5 bg-gray-50 min-h-[2.25rem]">
                  {selectedEmp
                    ? `${selectedEmp.employee_number} · ${selectedEmp.name} · ${t('employees.general.swipeCard')}: ${selectedEmp.swipe_card || '-'} · ID: ${selectedEmp.id}`
                    : t('attendanceMaster.pickEmployee')}
                </div>
              </div>
              {selectedId ? <img src={getEmployeePhotoThumbnailUrl(selectedId)} alt="" className="w-14 h-14 rounded border object-cover" /> : null}
              <label className="text-xs text-gray-600">
                <span className="block mb-0.5">{t('attendanceInquiry.dateFrom')}</span>
                <input
                  type="date"
                  className={inputCls}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  disabled={dateInputsLocked}
                />
              </label>
              <label className="text-xs text-gray-600">
                <span className="block mb-0.5">{t('attendanceInquiry.dateTo')}</span>
                <input
                  type="date"
                  className={inputCls}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  disabled={dateInputsLocked}
                />
              </label>
              <button
                type="button"
                className="text-xs px-3 py-2 border border-sky-300 rounded-lg bg-sky-50 text-sky-900 font-medium hover:bg-sky-100"
                disabled={selectedId == null || rowsLoading || editing}
                onClick={() => void loadRows()}
              >
                {t('attendanceInquiry.reload')}
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs border border-dashed rounded-md px-3 py-2 bg-gray-50">
              <div><span className="text-gray-500">{t('attendanceMaster.division')}</span><div className="font-medium">{masterLoading ? '…' : headerDivision}</div></div>
              <div><span className="text-gray-500">{t('attendanceMaster.department')}</span><div className="font-medium">{masterLoading ? '…' : headerDept}</div></div>
              <div><span className="text-gray-500">{t('attendanceMaster.level')}</span><div className="font-medium">{masterLoading ? '…' : headerLevel}</div></div>
              <div><span className="text-gray-500">{t('attendanceMaster.workPlace')}</span><div className="font-medium">{masterLoading ? '…' : headerWork}</div></div>
              <div><span className="text-gray-500">{t('attendanceMaster.hireDate')}</span><div className="font-medium">{masterLoading ? '…' : headerHireDate}</div></div>
              <div><span className="text-gray-500">{t('attendanceMaster.employmentType')}</span><div className="font-medium">{masterLoading ? '…' : headerEmploymentType}</div></div>
              <div><span className="text-gray-500">{t('attendanceMaster.salaryProcessType')}</span><div className="font-medium">{masterLoading ? '…' : headerSalaryType}</div></div>
              <div><span className="text-gray-500">{t('attendanceMaster.masterShiftwork')}</span><div className="font-medium">{masterLoading ? '…' : headerWorkCalendar}</div></div>
            </div>

            <p className="text-[11px] text-gray-600 px-0.5">{t('attendanceInquiry.gridHint')}</p>

            {selectedId == null ? (
              <p className="text-sm text-gray-500 py-8 text-center">{t('attendanceMaster.pickEmployee')}</p>
            ) : invalidRange ? (
              <p className="text-sm text-amber-800 py-8 text-center border border-amber-200 rounded-md bg-amber-50">
                {t('attendanceInquiry.invalidRange')}
              </p>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto border border-gray-200 rounded-md bg-white">
                <table className="min-w-max w-full text-xs">
                  <thead className="sticky top-0 bg-sky-800 text-white z-[1]">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">{t('attendanceInquiry.col.date')}</th>
                      <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">{t('attendanceInquiry.col.weekday')}</th>
                      <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">{t('attendanceStatusInquiry.col.shift')}</th>
                      {Array.from({ length: SLOT_COUNT }, (_, n) => (
                        <th key={n} className="px-1 py-2 text-center font-semibold whitespace-nowrap min-w-[4.25rem]">
                          {t('attendanceInquiry.col.punchN').replace('{n}', String(n + 1))}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t('attendanceInquiry.col.punchCount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsLoading ? (
                      <tr>
                        <td colSpan={4 + SLOT_COUNT} className="px-3 py-6 text-center text-gray-500">
                          {t('common.loading')}
                        </td>
                      </tr>
                    ) : displayGrid.length === 0 ? (
                      <tr>
                        <td colSpan={4 + SLOT_COUNT} className="px-3 py-6 text-center text-gray-500">
                          {t('attendanceInquiry.noRows')}
                        </td>
                      </tr>
                    ) : (
                      displayGrid.map((row, idx) => {
                        const active = selectedDayIndex === idx;
                        const filled = row.slots.filter((s) => s.trim()).length;
                        return (
                          <tr
                            key={row.dateKey}
                            className={cn(
                              'border-b border-gray-100',
                              classifyRowByCalendar(row.dateKey) === 'weekday' && 'bg-white',
                              classifyRowByCalendar(row.dateKey) === 'holiday' && 'bg-amber-50',
                              classifyRowByCalendar(row.dateKey) === 'sunday' && 'bg-rose-50',
                              active && 'bg-sky-100'
                            )}
                            onClick={() => !editing && setSelectedDayIndex(idx)}
                          >
                            <td className="px-2 py-1 whitespace-nowrap font-medium tabular-nums">{formatDateCell(row.dateKey, locale)}</td>
                            <td className="px-2 py-1 whitespace-nowrap text-gray-700">{weekdayShort(row.dateKey, locale)}</td>
                            <td className="px-2 py-1 whitespace-nowrap text-gray-800">
                              {shiftCodeByDate[row.dateKey] || calendarShiftByDate[row.dateKey] || '-'}
                            </td>
                            {row.slots.map((slot, si) => (
                              <td key={si} className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="--:--"
                                  className={cellInputCls}
                                  disabled={!editing}
                                  value={slot}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    const digits = v.replace(/\D/g, '');
                                    if (digits === '' || digits.length <= 4 || v.includes(':')) {
                                      updateSlot(idx, si, v);
                                    }
                                  }}
                                  onBlur={() => {
                                    if (!editBuffer) return;
                                    const v = normalizeTimeInput(editBuffer[idx]?.slots[si] ?? '');
                                    updateSlot(idx, si, v);
                                  }}
                                />
                              </td>
                            ))}
                            <td className="px-2 py-1 text-center font-mono tabular-nums font-semibold text-sky-900">{filled}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
