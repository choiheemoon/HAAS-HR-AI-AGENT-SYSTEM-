'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';

export type MinorCodeDefinitionType = 'User Defined' | 'System Defined';

export type MinorOption = {
  id: number;
  minor_code: string;
  code_definition_type: MinorCodeDefinitionType;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
  note?: string | null;
};

type ReferenceCrudFlags = {
  create: boolean;
  update: boolean;
  delete: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  locale: string;
  companyId: number | null;
  majorId: number | null;
  options: MinorOption[];
  referenceCrud: ReferenceCrudFlags;
  onRefresh: () => Promise<void> | void;
  onPick: (o: MinorOption) => void;
  onClear: () => void;
};

const baseInputCls =
  'w-full border border-gray-300 rounded px-2 py-1 text-xs sm:text-sm disabled:bg-gray-100 disabled:text-gray-600';
const baseSelectCls =
  'w-full border border-gray-300 rounded px-2 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100 disabled:text-gray-600';
const miniBtn =
  'text-[11px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none';

function pickMinorLabel(locale: string, o: MinorOption) {
  if (locale === 'ko') return o.name_kor || o.name_eng || o.name_thai || o.minor_code;
  if (locale === 'en') return o.name_eng || o.name_kor || o.name_thai || o.minor_code;
  return o.name_thai || o.name_kor || o.name_eng || o.minor_code;
}

