'use client';

import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  ChevronFirst,
  ChevronLeft,
  ChevronRight,
  ChevronLast,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type MasterUiMode = 'browse' | 'edit' | 'new';

interface HrMasterToolbarProps {
  mode: MasterUiMode;
  listLength: number;
  selectedIndex: number;
  saving: boolean;
  /** 미지정 시 true (권한 연동 전·조회 전용 화면 호환) */
  allowAdd?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
  allowSave?: boolean;
  /** 추가 비활성 조건 (예: 목록 행 미선택) */
  editExtraDisabled?: boolean;
  deleteExtraDisabled?: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  t: (key: string) => string;
  className?: string;
}

function ToolBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center min-w-[44px] px-1.5 py-1 rounded-md border border-transparent transition-colors',
        'hover:bg-gray-100 disabled:opacity-35 disabled:pointer-events-none',
        variant === 'danger' && 'text-red-600 hover:bg-red-50'
      )}
    >
      <Icon className="w-4 h-4 mb-0.5" />
      <span className="text-[10px] sm:text-xs font-medium leading-tight text-center">{label}</span>
    </button>
  );
}

export default function HrMasterToolbar({
  mode,
  listLength,
  selectedIndex,
  saving,
  allowAdd = true,
  allowEdit = true,
  allowDelete = true,
  allowSave = true,
  editExtraDisabled = false,
  deleteExtraDisabled = false,
  onAdd,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onFirst,
  onPrev,
  onNext,
  onLast,
  t,
  className,
}: HrMasterToolbarProps) {
  const browse = mode === 'browse';
  const editing = mode === 'edit' || mode === 'new';
  const hasSelection = selectedIndex >= 0;
  const navOk = browse && listLength > 0 && hasSelection;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 p-1.5 sm:p-2 bg-gradient-to-b from-slate-100 to-slate-50 border border-slate-200 rounded-md shadow-sm',
        className
      )}
    >
      <ToolBtn
        icon={Plus}
        label={t('employees.toolbar.add')}
        onClick={onAdd}
        disabled={saving || !allowAdd}
      />
      <ToolBtn
        icon={Pencil}
        label={t('employees.toolbar.edit')}
        onClick={onEdit}
        disabled={saving || !browse || !hasSelection || !allowEdit || editExtraDisabled}
      />
      <ToolBtn
        icon={Trash2}
        label={t('employees.toolbar.delete')}
        onClick={onDelete}
        disabled={saving || !browse || !hasSelection || !allowDelete || deleteExtraDisabled}
        variant="danger"
      />
      <div className="w-px h-6 bg-slate-300 mx-0.5 hidden sm:block" aria-hidden />
      <ToolBtn
        icon={Save}
        label={t('employees.toolbar.save')}
        onClick={onSave}
        disabled={saving || !editing || !allowSave}
      />
      <ToolBtn
        icon={X}
        label={t('employees.toolbar.cancel')}
        onClick={onCancel}
        disabled={saving || !editing}
        variant="danger"
      />
      <div className="w-px h-6 bg-slate-300 mx-0.5 hidden sm:block" aria-hidden />
      <ToolBtn
        icon={ChevronFirst}
        label={t('employees.toolbar.first')}
        onClick={onFirst}
        disabled={saving || !navOk || selectedIndex <= 0}
      />
      <ToolBtn
        icon={ChevronLeft}
        label={t('employees.toolbar.prev')}
        onClick={onPrev}
        disabled={saving || !navOk || selectedIndex <= 0}
      />
      <ToolBtn
        icon={ChevronRight}
        label={t('employees.toolbar.next')}
        onClick={onNext}
        disabled={saving || !navOk || selectedIndex < 0 || selectedIndex >= listLength - 1}
      />
      <ToolBtn
        icon={ChevronLast}
        label={t('employees.toolbar.last')}
        onClick={onLast}
        disabled={saving || !navOk || selectedIndex < 0 || selectedIndex >= listLength - 1}
      />
    </div>
  );
}
