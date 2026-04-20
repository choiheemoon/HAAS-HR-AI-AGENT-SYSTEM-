'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient, getEmployeePhotoImageUrl } from '@/lib/api';
import {
  AnnualLeaveBalance,
  AttendanceLeaveLevelApi,
  clone,
  emptyDraft,
  extractQuotaRowsFromLeaveLevels,
  FALLBACK_PURPOSE_OPTIONS,
  formatHistoryTimeCell,
  formatLeaveTimeDigits,
  formatLeaveTypeLabel,
  HeaderRefByCategory,
  hhMmToLeaveDigits,
  inclusiveLeaveDaysBetween,
  isDateRangeOverlapped,
  LEAVE_TYPE_OPTIONS,
  LEAVE_TYPE_TO_I18N,
  LeaveDraft,
  LeavePurposeQuotaRow,
  LeaveRecord,
  LeaveTab,
  LeaveTypeStoredValue,
  leaveDigitsToHhMm,
  mapDbLeaveToRecord,
  overlapDaysFromStart,
  parseEmployeeLeaveGrade,
  parseLeaveTimeDigits,
  resolveLeaveLevelForGrade,
  storageKey,
} from '@/lib/attendanceLeaveShared';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';

export type LeavePanelEmployee = {
  id: number;
  company_id?: number | null;
  employee_number: string;
  name: string;
  department?: string | null;
  position?: string | null;
  status?: string | null;
};

export type LeaveEmployeeNavBindings = {
  listLength: number;
  selectedIndex: number;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
};

export type AttendanceLeaveEmployeeWorkareaProps = {
  employee: LeavePanelEmployee;
  allowRead: boolean;
  allowCreate: boolean;
  allowSave: boolean;
  allowDelete: boolean;
  /** 근무일 우클릭 시 신규 휴가 기본 시작·종료일 */
  contextWorkDay?: string;
  /** 휴가관리 페이지와 동일한 목록 이동. 없으면 모달용(이동 버튼 비활성) */
  employeeNav?: LeaveEmployeeNavBindings;
  onFormModeChange?: (editing: boolean) => void;
  onLeavesSaved?: () => void;
  className?: string;
};

const noop = () => {};

