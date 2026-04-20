'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Search, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';

export interface CompanyRecord {
  id: number;
  system_group_code?: string;
  company_code: string;
  name_kor?: string | null;
  name_thai?: string | null;
  name_eng?: string | null;
  representative_director_name?: string | null;
  currency_unit?: string | null;
  logo_data_url?: string | null;
  address_no?: string | null;
  soi?: string | null;
  road?: string | null;
  tumbon?: string | null;
  amphur?: string | null;
  province?: string | null;
  zip_code?: string | null;
  email?: string | null;
  phone?: string | null;
  fax?: string | null;
  additional_info?: string | null;
  webperson_sort_order?: number | null;
  webperson_note?: string | null;
}

type Draft = {
  company_code: string;
  name_kor: string;
  name_thai: string;
  name_eng: string;
  representative_director_name: string;
  currency_unit: string;
  logo_data_url: string;
  address_no: string;
  soi: string;
  road: string;
  tumbon: string;
  amphur: string;
  province: string;
  zip_code: string;
  email: string;
  phone: string;
  fax: string;
  additional_info: string;
  webperson_sort_order: string;
  webperson_note: string;
};

function emptyDraft(): Draft {
  return {
    company_code: '',
    name_kor: '',
    name_thai: '',
    name_eng: '',
    representative_director_name: '',
    currency_unit: '',
    logo_data_url: '',
    address_no: '',
    soi: '',
    road: '',
    tumbon: '',
    amphur: '',
    province: '',
    zip_code: '',
    email: '',
    phone: '',
    fax: '',
    additional_info: '',
    webperson_sort_order: '0',
    webperson_note: '',
  };
}

function toDraft(c: CompanyRecord): Draft {
  return {
    company_code: c.company_code ?? '',
    name_kor: c.name_kor ?? '',
    name_thai: c.name_thai ?? '',
    name_eng: c.name_eng ?? '',
    representative_director_name: c.representative_director_name ?? '',
    currency_unit: c.currency_unit ?? '',
    logo_data_url: c.logo_data_url ?? '',
    address_no: c.address_no ?? '',
    soi: c.soi ?? '',
    road: c.road ?? '',
    tumbon: c.tumbon ?? '',
    amphur: c.amphur ?? '',
    province: c.province ?? '',
    zip_code: c.zip_code ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    fax: c.fax ?? '',
    additional_info: c.additional_info ?? '',
    webperson_sort_order:
      c.webperson_sort_order != null ? String(c.webperson_sort_order) : '0',
    webperson_note: c.webperson_note ?? '',
  };
}

function buildCreatePayload(d: Draft) {
  const sort = parseInt(d.webperson_sort_order, 10);
  return {
    company_code: d.company_code.trim(),
    name_kor: d.name_kor.trim() || null,
    name_thai: d.name_thai.trim() || null,
    name_eng: d.name_eng.trim() || null,
    representative_director_name: d.representative_director_name.trim() || null,
    currency_unit: d.currency_unit.trim() || null,
    logo_data_url: d.logo_data_url.trim() || null,
    address_no: d.address_no.trim() || null,
    soi: d.soi.trim() || null,
    road: d.road.trim() || null,
    tumbon: d.tumbon.trim() || null,
    amphur: d.amphur.trim() || null,
    province: d.province.trim() || null,
    zip_code: d.zip_code.trim() || null,
    email: d.email.trim() || null,
    phone: d.phone.trim() || null,
    fax: d.fax.trim() || null,
    additional_info: d.additional_info.trim() || null,
    webperson_sort_order: Number.isFinite(sort) ? sort : 0,
    webperson_note: d.webperson_note.trim() || null,
  };
}

function buildUpdatePayload(d: Draft) {
  const sort = parseInt(d.webperson_sort_order, 10);
  return {
    name_kor: d.name_kor.trim() || null,
    name_thai: d.name_thai.trim() || null,
    name_eng: d.name_eng.trim() || null,
    representative_director_name: d.representative_director_name.trim() || null,
    currency_unit: d.currency_unit.trim() || null,
    logo_data_url: d.logo_data_url.trim() || null,
    address_no: d.address_no.trim() || null,
    soi: d.soi.trim() || null,
    road: d.road.trim() || null,
    tumbon: d.tumbon.trim() || null,
    amphur: d.amphur.trim() || null,
    province: d.province.trim() || null,
    zip_code: d.zip_code.trim() || null,
    email: d.email.trim() || null,
    phone: d.phone.trim() || null,
    fax: d.fax.trim() || null,
    additional_info: d.additional_info.trim() || null,
    webperson_sort_order: Number.isFinite(sort) ? sort : 0,
    webperson_note: d.webperson_note.trim() || null,
  };
}

