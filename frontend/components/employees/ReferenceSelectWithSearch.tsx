'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';

export type RefOption = {
  id?: number;
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

export type ReferenceCrudFlags = {
  create: boolean;
  update: boolean;
  delete: boolean;
};

type Draft = {
  code: string;
  name_kor: string;
  name_eng: string;
  name_thai: string;
};

function emptyDraft(): Draft {
  return { code: '', name_kor: '', name_eng: '', name_thai: '' };
}

function parseDetail(e: unknown): string {
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

type Props = {
  value: string;
  onChange: (code: string) => void;
  options: RefOption[];
  disabled?: boolean;
  pickLabel: (o: RefOption) => string;
  t: (key: string) => string;
  dialogTitle: string;
  selectClassName?: string;
  referenceCategory?: string;
  companyId?: number | null;
  referenceCrud?: ReferenceCrudFlags;
  onReferenceDataChanged?: () => void | Promise<void>;
};

const baseSelectCls =
  'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm leading-tight bg-white disabled:bg-gray-100 disabled:text-gray-600';

const miniBtn =
  'text-[11px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none';

export default function ReferenceSelectWithSearch({
  value,
  onChange,
  options,
  disabled = false,
  pickLabel,
  t,
  dialogTitle,
  selectClassName,
  referenceCategory,
  companyId,
  referenceCrud,
  onReferenceDataChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [panel, setPanel] = useState<'none' | 'add' | 'edit'>('none');
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const hasCurrent = value ? options.some((o) => o.code === value) : false;

  const canCrud =
    Boolean(referenceCategory) &&
    companyId != null &&
    Number.isInteger(companyId) &&
    companyId > 0 &&
    Boolean(referenceCrud?.create || referenceCrud?.update || referenceCrud?.delete);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => {
      const label = pickLabel(o);
      return (
        o.code.toLowerCase().includes(s) ||
        label.toLowerCase().includes(s) ||
        (o.name_kor || '').toLowerCase().includes(s) ||
        (o.name_eng || '').toLowerCase().includes(s) ||
        (o.name_thai || '').toLowerCase().includes(s)
      );
    });
  }, [options, q, pickLabel]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setPanel('none');
      setDraft(emptyDraft());
      setEditingId(null);
      return;
    }
    const id = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const pick = useCallback(
    (code: string) => {
      onChange(code);
      close();
    },
    [onChange, close]
  );

  const beginAdd = useCallback(() => {
    setDraft(emptyDraft());
    setEditingId(null);
    setPanel('add');
  }, []);

  const beginEdit = useCallback((o: RefOption) => {
    if (o.id == null) return;
    setEditingId(o.id);
    setDraft({
      code: o.code,
      name_kor: o.name_kor ?? '',
      name_eng: o.name_eng ?? '',
      name_thai: o.name_thai ?? '',
    });
    setPanel('edit');
  }, []);

  const savePanel = useCallback(async () => {
    if (!referenceCategory || companyId == null || companyId <= 0) return;
    const code = draft.code.trim();
    if (panel === 'add' && !code) {
      alert(t('employees.reference.validationNew'));
      return;
    }
    setSaving(true);
    try {
      if (panel === 'add') {
        await apiClient.createEmployeeReferenceItem(referenceCategory, {
          company_id: companyId,
          code,
          name_kor: draft.name_kor.trim() || null,
          name_eng: draft.name_eng.trim() || null,
          name_thai: draft.name_thai.trim() || null,
        });
      } else if (panel === 'edit' && editingId != null) {
        await apiClient.updateEmployeeReferenceItem(referenceCategory, editingId, companyId, {
          name_kor: draft.name_kor.trim() || null,
          name_eng: draft.name_eng.trim() || null,
          name_thai: draft.name_thai.trim() || null,
        });
      }
      setPanel('none');
      setDraft(emptyDraft());
      setEditingId(null);
      await onReferenceDataChanged?.();
    } catch (e) {
      console.error(e);
      alert(parseDetail(e) || t('employees.general.refCrudSaveError'));
    } finally {
      setSaving(false);
    }
  }, [referenceCategory, companyId, draft, panel, editingId, onReferenceDataChanged, t]);

  const removeItem = useCallback(
    async (o: RefOption) => {
      if (!referenceCategory || companyId == null || o.id == null) return;
      if (!referenceCrud?.delete) return;
      if (!window.confirm(t('employees.general.refCrudDeleteConfirm'))) return;
      setSaving(true);
      try {
        await apiClient.deleteEmployeeReferenceItem(referenceCategory, o.id, companyId);
        if (value === o.code) onChange('');
        await onReferenceDataChanged?.();
      } catch (e) {
        console.error(e);
        const detail = parseDetail(e);
        alert(localizeReferenceDeleteDetail(detail, t) || t('employees.general.refCrudDeleteError'));
      } finally {
        setSaving(false);
      }
    },
    [referenceCategory, companyId, referenceCrud, value, onChange, onReferenceDataChanged, t]
  );

  const crudLocked = disabled || saving;

  return (
    <>
      <div className="flex gap-1 items-stretch min-w-0">
        <select
          className={cn(baseSelectCls, 'min-w-0 flex-1', selectClassName)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">{t('employees.general.selectPlaceholder')}</option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {pickLabel(o)}
            </option>
          ))}
          {value && !hasCurrent && <option value={value}>{value}</option>}
        </select>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={cn(
            'shrink-0 px-1.5 py-1 border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 hover:text-primary-600 disabled:opacity-50 disabled:pointer-events-none',
            'flex items-center justify-center'
          )}
          title={t('employees.general.refSearchOpen')}
          aria-label={t('employees.general.refSearchOpen')}
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-16 sm:pt-24 bg-black/40"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ref-search-dialog-title"
            className="w-full max-w-lg max-h-[min(85vh,600px)] flex flex-col bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
              <h2 id="ref-search-dialog-title" className="text-sm font-semibold text-gray-900 truncate">
                {dialogTitle}
              </h2>
              <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                {canCrud && referenceCrud?.create && (
                  <button
                    type="button"
                    disabled={crudLocked}
                    className={cn(miniBtn, 'inline-flex items-center gap-0.5')}
                    onClick={beginAdd}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('employees.general.refCrudAdd')}
                  </button>
                )}
                <button
                  type="button"
                  className={miniBtn}
                  onClick={close}
                >
                  {t('employees.general.refSearchClose')}
                </button>
              </div>
            </div>

            {canCrud && panel !== 'none' && (
              <div className="px-3 py-2 border-b border-gray-100 bg-slate-50 space-y-2">
                <p className="text-[11px] font-medium text-gray-600">
                  {panel === 'add' ? t('employees.general.refCrudAdd') : t('employees.general.refCrudEdit')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-[10px] text-gray-600 col-span-2 sm:col-span-1">
                    {t('employees.reference.field.code')}
                    <input
                      className={cn(baseSelectCls, 'mt-0.5')}
                      value={draft.code}
                      disabled={panel === 'edit' || crudLocked}
                      onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                    />
                  </label>
                  <label className="block text-[10px] text-gray-600 col-span-2 sm:col-span-1">
                    {t('employees.reference.field.nameKor')}
                    <input
                      className={cn(baseSelectCls, 'mt-0.5')}
                      value={draft.name_kor}
                      disabled={crudLocked}
                      onChange={(e) => setDraft((d) => ({ ...d, name_kor: e.target.value }))}
                    />
                  </label>
                  <label className="block text-[10px] text-gray-600">
                    {t('employees.reference.field.nameEng')}
                    <input
                      className={cn(baseSelectCls, 'mt-0.5')}
                      value={draft.name_eng}
                      disabled={crudLocked}
                      onChange={(e) => setDraft((d) => ({ ...d, name_eng: e.target.value }))}
                    />
                  </label>
                  <label className="block text-[10px] text-gray-600">
                    {t('employees.reference.field.nameThai')}
                    <input
                      className={cn(baseSelectCls, 'mt-0.5')}
                      value={draft.name_thai}
                      disabled={crudLocked}
                      onChange={(e) => setDraft((d) => ({ ...d, name_thai: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" className={miniBtn} disabled={crudLocked} onClick={() => setPanel('none')}>
                    {t('employees.general.refCrudCancel')}
                  </button>
                  <button
                    type="button"
                    className={cn(miniBtn, 'border-primary-300 text-primary-700')}
                    disabled={crudLocked}
                    onClick={() => void savePanel()}
                  >
                    {t('employees.general.refCrudSave')}
                  </button>
                </div>
              </div>
            )}

            <div className="px-3 py-2 border-b border-gray-100">
              <input
                ref={searchRef}
                type="search"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                placeholder={t('employees.general.refSearchPlaceholder')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100">
              <li>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                  onClick={() => pick('')}
                >
                  {t('employees.general.selectPlaceholder')}
                </button>
              </li>
              {filtered.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-gray-500">{t('employees.general.refSearchEmpty')}</li>
              ) : (
                filtered.map((o) => (
                  <li key={`${o.code}-${o.id ?? ''}`} className="flex items-stretch gap-0">
                    <button
                      type="button"
                      className={cn(
                        'flex-1 min-w-0 text-left px-3 py-2 text-sm hover:bg-primary-50',
                        value === o.code && 'bg-primary-50'
                      )}
                      onClick={() => pick(o.code)}
                    >
                      <span className="font-mono text-xs text-gray-500 block">{o.code}</span>
                      <span className="text-gray-900">{pickLabel(o)}</span>
                    </button>
                    {canCrud && (referenceCrud?.update || referenceCrud?.delete) && o.id != null && (
                      <div className="flex flex-col justify-center pr-1 py-1 gap-0.5 shrink-0 border-l border-gray-100">
                        {referenceCrud?.update && (
                          <button
                            type="button"
                            disabled={crudLocked}
                            className="p-1 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                            title={t('employees.general.refCrudEdit')}
                            aria-label={t('employees.general.refCrudEdit')}
                            onClick={(e) => {
                              e.preventDefault();
                              beginEdit(o);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {referenceCrud?.delete && (
                          <button
                            type="button"
                            disabled={crudLocked}
                            className="p-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-40"
                            title={t('employees.general.refCrudDelete')}
                            aria-label={t('employees.general.refCrudDelete')}
                            onClick={(e) => {
                              e.preventDefault();
                              void removeItem(o);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
