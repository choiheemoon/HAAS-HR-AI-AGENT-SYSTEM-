'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, getEmployeePhotoThumbnailUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';

type ApiPunchRow = {
  id_time_in_out: number;
  id_card?: string | null;
  date_i?: string | null;
  date_in_out?: string | null;
  id_sin_out?: number | null;
  user_change?: string | null;
  machine_no?: string | null;
  location?: string | null;
  add_memo?: string | null;
};

type DraftRow = {
  clientKey: string;
  id_time_in_out?: number;
  id_card: string;
  time_hhmm: string;
  id_sin_out: number;
  add_memo: string;
  machine_no: string;
  location: string;
  user_change?: string | null;
};

function effectivePunchIso(r: Pick<ApiPunchRow, 'date_in_out' | 'date_i'>): string | null {
  return r.date_in_out || r.date_i || null;
}

function localDateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatHHmm(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeTimeInput(s: string): string {
  const t = s.trim();
  if (!t) return '';
  const digitsOnly = t.replace(/\D/g, '');
  if (digitsOnly && /^\d+$/.test(digitsOnly) && digitsOnly.length <= 4) {
    if (digitsOnly.length <= 2) {
      const h = Math.min(23, Math.max(0, parseInt(digitsOnly, 10) || 0));
      return `${String(h).padStart(2, '0')}:00`;
    }
    if (digitsOnly.length === 3) {
      const h = Math.min(23, Math.max(0, parseInt(digitsOnly.slice(0, 1), 10) || 0));
      const min = Math.min(59, Math.max(0, parseInt(digitsOnly.slice(1), 10) || 0));
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    const h = Math.min(23, Math.max(0, parseInt(digitsOnly.slice(0, 2), 10) || 0));
    const min = Math.min(59, Math.max(0, parseInt(digitsOnly.slice(2), 10) || 0));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const m = /^(\d{1,2})\s*:\s*(\d{1,2})$/.exec(t);
  if (!m) return '';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10) || 0));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function parseHHMMAsLocalIso(dateKey: string, hhmm: string): string | null {
  const s = normalizeTimeInput(hhmm);
  if (!s) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const [y, mo, da] = dateKey.split('-').map(Number);
  if (!y || !mo || !da) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(da)}T${pad(h)}:${pad(min)}:00`;
}

function dayStartIso(dateKey: string): string | null {
  const [y, mo, da] = dateKey.split('-').map(Number);
  if (!y || !mo || !da) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(da)}T00:00:00`;
}

function newClientKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function apiRowToDraft(r: ApiPunchRow): DraftRow {
  const iso = effectivePunchIso(r);
  return {
    clientKey: `id-${r.id_time_in_out}`,
    id_time_in_out: r.id_time_in_out,
    id_card: String(r.id_card ?? '').trim(),
    time_hhmm: iso ? formatHHmm(iso) : '',
    id_sin_out: r.id_sin_out === 1 ? 1 : 2,
    add_memo: String(r.add_memo ?? '').trim(),
    machine_no: String(r.machine_no ?? '').trim(),
    location: String(r.location ?? '').trim(),
    user_change: r.user_change ?? null,
  };
}

function emptyDraftRow(defaultIdCard: string): DraftRow {
  return {
    clientKey: newClientKey(),
    id_card: defaultIdCard,
    time_hhmm: '',
    id_sin_out: 2,
    add_memo: '',
    machine_no: '',
    location: '',
  };
}

function serializeRows(list: DraftRow[]): string {
  return JSON.stringify(
    list.map((r) => ({
      id: r.id_time_in_out ?? null,
      id_card: r.id_card,
      time: r.time_hhmm,
      sin: r.id_sin_out,
      memo: r.add_memo,
      mach: r.machine_no,
      loc: r.location,
    }))
  );
}

export type AttendanceStatusInquiryAddTimeModalProps = {
  open: boolean;
  onClose: () => void;
  employeeId: number;
  employeeNumber: string;
  employeeName: string;
  defaultSwipeCard?: string | null;
  initialWorkDay: string;
  canWrite: boolean;
  canDelete: boolean;
  onSaved?: () => void;
};