function parseApiErrorMessage(
  e: any,
  fallback: string,
  localize?: (detail: string) => string
): string {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return localize ? localize(detail) : detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === 'string') return localize ? localize(first) : first;
    if (first?.msg) {
      const msg = String(first.msg);
      return localize ? localize(msg) : msg;
    }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

type DetailTab = 'detail' | 'webperson';

const inputCls =
  'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100 disabled:text-gray-600';

export default function CompanyManagePage() {
  const { t, locale } = useI18n();
  const toolbarT = useCallback(
    (key: string) => {
      switch (key) {
        case 'employees.toolbar.confirmDelete':
          return t('company.confirmDelete');
        case 'employees.toolbar.newRecord':
          return t('company.newRecord');
        case 'employees.toolbar.newRecordHintShort':
          return t('company.newRecordHintShort');
        case 'employees.toolbar.finishEditFirst':
          return t('company.finishEditFirst');
        default:
          return t(key);
      }
    },
    [t]
  );

  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CompanyRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uiMode, setUiMode] = useState<MasterUiMode>('browse');
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [detailTab, setDetailTab] = useState<DetailTab>('detail');
  const [saving, setSaving] = useState(false);
  const localizeDeleteDetail = useCallback(
    (detail: string) => {
      const d = detail.toLowerCase();
      if (
        d.includes('외래키') ||
        d.includes('foreign key') ||
        d.includes('23503') ||
        d.includes('소속된 직원') ||
        d.includes('참조 중이라 삭제할 수 없습니다')
      ) {
        return t('company.deleteBlockedByReference');
      }
      return detail;
    },
    [t]
  );

  const fetchList = useCallback(async () => {
    try {
      const res = await apiClient.getCompanies();
      setCompanies(res.data as CompanyRecord[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const pickCompanyNameByLocale = useCallback(
    (c: CompanyRecord) => {
      if (locale === 'ko') return c.name_kor || c.name_eng || c.name_thai || c.company_code;
      if (locale === 'en') return c.name_eng || c.name_kor || c.name_thai || c.company_code;
      // th (default)
      return c.name_thai || c.name_kor || c.name_eng || c.company_code;
    },
    [locale]
  );

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await apiClient.getCompany(id);
      const c = res.data as CompanyRecord;
      setDetail(c);
      setDraft(toDraft(c));
    } catch (e) {
      console.error(e);
      const fallback = companies.find((x) => x.id === id);
      if (fallback) {
        setDetail(fallback);
        setDraft(toDraft(fallback));
      }
    } finally {
      setDetailLoading(false);
    }
  }, [companies]);

  useEffect(() => {
    if (selectedId != null) {
      void loadDetail(selectedId);
    } else if (uiMode !== 'new') {
      setDetail(null);
    }
  }, [selectedId, loadDetail, uiMode]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return companies.filter(
      (c) =>
        c.company_code.toLowerCase().includes(q) ||
        (c.name_kor || '').toLowerCase().includes(q) ||
        (c.name_thai || '').toLowerCase().includes(q) ||
        (c.name_eng || '').toLowerCase().includes(q) ||
        (c.representative_director_name || '').toLowerCase().includes(q) ||
        (c.currency_unit || '').toLowerCase().includes(q)
    );
  }, [companies, searchTerm]);

  const sortedList = useMemo(
    () => [...filtered].sort((a, b) => a.company_code.localeCompare(b.company_code)),
    [filtered]
  );

  const selectedIndex = useMemo(
    () => (selectedId != null ? sortedList.findIndex((c) => c.id === selectedId) : -1),
    [sortedList, selectedId]
  );

  const selectedListRow = useMemo(
    () => (selectedId != null ? companies.find((c) => c.id === selectedId) : undefined),
    [companies, selectedId]
  );

  const detailReady = selectedId != null && detail != null && !detailLoading;

  const handleToolbarSave = async () => {
    if (uiMode === 'new') {
      if (!draft.company_code.trim()) {
        alert(t('company.validationNew'));
        return;
      }
      setSaving(true);
      try {
        const res = await apiClient.createCompany(buildCreatePayload(draft) as Record<string, unknown>);
        const created = res.data as CompanyRecord;
        await fetchList();
        setUiMode('browse');
        setSelectedId(created.id);
        setDetailTab('detail');
        alert(t('company.saved'));
      } catch (e) {
        console.error(e);
        alert(parseApiErrorMessage(e, t('company.saveError')));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!detail) return;
    setSaving(true);
    try {
      await apiClient.updateCompany(detail.id, buildUpdatePayload(draft));
      await fetchList();
      await loadDetail(detail.id);
      setUiMode('browse');
      alert(t('company.saved'));
    } catch (e) {
      console.error(e);
      alert(parseApiErrorMessage(e, t('company.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const handleToolbarCancel = () => {
    if (uiMode === 'new') {
      setUiMode('browse');
      setSelectedId(null);
      setDraft(emptyDraft());
      setDetailTab('detail');
      return;
    }
    if (selectedId != null) {
      void loadDetail(selectedId);
    }
    setUiMode('browse');
  };

  const handleToolbarAdd = () => {
    setUiMode('new');
    setSelectedId(null);
    setDetail(null);
    setDraft(emptyDraft());
    setDetailTab('detail');
  };

  const handleToolbarEdit = () => {
    if (!detailReady) return;
    setUiMode('edit');
  };

  const handleToolbarDelete = async () => {
    if (!detailReady || !detail) return;
    if (!window.confirm(t('company.confirmDelete'))) return;
    setSaving(true);
    try {
      await apiClient.deleteCompany(detail.id);
      await fetchList();
      setSelectedId(null);
      setDetail(null);
      setUiMode('browse');
      setDraft(emptyDraft());
      alert(t('company.deleted'));
    } catch (e) {
      console.error(e);
      alert(parseApiErrorMessage(e, t('company.deleteError'), localizeDeleteDetail));
    } finally {
      setSaving(false);
    }
  };

  const goNav = (index: number) => {
    const row = sortedList[index];
    if (row) {
      setUiMode('browse');
      setSelectedId(row.id);
      setDetailTab('detail');
    }
  };

  const setPhotoFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      setDraft((d) => ({ ...d, logo_data_url: url }));
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
  }

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'detail', label: t('company.tab.detail') },
    { key: 'webperson', label: t('company.tab.webperson') },
  ];

  const fieldsetCls =
    'rounded-md border border-rose-200/80 bg-rose-50/30 p-2 sm:p-3 space-y-2';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-stretch min-h-0 lg:min-h-[min(560px,calc(100vh-7.5rem))]">
      <aside
        className={cn(
          'lg:col-span-4 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden',
          uiMode !== 'browse' && 'opacity-60 pointer-events-none'
        )}
      >
        <div className="p-3 md:p-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t('company.listTitle')}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={t('company.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto max-h-[min(480px,calc(100vh-14rem))] lg:max-h-[calc(100vh-7.5rem)]">
          {sortedList.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 text-center">{t('company.selectHint')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sortedList.map((c) => {
                const active = selectedId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (uiMode !== 'browse') {
                          alert(toolbarT('employees.toolbar.finishEditFirst'));
                          return;
                        }
                        setSelectedId(c.id);
                        setDetailTab('detail');
                      }}
                      className={cn(
                        'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors',
                        active
                          ? 'bg-primary-50 border-l-4 border-primary-600'
                          : 'hover:bg-gray-50 border-l-4 border-transparent'
                      )}
                    >
                      <div className="mt-0.5 p-1.5 rounded-full bg-gray-100 text-gray-600">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">
                          {pickCompanyNameByLocale(c)}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">{c.company_code}</p>
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
            onAdd={handleToolbarAdd}
            onEdit={handleToolbarEdit}
            onDelete={() => void handleToolbarDelete()}
            onSave={() => void handleToolbarSave()}
            onCancel={handleToolbarCancel}
            onFirst={() => goNav(0)}
            onPrev={() => selectedIndex > 0 && goNav(selectedIndex - 1)}
            onNext={() =>
              selectedIndex >= 0 &&
              selectedIndex < sortedList.length - 1 &&
              goNav(selectedIndex + 1)
            }
            onLast={() =>
              sortedList.length > 0 && goNav(sortedList.length - 1)
            }
            t={toolbarT}
          />
        </div>

        <div className="px-4 md:px-6 pt-2 md:pt-3 pb-0 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            {uiMode === 'new' ? (
              <div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900">{t('company.newRecord')}</h2>
                <span className="text-[11px] text-gray-500">{t('company.newRecordHintShort')}</span>
              </div>
            ) : detailReady ? (
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {pickCompanyNameByLocale(detail!)}
                </h2>
                <p className="text-sm text-gray-500 font-mono">{detail!.company_code}</p>
              </div>
            ) : selectedId != null && detailLoading ? (
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedListRow?.company_code ?? '—'}</h2>
                <p className="text-sm text-gray-500">{t('common.loading')}</p>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('company.detailPanel')}</h2>
                <p className="text-sm text-gray-500">{t('company.subtitle')}</p>
              </div>
            )}
          </div>
          <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={detailTab === tab.key}
                onClick={() => setDetailTab(tab.key)}
                className={cn(
                  'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  detailTab === tab.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 min-h-0 p-3 md:p-4 overflow-y-auto">
          {(uiMode === 'new' || detailReady) && detailTab === 'detail' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-8 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
                  <label className="block text-[11px] font-medium text-gray-700">
                    {t('company.field.code')}
                    {uiMode === 'new' && <abbr className="text-red-600 no-underline">*</abbr>}
                    <input
                      className={cn(inputCls, 'mt-0.5')}
                      value={draft.company_code}
                      disabled={uiMode !== 'new'}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, company_code: e.target.value }))
                      }
                      title={uiMode !== 'new' ? t('company.codeLocked') : undefined}
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-gray-700">
                    {t('company.field.groupCode')}
                    <input
                      className={cn(inputCls, 'mt-0.5', 'font-mono bg-gray-50')}
                      value={
                        uiMode === 'new'
                          ? ''
                          : (detail?.system_group_code ?? '')
                      }
                      disabled
                      placeholder={uiMode === 'new' ? t('company.hint.groupOnSave') : undefined}
                      title={t('company.hint.groupScopedCode')}
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-gray-700 sm:col-span-1">
                    {t('company.field.nameThai')}
                    <input
                      className={cn(inputCls, 'mt-0.5')}
                      value={draft.name_thai}
                      disabled={uiMode === 'browse'}
                      onChange={(e) => setDraft((d) => ({ ...d, name_thai: e.target.value }))}
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-gray-700 sm:col-span-1">
                    {t('company.field.nameKor')}
                    <input
                      className={cn(inputCls, 'mt-0.5')}
                      value={draft.name_kor}
                      disabled={uiMode === 'browse'}
                      onChange={(e) => setDraft((d) => ({ ...d, name_kor: e.target.value }))}
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-gray-700 sm:col-span-1">
                    {t('company.field.nameEng')}
                    <input
                      className={cn(inputCls, 'mt-0.5')}
                      value={draft.name_eng}
                      disabled={uiMode === 'browse'}
                      onChange={(e) => setDraft((d) => ({ ...d, name_eng: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  <label className="block text-[11px] font-medium text-gray-700 sm:col-span-1 xl:col-span-1">
                    {t('company.field.representativeDirectorName')}
                    <input
                      className={cn(inputCls, 'mt-0.5')}
                      value={draft.representative_director_name}
                      disabled={uiMode === 'browse'}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, representative_director_name: e.target.value }))
                      }
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-gray-700 sm:col-span-1 xl:col-span-1">
                    {t('company.field.currencyUnit')}
                    <input
                      className={cn(inputCls, 'mt-0.5', 'uppercase')}
                      maxLength={20}
                      value={draft.currency_unit}
                      disabled={uiMode === 'browse'}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, currency_unit: e.target.value.toUpperCase() }))
                      }
                      placeholder="THB"
                    />
                  </label>
                </div>

                <fieldset className={fieldsetCls}>
                  <legend className="text-[10px] font-bold text-rose-800 px-1">
                    {t('company.group.address')}
                  </legend>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <label className="text-[11px] font-medium text-gray-700">
                      {t('company.field.addressNo')}
                      <input
                        className={cn(inputCls, 'mt-0.5')}
                        value={draft.address_no}
                        disabled={uiMode === 'browse'}
                        onChange={(e) => setDraft((d) => ({ ...d, address_no: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-gray-700">
                      {t('company.field.soi')}
                      <input
                        className={cn(inputCls, 'mt-0.5')}
                        value={draft.soi}
                        disabled={uiMode === 'browse'}
                        onChange={(e) => setDraft((d) => ({ ...d, soi: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-gray-700">
                      {t('company.field.road')}
                      <input
                        className={cn(inputCls, 'mt-0.5')}
                        value={draft.road}
                        disabled={uiMode === 'browse'}
                        onChange={(e) => setDraft((d) => ({ ...d, road: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-gray-700">
                      {t('company.field.tumbon')}
                      <input
                        className={cn(inputCls, 'mt-0.5')}
                        value={draft.tumbon}
                        disabled={uiMode === 'browse'}
                        onChange={(e) => setDraft((d) => ({ ...d, tumbon: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-gray-700">
                      {t('company.field.amphur')}
                      <input
                        className={cn(inputCls, 'mt-0.5')}
                        value={draft.amphur}
                        disabled={uiMode === 'browse'}
                        onChange={(e) => setDraft((d) => ({ ...d, amphur: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-gray-700">
                      {t('company.field.province')}
                      <input
                        className={cn(inputCls, 'mt-0.5')}
                        value={draft.province}
                        disabled={uiMode === 'browse'}
                        onChange={(e) => setDraft((d) => ({ ...d, province: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-gray-700">
                      {t('company.field.zip')}
                      <input
                        className={cn(inputCls, 'mt-0.5')}
                        value={draft.zip_code}
                        disabled={uiMode === 'browse'}
                        onChange={(e) => setDraft((d) => ({ ...d, zip_code: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-gray-700 sm:col-span-1">
                      {t('company.field.email')}
                      <input
                        type="email"
                        className={cn(inputCls, 'mt-0.5')}
                        value={draft.email}
                        disabled={uiMode === 'browse'}
                        onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-gray-700">
                      {t('company.field.phone')}
                      <input
                        className={cn(inputCls, 'mt-0.5')}
                        value={draft.phone}
                        disabled={uiMode === 'browse'}
                        onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-gray-700">
                      {t('company.field.fax')}
                      <input
                        className={cn(inputCls, 'mt-0.5')}
                        value={draft.fax}
                        disabled={uiMode === 'browse'}
                        onChange={(e) => setDraft((d) => ({ ...d, fax: e.target.value }))}
                      />
                    </label>
                  </div>
                </fieldset>
              </div>

              <div className="lg:col-span-4 flex flex-col gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="w-full max-w-[180px] aspect-square border-2 border-dashed border-rose-200 rounded-lg bg-white flex items-center justify-center overflow-hidden text-[10px] text-gray-400 text-center p-1"
                  >
                    {draft.logo_data_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draft.logo_data_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      t('company.logoPlaceholder')
                    )}
                  </div>
                  {uiMode !== 'browse' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        className="text-[10px] px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50"
                        onClick={() => document.getElementById('company-logo-file')?.click()}
                      >
                        {t('company.selectLogo')}
                      </button>
                      <button
                        type="button"
                        className="text-[10px] px-2 py-0.5 rounded border border-red-200 text-red-600 bg-white hover:bg-red-50"
                        onClick={() => setDraft((d) => ({ ...d, logo_data_url: '' }))}
                      >
                        {t('company.clearLogo')}
                      </button>
                      <input
                        id="company-logo-file"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                  )}
                </div>
                <label className="block text-[11px] font-medium text-gray-700">
                  {t('company.field.additionalInfo')}
                  <textarea
                    className={cn(inputCls, 'mt-0.5 min-h-[140px] resize-y')}
                    value={draft.additional_info}
                    disabled={uiMode === 'browse'}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, additional_info: e.target.value }))
                    }
                  />
                </label>
              </div>
            </div>
          )}

          {(uiMode === 'new' || detailReady) && detailTab === 'webperson' && (
            <div className={cn(fieldsetCls, 'max-w-xl')}>
              <legend className="text-[10px] font-bold text-rose-800 px-1">
                {t('company.webpersonLegend')}
              </legend>
              <label className="block text-[11px] font-medium text-gray-700">
                {t('company.field.webpersonSortOrder')}
                <input
                  type="number"
                  className={cn(inputCls, 'mt-0.5 w-32')}
                  value={draft.webperson_sort_order}
                  disabled={uiMode === 'browse'}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, webperson_sort_order: e.target.value }))
                  }
                />
              </label>
              <label className="block text-[11px] font-medium text-gray-700">
                {t('company.field.webpersonNote')}
                <textarea
                  className={cn(inputCls, 'mt-0.5 min-h-[100px]')}
                  value={draft.webperson_note}
                  disabled={uiMode === 'browse'}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, webperson_note: e.target.value }))
                  }
                />
              </label>
            </div>
          )}

          {uiMode !== 'new' && !detailReady && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 text-sm">
              {selectedId != null && detailLoading ? (
                <p>{t('common.loading')}</p>
              ) : (
                <p>{t('company.selectHint')}</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
