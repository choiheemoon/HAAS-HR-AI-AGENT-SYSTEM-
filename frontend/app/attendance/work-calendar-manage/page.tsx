'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Save } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

type Company = {
  id: number;
  name_kor?: string | null;
  name_eng?: string | null;
  company_code: string;
};

type Shift = {
  id: number;
  shift_code: string;
  title?: string;
};

type ShiftGroupMaster = {
  id: number;
  sort_order: number;
  name: string;
  description?: string;
};

type DayRow = {
  day_of_month: number;
  shift_code: string;
  is_workday: boolean;
};

type WorkCalendar = {
  calendar_year: number;
  calendar_month: number;
  shift_group_id: number;
  shift_group_name?: string;
  days: DayRow[];
};

type AttendanceBundle = {
  company_id: number;
  shifts?: Shift[];
  shift_group_masters?: ShiftGroupMaster[];
  work_calendars?: WorkCalendar[];
  holidays?: { holiday_date?: string; remarks?: string }[];
  [key: string]: any;
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const BASE_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 21 }, (_, i) => BASE_YEAR - 10 + i);

function dayOfWeekSun0(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default function AttendanceWorkCalendarManagePage() {
  const { t } = useI18n();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [bundle, setBundle] = useState<AttendanceBundle | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [shiftGroupId, setShiftGroupId] = useState<number | null>(null);
  const [copyFromYear, setCopyFromYear] = useState<number>(new Date().getFullYear());
  const [copyFromMonth, setCopyFromMonth] = useState<number>(new Date().getMonth() + 1);
  const [copyFromShiftGroupId, setCopyFromShiftGroupId] = useState<number | null>(null);
  const [bulkWeekdayCode, setBulkWeekdayCode] = useState<string>('');
  const [bulkSaturdayCode, setBulkSaturdayCode] = useState<string>('');
  const [bulkSundayCode, setBulkSundayCode] = useState<string>('');
  const [bulkHolidayCode, setBulkHolidayCode] = useState<string>('');
  const [bulkModalOpen, setBulkModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await apiClient.getCompanies();
        if (!alive) return;
        const rows = (Array.isArray(data) ? data : []) as Company[];
        setCompanies(rows);
        if (rows.length > 0) setCompanyId(rows[0].id);
      } catch (e: any) {
        setError(e?.response?.data?.detail || '회사 목록을 불러오지 못했습니다.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setShiftGroupId(null);
    setCopyFromShiftGroupId(null);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const { data } = await apiClient.getAttendanceStandard(companyId);
        if (!alive) return;
        const next = (data || {}) as AttendanceBundle;
        setBundle(next);
        const groups = (next.shift_group_masters || []) as ShiftGroupMaster[];
        const firstG = groups[0];
        setShiftGroupId((prev) => prev ?? firstG?.id ?? null);
        setCopyFromShiftGroupId((prev) => prev ?? firstG?.id ?? null);
      } catch (e: any) {
        setError(e?.response?.data?.detail || '근태 기준 정보를 불러오지 못했습니다.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [companyId]);

  const shifts = useMemo(() => bundle?.shifts || [], [bundle]);
  const shiftGroups = useMemo(() => bundle?.shift_group_masters || [], [bundle]);
  const renderShiftGroupLabel = (g: ShiftGroupMaster) =>
    g.description && String(g.description).trim() ? `${g.name} (${g.description})` : g.name;

  const selectedCalendar = useMemo(() => {
    const rows = bundle?.work_calendars || [];
    const sg = shiftGroupId != null ? Number(shiftGroupId) : null;
    return rows.find(
      (x) =>
        x.calendar_year === year &&
        x.calendar_month === month &&
        sg != null &&
        Number(x.shift_group_id) === sg
    );
  }, [bundle, year, month, shiftGroupId]);

  const dayMap = useMemo(() => {
    const m = new Map<number, DayRow>();
    for (const d of selectedCalendar?.days || []) m.set(d.day_of_month, d);
    return m;
  }, [selectedCalendar]);

  const shiftGroupAttendanceSummary = useMemo(() => {
    const days = selectedCalendar?.days || [];
    const totalDays = days.length;
    const workDays = days.filter((d) => d.is_workday).length;
    const holidays = totalDays - workDays;
    const assignedShiftDays = days.filter((d) => String(d.shift_code || '').trim() !== '').length;
    return {
      shiftGroupName:
        selectedCalendar?.shift_group_name ||
        shiftGroups.find((g) => Number(g.id) === Number(shiftGroupId || 0))?.name ||
        '-',
      totalDays,
      workDays,
      holidays,
      assignedShiftDays,
    };
  }, [selectedCalendar, shiftGroupId, shiftGroups]);

  const shiftAttendanceSummary = useMemo(() => {
    const out = new Map<string, { shiftCode: string; totalDays: number; workDays: number; holidays: number }>();
    for (const d of selectedCalendar?.days || []) {
      const code = String(d.shift_code || '').trim();
      if (!code) continue;
      const cur = out.get(code) || { shiftCode: code, totalDays: 0, workDays: 0, holidays: 0 };
      cur.totalDays += 1;
      if (d.is_workday) cur.workDays += 1;
      else cur.holidays += 1;
      out.set(code, cur);
    }
    return Array.from(out.values()).sort((a, b) => a.shiftCode.localeCompare(b.shiftCode));
  }, [selectedCalendar]);

  const monthDays = daysInMonth(year, month);
  const firstDow = dayOfWeekSun0(year, month, 1);
  const blanks = Array.from({ length: firstDow }, (_, i) => i);
  const dayList = Array.from({ length: monthDays }, (_, i) => i + 1);

  const { holidaySet, holidayRemarkByDate } = useMemo(() => {
    const set = new Set<string>();
    const remarks = new Map<string, string>();
    for (const h of bundle?.holidays || []) {
      const raw = String(h?.holiday_date || '').trim();
      if (!raw) continue;
      const key =
        raw.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(raw)
          ? raw.slice(0, 10)
          : (() => {
              const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
              if (!m) return '';
              const mm = m[1].padStart(2, '0');
              const dd = m[2].padStart(2, '0');
              return `${m[3]}-${mm}-${dd}`;
            })();
      if (!key) continue;
      set.add(key);
      const rm = String(h?.remarks || '').trim();
      if (rm) remarks.set(key, rm);
    }
    return { holidaySet: set, holidayRemarkByDate: remarks };
  }, [bundle]);

  const dateKey = (d: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const isHolidayByStandard = (d: number) => holidaySet.has(dateKey(d));

  // 신규 달력(회사·년·월·근무조) 진입 시 휴가(연휴) 정보를 기반으로 기본값 생성
  useEffect(() => {
    if (!bundle || !shiftGroupId) return;
    const sg = shiftGroupId != null ? Number(shiftGroupId) : null;
    const exists = (bundle.work_calendars || []).some(
      (x) =>
        x.calendar_year === year &&
        x.calendar_month === month && sg != null && Number(x.shift_group_id) === sg
    );
    if (exists) return;
    const gname =
      (bundle.shift_group_masters || []).find((g) => Number(g.id) === Number(shiftGroupId))?.name ||
      '';
    const defaults: DayRow[] = Array.from({ length: monthDays }, (_, i) => {
      const day = i + 1;
      const dow = new Date(year, month - 1, day).getDay();
      const holiday = isHolidayByStandard(day) || dow === 0; // 일요일 자동 휴일 처리
      return {
        day_of_month: day,
        shift_code: '',
        is_workday: !holiday,
      };
    });

    setBundle((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        work_calendars: [
          ...(prev.work_calendars || []),
          {
            calendar_year: year,
            calendar_month: month,
            shift_group_id: shiftGroupId,
            shift_group_name: gname,
            days: defaults,
          },
        ],
      };
    });
  }, [bundle, shiftGroupId, year, month, monthDays, holidaySet]);

  const updateDay = (day: number, patch: Partial<DayRow>) => {
    setBundle((prev) => {
      if (!prev || !shiftGroupId) return prev;
      const rows = [...(prev.work_calendars || [])];
      const sgid = Number(shiftGroupId);
      let idx = rows.findIndex(
        (x) =>
          x.calendar_year === year &&
          x.calendar_month === month &&
          Number(x.shift_group_id) === sgid
      );
      if (idx < 0) {
        const gname =
          (prev.shift_group_masters || []).find((g) => Number(g.id) === sgid)?.name || '';
        rows.push({
          calendar_year: year,
          calendar_month: month,
          shift_group_id: shiftGroupId,
          shift_group_name: gname,
          days: [],
        });
        idx = rows.length - 1;
      }
      const cal = { ...rows[idx], days: [...(rows[idx].days || [])] };
      const dayIdx = cal.days.findIndex((d) => d.day_of_month === day);
      if (dayIdx < 0) {
        cal.days.push({
          day_of_month: day,
          shift_code: patch.shift_code ?? '',
          is_workday: patch.is_workday ?? true,
        });
      } else {
        cal.days[dayIdx] = { ...cal.days[dayIdx], ...patch };
      }
      cal.days.sort((a, b) => a.day_of_month - b.day_of_month);
      rows[idx] = cal;
      return { ...prev, work_calendars: rows };
    });
  };

  const onSave = async () => {
    if (!companyId || !bundle) return;
    setSaving(true);
    setError('');
    try {
      const masters = bundle.shift_group_masters || [];
      const payload = {
        ...bundle,
        save_scope: 'all' as const,
        work_calendars: (bundle.work_calendars || []).map((wc) => {
          const wid = Number(wc.shift_group_id);
          const resolvedName =
            (wc.shift_group_name && String(wc.shift_group_name).trim()) ||
            masters.find((g) => Number(g.id) === wid)?.name ||
            '';
          return { ...wc, shift_group_name: resolvedName };
        }),
      };
      await apiClient.putAttendanceStandard(companyId, payload);
      alert('저장되었습니다.');
    } catch (e: any) {
      setError(e?.response?.data?.detail || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const persistBundle = async (nextBundle: AttendanceBundle, successMessage?: string) => {
    if (!companyId) return;
    setSaving(true);
    setError('');
    try {
      const masters = nextBundle.shift_group_masters || [];
      const payload = {
        ...nextBundle,
        save_scope: 'all' as const,
        work_calendars: (nextBundle.work_calendars || []).map((wc) => {
          const wid = Number(wc.shift_group_id);
          const resolvedName =
            (wc.shift_group_name && String(wc.shift_group_name).trim()) ||
            masters.find((g) => Number(g.id) === wid)?.name ||
            '';
          return { ...wc, shift_group_name: resolvedName };
        }),
      };
      await apiClient.putAttendanceStandard(companyId, payload);
      setBundle(nextBundle);
      if (successMessage) alert(successMessage);
    } catch (e: any) {
      setError(e?.response?.data?.detail || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const onCopy = async () => {
    if (!bundle || !shiftGroupId || !copyFromShiftGroupId) return;
    const src = (bundle.work_calendars || []).find(
      (x) =>
        x.calendar_year === copyFromYear &&
        x.calendar_month === copyFromMonth &&
        Number(x.shift_group_id) === Number(copyFromShiftGroupId)
    );
    if (!src) {
      setError('복사 원본 근무달력을 찾을 수 없습니다.');
      return;
    }
    const gname =
      (bundle.shift_group_masters || []).find((g) => Number(g.id) === Number(shiftGroupId))?.name || '';
    const nextRows = [...(bundle.work_calendars || [])];
    const targetIdx = nextRows.findIndex(
      (x) =>
        x.calendar_year === year &&
        x.calendar_month === month &&
        Number(x.shift_group_id) === Number(shiftGroupId)
    );
    const copiedDays = (src.days || []).map((d) => ({
      day_of_month: d.day_of_month,
      shift_code: d.shift_code || '',
      is_workday: !!d.is_workday,
    }));
    const target = {
      calendar_year: year,
      calendar_month: month,
      shift_group_id: Number(shiftGroupId),
      shift_group_name: gname,
      days: copiedDays,
    };
    if (targetIdx >= 0) nextRows[targetIdx] = target;
    else nextRows.push(target);
    await persistBundle({ ...bundle, work_calendars: nextRows }, '복사되었습니다.');
  };

  const onDeleteSelected = async () => {
    if (!bundle || !shiftGroupId) return;
    if (!window.confirm('조회 년월/근무조 근무달력을 삭제할까요?')) return;
    const nextRows = (bundle.work_calendars || []).filter(
      (x) =>
        !(
          x.calendar_year === year &&
          x.calendar_month === month &&
          Number(x.shift_group_id) === Number(shiftGroupId)
        )
    );
    await persistBundle({ ...bundle, work_calendars: nextRows }, '삭제되었습니다.');
  };

  const onDeleteYear = async () => {
    if (!bundle) return;
    if (!window.confirm(`${year}년 근무달력(선택 회사)을 전체 삭제할까요?`)) return;
    const nextRows = (bundle.work_calendars || []).filter((x) => x.calendar_year !== year);
    await persistBundle({ ...bundle, work_calendars: nextRows }, '삭제되었습니다.');
  };

  const onBulkFillSelectedMonth = () => {
    if (!bundle || !shiftGroupId) return;
    const sgid = Number(shiftGroupId);
    const rows = [...(bundle.work_calendars || [])];
    let idx = rows.findIndex(
      (x) => x.calendar_year === year && x.calendar_month === month && Number(x.shift_group_id) === sgid
    );
    if (idx < 0) return;
    const target = { ...rows[idx], days: [...(rows[idx].days || [])] };
    for (let d = 1; d <= monthDays; d += 1) {
      const dow = new Date(year, month - 1, d).getDay(); // 0 Sun ... 6 Sat
      const isHoliday = isHolidayByStandard(d) || dow === 0; // 일요일도 자동 휴일 체크
      let code = '';
      if (isHoliday && bulkHolidayCode) code = bulkHolidayCode;
      else if (dow === 0) code = bulkSundayCode;
      else if (dow === 6) code = bulkSaturdayCode;
      else code = bulkWeekdayCode;

      const di = target.days.findIndex((x) => x.day_of_month === d);
      if (di < 0) {
        target.days.push({ day_of_month: d, shift_code: code || '', is_workday: !isHoliday });
      } else {
        target.days[di] = {
          ...target.days[di],
          shift_code: code || target.days[di].shift_code,
          is_workday: !isHoliday,
        };
      }
    }
    target.days.sort((a, b) => a.day_of_month - b.day_of_month);
    rows[idx] = target;
    setBundle({ ...bundle, work_calendars: rows });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-sky-100 bg-gradient-to-r from-sky-50 via-indigo-50/50 to-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sky-900">
            <CalendarDays className="h-5 w-5" />
            <div className="text-sm font-semibold">근무달력관리</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onSave}
              disabled={!bundle || saving || !companyId}
              className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? t('common.loading') : '저장'}
            </button>
            <button
              onClick={() => void onDeleteSelected()}
              disabled={!bundle || saving || !shiftGroupId}
              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 disabled:opacity-50"
            >
              조회 년월/근무조 삭제
            </button>
            <button
              onClick={() => void onDeleteYear()}
              disabled={!bundle || saving}
              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 disabled:opacity-50"
            >
              조회년도 전체 삭제
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
          <select
            value={companyId ?? ''}
            onChange={(e) => setCompanyId(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_kor || c.name_eng || c.company_code}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={shiftGroupId ?? ''}
            onChange={(e) => setShiftGroupId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {shiftGroups.length === 0 ? (
              <option value="">근무조 먼저 등록 (근태기준·근무조 마스터)</option>
            ) : null}
            {shiftGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {renderShiftGroupLabel(g)}
              </option>
            ))}
          </select>
          <div className="text-xs text-slate-500 flex items-center px-1">
            회사·년·월·근무조를 선택한 뒤, 각 일자에 교대근무를 지정하고 저장하세요.
          </div>
        </div>
        <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
            <select
              value={copyFromYear}
              onChange={(e) => setCopyFromYear(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm lg:col-span-1"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={`copy-year-${y}`} value={y}>
                  원본 {y}년
                </option>
              ))}
            </select>
            <select
              value={copyFromMonth}
              onChange={(e) => setCopyFromMonth(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm lg:col-span-2"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  원본 {m}월
                </option>
              ))}
            </select>
            <select
              value={copyFromShiftGroupId ?? ''}
              onChange={(e) => setCopyFromShiftGroupId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm lg:col-span-2"
            >
              {shiftGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  원본 {renderShiftGroupLabel(g)}
                </option>
              ))}
            </select>
            <button
              onClick={() => void onCopy()}
              disabled={!bundle || saving || !shiftGroupId || !copyFromShiftGroupId}
              className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 disabled:opacity-50 lg:col-span-2"
            >
              선택 년월/근무조로 복사
            </button>
            <button
              onClick={() => {
                setCopyFromYear(year);
                setCopyFromMonth(month);
                setCopyFromShiftGroupId(shiftGroupId);
              }}
              disabled={!shiftGroupId}
              className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 disabled:opacity-50 lg:col-span-2"
            >
              원본=현재 조회값
            </button>
            <button
              onClick={() => setBulkModalOpen(true)}
              disabled={!bundle || saving || !shiftGroupId}
              className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-700 disabled:opacity-50 lg:col-span-2"
            >
              교대근무 일괄입력
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-6 lg:grid-cols-12">
        {MONTHS.map((m) => (
          <button
            key={m}
            onClick={() => setMonth(m)}
            className={`rounded-md px-2 py-2 text-sm ${
              month === m ? 'bg-sky-600 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {m}월
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        {loading ? (
          <div className="py-12 text-center text-slate-500">{t('common.loading')}</div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="rounded bg-slate-100 px-2 py-1 text-center text-xs font-semibold text-slate-600">
                {d}
              </div>
            ))}
            {blanks.map((b) => (
              <div key={`b-${b}`} />
            ))}
            {dayList.map((d) => {
              const row = dayMap.get(d);
              const isHoliday = row ? !row.is_workday : isHolidayByStandard(d);
              const isSunday = new Date(year, month - 1, d).getDay() === 0;
              const dk = dateKey(d);
              const statutoryHolidayRemark = holidayRemarkByDate.get(dk) || '';
              return (
                <div
                  key={d}
                  className={`min-w-0 overflow-hidden rounded-md border p-2 ${
                    isHoliday
                      ? 'border-red-300 bg-red-50/70'
                      : isSunday
                      ? 'border-emerald-300 bg-emerald-50/70'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="mb-1 text-xs font-semibold text-slate-700">{d}</div>
                  <select
                    value={row?.shift_code || ''}
                    onChange={(e) => updateDay(d, { shift_code: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white px-1 py-1 text-xs"
                    disabled={!shiftGroupId}
                  >
                    <option value="">-</option>
                    {shifts.map((s) => (
                      <option key={s.shift_code} value={s.shift_code}>
                        {s.shift_code}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 min-w-0">
                    <label className="flex items-start gap-1 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={isHoliday}
                        onChange={(e) => updateDay(d, { is_workday: !e.target.checked })}
                        disabled={!shiftGroupId}
                      />
                      <span className="shrink-0">휴일</span>
                      {holidaySet.has(dk) && statutoryHolidayRemark ? (
                        <span
                          className="min-w-0 flex-1 truncate text-left text-[10px] font-medium leading-tight text-red-900/90"
                          title={statutoryHolidayRemark}
                        >
                          {statutoryHolidayRemark}
                        </span>
                      ) : null}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-900 mb-2">근무조별 근태현황</div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="px-2 py-2 text-left">근무조</th>
                  <th className="px-2 py-2 text-right">대상 일수</th>
                  <th className="px-2 py-2 text-right">근무일</th>
                  <th className="px-2 py-2 text-right">휴일</th>
                  <th className="px-2 py-2 text-right">교대 지정일</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  <td className="px-2 py-1.5">{shiftGroupAttendanceSummary.shiftGroupName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{shiftGroupAttendanceSummary.totalDays}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{shiftGroupAttendanceSummary.workDays}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{shiftGroupAttendanceSummary.holidays}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{shiftGroupAttendanceSummary.assignedShiftDays}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-900 mb-2">교대근무별 근태현황</div>
          <div className="overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="px-2 py-2 text-left">교대근무</th>
                  <th className="px-2 py-2 text-right">지정 일수</th>
                  <th className="px-2 py-2 text-right">근무일</th>
                  <th className="px-2 py-2 text-right">휴일</th>
                </tr>
              </thead>
              <tbody>
                {shiftAttendanceSummary.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-500">교대근무 지정 데이터가 없습니다.</td>
                  </tr>
                ) : shiftAttendanceSummary.map((row, idx) => (
                  <tr key={row.shiftCode} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-1.5">{row.shiftCode}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.totalDays}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.workDays}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.holidays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {bulkModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">조회 년월 일괄입력</div>
              <button
                onClick={() => setBulkModalOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
              >
                닫기
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <select
                value={bulkWeekdayCode}
                onChange={(e) => setBulkWeekdayCode(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">평일 교대(선택)</option>
                {shifts.map((s) => (
                  <option key={`wd-modal-${s.shift_code}`} value={s.shift_code}>
                    평일 {s.shift_code}
                  </option>
                ))}
              </select>
              <select
                value={bulkSaturdayCode}
                onChange={(e) => setBulkSaturdayCode(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">토요일 교대(선택)</option>
                {shifts.map((s) => (
                  <option key={`sat-modal-${s.shift_code}`} value={s.shift_code}>
                    토 {s.shift_code}
                  </option>
                ))}
              </select>
              <select
                value={bulkSundayCode}
                onChange={(e) => setBulkSundayCode(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">일요일 교대(선택)</option>
                {shifts.map((s) => (
                  <option key={`sun-modal-${s.shift_code}`} value={s.shift_code}>
                    일 {s.shift_code}
                  </option>
                ))}
              </select>
              <select
                value={bulkHolidayCode}
                onChange={(e) => setBulkHolidayCode(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">휴일 교대(선택)</option>
                {shifts.map((s) => (
                  <option key={`hol-modal-${s.shift_code}`} value={s.shift_code}>
                    휴일 {s.shift_code}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => setBulkModalOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              >
                취소
              </button>
              <button
                onClick={() => {
                  onBulkFillSelectedMonth();
                  setBulkModalOpen(false);
                }}
                disabled={!bundle || saving || !shiftGroupId}
                className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-700 disabled:opacity-50"
              >
                조회 년월 일괄입력 적용
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
    </div>
  );
}
