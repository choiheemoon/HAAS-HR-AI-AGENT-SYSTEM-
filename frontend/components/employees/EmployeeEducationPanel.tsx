'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';

export type EmployeeEducationRecord = {
  id: number;
  employee_id: number;
  sort_order: number;
  degree: string | null;
  field_of_study: string | null;
  institution: string | null;
  nationality: string | null;
  from_date?: string | null;
  to_date?: string | null;
  from_year: number | null;
  to_year: number | null;
  grade: string | null;
  note: string | null;
  educational_qualification: string | null;
};

type DraftRow = EmployeeEducationRecord;
type EducationRefField = 'degree' | 'field_of_study' | 'institution' | 'nationality';
type MinorOption = {
  id: number;
  minor_code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
  note?: string | null;
  code_definition_type?: 'User Defined' | 'System Defined';
};

function str(v: string | null | undefined) {
  return v ?? '';
}

function yearStr(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '';
  return String(v);
}

function dateStr(v: string | null | undefined, year: number | null | undefined) {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (year && Number.isFinite(year)) return `${year}-01-01`;
  return '';
}

function parseYear(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function localizeDeleteDetail(detail: string, t: (key: string) => string): string {
  const d = (detail || '').toLowerCase();
  if (
    d.includes('사용 중이라 삭제할 수 없습니다') ||
    d.includes('foreign key') ||
    d.includes('23503') ||
    d.includes('referenced') ||
    d.includes('restrict')
  ) {
    return t('employees.reference.deleteBlockedByUsage');
  }
  return detail;
}

function rowToApiPayload(r: DraftRow): Record<string, unknown> {
  const fromDate = r.from_date || null;
  const toDate = r.to_date || null;
  const fromYear = fromDate ? parseInt(fromDate.slice(0, 4), 10) : r.from_year;
  const toYear = toDate ? parseInt(toDate.slice(0, 4), 10) : r.to_year;
  return {
    degree: r.degree || null,
    field_of_study: r.field_of_study || null,
    institution: r.institution || null,
    nationality: r.nationality || null,
    from_date: fromDate,
    to_date: toDate,
    from_year: Number.isFinite(fromYear as number) ? fromYear : null,
    to_year: Number.isFinite(toYear as number) ? toYear : null,
    grade: r.grade || null,
    note: r.note || null,
    educational_qualification: r.educational_qualification || null,
  };
}

interface Props {
  employeeId: number;
  companyId?: number | null;
  /** 직원 상세(학력 하단 필드 초기값·동기화) */
  activityStudy: string | null | undefined;
  certificate: string | null | undefined;
  locked: boolean;
  t: (key: string) => string;
  /** 저장 후 상위에서 직원 상세 재조회(하단 필드·헤더 동기화) */
  onSaved?: () => void;
  /** 상위 툴바(추가/삭제/저장/취소) 바인딩 */
  onBindToolbarActions?: (actions: {
    add: () => Promise<void>;
    del: () => Promise<void>;
    save: () => Promise<void>;
    cancel: () => Promise<void>;
  }) => void;
}

export default function EmployeeEducationPanel({
  employeeId,
  companyId,
  activityStudy: activityStudyProp,
  certificate: certificateProp,
  locked,
  t,
  onSaved,
  onBindToolbarActions,
}: Props) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activityStudy, setActivityStudy] = useState(str(activityStudyProp));
  const [certificate, setCertificate] = useState(str(certificateProp));
  const [minorOptionsByCategory, setMinorOptionsByCategory] = useState<
    Record<EducationRefField, MinorOption[]>
  >({
    degree: [],
    field_of_study: [],
    institution: [],
    nationality: [],
  });
  const [majorIdByField, setMajorIdByField] = useState<Record<EducationRefField, number | null>>({
    degree: null,
    field_of_study: null,
    institution: null,
    nationality: null,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerField, setPickerField] = useState<EducationRefField>('degree');
  const [pickerRowId, setPickerRowId] = useState<number | null>(null);
  const [pickerQ, setPickerQ] = useState('');
  const [pickerPanel, setPickerPanel] = useState<'none' | 'add' | 'edit'>('none');
  const [pickerEditingId, setPickerEditingId] = useState<number | null>(null);
  const [pickerDraft, setPickerDraft] = useState({
    minor_code: '',
    code_definition_type: 'User Defined' as 'User Defined' | 'System Defined',
    name_kor: '',
    name_eng: '',
    name_thai: '',
    note: '',
  });
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const toolbarActionRefs = useRef({
    add: async () => {},
    del: async () => {},
    save: async () => {},
    cancel: async () => {},
  });

  const sorted = useMemo(() => [...rows].sort((a, b) => a.sort_order - b.sort_order), [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getEmployeeEducations(employeeId);
      setRows(res.data as EmployeeEducationRecord[]);
      setSelectedIndex(0);
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActivityStudy(str(activityStudyProp));
    setCertificate(str(certificateProp));
  }, [activityStudyProp, certificateProp]);

  useEffect(() => {
    if (sorted.length === 0) {
      setSelectedIndex(0);
    } else if (selectedIndex >= sorted.length) {
      setSelectedIndex(sorted.length - 1);
    }
  }, [sorted.length, selectedIndex]);

  const selectedRow = sorted[selectedIndex] ?? null;
  const displayNo = selectedRow ? selectedIndex + 1 : 0;
  const uiLocked = locked || saving;
  const pickerOptions = minorOptionsByCategory[pickerField] ?? [];
  const pickerFiltered = useMemo(() => {
    const s = pickerQ.trim().toLowerCase();
    if (!s) return pickerOptions;
    return pickerOptions.filter((o) => {
      const label = o.name_kor || o.name_eng || o.name_thai || o.minor_code;
      return (
        o.minor_code.toLowerCase().includes(s) ||
        label.toLowerCase().includes(s) ||
        (o.name_kor || '').toLowerCase().includes(s) ||
        (o.name_eng || '').toLowerCase().includes(s) ||
        (o.name_thai || '').toLowerCase().includes(s)
      );
    });
  }, [pickerOptions, pickerQ]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await apiClient.bulkSaveEmployeeEducations(employeeId, {
        education_activity_study: activityStudy || null,
        education_certificate: certificate || null,
        rows: rows.map((r) => ({
          id: r.id,
          ...rowToApiPayload(r),
        })),
      });
      setRows((res.data as EmployeeEducationRecord[]) ?? rows);
      onSaved?.();
      alert(t('employees.education.savedServer'));
    } catch (e) {
      alert(t('employees.education.saveError'));
    } finally {
      setSaving(false);
    }
  }, [activityStudy, certificate, employeeId, onSaved, rows, t, saving]);

  const handleNew = useCallback(async () => {
    if (saving) return;
    try {
      await apiClient.createEmployeeEducation(employeeId, {});
      await load();
      setSelectedIndex(0);
    } catch (e) {
      alert(t('employees.education.saveError'));
    }
  }, [employeeId, load, t, saving]);

  const handleDelete = useCallback(async () => {
    if (saving) return;
    if (!selectedRow) return;
    if (!window.confirm(t('employees.education.confirmDelete'))) return;
    try {
      await apiClient.deleteEmployeeEducation(employeeId, selectedRow.id);
      await load();
    } catch (e) {
      alert(t('employees.education.saveError'));
    }
  }, [employeeId, load, selectedRow, t, saving]);

  const goFirst = () => sorted.length && setSelectedIndex(0);
  const goPrev = () => selectedIndex > 0 && setSelectedIndex(selectedIndex - 1);
  const goNext = () =>
    selectedIndex < sorted.length - 1 && setSelectedIndex(selectedIndex + 1);
  const goLast = () => sorted.length && setSelectedIndex(sorted.length - 1);

  useEffect(() => {
    toolbarActionRefs.current = {
      add: handleNew,
      del: handleDelete,
      save: handleSave,
      cancel: load,
    };
  }, [handleNew, handleDelete, handleSave, load]);

  useEffect(() => {
    if (!onBindToolbarActions) return;
    onBindToolbarActions({
      add: async () => toolbarActionRefs.current.add(),
      del: async () => toolbarActionRefs.current.del(),
      save: async () => toolbarActionRefs.current.save(),
      cancel: async () => toolbarActionRefs.current.cancel(),
    });
  }, [onBindToolbarActions]);

  useEffect(() => {
    if (!companyId) return;
    void (async () => {
      try {
        const res = await apiClient.getMajorCodes({ company_id: companyId });
        const majors = (res.data as Array<{ id: number; major_code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>) ?? [];

        const findMajorId = (...keywords: string[]) =>
          majors.find((m) => {
            const pool = `${m.major_code} ${m.name_kor ?? ''} ${m.name_eng ?? ''} ${m.name_thai ?? ''}`.toLowerCase();
            return keywords.some((k) => pool.includes(k.toLowerCase()));
          })?.id;

        const degreeMajorId = findMajorId('학력코드', 'degree');
        const majorMajorId = findMajorId('전공코드', 'major');
        const schoolMajorId = findMajorId('학교코드', 'school', 'institution');
        const nationMajorId = findMajorId('국적', 'nationality');

        const fetchMinor = async (majorId?: number) => {
          if (!majorId) return [];
          const r = await apiClient.getMinorCodes({ company_id: companyId, major_code_id: majorId });
          return (r.data as MinorOption[]) ?? [];
        };

        const [degreeList, majorList, schoolList, nationList] = await Promise.all([
          fetchMinor(degreeMajorId),
          fetchMinor(majorMajorId),
          fetchMinor(schoolMajorId),
          fetchMinor(nationMajorId),
        ]);

        setMinorOptionsByCategory({
          degree: degreeList,
          field_of_study: majorList,
          institution: schoolList,
          nationality: nationList,
        });
        setMajorIdByField({
          degree: degreeMajorId ?? null,
          field_of_study: majorMajorId ?? null,
          institution: schoolMajorId ?? null,
          nationality: nationMajorId ?? null,
        });
      } catch (e) {
        // Ignore background reference prefetch failures in UI; user can still edit basic rows.
      }
    })();
  }, [companyId]);

  useEffect(() => {
    if (!pickerOpen) {
      setPickerQ('');
      setPickerPanel('none');
      setPickerEditingId(null);
      setPickerDraft({
        minor_code: '',
        code_definition_type: 'User Defined',
        name_kor: '',
        name_eng: '',
        name_thai: '',
        note: '',
      });
      return;
    }
    const id = window.setTimeout(() => pickerSearchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [pickerOpen]);

  const refreshMinorForField = useCallback(
    async (field: EducationRefField) => {
      if (!companyId) return;
      const majorId = majorIdByField[field];
      if (!majorId) {
        setMinorOptionsByCategory((prev) => ({ ...prev, [field]: [] }));
        return;
      }
      const res = await apiClient.getMinorCodes({ company_id: companyId, major_code_id: majorId });
      setMinorOptionsByCategory((prev) => ({ ...prev, [field]: (res.data as MinorOption[]) ?? [] }));
    },
    [companyId, majorIdByField]
  );

  const openPicker = (field: EducationRefField, rowId: number) => {
    setPickerField(field);
    setPickerRowId(rowId);
    setPickerOpen(true);
  };
  const pickFromModal = (code: string) => {
    if (!pickerRowId) return;
    setRows((prev) =>
      prev.map((r) => (r.id === pickerRowId ? { ...r, [pickerField]: code } : r))
    );
    setPickerOpen(false);
  };
  const beginPickerAdd = () => {
    setPickerEditingId(null);
    setPickerDraft({
      minor_code: '',
      code_definition_type: 'User Defined',
      name_kor: '',
      name_eng: '',
      name_thai: '',
      note: '',
    });
    setPickerPanel('add');
  };
  const beginPickerEdit = (o: MinorOption) => {
    setPickerEditingId(o.id);
    setPickerDraft({
      minor_code: o.minor_code,
      code_definition_type: o.code_definition_type === 'System Defined' ? 'System Defined' : 'User Defined',
      name_kor: o.name_kor ?? '',
      name_eng: o.name_eng ?? '',
      name_thai: o.name_thai ?? '',
      note: o.note ?? '',
    });
    setPickerPanel('edit');
  };
  const savePickerPanel = async () => {
    if (!companyId) return;
    const majorId = majorIdByField[pickerField];
    if (!majorId) return;
    const code = pickerDraft.minor_code.trim();
    if (pickerPanel === 'add' && !code) {
      alert('Minor 코드는 필수입니다.');
      return;
    }
    try {
      if (pickerPanel === 'add') {
        await apiClient.createMinorCode({
          company_id: companyId,
          major_code_id: majorId,
          minor_code: code,
          code_definition_type: pickerDraft.code_definition_type,
          name_kor: pickerDraft.name_kor.trim() || null,
          name_eng: pickerDraft.name_eng.trim() || null,
          name_thai: pickerDraft.name_thai.trim() || null,
          note: pickerDraft.note.trim() || null,
        });
      } else if (pickerPanel === 'edit' && pickerEditingId != null) {
        await apiClient.updateMinorCode(pickerEditingId, {
          code_definition_type: pickerDraft.code_definition_type,
          name_kor: pickerDraft.name_kor.trim() || null,
          name_eng: pickerDraft.name_eng.trim() || null,
          name_thai: pickerDraft.name_thai.trim() || null,
          note: pickerDraft.note.trim() || null,
        });
      }
      await refreshMinorForField(pickerField);
      setPickerPanel('none');
      setPickerEditingId(null);
    } catch (e: any) {
      const detail = String(e?.response?.data?.detail || e?.message || '');
      alert(localizeDeleteDetail(detail, t) || t('employees.education.saveError'));
    }
  };
  const removeFromModal = async (o: MinorOption) => {
    if (o.code_definition_type === 'System Defined') {
      alert('System Defined 코드는 삭제할 수 없습니다.');
      return;
    }
    if (!window.confirm(t('employees.education.confirmDelete'))) return;
    try {
      await apiClient.deleteMinorCode(o.id);
      if (pickerRowId) {
        const current = rows.find((r) => r.id === pickerRowId);
        if (current && (current[pickerField] ?? '') === o.minor_code) {
          setRows((prev) => prev.map((r) => (r.id === pickerRowId ? { ...r, [pickerField]: '' } : r)));
        }
      }
      await refreshMinorForField(pickerField);
    } catch (e: any) {
      const detail = String(e?.response?.data?.detail || e?.message || '');
      alert(localizeDeleteDetail(detail, t) || t('employees.education.saveError'));
    }
  };

  const inputCls =
    'w-full min-w-[4rem] border border-gray-200 rounded px-1 py-0.5 text-xs disabled:bg-gray-100 disabled:text-gray-600';
  const thGroup = 'text-center text-[10px] font-semibold text-gray-700 border border-gray-300 bg-rose-50/80';
  const thSub = 'text-[10px] font-medium text-gray-600 border border-gray-300 bg-gray-50 px-1 py-1';

  if (loading) {
    return <p className="text-sm text-gray-500 py-8 text-center">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-1">
        {t('employees.education.recordTitle')}
      </h3>

      <div className="overflow-x-auto border border-gray-300 rounded-md bg-white">
        <table className="min-w-[920px] w-full border-collapse text-xs">
          <thead>
            <tr>
              <th rowSpan={2} className={cn(thGroup, 'w-10 px-1')}>
                {t('employees.education.col.no')}
              </th>
              <th colSpan={2} className={thGroup}>
                {t('employees.education.group.degreeField')}
              </th>
              <th colSpan={2} className={thGroup}>
                {t('employees.education.group.institutionNationality')}
              </th>
              <th colSpan={2} className={thGroup}>
                {t('employees.education.group.yearRange')}
              </th>
              <th colSpan={2} className={thGroup}>
                {t('employees.education.group.gradeNote')}
              </th>
              <th rowSpan={2} className={cn(thGroup, 'min-w-[7rem]')}>
                {t('employees.education.col.qualification')}
              </th>
            </tr>
            <tr>
              <th className={thSub}>{t('employees.education.col.degree')}</th>
              <th className={thSub}>{t('employees.education.col.fieldOfStudy')}</th>
              <th className={thSub}>{t('employees.education.col.institution')}</th>
              <th className={thSub}>{t('employees.education.col.nationality')}</th>
              <th className={thSub}>{t('employees.education.col.fromYear')}</th>
              <th className={thSub}>{t('employees.education.col.toYear')}</th>
              <th className={thSub}>{t('employees.education.col.grade')}</th>
              <th className={thSub}>{t('employees.education.col.note')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const active = idx === selectedIndex;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'cursor-pointer',
                    idx % 2 === 0 ? 'bg-white' : 'bg-rose-50/40',
                    active && 'outline outline-2 outline-blue-500 -outline-offset-2'
                  )}
                  onClick={() => setSelectedIndex(idx)}
                >
                  <td className="border border-gray-200 px-1 py-0.5 text-center font-mono text-gray-700">
                    {idx + 1}
                  </td>
                  <td className="border border-gray-200 p-0.5">
                    <div className="flex items-center gap-1">
                      <select className={inputCls} value={str(row.degree)} disabled={uiLocked} onClick={(e) => e.stopPropagation()} onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, degree: v } : r)));
                      }}>
                        <option value=""></option>
                        {minorOptionsByCategory.degree.map((o) => <option key={`deg-${o.id}`} value={o.minor_code}>{o.name_kor || o.name_eng || o.name_thai || o.minor_code}</option>)}
                        {row.degree && !minorOptionsByCategory.degree.some((o) => o.minor_code === row.degree) && <option value={row.degree}>{row.degree}</option>}
                      </select>
                      <button type="button" disabled={uiLocked} onClick={(e) => { e.stopPropagation(); openPicker('degree', row.id); }} className="shrink-0 p-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40">
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="border border-gray-200 p-0.5">
                    <div className="flex items-center gap-1">
                      <select className={inputCls} value={str(row.field_of_study)} disabled={uiLocked} onClick={(e) => e.stopPropagation()} onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, field_of_study: v } : r)));
                      }}>
                        <option value=""></option>
                        {minorOptionsByCategory.field_of_study.map((o) => <option key={`major-${o.id}`} value={o.minor_code}>{o.name_kor || o.name_eng || o.name_thai || o.minor_code}</option>)}
                        {row.field_of_study && !minorOptionsByCategory.field_of_study.some((o) => o.minor_code === row.field_of_study) && <option value={row.field_of_study}>{row.field_of_study}</option>}
                      </select>
                      <button type="button" disabled={uiLocked} onClick={(e) => { e.stopPropagation(); openPicker('field_of_study', row.id); }} className="shrink-0 p-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40">
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="border border-gray-200 p-0.5">
                    <div className="flex items-center gap-1">
                      <select className={inputCls} value={str(row.institution)} disabled={uiLocked} onClick={(e) => e.stopPropagation()} onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, institution: v } : r)));
                      }}>
                        <option value=""></option>
                        {minorOptionsByCategory.institution.map((o) => <option key={`inst-${o.id}`} value={o.minor_code}>{o.name_kor || o.name_eng || o.name_thai || o.minor_code}</option>)}
                        {row.institution && !minorOptionsByCategory.institution.some((o) => o.minor_code === row.institution) && <option value={row.institution}>{row.institution}</option>}
                      </select>
                      <button type="button" disabled={uiLocked} onClick={(e) => { e.stopPropagation(); openPicker('institution', row.id); }} className="shrink-0 p-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40">
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="border border-gray-200 p-0.5">
                    <div className="flex items-center gap-1">
                      <select className={inputCls} value={str(row.nationality)} disabled={uiLocked} onClick={(e) => e.stopPropagation()} onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, nationality: v } : r)));
                      }}>
                        <option value=""></option>
                        {minorOptionsByCategory.nationality.map((o) => <option key={`nat-${o.id}`} value={o.minor_code}>{o.name_kor || o.name_eng || o.name_thai || o.minor_code}</option>)}
                        {row.nationality && !minorOptionsByCategory.nationality.some((o) => o.minor_code === row.nationality) && <option value={row.nationality}>{row.nationality}</option>}
                      </select>
                      <button type="button" disabled={uiLocked} onClick={(e) => { e.stopPropagation(); openPicker('nationality', row.id); }} className="shrink-0 p-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40">
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="border border-gray-200 p-0.5">
                    <input
                      type="date"
                      className={cn(inputCls, 'tabular-nums')}
                      value={dateStr(row.from_date, row.from_year)}
                      disabled={uiLocked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        const y = v ? parseInt(v.slice(0, 4), 10) : null;
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, from_date: v, from_year: Number.isFinite(y as number) ? y : null } : r))
                        );
                      }}
                    />
                  </td>
                  <td className="border border-gray-200 p-0.5">
                    <input
                      type="date"
                      className={cn(inputCls, 'tabular-nums')}
                      value={dateStr(row.to_date, row.to_year)}
                      disabled={uiLocked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        const y = v ? parseInt(v.slice(0, 4), 10) : null;
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, to_date: v, to_year: Number.isFinite(y as number) ? y : null } : r))
                        );
                      }}
                    />
                  </td>
                  <td className="border border-gray-200 p-0.5">
                    <input
                      className={inputCls}
                      value={str(row.grade)}
                      disabled={uiLocked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, grade: v } : r))
                        );
                      }}
                    />
                  </td>
                  <td className="border border-gray-200 p-0.5">
                    <input
                      className={inputCls}
                      value={str(row.note)}
                      disabled={uiLocked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, note: v } : r))
                        );
                      }}
                    />
                  </td>
                  <td className="border border-gray-200 p-0.5">
                    <input
                      className={inputCls}
                      value={str(row.educational_qualification)}
                      disabled={uiLocked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, educational_qualification: v } : r
                          )
                        );
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="text-xs text-gray-500 py-4 text-center border-t border-gray-200">
            {t('employees.education.emptyServer')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-600 font-medium">{t('employees.education.recordNav')}</span>
        <button
          type="button"
          disabled={uiLocked || sorted.length === 0}
          onClick={goFirst}
          className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
        >
          {t('employees.education.nav.first')}
        </button>
        <button
          type="button"
          disabled={uiLocked || selectedIndex <= 0}
          onClick={goPrev}
          className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
        >
          {t('employees.education.nav.prev')}
        </button>
        <span className="text-gray-700 tabular-nums">
          {displayNo} / {sorted.length}
        </span>
        <button
          type="button"
          disabled={uiLocked || selectedIndex >= sorted.length - 1}
          onClick={goNext}
          className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
        >
          {t('employees.education.nav.next')}
        </button>
        <button
          type="button"
          disabled={uiLocked || sorted.length === 0}
          onClick={goLast}
          className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
        >
          {t('employees.education.nav.last')}
        </button>
        <button
          type="button"
          disabled={uiLocked}
          onClick={() => void handleNew()}
          className="px-2 py-0.5 rounded border border-primary-600 text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-40"
        >
          {t('employees.education.nav.new')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={uiLocked || !selectedRow}
          onClick={() => void handleDelete()}
          className="px-3 py-1 text-xs font-medium rounded border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-40"
        >
          {t('employees.education.del')}
        </button>
        <button
          type="button"
          disabled={uiLocked}
          onClick={() => void handleSave()}
          className="px-3 py-1 text-xs font-medium rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40"
        >
          {saving ? t('common.loading') : t('employees.education.saveServer')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <label className="block text-xs">
          <span className="font-medium text-gray-700">{t('employees.education.activityStudy')}</span>
          <input
            className={cn(inputCls, 'mt-0.5')}
            value={activityStudy}
            disabled={uiLocked}
            onChange={(e) => setActivityStudy(e.target.value)}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-gray-700">{t('employees.education.certificate')}</span>
          <input
            className={cn(inputCls, 'mt-0.5')}
            value={certificate}
            disabled={uiLocked}
            onChange={(e) => setCertificate(e.target.value)}
          />
        </label>
      </div>

      <p className="text-[11px] text-red-600 leading-snug">
        {t('employees.education.orderHint')}
      </p>

      {pickerOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-16 sm:pt-24 bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setPickerOpen(false); }}>
          <div className="w-full max-w-lg max-h-[min(85vh,600px)] flex flex-col bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{t('employees.general.refSearchOpen')}</h2>
              <div className="flex items-center gap-1">
                <button type="button" disabled={uiLocked} className="text-[11px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 inline-flex items-center gap-0.5 disabled:opacity-40" onClick={beginPickerAdd}>
                  <Plus className="w-3.5 h-3.5" />{t('employees.general.refCrudAdd')}
                </button>
                <button type="button" className="text-[11px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50" onClick={() => setPickerOpen(false)}>
                  {t('system.close')}
                </button>
              </div>
            </div>

            {pickerPanel !== 'none' && (
              <div className="px-3 py-2 border-b border-gray-100 bg-slate-50 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-[10px] text-gray-600">Code
                    <input className={cn(inputCls, 'mt-0.5')} value={pickerDraft.minor_code} disabled={pickerPanel === 'edit' || uiLocked} onChange={(e) => setPickerDraft((d) => ({ ...d, minor_code: e.target.value }))} />
                  </label>
                  <label className="block text-[10px] text-gray-600">코드정의 형태
                    <select className={cn(inputCls, 'mt-0.5')} value={pickerDraft.code_definition_type} disabled={uiLocked} onChange={(e) => setPickerDraft((d) => ({ ...d, code_definition_type: e.target.value === 'System Defined' ? 'System Defined' : 'User Defined' }))}>
                      <option value="User Defined">User Defined</option>
                      <option value="System Defined">System Defined</option>
                    </select>
                  </label>
                  <label className="block text-[10px] text-gray-600">{t('employees.reference.field.nameKor')}
                    <input className={cn(inputCls, 'mt-0.5')} value={pickerDraft.name_kor} disabled={uiLocked} onChange={(e) => setPickerDraft((d) => ({ ...d, name_kor: e.target.value }))} />
                  </label>
                  <label className="block text-[10px] text-gray-600">{t('employees.reference.field.nameEng')}
                    <input className={cn(inputCls, 'mt-0.5')} value={pickerDraft.name_eng} disabled={uiLocked} onChange={(e) => setPickerDraft((d) => ({ ...d, name_eng: e.target.value }))} />
                  </label>
                  <label className="block text-[10px] text-gray-600 col-span-2">{t('employees.reference.field.nameThai')}
                    <input className={cn(inputCls, 'mt-0.5')} value={pickerDraft.name_thai} disabled={uiLocked} onChange={(e) => setPickerDraft((d) => ({ ...d, name_thai: e.target.value }))} />
                  </label>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" disabled={uiLocked} className="text-[11px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40" onClick={() => setPickerPanel('none')}>{t('employees.general.refCrudCancel')}</button>
                  <button type="button" disabled={uiLocked} className="text-[11px] px-2 py-1 rounded border border-primary-300 text-primary-700 bg-white hover:bg-gray-50 disabled:opacity-40" onClick={() => void savePickerPanel()}>{t('employees.general.refCrudSave')}</button>
                </div>
              </div>
            )}

            <div className="px-3 py-2 border-b border-gray-100">
              <input ref={pickerSearchRef} type="search" disabled={uiLocked} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-600" placeholder={t('employees.general.refSearchPlaceholder')} value={pickerQ} onChange={(e) => setPickerQ(e.target.value)} />
            </div>
            <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100">
              <li>
                <button type="button" className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50" onClick={() => pickFromModal('')}>
                  {t('employees.general.selectPlaceholder')}
                </button>
              </li>
              {pickerFiltered.map((o) => (
                <li key={`picker-${o.id}`} className="flex items-stretch gap-0">
                  <button type="button" disabled={uiLocked} className="flex-1 min-w-0 text-left px-3 py-2 text-sm hover:bg-primary-50 disabled:opacity-50" onClick={() => pickFromModal(o.minor_code)}>
                    <span className="font-mono text-xs text-gray-500 block">{o.minor_code}</span>
                    <span className="text-gray-900">{o.name_kor || o.name_eng || o.name_thai || o.minor_code}</span>
                  </button>
                  <div className="flex flex-col justify-center pr-1 py-1 gap-0.5 shrink-0 border-l border-gray-100">
                    <button type="button" disabled={uiLocked} className="p-1 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40" onClick={() => beginPickerEdit(o)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" disabled={uiLocked} className="p-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-40" onClick={() => void removeFromModal(o)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
