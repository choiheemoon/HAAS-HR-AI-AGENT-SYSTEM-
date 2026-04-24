'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

type JobType =
  | 'attendance_ot_allowance_aggregate'
  | 'payroll_master_monthly_aggregate'
  | 'attendance_hr_report_pdf_email'
  | 'hr_report_pdf_email'
  | 'attendance_report_pdf_email';

type ScheduleRow = {
  id: number;
  name: string;
  job_type: JobType;
  enabled: boolean;
  time_local: string;
  timezone: string;
  weekdays_mask: number;
  run_as_user_id: number;
  company_id?: number | null;
  payload?: Record<string, unknown>;
  last_run_at?: string | null;
  next_run_at?: string | null;
};

type ScheduleRunRow = {
  id: number;
  schedule_id: number;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string | null;
  result?: Record<string, unknown>;
};

/** Python weekday: Mon=0 … Sun=6 — matches backend bitmask (1 << weekday). */
const WEEKDAY_BITS: { bit: number; labelKey: string }[] = [
  { bit: 1 << 0, labelKey: 'schedule.manage.weekday.mon' },
  { bit: 1 << 1, labelKey: 'schedule.manage.weekday.tue' },
  { bit: 1 << 2, labelKey: 'schedule.manage.weekday.wed' },
  { bit: 1 << 3, labelKey: 'schedule.manage.weekday.thu' },
  { bit: 1 << 4, labelKey: 'schedule.manage.weekday.fri' },
  { bit: 1 << 5, labelKey: 'schedule.manage.weekday.sat' },
  { bit: 1 << 6, labelKey: 'schedule.manage.weekday.sun' },
];

const COMMON_TIMEZONES = [
  'Asia/Seoul',
  'Asia/Bangkok',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'UTC',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
];

function toggleWeekdayMask(mask: number, bit: number, on: boolean): number {
  if (on) return mask | bit;
  return mask & ~bit;
}

function normalizeJobTypeForEdit(jobType: JobType): JobType {
  // Legacy unified report type is no longer selectable in UI.
  if (jobType === 'attendance_hr_report_pdf_email') return 'hr_report_pdf_email';
  return jobType;
}

function defaultForm() {
  return {
    name: '',
    job_type: 'attendance_ot_allowance_aggregate' as JobType,
    enabled: true,
    time_local: '09:00',
    timezone: 'Asia/Seoul',
    weekdays_mask: 62,
    run_as_user_id: 0,
    company_id: 0,
    recipient_emails: '',
    run_on_day: 1,
    report_format: 'pdf',
    period_type: 'daily',
    month_offset: -1,
    period_label: 'Period 1',
    date_mode: 'yesterday' as 'yesterday' | 'today' | 'yesterday_today',
    preserve_manual_ot: true,
    payroll_coverage: 'all' as 'all' | 'code_range' | 'department',
    employee_code_from: '',
    employee_code_to: '',
    department_code: '',
    income_ot_only: false,
    report_months: 12,
  };
}

/** GET /system/job-schedules 는 `{ items: ScheduleRow[] }` 형태 */
function normalizeScheduleList(data: unknown): ScheduleRow[] {
  if (Array.isArray(data)) return data as ScheduleRow[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: ScheduleRow[] }).items;
  }
  return [];
}

