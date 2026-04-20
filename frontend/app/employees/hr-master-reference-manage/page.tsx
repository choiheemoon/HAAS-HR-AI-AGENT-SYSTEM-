'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';

type Category =
  | 'employee_type'
  | 'employment_type'
  | 'employee_level'
  | 'position'
  | 'division'
  | 'department'
  | 'level'
  | 'work_place'
  | 'area'
  | 'work_status';

type ItemRecord = {
  id: number;
  company_id: number;
  category: Category;
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

type Draft = {
  company_id: number | null;
  code: string;
  name_kor: string;
  name_eng: string;
  name_thai: string;
};

const inputCls =
  'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100 disabled:text-gray-600';

function parseApiDetail(e: unknown): string {
  const err = e as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0 && typeof (detail[0] as { msg?: string })?.msg === 'string') {
    return String((detail[0] as { msg: string }).msg);
  }
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  return '';
}

function localizeReferenceDeleteDetail(detail: string, t: (key: string) => string): string {
  const d = (detail || '').toLowerCase();
  if (
    d.includes('사용 중이라 삭제할 수 없습니다') ||
    d.includes('foreign key') ||
    d.includes('23503') ||
    d.includes('참조') ||
    d.includes('restrict')
  ) {
    return t('employees.reference.deleteBlockedByUsage');
  }
  return detail;
}

function emptyDraft(companyId: number | null): Draft {
  return {
    company_id: companyId,
    code: '',
    name_kor: '',
    name_eng: '',
    name_thai: '',
  };
}

const CATEGORIES: Array<{
  key: Category;
  labelKey: string;
}> = [
  { key: 'employee_type', labelKey: 'employees.reference.tab.employeeType' },
  { key: 'employment_type', labelKey: 'employees.reference.tab.employmentType' },
  { key: 'employee_level', labelKey: 'employees.reference.tab.employeeLevel' },
  { key: 'position', labelKey: 'employees.reference.tab.position' },
  { key: 'division', labelKey: 'employees.reference.tab.division' },
  { key: 'department', labelKey: 'employees.reference.tab.department' },
  { key: 'level', labelKey: 'employees.reference.tab.level' },
  { key: 'work_place', labelKey: 'employees.reference.tab.workPlace' },
  { key: 'area', labelKey: 'employees.reference.tab.area' },
  { key: 'work_status', labelKey: 'employees.reference.tab.workStatus' },
];

function pickItemLabel(locale: string, it: ItemRecord) {
  if (locale === 'ko') return it.name_kor || it.name_eng || it.name_thai || it.code;
  if (locale === 'en') return it.name_eng || it.name_kor || it.name_thai || it.code;
  return it.name_thai || it.name_kor || it.name_eng || it.code;
}