export default function AttendanceStatusInquiryAddTimeModal({
  open,
  onClose,
  employeeId,
  employeeNumber,
  employeeName,
  defaultSwipeCard,
  initialWorkDay,
  canWrite,
  canDelete,
  onSaved,
}: AttendanceStatusInquiryAddTimeModalProps) {
  const { t } = useI18n();
  const [workDay, setWorkDay] = useState(initialWorkDay);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [baseline, setBaseline] = useState('');
  const lastLoadedRef = useRef<DraftRow[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultCard = useMemo(
    () => String(defaultSwipeCard ?? '').trim().slice(0, 20),
    [defaultSwipeCard]
  );

  const loadForDate = useCallback(
    async (ymd: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        setRows([]);
        setBaseline(serializeRows([]));
        return;
      }
      setLoading(true);
      try {
        const { data } = await apiClient.getAttendanceTimeInOut({
          employee_id: employeeId,
          date_from: ymd,
          date_to: ymd,
        });
        const items = ((data as { items?: ApiPunchRow[] })?.items || []).filter((r) => {
          const iso = effectivePunchIso(r);
          if (!iso) return false;
          return localDateKeyFromIso(iso) === ymd;
        });
        items.sort((a, b) => {
          const ia = effectivePunchIso(a);
          const ib = effectivePunchIso(b);
          const ta = ia ? new Date(ia).getTime() : 0;
          const tb = ib ? new Date(ib).getTime() : 0;
          return ta - tb || (a.id_time_in_out ?? 0) - (b.id_time_in_out ?? 0);
        });
        const next = items.map(apiRowToDraft);
        lastLoadedRef.current = next.map((r) => ({ ...r }));
        setRows(next);
        setBaseline(serializeRows(next));
        setSelectedIdx(0);
      } catch {
        lastLoadedRef.current = [];
        setRows([]);
        setBaseline(serializeRows([]));
      } finally {
        setLoading(false);
      }
    },
    [employeeId]
  );

  useEffect(() => {
    if (!open) return;
    void loadForDate(workDay.slice(0, 10));
  }, [open, workDay, loadForDate]);

  const dirty = serializeRows(rows) !== baseline;
  const selectedRow = rows[selectedIdx] ?? null;

  const onAddRow = () => {
    if (!canWrite) return;
    setRows((prev) => {
      const card = prev[0]?.id_card?.trim() || defaultCard;
      const next = [...prev, emptyDraftRow(card)];
      setSelectedIdx(next.length - 1);
      return next;
    });
  };

  const onDeleteSelected = async () => {
    if (!selectedRow || !canWrite) return;
    if (selectedIdx < 0 || selectedIdx >= rows.length) return;
    if (!canDelete && selectedRow.id_time_in_out) {
      alert(t('attendanceStatusInquiry.addTime.noDeletePermission'));
      return;
    }
    if (selectedRow.id_time_in_out) {
      if (!confirm(t('attendanceStatusInquiry.addTime.confirmDelete'))) return;
      setSaving(true);
      try {
        await apiClient.deleteAttendanceTimeInOut(selectedRow.id_time_in_out);
        onSaved?.();
        await loadForDate(workDay.slice(0, 10));
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        alert(typeof msg === 'string' ? msg : t('attendanceStatusInquiry.addTime.deleteError'));
      } finally {
        setSaving(false);
      }
      return;
    }
    const next = rows.filter((_, i) => i !== selectedIdx);
    setRows(next);
    setSelectedIdx(Math.min(selectedIdx, Math.max(0, next.length - 1)));
  };

  const sameInstant = (a: string | null | undefined, b: string | null | undefined) => {
    if (!a || !b) return false;
    return new Date(a).getTime() === new Date(b).getTime();
  };

  const onSave = async () => {
    if (!canWrite) return;
    const ymd = workDay.slice(0, 10);
    const dayI = dayStartIso(ymd);
    if (!dayI) {
      alert(t('attendanceStatusInquiry.addTime.invalidDate'));
      return;
    }

    for (const r of rows) {
      if (!r.time_hhmm.trim()) {
        if (r.id_time_in_out) {
          alert(t('attendanceStatusInquiry.addTime.emptyTimeExisting'));
          return;
        }
      }
    }
    for (const r of rows) {
      if (!r.time_hhmm.trim()) continue;
      const chk = parseHHMMAsLocalIso(ymd, r.time_hhmm);
      if (!chk) {
        alert(t('attendanceStatusInquiry.addTime.invalidTime'));
        return;
      }
    }

    setSaving(true);
    try {
      const origList = lastLoadedRef.current;
      const origById = new Map<number, DraftRow>();
      for (const o of origList) {
        if (o.id_time_in_out) origById.set(o.id_time_in_out, o);
      }

      for (const r of rows) {
        const iso = r.time_hhmm.trim() ? parseHHMMAsLocalIso(ymd, r.time_hhmm) : null;
        if (!iso) continue;

        if (r.id_time_in_out) {
          const orig = origById.get(r.id_time_in_out);
          const prevIso = orig ? parseHHMMAsLocalIso(ymd, orig.time_hhmm) : null;
          const changed =
            !orig ||
            !sameInstant(prevIso, iso) ||
            orig.id_card !== r.id_card ||
            orig.id_sin_out !== r.id_sin_out ||
            orig.add_memo !== r.add_memo ||
            orig.machine_no !== r.machine_no ||
            orig.location !== r.location;
          if (changed) {
            await apiClient.updateAttendanceTimeInOut(r.id_time_in_out, {
              date_i: dayI,
              date_in_out: iso,
              id_card: r.id_card.trim() || undefined,
              id_sin_out: r.id_sin_out,
              add_memo: r.add_memo.trim() || undefined,
              machine_no: r.machine_no.trim() || undefined,
              location: r.location.trim() || undefined,
            });
          }
        } else {
          await apiClient.createAttendanceTimeInOut(employeeId, {
            date_i: dayI,
            date_in_out: iso,
            id_card: r.id_card.trim() || undefined,
            id_sin_out: r.id_sin_out,
            add_memo: r.add_memo.trim() || undefined,
            machine_no: r.machine_no.trim() || undefined,
            location: r.location.trim() || undefined,
          });
        }
      }

      const curIds = new Set(rows.map((r) => r.id_time_in_out).filter((x): x is number => x != null));
      for (const o of origList) {
        if (o.id_time_in_out && !curIds.has(o.id_time_in_out)) {
          await apiClient.deleteAttendanceTimeInOut(o.id_time_in_out);
        }
      }

      await loadForDate(ymd);
      alert(t('attendanceStatusInquiry.addTime.saved'));
      onSaved?.();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof msg === 'string' ? msg : t('attendanceStatusInquiry.addTime.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (dirty && !confirm(t('attendanceStatusInquiry.addTime.confirmDiscard'))) return;
    onClose();
  };

  if (!open) return null;

  const title = `${employeeNumber} ${employeeName}`.trim();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-2"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-time-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className="flex max-h-[min(92vh,720px)] w-full max-w-4xl flex-col rounded-lg border border-slate-300 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start gap-3 border-b border-slate-200 px-3 py-2.5">
          <img
            src={getEmployeePhotoThumbnailUrl(employeeId)}
            alt=""
            className="h-14 w-14 shrink-0 rounded border border-slate-200 object-cover"
          />
          <div className="min-w-0 flex-1">
            <h2 id="add-time-modal-title" className="text-sm font-semibold text-slate-900 truncate">
              {title}
            </h2>
            <p className="text-[11px] text-slate-500">{t('attendanceStatusInquiry.addTime.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
              <span>{t('attendanceStatusInquiry.col.date')}</span>
              <input
                type="date"
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                value={workDay.slice(0, 10)}
                onChange={(e) => setWorkDay(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-1.5 pt-4">
              <button
                type="button"
                className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-50"
                disabled={!canWrite || saving}
                onClick={onAddRow}
              >
                {t('attendanceStatusInquiry.addTime.add')}
              </button>
              <button
                type="button"
                className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                disabled={!canWrite || saving || rows.length === 0}
                onClick={() => void onDeleteSelected()}
              >
                {t('attendanceStatusInquiry.addTime.delete')}
              </button>
              <button
                type="button"
                className="rounded border border-sky-600 bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                disabled={!canWrite || saving || !dirty}
                onClick={() => void onSave()}
              >
                {t('attendanceStatusInquiry.addTime.save')}
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                disabled={saving}
                onClick={requestClose}
              >
                {t('attendanceStatusInquiry.addTime.close')}
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">{t('common.loading')}</div>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-800 text-left text-white">
                  <th className="border border-slate-600 px-1.5 py-1.5">{t('attendanceStatusInquiry.addTime.col.code')}</th>
                  <th className="border border-slate-600 px-1.5 py-1.5 w-[4.5rem]">{t('attendanceStatusInquiry.addTime.col.time')}</th>
                  <th className="border border-slate-600 px-1.5 py-1.5 w-[6.5rem]">{t('attendanceStatusInquiry.addTime.col.status')}</th>
                  <th className="border border-slate-600 px-1.5 py-1.5">{t('attendanceStatusInquiry.addTime.col.note')}</th>
                  <th className="border border-slate-600 px-1.5 py-1.5">{t('attendanceStatusInquiry.addTime.col.machine')}</th>
                  <th className="border border-slate-600 px-1.5 py-1.5">{t('attendanceStatusInquiry.addTime.col.userChange')}</th>
                  <th className="border border-slate-600 px-1.5 py-1.5">{t('attendanceStatusInquiry.addTime.col.location')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border border-slate-200 px-2 py-6 text-center text-slate-500">
                      {t('attendanceStatusInquiry.addTime.emptyDay')}
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => (
                    <tr
                      key={r.clientKey}
                      className={cn(
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50',
                        selectedIdx === idx && 'bg-sky-100 outline outline-1 outline-sky-400'
                      )}
                      onClick={() => setSelectedIdx(idx)}
                    >
                      <td className="border border-slate-200 px-1 py-0.5">
                        <input
                          className="w-full bg-transparent px-1 py-0.5 font-mono text-[11px] outline-none focus:bg-white"
                          value={r.id_card}
                          onChange={(e) => {
                            const v = e.target.value.slice(0, 20);
                            setRows((prev) => {
                              const n = [...prev];
                              if (n[idx]) n[idx] = { ...n[idx], id_card: v };
                              return n;
                            });
                          }}
                          disabled={!canWrite}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-0.5">
                        <input
                          className="w-full bg-transparent px-1 py-0.5 text-center font-mono tabular-nums outline-none focus:bg-white"
                          placeholder="HH:mm"
                          value={r.time_hhmm}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRows((prev) => {
                              const n = [...prev];
                              if (n[idx]) n[idx] = { ...n[idx], time_hhmm: v };
                              return n;
                            });
                          }}
                          onBlur={() => {
                            setRows((prev) => {
                              const cur = prev[idx]?.time_hhmm ?? '';
                              const norm = normalizeTimeInput(cur);
                              if (!norm || norm === cur) return prev;
                              const n = [...prev];
                              if (n[idx]) n[idx] = { ...n[idx], time_hhmm: norm };
                              return n;
                            });
                          }}
                          disabled={!canWrite}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-0.5">
                        <select
                          className="w-full max-w-[6.5rem] bg-transparent text-[11px] outline-none"
                          value={r.id_sin_out}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10) === 1 ? 1 : 2;
                            setRows((prev) => {
                              const n = [...prev];
                              if (n[idx]) n[idx] = { ...n[idx], id_sin_out: v };
                              return n;
                            });
                          }}
                          disabled={!canWrite}
                        >
                          <option value={1}>{t('attendanceStatusInquiry.addTime.source.scanner')}</option>
                          <option value={2}>{t('attendanceStatusInquiry.addTime.source.manual')}</option>
                        </select>
                      </td>
                      <td className="border border-slate-200 px-1 py-0.5">
                        <input
                          className="w-full bg-transparent px-1 py-0.5 outline-none focus:bg-white"
                          value={r.add_memo}
                          onChange={(e) => {
                            const v = e.target.value.slice(0, 200);
                            setRows((prev) => {
                              const n = [...prev];
                              if (n[idx]) n[idx] = { ...n[idx], add_memo: v };
                              return n;
                            });
                          }}
                          disabled={!canWrite}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-0.5">
                        <input
                          className="w-full bg-transparent px-1 py-0.5 font-mono text-[11px] outline-none focus:bg-white"
                          value={r.machine_no}
                          onChange={(e) => {
                            const v = e.target.value.slice(0, 20);
                            setRows((prev) => {
                              const n = [...prev];
                              if (n[idx]) n[idx] = { ...n[idx], machine_no: v };
                              return n;
                            });
                          }}
                          disabled={!canWrite}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-0.5 text-slate-600">{r.user_change ?? '—'}</td>
                      <td className="border border-slate-200 px-1 py-0.5">
                        <input
                          className="w-full bg-transparent px-1 py-0.5 outline-none focus:bg-white"
                          value={r.location}
                          onChange={(e) => {
                            const v = e.target.value.slice(0, 255);
                            setRows((prev) => {
                              const n = [...prev];
                              if (n[idx]) n[idx] = { ...n[idx], location: v };
                              return n;
                            });
                          }}
                          disabled={!canWrite}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-600">
          <span>{t('attendanceStatusInquiry.addTime.record')}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-40"
              disabled={rows.length === 0}
              onClick={() => setSelectedIdx(0)}
            >
              |◀
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-40"
              disabled={selectedIdx <= 0}
              onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
            >
              ◀
            </button>
            <span className="min-w-[4.5rem] text-center font-mono tabular-nums">
              {rows.length === 0 ? '0 / 0' : `${selectedIdx + 1} / ${rows.length}`}
            </span>
            <button
              type="button"
              className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-40"
              disabled={selectedIdx < 0 || selectedIdx >= rows.length - 1}
              onClick={() => setSelectedIdx((i) => Math.min(rows.length - 1, i + 1))}
            >
              ▶
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-40"
              disabled={rows.length === 0}
              onClick={() => setSelectedIdx(rows.length - 1)}
            >
              ▶|
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