export default function ScheduleManagePage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [loginUserLabel, setLoginUserLabel] = useState('');
  const [loginCompanyLabel, setLoginCompanyLabel] = useState('');
  const [runsBySchedule, setRunsBySchedule] = useState<Record<number, ScheduleRunRow[]>>({});
  const [expandedRuns, setExpandedRuns] = useState<Record<number, boolean>>({});
  const [runLoading, setRunLoading] = useState<Record<number, boolean>>({});
  const [lastRunStatusBySchedule, setLastRunStatusBySchedule] = useState<Record<number, string>>({});
  const [lastRunMessageBySchedule, setLastRunMessageBySchedule] = useState<Record<number, string>>({});
  const [runsModalOpen, setRunsModalOpen] = useState(false);
  const [runsModalSchedule, setRunsModalSchedule] = useState<ScheduleRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(defaultForm());

  const selectedUserOk = useMemo(() => form.run_as_user_id > 0, [form.run_as_user_id]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, me, myCompanies] = await Promise.all([
        apiClient.listJobSchedules(),
        apiClient.getAuthMe(),
        apiClient.getMyCompanies(),
      ]);
      const list = normalizeScheduleList(s.data);
      setRows(list);
      const statuses = await Promise.all(
        list.map(async (row) => {
          try {
            const rr = await apiClient.listJobScheduleRuns(row.id, { limit: 1 });
            const one = Array.isArray(rr.data) ? (rr.data as ScheduleRunRow[]) : [];
            return [row.id, one[0]?.status || 'none', String(one[0]?.message || '')] as const;
          } catch {
            return [row.id, 'none', ''] as const;
          }
        })
      );
      setLastRunStatusBySchedule(Object.fromEntries(statuses.map(([id, status]) => [id, status])));
      setLastRunMessageBySchedule(Object.fromEntries(statuses.map(([id, _status, msg]) => [id, msg])));
      const meData = (me.data as { id?: number; username?: string; full_name?: string }) || {};
      const meId = Number(meData.id || 0);
      const meName = (meData.full_name || meData.username || '').trim();
      const myCompanyList = (myCompanies.data as Array<{ id: number; company_code?: string; name_kor?: string }>) || [];
      const firstCompany = myCompanyList[0];
      const companyId = Number(firstCompany?.id || 0);
      const companyName = firstCompany
        ? `${firstCompany.company_code || ''} ${firstCompany.name_kor || ''}`.trim()
        : '';
      setLoginUserLabel(meName);
      setLoginCompanyLabel(companyName);
      setForm((p) => ({
        ...p,
        run_as_user_id: meId,
        company_id: companyId,
      }));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const hasRunning = rows.some((r) => String(lastRunStatusBySchedule[r.id] || '').toLowerCase() === 'running');
    if (!hasRunning) return;
    const timer = window.setInterval(() => {
      void load();
      rows
        .filter((r) => !!expandedRuns[r.id])
        .forEach((r) => {
          void loadRuns(r.id);
        });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [rows, expandedRuns, lastRunStatusBySchedule]);

  const openCreateModal = () => {
    setEditingScheduleId(null);
    setForm((p) => ({
      ...defaultForm(),
      run_as_user_id: p.run_as_user_id,
      company_id: p.company_id,
      timezone: p.timezone || 'Asia/Seoul',
    }));
    setShowCreateModal(true);
  };

  const openEditModal = (row: ScheduleRow) => {
    const payload = row.payload || {};
    const recipientEmailsRaw = payload.recipient_emails;
    const recipientEmails = Array.isArray(recipientEmailsRaw)
      ? recipientEmailsRaw.map((x) => String(x)).join(', ')
      : String(recipientEmailsRaw || '');
    const dateModeRaw = String(payload.date_mode || 'yesterday');
    const dateMode =
      dateModeRaw === 'today' || dateModeRaw === 'yesterday_today' || dateModeRaw === 'yesterday'
        ? dateModeRaw
        : 'yesterday';

    setEditingScheduleId(row.id);
    setForm((p) => ({
      ...p,
      name: row.name || '',
      job_type: normalizeJobTypeForEdit(row.job_type),
      enabled: !!row.enabled,
      time_local: row.time_local || '09:00',
      timezone: row.timezone || 'Asia/Seoul',
      weekdays_mask: Number(row.weekdays_mask) || 0,
      run_as_user_id: p.run_as_user_id,
      company_id: p.company_id,
      recipient_emails: recipientEmails,
      run_on_day: Number(payload.run_on_day ?? 1) || 1,
      report_format: String(payload.report_format || 'pdf'),
      period_type: String(payload.period_type || 'daily'),
      month_offset: Number(payload.month_offset ?? -1) || -1,
      period_label: String(payload.period_label || 'Period 1'),
      date_mode: dateMode,
      preserve_manual_ot: Boolean(payload.preserve_manual_ot ?? true),
      payroll_coverage:
        payload.coverage === 'code_range' || payload.coverage === 'department' ? payload.coverage : 'all',
      employee_code_from: String(payload.employee_code_from || ''),
      employee_code_to: String(payload.employee_code_to || ''),
      department_code: String(payload.department_code || ''),
      income_ot_only: Boolean(payload.income_ot_only ?? false),
      report_months: Number(payload.months ?? 12) || 12,
    }));
    setShowCreateModal(true);
  };

  const onCreate = async () => {
    if (!selectedUserOk) {
      alert(t('schedule.manage.needRunUser'));
      return;
    }
    if (!form.company_id) {
      alert(t('schedule.manage.noCompanyForLogin'));
      return;
    }
    if (form.job_type === 'payroll_master_monthly_aggregate' && !form.company_id) {
      alert(t('schedule.manage.payroll.needCompany'));
      return;
    }
    if (form.weekdays_mask <= 0) {
      alert(t('schedule.manage.weekdaysInvalid'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name,
        job_type: form.job_type,
        enabled: form.enabled,
        time_local: form.time_local,
        timezone: form.timezone,
        weekdays_mask: form.weekdays_mask,
        run_as_user_id: form.run_as_user_id,
        company_id: form.company_id || null,
        payload: (() => {
          if (
            form.job_type === 'attendance_hr_report_pdf_email' ||
            form.job_type === 'hr_report_pdf_email' ||
            form.job_type === 'attendance_report_pdf_email'
          ) {
            return {
              recipient_emails: form.recipient_emails.split(',').map((x) => x.trim()).filter(Boolean),
              run_on_day: form.period_type === 'monthly' ? form.run_on_day : 0,
              report_format: form.report_format,
              period_type: form.period_type,
              months: form.report_months,
            };
          }
          if (form.job_type === 'payroll_master_monthly_aggregate') {
            return {
              run_on_day: form.run_on_day,
              month_offset: form.month_offset,
              period_label: form.period_label,
              coverage: form.payroll_coverage,
              ...(form.payroll_coverage === 'code_range'
                ? {
                    employee_code_from: form.employee_code_from.trim() || undefined,
                    employee_code_to: form.employee_code_to.trim() || undefined,
                  }
                : {}),
              ...(form.payroll_coverage === 'department'
                ? { department_code: form.department_code.trim() || undefined }
                : {}),
              income_ot_only: form.income_ot_only,
            };
          }
          return {
            preserve_manual_ot: form.preserve_manual_ot,
            date_mode: form.date_mode,
          };
        })(),
      };
      if (editingScheduleId) {
        await apiClient.updateJobSchedule(editingScheduleId, body);
      } else {
        await apiClient.createJobSchedule(body);
      }
      setShowCreateModal(false);
      setEditingScheduleId(null);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.detail || t('schedule.manage.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (row: ScheduleRow) => {
    await apiClient.updateJobSchedule(row.id, { enabled: !row.enabled });
    await load();
  };

  const onRunNow = async (row: ScheduleRow) => {
    try {
      const res = await apiClient.runJobScheduleNow(row.id);
      const msg = String((res?.data as { message?: string } | undefined)?.message || '').toLowerCase();
      alert(msg === 'queued' ? t('schedule.manage.runQueued') : t('schedule.manage.runCompleted'));
      await load();
      if (expandedRuns[row.id]) {
        await loadRuns(row.id);
      }
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail ||
        e?.message ||
        t('schedule.manage.runFailed');
      alert(detail);
      console.error('run schedule failed', e);
    }
  };

  const onDelete = async (row: ScheduleRow) => {
    if (!confirm(t('schedule.manage.confirmDelete'))) return;
    await apiClient.deleteJobSchedule(row.id);
    await load();
  };

  const loadRuns = async (scheduleId: number, limit = 5) => {
    setRunLoading((p) => ({ ...p, [scheduleId]: true }));
    try {
      const res = await apiClient.listJobScheduleRuns(scheduleId, { limit });
      const runList = Array.isArray(res.data) ? (res.data as ScheduleRunRow[]) : [];
      setRunsBySchedule((p) => ({ ...p, [scheduleId]: runList }));
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || t('schedule.manage.loadRunsFailed');
      alert(detail);
    } finally {
      setRunLoading((p) => ({ ...p, [scheduleId]: false }));
    }
  };

  const toggleRuns = async (scheduleId: number) => {
    const now = !!expandedRuns[scheduleId];
    const next = !now;
    setExpandedRuns((p) => ({ ...p, [scheduleId]: next }));
    if (next) {
      await loadRuns(scheduleId);
    }
  };

  const openRunsModal = async (row: ScheduleRow) => {
    setRunsModalSchedule(row);
    setRunsModalOpen(true);
    await loadRuns(row.id, 200);
  };

  const fmtDateTime = (s?: string | null) => {
    if (!s) return '-';
    try {
      return new Date(s).toLocaleString();
    } catch {
      return String(s);
    }
  };

  const runStatusLabel = (scheduleId: number) => {
    const raw = String(lastRunStatusBySchedule[scheduleId] || 'none').toLowerCase();
    if (raw === 'success') return t('schedule.manage.runStatus.success');
    if (raw === 'failed' || raw === 'error') return t('schedule.manage.runStatus.failed');
    if (raw === 'running') return t('schedule.manage.runStatus.running');
    return t('schedule.manage.runStatus.none');
  };

  const latestRunMessage = (scheduleId: number) => {
    const raw = (lastRunMessageBySchedule[scheduleId] || '').trim();
    if (!raw) return '';
    return raw;
  };

  const runHistoryStatusLabel = (status?: string | null) => {
    const raw = String(status || '').toLowerCase();
    if (raw === 'success') return t('schedule.manage.runStatus.success');
    if (raw === 'failed' || raw === 'error') return t('schedule.manage.runStatus.failed');
    if (raw === 'running') return t('schedule.manage.runStatus.running');
    return raw || '-';
  };

  const progressTextFromMessage = (message?: string | null) => {
    const raw = String(message || '');
    const m = raw.match(/(\d{1,3})%/);
    if (!m) return '';
    return `${Math.min(100, Math.max(0, Number(m[1])))}%`;
  };

  const jobTypeLabel = (jobType: JobType) => {
    if (jobType === 'attendance_ot_allowance_aggregate') return t('schedule.manage.jobType.aggregate');
    if (jobType === 'payroll_master_monthly_aggregate') return t('schedule.manage.jobType.payroll');
    if (jobType === 'hr_report_pdf_email') return t('schedule.manage.jobType.hrReport');
    if (jobType === 'attendance_report_pdf_email') return t('schedule.manage.jobType.attendanceReport');
    return t('schedule.manage.jobType.hrReport');
  };

  const usageCounts = useMemo(() => {
    const total = rows.length;
    const enabled = rows.filter((r) => !!r.enabled).length;
    const running = rows.filter((r) => String(lastRunStatusBySchedule[r.id] || '').toLowerCase() === 'running').length;
    const failed = rows.filter((r) => {
      const s = String(lastRunStatusBySchedule[r.id] || '').toLowerCase();
      return s === 'failed' || s === 'error';
    }).length;
    return { total, enabled, running, failed };
  }, [rows, lastRunStatusBySchedule]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const status = runStatusLabel(r.id).toLowerCase();
      const text = `${r.name} ${jobTypeLabel(r.job_type)} ${r.time_local} ${r.timezone} ${status}`.toLowerCase();
      return text.includes(q);
    });
  }, [rows, searchQuery, lastRunStatusBySchedule]);

  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">{t('schedule.manage.title')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('schedule.manage.subtitle')}</p>
          </div>
          <button
            className="px-4 py-2 rounded bg-primary-600 text-white text-sm"
            onClick={openCreateModal}
          >
            {t('schedule.manage.create')}
          </button>
        </div>
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="px-2 py-1 rounded border bg-gray-50">Total {usageCounts.total}</span>
          <span className="px-2 py-1 rounded border bg-emerald-50 text-emerald-700">Enabled {usageCounts.enabled}</span>
          <span className="px-2 py-1 rounded border bg-blue-50 text-blue-700">Running {usageCounts.running}</span>
          <span className="px-2 py-1 rounded border bg-rose-50 text-rose-700">Failed {usageCounts.failed}</span>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {editingScheduleId ? t('schedule.manage.editTitle') : t('schedule.manage.modalTitle')}
              </h3>
              <button
                type="button"
                className="px-2 py-1 border rounded"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingScheduleId(null);
                }}
              >
                {t('schedule.manage.close')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-sm md:col-span-1">
                <span className="text-gray-600">{t('schedule.manage.name')}</span>
                <input
                  className="border rounded px-3 py-2"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">{t('schedule.manage.jobKind')}</span>
                <select
                  className="border rounded px-3 py-2"
                  value={form.job_type}
                  onChange={(e) => setForm((p) => ({ ...p, job_type: e.target.value as JobType }))}
                >
                  <option value="attendance_ot_allowance_aggregate">{t('schedule.manage.jobType.aggregate')}</option>
                  <option value="payroll_master_monthly_aggregate">{t('schedule.manage.jobType.payroll')}</option>
                  <option value="hr_report_pdf_email">{t('schedule.manage.jobType.hrReport')}</option>
                  <option value="attendance_report_pdf_email">{t('schedule.manage.jobType.attendanceReport')}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">{t('schedule.manage.time')}</span>
                <input
                  className="border rounded px-3 py-2"
                  type="time"
                  value={form.time_local}
                  onChange={(e) => setForm((p) => ({ ...p, time_local: e.target.value }))}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">{t('schedule.manage.timezone')}</span>
                <input
                  className="border rounded px-3 py-2"
                  list="schedule-tz-suggestions"
                  value={form.timezone}
                  onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                />
                <datalist id="schedule-tz-suggestions">
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
              </label>
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">{t('schedule.manage.weekdays')}</span>
                <div className="flex flex-wrap gap-2 border rounded px-2 py-2">
                  {WEEKDAY_BITS.map(({ bit, labelKey }) => (
                    <label key={bit} className="inline-flex items-center gap-1 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={(form.weekdays_mask & bit) !== 0}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            weekdays_mask: toggleWeekdayMask(p.weekdays_mask, bit, e.target.checked),
                          }))
                        }
                      />
                      {t(labelKey)}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">{t('schedule.manage.runAsUser')}</span>
                <input
                  className="border rounded px-3 py-2 bg-gray-100"
                  value={loginUserLabel || '-'}
                  readOnly
                />
                <span className="text-xs text-gray-500">{t('schedule.manage.fixedToLoginUser')}</span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">{t('schedule.manage.company')}</span>
                <input
                  className="border rounded px-3 py-2 bg-gray-100"
                  value={loginCompanyLabel || '-'}
                  readOnly
                />
                <span className="text-xs text-gray-500">{t('schedule.manage.fixedToLoginCompany')}</span>
              </label>
              <label className="flex items-center gap-2 text-sm px-2 pt-6">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
                />
                {t('schedule.manage.enabled')}
              </label>
            </div>

            {form.job_type === 'attendance_ot_allowance_aggregate' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border-t pt-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">{t('schedule.manage.dateMode.label')}</span>
                  <select
                    className="border rounded px-3 py-2"
                    value={form.date_mode}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        date_mode: e.target.value as 'yesterday' | 'today' | 'yesterday_today',
                      }))
                    }
                  >
                    <option value="yesterday">{t('schedule.manage.dateMode.yesterday')}</option>
                    <option value="today">{t('schedule.manage.dateMode.today')}</option>
                    <option value="yesterday_today">{t('schedule.manage.dateMode.yesterdayToday')}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm pt-6">
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.preserve_manual_ot}
                      onChange={(e) => setForm((p) => ({ ...p, preserve_manual_ot: e.target.checked }))}
                    />
                    {t('schedule.manage.preserveManualOt')}
                  </span>
                  <span className="text-xs text-gray-500">{t('schedule.manage.preserveManualOtHint')}</span>
                </label>
              </div>
            )}

            {form.job_type === 'payroll_master_monthly_aggregate' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border-t pt-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">{t('schedule.manage.payroll.runOnDay')}</span>
                  <input
                    className="border rounded px-3 py-2"
                    type="number"
                    min={1}
                    max={28}
                    value={form.run_on_day}
                    onChange={(e) => setForm((p) => ({ ...p, run_on_day: Number(e.target.value) || 1 }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">{t('schedule.manage.payroll.monthOffset')}</span>
                  <input
                    className="border rounded px-3 py-2"
                    type="number"
                    value={form.month_offset}
                    onChange={(e) => setForm((p) => ({ ...p, month_offset: Number(e.target.value) || -1 }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">{t('schedule.manage.payroll.periodLabel')}</span>
                  <input
                    className="border rounded px-3 py-2"
                    value={form.period_label}
                    onChange={(e) => setForm((p) => ({ ...p, period_label: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm md:col-span-3">
                  <span className="text-gray-600">{t('schedule.manage.payroll.coverage')}</span>
                  <select
                    className="border rounded px-3 py-2 max-w-md"
                    value={form.payroll_coverage}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        payroll_coverage: e.target.value as 'all' | 'code_range' | 'department',
                      }))
                    }
                  >
                    <option value="all">{t('schedule.manage.payroll.coverageAll')}</option>
                    <option value="code_range">{t('schedule.manage.payroll.coverageCodeRange')}</option>
                    <option value="department">{t('schedule.manage.payroll.coverageDepartment')}</option>
                  </select>
                </label>
                {form.payroll_coverage === 'code_range' && (
                  <>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-gray-600">{t('schedule.manage.payroll.employeeFrom')}</span>
                      <input
                        className="border rounded px-3 py-2"
                        value={form.employee_code_from}
                        onChange={(e) => setForm((p) => ({ ...p, employee_code_from: e.target.value }))}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-gray-600">{t('schedule.manage.payroll.employeeTo')}</span>
                      <input
                        className="border rounded px-3 py-2"
                        value={form.employee_code_to}
                        onChange={(e) => setForm((p) => ({ ...p, employee_code_to: e.target.value }))}
                      />
                    </label>
                  </>
                )}
                {form.payroll_coverage === 'department' && (
                  <label className="flex flex-col gap-1 text-sm md:col-span-2">
                    <span className="text-gray-600">{t('schedule.manage.payroll.departmentCode')}</span>
                    <input
                      className="border rounded px-3 py-2"
                      value={form.department_code}
                      onChange={(e) => setForm((p) => ({ ...p, department_code: e.target.value }))}
                    />
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm md:col-span-3">
                  <input
                    type="checkbox"
                    checked={form.income_ot_only}
                    onChange={(e) => setForm((p) => ({ ...p, income_ot_only: e.target.checked }))}
                  />
                  {t('schedule.manage.payroll.incomeOtOnly')}
                </label>
              </div>
            )}

            {(form.job_type === 'attendance_hr_report_pdf_email' ||
              form.job_type === 'hr_report_pdf_email' ||
              form.job_type === 'attendance_report_pdf_email') && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border-t pt-2">
                <label className="flex flex-col gap-1 text-sm md:col-span-3">
                  <span className="text-gray-600">{t('schedule.manage.recipientEmails')}</span>
                  <input
                    className="border rounded px-3 py-2"
                    value={form.recipient_emails}
                    onChange={(e) => setForm((p) => ({ ...p, recipient_emails: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">{t('schedule.manage.report.periodType')}</span>
                  <select
                    className="border rounded px-3 py-2"
                    value={form.period_type}
                    onChange={(e) => setForm((p) => ({ ...p, period_type: e.target.value }))}
                  >
                    <option value="daily">{t('schedule.manage.report.periodDaily')}</option>
                    <option value="monthly">{t('schedule.manage.report.periodMonthly')}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">{t('schedule.manage.report.format')}</span>
                  <select
                    className="border rounded px-3 py-2"
                    value={form.report_format}
                    onChange={(e) => setForm((p) => ({ ...p, report_format: e.target.value }))}
                  >
                    <option value="pdf">{t('schedule.manage.report.formatPdf')}</option>
                    <option value="html">{t('schedule.manage.report.formatHtml')}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">{t('schedule.manage.report.runOnDay')}</span>
                  <input
                    className="border rounded px-3 py-2"
                    type="number"
                    min={0}
                    max={28}
                    value={form.run_on_day}
                    onChange={(e) => setForm((p) => ({ ...p, run_on_day: Number(e.target.value) || 0 }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">{t('schedule.manage.report.months')}</span>
                  <input
                    className="border rounded px-3 py-2"
                    type="number"
                    min={1}
                    max={36}
                    value={form.report_months}
                    onChange={(e) => setForm((p) => ({ ...p, report_months: Number(e.target.value) || 12 }))}
                  />
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded border"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingScheduleId(null);
                }}
              >
                {t('schedule.manage.cancel')}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded bg-primary-600 text-white disabled:opacity-50"
                onClick={() => void onCreate()}
                disabled={saving}
              >
                {saving
                  ? t('common.loading')
                  : editingScheduleId
                    ? t('schedule.manage.saveChanges')
                    : t('schedule.manage.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">{t('schedule.manage.list')}</h3>
          <div className="flex items-center gap-2">
            <input
              className="text-sm border rounded px-2 py-1 w-52"
              placeholder={t('schedule.manage.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="button" className="text-sm px-2 py-1 border rounded" onClick={() => void load()}>
              {t('schedule.manage.reload')}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="text-sm text-gray-500">{t('common.loading')}</div>
        ) : (
          <div className="space-y-2">
            {pagedRows.map((r) => (
              <div key={r.id} className="border rounded-lg p-3 space-y-2 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm flex-1 min-w-0 space-y-1">
                    <div className="text-base font-semibold tracking-tight">{r.name}</div>
                    <div className="text-gray-600">
                      {jobTypeLabel(r.job_type)} / {r.time_local} / {r.timezone}
                    </div>
                    <div className="text-xs text-gray-400">
                      {t('schedule.manage.lastRunAt')}: {fmtDateTime(r.last_run_at)} / {t('schedule.manage.nextRunAt')}:{' '}
                      {fmtDateTime(r.next_run_at)}
                    </div>
                  </div>
                  <div className="text-center min-w-[180px] bg-gray-50 rounded-md p-2 border">
                    <div className="text-xs text-gray-500">{t('schedule.manage.usage')}</div>
                    <div
                      className={`text-sm font-semibold ${
                        r.enabled ? 'text-emerald-700' : 'text-gray-500'
                      }`}
                    >
                      {r.enabled ? t('schedule.manage.usageOn') : t('schedule.manage.usageOff')}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{t('schedule.manage.runStatus')}</div>
                    <div className="text-sm font-medium text-gray-700">
                      {runStatusLabel(r.id)}
                      {String(lastRunStatusBySchedule[r.id] || '').toLowerCase() === 'running' &&
                        progressTextFromMessage(lastRunMessageBySchedule[r.id]) && (
                          <span className="ml-1 text-blue-700">
                            ({progressTextFromMessage(lastRunMessageBySchedule[r.id])})
                          </span>
                        )}
                    </div>
                    {String(lastRunStatusBySchedule[r.id] || '').toLowerCase() === 'failed' && latestRunMessage(r.id) && (
                      <div className="text-xs text-red-600 mt-1">
                        {t('schedule.manage.failureReason')}: {latestRunMessage(r.id)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end min-w-[280px]">
                    <button
                      type="button"
                      className="px-2 py-1 border rounded text-xs"
                      onClick={() => void onToggle(r)}
                    >
                      {r.enabled ? t('schedule.manage.disable') : t('schedule.manage.enable')}
                    </button>
                    <button type="button" className="px-2 py-1 border rounded text-xs" onClick={() => void onRunNow(r)}>
                      {t('schedule.manage.runNow')}
                    </button>
                    <button type="button" className="px-2 py-1 border rounded text-xs" onClick={() => openEditModal(r)}>
                      {t('schedule.manage.edit')}
                    </button>
                    <button type="button" className="px-2 py-1 border rounded text-xs" onClick={() => void toggleRuns(r.id)}>
                      {expandedRuns[r.id] ? t('schedule.manage.hideRuns') : t('schedule.manage.showRuns')}
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 border rounded text-xs text-red-600"
                      onClick={() => void onDelete(r)}
                    >
                      {t('system.groups.delete')}
                    </button>
                  </div>
                </div>
                {expandedRuns[r.id] && (
                  <div className="border rounded bg-gray-50 p-2">
                    {runLoading[r.id] ? (
                      <div className="text-xs text-gray-500">{t('common.loading')}</div>
                    ) : (
                      <div className="text-xs">
                        {(() => {
                          const recent = (runsBySchedule[r.id] || []).slice(0, 5);
                          if (recent.length === 0) return <div className="text-gray-500">{t('schedule.manage.noRuns')}</div>;
                          return (
                            <div className="space-y-1">
                              {recent.map((run) => (
                                <div key={run.id} className="truncate">
                                  {t('schedule.manage.runStatus')}: {runHistoryStatusLabel(run.status)}
                                  {String(run.status || '').toLowerCase() === 'running' &&
                                    progressTextFromMessage(run.message) && (
                                      <span className="ml-1 text-blue-700">({progressTextFromMessage(run.message)})</span>
                                    )}{' '}
                                  / {t('schedule.manage.startedAt')}: {fmtDateTime(run.started_at)} / {t('schedule.manage.finishedAt')}:{' '}
                                  {fmtDateTime(run.finished_at)} / {t('schedule.manage.message')}: {run.message || '-'}
                                </div>
                              ))}
                              <div className="pt-1">
                                <button
                                  type="button"
                                  className="px-2 py-1 border rounded text-xs whitespace-nowrap"
                                  onClick={() => void openRunsModal(r)}
                                >
                                  {t('schedule.manage.more')}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {filteredRows.length === 0 && <div className="text-sm text-gray-500">{t('schedule.manage.empty')}</div>}
            {filteredRows.length > 0 && (
              <div className="flex items-center justify-between pt-1 text-xs text-gray-600">
                <div>
                  {t('schedule.manage.page')} {currentPage} / {totalPages}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="px-2 py-1 border rounded disabled:opacity-50"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {t('schedule.manage.prev')}
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 border rounded disabled:opacity-50"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    {t('schedule.manage.next')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {runsModalOpen && runsModalSchedule && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[85vh] overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {t('schedule.manage.runsModalTitle')}: {runsModalSchedule.name}
              </h3>
              <button type="button" className="px-2 py-1 border rounded" onClick={() => setRunsModalOpen(false)}>
                {t('schedule.manage.close')}
              </button>
            </div>
            {runLoading[runsModalSchedule.id] ? (
              <div className="text-sm text-gray-500">{t('common.loading')}</div>
            ) : (
              <div className="space-y-2">
                {(runsBySchedule[runsModalSchedule.id] || []).map((run) => (
                  <div key={run.id} className="text-xs border rounded bg-white p-2">
                    <div className="font-medium">
                      {t('schedule.manage.runStatus')}: {runHistoryStatusLabel(run.status)}
                    </div>
                    <div>
                      {t('schedule.manage.startedAt')}: {fmtDateTime(run.started_at)}
                    </div>
                    <div>
                      {t('schedule.manage.finishedAt')}: {fmtDateTime(run.finished_at)}
                    </div>
                    <div>
                      {t('schedule.manage.message')}: {run.message || '-'}
                    </div>
                    {(String(run.status || '').toLowerCase() === 'failed' ||
                      String(run.status || '').toLowerCase() === 'error') && (
                      <div className="text-red-600">
                        {t('schedule.manage.failureReason')}: {run.message || '-'}
                      </div>
                    )}
                  </div>
                ))}
                {(runsBySchedule[runsModalSchedule.id] || []).length === 0 && (
                  <div className="text-xs text-gray-500">{t('schedule.manage.noRuns')}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
