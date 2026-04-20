'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, FileEdit } from 'lucide-react';
import { cn } from '@/lib/utils';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

type DefinitionType = 'User Defined' | 'System Defined';
type MajorCodeRecord = {
  id: number;
  company_id: number;
  major_code: string;
  code_definition_type: DefinitionType;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
  note?: string | null;
};
type Draft = {
  company_id: number | null;
  major_code: string;
  code_definition_type: DefinitionType;
  name_kor: string;
  name_eng: string;
  name_thai: string;
  note: string;
};

function emptyDraft(companyId: number | null): Draft {
  return { company_id: companyId, major_code: '', code_definition_type: 'User Defined', name_kor: '', name_eng: '', name_thai: '', note: '' };
}

const inputCls = 'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100 disabled:text-gray-600';

export default function MajorCodeManagePage() {
  const { t, locale } = useI18n();
  const toolbarT = useCallback((key: string) => (key === 'employees.toolbar.finishEditFirst' ? t('employeeType.finishEditFirst') : t(key)), [t]);
  const [companyOptions, setCompanyOptions] = useState<Array<{ id: number; company_code: string; name_kor?: string | null; name_thai?: string | null; name_eng?: string | null }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<MajorCodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [uiMode, setUiMode] = useState<MasterUiMode>('browse');
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(null));

  const pickCompanyLabel = useCallback((c: { company_code: string; name_kor?: string | null; name_thai?: string | null; name_eng?: string | null }) => {
    if (locale === 'ko') return c.name_kor || c.name_eng || c.name_thai || c.company_code;
    if (locale === 'en') return c.name_eng || c.name_kor || c.name_thai || c.company_code;
    return c.name_thai || c.name_kor || c.name_eng || c.company_code;
  }, [locale]);

  const pickMajorLabel = useCallback((m: MajorCodeRecord) => {
    // Language-specific label priority:
    // - th: show Thai name first
    // - ko: show Korean name first
    // - en: show English name first
    if (locale === 'ko') return m.name_kor || m.name_eng || m.name_thai || m.major_code;
    if (locale === 'en') return m.name_eng || m.name_kor || m.name_thai || m.major_code;
    return m.name_thai || m.name_kor || m.name_eng || m.major_code;
  }, [locale]);

  const fetchList = useCallback(async () => {
    if (selectedCompanyId == null) return setRows([]);
    try {
      const res = await apiClient.getMajorCodes({ company_id: selectedCompanyId });
      setRows((res.data as MajorCodeRecord[]) ?? []);
    } catch {
      setRows([]);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const res = await apiClient.getMyCompanies();
        const list = res.data as Array<{ id: number; company_code: string; name_kor?: string | null; name_thai?: string | null; name_eng?: string | null }>;
        setCompanyOptions(list);
        setSelectedCompanyId(list[0]?.id ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => { void fetchList(); }, [fetchList]);
  useEffect(() => {
    if (selectedId == null) return;
    const d = rows.find((r) => r.id === selectedId);
    if (!d) return;
    setDraft({ company_id: d.company_id, major_code: d.major_code, code_definition_type: d.code_definition_type, name_kor: d.name_kor ?? '', name_eng: d.name_eng ?? '', name_thai: d.name_thai ?? '', note: d.note ?? '' });
  }, [selectedId, rows]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.major_code} ${r.name_kor ?? ''} ${r.name_eng ?? ''} ${r.name_thai ?? ''}`.toLowerCase().includes(q));
  }, [rows, searchTerm]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => a.major_code.localeCompare(b.major_code)), [filtered]);
  const selectedIndex = useMemo(() => (selectedId != null ? sorted.findIndex((r) => r.id === selectedId) : -1), [sorted, selectedId]);
  const detail = useMemo(() => (selectedId != null ? rows.find((r) => r.id === selectedId) ?? null : null), [rows, selectedId]);
  const isSystemDefinedDetail = detail?.code_definition_type === 'System Defined';
  const allowSave = uiMode === 'new' || uiMode === 'edit';

  const handleAdd = () => { if (selectedCompanyId == null) return; setUiMode('new'); setSelectedId(null); setDraft(emptyDraft(selectedCompanyId)); };
  const handleEdit = () => { if (detail) setUiMode('edit'); };
  const handleCancel = () => {
    setUiMode('browse');
    if (detail) setDraft({ company_id: detail.company_id, major_code: detail.major_code, code_definition_type: detail.code_definition_type, name_kor: detail.name_kor ?? '', name_eng: detail.name_eng ?? '', name_thai: detail.name_thai ?? '', note: detail.note ?? '' });
    else setDraft(emptyDraft(selectedCompanyId));
  };
  const handleSave = async () => {
    if (selectedCompanyId == null) return;
    if (!draft.major_code.trim()) return alert('Major 코드는 필수입니다.');
    setSaving(true);
    try {
      if (uiMode === 'new') {
        const res = await apiClient.createMajorCode({
          company_id: selectedCompanyId, major_code: draft.major_code.trim(), code_definition_type: draft.code_definition_type,
          name_kor: draft.name_kor.trim() || null, name_eng: draft.name_eng.trim() || null, name_thai: draft.name_thai.trim() || null, note: draft.note.trim() || null,
        });
        const created = res.data as MajorCodeRecord;
        await fetchList();
        setSelectedId(created.id);
      } else if (uiMode === 'edit' && detail) {
        await apiClient.updateMajorCode(detail.id, {
          code_definition_type: draft.code_definition_type,
          name_kor: draft.name_kor.trim() || null, name_eng: draft.name_eng.trim() || null, name_thai: draft.name_thai.trim() || null, note: draft.note.trim() || null,
        });
        await fetchList();
      }
      setUiMode('browse');
      alert(t('employeeType.saved'));
    } catch (e: any) {
      alert(e?.response?.data?.detail || e?.message || t('employeeType.saveError'));
    } finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!detail) return;
    if (!window.confirm(t('employeeType.confirmDelete'))) return;
    try {
      await apiClient.deleteMajorCode(detail.id);
      await fetchList();
      setSelectedId(null);
      setUiMode('browse');
      alert(t('employeeType.deleted'));
    } catch (e: any) {
      alert(e?.response?.data?.detail || e?.message || t('employeeType.deleteError'));
    }
  };
  const goNav = (idx: number) => { const r = sorted[idx]; if (!r) return; setSelectedId(r.id); setUiMode('browse'); };
  if (loading) return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-stretch min-h-0 h-[min(560px,calc(100vh-7.5rem))] overflow-hidden">
      <aside className="lg:col-span-4 flex flex-col min-h-0 bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="p-3 md:p-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('menu.majorCodeManage')}</p>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[11px] font-medium text-gray-600 whitespace-nowrap">{t('company.field.code')}</p>
            <select className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white" value={selectedCompanyId ?? ''} onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)}>
              {companyOptions.map((c) => <option key={c.id} value={c.id}>{pickCompanyLabel(c)}</option>)}
            </select>
          </div>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('employeeType.searchPlaceholder')} /></div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {sorted.length === 0 ? <p className="p-4 text-sm text-gray-500 text-center">{t('company.selectHint')}</p> : (
            <ul className="divide-y divide-gray-100">{sorted.map((r) => (
              <li key={r.id}><button type="button" onClick={() => setSelectedId(r.id)} className={cn('w-full text-left px-4 py-3 flex items-center gap-3 transition-colors', selectedId === r.id ? 'bg-primary-50 border-l-4 border-primary-600' : 'hover:bg-gray-50 border-l-4 border-transparent')}>
                <div className="mt-0.5 p-1.5 rounded-full bg-gray-100 text-gray-600"><FileEdit className="w-4 h-4" /></div>
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <p className="min-w-0 flex-1 font-medium text-gray-900 truncate">{pickMajorLabel(r)}</p>
                  <p className="shrink-0 whitespace-nowrap text-xs text-gray-500 font-mono">{r.major_code} · {r.code_definition_type}</p>
                </div>
              </button></li>
            ))}</ul>
          )}
        </div>
      </aside>
      <section className="lg:col-span-8 flex flex-col bg-white rounded-lg shadow border border-gray-200 min-h-0">
        <div className="px-3 md:px-4 pt-3 md:pt-4 shrink-0">
          <HrMasterToolbar mode={uiMode} listLength={sorted.length} selectedIndex={selectedIndex} saving={saving} allowAdd={selectedCompanyId != null} allowEdit={detail != null} allowDelete={detail != null && !isSystemDefinedDetail} allowSave={allowSave} onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete} onSave={() => void handleSave()} onCancel={handleCancel} onFirst={() => goNav(0)} onPrev={() => selectedIndex > 0 && goNav(selectedIndex - 1)} onNext={() => selectedIndex >= 0 && selectedIndex < sorted.length - 1 && goNav(selectedIndex + 1)} onLast={() => sorted.length > 0 && goNav(sorted.length - 1)} t={toolbarT} />
        </div>
        <div className="px-4 md:px-6 pt-2 md:pt-3 pb-0 border-b border-gray-100 shrink-0"><h2 className="text-lg font-bold text-gray-900">{t('menu.majorCodeManage')}</h2></div>
        <div className="flex-1 min-h-0 p-3 md:p-4 overflow-y-auto">
          {(uiMode === 'new' || detail) ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block text-[11px] font-medium text-gray-700">{t('employees.reference.field.code')}<input className={cn(inputCls, 'mt-0.5')} value={draft.major_code} disabled={uiMode !== 'new'} onChange={(e) => setDraft((d) => ({ ...d, major_code: e.target.value }))} /></label>
                <label className="block text-[11px] font-medium text-gray-700">코드정의 형태<select className={cn(inputCls, 'mt-0.5')} value={draft.code_definition_type} disabled={uiMode === 'browse' || (uiMode === 'edit' && isSystemDefinedDetail)} onChange={(e) => setDraft((d) => ({ ...d, code_definition_type: e.target.value === 'System Defined' ? 'System Defined' : 'User Defined' }))}><option value="User Defined">User Defined</option><option value="System Defined">System Defined</option></select></label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="block text-[11px] font-medium text-gray-700">{t('employees.reference.field.nameKor')}<input className={cn(inputCls, 'mt-0.5')} value={draft.name_kor} disabled={uiMode === 'browse'} onChange={(e) => setDraft((d) => ({ ...d, name_kor: e.target.value }))} /></label>
                <label className="block text-[11px] font-medium text-gray-700">{t('employees.reference.field.nameEng')}<input className={cn(inputCls, 'mt-0.5')} value={draft.name_eng} disabled={uiMode === 'browse'} onChange={(e) => setDraft((d) => ({ ...d, name_eng: e.target.value }))} /></label>
                <label className="block text-[11px] font-medium text-gray-700">{t('employees.reference.field.nameThai')}<input className={cn(inputCls, 'mt-0.5')} value={draft.name_thai} disabled={uiMode === 'browse'} onChange={(e) => setDraft((d) => ({ ...d, name_thai: e.target.value }))} /></label>
              </div>
              <label className="block text-[11px] font-medium text-gray-700">{t('company.field.additionalInfo')}<textarea className={cn(inputCls, 'mt-0.5 min-h-24')} value={draft.note} disabled={uiMode === 'browse'} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></label>
            </div>
          ) : <div className="flex items-center justify-center h-full text-sm text-gray-500">{t('company.selectHint')}</div>}
        </div>
      </section>
    </div>
  );
}

