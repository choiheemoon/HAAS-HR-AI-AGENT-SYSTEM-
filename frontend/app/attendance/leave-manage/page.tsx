'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, User } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import AttendanceLeaveEmployeeWorkarea, {
  type LeavePanelEmployee,
} from '@/components/attendance/AttendanceLeaveEmployeeWorkarea';

type EmpRow = LeavePanelEmployee;

type RefItem = {
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};
type DepartmentRefByCompany = Record<number, RefItem[]>;

export default function AttendanceLeaveManagePage() {
  const { t } = useI18n();
  const { can } = useMenuPermissions();

  const allowRead = can('attendance-leave-manage', 'can_read');
  const allowCreate = can('attendance-leave-manage', 'can_create');
  const allowSave = can('attendance-leave-manage', 'can_update');
  const allowDelete = can('attendance-leave-manage', 'can_delete');

  const [companies, setCompanies] = useState<
    Array<{ id: number; company_code: string; name_kor?: string | null; name_thai?: string | null; name_eng?: string | null }>
  >([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<'active' | 'terminated' | 'all'>('active');
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedDept, setExpandedDept] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [flatIds, setFlatIds] = useState<number[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [departmentRefByCompany, setDepartmentRefByCompany] = useState<DepartmentRefByCompany>({});
  const [leaveSidebarLock, setLeaveSidebarLock] = useState(false);
  const deptRef = useRef<DepartmentRefByCompany>({});
  deptRef.current = departmentRefByCompany;

  const deferredEmploymentStatus = useDeferredValue(employmentStatusFilter);

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

  const loadEmployees = useCallback(async () => {
    setListLoading(true);
    try {
      const cid = companyFilter ? parseInt(companyFilter, 10) : undefined;
      const { data } = await apiClient.getEmployees(cid && Number.isFinite(cid) ? { company_id: cid } : undefined);
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

  const pickRefLabel = useCallback((it: RefItem) => it.name_kor || it.name_eng || it.name_thai || it.code, []);

  const ensureDepartmentRefs = useCallback(async (companyId: number) => {
    if (deptRef.current[companyId]) return;
    try {
      const { data } = await apiClient.getEmployeeReferenceItems('department', companyId);
      const rows = Array.isArray(data) ? (data as RefItem[]) : [];
      setDepartmentRefByCompany((prev) => (prev[companyId] ? prev : { ...prev, [companyId]: rows }));
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
    Array.from(ids).forEach((cid) => void ensureDepartmentRefs(cid));
  }, [employees, ensureDepartmentRefs]);

  const getDepartmentText = useCallback(
    (emp: EmpRow) => {
      const raw = (emp.department || '').trim();
      if (!raw) return t('attendanceMaster.deptUnassigned');
      const cid = emp.company_id ?? null;
      if (cid == null) return raw;
      const refs = departmentRefByCompany[cid] || [];
      const hit = refs.find((x) => x.code === raw);
      return hit ? pickRefLabel(hit) : raw;
    },
    [departmentRefByCompany, pickRefLabel, t]
  );

  const baseFilteredEmployees = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return employees.filter((emp) => {
      const st = emp.status || 'active';
      const statusMatched = deferredEmploymentStatus === 'all' ? true : st === deferredEmploymentStatus;
      if (!statusMatched) return false;
      if (!q) return true;
      return (
        (emp.name || '').toLowerCase().includes(q) ||
        (emp.employee_number || '').toLowerCase().includes(q) ||
        getDepartmentText(emp).toLowerCase().includes(q) ||
        (emp.position || '').toLowerCase().includes(q)
      );
    });
  }, [employees, searchTerm, deferredEmploymentStatus, getDepartmentText]);

  const sortedFiltered = useMemo(
    () => [...baseFilteredEmployees].sort((a, b) => a.employee_number.localeCompare(b.employee_number)),
    [baseFilteredEmployees]
  );

  const deptGroups = useMemo(() => {
    const m = new Map<string, EmpRow[]>();
    for (const emp of sortedFiltered) {
      const dept = getDepartmentText(emp);
      const arr = m.get(dept) || [];
      arr.push(emp);
      m.set(dept, arr);
    }
    return Array.from(m.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((dept) => ({ dept, rows: (m.get(dept) || []).sort((a, b) => a.name.localeCompare(b.name)) }));
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

  const selectedEmployee = useMemo(() => employees.find((e) => e.id === selectedId) || null, [employees, selectedId]);

  const navTo = (ix: number) => {
    if (ix < 0 || ix >= flatIds.length) return;
    setSelectedId(flatIds[ix]);
  };

  if (!allowRead) {
    return (
      <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">{t('permission.noAccess')}</div>
    );
  }

  const companyLabel = (c: (typeof companies)[number]) => c.name_kor || c.name_eng || c.name_thai || c.company_code;

  return (
    <div className="p-1.5 sm:p-3">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3 items-stretch min-h-0 lg:min-h-[min(480px,calc(100vh-5.5rem))]">
        <aside
          className={cn(
            'lg:col-span-4 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden',
            leaveSidebarLock && 'opacity-60 pointer-events-none'
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
                    setEmploymentStatusFilter(e.target.value === 'terminated' ? 'terminated' : e.target.value === 'all' ? 'all' : 'active')
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
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
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

          <div className="flex-1 min-h-0 overflow-y-auto">
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
                        className="flex items-center gap-2 w-full text-left px-3 py-2.5 border-b bg-gradient-to-r from-sky-50 via-indigo-50/70 to-slate-50 border-indigo-100/80"
                        onClick={() =>
                          setExpandedDept((prev) => {
                            const n = new Set(prev);
                            if (n.has(g.dept)) n.delete(g.dept);
                            else n.add(g.dept);
                            return n;
                          })
                        }
                      >
                        {open ? <ChevronDown className="w-4 h-4 shrink-0 text-indigo-500" /> : <ChevronRight className="w-4 h-4 shrink-0 text-indigo-500" />}
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-indigo-950">
                          {g.dept}
                          <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100/95 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                            {g.rows.length}
                          </span>
                        </span>
                      </button>
                      {open && (
                        <ul className="bg-white">
                          {g.rows.map((emp) => {
                            const active = selectedId === emp.id;
                            const rowNo = flatIds.indexOf(emp.id) + 1;
                            return (
                              <li key={emp.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (leaveSidebarLock) {
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
                                      <span className="truncate text-gray-600 hidden md:inline">{emp.position || '-'}</span>
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
            )}
          </div>
        </aside>

        <section className="lg:col-span-8 flex flex-col bg-white rounded-lg shadow border border-gray-200 min-h-0 p-1.5 sm:p-2 lg:max-h-[calc(100vh-5.5rem)] overflow-y-auto">
          {selectedEmployee == null ? (
            <p className="text-sm text-gray-500 py-8 text-center">{t('attendanceLeaveManage.pickEmployee')}</p>
          ) : (
            <AttendanceLeaveEmployeeWorkarea
              key={selectedEmployee.id}
              employee={selectedEmployee}
              allowRead={allowRead}
              allowCreate={allowCreate}
              allowSave={allowSave}
              allowDelete={allowDelete}
              onFormModeChange={setLeaveSidebarLock}
              employeeNav={{
                listLength: flatIds.length,
                selectedIndex,
                onFirst: () => navTo(0),
                onPrev: () => navTo(selectedIndex - 1),
                onNext: () => navTo(selectedIndex + 1),
                onLast: () => navTo(flatIds.length - 1),
              }}
              className="lg:max-h-[calc(100vh-7rem)]"
            />
          )}
        </section>
      </div>
    </div>
  );
}