export default function HrMasterReferenceManagePage() {
  const { t, locale } = useI18n();
  const { can, loading: permLoading } = useMenuPermissions();
  const menuKey = 'hr-master-reference-manage';
  const allowRead = can(menuKey, 'can_read');

  const [companyOptions, setCompanyOptions] = useState<
    Array<{ id: number; company_code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>
  >([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const pickCompanyLabel = useCallback(
    (c: { id: number; company_code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }) => {
      if (locale === 'ko') return c.name_kor || c.name_eng || c.name_thai || c.company_code;
      if (locale === 'en') return c.name_eng || c.name_kor || c.name_thai || c.company_code;
      return c.name_thai || c.name_kor || c.name_eng || c.company_code;
    },
    [locale]
  );

  const companyById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of companyOptions) m.set(c.id, pickCompanyLabel(c));
    return m;
  }, [companyOptions, pickCompanyLabel]);

  const [activeCategory, setActiveCategory] = useState<Category>('employee_type');

  const [items, setItems] = useState<ItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ItemRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [uiMode, setUiMode] = useState<MasterUiMode>('browse');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(null));

  const defaultCompanyId = companyOptions[0]?.id ?? null;

  const allowAdd = can(menuKey, 'can_create');
  const allowEdit = can(menuKey, 'can_update');
  const allowDelete = can(menuKey, 'can_delete');
  const allowSave = uiMode === 'new' ? allowAdd : uiMode === 'edit' ? allowEdit : false;

  const browseAllow = allowRead;

  const fetchItems = useCallback(
    async (category: Category, company_id: number | null) => {
      if (company_id == null) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await apiClient.getEmployeeReferenceItems(category, company_id);
        setItems(res.data as ItemRecord[]);
      } catch (e) {
        console.error(e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const text =
        `${it.code} ${it.name_kor ?? ''} ${it.name_eng ?? ''} ${it.name_thai ?? ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [items, searchTerm]);

  const sortedList = useMemo(
    () => [...filtered].sort((a, b) => a.code.localeCompare(b.code)),
    [filtered]
  );

  const selectedIndex = useMemo(
    () => (selectedId != null ? sortedList.findIndex((x) => x.id === selectedId) : -1),
    [sortedList, selectedId]
  );

  const setCategoryAndReload = useCallback(
    (next: Category) => {
      setActiveCategory(next);
      setSelectedId(null);
      setDetail(null);
      setUiMode('browse');
      setSearchTerm('');
      void fetchItems(next, selectedCompanyId);
    },
    [fetchItems, selectedCompanyId]
  );

  useEffect(() => {
    if (permLoading) return;
    if (!allowRead) return;
    void (async () => {
      try {
        const res = await apiClient.getMyCompanies();
        const list = res.data as Array<{ id: number; company_code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
        setCompanyOptions(list);
        const cid = list[0]?.id ?? null;
        setSelectedCompanyId(cid);
        setActiveCategory('employee_type');
        setUiMode('browse');
        setSelectedId(null);
        setDetail(null);
        setDraft(emptyDraft(cid));
        await fetchItems('employee_type', cid);
      } catch (e) {
        console.error(e);
        setCompanyOptions([]);
        setSelectedCompanyId(null);
        setItems([]);
      }
    })();
  }, [permLoading, allowRead, fetchItems]);

  const handleToolbarAdd = () => {
    if (selectedCompanyId == null) return;
    setUiMode('new');
    setSelectedId(null);
    setDetail(null);
    setDraft(emptyDraft(selectedCompanyId));
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
      setDraft(emptyDraft(selectedCompanyId));
      return;
    }
    if (selectedId != null) {
      const it = items.find((x) => x.id === selectedId);
      if (it) setDetail(it);
    }
    setUiMode('browse');
  };

  const handleToolbarSave = async () => {
    if (selectedCompanyId == null) return;

    if (uiMode === 'new') {
      if (!draft.code.trim()) {
        alert(t('employees.reference.validationNew'));
        return;
      }
      setSaving(true);
      try {
        await apiClient.createEmployeeReferenceItem(activeCategory, {
          company_id: selectedCompanyId,
          code: draft.code.trim(),
          name_kor: draft.name_kor.trim() || null,
          name_eng: draft.name_eng.trim() || null,
          name_thai: draft.name_thai.trim() || null,
        });
        await fetchItems(activeCategory, selectedCompanyId);
        setUiMode('browse');
        setSelectedId(null);
        setDetail(null);
        setDraft(emptyDraft(selectedCompanyId));
        alert(t('employees.reference.saved'));
      } catch (e: any) {
        console.error(e);
        alert(e?.response?.data?.detail || e?.message || t('employees.reference.saveError'));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!detail) return;
    setSaving(true);
    try {
      await apiClient.updateEmployeeReferenceItem(
        activeCategory,
        detail.id,
        selectedCompanyId,
        {
          name_kor: draft.name_kor.trim() || null,
          name_eng: draft.name_eng.trim() || null,
          name_thai: draft.name_thai.trim() || null,
        }
      );
      await fetchItems(activeCategory, selectedCompanyId);
      const res = await apiClient.getEmployeeReferenceItem(activeCategory, detail.id, selectedCompanyId);
      const it = res.data as ItemRecord;
      setDetail(it);
      setDraft({
        company_id: selectedCompanyId,
        code: it.code,
        name_kor: it.name_kor ?? '',
        name_eng: it.name_eng ?? '',
        name_thai: it.name_thai ?? '',
      });
      setUiMode('browse');
      alert(t('employees.reference.saved'));
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.detail || e?.message || t('employees.reference.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleToolbarDelete = async () => {
    if (!detail || selectedCompanyId == null) return;
    if (!window.confirm(t('employees.reference.confirmDelete'))) return;
    setSaving(true);
    try {
      await apiClient.deleteEmployeeReferenceItem(activeCategory, detail.id, selectedCompanyId);
      await fetchItems(activeCategory, selectedCompanyId);
      setSelectedId(null);
      setDetail(null);
      setUiMode('browse');
      alert(t('employees.reference.deleted'));
    } catch (e) {
      console.error(e);
      const detail = parseApiDetail(e);
      alert(localizeReferenceDeleteDetail(detail, t) || t('employees.reference.deleteError'));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectItem = (id: number) => {
    if (uiMode !== 'browse') {
      alert(t('employees.reference.finishEditFirst'));
      return;
    }
    const it = items.find((x) => x.id === id);
    if (!it) return;
    setSelectedId(id);
    setDetail(it);
    setDetailLoading(false);
    setDraft({
      company_id: selectedCompanyId,
      code: it.code,
      name_kor: it.name_kor ?? '',
      name_eng: it.name_eng ?? '',
      name_thai: it.name_thai ?? '',
    });
  };

  if (loading || permLoading) {
    return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
  }

  if (!browseAllow) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-10 text-center text-sm text-amber-950" role="alert">
        {t('permission.noAccess')}
      </div>
    );
  }

  const activeTabLabels = CATEGORIES;
  const activeCategoryLabel = t(CATEGORIES.find((c) => c.key === activeCategory)?.labelKey ?? '');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-stretch min-h-0 lg:h-[min(560px,calc(100vh-7.5rem))] max-h-[calc(100vh-7.5rem)] overflow-hidden">
      <aside
        className={cn('lg:col-span-4 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden min-h-0 h-full')}
      >
        <div className="p-3 md:p-4 border-b border-gray-100 shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('employees.reference.title')}</p>

          <div className="flex items-center gap-2 mb-2">
            <p className="text-[11px] font-medium text-gray-600 whitespace-nowrap">{t('employees.reference.companyLabel')}</p>
            <select
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={selectedCompanyId ?? ''}
              onChange={(e) => {
                const cid = e.target.value ? Number(e.target.value) : null;
                setSelectedCompanyId(cid);
                setSelectedId(null);
                setDetail(null);
                setUiMode('browse');
                setSearchTerm('');
                setDraft(emptyDraft(cid));
                void fetchItems(activeCategory, cid);
              }}
            >
              {companyOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {pickCompanyLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 items-center mb-2 overflow-x-auto pb-1">
            {activeTabLabels.map((tab) => {
              const active = tab.key === activeCategory;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setCategoryAndReload(tab.key)}
                  className={cn(
                    'px-2 py-1 text-[11px] rounded border transition-colors shrink-0 min-w-[74px] leading-tight whitespace-normal text-center',
                    active ? 'bg-primary-50 border-primary-400 text-primary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={t('employees.reference.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {sortedList.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 text-center">{t('employees.selectHint')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sortedList.map((it) => {
                const active = selectedId === it.id;
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectItem(it.id)}
                      className={cn(
                        'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors',
                        active ? 'bg-primary-50 border-l-4 border-primary-600' : 'hover:bg-gray-50 border-l-4 border-transparent'
                      )}
                    >
                      <div className="mt-0.5 p-1.5 rounded-full bg-gray-100 text-gray-600">
                        <Database className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{pickItemLabel(locale, it)}</p>
                        <p className="text-xs text-gray-500 font-mono">{it.code}</p>
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
            allowAdd={allowAdd}
            allowEdit={allowEdit}
            allowDelete={allowDelete}
            allowSave={allowSave}
            onAdd={handleToolbarAdd}
            onEdit={handleToolbarEdit}
            onDelete={() => void handleToolbarDelete()}
            onSave={() => void handleToolbarSave()}
            onCancel={handleToolbarCancel}
            onFirst={() => sortedList.length > 0 && handleSelectItem(sortedList[0]!.id)}
            onPrev={() => selectedIndex > 0 && handleSelectItem(sortedList[selectedIndex - 1]!.id)}
            onNext={() =>
              selectedIndex >= 0 && selectedIndex < sortedList.length - 1 && handleSelectItem(sortedList[selectedIndex + 1]!.id)
            }
            onLast={() => sortedList.length > 0 && handleSelectItem(sortedList[sortedList.length - 1]!.id)}
            t={(key: string) => t(key)}
          />
        </div>

        <div className="px-4 md:px-6 pt-2 md:pt-3 pb-0 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2 min-h-0">
            {uiMode === 'new' ? (
              <div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900">
                  {t(CATEGORIES.find((c) => c.key === activeCategory)?.labelKey ?? '')} {t('employees.reference.title')}
                </h2>
                <span className="text-[11px] text-gray-500">{t('employees.reference.finishEditFirst')}</span>
              </div>
            ) : detail != null ? (
              <div>
                <h2 className="text-xl font-bold text-gray-900">{pickItemLabel(locale, detail)}</h2>
                <p className="text-sm text-gray-500 font-mono">{companyById.get(detail.company_id) ?? '-'} · {detail.code}</p>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('employees.reference.detailPanel')}</h2>
                <p className="text-sm text-gray-500">{t('employees.reference.subtitle')}</p>
              </div>
            )}
          </div>
          <nav className="hidden" />
        </div>

        <div className="flex-1 min-h-0 p-3 md:p-4 overflow-y-auto">
          {(uiMode === 'new' || detail != null) && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block text-[11px] font-medium text-gray-700">
                  {t('employees.reference.field.code')}
                  {uiMode === 'new' && <abbr className="text-red-600 no-underline">*</abbr>}
                  <input
                    className={cn(inputCls, 'mt-0.5')}
                    value={draft.code}
                    disabled={uiMode !== 'new'}
                    onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                    title={uiMode !== 'new' ? t('employees.reference.codeLocked') : undefined}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="block text-[11px] font-medium text-gray-700">
                  {t('employees.reference.field.nameKor')}
                  <input
                    className={cn(inputCls, 'mt-0.5')}
                    value={draft.name_kor}
                    disabled={uiMode === 'browse'}
                    onChange={(e) => setDraft((d) => ({ ...d, name_kor: e.target.value }))}
                  />
                </label>
                <label className="block text-[11px] font-medium text-gray-700">
                  {t('employees.reference.field.nameEng')}
                  <input
                    className={cn(inputCls, 'mt-0.5')}
                    value={draft.name_eng}
                    disabled={uiMode === 'browse'}
                    onChange={(e) => setDraft((d) => ({ ...d, name_eng: e.target.value }))}
                  />
                </label>
                <label className="block text-[11px] font-medium text-gray-700">
                  {t('employees.reference.field.nameThai')}
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