export default function MinorCodeSearchCrudModal({
  open,
  onClose,
  title,
  locale,
  companyId,
  majorId,
  options,
  referenceCrud,
  onRefresh,
  onPick,
  onClear,
}: Props) {
  const [q, setQ] = useState('');
  const [panel, setPanel] = useState<'none' | 'add' | 'edit'>('none');
  const [editingId, setEditingId] = useState<number | null>(null);

  const [draft, setDraft] = useState<{
    minor_code: string;
    code_definition_type: MinorCodeDefinitionType;
    name_kor: string;
    name_eng: string;
    name_thai: string;
    note: string;
  }>({
    minor_code: '',
    code_definition_type: 'User Defined',
    name_kor: '',
    name_eng: '',
    name_thai: '',
    note: '',
  });

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQ('');
      setPanel('none');
      setEditingId(null);
      setDraft({
        minor_code: '',
        code_definition_type: 'User Defined',
        name_kor: '',
        name_eng: '',
        name_thai: '',
        note: '',
      });
      return;
    }
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  const canCrud =
    companyId != null &&
    majorId != null &&
    Number.isInteger(companyId) &&
    companyId > 0 &&
    Number.isInteger(majorId) &&
    majorId > 0 &&
    (referenceCrud.create || referenceCrud.update || referenceCrud.delete);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => {
      const label = pickMinorLabel(locale, o).toLowerCase();
      return (
        o.minor_code.toLowerCase().includes(s) ||
        label.includes(s) ||
        (o.name_kor || '').toLowerCase().includes(s) ||
        (o.name_eng || '').toLowerCase().includes(s) ||
        (o.name_thai || '').toLowerCase().includes(s)
      );
    });
  }, [options, q, locale]);

  const pick = (o: MinorOption) => {
    onPick(o);
    onClose();
  };

  const beginAdd = () => {
    if (!canCrud || !referenceCrud.create) return;
    setDraft({
      minor_code: '',
      code_definition_type: 'User Defined',
      name_kor: '',
      name_eng: '',
      name_thai: '',
      note: '',
    });
    setEditingId(null);
    setPanel('add');
  };

  const beginEdit = (o: MinorOption) => {
    if (!canCrud || !referenceCrud.update) return;
    setEditingId(o.id);
    setDraft({
      minor_code: o.minor_code,
      code_definition_type: o.code_definition_type,
      name_kor: o.name_kor ?? '',
      name_eng: o.name_eng ?? '',
      name_thai: o.name_thai ?? '',
      note: o.note ?? '',
    });
    setPanel('edit');
  };

  const savePanel = async () => {
    if (!canCrud || companyId == null || majorId == null) return;
    const minorCode = draft.minor_code.trim();

    try {
      if (panel === 'add') {
        if (!referenceCrud.create) return;
        if (!minorCode) return alert('Minor 코드는 필수입니다.');
        await apiClient.createMinorCode({
          company_id: companyId,
          major_code_id: majorId,
          minor_code: minorCode,
          code_definition_type: draft.code_definition_type,
          name_kor: draft.name_kor.trim() || null,
          name_eng: draft.name_eng.trim() || null,
          name_thai: draft.name_thai.trim() || null,
          note: draft.note.trim() || null,
        });
      } else if (panel === 'edit' && editingId != null) {
        if (!referenceCrud.update) return;
        // minor_code 자체 변경은 API/서비스 정책상 막혀있을 수 있어 edit 시에는 code_definition/name/note만 수정
        await apiClient.updateMinorCode(editingId, {
          code_definition_type: draft.code_definition_type,
          name_kor: draft.name_kor.trim() || null,
          name_eng: draft.name_eng.trim() || null,
          name_thai: draft.name_thai.trim() || null,
          note: draft.note.trim() || null,
        });
      } else {
        return;
      }

      await onRefresh();
      setPanel('none');
      setEditingId(null);
    } catch (e: any) {
      alert(String(e?.response?.data?.detail || e?.message || 'Minor 코드 저장 실패'));
    }
  };

  const remove = async (o: MinorOption) => {
    if (!canCrud || !referenceCrud.delete) return;
    // 시스템 정의 코드는 백엔드에서도 삭제가 막혀있습니다. 클릭은 가능하지만 안내 후 중단합니다.
    if (o.code_definition_type === 'System Defined') {
      alert('System Defined 코드는 삭제할 수 없습니다.');
      return;
    }
    if (!window.confirm('해당 Minor 코드를 삭제할까요?')) return;
    try {
      await apiClient.deleteMinorCode(o.id);
      await onRefresh();
      // 선택 중이면 panel을 종료
      setPanel('none');
      setEditingId(null);
    } catch (e: any) {
      alert(String(e?.response?.data?.detail || e?.message || 'Minor 코드 삭제 실패'));
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-16 sm:pt-24 bg-black/40"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="minor-code-search-dialog-title"
        className="w-full max-w-lg max-h-[min(85vh,600px)] flex flex-col bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
          <h2
            id="minor-code-search-dialog-title"
            className="text-sm font-semibold text-gray-900 truncate"
          >
            {title}
          </h2>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {canCrud && referenceCrud.create && panel === 'none' && (
              <button
                type="button"
                className={cn(miniBtn, 'inline-flex items-center gap-1')}
                onClick={beginAdd}
              >
                <Plus className="w-3.5 h-3.5" />
                추가
              </button>
            )}
            <button type="button" className={miniBtn} onClick={onClose}>
              닫기
            </button>
          </div>
        </div>

        {canCrud && panel !== 'none' && (
          <div className="px-3 py-2 border-b border-gray-100 bg-slate-50 space-y-2">
            <p className="text-[11px] font-medium text-gray-600">
              {panel === 'add' ? 'Minor 코드 추가' : 'Minor 코드 수정'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block text-[10px] text-gray-600">
                Minor코드
                <input
                  className={cn(baseInputCls, 'mt-0.5')}
                  value={draft.minor_code}
                  disabled={panel === 'edit'}
                  onChange={(e) => setDraft((d) => ({ ...d, minor_code: e.target.value }))}
                />
              </label>
              <label className="block text-[10px] text-gray-600">
                정의유형
                <select
                  className={cn(baseSelectCls, 'mt-0.5')}
                  value={draft.code_definition_type}
                  disabled={panel === 'edit' && draft.code_definition_type === 'System Defined'}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      code_definition_type: e.target.value as MinorCodeDefinitionType,
                    }))
                  }
                >
                  <option value="User Defined">User Defined</option>
                  <option value="System Defined">System Defined</option>
                </select>
              </label>
              <label className="block text-[10px] text-gray-600">
                이름(KO)
                <input
                  className={cn(baseInputCls, 'mt-0.5')}
                  value={draft.name_kor}
                  onChange={(e) => setDraft((d) => ({ ...d, name_kor: e.target.value }))}
                />
              </label>
              <label className="block text-[10px] text-gray-600">
                이름(EN)
                <input
                  className={cn(baseInputCls, 'mt-0.5')}
                  value={draft.name_eng}
                  onChange={(e) => setDraft((d) => ({ ...d, name_eng: e.target.value }))}
                />
              </label>
              <label className="block text-[10px] text-gray-600 sm:col-span-2">
                이름(TH)
                <input
                  className={cn(baseInputCls, 'mt-0.5')}
                  value={draft.name_thai}
                  onChange={(e) => setDraft((d) => ({ ...d, name_thai: e.target.value }))}
                />
              </label>
              <label className="block text-[10px] text-gray-600 sm:col-span-2">
                비고
                <input
                  className={cn(baseInputCls, 'mt-0.5')}
                  value={draft.note}
                  onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" className={miniBtn} onClick={() => setPanel('none')}>
                취소
              </button>
              <button
                type="button"
                className={cn(miniBtn, 'border-primary-300 text-primary-700')}
                onClick={() => void savePanel()}
              >
                저장
              </button>
            </div>
          </div>
        )}

        <div className="px-3 py-2 border-b border-gray-100">
          <input
            ref={searchRef}
            type="search"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="검색..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100">
          <li>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              없음
            </button>
          </li>
          {filtered.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-gray-500">검색 결과 없음</li>
          ) : (
            filtered.map((o) => (
              <li key={o.id} className="flex items-stretch gap-0">
                <button
                  type="button"
                  className={cn(
                    'flex-1 min-w-0 text-left px-3 py-2 text-sm hover:bg-primary-50',
                  )}
                  onClick={() => pick(o)}
                >
                  <div className="font-mono text-xs text-gray-500 block">{o.minor_code}</div>
                  <div className="text-gray-900">{pickMinorLabel(locale, o)}</div>
                </button>
                <div className="flex flex-col justify-center pr-1 py-1 gap-0.5 shrink-0 border-l border-gray-100">
                  {canCrud && referenceCrud.update && o.id != null && (
                    <button
                      type="button"
                      className="p-1 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                      title="수정"
                      onClick={(e) => {
                        e.preventDefault();
                        beginEdit(o);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canCrud && referenceCrud.delete && o.id != null && (
                    <button
                      type="button"
                      className="p-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-40"
                      title="삭제"
                      onClick={(e) => {
                        e.preventDefault();
                        void remove(o);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

