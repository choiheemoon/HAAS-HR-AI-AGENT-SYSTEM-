'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import AttendanceLeaveEmployeeWorkarea, {
  type LeavePanelEmployee,
} from '@/components/attendance/AttendanceLeaveEmployeeWorkarea';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';

export default function AttendanceLeaveRecordsModal({
  open,
  onClose,
  employee,
  contextWorkDay,
  writeLocked = false,
  onLeavesChanged,
}: {
  open: boolean;
  onClose: () => void;
  employee: LeavePanelEmployee | null;
  /** 우클릭한 근무일 — 신규 휴가 기본 시작·종료일 */
  contextWorkDay: string;
  writeLocked?: boolean;
  onLeavesChanged?: () => void;
}) {
  const { t } = useI18n();
  const { can } = useMenuPermissions();
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  const allowRead = can('attendance-leave-manage', 'can_read');
  const allowCreate = can('attendance-leave-manage', 'can_create');
  const allowSave = can('attendance-leave-manage', 'can_update');
  const allowDelete = can('attendance-leave-manage', 'can_delete');

  useEffect(() => {
    setPortalEl(typeof document !== 'undefined' ? document.body : null);
  }, []);

  if (!open || !portalEl || !employee) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-records-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-sky-200 w-full max-w-4xl h-[min(92vh,56rem)] max-h-[92vh] flex flex-col min-h-0 mx-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-gradient-to-r from-sky-50 to-white shrink-0">
          <h2 id="leave-records-modal-title" className="text-sm sm:text-base font-bold text-sky-950 pr-2">
            {t('attendanceStatusInquiry.leaveRecordsModalTitle')}
          </h2>
          <button
            type="button"
            className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
            aria-label={t('attendanceStatusInquiry.addTime.close')}
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden p-2 sm:p-3">
          {!allowRead ? (
            <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">{t('permission.noAccess')}</div>
          ) : (
            <AttendanceLeaveEmployeeWorkarea
              key={`${employee.id}-${contextWorkDay}`}
              employee={employee}
              allowRead={allowRead}
              allowCreate={!writeLocked && allowCreate}
              allowSave={!writeLocked && allowSave}
              allowDelete={!writeLocked && allowDelete}
              contextWorkDay={contextWorkDay}
              onLeavesSaved={onLeavesChanged}
              className="rounded-lg border border-gray-100 h-full"
            />
          )}
        </div>
      </div>
    </div>,
    portalEl
  );
}
