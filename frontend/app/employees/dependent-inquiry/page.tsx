'use client';

import { useEffect, useMemo, useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';

type Employee = {
  id: number;
  company_id?: number | null;
  employee_number: string;
  name: string;
  status: string;
};

type FamilyRow = {
  id?: number;
  name?: string | null;
  relation?: string | null;
  resident_number?: string | null;
  domestic_foreign?: string | null;
  highest_education?: string | null;
  occupation?: string | null;
  workplace?: string | null;
  position?: string | null;
  support_reason?: string | null;
};

type CompanyOption = {
  id: number;
  company_code: string;
  name_kor?: string | null;
  name_thai?: string | null;
  name_eng?: string | null;
};

type DependentInquiryRow = {
  key: string;
  employee: Employee;
  family: FamilyRow;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function normalize(v: unknown) {
  if (v == null) return '';
  return String(v).trim().toLowerCase();
}

export default function DependentInquiryPage() {
  const { t, locale } = useI18n();
  const { can, loading: permLoading } = useMenuPermissions();
  const allowRead = can('dependent-inquiry', 'can_read');

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [familiesByEmployeeId, setFamiliesByEmployeeId] = useState<Record<number, FamilyRow[]>>({});
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'terminated'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [relationFilter, setRelationFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const companyLabelById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of companyOptions) {
      if (locale === 'ko') m.set(c.id, c.name_kor || c.name_eng || c.name_thai || c.company_code);
      else if (locale === 'en') m.set(c.id, c.name_eng || c.name_kor || c.name_thai || c.company_code);
      else m.set(c.id, c.name_thai || c.name_kor || c.name_eng || c.company_code);
    }
    return m;
  }, [companyOptions, locale]);

  const loadAll = async (companyId: number | null) => {
    setLoading(true);
    try {
      const [companyRes, empRes] = await Promise.all([
        apiClient.getMyCompanies(),
        companyId == null ? apiClient.getEmployees() : apiClient.getEmployees({ company_id: companyId }),
      ]);
      const companies = (companyRes.data as CompanyOption[]) ?? [];
      const empList = ((empRes.data as Employee[]) ?? []).filter((e) =>
        statusFilter === 'all' ? true : e.status === statusFilter
      );
      setCompanyOptions(companies);
      setEmployees(empList);

      const familyResults = await Promise.allSettled(
        empList.map(async (e) => {
          const res = await apiClient.getEmployeeFamilies(e.id);
          return {
            employeeId: e.id,
            items: ((res.data as FamilyRow[]) ?? []).filter((f) =>
              f && Object.values(f).some((v) => String(v ?? '').trim() !== '')
            ),
          };
        })
      );
      const next: Record<number, FamilyRow[]> = {};
      for (const r of familyResults) {
        if (r.status === 'fulfilled') next[r.value.employeeId] = r.value.items;
      }
      setFamiliesByEmployeeId(next);
    } catch {
      setEmployees([]);
      setFamiliesByEmployeeId({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (permLoading) return;
    if (!allowRead) {
      setLoading(false);
      return;
    }
    void loadAll(selectedCompanyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading, allowRead, selectedCompanyId, statusFilter]);

  const flattenedRows = useMemo<DependentInquiryRow[]>(() => {
    const rows: DependentInquiryRow[] = [];
    for (const e of employees) {
      const familyItems = familiesByEmployeeId[e.id] ?? [];
      for (let i = 0; i < familyItems.length; i += 1) {
        rows.push({
          key: `${e.id}-${familyItems[i]?.id ?? i}`,
          employee: e,
          family: familyItems[i],
        });
      }
    }
    return rows;
  }, [employees, familiesByEmployeeId]);

  const relationOptions = useMemo(() => {
    const s = new Set<string>();
    for (const row of flattenedRows) {
      const relation = String(row.family.relation ?? '').trim();
      if (relation) s.add(relation);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [flattenedRows]);

  const filteredRows = useMemo(() => {
    const q = normalize(searchTerm);
    return flattenedRows.filter(({ employee, family }) => {
      if (relationFilter && normalize(family.relation) !== normalize(relationFilter)) return false;
      if (!q) return true;
      const pool = [
        companyLabelById.get(employee.company_id ?? -1) ?? '',
        employee.employee_number,
        employee.name,
        family.name ?? '',
        family.relation ?? '',
        family.resident_number ?? '',
        family.occupation ?? '',
        family.workplace ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return pool.includes(q);
    });
  }, [flattenedRows, searchTerm, relationFilter, companyLabelById]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedRows = filteredRows.slice(startIndex, startIndex + pageSize);
  const startItem = total === 0 ? 0 : startIndex + 1;
  const endItem = total === 0 ? 0 : Math.min(startIndex + pageSize, total);

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(total / pageSize))));
  }, [total, pageSize]);

  if (loading || permLoading) return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
  if (!allowRead) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-10 text-center text-sm text-amber-950" role="alert">
        {t('permission.noAccess')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{t('employees.dependent.title')}</h1>
        <p className="text-sm text-gray-500">{t('employees.dependent.subtitle')}</p>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <div className="p-4 border-b border-gray-200 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 mr-1">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{t('appList.filter.title')}</span>
              </div>
              <select
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
                value={selectedCompanyId ?? ''}
                onChange={(e) => {
                  setSelectedCompanyId(e.target.value ? Number(e.target.value) : null);
                  setPage(1);
                }}
              >
                <option value="">{t('employees.companyFilter.all')}</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {companyLabelById.get(c.id) ?? c.company_code}
                  </option>
                ))}
              </select>
              <select
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(
                    e.target.value === 'active' ? 'active' : e.target.value === 'terminated' ? 'terminated' : 'all'
                  );
                  setPage(1);
                }}
              >
                <option value="all">{t('employees.filter.status.all')}</option>
                <option value="active">{t('employees.status.active')}</option>
                <option value="terminated">{t('employees.status.terminated')}</option>
              </select>
              <select
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
                value={relationFilter}
                onChange={(e) => {
                  setRelationFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('employees.dependent.relationAll')}</option>
                {relationOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder={t('employees.dependent.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>
              <button
                type="button"
                onClick={() => void loadAll(selectedCompanyId)}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
              >
                {t('appList.filter.refresh')}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 ml-auto">
              <span className="text-sm text-gray-600">
                {t('appList.pagination.summary')
                  .replace('{total}', String(total))
                  .replace('{start}', String(startItem))
                  .replace('{end}', String(endItem))}
              </span>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                {t('appList.pagination.perPage')}
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {t('appList.pagination.countUnit').replace('{count}', String(n))}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.prev')}
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-auto max-h-[calc(100vh-13rem)]">
          <table className="min-w-[1400px] w-full divide-y divide-gray-200">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('appList.table.no')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.field.company')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.field.employeeNumber')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.field.name')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.family.col.name')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.family.col.relation')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.family.col.residentNumber')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.family.col.domesticForeign')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.family.col.highestEducation')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.family.col.occupation')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.family.col.workplace')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.family.col.position')}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{t('employees.family.col.remarks')}</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-sm text-gray-500 text-center" colSpan={13}>
                    {t('employees.dependent.empty')}
                  </td>
                </tr>
              ) : (
                pagedRows.map((row, index) => (
                  <tr key={row.key} className="border-b border-gray-100 text-sm text-gray-700 hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{total - startIndex - index}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{companyLabelById.get(row.employee.company_id ?? -1) ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.employee.employee_number || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.employee.name || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.family.name || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.family.relation || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.family.resident_number || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.family.domestic_foreign || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.family.highest_education || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.family.occupation || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.family.workplace || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.family.position || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.family.support_reason || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