export default function AttendanceLeaveEmployeeWorkarea({
  employee,
  allowRead,
  allowCreate,
  allowSave,
  allowDelete,
  contextWorkDay,
  employeeNav,
  onFormModeChange,
  onLeavesSaved,
  className,
}: AttendanceLeaveEmployeeWorkareaProps) {
  const { t } = useI18n();
  const empId = employee.id;

  const [mode, setMode] = useState<MasterUiMode>('browse');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<LeaveTab>('register');
  const [employeeDetail, setEmployeeDetail] = useState<Record<string, unknown> | null>(null);
  const [headerRefByCategory, setHeaderRefByCategory] = useState<HeaderRefByCategory>({});

  const [draft, setDraft] = useState<LeaveDraft>(emptyDraft());
  const [baselineDraft, setBaselineDraft] = useState<LeaveDraft>(emptyDraft());
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [baselineRecords, setBaselineRecords] = useState<LeaveRecord[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [baselineHistoryId, setBaselineHistoryId] = useState<string | null>(null);

  const [purposeBundle, setPurposeBundle] = useState<{
    employeeId: number;
    options: string[];
    quotaRows: LeavePurposeQuotaRow[];
    statutoryStartDate: string | null;
    annualLeaveBalance: AnnualLeaveBalance | null;
  } | null>(null);

  const formEditing = mode === 'edit' || mode === 'new';
  const locked = !formEditing;

  useEffect(() => {
    onFormModeChange?.(mode === 'edit');
  }, [mode, onFormModeChange]);

  useEffect(() => {
    const days = inclusiveLeaveDaysBetween(draft.from_date, draft.to_date);
    const next = String(days);
    setDraft((p) => (p.total_days === next ? p : { ...p, total_days: next }));
  }, [draft.from_date, draft.to_date]);

  const pickRefLabel = useCallback((it: { name_kor?: string | null; name_eng?: string | null; name_thai?: string | null; code: string }) => {
    return it.name_kor || it.name_eng || it.name_thai || it.code;
  }, []);

  const basePurposeOptions = useMemo(() => {
    if (!purposeBundle || purposeBundle.employeeId !== empId) return FALLBACK_PURPOSE_OPTIONS;
    return purposeBundle.options.length ? purposeBundle.options : FALLBACK_PURPOSE_OPTIONS;
  }, [empId, purposeBundle]);

  const purposeSelectOptions = useMemo(() => {
    const p = draft.purpose_of_leave;
    if (p && !basePurposeOptions.includes(p)) return [...basePurposeOptions, p];
    return basePurposeOptions;
  }, [basePurposeOptions, draft.purpose_of_leave]);

  const purposeOptionsReady = purposeBundle != null && purposeBundle.employeeId === empId;

  useEffect(() => {
    if (!allowRead) {
      setPurposeBundle(null);
      return;
    }
    const cid = employee.company_id;
    let cancelled = false;
    setPurposeBundle(null);
    if (cid == null || !Number.isFinite(Number(cid))) {
      setPurposeBundle({
        employeeId: empId,
        options: [],
        quotaRows: [],
        statutoryStartDate: null,
        annualLeaveBalance: null,
      });
      return;
    }
    void (async () => {
      try {
        const [stdRes, masterRes] = await Promise.all([
          apiClient.getAttendanceStandard(Number(cid)).catch(() => ({ data: null })),
          apiClient.getEmployeeAttendanceMaster(empId).catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        const bundle = stdRes.data as { leave_levels?: AttendanceLeaveLevelApi[] } | null | undefined;
        const master = masterRes.data as { leave?: { level_of_leave?: string | null } } | null | undefined;
        const levels = Array.isArray(bundle?.leave_levels) ? bundle.leave_levels : [];
        const grade = parseEmployeeLeaveGrade(master?.leave?.level_of_leave);
        const quotaRows = extractQuotaRowsFromLeaveLevels(levels, grade);
        const names = quotaRows.map((x) => x.leave_type_name);
        const hasAnnualLeave = names.some((x) => x.trim().toLowerCase() === 'annual leave');
        const nextOptions = hasAnnualLeave ? names : ['Annual leave', ...names];
        const lv = resolveLeaveLevelForGrade(levels, grade);
        const statutoryStartDate = String(lv?.leave_other_start_date ?? '').trim() || null;
        const leaveRaw = ((master?.leave as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
        const annualLeaveBalance: AnnualLeaveBalance = {
          days: Number(leaveRaw.year_days ?? 0),
          hours: Number(leaveRaw.year_hours ?? 0),
          minutes: Number(leaveRaw.year_minutes ?? 0),
        };
        setPurposeBundle({
          employeeId: empId,
          options: nextOptions,
          quotaRows,
          statutoryStartDate,
          annualLeaveBalance,
        });
      } catch {
        if (!cancelled)
          setPurposeBundle({
            employeeId: empId,
            options: [],
            quotaRows: [],
            statutoryStartDate: null,
            annualLeaveBalance: null,
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowRead, empId, employee.company_id]);

  useEffect(() => {
    if (!purposeBundle || purposeBundle.employeeId !== empId) return;
    const opts = purposeBundle.options.length ? purposeBundle.options : FALLBACK_PURPOSE_OPTIONS;
    setDraft((d) => {
      if (d.purpose_of_leave && opts.includes(d.purpose_of_leave)) return d;
      if (d.purpose_of_leave && !opts.includes(d.purpose_of_leave)) return d;
      return { ...d, purpose_of_leave: opts[0] ?? FALLBACK_PURPOSE_OPTIONS[0] };
    });
  }, [empId, purposeBundle]);

  const resolveHeaderRefLabel = useCallback(
    (category: string, code: unknown) => {
      const c = String(code ?? '').trim();
      if (!c) return '-';
      const items = headerRefByCategory[category] || [];
      const hit = items.find((x) => x.code === c);
      return hit ? pickRefLabel(hit) : c;
    },
    [headerRefByCategory, pickRefLabel]
  );

  const leaveSummary = useMemo(() => {
    const purpose = (draft.purpose_of_leave || '').trim();
    const isAnnualLeave = purpose.toLowerCase() === 'annual leave';
    const quotas =
      purposeBundle != null && purposeBundle.employeeId === empId ? purposeBundle.quotaRows : [];
    const qRow = purpose ? quotas.find((r) => r.leave_type_name === purpose) : undefined;
    const annualLeaveBalance =
      purposeBundle != null && purposeBundle.employeeId === empId ? purposeBundle.annualLeaveBalance : null;
    const entD = isAnnualLeave ? Number(annualLeaveBalance?.days ?? 0) : Number(qRow?.days_quota ?? 0);
    const entH = isAnnualLeave ? Number(annualLeaveBalance?.hours ?? 0) : Number(qRow?.hours_quota ?? 0);
    const entM = isAnnualLeave ? Number(annualLeaveBalance?.minutes ?? 0) : Number(qRow?.minutes_quota ?? 0);

    const statutoryStartDate =
      purposeBundle != null && purposeBundle.employeeId === empId ? purposeBundle.statutoryStartDate : null;

    const rel = purpose ? records.filter((r) => (r.purpose_of_leave || '').trim() === purpose) : records;
    const withPay = rel
      .filter((r) => r.with_pay)
      .reduce((a, b) => a + overlapDaysFromStart(b.from_date, b.to_date, statutoryStartDate), 0);
    const withoutPay = rel
      .filter((r) => !r.with_pay)
      .reduce((a, b) => a + overlapDaysFromStart(b.from_date, b.to_date, statutoryStartDate), 0);
    const total = withPay + withoutPay;
    const remain = Math.max(0, entD - total);

    return {
      entitlementLabel: `${entD}-${entH}:${entM}`,
      withPayLabel: `${withPay}-0:0`,
      withoutPayLabel: `${withoutPay}-0:0`,
      totalLabel: `${total}-0:0`,
      remainDays: remain,
    };
  }, [records, draft.purpose_of_leave, purposeBundle, empId]);

  const loadBundle = useCallback(async (id: number) => {
    try {
      const { data } = await apiClient.getAttendanceLeaves({ employee_id: id });
      const dbRows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
      const nextRecords: LeaveRecord[] = dbRows.map(mapDbLeaveToRecord);
      setRecords(nextRecords);
      setBaselineRecords(clone(nextRecords));
      setDraft(emptyDraft());
      setBaselineDraft(emptyDraft());
      setSelectedHistoryId(null);
      setBaselineHistoryId(null);
      return;
    } catch {
      try {
        const raw = localStorage.getItem(storageKey(id));
        const parsed = raw ? (JSON.parse(raw) as { records?: LeaveRecord[] }) : { records: [] };
        const rawList = Array.isArray(parsed.records) ? parsed.records : [];
        const nextRecords: LeaveRecord[] = rawList.map((r) => ({
          ...r,
          end_hh: r.end_hh ?? '',
          end_mm: r.end_mm ?? '',
        }));
        setRecords(nextRecords);
        setBaselineRecords(clone(nextRecords));
        setDraft(emptyDraft());
        setBaselineDraft(emptyDraft());
        setSelectedHistoryId(null);
        setBaselineHistoryId(null);
      } catch {
        setRecords([]);
        setBaselineRecords([]);
        setDraft(emptyDraft());
        setBaselineDraft(emptyDraft());
        setSelectedHistoryId(null);
        setBaselineHistoryId(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!allowRead) return;
    void loadBundle(empId);
    setMode('browse');
    setTab('register');
  }, [allowRead, empId, loadBundle]);

  useEffect(() => {
    if (!allowRead) {
      setEmployeeDetail(null);
      setHeaderRefByCategory({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const cid = employee.company_id ?? null;
        const [empRes, refRes] = await Promise.all([
          apiClient.getEmployee(empId),
          cid != null
            ? apiClient.getEmployeeReferenceItemsAllCategories(cid).catch(() => ({ data: {} }))
            : Promise.resolve({ data: {} }),
        ]);
        if (cancelled) return;
        setEmployeeDetail((empRes.data as Record<string, unknown>) || null);
        setHeaderRefByCategory((refRes.data as HeaderRefByCategory) || {});
      } catch {
        if (!cancelled) {
          setEmployeeDetail(null);
          setHeaderRefByCategory({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowRead, empId, employee.company_id]);

  const nav = employeeNav ?? {
    listLength: 1,
    selectedIndex: 0,
    onFirst: noop,
    onPrev: noop,
    onNext: noop,
    onLast: noop,
  };

  const onAdd = () => {
    setMode('new');
    setTab('register');
    const fresh = emptyDraft();
    const opts =
      purposeBundle?.employeeId === empId && purposeBundle.options.length
        ? purposeBundle.options
        : FALLBACK_PURPOSE_OPTIONS;
    fresh.purpose_of_leave = opts[0] ?? FALLBACK_PURPOSE_OPTIONS[0];
    const wd = (contextWorkDay || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(wd)) {
      fresh.from_date = wd;
      fresh.to_date = wd;
    }
    setDraft(fresh);
    setSelectedHistoryId(null);
  };

  const recordToDraft = (row: LeaveRecord): LeaveDraft => ({
    no_document: row.no_document,
    purpose_of_leave: row.purpose_of_leave,
    date_of_leave_record: row.date_of_leave_record,
    leave_reason: row.leave_reason,
    doctor_guarantee: row.doctor_guarantee,
    doctor_guarantee_note: '',
    leave_type: row.leave_type,
    from_date: row.from_date,
    to_date: row.to_date,
    start_hh: row.start_hh ?? '',
    start_mm: row.start_mm ?? '',
    end_hh: row.end_hh ?? '',
    end_mm: row.end_mm ?? '',
    total_days: String(row.total_days),
    with_pay: row.with_pay,
    not_display_removed_leave: true,
    show_all_status: false,
    approve_status: row.approve_status,
    memo: row.memo,
  });

  const onEdit = () => {
    if (!selectedHistoryId) {
      alert(t('attendanceLeaveManage.alert.selectHistoryToEdit'));
      return;
    }
    const row = records.find((x) => x.id === selectedHistoryId);
    if (!row) {
      alert(t('attendanceLeaveManage.alert.historyNotFound'));
      return;
    }
    const mapped = recordToDraft(row);
    setDraft(mapped);
    setBaselineDraft(clone(mapped));
    setBaselineHistoryId(selectedHistoryId);
    setTab('register');
    setMode('edit');
  };

  const selectHistoryRow = (id: string) => {
    setSelectedHistoryId(id);
  };

  const onCancel = () => {
    setDraft(clone(baselineDraft));
    setRecords(clone(baselineRecords));
    setSelectedHistoryId(baselineHistoryId);
    setMode('browse');
  };

  const onDelete = async () => {
    if (!selectedHistoryId) {
      alert(t('attendanceLeaveManage.alert.selectHistoryToDelete'));
      return;
    }
    if (!window.confirm(t('attendanceLeaveManage.confirmDeleteLeave'))) return;
    setSaving(true);
    try {
      const leaveId = Number(selectedHistoryId);
      if (!Number.isFinite(leaveId)) {
        alert(t('attendanceLeaveManage.alert.badLeaveId'));
        return;
      }
      await apiClient.deleteAttendanceLeave(leaveId, empId);
      await loadBundle(empId);
      const fresh = emptyDraft();
      setDraft(fresh);
      setBaselineDraft(fresh);
      setSelectedHistoryId(null);
      setBaselineHistoryId(null);
      setMode('browse');
      onLeavesSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    if (!draft.from_date || !draft.to_date || !draft.leave_type || !draft.purpose_of_leave) {
      alert(t('attendanceLeaveManage.validationRequired'));
      return;
    }
    if (draft.to_date < draft.from_date) {
      alert(t('attendanceLeaveManage.validationDateRange'));
      return;
    }
    const hasDateOverlap = records.some(
      (x) =>
        x.id !== selectedHistoryId &&
        isDateRangeOverlapped(draft.from_date, draft.to_date, String(x.from_date || ''), String(x.to_date || ''))
    );
    if (hasDateOverlap) {
      alert(t('attendanceLeaveManage.alert.duplicateLeaveOverlap'));
      return;
    }

    const recordDate =
      selectedHistoryId != null ? draft.date_of_leave_record : new Date().toISOString().slice(0, 10);

    const row: LeaveRecord = {
      id: selectedHistoryId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      no_document: draft.no_document.trim(),
      purpose_of_leave: draft.purpose_of_leave,
      leave_type: draft.leave_type,
      from_date: draft.from_date,
      to_date: draft.to_date,
      start_hh: draft.start_hh,
      start_mm: draft.start_mm,
      end_hh: draft.end_hh,
      end_mm: draft.end_mm,
      total_days: Number(draft.total_days || 0),
      with_pay: draft.with_pay,
      approve_status: draft.approve_status || 'Approve',
      doctor_guarantee: draft.doctor_guarantee,
      leave_reason: draft.leave_reason,
      memo: draft.memo,
      date_of_leave_record: recordDate,
      comments: {
        level1: '',
        level2: '',
        level3: '',
        level4: '',
        level5: '',
        level6: '',
        hr: '',
      },
      created_by: 'user',
    };

    setSaving(true);
    try {
      const payload = {
        purpose_of_leave: row.purpose_of_leave,
        leave_type: row.leave_type,
        from_date: row.from_date,
        to_date: row.to_date,
        total_days: row.total_days,
        with_pay: row.with_pay,
        approve_status: row.approve_status,
        leave_reason: row.leave_reason,
        memo: row.memo,
        no_document: row.no_document,
        date_of_leave_record: row.date_of_leave_record,
        doctor_guarantee: row.doctor_guarantee,
        start_hh: row.start_hh,
        start_mm: row.start_mm,
        end_hh: row.end_hh,
        end_mm: row.end_mm,
      };
      if (selectedHistoryId) {
        const leaveId = Number(selectedHistoryId);
        if (!Number.isFinite(leaveId)) {
          alert(t('attendanceLeaveManage.alert.badLeaveId'));
          return;
        }
        await apiClient.updateAttendanceLeave(leaveId, { employee_id: empId, ...payload });
      } else {
        await apiClient.applyLeave(empId, payload);
      }
      await loadBundle(empId);
      const fresh = emptyDraft();
      const opts =
        purposeBundle?.employeeId === empId && purposeBundle.options.length
          ? purposeBundle.options
          : FALLBACK_PURPOSE_OPTIONS;
      fresh.purpose_of_leave = opts[0] ?? FALLBACK_PURPOSE_OPTIONS[0];
      setDraft(fresh);
      setBaselineDraft(clone(fresh));
      setSelectedHistoryId(null);
      setBaselineHistoryId(null);
      setMode('new');
      alert(t('attendanceLeaveManage.saved'));
      onLeavesSaved?.();
    } finally {
      setSaving(false);
    }
  };

  if (!allowRead) {
    return (
      <div className="p-6 text-center text-gray-600 border border-amber-200 bg-amber-50 rounded-lg">
        {t('permission.noAccess')}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col bg-white min-h-0 p-1.5 sm:p-2 overflow-y-auto', className)}>
      <HrMasterToolbar
        mode={mode}
        listLength={nav.listLength}
        selectedIndex={nav.selectedIndex}
        saving={saving}
        allowAdd={allowCreate}
        allowEdit={allowSave}
        allowDelete={allowDelete}
        allowSave={allowSave}
        editExtraDisabled={!selectedHistoryId}
        deleteExtraDisabled={!selectedHistoryId}
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={() => void onDelete()}
        onSave={() => void onSave()}
        onCancel={onCancel}
        onFirst={nav.onFirst}
        onPrev={nav.onPrev}
        onNext={nav.onNext}
        onLast={nav.onLast}
        t={t}
      />

      <div className="mt-2 flex items-end border-b border-gray-200 bg-gray-50 rounded-t-md px-1 pt-1">
        <button
          type="button"
          onClick={() => setTab('register')}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold border border-b-0 rounded-t-md -mb-px',
            tab === 'register' ? 'bg-white border-blue-400 text-blue-700' : 'bg-gray-100 border-gray-300 text-gray-600'
          )}
        >
          {t('attendanceLeaveManage.register.tabTitle')}
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={cn(
            'ml-1 px-3 py-1.5 text-xs font-semibold border border-b-0 rounded-t-md -mb-px',
            tab === 'history' ? 'bg-white border-blue-400 text-blue-700' : 'bg-gray-100 border-gray-300 text-gray-600'
          )}
        >
          {t('attendanceLeaveManage.history.tabTitle')}
        </button>
      </div>

      {tab === 'register' && (
        <div className="border border-gray-300 border-t-0 rounded-b-md p-2 bg-[#d8e8f3] text-xs">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] gap-3 xl:items-start">
            <div className="min-w-0 flex flex-col gap-2 shrink-0 order-2 xl:order-1">
              <div className="flex flex-row items-start gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getEmployeePhotoImageUrl(employee.id)}
                  alt=""
                  className="w-[92px] h-[112px] border border-gray-300 object-cover bg-gray-100 shrink-0"
                />
                <div className="flex-1 min-w-0 text-xs leading-5 bg-white border border-gray-300 rounded px-2 py-1.5">
                  <div>
                    {t('attendanceLeaveManage.main.hireDate')}:{' '}
                    {String(employeeDetail?.hire_date ?? employeeDetail?.start_date ?? '-').slice(0, 10) || '-'}
                  </div>
                  <div>
                    {t('attendanceLeaveManage.main.division')}: {resolveHeaderRefLabel('division', employeeDetail?.division)}
                  </div>
                  <div>
                    {t('attendanceLeaveManage.main.department')}:{' '}
                    {resolveHeaderRefLabel('department', employeeDetail?.department)}
                  </div>
                  <div>
                    {t('attendanceLeaveManage.main.level')}: {resolveHeaderRefLabel('level', employeeDetail?.job_level)}
                  </div>
                  <div>
                    {t('attendanceLeaveManage.main.workPlace')}: {resolveHeaderRefLabel('work_place', employeeDetail?.work_place)}
                  </div>
                  <div>
                    {t('attendanceLeaveManage.main.area')}: {resolveHeaderRefLabel('area', employeeDetail?.area)}
                  </div>
                  <div>
                    {t('attendanceLeaveManage.main.workStatus')}: {resolveHeaderRefLabel('work_status', employeeDetail?.work_status)}
                  </div>
                  <div>
                    {t('attendanceLeaveManage.main.position')}: {resolveHeaderRefLabel('position', employeeDetail?.position)}
                  </div>
                </div>
              </div>
              <div className="border border-gray-300 bg-[#ffd8d8] rounded px-2 py-1.5 w-full text-[11px] space-y-1">
                {(
                  [
                    { label: t('attendanceLeaveManage.main.rightsForLeave'), value: leaveSummary.entitlementLabel },
                    { label: t('attendanceLeaveManage.main.leaveWithPay'), value: leaveSummary.withPayLabel },
                    { label: t('attendanceLeaveManage.main.leaveWithoutPay'), value: leaveSummary.withoutPayLabel },
                    { label: t('attendanceLeaveManage.main.total'), value: leaveSummary.totalLabel },
                    {
                      label: t('attendanceLeaveManage.main.remain'),
                      value: `${leaveSummary.remainDays} Day 0:0`,
                      highlight: true as const,
                    },
                  ] satisfies Array<{ label: string; value: string; highlight?: true }>
                ).map((row) => (
                  <div
                    key={row.label}
                    className={cn(
                      'flex items-center justify-between gap-2 min-h-[1.25rem]',
                      row.highlight && 'bg-yellow-100 -mx-2 px-2 py-1 rounded'
                    )}
                  >
                    <span className="min-w-0 text-left text-gray-800 leading-snug shrink">{row.label}</span>
                    <span className="font-semibold text-xs tabular-nums text-right whitespace-nowrap shrink-0">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 space-y-1 order-1 xl:order-2 xl:self-start">
              <label className="block">
                <span className="text-gray-700 block mb-0.5">{t('attendanceLeaveManage.main.employeeCode')}</span>
                <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-1">
                  <input
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-gray-100 text-gray-700"
                    value={employee.employee_number || ''}
                    disabled
                    readOnly
                  />
                  <input
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-gray-100 text-gray-700"
                    value={employee.name || ''}
                    disabled
                    readOnly
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-gray-700 block mb-0.5">{t('attendanceLeaveManage.main.noDocument')}</span>
                <input
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100"
                  disabled={locked}
                  value={draft.no_document}
                  onChange={(e) => setDraft((p) => ({ ...p, no_document: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-gray-700 block mb-0.5">{t('attendanceLeaveManage.main.purposeOfLeave')}</span>
                <select
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100"
                  disabled={locked || !purposeOptionsReady}
                  value={draft.purpose_of_leave}
                  onChange={(e) => setDraft((p) => ({ ...p, purpose_of_leave: e.target.value }))}
                >
                  {purposeSelectOptions.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-gray-700 block mb-0.5">{t('attendanceLeaveManage.main.dateOfLeaveRecord')}</span>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-gray-100 text-gray-700 cursor-not-allowed"
                  disabled
                  readOnly
                  value={draft.date_of_leave_record}
                  title={t('attendanceLeaveManage.main.dateOfLeaveRecord')}
                />
              </label>
              <label className="block">
                <span className="text-gray-700 block mb-0.5">{t('attendanceLeaveManage.main.leaveReason')}</span>
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100"
                  disabled={locked}
                  value={draft.leave_reason}
                  onChange={(e) => setDraft((p) => ({ ...p, leave_reason: e.target.value }))}
                />
              </label>
              <div className="w-full min-w-0 space-y-1">
                <div className="border border-gray-300 rounded p-1 bg-[#d8e8f3] text-xs w-full">
                  <div className="grid grid-cols-[90px_minmax(0,1fr)] sm:grid-cols-[110px_minmax(0,1fr)] gap-1 items-center w-full">
                    <span>{t('attendanceLeaveManage.main.typeOfLeave')}</span>
                    <select
                      className="w-full min-w-0 border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100"
                      disabled={locked}
                      value={draft.leave_type}
                      onChange={(e) => setDraft((p) => ({ ...p, leave_type: e.target.value }))}
                    >
                      {draft.leave_type && !LEAVE_TYPE_OPTIONS.includes(draft.leave_type as LeaveTypeStoredValue) ? (
                        <option value={draft.leave_type}>{formatLeaveTypeLabel(draft.leave_type, t)}</option>
                      ) : null}
                      {LEAVE_TYPE_OPTIONS.map((x) => (
                        <option key={x} value={x}>
                          {t(LEAVE_TYPE_TO_I18N[x])}
                        </option>
                      ))}
                    </select>
                    <span>{t('attendanceLeaveManage.main.date')}</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 min-w-0 w-full">
                      <input
                        type="date"
                        className="min-w-0 w-full border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100"
                        disabled={locked}
                        value={draft.from_date}
                        onChange={(e) => setDraft((p) => ({ ...p, from_date: e.target.value }))}
                      />
                      <input
                        type="date"
                        className="min-w-0 w-full border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100"
                        disabled={locked}
                        value={draft.to_date}
                        onChange={(e) => setDraft((p) => ({ ...p, to_date: e.target.value }))}
                      />
                    </div>
                    <span>{t('attendanceLeaveManage.main.startingTime')}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="00:00"
                      maxLength={5}
                      className="w-full min-w-0 border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100 font-mono tabular-nums tracking-wide"
                      disabled={locked}
                      value={formatLeaveTimeDigits(hhMmToLeaveDigits(draft.start_hh, draft.start_mm))}
                      onChange={(e) => {
                        const d = parseLeaveTimeDigits(e.target.value);
                        const next = leaveDigitsToHhMm(d);
                        setDraft((p) => ({ ...p, start_hh: next.hh, start_mm: next.mm }));
                      }}
                    />
                    <span>{t('attendanceLeaveManage.main.endingTime')}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="00:00"
                      maxLength={5}
                      className="w-full min-w-0 border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100 font-mono tabular-nums tracking-wide"
                      disabled={locked}
                      value={formatLeaveTimeDigits(hhMmToLeaveDigits(draft.end_hh, draft.end_mm))}
                      onChange={(e) => {
                        const d = parseLeaveTimeDigits(e.target.value);
                        const next = leaveDigitsToHhMm(d);
                        setDraft((p) => ({ ...p, end_hh: next.hh, end_mm: next.mm }));
                      }}
                    />
                    <span>{t('attendanceLeaveManage.main.total')}</span>
                    <input
                      className="w-full min-w-0 border border-gray-300 rounded px-2 py-1 bg-gray-100 text-gray-800"
                      disabled
                      value={draft.total_days}
                      title={t('attendanceLeaveManage.main.totalAutoHint')}
                    />
                  </div>
                </div>
                <div className="border border-gray-300 rounded p-1 bg-[#d8e8f3] text-xs space-y-1 w-full">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="payType"
                      disabled={locked}
                      checked={draft.with_pay}
                      onChange={() => setDraft((p) => ({ ...p, with_pay: true }))}
                    />
                    {t('attendanceLeaveManage.main.leaveWithPay')}
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="payType"
                      disabled={locked}
                      checked={!draft.with_pay}
                      onChange={() => setDraft((p) => ({ ...p, with_pay: false }))}
                    />
                    {t('attendanceLeaveManage.main.leaveWithoutPay')}
                  </label>
                </div>
                <div className="border border-gray-300 rounded p-1 bg-[#d8e8f3] w-full">
                  <label className="flex items-center gap-2 text-xs mb-1">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={draft.doctor_guarantee}
                      onChange={(e) => setDraft((p) => ({ ...p, doctor_guarantee: e.target.checked }))}
                    />
                    {t('attendanceLeaveManage.main.doctorGuarantee')}
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded px-2 py-1 bg-white disabled:bg-gray-100 text-xs"
                    disabled={locked}
                    value={draft.doctor_guarantee_note}
                    onChange={(e) => setDraft((p) => ({ ...p, doctor_guarantee_note: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="border border-gray-300 border-t-0 rounded-b-md bg-white h-[420px] flex flex-col">
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full text-[11px] border-collapse min-w-[1900px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.year')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.noDocument')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.leave')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.typeOfLeave')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.startDate')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.to')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.total')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.startTime')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.endTime')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.total')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.leaveWithOrWithoutPay')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.dateOfLeaveRecord')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.memo')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.approveStatus')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.doctorGuarantee')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.commentLevel1')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.commentLevel2')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.commentLevel3')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.commentLevel4')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.commentLevel5')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.commentLevel6')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.commentHr')}</th>
                  <th className="p-1 border border-gray-300">{t('attendanceLeaveManage.history.createdBy')}</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={23} className="p-6 text-center text-gray-500">
                      {t('attendanceLeaveManage.history.empty')}
                    </td>
                  </tr>
                ) : (
                  records.map((r) => {
                    const active = r.id === selectedHistoryId;
                    return (
                      <tr
                        key={r.id}
                        className={cn('cursor-pointer hover:bg-slate-50', active && 'bg-blue-50')}
                        onClick={() => selectHistoryRow(r.id)}
                      >
                        <td className="p-1 border border-gray-300">{r.from_date.slice(0, 4)}</td>
                        <td className="p-1 border border-gray-300">
                          <span className={cn('text-blue-700', active && 'font-semibold')}>{r.no_document || '—'}</span>
                        </td>
                        <td className="p-1 border border-gray-300">{r.purpose_of_leave}</td>
                        <td className="p-1 border border-gray-300">{formatLeaveTypeLabel(r.leave_type, t)}</td>
                        <td className="p-1 border border-gray-300">{r.from_date}</td>
                        <td className="p-1 border border-gray-300">{r.to_date}</td>
                        <td className="p-1 border border-gray-300 text-right">{r.total_days}</td>
                        <td className="p-1 border border-gray-300 font-mono tabular-nums">
                          {formatHistoryTimeCell(r.start_hh, r.start_mm)}
                        </td>
                        <td className="p-1 border border-gray-300 font-mono tabular-nums">
                          {formatHistoryTimeCell(r.end_hh, r.end_mm)}
                        </td>
                        <td className="p-1 border border-gray-300 text-right">{r.total_days}</td>
                        <td className="p-1 border border-gray-300">
                          {r.with_pay ? t('attendanceLeaveManage.main.leaveWithPay') : t('attendanceLeaveManage.main.leaveWithoutPay')}
                        </td>
                        <td className="p-1 border border-gray-300">{r.date_of_leave_record}</td>
                        <td className="p-1 border border-gray-300">{r.memo}</td>
                        <td className="p-1 border border-gray-300">{r.approve_status}</td>
                        <td className="p-1 border border-gray-300 text-center">{r.doctor_guarantee ? '☑' : '☐'}</td>
                        <td className="p-1 border border-gray-300">{r.comments.level1}</td>
                        <td className="p-1 border border-gray-300">{r.comments.level2}</td>
                        <td className="p-1 border border-gray-300">{r.comments.level3}</td>
                        <td className="p-1 border border-gray-300">{r.comments.level4}</td>
                        <td className="p-1 border border-gray-300">{r.comments.level5}</td>
                        <td className="p-1 border border-gray-300">{r.comments.level6}</td>
                        <td className="p-1 border border-gray-300">{r.comments.hr}</td>
                        <td className="p-1 border border-gray-300">{r.created_by}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
