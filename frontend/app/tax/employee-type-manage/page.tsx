'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Search, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';

export interface EmployeeTypeRecord {
  id: number;
  company_id: number;
  employee_type_code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
}

type Draft = {
  company_id: number | null;
  employee_type_code: string;
  name_kor: string;
  name_eng: string;
  name_thai: string;
};

function emptyDraft(defaultCompanyId: number | null): Draft {
  return {
    company_id: defaultCompanyId,
    employee_type_code: '',
    name_kor: '',
    name_eng: '',
    name_thai: '',
  };
}

function toDraft(d: EmployeeTypeRecord): Draft {
  return {
    company_id: d.company_id,
    employee_type_code: d.employee_type_code ?? '',
    name_kor: d.name_kor ?? '',
    name_eng: d.name_eng ?? '',
    name_thai: d.name_thai ?? '',
  };
}

function buildCreatePayload(d: Draft) {
  return {
    company_id: d.company_id,
    employee_type_code: d.employee_type_code.trim(),
    name_kor: d.name_kor.trim() || null,
    name_eng: d.name_eng.trim() || null,
    name_thai: d.name_thai.trim() || null,
  };
}

function buildUpdatePayload(d: Draft) {
  return {
    name_kor: d.name_kor.trim() || null,
    name_eng: d.name_eng.trim() || null,
    name_thai: d.name_thai.trim() || null,
  };
}

const inputCls =
  'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100 disabled:text-gray-600';

