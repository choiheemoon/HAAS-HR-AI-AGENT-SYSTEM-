'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { apiClient, getEmployeePhotoThumbnailUrl } from '@/lib/api';
import { apiItemToSpecialOtRow, newSpecialOtRowTemplate, normalizeOtCell, type SpecialOtBufferRow } from '@/lib/specialOtModel';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';
import SpecialOtDataTable from '@/components/attendance/SpecialOtDataTable';

type EmpMini = {
  id: number;
  company_id?: number | null;
  employee_number: string;
  name: string;
  swipe_card?: string | null;
};

type RefItem = { code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null };
type RefByCompany = Record<number, Record<string, RefItem[]>>;

export default function SpecialOtModal({
  open,
  onClose,
  employee,
  inquiryDateFrom,
  inquiryDateTo,
  contextWorkDay,
  writeLocked = false,
  onRecordsChanged,
}: {
  open: boolean;
  onClose: () => void;
  employee: EmpMini | null;
  inquiryDateFrom: string;
  inquiryDateTo: string;
  contextWorkDay: string;
  writeLocked?: boolean;
  onRecordsChanged?: () => void;
}) {
  const { t, locale } = useI18n();
  const { can } = useMenuPermissions();
  const allowRead = can('attendance-additional-ot-manage', 'can_read');
  const allowSave = can('attendance-additional-ot-manage', 'can_update');
  const allowDelete = can('attendance-additional-ot-manage', 'can_delete');
  const allowCreate = can('attendance-additional-ot-manage', 'can_create');
  const canWrite = !writeLocked && (allowCreate || allowSave);
  const canDelete = !writeLocked && allowDelete;

  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [dateFrom, setDateFrom] = useState(inquiryDateFrom);
  const [dateTo, setDateTo] = useState(inquiryDateTo);
  const [serverRows, setServerRows] = useState<SpecialOtBufferRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1);
  const [mode, setMode] = useState<MasterUiMode>('browse');
  /** 상단 폼: 신규·수정 입력 (null이면 조회만) */
  const [formRow, setFormRow] = useState<SpecialOtBufferRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [masterBundle, setMasterBundle] = useState<Record<string, unknown> | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [refsByCompany, setRefsByCompany] = useState<RefByCompany>({});
  const [fetchError, setFetchError] = useState<string | null>(null);

  const selectedId = employee?.id ?? null;
  const editingForm = formRow != null;

  useEffect(() => {
    setPortalEl(typeof document !== 'undefined' ? document.body : null);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDateFrom((inquiryDateFrom || '').slice(0, 10));
    setDateTo((inquiryDateTo || '').slice(0, 10));
  }, [open, inquiryDateFrom, inquiryDateTo]);

  useEffect(() => {
    if (!open) {
      setFormRow(null);
      setMode('browse');
      setServerRows([]);
      setSelectedRowIndex(-1);
      setFetchError(null);
    }
  }, [open]);

  const pickRefItemLabel = useCallback(
    (it: RefItem) => {
      if (locale === 'ko') return it.name_kor || it.name_eng || it.name_thai || it.code;
      if (locale === 'en') return it.name_eng || it.name_kor || it.name_thai || it.code;
      return it.name_thai || it.name_kor || it.name_eng || it.code;
    },
    [locale]
  );

  const ensureRefs = useCallback(
    async (companyId: number) => {
      if (refsByCompany[companyId]) return;
      try {
        const cats = ['division', 'department', 'level', 'work_place', 'employment_type', 'employee_type'] as const;
        const vals = await Promise.all(cats.map((c) => apiClient.getEmployeeReferenceItems(c, companyId)));
        const next: Record<string, RefItem[]> = {};
        cats.forEach((c, i) => {
          next[c] = Array.isArray(vals[i].data) ? (vals[i].data as RefItem[]) : [];
        });
        setRefsByCompany((p) => ({ ...p, [companyId]: next }));
      } catch {
        /* noop */
      }
    },
    [refsByCompany]
  );

  useEffect(() => {
    if (!open || !employee?.company_id) return;
    void ensureRefs(employee.company_id);
  }, [open, employee?.company_id, ensureRefs]);

  const mapCode = useCallback(
    (cid: number | null | undefined, cat: string, code: string | null | undefined, fallback = '—') => {
      const raw = (code || '').trim();
      if (!raw) return fallback;
      const items = cid != null ? refsByCompany[cid]?.[cat] || [] : [];
      const hit = items.find((x) => x.code === raw);
      return hit ? pickRefItemLabel(hit) : raw;
    },
    [pickRefItemLabel, refsByCompany]
  );

  const invalidRange = (dateFrom || '').slice(0, 10) > (dateTo || '').slice(0, 10);

  const defaultDatesForNew = useMemo(() => {
    const ctx = (contextWorkDay || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ctx)) return { df: ctx, dt: ctx };
    const a = (dateFrom || '').slice(0, 10);
    const b = (dateTo || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) && a <= b) return { df: a, dt: b };
    if (/^\d{4}-\d{2}-\d{2}$/.test(b)) return { df: b, dt: b };
    return { df: a, dt: a };
  }, [contextWorkDay, dateFrom, dateTo]);

  const loadRows = useCallback(async () => {
    setFormRow(null);
    setMode('browse');
    if (selectedId == null) {
      setServerRows([]);
      setSelectedRowIndex(-1);
      return;
    }
    setRowsLoading(true);
    setFetchError(null);
    try {
      const { data } = await apiClient.getAttendanceSpecialOt({
        employee_id: selectedId,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      const items = ((data as { items?: Record<string, unknown>[] })?.items || []) as Record<string, unknown>[];
      const ec = employee?.employee_number ?? '';
      const rows = items.map((it) => apiItemToSpecialOtRow(it, ec));
      setServerRows(rows);
      setSelectedRowIndex(rows.length ? 0 : -1);
      setFetchError(null);
    } catch (e: unknown) {
      setServerRows([]);
      setSelectedRowIndex(-1);
      const ax = e as { response?: { data?: { detail?: unknown } } };
      const d = ax.response?.data?.detail;
      const msg =
        typeof d === 'string' ? d : Array.isArray(d) ? JSON.stringify(d) : t('specialOt.loadFailed');
      setFetchError(msg);
    } finally {
      setRowsLoading(false);
    }
  }, [selectedId, dateFrom, dateTo, employee?.employee_number, t]);

  useEffect(() => {
    if (!open || selectedId == null) return;
    void loadRows();
  }, [open, selectedId, loadRows]);

  useEffect(() => {
    if (!open || selectedId == null) {
      setMasterBundle(null);
      return;
    }
    let cancel = false;
    setMasterLoading(true);
    void apiClient
      .getEmployeeAttendanceMaster(selectedId)
      .then(({ data }) => {
        if (!cancel) setMasterBundle((data as Record<string, unknown>) || null);
      })
      .catch(() => !cancel && setMasterBundle(null))
      .finally(() => !cancel && setMasterLoading(false));
    return () => {
      cancel = true;
    };
  }, [open, selectedId]);

  const headerEmployee = (masterBundle?.employee as Record<string, unknown> | undefined) || null;
  const headerBasic = (masterBundle?.basic as Record<string, unknown> | undefined) || null;
  const headerDivision = employee ? mapCode(employee.company_id ?? null, 'division', String(headerEmployee?.division || ''), '—') : '—';
  const headerDept = employee ? mapCode(employee.company_id ?? null, 'department', String(headerEmployee?.department || ''), '—') : '—';
  const headerLevel = employee ? mapCode(employee.company_id ?? null, 'level', String(headerEmployee?.job_level || ''), '—') : '—';
  const headerWork = employee ? mapCode(employee.company_id ?? null, 'work_place', String(headerEmployee?.work_place || ''), '—') : '—';
  const headerHireDate = employee ? String(headerEmployee?.hire_date || '').slice(0, 10) || '—' : '—';
  const headerEmploymentType = employee
    ? mapCode(employee.company_id ?? null, 'employment_type', String(headerEmployee?.employment_type || ''), '—')
    : '—';
  const headerSalaryType = employee
    ? mapCode(employee.company_id ?? null, 'employee_type', String(headerEmployee?.salary_process_type || ''), '—')
    : '—';
  const headerWorkCalendar = employee ? String(headerBasic?.master_shiftwork ?? '').trim() || '—' : '—';

  useEffect(() => {
    const len = serverRows.length;
    if (len === 0) {
      setSelectedRowIndex(-1);
      return;
    }
    setSelectedRowIndex((idx) => {
      if (idx >= 0 && idx < len) return idx;
      return 0;
    });
  }, [serverRows.length, selectedId]);

  const patchForm = (patch: Partial<SpecialOtBufferRow>) => {
    setFormRow((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const validateOtCell = (label: string, v: string): boolean => {
    const s = v.trim();
    if (!s) return true;
    const n = normalizeOtCell(s);
    if (!/^\d{2}:\d{2}$/.test(n)) {
      alert(`${t('specialOt.invalidOtTime')} (${label})`);
      return false;
    }
    return true;
  };

  const onAdd = () => {
    if (selectedId == null || invalidRange) return;
    const { df, dt } = defaultDatesForNew;
    setFormRow(newSpecialOtRowTemplate(df, dt));
    setMode('edit');
  };

  const onEdit = () => {
    if (serverRows.length === 0 || selectedRowIndex < 0 || selectedRowIndex >= serverRows.length) return;
    const src = serverRows[selectedRowIndex];
    setFormRow({ ...src });
    setMode('edit');
  };

  const onCancel = () => {
    setFormRow(null);
    setMode('browse');
  };

  const onSave = async () => {
    if (!formRow || selectedId == null) return;
    const r = formRow;
    const df = (r.date_from || '').trim().slice(0, 10);
    const dt = (r.date_to || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(df) || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
      alert(t('specialOt.invalidDateRange'));
      return;
    }
    if (df > dt) {
      alert(t('specialOt.dateOrder'));
      return;
    }
    const otFields: [string, string][] = [
      [t('specialOt.col.ot1'), r.ot_1],
      [t('specialOt.col.ot15'), r.ot_1_5],
      [t('specialOt.col.ot2'), r.ot_2],
      [t('specialOt.col.ot25'), r.ot_2_5],
      [t('specialOt.col.ot3'), r.ot_3],
      [t('specialOt.col.ot6'), r.ot_6],
    ];
    for (const [lab, val] of otFields) {
      if (!validateOtCell(lab, val)) return;
    }

    const body = {
      date_from: r.date_from,
      date_to: r.date_to,
      ot_1: normalizeOtCell(r.ot_1) || '',
      ot_1_5: normalizeOtCell(r.ot_1_5) || '',
      ot_2: normalizeOtCell(r.ot_2) || '',
      ot_2_5: normalizeOtCell(r.ot_2_5) || '',
      ot_3: normalizeOtCell(r.ot_3) || '',
      ot_6: normalizeOtCell(r.ot_6) || '',
      shift_slot: r.shift_slot,
      shift_text: r.shift_text,
      food: r.food,
      special: r.special,
      note: r.note || null,
      status: r.status,
    };

    setSaving(true);
    try {
      if (!r.id) {
        await apiClient.createAttendanceSpecialOt(selectedId, body);
      } else {
        await apiClient.updateAttendanceSpecialOt(r.id, body);
      }
      await loadRows();
      onRecordsChanged?.();
      alert(t('attendanceInquiry.saved'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof msg === 'string' ? msg : t('attendanceInquiry.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (selectedRowIndex < 0 || serverRows.length === 0) return;
    const row = serverRows[selectedRowIndex];
    if (!row?.id) return;
    if (!confirm(t('additionalOt.confirmDelete'))) return;
    setSaving(true);
    try {
      await apiClient.deleteAttendanceSpecialOt(row.id);
      if (formRow?.id === row.id) {
        setFormRow(null);
        setMode('browse');
      }
      await loadRows();
      onRecordsChanged?.();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof msg === 'string' ? msg : t('attendanceInquiry.deleteError'));
    } finally {
      setSaving(false);
    }
  };

  const goFirstRecord = () => {
    if (serverRows.length === 0) return;
    setSelectedRowIndex(0);
  };
  const goPrevRecord = () => {
    if (selectedRowIndex <= 0) return;
    setSelectedRowIndex(selectedRowIndex - 1);
  };
  const goNextRecord = () => {
    if (selectedRowIndex < 0 || selectedRowIndex >= serverRows.length - 1) return;
    setSelectedRowIndex(selectedRowIndex + 1);
  };
  const goLastRecord = () => {
    if (serverRows.length === 0) return;
    setSelectedRowIndex(serverRows.length - 1);
  };

  const requestClose = () => {
    if (editingForm) {
      if (!confirm(t('additionalOt.modalDiscardEdits'))) return;
      onCancel();
    }
    onClose();
  };

  const inputCls =
    'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm bg-white disabled:bg-gray-100 disabled:text-gray-600';
  const otInputCls =
    'w-full border border-gray-300 rounded px-1.5 py-1 text-center text-xs font-mono tabular-nums bg-white';

  if (!open || !portalEl || !allowRead || !employee) return null;

  const dateInputsLocked = rowsLoading || editingForm;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="special-ot-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-sky-200 w-full max-w-6xl h-[min(86vh,46rem)] max-h-[86vh] flex flex-col min-h-0 mx-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 px-2.5 py-1.5 border-b border-gray-200 bg-gradient-to-r from-sky-50 to-white shrink-0">
          <h2 id="special-ot-title" className="text-sm font-bold text-sky-950 pr-2">
            {t('specialOt.title')}
          </h2>
          <button
            type="button"
            onClick={() => requestClose()}
            className="shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col gap-1.5">
          <HrMasterToolbar
            mode={mode}
            listLength={serverRows.length}
            selectedIndex={selectedRowIndex}
            saving={saving}
            allowAdd={canWrite}
            allowEdit={canWrite}
            allowDelete={canDelete}
            allowSave={canWrite}
            editExtraDisabled={serverRows.length === 0}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
            onSave={onSave}
            onCancel={onCancel}
            onFirst={goFirstRecord}
            onPrev={goPrevRecord}
            onNext={goNextRecord}
            onLast={goLastRecord}
            t={t}
          />
          {writeLocked ? (
            <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-900 shrink-0">
              {t('attendanceStatusInquiry.payrollClosedBlocked')}
            </div>
          ) : null}
          {fetchError ? (
            <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-900 whitespace-pre-wrap shrink-0 max-h-24 overflow-y-auto">
              {fetchError}
              <div className="mt-1 text-[10px] text-red-800">{t('specialOt.backendDeployHint')}</div>
            </div>
          ) : null}
          {saving && (
            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 shrink-0">
              {t('employees.personnelRecord.saving', '저장 중...')}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-x-2 gap-y-1 border border-gray-200 rounded-md bg-white/90 p-1.5 shrink-0">
            <img src={getEmployeePhotoThumbnailUrl(employee.id)} alt="" className="w-9 h-9 rounded border object-cover shrink-0" />
            <div className="min-w-0 flex-1 basis-[14rem]">
              <span className="text-[10px] text-gray-500 block leading-none mb-0.5">{t('attendanceInquiry.selectedEmployee')}</span>
              <div className="text-[11px] font-medium text-gray-900 leading-tight truncate" title={`${employee.employee_number} · ${employee.name}`}>
                {`${employee.employee_number} · ${employee.name} · ${employee.swipe_card || '-'} · ${employee.id}`}
              </div>
            </div>
            <label className="text-[10px] text-gray-600 shrink-0 flex flex-col gap-0.5">
              <span>{t('attendanceInquiry.dateFrom')}</span>
              <input
                type="date"
                className={cn(inputCls, 'py-0.5 min-w-[8.5rem]')}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={dateInputsLocked}
              />
            </label>
            <label className="text-[10px] text-gray-600 shrink-0 flex flex-col gap-0.5">
              <span>{t('attendanceInquiry.dateTo')}</span>
              <input
                type="date"
                className={cn(inputCls, 'py-0.5 min-w-[8.5rem]')}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={dateInputsLocked}
              />
            </label>
            <button
              type="button"
              className="text-[11px] px-2 py-1 border border-sky-300 rounded-md bg-sky-50 text-sky-900 font-medium hover:bg-sky-100 shrink-0"
              disabled={rowsLoading || editingForm}
              onClick={() => void loadRows()}
            >
              {t('attendanceInquiry.reload')}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-2 gap-y-0.5 text-[10px] leading-tight border border-dashed rounded px-1.5 py-1 bg-gray-50 shrink-0">
            <div className="truncate" title={`${t('attendanceMaster.division')}: ${headerDivision}`}>
              <span className="text-gray-500">{t('attendanceMaster.division')}</span>
              <div className="font-medium truncate">{masterLoading ? '…' : headerDivision}</div>
            </div>
            <div className="truncate" title={`${t('attendanceMaster.department')}: ${headerDept}`}>
              <span className="text-gray-500">{t('attendanceMaster.department')}</span>
              <div className="font-medium truncate">{masterLoading ? '…' : headerDept}</div>
            </div>
            <div className="truncate">
              <span className="text-gray-500">{t('attendanceMaster.level')}</span>
              <div className="font-medium truncate">{masterLoading ? '…' : headerLevel}</div>
            </div>
            <div className="truncate">
              <span className="text-gray-500">{t('attendanceMaster.workPlace')}</span>
              <div className="font-medium truncate">{masterLoading ? '…' : headerWork}</div>
            </div>
            <div className="truncate">
              <span className="text-gray-500">{t('attendanceMaster.hireDate')}</span>
              <div className="font-medium truncate">{masterLoading ? '…' : headerHireDate}</div>
            </div>
            <div className="truncate">
              <span className="text-gray-500">{t('attendanceMaster.employmentType')}</span>
              <div className="font-medium truncate">{masterLoading ? '…' : headerEmploymentType}</div>
            </div>
            <div className="truncate">
              <span className="text-gray-500">{t('attendanceMaster.salaryProcessType')}</span>
              <div className="font-medium truncate">{masterLoading ? '…' : headerSalaryType}</div>
            </div>
            <div className="truncate">
              <span className="text-gray-500">{t('attendanceMaster.masterShiftwork')}</span>
              <div className="font-medium truncate">{masterLoading ? '…' : headerWorkCalendar}</div>
            </div>
          </div>

          {formRow ? (
            <div className="rounded-md border border-sky-200 bg-sky-50/60 p-1.5 space-y-1.5 shrink-0">
              <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
                <span className="text-[11px] font-semibold text-sky-950 w-full sm:w-auto">{t('specialOt.inputSection')}</span>
                <span className="text-[10px] text-gray-500 hidden sm:inline">· HH:mm</span>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[10px] text-gray-700">
                  <span className="block leading-none mb-0.5">{t('specialOt.dateFrom')}</span>
                  <input type="date" className={cn(inputCls, 'py-0.5')} value={formRow.date_from} onChange={(e) => patchForm({ date_from: e.target.value })} />
                </label>
                <label className="text-[10px] text-gray-700">
                  <span className="block leading-none mb-0.5">{t('specialOt.dateTo')}</span>
                  <input type="date" className={cn(inputCls, 'py-0.5')} value={formRow.date_to} onChange={(e) => patchForm({ date_to: e.target.value })} />
                </label>
                <div className="flex flex-wrap items-center gap-2 text-[10px] border-l border-sky-200 pl-2 ml-0 sm:ml-1">
                  <span className="text-gray-600 shrink-0">{t('specialOt.col.shiftRadio')}</span>
                  <label className="inline-flex items-center gap-0.5 cursor-pointer">
                    <input type="radio" name="special-ot-form-shift" checked={formRow.shift_slot === 1} onChange={() => patchForm({ shift_slot: 1 })} />
                    <span>{t('specialOt.shift1')}</span>
                  </label>
                  <label className="inline-flex items-center gap-0.5 cursor-pointer">
                    <input type="radio" name="special-ot-form-shift" checked={formRow.shift_slot === 2} onChange={() => patchForm({ shift_slot: 2 })} />
                    <span>{t('specialOt.shift2')}</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                {(
                  [
                    ['ot_1', t('specialOt.col.ot1')],
                    ['ot_1_5', t('specialOt.col.ot15')],
                    ['ot_2', t('specialOt.col.ot2')],
                    ['ot_2_5', t('specialOt.col.ot25')],
                    ['ot_3', t('specialOt.col.ot3')],
                    ['ot_6', t('specialOt.col.ot6')],
                  ] as const
                ).map(([key, lab]) => (
                  <label key={key} className="text-[10px] text-gray-700 min-w-0">
                    <span className="block leading-none mb-0.5 truncate" title={lab}>
                      {lab}
                    </span>
                    <input
                      type="text"
                      className={cn(otInputCls, 'py-0.5')}
                      value={formRow[key]}
                      onChange={(e) => patchForm({ [key]: e.target.value } as Partial<SpecialOtBufferRow>)}
                      onBlur={() => {
                        const v = normalizeOtCell(formRow[key]);
                        if (v || String(formRow[key]).trim() === '') patchForm({ [key]: v } as Partial<SpecialOtBufferRow>);
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-1">
                <label className="text-[10px] text-gray-700 sm:col-span-2 min-w-0">
                  <span className="block leading-none mb-0.5">{t('specialOt.col.shiftText')}</span>
                  <input type="text" className={cn(inputCls, 'py-0.5')} value={formRow.shift_text} onChange={(e) => patchForm({ shift_text: e.target.value })} />
                </label>
                <label className="text-[10px] text-gray-700 min-w-0">
                  <span className="block leading-none mb-0.5">{t('specialOt.col.food')}</span>
                  <input type="text" className={cn(inputCls, 'py-0.5')} value={formRow.food} onChange={(e) => patchForm({ food: e.target.value })} />
                </label>
                <label className="text-[10px] text-gray-700 min-w-0">
                  <span className="block leading-none mb-0.5">{t('specialOt.col.special')}</span>
                  <input type="text" className={cn(inputCls, 'py-0.5')} value={formRow.special} onChange={(e) => patchForm({ special: e.target.value })} />
                </label>
                <label className="text-[10px] text-gray-700 min-w-0">
                  <span className="block leading-none mb-0.5">{t('specialOt.col.status')}</span>
                  <input type="text" className={cn(inputCls, 'py-0.5')} value={formRow.status} onChange={(e) => patchForm({ status: e.target.value })} />
                </label>
                <label className="text-[10px] text-gray-700 sm:col-span-2 min-w-0">
                  <span className="block leading-none mb-0.5">{t('specialOt.col.note')}</span>
                  <input type="text" className={cn(inputCls, 'py-0.5')} value={formRow.note} onChange={(e) => patchForm({ note: e.target.value })} />
                </label>
              </div>
            </div>
          ) : null}

          <p className="text-[10px] text-gray-500 px-0.5 leading-snug shrink-0 line-clamp-2">{t('specialOt.viewOnlyHint')}</p>

          {invalidRange ? (
            <p className="text-xs text-amber-800 py-4 text-center border border-amber-200 rounded-md bg-amber-50 shrink-0">
              {t('attendanceInquiry.invalidRange')}
            </p>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-0.5 pt-0.5 border-t border-gray-100">
              <div className="text-[11px] font-medium text-gray-700 shrink-0">{t('specialOt.listSection')}</div>
              <SpecialOtDataTable
                t={t}
                empCode={employee.employee_number}
                displayRows={serverRows}
                selectedRowIndex={selectedRowIndex}
                setSelectedRowIndex={setSelectedRowIndex}
                rowsLoading={rowsLoading}
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    portalEl
  );
}

