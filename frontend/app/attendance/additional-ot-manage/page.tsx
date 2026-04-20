'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, User } from 'lucide-react';
import { apiClient, getEmployeePhotoThumbnailUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';
import AdditionalOtDataTable from '@/components/attendance/AdditionalOtDataTable';
import SpecialOtDataTable from '@/components/attendance/SpecialOtDataTable';
import {
  apiItemToRow,
  cloneRows,
  newRowTemplate,
  normalizeTimeInput,
  rowsEqual,
  type OtBufferRow,
} from '@/lib/additionalOtModel';
import {
  apiItemToSpecialOtRow,
  newSpecialOtRowTemplate,
  normalizeOtCell,
  type SpecialOtBufferRow,
} from '@/lib/specialOtModel';

const NAV_FOCUS_KEY = 'hrai_additional_ot_nav';

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
type ManageTab = 'additional' | 'special';

export default function AttendanceAdditionalOtManagePage() {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-additional-ot-manage', 'can_read');
  const allowSave = can('attendance-additional-ot-manage', 'can_update');
  const allowDelete = can('attendance-additional-ot-manage', 'can_delete');
  const allowCreate = can('attendance-additional-ot-manage', 'can_create');

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
  const [departmentPositionRefByCompany, setDepartmentPositionRefByCompany] =
    useState<DepartmentPositionRefByCompany>({});
  const [refsByCompany, setRefsByCompany] = useState<RefByCompany>({});
  const deptPosRef = useRef<DepartmentPositionRefByCompany>({});
  deptPosRef.current = departmentPositionRefByCompany;

  const today = new Date();
  const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [manageTab, setManageTab] = useState<ManageTab>('additional');

  const [serverRows, setServerRows] = useState<OtBufferRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1);
  const [mode, setMode] = useState<MasterUiMode>('browse');
  const [editBuffer, setEditBuffer] = useState<OtBufferRow[] | null>(null);
  const initialEditRef = useRef<OtBufferRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [masterBundle, setMasterBundle] = useState<Record<string, unknown> | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);

  const [specialRows, setSpecialRows] = useState<SpecialOtBufferRow[]>([]);
  const [specialRowsLoading, setSpecialRowsLoading] = useState(false);
  const [specialSelectedRowIndex, setSpecialSelectedRowIndex] = useState(-1);
  const [specialMode, setSpecialMode] = useState<MasterUiMode>('browse');
  const [specialFormRow, setSpecialFormRow] = useState<SpecialOtBufferRow | null>(null);
  const [specialSaving, setSpecialSaving] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem(NAV_FOCUS_KEY);
    if (!raw) return;
    sessionStorage.removeItem(NAV_FOCUS_KEY);
    try {
      const parsed = JSON.parse(raw) as { employeeId?: number; workDay?: string };
      if (typeof parsed.employeeId === 'number' && parsed.employeeId > 0) {
        setSelectedId(parsed.employeeId);
      }
      const wd = (parsed.workDay || '').trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(wd)) {
        setDateFrom(wd);
        setDateTo(wd);
      }
    } catch {
      /* noop */
    }
  }, []);

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
    () => [...baseFilteredEmployees].sort((a, b) => a.employee_number.localeCompare(b.employee_number)),
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

  const selectedEmp = useMemo(
    () => (selectedId != null ? employees.find((e) => e.id === selectedId) : null),
    [employees, selectedId]
  );

  const invalidRange = (dateFrom || '').slice(0, 10) > (dateTo || '').slice(0, 10);

  const defaultWorkDateForNew = useMemo(() => {
    const a = (dateFrom || '').slice(0, 10);
    const b = (dateTo || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) && a <= b) return b;
    if (/^\d{4}-\d{2}-\d{2}$/.test(b)) return b;
    return a;
  }, [dateFrom, dateTo]);

  const loadRows = useCallback(async () => {
    setEditBuffer(null);
    initialEditRef.current = null;
    setMode('browse');
    if (selectedId == null) {
      setServerRows([]);
      setSelectedRowIndex(-1);
      return;
    }
    setRowsLoading(true);
    try {
      const { data } = await apiClient.getAttendanceAdditionalOt({
        employee_id: selectedId,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      const items = ((data as { items?: Record<string, unknown>[] })?.items || []) as Record<string, unknown>[];
      const rows = items.map(apiItemToRow);
      setServerRows(rows);
      setSelectedRowIndex(rows.length ? 0 : -1);
    } catch {
      setServerRows([]);
      setSelectedRowIndex(-1);
    } finally {
      setRowsLoading(false);
    }
  }, [selectedId, dateFrom, dateTo]);

  const loadSpecialRows = useCallback(async () => {
    setSpecialFormRow(null);
    setSpecialMode('browse');
    if (selectedId == null) {
      setSpecialRows([]);
      setSpecialSelectedRowIndex(-1);
      return;
    }
    setSpecialRowsLoading(true);
    try {
      const { data } = await apiClient.getAttendanceSpecialOt({
        employee_id: selectedId,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      const items = ((data as { items?: Record<string, unknown>[] })?.items || []) as Record<string, unknown>[];
      const rows = items.map((it) => apiItemToSpecialOtRow(it, selectedEmp?.employee_number || ''));
      setSpecialRows(rows);
      setSpecialSelectedRowIndex(rows.length ? 0 : -1);
    } catch {
      setSpecialRows([]);
      setSpecialSelectedRowIndex(-1);
    } finally {
      setSpecialRowsLoading(false);
    }
  }, [selectedId, dateFrom, dateTo, selectedEmp?.employee_number]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void loadSpecialRows();
  }, [loadSpecialRows]);

  useEffect(() => {
    setEditBuffer(null);
    initialEditRef.current = null;
    setMode('browse');
    setSpecialRows([]);
    setSpecialSelectedRowIndex(-1);
    setSpecialFormRow(null);
    setSpecialMode('browse');
  }, [selectedId]);

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
  const headerWorkCalendar = selectedEmp ? String(headerBasic?.master_shiftwork ?? '').trim() || '—' : '—';

  const displayRows = editBuffer ?? serverRows;
  const editing = mode === 'edit';
  const specialEditing = specialMode === 'edit';
  const activeRowsCount = manageTab === 'special' ? specialRows.length : displayRows.length;
  const activeSelectedIndex = manageTab === 'special' ? specialSelectedRowIndex : selectedRowIndex;
  const activeSaving = manageTab === 'special' ? specialSaving : saving;
  const activeRowsLoading = manageTab === 'special' ? specialRowsLoading : rowsLoading;

  useEffect(() => {
    const len = displayRows.length;
    if (len === 0) {
      setSelectedRowIndex(-1);
      return;
    }
    setSelectedRowIndex((idx) => {
      if (idx >= 0 && idx < len) return idx;
      return 0;
    });
  }, [displayRows.length, selectedId, editing]);

  useEffect(() => {
    const len = specialRows.length;
    if (len === 0) {
      setSpecialSelectedRowIndex(-1);
      return;
    }
    setSpecialSelectedRowIndex((idx) => {
      if (idx >= 0 && idx < len) return idx;
      return 0;
    });
  }, [specialRows.length, selectedId]);

  useEffect(() => {
    if (specialMode === 'edit') return;
    if (specialSelectedRowIndex < 0 || specialSelectedRowIndex >= specialRows.length) {
      setSpecialFormRow(null);
      return;
    }
    setSpecialFormRow({ ...specialRows[specialSelectedRowIndex] });
  }, [specialSelectedRowIndex, specialRows, specialMode]);

  const beginEdit = useCallback(() => {
    initialEditRef.current = cloneRows(serverRows);
    setEditBuffer(cloneRows(serverRows));
    setMode('edit');
  }, [serverRows]);

  const onAdd = () => {
    if (manageTab === 'special') {
      if (selectedId == null || invalidRange) return;
      const a = (dateFrom || '').slice(0, 10);
      const b = (dateTo || '').slice(0, 10);
      const df = /^\d{4}-\d{2}-\d{2}$/.test(a) ? a : defaultWorkDateForNew;
      const dt = /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : df;
      setSpecialFormRow(newSpecialOtRowTemplate(df, dt));
      setSpecialMode('edit');
      return;
    }
    if (selectedId == null || invalidRange) return;
    const nextBuf = cloneRows(editBuffer ?? serverRows);
    nextBuf.unshift(newRowTemplate(defaultWorkDateForNew));
    initialEditRef.current = cloneRows(serverRows);
    setEditBuffer(nextBuf);
    setMode('edit');
    setSelectedRowIndex(0);
  };

  const onEdit = () => {
    if (manageTab === 'special') {
      if (specialRows.length === 0 || specialSelectedRowIndex < 0 || specialSelectedRowIndex >= specialRows.length) return;
      setSpecialFormRow({ ...specialRows[specialSelectedRowIndex] });
      setSpecialMode('edit');
      return;
    }
    if (serverRows.length === 0) return;
    beginEdit();
  };

  const onCancel = () => {
    if (manageTab === 'special') {
      setSpecialFormRow(null);
      setSpecialMode('browse');
      return;
    }
    setEditBuffer(null);
    initialEditRef.current = null;
    setMode('browse');
  };

  const updateRow = (idx: number, patch: Partial<OtBufferRow>) => {
    setEditBuffer((prev) => {
      if (!prev || !prev[idx]) return prev;
      const next = cloneRows(prev);
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const patchSpecialForm = (patch: Partial<SpecialOtBufferRow>) => {
    setSpecialFormRow((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const onSave = async () => {
    if (manageTab === 'special') {
      if (!specialFormRow || selectedId == null) return;
      const r = specialFormRow;
      const df = (r.date_from || '').trim().slice(0, 10);
      const dt = (r.date_to || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(df) || !/^\d{4}-\d{2}-\d{2}$/.test(dt) || df > dt) {
        alert(t('specialOt.invalidDateRange'));
        return;
      }
      setSpecialSaving(true);
      try {
        const body = {
          date_from: df,
          date_to: dt,
          ot_1: normalizeOtCell(r.ot_1) || '',
          ot_1_5: normalizeOtCell(r.ot_1_5) || '',
          ot_2: normalizeOtCell(r.ot_2) || '',
          ot_2_5: normalizeOtCell(r.ot_2_5) || '',
          ot_3: normalizeOtCell(r.ot_3) || '',
          ot_6: normalizeOtCell(r.ot_6) || '',
          shift_slot: r.shift_slot,
          shift_text: r.shift_text,
          food: r.food,
          special: r.special,
          note: r.note || null,
          status: r.status,
        };
        if (!r.id) await apiClient.createAttendanceSpecialOt(selectedId, body);
        else await apiClient.updateAttendanceSpecialOt(r.id, body);
        await loadSpecialRows();
        alert(t('attendanceInquiry.saved'));
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        alert(typeof msg === 'string' ? msg : t('attendanceInquiry.saveError'));
      } finally {
        setSpecialSaving(false);
      }
      return;
    }
    if (!editBuffer || selectedId == null) return;
    const initial = initialEditRef.current;
    if (!initial) return;

    for (const r of editBuffer) {
      const wd = (r.work_date || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(wd)) {
        alert(t('additionalOt.invalidWorkDate'));
        return;
      }
      const os = normalizeTimeInput(r.ot_start);
      const oe = normalizeTimeInput(r.ot_end);
      if (!/^\d{2}:\d{2}$/.test(os) || !/^\d{2}:\d{2}$/.test(oe)) {
        alert(t('additionalOt.invalidTime'));
        return;
      }
    }

    setSaving(true);
    try {
      const bufById = new Map<number, OtBufferRow>();
      for (const r of editBuffer) {
        if (r.id) bufById.set(r.id, r);
      }
      for (const r of initial) {
        if (r.id && !bufById.has(r.id)) {
          await apiClient.deleteAttendanceAdditionalOt(r.id);
        }
      }
      for (const r of editBuffer) {
        const body = {
          work_date: r.work_date,
          ot_type: r.ot_type,
          ot_start: normalizeTimeInput(r.ot_start),
          ot_end: normalizeTimeInput(r.ot_end),
          type_ot: r.type_ot,
          job_title_code: r.job_title_code,
          ot_breaktime_type: r.ot_breaktime_type,
          block_payment: r.block_payment,
          approve_status: r.approve_status,
          note: r.note || null,
        };
        if (!r.id) {
          await apiClient.createAttendanceAdditionalOt(selectedId, body);
        } else {
          const o = initial.find((x) => x.id === r.id);
          if (!o || !rowsEqual(o, r)) {
            await apiClient.updateAttendanceAdditionalOt(r.id, body);
          }
        }
      }

      await loadRows();
      alert(t('attendanceInquiry.saved'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof msg === 'string' ? msg : t('attendanceInquiry.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (manageTab === 'special') {
      if (specialSelectedRowIndex < 0 || specialRows.length === 0) return;
      const row = specialRows[specialSelectedRowIndex];
      if (!row?.id) return;
      if (!confirm(t('additionalOt.confirmDelete'))) return;
      setSpecialSaving(true);
      try {
        await apiClient.deleteAttendanceSpecialOt(row.id);
        await loadSpecialRows();
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        alert(typeof msg === 'string' ? msg : t('attendanceInquiry.deleteError'));
      } finally {
        setSpecialSaving(false);
      }
      return;
    }
    if (selectedRowIndex < 0 || displayRows.length === 0) return;
    const row = displayRows[selectedRowIndex];
    if (!row?.id) {
      if (editing && editBuffer) {
        const next = editBuffer.filter((_, i) => i !== selectedRowIndex);
        setEditBuffer(next);
        setSelectedRowIndex(Math.min(selectedRowIndex, Math.max(0, next.length - 1)));
      }
      return;
    }
    if (!confirm(t('additionalOt.confirmDelete'))) return;
    setSaving(true);
    try {
      if (editing && editBuffer) {
        const next = editBuffer.filter((_, i) => i !== selectedRowIndex);
        setEditBuffer(next);
        setSelectedRowIndex(Math.min(selectedRowIndex, Math.max(0, next.length - 1)));
      } else {
        await apiClient.deleteAttendanceAdditionalOt(row.id);
        await loadRows();
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof msg === 'string' ? msg : t('attendanceInquiry.deleteError'));
    } finally {
      setSaving(false);
    }
  };

  const goFirstRecord = () => {
    if (manageTab === 'special') {
      if (specialRows.length === 0) return;
      setSpecialSelectedRowIndex(0);
      return;
    }
    if (displayRows.length === 0) return;
    setSelectedRowIndex(0);
  };
  const goPrevRecord = () => {
    if (manageTab === 'special') {
      if (specialSelectedRowIndex <= 0) return;
      setSpecialSelectedRowIndex(specialSelectedRowIndex - 1);
      return;
    }
    if (selectedRowIndex <= 0) return;
    setSelectedRowIndex(selectedRowIndex - 1);
  };
  const goNextRecord = () => {
    if (manageTab === 'special') {
      if (specialSelectedRowIndex < 0 || specialSelectedRowIndex >= specialRows.length - 1) return;
      setSpecialSelectedRowIndex(specialSelectedRowIndex + 1);
      return;
    }
    if (selectedRowIndex < 0 || selectedRowIndex >= displayRows.length - 1) return;
    setSelectedRowIndex(selectedRowIndex + 1);
  };
  const goLastRecord = () => {
    if (manageTab === 'special') {
      if (specialRows.length === 0) return;
      setSpecialSelectedRowIndex(specialRows.length - 1);
      return;
    }
    if (displayRows.length === 0) return;
    setSelectedRowIndex(displayRows.length - 1);
  };

  const inputCls =
    'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100 disabled:text-gray-600';

  if (!allowRead) {
    return (
      <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">{t('permission.noAccess')}</div>
    );
  }

  const listBlockingOverlay = listLoading || employmentStatusFilter !== deferredEmploymentStatus;
  const dateInputsLocked = activeRowsLoading || editing || specialEditing;

  return (
    <div className="p-1.5 sm:p-3 h-[calc(100vh-5.5rem)] overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3 items-stretch h-full min-h-0">
        <aside
          className={cn(
            'lg:col-span-4 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden',
            (editing || specialEditing) && 'opacity-60 pointer-events-none'
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
            <div className="flex flex-wrap items-center justify-start gap-2">
              <h2 className="text-sm sm:text-base font-bold text-sky-950">{t('additionalOt.title')}</h2>
            </div>

            <div className="flex items-end border-b border-gray-200 bg-gray-50 rounded-t-md px-1 pt-1">
              <button
                type="button"
                onClick={() => setManageTab('additional')}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold border border-b-0 rounded-t-md -mb-px',
                  manageTab === 'additional' ? 'bg-white border-blue-400 text-blue-700' : 'bg-gray-100 border-gray-300 text-gray-600'
                )}
              >
                {t('additionalOt.title')}
              </button>
              <button
                type="button"
                onClick={() => setManageTab('special')}
                className={cn(
                  'ml-1 px-3 py-1.5 text-xs font-semibold border border-b-0 rounded-t-md -mb-px',
                  manageTab === 'special' ? 'bg-white border-blue-400 text-blue-700' : 'bg-gray-100 border-gray-300 text-gray-600'
                )}
              >
                {t('specialOt.manageTab')}
              </button>
            </div>

            <HrMasterToolbar
              mode={manageTab === 'special' ? specialMode : mode}
              listLength={activeRowsCount}
              selectedIndex={activeSelectedIndex}
              saving={activeSaving}
              allowAdd={allowCreate}
              allowEdit={allowSave}
              allowDelete={allowDelete}
              allowSave={allowSave || allowCreate}
              editExtraDisabled={
                manageTab === 'special' ? specialRows.length === 0 && !specialEditing : serverRows.length === 0 && !editing
              }
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
            {activeSaving && (
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
                disabled={selectedId == null || activeRowsLoading || editing || specialEditing}
                onClick={() => {
                  if (manageTab === 'special') void loadSpecialRows();
                  else void loadRows();
                }}
              >
                {t('attendanceInquiry.reload')}
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs border border-dashed rounded-md px-3 py-2 bg-gray-50">
              <div>
                <span className="text-gray-500">{t('attendanceMaster.division')}</span>
                <div className="font-medium">{masterLoading ? '…' : headerDivision}</div>
              </div>
              <div>
                <span className="text-gray-500">{t('attendanceMaster.department')}</span>
                <div className="font-medium">{masterLoading ? '…' : headerDept}</div>
              </div>
              <div>
                <span className="text-gray-500">{t('attendanceMaster.level')}</span>
                <div className="font-medium">{masterLoading ? '…' : headerLevel}</div>
              </div>
              <div>
                <span className="text-gray-500">{t('attendanceMaster.workPlace')}</span>
                <div className="font-medium">{masterLoading ? '…' : headerWork}</div>
              </div>
              <div>
                <span className="text-gray-500">{t('attendanceMaster.hireDate')}</span>
                <div className="font-medium">{masterLoading ? '…' : headerHireDate}</div>
              </div>
              <div>
                <span className="text-gray-500">{t('attendanceMaster.employmentType')}</span>
                <div className="font-medium">{masterLoading ? '…' : headerEmploymentType}</div>
              </div>
              <div>
                <span className="text-gray-500">{t('attendanceMaster.salaryProcessType')}</span>
                <div className="font-medium">{masterLoading ? '…' : headerSalaryType}</div>
              </div>
              <div>
                <span className="text-gray-500">{t('attendanceMaster.masterShiftwork')}</span>
                <div className="font-medium">{masterLoading ? '…' : headerWorkCalendar}</div>
              </div>
            </div>

            <p className="text-[11px] text-gray-600 px-0.5">
              {manageTab === 'special' ? t('specialOt.historyHint') : t('additionalOt.gridHint')}
            </p>

            {selectedId == null ? (
              <p className="text-sm text-gray-500 py-8 text-center">{t('attendanceMaster.pickEmployee')}</p>
            ) : invalidRange ? (
              <p className="text-sm text-amber-800 py-8 text-center border border-amber-200 rounded-md bg-amber-50">
                {t('attendanceInquiry.invalidRange')}
              </p>
            ) : manageTab === 'special' ? (
              <div className="flex flex-col gap-2 min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs border border-gray-200 rounded-md bg-white p-2">
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.dateFrom')}</span>
                    <input
                      type="date"
                      className={inputCls}
                      value={specialFormRow?.date_from || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ date_from: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.dateTo')}</span>
                    <input
                      type="date"
                      className={inputCls}
                      value={specialFormRow?.date_to || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ date_to: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.ot1')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.ot_1 || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ ot_1: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.ot15')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.ot_1_5 || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ ot_1_5: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.ot2')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.ot_2 || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ ot_2: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.ot25')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.ot_2_5 || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ ot_2_5: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.ot3')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.ot_3 || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ ot_3: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.ot6')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.ot_6 || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ ot_6: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.shiftRadio')}</span>
                    <select
                      className={inputCls}
                      value={specialFormRow?.shift_slot ?? 1}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ shift_slot: Number(e.target.value) === 2 ? 2 : 1 })}
                    >
                      <option value={1}>{t('specialOt.shift1')}</option>
                      <option value={2}>{t('specialOt.shift2')}</option>
                    </select>
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.shiftText')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.shift_text || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ shift_text: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.food')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.food || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ food: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.special')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.special || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ special: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600 lg:col-span-2">
                    <span className="block mb-0.5">{t('specialOt.col.note')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.note || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ note: e.target.value })}
                    />
                  </label>
                  <label className="text-gray-600">
                    <span className="block mb-0.5">{t('specialOt.col.status')}</span>
                    <input
                      type="text"
                      className={inputCls}
                      value={specialFormRow?.status || ''}
                      disabled={!specialEditing}
                      onChange={(e) => patchSpecialForm({ status: e.target.value })}
                    />
                  </label>
                </div>
                <SpecialOtDataTable
                  t={t}
                  empCode={selectedEmp?.employee_number || ''}
                  displayRows={specialRows}
                  selectedRowIndex={specialSelectedRowIndex}
                  setSelectedRowIndex={(idx) => {
                    setSpecialSelectedRowIndex(idx);
                    if (specialMode !== 'edit' && specialRows[idx]) setSpecialFormRow({ ...specialRows[idx] });
                  }}
                  rowsLoading={specialRowsLoading}
                />
              </div>
            ) : (
              <AdditionalOtDataTable
                t={t}
                displayRows={displayRows}
                selectedRowIndex={selectedRowIndex}
                setSelectedRowIndex={setSelectedRowIndex}
                editing={editing}
                updateRow={updateRow}
                rowsLoading={rowsLoading}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