export default function EmployeeTypeManagePage() {
  const { t, locale } = useI18n();

  const toolbarT = useCallback(
    (key: string) => {
      switch (key) {
        case 'employees.toolbar.finishEditFirst':
          return t('employeeType.finishEditFirst');
        default:
          return t(key);
      }
    },
    [t]
  );

  const [companyOptions, setCompanyOptions] = useState<
    Array<{ id: number; company_code: string; name_kor?: string | null; name_thai?: string | null; name_eng?: string | null }>
  >([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const pickCompanyLabel = useCallback(
    (c: { name_kor?: string | null; name_eng?: string | null; name_thai?: string | null; company_code: string }) => {
      if (locale === 'ko') return c.name_kor || c.name_eng || c.name_thai || c.company_code;
      if (locale === 'en') return c.name_eng || c.name_kor || c.name_thai || c.company_code;
      return c.name_thai || c.name_kor || c.name_eng || c.company_code;
    },
    [locale]
  );

  const [employeeTypes, setEmployeeTypes] = useState<EmployeeTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<EmployeeTypeRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uiMode, setUiMode] = useState<MasterUiMode>('browse');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(null));

  const defaultCompanyId = companyOptions[0]?.id ?? null;

  const labelForType = useCallback(
    (et: EmployeeTypeRecord) => {
      if (locale === 'ko') return et.name_kor || et.name_eng || et.name_thai || et.employee_type_code;
      if (locale === 'en') return et.name_eng || et.name_kor || et.name_thai || et.employee_type_code;
      return et.name_thai || et.name_kor || et.name_eng || et.employee_type_code;
    },
    [locale]
  );

  const companyById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of companyOptions) m.set(c.id, pickCompanyLabel(c));
    return m;
  }, [companyOptions, pickCompanyLabel]);

  const canManage = selectedCompanyId != null;

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      const params = selectedCompanyId != null ? { company_id: selectedCompanyId } : undefined;
      const res = await apiClient.getEmployeeTypes(params);
      setEmployeeTypes(res.data as EmployeeTypeRecord[]);
    } catch (e) {
      console.error(e);
      setEmployeeTypes([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  const loadDetail = useCallback(
    async (id: number) => {
      setDetailLoading(true);
      try {
        const res = await apiClient.getEmployeeType(id);
        const et = res.data as EmployeeTypeRecord;
        setDetail(et);
        setDraft(toDraft(et));
      } catch (e) {
        console.error(e);
        const fallback = employeeTypes.find((x) => x.id === id);
        if (fallback) {
          setDetail(fallback);
          setDraft(toDraft(fallback));
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [employeeTypes]
  );

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const res = await apiClient.getMyCompanies();
        const list = res.data as Array<{
          id: number;
          company_code: string;
          name_kor?: string | null;
          name_thai?: string | null;
          name_eng?: string | null;
        }>;
        setCompanyOptions(list);
        // 기본은 첫 번째 회사로 두어 등록이 즉시 가능하게 합니다.
        setSelectedCompanyId(list[0]?.id ?? null);
      } catch (e) {
        console.error(e);
        setCompanyOptions([]);
        setSelectedCompanyId(null);
      }
    })();
  }, []);

  useEffect(() => {
    // 회사 선택이 준비된 뒤 목록 로드
    if (!companyOptions.length) return;
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, companyOptions.length]);

  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId);
    else if (uiMode !== 'new') setDetail(null);
  }, [selectedId, loadDetail, uiMode]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (!q) return employeeTypes;
    return employeeTypes.filter((et) => {
      const n =
        `${et.employee_type_code} ${et.name_kor ?? ''} ${et.name_eng ?? ''} ${et.name_thai ?? ''}`.toLowerCase();
      return n.includes(q);
    });
  }, [employeeTypes, searchTerm]);

  const sortedList = useMemo(
    () => [...filtered].sort((a, b) => a.employee_type_code.localeCompare(b.employee_type_code)),
    [filtered]
  );

  const selectedIndex = useMemo(
    () => (selectedId != null ? sortedList.findIndex((x) => x.id === selectedId) : -1),
    [sortedList, selectedId]
  );

  const goNav = (index: number) => {
    const row = sortedList[index];
    if (!row) return;
    setSelectedId(row.id);
  };

  const handleToolbarAdd = () => {
    const companyIdForNew = selectedCompanyId ?? defaultCompanyId ?? null;
    if (companyIdForNew == null) {
      alert(t('employeeType.companyLabel') + '가 없습니다.');
      return;
    }
    setUiMode('new');
    setSelectedId(null);
    setDetail(null);
    setDraft(emptyDraft(companyIdForNew));
  };

  const handleToolbarEdit = () => {
    if (!detail) return;
    setUiMode('edit');
  };

  const handleToolbarCancel = () => {
    if (uiMode === 'new') {
      setUiMode('browse');
      setSelectedId(null);
      setDetail(null);
      setDraft(emptyDraft(selectedCompanyId ?? defaultCompanyId ?? null));
      return;
    }
    if (selectedId != null) void loadDetail(selectedId);
    setUiMode('browse');
  };

  const handleToolbarSave = async () => {
    if (!canManage && uiMode !== 'new') return;
    if (uiMode === 'new') {
      const companyIdForNew = selectedCompanyId ?? defaultCompanyId ?? null;
      if (companyIdForNew == null) return;
      if (!draft.employee_type_code.trim()) {
        alert(t('employeeType.validationNew'));
        return;
      }
      setSaving(true);
      try {
        await apiClient.createEmployeeType(buildCreatePayload({ ...draft, company_id: companyIdForNew }));
        await fetchList();
        setUiMode('browse');
        setSelectedId(null);
        setDetail(null);
        setDraft(emptyDraft(companyIdForNew));
        alert(t('employeeType.saved'));
      } catch (e: any) {
        console.error(e);
        alert(e?.response?.data?.detail || e?.message || t('employeeType.saveError'));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!detail) return;
    setSaving(true);
    try {
      await apiClient.updateEmployeeType(detail.id, buildUpdatePayload(draft));
      await fetchList();
      await loadDetail(detail.id);
      setUiMode('browse');
      alert(t('employeeType.saved'));
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.detail || e?.message || t('employeeType.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleToolbarDelete = async () => {
    if (!detail) return;
    if (!window.confirm(t('employeeType.confirmDelete'))) return;
    setSaving(true);
    try {
      await apiClient.deleteEmployeeType(detail.id);
      await fetchList();
      setSelectedId(null);
      setDetail(null);
      setUiMode('browse');
      alert(t('employeeType.deleted'));
    } catch (e) {
      console.error(e);
      alert(t('employeeType.deleteError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
  }

  const browseAllow = canManage;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-stretch min-h-0 lg:min-h-[min(560px,calc(100vh-7.5rem))]">
      <aside
        className={cn(
          'lg:col-span-4 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden'
        )}
      >
        <div className="p-3 md:p-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('employeeType.listTitle')}</p>

          <div className="flex items-center gap-2 mb-2">
            <p className="text-[11px] font-medium text-gray-600 whitespace-nowrap">
              {t('employeeType.companyLabel')}
            </p>
            <select
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={selectedCompanyId ?? ''}
              onChange={(e) => {
                const nextId = e.target.value ? Number(e.target.value) : null;
                setSelectedCompanyId(nextId);
                setUiMode('browse');
                setSelectedId(null);
                setDetail(null);
                setSearchTerm('');
              }}
            >
              <option value="">{t('employees.companyFilter.all')}</option>
              {companyOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {pickCompanyLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={t('employeeType.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto max-h-[min(480px,calc(100vh-14rem))] lg:max-h-[calc(100vh-7.5rem)]">
          {sortedList.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 text-center">{t('employees.selectHint')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sortedList.map((et) => {
                const active = selectedId === et.id;
                return (
                  <li key={et.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (uiMode !== 'browse') {
                          alert(toolbarT('employees.toolbar.finishEditFirst'));
                          return;
                        }
                        setSelectedId(et.id);
                      }}
                      className={cn(
                        'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors',
                        active ? 'bg-primary-50 border-l-4 border-primary-600' : 'hover:bg-gray-50 border-l-4 border-transparent'
                      )}
                    >
                      <div className="mt-0.5 p-1.5 rounded-full bg-gray-100 text-gray-600">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{labelForType(et)}</p>
                        <p className="text-xs text-gray-500 font-mono">{et.employee_type_code}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="lg:col-span-8 flex flex-col bg-white rounded-lg shadow border border-gray-200 min-h-0 max-h-[min(100vh-7rem,920px)] lg:max-h-[calc(100vh-7.5rem)]">
        <div className="px-3 md:px-4 pt-3 md:pt-4 shrink-0">
          <HrMasterToolbar
            mode={uiMode}
            listLength={sortedList.length}
            selectedIndex={selectedIndex}
            saving={saving}
            allowAdd={browseAllow}
            allowEdit={browseAllow}
            allowDelete={browseAllow}
            allowSave={browseAllow}
            onAdd={handleToolbarAdd}
            onEdit={handleToolbarEdit}
            onDelete={() => void handleToolbarDelete()}
            onSave={() => void handleToolbarSave()}
            onCancel={handleToolbarCancel}
            onFirst={() => sortedList.length > 0 && goNav(0)}
            onPrev={() => selectedIndex > 0 && goNav(selectedIndex - 1)}
            onNext={() =>
              selectedIndex >= 0 && selectedIndex < sortedList.length - 1 && goNav(selectedIndex + 1)
            }
            onLast={() => sortedList.length > 0 && goNav(sortedList.length - 1)}
            t={toolbarT}
          />
        </div>

        <div className="px-4 md:px-6 pt-2 md:pt-3 pb-0 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2 min-h-0">
            {uiMode === 'new' ? (
              <div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900">{t('employeeType.newRecord')}</h2>
                <span className="text-[11px] text-gray-500">{t('employeeType.newRecordHintShort')}</span>
              </div>
            ) : detail != null ? (
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {labelForType(detail) || detail.employee_type_code}
                </h2>
                <p className="text-sm text-gray-500 font-mono">
                  {companyById.get(detail.company_id) ?? '-'} · {detail.employee_type_code}
                </p>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('employeeType.detailPanel')}</h2>
                <p className="text-sm text-gray-500">{t('employeeType.subtitle')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 p-3 md:p-4 overflow-y-auto">
          {(uiMode === 'new' || detail != null) && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block text-[11px] font-medium text-gray-700">
                  {t('employeeType.field.code')}
                  {uiMode === 'new' && <abbr className="text-red-600 no-underline">*</abbr>}
                  <input
                    className={cn(inputCls, 'mt-0.5')}
                    value={draft.employee_type_code}
                    disabled={uiMode !== 'new'}
                    onChange={(e) => setDraft((d) => ({ ...d, employee_type_code: e.target.value }))}
                    title={uiMode !== 'new' ? t('employeeType.codeLocked') : undefined}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="block text-[11px] font-medium text-gray-700">
                  {t('employeeType.field.nameKor')}
                  <input
                    className={cn(inputCls, 'mt-0.5')}
                    value={draft.name_kor}
                    disabled={uiMode === 'browse'}
                    onChange={(e) => setDraft((d) => ({ ...d, name_kor: e.target.value }))}
                  />
                </label>
                <label className="block text-[11px] font-medium text-gray-700">
                  {t('employeeType.field.nameEng')}
                  <input
                    className={cn(inputCls, 'mt-0.5')}
                    value={draft.name_eng}
                    disabled={uiMode === 'browse'}
                    onChange={(e) => setDraft((d) => ({ ...d, name_eng: e.target.value }))}
                  />
                </label>
                <label className="block text-[11px] font-medium text-gray-700">
                  {t('employeeType.field.nameThai')}
                  <input
                    className={cn(inputCls, 'mt-0.5')}
                    value={draft.name_thai}
                    disabled={uiMode === 'browse'}
                    onChange={(e) => setDraft((d) => ({ ...d, name_thai: e.target.value }))}
                  />
                </label>
              </div>
            </div>
          )}

          {uiMode !== 'new' && detail == null && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-gray-500 text-center text-sm">
              {t('employees.selectHint')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

