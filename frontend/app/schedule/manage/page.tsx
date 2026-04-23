'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

type JobType = 'attendance_ot_allowance_aggregate' | 'attendance_hr_report_pdf_email';

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

export default function ScheduleManagePage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<Array<{ id: number; username: string; full_name?: string }>>([]);
  const [companies, setCompanies] = useState<Array<{ id: number; company_code?: string; name_kor?: string }>>([]);
  const [runsBySchedule, setRunsBySchedule] = useState<Record<number, ScheduleRunRow[]>>({});
  const [expandedRuns, setExpandedRuns] = useState<Record<number, boolean>>({});
  const [runLoading, setRunLoading] = useState<Record<number, boolean>>({});
  const [form, setForm] = useState({
    name: '',
    job_type: 'attendance_ot_allowance_aggregate' as JobType,
    enabled: true,
    time_local: '09:00',
    timezone: 'Asia/Seoul',
    weekdays_mask: 62,
    run_as_user_id: 0,
    company_id: 0,
    recipient_emails: '',
  });

  const selectedUserOk = useMemo(() => form.run_as_user_id > 0, [form.run_as_user_id]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, u, c] = await Promise.all([
        apiClient.listJobSchedules(),
        apiClient.getSystemUsers(),
        apiClient.getCompanies(),
      ]);
      setRows((s.data as ScheduleRow[]) || []);
      setUsers(((u.data as any[]) || []).map((x) => ({ id: x.id, username: x.username, full_name: x.full_name })));
      setCompanies((c.data as any[]) || []);
      if (form.run_as_user_id === 0 && (u.data as any[])?.length > 0) {
        setForm((p) => ({ ...p, run_as_user_id: Number((u.data as any[])[0].id) }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onCreate = async () => {
    if (!selectedUserOk) {
      alert(t('schedule.manage.needRunUser'));
      return;
    }
    setSaving(true);
    try {
      await apiClient.createJobSchedule({
        name: form.name,
        job_type: form.job_type,
        enabled: form.enabled,
        time_local: form.time_local,
        timezone: form.timezone,
        weekdays_mask: form.weekdays_mask,
        run_as_user_id: form.run_as_user_id,
        company_id: form.company_id || null,
        payload:
          form.job_type === 'attendance_hr_report_pdf_email'
            ? { recipient_emails: form.recipient_emails.split(',').map((x) => x.trim()).filter(Boolean) }
            : { preserve_manual_ot: true, date_mode: 'last_7_days' },
      });
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
      await apiClient.runJobScheduleNow(row.id);
      alert(t('schedule.manage.runQueued'));
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

  const loadRuns = async (scheduleId: number) => {
    setRunLoading((p) => ({ ...p, [scheduleId]: true }));
    try {
      const res = await apiClient.listJobScheduleRuns(scheduleId, { limit: 20 });
      setRunsBySchedule((p) => ({ ...p, [scheduleId]: (res.data as ScheduleRunRow[]) || [] }));
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

  const fmtDateTime = (s?: string | null) => {
    if (!s) return '-';
    try {
      return new Date(s).toLocaleString();
    } catch {
      return String(s);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">{t('schedule.manage.title')}</h2>
        <p className="text-sm text-gray-500">{t('schedule.manage.subtitle')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input className="border rounded px-3 py-2" placeholder={t('schedule.manage.name')} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <select className="border rounded px-3 py-2" value={form.job_type} onChange={(e) => setForm((p) => ({ ...p, job_type: e.target.value as JobType }))}>
            <option value="attendance_ot_allowance_aggregate">{t('schedule.manage.jobType.aggregate')}</option>
            <option value="attendance_hr_report_pdf_email">{t('schedule.manage.jobType.report')}</option>
          </select>
          <input className="border rounded px-3 py-2" type="time" value={form.time_local} onChange={(e) => setForm((p) => ({ ...p, time_local: e.target.value }))} />
          <select className="border rounded px-3 py-2" value={form.run_as_user_id} onChange={(e) => setForm((p) => ({ ...p, run_as_user_id: Number(e.target.value) }))}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
          </select>
          <select className="border rounded px-3 py-2" value={form.company_id} onChange={(e) => setForm((p) => ({ ...p, company_id: Number(e.target.value) }))}>
            <option value={0}>{t('schedule.manage.companyAll')}</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.company_code || c.name_kor || c.id}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm px-2">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} />
            {t('schedule.manage.enabled')}
          </label>
        </div>
        {form.job_type === 'attendance_hr_report_pdf_email' && (
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder={t('schedule.manage.recipientEmails')}
            value={form.recipient_emails}
            onChange={(e) => setForm((p) => ({ ...p, recipient_emails: e.target.value }))}
          />
        )}
        <button className="px-4 py-2 rounded bg-primary-600 text-white disabled:opacity-50" onClick={onCreate} disabled={saving}>
          {saving ? t('common.loading') : t('schedule.manage.create')}
        </button>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">{t('schedule.manage.list')}</h3>
          <button className="text-sm px-2 py-1 border rounded" onClick={() => void load()}>{t('attendanceReport.reload')}</button>
        </div>
        {loading ? (
          <div className="text-sm text-gray-500">{t('common.loading')}</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="border rounded p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-gray-500">{r.job_type} / {r.time_local} / {r.timezone}</div>
                    <div className="text-xs text-gray-400">
                      {t('schedule.manage.lastRunAt')}: {fmtDateTime(r.last_run_at)} / {t('schedule.manage.nextRunAt')}: {fmtDateTime(r.next_run_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-2 py-1 border rounded text-sm" onClick={() => void onToggle(r)}>{r.enabled ? t('schedule.manage.disable') : t('schedule.manage.enable')}</button>
                    <button className="px-2 py-1 border rounded text-sm" onClick={() => void onRunNow(r)}>{t('schedule.manage.runNow')}</button>
                    <button className="px-2 py-1 border rounded text-sm" onClick={() => void toggleRuns(r.id)}>
                      {expandedRuns[r.id] ? t('schedule.manage.hideRuns') : t('schedule.manage.showRuns')}
                    </button>
                    <button className="px-2 py-1 border rounded text-sm text-red-600" onClick={() => void onDelete(r)}>{t('system.groups.delete')}</button>
                  </div>
                </div>
                {expandedRuns[r.id] && (
                  <div className="border rounded bg-gray-50 p-2">
                    {runLoading[r.id] ? (
                      <div className="text-xs text-gray-500">{t('common.loading')}</div>
                    ) : (
                      <div className="space-y-1">
                        {(runsBySchedule[r.id] || []).map((run) => (
                          <div key={run.id} className="text-xs border rounded bg-white p-2">
                            <div className="font-medium">{run.status}</div>
                            <div>{t('schedule.manage.startedAt')}: {fmtDateTime(run.started_at)}</div>
                            <div>{t('schedule.manage.finishedAt')}: {fmtDateTime(run.finished_at)}</div>
                            <div>{t('schedule.manage.message')}: {run.message || '-'}</div>
                          </div>
                        ))}
                        {(runsBySchedule[r.id] || []).length === 0 && (
                          <div className="text-xs text-gray-500">{t('schedule.manage.noRuns')}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {rows.length === 0 && <div className="text-sm text-gray-500">{t('schedule.manage.empty')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
