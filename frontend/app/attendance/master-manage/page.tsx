'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Search, User, X } from 'lucide-react';
import { apiClient, getEmployeePhotoImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';
import { loadMasterExt } from '@/lib/employeeMasterExtension';

type EmpRow = {
  id: number;
  company_id?: number | null;
  employee_number: string;
  name: string;
  department?: string | null;
  position?: string | null;
  status?: string | null;
};

type RefItem = {
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

type ShiftGroupMaster = {
  id: number;
  name: string;
  description?: string | null;
};

type AttendanceShiftRef = {
  id: number;
  shift_code: string;
  title?: string | null;
};

type AttendanceLeaveLevel = {
  level_number: number;
  rows?: Array<{
    leave_type_name?: string | null;
    sort_order?: number | null;
    days_quota?: number | null;
    hours_quota?: number | null;
    minutes_quota?: number | null;
  }> | null;
};

type LeaveHistoryRecord = {
  id: string;
  purpose_of_leave: string;
  total_days: number;
  with_pay: boolean;
};

type DepartmentPositionRefByCompany = Record<number, { department: RefItem[]; position: RefItem[] }>;

type EmployeeListFilterKey = 'name' | 'employeeNumber' | 'department' | 'position' | 'status';

type Bundle = Record<string, unknown>;

type DetailTab = 'basic' | 'ot' | 'special' | 'shift';
type FixedSpecialChargeLabel = '주유수당' | '서서일하는 수당' | '기타';

const FIXED_SPECIAL_CHARGE_LABELS: FixedSpecialChargeLabel[] = ['주유수당', '서서일하는 수당', '기타'];

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function readLeaveHistoryRecords(employeeId: number): LeaveHistoryRecord[] {
  try {
    const raw = localStorage.getItem(`attendance.leave.manage.v2.${employeeId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { records?: LeaveHistoryRecord[] };
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

function asSafeNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatDayHourMinute(days: number, hours: number, minutes: number): string {
  return `${Math.max(0, Math.trunc(days))}-${Math.max(0, Math.trunc(hours))}:${Math.max(0, Math.trunc(minutes))}`;
}

function toDateSafe(ymd: string): Date | null {
  const s = String(ymd ?? '').trim();
  if (!s) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

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

const DETAIL_TAB_STYLES: Record<
  DetailTab,
  { tabActive: string; tabInactive: string; panel: string }
> = {
  basic: {
    tabActive: 'bg-sky-100 text-sky-900 border-sky-500 shadow-sm z-[1]',
    tabInactive: 'bg-white text-gray-600 border-gray-200 hover:bg-sky-50 hover:text-sky-800',
    panel: 'border-sky-300 bg-sky-50/50',
  },
  ot: {
    tabActive: 'bg-amber-100 text-amber-950 border-amber-500 shadow-sm z-[1]',
    tabInactive: 'bg-white text-gray-600 border-gray-200 hover:bg-amber-50 hover:text-amber-900',
    panel: 'border-amber-300 bg-amber-50/50',
  },
  special: {
    tabActive: 'bg-violet-100 text-violet-900 border-violet-500 shadow-sm z-[1]',
    tabInactive: 'bg-white text-gray-600 border-gray-200 hover:bg-violet-50 hover:text-violet-900',
    panel: 'border-violet-300 bg-violet-50/50',
  },
  shift: {
    tabActive: 'bg-emerald-100 text-emerald-900 border-emerald-500 shadow-sm z-[1]',
    tabInactive: 'bg-white text-gray-600 border-gray-200 hover:bg-emerald-50 hover:text-emerald-900',
    panel: 'border-emerald-300 bg-emerald-50/50',
  },
};

export default function AttendanceMasterManagePage() {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-master-manage', 'can_read');
  const allowSave = can('attendance-master-manage', 'can_update');
  const allowDelete = can('attendance-master-manage', 'can_delete');
  const allowCreate = can('attendance-master-manage', 'can_create');

  const [companies, setCompanies] = useState<
    Array<{ id: number; company_code: string; name_kor?: string | null; name_thai?: string | null; name_eng?: string | null }>
  >([]);
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<'active' | 'terminated' | 'all'>('active');
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentPositionRefByCompany, setDepartmentPositionRefByCompany] =
    useState<DepartmentPositionRefByCompany>({});
  const deptPosRef = useRef<DepartmentPositionRefByCompany>({});
  deptPosRef.current = departmentPositionRefByCompany;

  const [columnFilters, setColumnFilters] = useState<Record<EmployeeListFilterKey, string[]>>({
    name: [],
    employeeNumber: [],
    department: [],
    position: [],
    status: [],
  });
  const [openFilterKey, setOpenFilterKey] = useState<EmployeeListFilterKey | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);

  const [expandedDept, setExpandedDept] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [flatIds, setFlatIds] = useState<number[]>([]);

  const [mode, setMode] = useState<MasterUiMode>('browse');
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Bundle | null>(null);
  const [baseline, setBaseline] = useState<Bundle | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('basic');
  const [listLoading, setListLoading] = useState(false);
  const [headerRefByCategory, setHeaderRefByCategory] = useState<Record<string, RefItem[]>>({});
  const [workCalendarMasters, setWorkCalendarMasters] = useState<ShiftGroupMaster[]>([]);
  const [attendanceLeaveLevels, setAttendanceLeaveLevels] = useState<AttendanceLeaveLevel[]>([]);
  const [attendanceShifts, setAttendanceShifts] = useState<AttendanceShiftRef[]>([]);
  const [leaveHistoryOpen, setLeaveHistoryOpen] = useState(false);

  const deferredEmploymentStatus = useDeferredValue(employmentStatusFilter);
  const isFilterDeferredPending = employmentStatusFilter !== deferredEmploymentStatus;
  const listBlockingOverlay = listLoading || isFilterDeferredPending;

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
      /* keep UI stable */
    }
  }, []);

  useEffect(() => {
    if (!employees.length) return;
    const ids = new Set<number>();
    for (const e of employees) {
      if (e.company_id != null) ids.add(e.company_id);
    }
    Array.from(ids).forEach((cid) => void ensureDepartmentPositionRefs(cid));
  }, [employees, ensureDepartmentPositionRefs]);

  useEffect(() => {
    if (openFilterKey == null) return;
    const onDown = (e: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setOpenFilterKey(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openFilterKey]);

  const pickRefItemLabel = useCallback(
    (it: RefItem) => {
      if (locale === 'ko') return it.name_kor || it.name_eng || it.name_thai || it.code;
      if (locale === 'en') return it.name_eng || it.name_kor || it.name_thai || it.code;
      return it.name_thai || it.name_kor || it.name_eng || it.code;
    },
    [locale]
  );

  const selectedCompanyForHeader = useMemo(() => {
    if (selectedId == null) return null;
    const fromList = employees.find((e) => e.id === selectedId)?.company_id;
    if (fromList != null && Number.isFinite(Number(fromList))) return Number(fromList);
    const cid = (draft?.employee as Record<string, unknown> | undefined)?.company_id;
    return typeof cid === 'number' && Number.isFinite(cid) ? cid : null;
  }, [selectedId, employees, draft?.employee]);

  const resolveHeaderRefLabel = useCallback(
    (category: string, code: unknown) => {
      const c = String(code ?? '').trim();
      if (!c) return '';
      const items = headerRefByCategory[category] ?? [];
      const it = items.find((x) => x.code === c);
      return it ? pickRefItemLabel(it) : c;
    },
    [headerRefByCategory, pickRefItemLabel]
  );

  useEffect(() => {
    if (selectedCompanyForHeader == null) {
      setHeaderRefByCategory({});
      setWorkCalendarMasters([]);
      setAttendanceLeaveLevels([]);
      setAttendanceShifts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [{ data }, attendanceStandardRes] = await Promise.all([
          apiClient.getEmployeeReferenceItemsAllCategories(selectedCompanyForHeader),
          apiClient.getAttendanceStandard(selectedCompanyForHeader).catch(() => ({ data: {} })),
        ]);
        if (!cancelled) setHeaderRefByCategory((data as Record<string, RefItem[]>) || {});
        const masters = ((attendanceStandardRes.data as { shift_group_masters?: ShiftGroupMaster[] })?.shift_group_masters ||
          []) as ShiftGroupMaster[];
        const leaveLevels = ((attendanceStandardRes.data as { leave_levels?: AttendanceLeaveLevel[] })?.leave_levels ||
          []) as AttendanceLeaveLevel[];
        const shifts = ((attendanceStandardRes.data as { shifts?: AttendanceShiftRef[] })?.shifts || []) as AttendanceShiftRef[];
        if (!cancelled) setWorkCalendarMasters(masters);
        if (!cancelled) setAttendanceLeaveLevels(leaveLevels);
        if (!cancelled) setAttendanceShifts(shifts);
      } catch {
        if (!cancelled) {
          setHeaderRefByCategory({});
          setWorkCalendarMasters([]);
          setAttendanceLeaveLevels([]);
          setAttendanceShifts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyForHeader]);

  useEffect(() => {
    if (!draft || !workCalendarMasters.length) return;
    const basic = (draft.basic as Record<string, unknown>) || {};
    const hasId = Number(basic.master_shiftwork_id ?? 0) > 0;
    const legacyName = String(basic.master_shiftwork ?? '').trim();
    if (hasId || !legacyName) return;
    const matched = workCalendarMasters.find((m) => m.name.trim() === legacyName);
    if (!matched) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const b = (prev.basic as Record<string, unknown>) || {};
      if (Number(b.master_shiftwork_id ?? 0) > 0) return prev;
      return { ...prev, basic: { ...b, master_shiftwork_id: matched.id } };
    });
  }, [draft, workCalendarMasters]);

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

  const getEmployeeListFieldValue = useCallback(
    (emp: EmpRow, key: EmployeeListFilterKey): string => {
      if (key === 'name') return emp.name || '-';
      if (key === 'employeeNumber') return emp.employee_number || '-';
      if (key === 'department') return getDepartmentText(emp);
      if (key === 'position') return getPositionText(emp);
      return getStatusText(emp.status || 'active');
    },
    [getDepartmentText, getPositionText, getStatusText]
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

  type RowView = { emp: EmpRow; values: Record<EmployeeListFilterKey, string> };

  const baseListRows = useMemo<RowView[]>(
    () =>
      baseFilteredEmployees.map((emp) => ({
        emp,
        values: {
          name: getEmployeeListFieldValue(emp, 'name'),
          employeeNumber: getEmployeeListFieldValue(emp, 'employeeNumber'),
          department: getEmployeeListFieldValue(emp, 'department'),
          position: getEmployeeListFieldValue(emp, 'position'),
          status: getEmployeeListFieldValue(emp, 'status'),
        },
      })),
    [baseFilteredEmployees, getEmployeeListFieldValue]
  );

  const filteredRows = useMemo(
    () =>
      baseListRows.filter((row) =>
        (Object.keys(columnFilters) as EmployeeListFilterKey[]).every((key) => {
          const selected = columnFilters[key];
          if (!selected?.length) return true;
          return selected.includes(row.values[key]);
        })
      ),
    [baseListRows, columnFilters]
  );

  const listFilterValues = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort();
    return {
      name: uniq(baseListRows.map((r) => r.values.name)),
      employeeNumber: uniq(baseListRows.map((r) => r.values.employeeNumber)),
      department: uniq(baseListRows.map((r) => r.values.department)),
      position: uniq(baseListRows.map((r) => r.values.position)),
      status: uniq(baseListRows.map((r) => r.values.status)),
    } as Record<EmployeeListFilterKey, string[]>;
  }, [baseListRows]);

  const toggleColumnFilterValue = useCallback((key: EmployeeListFilterKey, value: string) => {
    setColumnFilters((prev) => {
      const list = prev[key] ?? [];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [key]: next };
    });
  }, []);

  const sortedFiltered = useMemo(
    () => [...filteredRows].sort((a, b) => a.emp.employee_number.localeCompare(b.emp.employee_number)),
    [filteredRows]
  );

  const empOrderIndex = useMemo(() => {
    const m = new Map<number, number>();
    sortedFiltered.forEach((row, i) => m.set(row.emp.id, i + 1));
    return m;
  }, [sortedFiltered]);

  const deptGroups = useMemo(() => {
    const m = new Map<string, EmpRow[]>();
    for (const { emp } of sortedFiltered) {
      const deptKey = getDepartmentText(emp);
      const arr = m.get(deptKey) || [];
      arr.push(emp);
      m.set(deptKey, arr);
    }
    const keys = Array.from(m.keys()).sort((a, b) => a.localeCompare(b));
    return keys.map((k) => ({ dept: k, rows: (m.get(k) || []).sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [sortedFiltered, getDepartmentText]);

  const anyFilterActive = useMemo(
    () => Object.values(columnFilters).some((a) => a.length > 0),
    [columnFilters]
  );

  const rebuildFlat = useCallback((groups: { dept: string; rows: EmpRow[] }[]) => {
    const ids: number[] = [];
    for (const g of groups) for (const r of g.rows) ids.push(r.id);
    setFlatIds(ids);
  }, []);

  useEffect(() => {
    rebuildFlat(deptGroups);
  }, [deptGroups, rebuildFlat]);

  useEffect(() => {
    if (selectedId == null) {
      setSelectedIndex(-1);
      return;
    }
    const ix = flatIds.indexOf(selectedId);
    setSelectedIndex(ix);
  }, [selectedId, flatIds]);

  const loadBundle = useCallback(
    async (employeeId: number) => {
      setLoadErr(null);
      try {
        const { data } = await apiClient.getEmployeeAttendanceMaster(employeeId);
        const b = data as Bundle;
        setDraft(deepClone(b));
        setBaseline(deepClone(b));
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setLoadErr(typeof msg === 'string' ? msg : t('attendanceMaster.loadError'));
        setDraft(null);
        setBaseline(null);
      }
    },
    [t]
  );

  useEffect(() => {
    if (!allowRead || selectedId == null) return;
    void loadBundle(selectedId);
  }, [allowRead, selectedId, loadBundle]);

  const editing = mode === 'edit' || mode === 'new';
  const locked = !editing;

  const onAdd = () => {
    if (selectedId == null) {
      alert(t('attendanceMaster.pickEmployee'));
      return;
    }
    setMode('edit');
  };

  const onEdit = () => {
    if (selectedId == null) return;
    setMode('edit');
  };

  const onCancel = () => {
    if (baseline) setDraft(deepClone(baseline));
    setMode('browse');
  };

  const onSave = async () => {
    if (selectedId == null || !draft) return;
    const workCalendarRequired = Number((draft.basic as Record<string, unknown>)?.master_shiftwork_id ?? 0);
    if (!Number.isFinite(workCalendarRequired) || workCalendarRequired <= 0) {
      alert('근무달력은 필수 입력입니다.');
      return;
    }
    setSaving(true);
    try {
      const specialPayload = FIXED_SPECIAL_CHARGE_LABELS.map((label, idx) => {
        const slot = idx + 1;
        const src = ((draft.special_charges as { slot_index: number; label: string; amount_baht: number }[]) || []).find(
          (x) => x.slot_index === slot
        );
        return {
          slot_index: slot,
          label,
          amount_baht: src?.amount_baht ?? 0,
        };
      });
      const basicPayload = {
        ...(draft.basic as Record<string, unknown>),
        employment_starting_date: hrStartDate || null,
        end_probation_date: hrProbationEndDate || null,
        probation_days: hrProbationDays === '' ? null : Number(hrProbationDays),
      };
      const body: Record<string, unknown> = {
        basic: basicPayload,
        ot: draft.ot ?? {},
        special_charges: specialPayload,
        shift: { ...((draft.shift as Record<string, unknown>) ?? {}), schedule_mode: 'week' },
        leave: draft.leave ?? {},
      };
      const { data } = await apiClient.putEmployeeAttendanceMaster(selectedId, body);
      const b = data as Bundle;
      setDraft(deepClone(b));
      setBaseline(deepClone(b));
      setMode('browse');
      alert(t('attendanceMaster.saved'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof msg === 'string' ? msg : t('attendanceMaster.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (selectedId == null) return;
    const ex = draft?.exists === true;
    if (!ex) {
      alert(t('attendanceMaster.nothingToDelete'));
      return;
    }
    if (!window.confirm(t('attendanceMaster.confirmDelete'))) return;
    setSaving(true);
    try {
      await apiClient.deleteEmployeeAttendanceMaster(selectedId);
      await loadBundle(selectedId);
      setMode('browse');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof msg === 'string' ? msg : t('attendanceMaster.deleteError'));
    } finally {
      setSaving(false);
    }
  };

  const navTo = (ix: number) => {
    if (ix < 0 || ix >= flatIds.length) return;
    setSelectedId(flatIds[ix]);
    setMode('browse');
  };

  const setBasic = (patch: Record<string, unknown>) => {
    setDraft((d) => {
      if (!d) return d;
      const b = { ...((d.basic as Record<string, unknown>) || {}), ...patch };
      return { ...d, basic: b };
    });
  };

  const setOt = (patch: Record<string, unknown>) => {
    setDraft((d) => {
      if (!d) return d;
      const b = { ...((d.ot as Record<string, unknown>) || {}), ...patch };
      return { ...d, ot: b };
    });
  };

  const setLeave = (patch: Record<string, unknown>) => {
    setDraft((d) => {
      if (!d) return d;
      const b = { ...((d.leave as Record<string, unknown>) || {}), ...patch };
      return { ...d, leave: b };
    });
  };

  const shiftDays = (draft?.shift as { days?: { key: string; enabled: boolean; shift_id?: number | null; shift_value: string }[] })?.days || [];

  const updateShiftDay = (key: string, patch: Partial<{ enabled: boolean; shift_id: number | null; shift_value: string }>) => {
    setDraft((d) => {
      if (!d) return d;
      const sh = (d.shift as Record<string, unknown>) || {};
      const days = [...((sh.days as { key: string; enabled: boolean; shift_id?: number | null; shift_value: string }[]) || [])];
      const ix = days.findIndex((x) => x.key === key);
      if (ix >= 0) days[ix] = { ...days[ix], ...patch };
      return { ...d, shift: { ...sh, days } };
    });
  };

  const attendanceSwipeCardDisplay = useMemo(() => {
    if (selectedId == null || !draft) return '';
    const fromApi = String((draft.employee as Record<string, unknown>)?.swipe_card ?? '').trim();
    if (fromApi) return fromApi;
    return (loadMasterExt(selectedId).swipe_card || '').trim();
  }, [selectedId, draft]);

  const hrStartDate = useMemo(
    () => String((draft?.employee as Record<string, unknown> | undefined)?.hire_date ?? '').slice(0, 10),
    [draft]
  );

  const hrProbationEndDate = useMemo(() => {
    if (selectedId == null) return '';
    const extProbationEnd = (loadMasterExt(selectedId).probation_end || '').trim();
    if (extProbationEnd) return extProbationEnd.slice(0, 10);
    return String((draft?.basic as Record<string, unknown> | undefined)?.end_probation_date ?? '').slice(0, 10);
  }, [selectedId, draft]);

  const hrProbationDays = useMemo(() => {
    if (!hrStartDate || !hrProbationEndDate) return '';
    const s = new Date(hrStartDate);
    const e = new Date(hrProbationEndDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
    const days = Math.floor((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000));
    return days >= 0 ? String(days) : '';
  }, [hrStartDate, hrProbationEndDate]);

  const leaveHistorySummaryRows = useMemo(() => {
    if (selectedId == null || !draft) return [] as Array<{
      leaveType: string;
      statutoryDays: number;
      statutoryHours: number;
      statutoryMinutes: number;
      usedWithPayDays: number;
      usedWithoutPayDays: number;
    }>;

    const level = String((draft.leave as Record<string, unknown>)?.level_of_leave ?? '').trim();
    const levelNo = parseInt(level, 10);
    const levelRows =
      attendanceLeaveLevels.find((x) => Number(x.level_number) === levelNo)?.rows ??
      attendanceLeaveLevels.find((x) => Number(x.level_number) === 1)?.rows ??
      [];

    const quotaRows = [...(Array.isArray(levelRows) ? levelRows : [])]
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      .map((r) => ({
        leaveType: String(r.leave_type_name ?? '').trim(),
        statutoryDays: asSafeNumber(r.days_quota),
        statutoryHours: asSafeNumber(r.hours_quota),
        statutoryMinutes: asSafeNumber(r.minutes_quota),
      }))
      .filter((r) => r.leaveType);

    const history = readLeaveHistoryRecords(selectedId);
    const usedMap = new Map<string, { withPay: number; withoutPay: number }>();
    for (const rec of history) {
      const key = String(rec.purpose_of_leave ?? '').trim();
      if (!key) continue;
      const cur = usedMap.get(key) ?? { withPay: 0, withoutPay: 0 };
      const days = asSafeNumber(rec.total_days);
      if (rec.with_pay) cur.withPay += days;
      else cur.withoutPay += days;
      usedMap.set(key, cur);
    }

    const annualLeaveName = 'Annual leave';
    const annualFromMaster = {
      leaveType: annualLeaveName,
      statutoryDays: asSafeNumber((draft.leave as Record<string, unknown>)?.year_days),
      statutoryHours: asSafeNumber((draft.leave as Record<string, unknown>)?.year_hours),
      statutoryMinutes: asSafeNumber((draft.leave as Record<string, unknown>)?.year_minutes),
    };
    const hasAnnual = quotaRows.some((r) => r.leaveType.toLowerCase() === annualLeaveName.toLowerCase());
    const mergedQuotaRows = hasAnnual
      ? quotaRows.map((r) => (r.leaveType.toLowerCase() === annualLeaveName.toLowerCase() ? annualFromMaster : r))
      : [annualFromMaster, ...quotaRows];

    return mergedQuotaRows.map((q) => {
      const used = usedMap.get(q.leaveType) ?? { withPay: 0, withoutPay: 0 };
      return {
        ...q,
        usedWithPayDays: used.withPay,
        usedWithoutPayDays: used.withoutPay,
      };
    });
  }, [selectedId, draft, attendanceLeaveLevels]);

  const currentYearLeaveUsage = useMemo(() => {
    if (selectedId == null || !draft) return 0;
    const leaveYear = parseInt(String((draft.leave as Record<string, unknown>)?.leave_year ?? ''), 10);
    if (!Number.isFinite(leaveYear)) return 0;
    const history = readLeaveHistoryRecords(selectedId);
    return history.reduce((acc, rec) => {
      const overlap = daysOverlappedWithYear(
        String((rec as Record<string, unknown>)?.from_date ?? ''),
        String((rec as Record<string, unknown>)?.to_date ?? ''),
        leaveYear
      );
      return acc + overlap;
    }, 0);
  }, [selectedId, draft]);

  const currentYearRemainDays = useMemo(() => {
    const yearDays = asSafeNumber((draft?.leave as Record<string, unknown> | undefined)?.year_days);
    return Math.max(0, yearDays - currentYearLeaveUsage);
  }, [draft, currentYearLeaveUsage]);

  if (!allowRead) {
    return (
      <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">{t('permission.noAccess')}</div>
    );
  }

  const companyLabel = (c: (typeof companies)[number]) => {
    if (locale === 'ko') return c.name_kor || c.name_eng || c.name_thai || c.company_code;
    if (locale === 'en') return c.name_eng || c.name_kor || c.name_thai || c.company_code;
    return c.name_thai || c.name_kor || c.name_eng || c.company_code;
  };

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'basic', label: t('attendanceMaster.tab.basic') },
    { key: 'ot', label: t('attendanceMaster.tab.ot') },
    { key: 'special', label: t('attendanceMaster.tab.special') },
    { key: 'shift', label: t('attendanceMaster.tab.shift') },
  ];

  const inputCls =
    'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100 disabled:text-gray-600';
  const chkCls = 'h-3.5 w-3.5 rounded border-gray-300';
  const formatThousands = (v: number) => new Intl.NumberFormat('en-US').format(Math.max(0, Math.trunc(v || 0)));

  return (
    <div className="p-1.5 sm:p-3">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3 items-stretch min-h-0 lg:min-h-[min(480px,calc(100vh-5.5rem))]">
        <aside
          className={cn(
            'lg:col-span-4 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden',
            mode !== 'browse' && 'opacity-60 pointer-events-none'
          )}
        >
          <div className="p-3 md:p-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('employees.listTitle')}</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-[11px] font-medium text-gray-600 whitespace-nowrap">{t('employees.field.company')}</p>
                <select
                  className="w-full min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-500"
                  value={companyFilter}
                  disabled={listLoading}
                  onChange={(e) => {
                    setCompanyFilter(e.target.value);
                    setSelectedId(null);
                    setDraft(null);
                    setBaseline(null);
                    setMode('browse');
                    setSearchInput('');
                    setSearchTerm('');
                    setColumnFilters({ name: [], employeeNumber: [], department: [], position: [], status: [] });
                    setExpandedDept(new Set());
                  }}
                  aria-label={t('attendanceMaster.filterCompany')}
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
                  className="w-full min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-500"
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
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <span className="shrink-0 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {t('employees.list.count').replace('{count}', String(sortedFiltered.length))}
              </span>
              <button
                type="button"
                className="shrink-0 text-xs px-2 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
                disabled={listLoading}
                onClick={() => void loadEmployees()}
              >
                {t('attendanceMaster.refreshList')}
              </button>
            </div>
          </div>

          <div className="relative flex-1 min-h-0 max-h-[min(480px,calc(100vh-14rem))] lg:max-h-[calc(100vh-7.5rem)]">
            <div
              className={cn(
                'h-full overflow-y-auto',
                listBlockingOverlay && 'pointer-events-none select-none'
              )}
              aria-busy={listBlockingOverlay}
            >
            {sortedFiltered.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 text-center">{t('attendanceMaster.noEmployees')}</p>
            ) : (
              <>
                <div className="sticky top-0 z-10 bg-gray-50 border-y border-gray-200 px-2 md:px-4 py-2 text-[11px] font-semibold text-gray-600 flex items-center gap-1 md:gap-2">
                  <span className="w-8 shrink-0 text-center">{t('employees.list.field.no')}</span>
                  <span className="text-gray-300">|</span>
                  {(
                    [
                      ['name', t('employees.list.field.name'), 'min-w-0 flex-[1.1] truncate'] as const,
                      ['employeeNumber', t('employees.field.employeeNumber'), 'min-w-0 flex-1 truncate'] as const,
                      ['department', t('employees.field.department'), 'min-w-0 flex-1 truncate'] as const,
                      ['position', t('employees.field.position'), 'min-w-0 flex-1 truncate'] as const,
                      ['status', t('employees.list.field.status'), 'ml-auto shrink-0'] as const,
                    ] as const
                  ).map(([key, label, cls], idx) => {
                    const fk = key as EmployeeListFilterKey;
                    const selectedList = columnFilters[fk];
                    const hasFilter = selectedList.length > 0;
                    const values = listFilterValues[fk];
                    return (
                      <div key={key} className={cn('relative flex items-center gap-1', cls)}>
                        <span className="truncate">{label}</span>
                        <button
                          type="button"
                          className={cn('p-0.5 rounded hover:bg-gray-200', hasFilter ? 'text-blue-600' : 'text-gray-400')}
                          onClick={() => setOpenFilterKey((prev) => (prev === fk ? null : fk))}
                          title={t('appList.filter.title')}
                        >
                          <Filter className="w-3.5 h-3.5" />
                        </button>
                        {openFilterKey === fk && (
                          <div
                            ref={filterPopoverRef}
                            className="absolute top-5 left-0 z-20 w-60 rounded-md border border-gray-200 bg-white shadow-lg p-2"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between pb-1 border-b border-gray-100 mb-1">
                              <span className="text-xs font-medium text-gray-700">{label}</span>
                              <button
                                type="button"
                                className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                                onClick={() => setOpenFilterKey(null)}
                                aria-label={t('system.close')}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="max-h-40 overflow-auto space-y-1">
                              {values.length === 0 ? (
                                <p className="px-2 py-1 text-xs text-gray-500">{t('appList.filter.noValues')}</p>
                              ) : (
                                values.map((val) => (
                                  <label key={val} className="flex items-center gap-2 px-1 py-0.5 text-xs text-gray-700">
                                    <input
                                      type="checkbox"
                                      className="rounded border-gray-300"
                                      checked={selectedList.includes(val)}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onChange={() => toggleColumnFilterValue(fk, val)}
                                    />
                                    <span className="truncate">{val}</span>
                                  </label>
                                ))
                              )}
                            </div>
                            <div className="mt-1 pt-1 border-t border-gray-100 flex items-center justify-between">
                              <button
                                type="button"
                                className="text-[11px] text-gray-600 hover:text-gray-900"
                                onClick={() => setColumnFilters((prev) => ({ ...prev, [fk]: [] }))}
                              >
                                {t('system.rgm.clearAll')}
                              </button>
                              <span className="text-[11px] text-gray-500">
                                {t('appList.filter.selectedCount').replace('{count}', String(selectedList.length))}
                              </span>
                            </div>
                          </div>
                        )}
                        {idx < 4 && <span className="text-gray-300 hidden sm:inline">|</span>}
                      </div>
                    );
                  })}
                </div>

                <div className="divide-y divide-sky-100/70">
                  {deptGroups.map((g) => {
                    const open =
                      expandedDept.has(g.dept) || searchTerm.trim().length > 0 || anyFilterActive;
                    return (
                      <div key={g.dept}>
                        <button
                          type="button"
                          className={cn(
                            'flex items-center gap-2 w-full text-left px-3 py-2.5 border-b transition-colors',
                            'bg-gradient-to-r from-sky-50 via-indigo-50/70 to-slate-50',
                            'border-indigo-100/80 hover:from-sky-100/80 hover:via-indigo-100/50 hover:to-slate-50'
                          )}
                          onClick={() => {
                            setExpandedDept((prev) => {
                              const n = new Set(prev);
                              if (n.has(g.dept)) n.delete(g.dept);
                              else n.add(g.dept);
                              return n;
                            });
                          }}
                        >
                          {open ? (
                            <ChevronDown className="w-4 h-4 shrink-0 text-indigo-500" aria-hidden />
                          ) : (
                            <ChevronRight className="w-4 h-4 shrink-0 text-indigo-500" aria-hidden />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-indigo-950">
                            {g.dept}
                            <span className="ml-2 align-middle inline-flex items-center rounded-full bg-indigo-100/95 px-2 py-0.5 text-[11px] font-medium text-indigo-700 tabular-nums shadow-sm shadow-indigo-900/5">
                              {g.rows.length}
                            </span>
                          </span>
                        </button>
                        {open && (
                          <ul className="bg-white">
                            {g.rows.map((emp) => {
                              const active = selectedId === emp.id;
                              const rowNo = empOrderIndex.get(emp.id) ?? 0;
                              return (
                                <li key={emp.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (editing) {
                                        alert(t('employees.toolbar.finishEditFirst'));
                                        return;
                                      }
                                      setSelectedId(emp.id);
                                    }}
                                    className={cn(
                                      'w-full text-left px-2 md:px-4 py-3 flex items-center gap-2 md:gap-3 transition-colors',
                                      active ? 'bg-primary-50 border-l-4 border-primary-600' : 'hover:bg-gray-50 border-l-4 border-transparent'
                                    )}
                                  >
                                    <span className="w-8 shrink-0 text-center text-xs text-gray-500 font-medium">{rowNo}</span>
                                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-2 text-xs overflow-hidden">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className="mt-0.5 p-1.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
                                          <User className="w-4 h-4" />
                                        </div>
                                        <span className="font-semibold text-base text-gray-900 truncate">{emp.name}</span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-x-1 text-[11px] sm:text-xs text-gray-500 min-w-0">
                                        <span className="text-gray-400 hidden sm:inline">|</span>
                                        <span className="truncate">{emp.employee_number || '-'}</span>
                                        <span className="text-gray-400">|</span>
                                        <span className="truncate text-gray-600">{getDepartmentText(emp)}</span>
                                        <span className="text-gray-400 hidden md:inline">|</span>
                                        <span className="truncate text-gray-600 hidden md:inline">{getPositionText(emp)}</span>
                                        <span
                                          className={cn(
                                            'inline-block sm:ml-auto px-2 py-0.5 text-[10px] sm:text-xs rounded-full shrink-0',
                                            (emp.status || 'active') === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                                          )}
                                        >
                                          {getStatusText(emp.status || 'active')}
                                        </span>
                                      </div>
                                    </div>
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
              </>
            )}
            </div>
            {listBlockingOverlay && (
              <div
                className="absolute inset-0 z-30 flex items-start justify-center pt-14 sm:pt-20 bg-white/60 backdrop-blur-[1px]"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-md text-sm text-gray-800">
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"
                    aria-hidden
                  />
                  {t('common.loading')}
                </div>
              </div>
            )}
          </div>
        </aside>

        <section className="lg:col-span-8 flex flex-col bg-white rounded-lg shadow border border-gray-200 min-h-0 p-1.5 sm:p-2 lg:max-h-[calc(100vh-5.5rem)] overflow-y-auto">
          <HrMasterToolbar
            mode={mode}
            listLength={flatIds.length}
            selectedIndex={selectedIndex}
            saving={saving}
            allowAdd={allowCreate}
            allowEdit={allowSave}
            allowDelete={allowDelete}
            allowSave={allowSave}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
            onSave={() => void onSave()}
            onCancel={onCancel}
            onFirst={() => navTo(0)}
            onPrev={() => navTo(selectedIndex - 1)}
            onNext={() => navTo(selectedIndex + 1)}
            onLast={() => navTo(flatIds.length - 1)}
            t={t}
          />

          {selectedId == null && (
            <p className="text-sm text-gray-500 py-8 text-center">{t('attendanceMaster.pickEmployee')}</p>
          )}

          {selectedId != null && loadErr && <p className="text-sm text-rose-600 py-4 text-center">{loadErr}</p>}

          {selectedId != null && !loadErr && draft && (
            <>
              <div className="border border-slate-200 rounded-md p-1.5 bg-gradient-to-b from-slate-50 to-white">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_96px] gap-1.5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-1.5 gap-y-1 text-xs">
                    <label className="col-span-2 sm:col-span-1">
                      <span className="text-gray-600 block mb-0.5">{t('attendanceMaster.code')}</span>
                      <input className={inputCls} disabled value={String((draft.employee as Record<string, unknown>)?.employee_number ?? '')} readOnly />
                    </label>
                    <label className="col-span-2 sm:col-span-1">
                      <span className="text-gray-600 block mb-0.5">{t('employees.general.swipeCard')}</span>
                      <input
                        className={inputCls}
                        disabled
                        value={attendanceSwipeCardDisplay}
                        readOnly
                      />
                    </label>
                    <label className="col-span-2">
                      <span className="text-gray-600 block mb-0.5">{t('attendanceMaster.nameLocal')}</span>
                      <input
                        className={inputCls}
                        disabled
                        value={String((draft.employee as Record<string, unknown>)?.name ?? '')}
                        readOnly
                      />
                    </label>
                    <label className="col-span-2">
                      <span className="text-gray-600 block mb-0.5">{t('attendanceMaster.nameEn')}</span>
                      <input
                        className={inputCls}
                        disabled
                        value={String((draft.employee as Record<string, unknown>)?.name_en ?? '')}
                        readOnly
                      />
                    </label>
                    {(
                      [
                        { fieldKey: 'division', category: 'division', lab: t('attendanceMaster.division'), className: 'col-span-2 sm:col-span-1' },
                        { fieldKey: 'department', category: 'department', lab: t('attendanceMaster.department'), className: 'col-span-2 sm:col-span-1' },
                        { fieldKey: 'job_level', category: 'level', lab: t('attendanceMaster.level'), className: 'col-span-2 sm:col-span-1' },
                        { fieldKey: 'work_place', category: 'work_place', lab: t('attendanceMaster.workPlace'), className: 'col-span-2 sm:col-span-1' },
                        { fieldKey: 'area', category: 'area', lab: t('attendanceMaster.area'), className: 'col-span-2 sm:col-span-1' },
                        { fieldKey: 'work_status', category: 'work_status', lab: t('attendanceMaster.workStatus'), className: 'col-span-2 sm:col-span-1' },
                        { fieldKey: 'employment_type', category: 'employment_type', lab: t('employees.general.empType'), className: 'col-span-2 sm:col-span-1' },
                        { fieldKey: 'salary_process_type', category: 'employee_type', lab: t('employees.general.processSalaryType'), className: 'col-span-2 sm:col-span-1' },
                        { fieldKey: 'position', category: 'position', lab: t('attendanceMaster.position'), className: 'col-span-2 sm:col-span-1 lg:col-span-2' },
                      ] as const
                    ).map(({ fieldKey, category, lab, className }) => (
                      <label key={fieldKey} className={className}>
                        <span className="text-gray-600 block mb-0.5">{lab}</span>
                        {(() => {
                          const raw =
                            resolveHeaderRefLabel(category, (draft.employee as Record<string, unknown>)?.[fieldKey]) || '—';
                          const isSalaryProcess = fieldKey === 'salary_process_type';
                          const salaryColorCls =
                            raw.includes('시급') || raw.toLowerCase().includes('daily')
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : raw.includes('월급') || raw.toLowerCase().includes('monthly')
                              ? 'bg-sky-50 border-sky-300 text-sky-900'
                              : 'bg-white border-gray-300 text-gray-700';
                          return (
                        <input
                              className={cn(inputCls, isSalaryProcess && 'font-semibold border', isSalaryProcess && salaryColorCls)}
                          disabled
                              value={raw}
                          readOnly
                        />
                          );
                        })()}
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-center md:justify-end items-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getEmployeePhotoImageUrl(selectedId)}
                      alt=""
                      className="w-[5.25rem] h-[6.25rem] object-cover border border-gray-200 rounded bg-gray-100"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-1 flex flex-wrap gap-0.5 items-end border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white px-0.5 pt-0.5 rounded-t-lg">
                {tabs.map((tab) => {
                  const st = DETAIL_TAB_STYLES[tab.key];
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setDetailTab(tab.key)}
                      className={cn(
                        'px-2.5 py-1.5 text-xs sm:text-sm font-semibold rounded-t-md border-2 border-b-0 transition-all -mb-px',
                        detailTab === tab.key ? st.tabActive : st.tabInactive
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div
                className={cn(
                  // flex-col 자식에서 min-h-0 은 내용 높이보다 줄어들며 체크박스가 잘림 → shrink 방지(높이는 내용에 맞춤)
                  'text-sm rounded-b-md border-2 border-t-0 p-2 mb-1 shrink-0 overflow-visible',
                  DETAIL_TAB_STYLES[detailTab].panel
                )}
              >
                {detailTab === 'basic' && (
                  <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 items-start [align-content:start]">
                    <label>
                      <span className="text-gray-600 text-xs block mb-0.5">{t('attendanceMaster.startingDate')}</span>
                      <input
                        type="date"
                        className={inputCls}
                        disabled
                        value={hrStartDate}
                        readOnly
                      />
                    </label>
                    <label>
                      <span className="text-gray-600 text-xs block mb-0.5">{t('attendanceMaster.probationEnd')}</span>
                      <input
                        type="date"
                        className={inputCls}
                        disabled
                        value={hrProbationEndDate}
                        readOnly
                      />
                    </label>
                    <label>
                      <span className="text-gray-600 text-xs block mb-0.5">{t('attendanceMaster.probationDays')}</span>
                      <input
                        type="number"
                        className={inputCls}
                        disabled
                        value={hrProbationDays}
                        readOnly
                      />
                    </label>
                    {(
                      [
                        ['days_experience_text', t('attendanceMaster.daysExperience'), 'date'],
                        ['annual_holiday_form', t('attendanceMaster.annualHolidayForm'), 'text'],
                        ['master_shiftwork_id', t('attendanceMaster.masterShiftwork'), 'select'],
                      ] as const
                    ).map(([field, label, typ]) => (
                      <label key={field}>
                        <span className="text-gray-600 text-xs block mb-0.5">{label}</span>
                        {typ === 'select' ? (
                          <select
                            className={cn(
                              inputCls,
                              'font-semibold border',
                              String((draft.basic as Record<string, unknown>)?.[field] ?? '').trim()
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                : 'bg-rose-50 border-rose-300 text-rose-900'
                            )}
                            disabled={locked}
                            required
                            value={String((draft.basic as Record<string, unknown>)?.[field] ?? '')}
                            onChange={(e) => setBasic({ [field]: e.target.value === '' ? null : Number(e.target.value) })}
                          >
                            <option value="">-</option>
                            {workCalendarMasters.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.description && m.description.trim() ? `${m.name} (${m.description})` : m.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={typ === 'date' ? 'date' : 'text'}
                            className={inputCls}
                            disabled={locked}
                            value={
                              typ === 'date'
                                ? String((draft.basic as Record<string, unknown>)?.[field] ?? '').slice(0, 10)
                                : String((draft.basic as Record<string, unknown>)?.[field] ?? '')
                            }
                            onChange={(e) =>
                              setBasic({
                                [field]: e.target.value || null,
                              })
                            }
                          />
                        )}
                      </label>
                    ))}
                    <div className="col-span-full flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3 min-w-0 rounded-md border border-sky-200/80 bg-sky-100/40 px-2 py-2 sm:px-2.5 sm:py-2.5">
                      <div className="shrink-0 sm:max-w-[min(100%,14rem)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-gray-600 text-xs shrink-0">
                            {t('attendanceMaster.deductEarly').replace('(바트)', '').trim()}
                          </span>
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 shrink-0">
                            <input
                              type="checkbox"
                              className={chkCls}
                              disabled={locked}
                              checked={(draft.basic as Record<string, unknown>)?.deduct_early_checkout_baht != null}
                              onChange={(e) =>
                                setBasic({
                                  deduct_early_checkout_baht: e.target.checked
                                    ? ((draft.basic as Record<string, unknown>)?.deduct_early_checkout_baht ?? '0')
                                    : null,
                                })
                              }
                            />
                            사용
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            className={cn(inputCls, 'min-w-[6rem] flex-1 sm:flex-initial sm:w-28')}
                            disabled={locked || (draft.basic as Record<string, unknown>)?.deduct_early_checkout_baht == null}
                            value={String((draft.basic as Record<string, unknown>)?.deduct_early_checkout_baht ?? '')}
                            onChange={(e) =>
                              setBasic({ deduct_early_checkout_baht: e.target.value === '' ? null : e.target.value })
                            }
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-gray-600 text-xs shrink-0">
                            {t('attendanceMaster.deductForBahtMinute').replace('(Baht/min)', '').replace('(บาท/นาที)', '').trim()}
                          </span>
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 shrink-0">
                            <input
                              type="checkbox"
                              className={chkCls}
                              disabled={locked}
                              checked={(draft.basic as Record<string, unknown>)?.deduct_baht_per_minute != null}
                              onChange={(e) =>
                                setBasic({
                                  deduct_baht_per_minute: e.target.checked
                                    ? ((draft.basic as Record<string, unknown>)?.deduct_baht_per_minute ?? '0')
                                    : null,
                                })
                              }
                            />
                            사용
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            className={cn(inputCls, 'min-w-[6rem] flex-1 sm:flex-initial sm:w-28')}
                            disabled={locked || (draft.basic as Record<string, unknown>)?.deduct_baht_per_minute == null}
                            value={String((draft.basic as Record<string, unknown>)?.deduct_baht_per_minute ?? '')}
                            onChange={(e) => setBasic({ deduct_baht_per_minute: e.target.value === '' ? null : e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 border-t border-sky-200/60 pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3">
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-2 gap-y-2 auto-rows-auto">
                          {(
                            [
                              ['not_rounding_early', t('attendanceMaster.chk.notRoundEarly')],
                              ['received_shift_payment', t('attendanceMaster.chk.shiftPay')],
                              ['not_charge_lateness', t('attendanceMaster.chk.notChargeLate')],
                              ['not_rounding_lateness', t('attendanceMaster.chk.notRoundLate')],
                              ['received_food_allow', t('attendanceMaster.chk.foodAllow')],
                              ['not_charge_early', t('attendanceMaster.chk.notChargeEarly')],
                            ] as const
                          ).map(([k, lab]) => (
                            <label key={k} className="flex items-start gap-2 text-xs cursor-pointer min-h-0 min-w-0">
                              <input
                                type="checkbox"
                                className={cn(chkCls, 'mt-0.5 shrink-0')}
                                disabled={locked}
                                checked={Boolean((draft.basic as Record<string, unknown>)?.[k])}
                                onChange={(e) => setBasic({ [k]: e.target.checked })}
                              />
                              <span className="min-w-0 leading-snug break-words">{lab}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border border-sky-200/80 bg-sky-100/40 px-2 py-2 sm:px-2.5 sm:py-2.5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-2.5 auto-rows-auto">
                      {(
                        [
                          ['check_in_zip_card', t('attendanceMaster.chk.checkInZip')],
                          ['check_out_zip_card', t('attendanceMaster.chk.checkOutZip')],
                          ['day_and_ot_zero', t('attendanceMaster.chk.dayOtZero')],
                        ] as const
                      ).map(([k, lab]) => (
                        <label key={k} className="flex items-start gap-2 text-xs cursor-pointer min-h-0 min-w-0">
                          <input
                            type="checkbox"
                            className={cn(chkCls, 'mt-0.5 shrink-0')}
                            disabled={locked}
                            checked={Boolean((draft.basic as Record<string, unknown>)?.[k])}
                            onChange={(e) => setBasic({ [k]: e.target.checked })}
                          />
                          <span className="min-w-0 leading-snug break-words">{lab}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  </div>
                )}

                {detailTab === 'ot' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="border border-gray-200 rounded-md bg-white p-2.5 space-y-2">
                        {(
                          [
                            ['not_cut_ot', t('attendanceMaster.ot.notCut')],
                            ['ot_pay_each_hour_ot6', t('attendanceMaster.ot.payEachHour')],
                            ['auto_ot_on_holiday', t('attendanceMaster.ot.autoHoliday')],
                            ['auto_ot_exclude_holidays', t('attendanceMaster.ot.excludeHoliday')],
                          ] as const
                        ).map(([k, lab]) => (
                          <label key={k} className="flex items-center gap-2 text-xs sm:text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              className={chkCls}
                              disabled={locked}
                              checked={Boolean((draft.ot as Record<string, unknown>)?.[k])}
                              onChange={(e) => setOt({ [k]: e.target.checked })}
                            />
                            <span className="text-gray-800">{lab}</span>
                          </label>
                        ))}
                      </div>
                      <div className="border border-gray-200 rounded-md bg-white p-2.5 space-y-2">
                        {(
                          [
                            ['not_charge_ot_send_payroll', t('attendanceMaster.ot.notChargeSend')],
                            ['chang_all_ot6', t('attendanceMaster.ot.changAll')],
                          ] as const
                        ).map(([k, lab]) => (
                          <label key={k} className="flex items-center gap-2 text-xs sm:text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              className={chkCls}
                              disabled={locked}
                              checked={Boolean((draft.ot as Record<string, unknown>)?.[k])}
                              onChange={(e) => setOt({ [k]: e.target.checked })}
                            />
                            <span className="text-gray-800">{lab}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <label className="border border-gray-200 rounded-md bg-white p-2.5">
                        <span className="text-gray-600 text-xs block mb-1">{t('attendanceMaster.ot.ot6Baht')}</span>
                        <input
                          type="number"
                          step="0.0001"
                          className={inputCls}
                          disabled={locked}
                          value={String((draft.ot as Record<string, unknown>)?.ot6_hourly_baht ?? '')}
                          onChange={(e) => setOt({ ot6_hourly_baht: e.target.value === '' ? null : e.target.value })}
                        />
                      </label>
                      <label className="border border-gray-200 rounded-md bg-white p-2.5">
                        <span className="text-gray-600 text-xs block mb-1">{t('attendanceMaster.ot.lunchBaht')}</span>
                        <input
                          type="number"
                          step="0.0001"
                          className={inputCls}
                          disabled={locked}
                          value={String((draft.ot as Record<string, unknown>)?.ui_lunchtime_by_emp_baht ?? '')}
                          onChange={(e) => setOt({ ui_lunchtime_by_emp_baht: e.target.value === '' ? null : e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {detailTab === 'special' && (
                  <div className="space-y-2 pb-2">
                    <div className="grid grid-cols-12 gap-2 px-1 text-[11px] font-semibold text-gray-500">
                      <span className="col-span-1">{t('employees.list.field.no')}</span>
                      <span className="col-span-6">항목명</span>
                      <span className="col-span-5 text-right pr-2">금액</span>
                    </div>
                    {FIXED_SPECIAL_CHARGE_LABELS.map((fixedLabel, idx) => {
                      const slot = idx + 1;
                      const row =
                        (((draft.special_charges as { slot_index: number; label: string; amount_baht: number }[]) || []).find(
                          (x) => x.slot_index === slot
                        ) as { slot_index: number; label: string; amount_baht: number } | undefined) ??
                        { slot_index: slot, label: fixedLabel, amount_baht: 0 };
                      return (
                      <div
                        key={`${slot}-${fixedLabel}`}
                        className="grid grid-cols-12 gap-2 items-center border border-gray-200 bg-white rounded-md px-2 py-1.5"
                      >
                        <span className="col-span-1 text-xs text-gray-500">{slot}</span>
                        <div className="col-span-6 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs sm:text-sm bg-gray-100 text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis">
                            {fixedLabel}
                          </div>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="col-span-5 w-full border border-gray-300 rounded px-2 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100 disabled:text-gray-600 text-right"
                            disabled={locked}
                            value={formatThousands(Number(row.amount_baht ?? 0))}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              const parsed = raw === '' ? 0 : Number(raw);
                              const list = [...((draft.special_charges as typeof row[]) || [])];
                              const i = list.findIndex((x) => x.slot_index === row.slot_index);
                              if (i >= 0)
                                list[i] = {
                                  ...list[i],
                                  amount_baht: Number.isFinite(parsed) ? parsed : 0,
                                };
                              setDraft((d) => (d ? { ...d, special_charges: list } : d));
                            }}
                          />
                      </div>
                      );
                    })}
                  </div>
                )}

                {detailTab === 'shift' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-3 items-center">
                      <span className="text-xs font-medium text-gray-700">{t('attendanceMaster.scheduleMode')}</span>
                      <span className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                        {t('attendanceMaster.modeWeek')}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {shiftDays.map((day) => (
                        <div key={day.key} className="flex items-center gap-2 border border-emerald-200/60 bg-white/80 rounded p-1">
                          <input
                            type="checkbox"
                            className={chkCls}
                            disabled={locked}
                            checked={day.enabled}
                            onChange={(e) => updateShiftDay(day.key, { enabled: e.target.checked })}
                          />
                          <span className="text-xs w-8 uppercase font-medium">{day.key}</span>
                          <select
                            className={inputCls + ' flex-1'}
                            disabled={locked}
                            value={
                              day.shift_id != null
                                ? String(day.shift_id)
                                : (() => {
                                    const legacy = attendanceShifts.find((s) => s.shift_code === day.shift_value);
                                    return legacy ? String(legacy.id) : '';
                                  })()
                            }
                            onChange={(e) =>
                              updateShiftDay(day.key, {
                                shift_id: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                          >
                            <option value="">{t('attendanceMaster.shiftCodeOrTime')}</option>
                            {attendanceShifts.map((s) => (
                              <option key={s.id} value={String(s.id)}>
                                {`${s.shift_code}${s.title && s.title.trim() ? ` / ${s.title}` : ''} (ID: ${s.id})`}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-blue-400 rounded-md p-2 bg-gray-50">
                <p className="text-xs font-semibold text-gray-700 mb-2">{t('attendanceMaster.leaveSection')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-2">
                  <label className="col-span-2 sm:col-span-1">
                    <span className="text-gray-600 text-xs">{t('attendanceMaster.leaveYear')}</span>
                    <input
                      type="number"
                      className={inputCls}
                      disabled={locked}
                      value={String((draft.leave as Record<string, unknown>)?.leave_year ?? '')}
                      onChange={(e) => setLeave({ leave_year: parseInt(e.target.value, 10) || new Date().getFullYear() })}
                    />
                  </label>
                  <label className="col-span-2 sm:col-span-1">
                    <span className="text-gray-600 text-xs">{t('attendanceMaster.levelOfLeave')}</span>
                    <select
                      className={inputCls}
                      disabled={locked}
                      value={String((draft.leave as Record<string, unknown>)?.level_of_leave ?? '')}
                      onChange={(e) => setLeave({ level_of_leave: e.target.value || null })}
                    >
                      <option value="">-</option>
                      {attendanceLeaveLevels
                        .map((x) => Number(x.level_number))
                        .filter((x) => Number.isFinite(x) && x > 0)
                        .sort((a, b) => a - b)
                        .map((lv) => (
                          <option key={lv} value={String(lv)}>
                            {t('attendanceStandard.leaveLevel').replace('{n}', String(lv))}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="col-span-2 sm:col-span-1">
                    <span className="text-gray-600 text-xs">{t('attendanceMaster.compensateAccum')}</span>
                    <input
                      className={inputCls}
                      placeholder="hh:mm"
                      disabled={locked}
                      value={String((draft.leave as Record<string, unknown>)?.compensate_accumulated ?? '')}
                      onChange={(e) => setLeave({ compensate_accumulated: e.target.value || null })}
                    />
                  </label>
                  <div className="col-span-2 flex items-end">
                    <button
                      type="button"
                      className="text-xs px-2 py-1 border rounded bg-white text-gray-700 hover:bg-gray-50"
                      onClick={() => setLeaveHistoryOpen(true)}
                      title={t('attendanceMaster.leaveRecord')}
                    >
                      {t('attendanceMaster.leaveRecord')}
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-200/80">
                        <th className="p-1 text-left border border-gray-300">{t('attendanceMaster.leaveRow')}</th>
                        <th className="p-1 border border-gray-300">{t('attendanceStandard.days')}</th>
                        <th className="p-1 border border-gray-300">{t('attendanceStandard.hours')}</th>
                        <th className="p-1 border border-gray-300">{t('attendanceStandard.minutes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          { prefix: 'year', label: t('attendanceMaster.leaveYearBal'), computed: false },
                          {
                            prefix: 'year_used',
                            label: t('attendanceMaster.leaveYearUsed'),
                            computed: true,
                            values: { days: currentYearLeaveUsage, hours: 0, minutes: 0 },
                          },
                          {
                            prefix: 'year_remain',
                            label: t('attendanceMaster.leaveYearRemain'),
                            computed: true,
                            values: { days: currentYearRemainDays, hours: 0, minutes: 0 },
                          },
                          { prefix: 'prev', label: t('attendanceMaster.leavePrev'), computed: false },
                          { prefix: 'used', label: t('attendanceMaster.leaveUsed'), computed: false },
                          { prefix: 'transferred', label: t('attendanceMaster.leaveTransferred'), computed: false },
                        ] as const
                      ).map((row) => (
                        <tr key={row.prefix}>
                          <td className={cn('p-1 border border-gray-300 font-medium', row.computed && 'bg-blue-50')}>{row.label}</td>
                          {(['days', 'hours', 'minutes'] as const).map((suf) => {
                            const key = `${row.prefix}_${suf}` as const;
                            if (row.computed) {
                              return (
                                <td key={suf} className="p-1 border border-gray-300 text-right bg-blue-50 font-semibold">
                                  {String(row.values[suf])}
                                </td>
                              );
                            }
                            return (
                              <td key={suf} className="p-0.5 border border-gray-300">
                                <input
                                  type="number"
                                  className={inputCls + ' border-0'}
                                  disabled={locked}
                                  value={String((draft.leave as Record<string, unknown>)?.[key] ?? '')}
                                  onChange={(e) =>
                                    setLeave({
                                      [key]: e.target.value === '' ? null : parseInt(e.target.value, 10),
                                    })
                                  }
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {leaveHistoryOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3" onClick={() => setLeaveHistoryOpen(false)}>
                  <div
                    className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-lg border border-sky-300 bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between border-b border-sky-200 bg-sky-50 px-3 py-2">
                      <h3 className="text-sm font-semibold text-sky-900">{t('attendanceMaster.leaveHistoryModalTitle')}</h3>
                      <button
                        type="button"
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        onClick={() => setLeaveHistoryOpen(false)}
                      >
                        {t('common.close')}
                      </button>
                    </div>
                    <div className="max-h-[calc(85vh-3rem)] overflow-auto p-2">
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
                          {leaveHistorySummaryRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-4 border border-gray-200 text-center text-gray-500">
                                {t('attendanceMaster.leaveHistory.empty')}
                              </td>
                            </tr>
                          ) : (
                            leaveHistorySummaryRows.map((row) => {
                              const usedDays = row.usedWithPayDays + row.usedWithoutPayDays;
                              const remainDays = Math.max(0, row.statutoryDays - usedDays);
                              return (
                                <tr key={row.leaveType} className="odd:bg-white even:bg-gray-50/60">
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
            </>
          )}
        </section>
      </div>
    </div>
  );
}
