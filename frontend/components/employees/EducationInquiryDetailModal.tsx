'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { apiClient, getEmployeePhotoThumbnailUrl } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { loadMasterExt, type MasterExtFields } from '@/lib/employeeMasterExtension';
import {
  fetchPerCompanyAddressGeoMinorMaps,
  fetchPerCompanyEducationMinorMaps,
  resolveEducationMinorCell,
  type PerCompanyAddressGeoMinorMaps,
  type PerCompanyEducationMinorMaps,
} from '@/lib/educationMinorLookup';

export type EducationInquiryDetailEmployee = {
  id: number;
  name: string;
  employee_number: string;
  company_id?: number | null;
  company_label?: string | null;
};

function disp(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return String(v);
}

function DetailFieldList({ rows }: { rows: { key: string; label: string; value: ReactNode }[] }) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-inner shadow-slate-900/[0.02]">
      {rows.map((r, idx) => (
        <div
          key={r.key}
          className={`grid grid-cols-1 sm:grid-cols-[minmax(9.25rem,11rem)_1fr] gap-x-4 gap-y-1 px-4 py-2.5 border-b border-slate-100 last:border-b-0 ${
            idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'
          }`}
        >
          <div className="text-xs font-semibold text-slate-500 tracking-wide">{r.label}</div>
          <div className="text-sm text-slate-900 break-words leading-snug">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  children,
  bodyClassName = 'p-5',
}: {
  title: string;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-900/[0.06] ring-1 ring-slate-900/[0.03] overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-slate-50 via-white to-slate-50/40 border-b border-slate-100">
        <span className="h-5 w-1 rounded-full bg-emerald-600 shrink-0" aria-hidden />
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

type LoadState = 'idle' | 'loading' | 'done' | 'error';

type RefItem = {
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

type RefCategory =
  | 'division'
  | 'department'
  | 'level'
  | 'work_place'
  | 'area'
  | 'work_status'
  | 'position'
  | 'employment_type'
  | 'employee_type'
  | 'employee_level';

const REF_CATEGORIES: RefCategory[] = [
  'division',
  'department',
  'level',
  'work_place',
  'area',
  'work_status',
  'position',
  'employment_type',
  'employee_type',
  'employee_level',
];

export default function EducationInquiryDetailModal(props: {
  open: boolean;
  onClose: () => void;
  employee: EducationInquiryDetailEmployee | null;
}) {
  const { open, onClose, employee } = props;
  const { t, locale } = useI18n();
  const [state, setState] = useState<LoadState>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [employeeRecord, setEmployeeRecord] = useState<Record<string, unknown> | null>(null);
  const [companyDisplayName, setCompanyDisplayName] = useState<string | null>(null);
  const [personal, setPersonal] = useState<Record<string, unknown> | null>(null);
  const [educationExtra, setEducationExtra] = useState<{ activity?: string | null; certificate?: string | null }>({});
  const [educations, setEducations] = useState<Record<string, unknown>[]>([]);
  const [careers, setCareers] = useState<Record<string, unknown>[]>([]);
  const [certs, setCerts] = useState<Record<string, unknown>[]>([]);
  const [languages, setLanguages] = useState<Record<string, unknown>[]>([]);
  const [families, setFamilies] = useState<Record<string, unknown>[]>([]);
  const [address, setAddress] = useState<Record<string, unknown> | null>(null);
  const [orgRef, setOrgRef] = useState<Partial<Record<RefCategory, RefItem[]>>>({});
  const [minorMaps, setMinorMaps] = useState<PerCompanyEducationMinorMaps | null>(null);
  const [addressGeoMaps, setAddressGeoMaps] = useState<PerCompanyAddressGeoMinorMaps | null>(null);

  const pickRefLabel = useCallback(
    (it: RefItem) => {
      if (locale === 'ko') return it.name_kor || it.name_eng || it.name_thai || it.code;
      if (locale === 'en') return it.name_eng || it.name_kor || it.name_thai || it.code;
      return it.name_thai || it.name_kor || it.name_eng || it.code;
    },
    [locale]
  );

  const refCodeMaps = useMemo(() => {
    const maps: Partial<Record<RefCategory, Map<string, RefItem>>> = {};
    for (const cat of REF_CATEGORIES) {
      const list = orgRef[cat] ?? [];
      const m = new Map<string, RefItem>();
      for (const it of list) {
        const c = (it.code || '').trim();
        if (!c) continue;
        m.set(c, it);
        m.set(c.toLowerCase(), it);
      }
      maps[cat] = m;
    }
    return maps;
  }, [orgRef]);

  const resolveRef = useCallback(
    (category: RefCategory, code?: string | null) => {
      if (code == null) return '—';
      const ck = String(code).trim();
      if (!ck) return '—';
      const m = refCodeMaps[category];
      const found = m?.get(ck) ?? m?.get(ck.toLowerCase());
      return pickRefLabel(found || { code: ck });
    },
    [pickRefLabel, refCodeMaps]
  );

  const statusLabel = useCallback(
    (status: string) => {
      if (status === 'active') return t('employees.status.active');
      if (status === 'terminated') return t('employees.status.terminated');
      return t('employees.status.inactive');
    },
    [t]
  );

  const genderLabel = useCallback(
    (raw: string | null | undefined): string => {
      if (raw == null || String(raw).trim() === '') return '—';
      const v = String(raw).trim().toLowerCase();
      if (['male', 'm', '남', '남성', 'man', 'ชาย'].includes(v)) return t('employees.general.genderMale');
      if (['female', 'f', '여', '여성', 'woman', 'หญิง'].includes(v)) return t('employees.general.genderFemale');
      return t('employees.general.genderOther');
    },
    [t]
  );

  const yesNo = (v: unknown) => {
    if (v === true) return 'Y';
    if (v === false) return 'N';
    return '—';
  };

  const optLabel = useCallback(
    (prefix: 'lang' | 'test' | 'grade', raw: unknown) => {
      const c = String(raw ?? '').trim();
      if (!c) return '—';
      const key = `employees.language.opt.${prefix}.${c}`;
      const label = t(key);
      return label === key ? c : label;
    },
    [t]
  );

  const familyDomesticForeignLabel = useCallback(
    (raw: unknown): string => {
      if (raw == null || String(raw).trim() === '') return '—';
      const v = String(raw).trim().toLowerCase();
      if (v === 'domestic') return t('employees.family.domestic');
      if (v === 'foreign') return t('employees.family.foreign');
      return disp(raw);
    },
    [t]
  );

  const displayAddressField = useCallback(
    (addr: Record<string, unknown>, rowKey: string, dataField: string): string => {
      const codeBacked = new Set([
        'nationality',
        'zone',
        'province',
        'district',
        'sub_district',
        'postcode',
      ]);
      if (!codeBacked.has(rowKey)) {
        return disp(addr[dataField]);
      }
      const idField = `${dataField}_minor_code_id`;
      const raw = addr[dataField];
      const idVal = addr[idField] as number | null | undefined;
      const resolved =
        rowKey === 'nationality'
          ? resolveEducationMinorCell(minorMaps?.nationality, idVal, raw as string, locale)
          : resolveEducationMinorCell(
              addressGeoMaps?.[rowKey as keyof PerCompanyAddressGeoMinorMaps],
              idVal,
              raw as string,
              locale
            );
      if (!resolved || resolved === '-') return '—';
      return resolved;
    },
    [minorMaps, addressGeoMaps, locale]
  );

  const load = useCallback(async () => {
    if (!employee || !Number.isInteger(employee.id) || employee.id <= 0) {
      setState('error');
      setErrMsg(t('employees.inquiry.detailLoadError'));
      return;
    }
    setState('loading');
    setErrMsg(null);
    const id = employee.id;
    try {
      const [
        empRes,
        personalRes,
        eduRes,
        carRes,
        certRes,
        langRes,
        famRes,
        addrRes,
        companiesRes,
      ] = await Promise.allSettled([
        apiClient.getEmployee(id),
        apiClient.getEmployeePersonalInfo(id),
        apiClient.getEmployeeEducations(id),
        apiClient.getEmployeeCareers(id),
        apiClient.getEmployeeCertifications(id),
        apiClient.getEmployeeLanguages(id),
        apiClient.getEmployeeFamilies(id),
        apiClient.getEmployeeAddressInfo(id),
        apiClient.getMyCompanies(),
      ]);

      if (empRes.status !== 'fulfilled') {
        setState('error');
        setErrMsg(t('employees.inquiry.detailLoadError'));
        return;
      }

      const d = empRes.value.data as Record<string, unknown>;
      setEmployeeRecord(d);
      setEducationExtra({
        activity: (d.education_activity_study as string) ?? null,
        certificate: (d.education_certificate as string) ?? null,
      });

      const cid = d.company_id as number | null | undefined;
      let nextOrg: Partial<Record<RefCategory, RefItem[]>> = {};
      let nextMinor: PerCompanyEducationMinorMaps | null = null;
      if (cid != null) {
        const [refRes, minorRes, addrGeoRes] = await Promise.allSettled([
          apiClient.getEmployeeReferenceItemsAllCategories(cid),
          fetchPerCompanyEducationMinorMaps(cid),
          fetchPerCompanyAddressGeoMinorMaps(cid),
        ]);
        if (refRes.status === 'fulfilled') {
          const data = (refRes.value.data as Record<string, RefItem[]>) ?? {};
          for (const cat of REF_CATEGORIES) {
            const list = data[cat];
            nextOrg[cat] = Array.isArray(list) ? list : [];
          }
        }
        if (minorRes.status === 'fulfilled' && minorRes.value) {
          nextMinor = minorRes.value;
        }
        if (addrGeoRes.status === 'fulfilled' && addrGeoRes.value) {
          setAddressGeoMaps(addrGeoRes.value);
        } else {
          setAddressGeoMaps(null);
        }
      } else {
        setAddressGeoMaps(null);
      }
      setOrgRef(nextOrg);
      setMinorMaps(nextMinor);

      let coName: string | null = employee.company_label?.trim() || null;
      if (!coName && companiesRes.status === 'fulfilled' && cid != null) {
        const companies = (companiesRes.value.data as Array<{ id: number; company_code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>) ?? [];
        const hit = companies.find((c) => c.id === cid);
        if (hit) {
          if (locale === 'ko') coName = hit.name_kor || hit.name_eng || hit.name_thai || hit.company_code;
          else if (locale === 'en') coName = hit.name_eng || hit.name_kor || hit.name_thai || hit.company_code;
          else coName = hit.name_thai || hit.name_kor || hit.name_eng || hit.company_code;
        }
      }
      setCompanyDisplayName(coName);

      if (personalRes.status === 'fulfilled') {
        const pdata = (personalRes.value as { data?: unknown }).data;
        setPersonal(pdata && typeof pdata === 'object' ? (pdata as Record<string, unknown>) : null);
      } else {
        setPersonal(null);
      }

      const arr = (r: PromiseSettledResult<unknown>): Record<string, unknown>[] => {
        if (r.status !== 'fulfilled') return [];
        const payload = (r.value as { data?: unknown })?.data;
        if (!Array.isArray(payload)) return [];
        return payload as Record<string, unknown>[];
      };

      const oneAddress = (r: PromiseSettledResult<unknown>): Record<string, unknown> | null => {
        if (r.status !== 'fulfilled') return null;
        const data = (r.value as { data?: unknown })?.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          return data as Record<string, unknown>;
        }
        return null;
      };

      setEducations(arr(eduRes));
      setCareers(arr(carRes));
      setCerts(arr(certRes));
      setLanguages(arr(langRes));
      setFamilies(arr(famRes));
      setAddress(oneAddress(addrRes));

      setState('done');
    } catch {
      setState('error');
      setErrMsg(t('employees.inquiry.detailLoadError'));
    }
  }, [employee, locale, t]);

  useEffect(() => {
    if (!open || !employee) {
      setState('idle');
      setEmployeeRecord(null);
      setPersonal(null);
      setOrgRef({});
      setMinorMaps(null);
      setAddressGeoMaps(null);
      setCompanyDisplayName(null);
      return;
    }
    if (!Number.isInteger(employee.id) || employee.id <= 0) {
      setState('error');
      setErrMsg(t('employees.inquiry.detailLoadError'));
      return;
    }
    void load();
  }, [open, employee, load, t]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !employee) return null;

  const th =
    'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 bg-slate-100/90 border-b border-slate-200 whitespace-nowrap';
  const td = 'px-3 py-2 text-xs text-slate-800 border-b border-slate-100 align-top leading-relaxed';

  const addrRows: { prefix: 'perm' | 'curr'; legend: string }[] = [
    { prefix: 'perm', legend: t('employees.address.permanentLegend') },
    { prefix: 'curr', legend: t('employees.address.currentLegend') },
  ];

  const ext: MasterExtFields = loadMasterExt(employee.id);
  const photoPath = (employeeRecord?.photo_path as string | undefined)?.trim();
  const photoUrl = photoPath
    ? getEmployeePhotoThumbnailUrl(employee.id)
    : ext.photo_data_url?.trim() || '';

  const e = employeeRecord;

  const basicRows: [string, string][] = [];
  if (e) {
    basicRows.push([t('employees.field.company'), companyDisplayName || '—']);
    basicRows.push([t('employees.field.employeeNumber'), disp(e.employee_number)]);
    basicRows.push([t('employees.field.name'), disp(e.name)]);
    basicRows.push([t('employees.general.swipeCard'), ext.swipe_card?.trim() || '—']);
    basicRows.push([t('employees.general.titlePrefix'), ext.name_th_title?.trim() || '—']);
    basicRows.push([t('employees.general.firstNameLocal'), ext.name_th_first?.trim() || '—']);
    basicRows.push([t('employees.general.lastNameLocal'), ext.name_th_last?.trim() || '—']);
    basicRows.push([t('employees.general.titleEnglish'), ext.name_en_title?.trim() || '—']);
    basicRows.push([t('employees.general.firstNameEn'), ext.name_en_first?.trim() || '—']);
    basicRows.push([t('employees.general.lastNameEn'), ext.name_en_last?.trim() || '—']);
    basicRows.push([t('employees.field.email'), disp(e.email)]);
    basicRows.push([t('employees.field.phone'), disp(e.phone)]);
    basicRows.push([t('employees.field.status'), statusLabel(String(e.status ?? ''))]);
    basicRows.push([t('employees.field.hireDate'), disp(e.hire_date)]);
    basicRows.push([t('employees.general.terminationDate'), disp(e.termination_date)]);
    basicRows.push([t('employees.general.passDate'), ext.probation_end?.trim() || '—']);
    basicRows.push([t('employees.field.department'), resolveRef('department', e.department as string)]);
    basicRows.push([t('employees.field.position'), resolveRef('position', e.position as string)]);
    basicRows.push([t('employees.general.division'), resolveRef('division', (e.division as string) || ext.division)]);
    basicRows.push([t('employees.general.level'), resolveRef('level', e.job_level as string)]);
    basicRows.push([t('employees.general.workplace'), resolveRef('work_place', (e.work_place as string) || ext.workplace)]);
    basicRows.push([t('employees.general.area'), resolveRef('area', (e.area as string) || ext.area)]);
    basicRows.push([t('employees.general.workStatus'), resolveRef('work_status', (e.work_status as string) || ext.work_status)]);
    basicRows.push([t('employees.general.empType'), resolveRef('employment_type', e.employment_type as string)]);
    basicRows.push([
      t('employees.general.processSalaryType'),
      resolveRef('employee_type', (e.salary_process_type as string) || ext.salary_process_type),
    ]);
    basicRows.push([
      t('employees.general.empLevel'),
      resolveRef('employee_level', (e.employee_level as string) || ext.emp_level),
    ]);
    basicRows.push([t('employees.general.jgLevel'), ext.jg_level?.trim() || '—']);
    basicRows.push([t('employees.general.fundNumber'), ext.fund_number?.trim() || '—']);
    basicRows.push([t('employees.general.birthDate'), disp(e.birth_date)]);
    basicRows.push([t('employees.general.sex'), genderLabel(e.gender as string)]);
    basicRows.push([t('employees.general.maritalStatus'), ext.marital_status?.trim() || '—']);
    basicRows.push([t('employees.general.idCard'), ext.national_id?.trim() || '—']);
    basicRows.push([t('employees.general.idExpire'), ext.id_card_expire?.trim() || '—']);
    basicRows.push([t('employees.general.taxId'), disp(e.tax_id)]);
    basicRows.push([t('employees.general.ssoNumber'), ext.sso_number?.trim() || '—']);
    basicRows.push([t('employees.general.ssoHospital'), ext.sso_hospital?.trim() || '—']);
  }

  const personalRows: { key: string; label: string; value: ReactNode }[] =
    personal && Object.keys(personal).length > 0
      ? [
          { key: 'nickname', label: t('employees.personal.field.nickname'), value: disp(personal.nickname) },
          {
            key: 'placeOfBirth',
            label: t('employees.personal.field.placeOfBirth'),
            value: disp(personal.place_of_birth),
          },
          {
            key: 'hw',
            label: t('employees.personal.field.heightWeight'),
            value:
              personal.height_cm != null || personal.weight_kg != null
                ? `${personal.height_cm ?? '—'} / ${personal.weight_kg ?? '—'}`
                : '—',
          },
          { key: 'race', label: t('employees.personal.field.race'), value: disp(personal.race) },
          {
            key: 'nationality',
            label: t('employees.personal.field.nationality'),
            value: disp(personal.nationality),
          },
          { key: 'religion', label: t('employees.personal.field.religion'), value: disp(personal.religion) },
          { key: 'blood', label: t('employees.personal.field.bloodGroup'), value: disp(personal.blood_group) },
          { key: 'tel', label: t('employees.personal.field.tel'), value: disp(personal.personal_tel) },
          { key: 'email', label: t('employees.personal.field.email'), value: disp(personal.personal_email) },
          { key: 'web', label: t('employees.personal.field.website'), value: disp(personal.website) },
          {
            key: 'military',
            label: t('employees.personal.field.military'),
            value: personal.military_status
              ? t(`employees.personal.military.${String(personal.military_status)}`, String(personal.military_status))
              : '—',
          },
          { key: 'hobby', label: t('employees.personal.field.hobby'), value: disp(personal.hobby) },
          { key: 'sports', label: t('employees.personal.field.sports'), value: disp(personal.sports) },
          {
            key: 'typing',
            label: t('employees.personal.field.typing'),
            value:
              personal.typing_thai_wpm != null || personal.typing_english_wpm != null
                ? `${personal.typing_thai_wpm ?? '—'} / ${personal.typing_english_wpm ?? '—'}`
                : '—',
          },
          {
            key: 'drive',
            label: t('employees.personal.field.drivingLicense'),
            value: (
              <>
                {yesNo(personal.has_driving_license)}
                {personal.driving_license_number ? ` (${String(personal.driving_license_number)})` : ''}
              </>
            ),
          },
          { key: 'car', label: t('employees.personal.field.ownCar'), value: yesNo(personal.own_car) },
          {
            key: 'moto',
            label: t('employees.personal.field.motorcycleLicense'),
            value: (
              <>
                {yesNo(personal.has_motorcycle_license)}
                {personal.motorcycle_license_number ? ` (${String(personal.motorcycle_license_number)})` : ''}
              </>
            ),
          },
          {
            key: 'ownMoto',
            label: t('employees.personal.field.ownMotorcycle'),
            value: yesNo(personal.own_motorcycle),
          },
          { key: 'notes', label: t('employees.personal.field.notes'), value: disp(personal.personal_notes) },
        ]
      : [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/45 backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl shadow-slate-900/20 max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden ring-1 ring-slate-900/10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="education-inquiry-detail-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-emerald-50/20 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-1 h-9 w-1 rounded-full bg-emerald-600 shrink-0" aria-hidden />
            <div className="min-w-0">
              <h2
                id="education-inquiry-detail-title"
                className="text-lg font-semibold text-slate-900 tracking-tight"
              >
                {t('employees.inquiry.detailModalTitle')}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                <span className="font-medium text-slate-800">{employee.name}</span>
                <span className="text-slate-400 mx-1.5">·</span>
                <span className="text-slate-500">
                  {t('employees.field.employeeNumber')} {employee.employee_number}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            aria-label={t('system.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 bg-slate-100/50 px-5 py-6">
          {state === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="h-9 w-9 rounded-full border-2 border-emerald-600/30 border-t-emerald-600 animate-spin" />
              <p className="text-sm text-slate-600">{t('common.loading')}</p>
            </div>
          )}
          {state === 'error' && errMsg && (
            <p className="text-sm text-red-600 py-4 px-1">{errMsg}</p>
          )}
          {state === 'done' && (
            <div className="space-y-5 max-w-[100%]">
              <SectionCard title={t('employees.tab.basic')}>
                <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                  <div className="shrink-0 flex justify-center lg:justify-start">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt=""
                        className="h-32 w-32 object-cover rounded-2xl border-4 border-white shadow-md shadow-slate-900/10 ring-1 ring-slate-200/80 bg-slate-100"
                      />
                    ) : (
                      <div className="h-32 w-32 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-xs text-slate-400 text-center px-3 shadow-inner">
                        {t('employees.general.photoPlaceholder')}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <DetailFieldList
                      rows={basicRows.map(([label, value], i) => ({
                        key: `basic-${i}-${label}`,
                        label,
                        value,
                      }))}
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title={t('employees.inquiry.personalSectionTitle')}>
                {personalRows.length === 0 ? (
                  <p className="text-sm text-slate-500 py-2">{t('employees.inquiry.detailEmptySection')}</p>
                ) : (
                  <DetailFieldList rows={personalRows} />
                )}
              </SectionCard>

              <SectionCard title={t('employees.tab.education')} bodyClassName="p-4 space-y-3">
                {(educationExtra.activity || educationExtra.certificate) && (
                  <div className="text-xs text-slate-700 space-y-1.5 rounded-xl bg-emerald-50/40 p-3 border border-emerald-100/80">
                    {educationExtra.activity ? (
                      <p>
                        <span className="font-semibold text-slate-600">{t('employees.education.activityStudy')}:</span>{' '}
                        {educationExtra.activity}
                      </p>
                    ) : null}
                    {educationExtra.certificate ? (
                      <p>
                        <span className="font-semibold text-slate-600">{t('employees.education.certificate')}:</span>{' '}
                        {educationExtra.certificate}
                      </p>
                    ) : null}
                  </div>
                )}
                {educations.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('employees.inquiry.detailEmptySection')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm">
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className={th}>#</th>
                          <th className={th}>{t('employees.education.col.degree')}</th>
                          <th className={th}>{t('employees.education.col.fieldOfStudy')}</th>
                          <th className={th}>{t('employees.education.col.institution')}</th>
                          <th className={th}>{t('employees.education.col.nationality')}</th>
                          <th className={th}>{t('employees.education.col.fromYear')}</th>
                          <th className={th}>{t('employees.education.col.toYear')}</th>
                          <th className={th}>{t('employees.education.col.grade')}</th>
                          <th className={th}>{t('employees.education.col.qualification')}</th>
                          <th className={th}>{t('employees.education.col.note')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {educations.map((row, i) => (
                          <tr key={String(row.id ?? i)}>
                            <td className={td}>{i + 1}</td>
                            <td className={td}>
                              {minorMaps
                                ? resolveEducationMinorCell(
                                    minorMaps.degree,
                                    row.degree_minor_code_id as number | null | undefined,
                                    row.degree as string | null | undefined,
                                    locale
                                  )
                                : disp(row.degree)}
                            </td>
                            <td className={td}>
                              {minorMaps
                                ? resolveEducationMinorCell(
                                    minorMaps.field_of_study,
                                    row.field_of_study_minor_code_id as number | null | undefined,
                                    row.field_of_study as string | null | undefined,
                                    locale
                                  )
                                : disp(row.field_of_study)}
                            </td>
                            <td className={td}>
                              {minorMaps
                                ? resolveEducationMinorCell(
                                    minorMaps.institution,
                                    row.institution_minor_code_id as number | null | undefined,
                                    row.institution as string | null | undefined,
                                    locale
                                  )
                                : disp(row.institution)}
                            </td>
                            <td className={td}>
                              {minorMaps
                                ? resolveEducationMinorCell(
                                    minorMaps.nationality,
                                    row.nationality_minor_code_id as number | null | undefined,
                                    row.nationality as string | null | undefined,
                                    locale
                                  )
                                : disp(row.nationality)}
                            </td>
                            <td className={td}>{disp(row.from_year ?? row.from_date)}</td>
                            <td className={td}>{disp(row.to_year ?? row.to_date)}</td>
                            <td className={td}>{disp(row.grade)}</td>
                            <td className={td}>{disp(row.educational_qualification)}</td>
                            <td className={td}>{disp(row.note)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard title={t('employees.tab.career')} bodyClassName="p-4">
                {careers.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('employees.inquiry.detailEmptySection')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm">
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className={th}>#</th>
                          <th className={th}>{t('employees.career.col.companyName')}</th>
                          <th className={th}>{t('employees.career.col.positionTitle')}</th>
                          <th className={th}>{t('employees.career.col.workDetails')}</th>
                          <th className={th}>{t('employees.career.col.enterDate')}</th>
                          <th className={th}>{t('employees.career.col.resignedDate')}</th>
                          <th className={th}>{t('employees.career.col.address')}</th>
                          <th className={th}>{t('employees.career.col.telephone')}</th>
                          <th className={th}>{t('employees.career.col.beginSalary')}</th>
                          <th className={th}>{t('employees.career.col.latestSalary')}</th>
                          <th className={th}>{t('employees.career.col.tenure')}</th>
                          <th className={th}>{t('employees.career.col.resignationReason')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {careers.map((row, i) => (
                          <tr key={String(row.id ?? i)}>
                            <td className={td}>{i + 1}</td>
                            <td className={td}>{disp(row.company_name)}</td>
                            <td className={td}>{disp(row.position_title)}</td>
                            <td className={td}>{disp(row.work_details)}</td>
                            <td className={td}>{disp(row.enter_date)}</td>
                            <td className={td}>{disp(row.resigned_date)}</td>
                            <td className={td}>{disp(row.address)}</td>
                            <td className={td}>{disp(row.telephone)}</td>
                            <td className={td}>{disp(row.begin_salary)}</td>
                            <td className={td}>{disp(row.latest_salary)}</td>
                            <td className={td}>{disp(row.tenure_text)}</td>
                            <td className={td}>{disp(row.resignation_reason)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard title={t('employees.tab.certification')} bodyClassName="p-4">
                {certs.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('employees.inquiry.detailEmptySection')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm">
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className={th}>#</th>
                          <th className={th}>{t('employees.certification.col.licenseType')}</th>
                          <th className={th}>{t('employees.certification.col.licenseCode')}</th>
                          <th className={th}>{t('employees.certification.col.grade')}</th>
                          <th className={th}>{t('employees.certification.col.issuerName')}</th>
                          <th className={th}>{t('employees.certification.col.issuerCode')}</th>
                          <th className={th}>{t('employees.certification.col.acquiredDate')}</th>
                          <th className={th}>{t('employees.certification.col.effectiveDate')}</th>
                          <th className={th}>{t('employees.certification.col.nextRenewal')}</th>
                          <th className={th}>{t('employees.certification.col.certificateNumber')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {certs.map((row, i) => (
                          <tr key={String(row.id ?? i)}>
                            <td className={td}>{i + 1}</td>
                            <td className={td}>{disp(row.license_type_name)}</td>
                            <td className={td}>{disp(row.license_code)}</td>
                            <td className={td}>{disp(row.grade)}</td>
                            <td className={td}>{disp(row.issuer_name)}</td>
                            <td className={td}>{disp(row.issuer_code)}</td>
                            <td className={td}>{disp(row.acquired_date)}</td>
                            <td className={td}>{disp(row.effective_date)}</td>
                            <td className={td}>{disp(row.next_renewal_date)}</td>
                            <td className={td}>{disp(row.certificate_number)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard title={t('employees.tab.language')} bodyClassName="p-4">
                {languages.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('employees.inquiry.detailEmptySection')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm">
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className={th}>#</th>
                          <th className={th}>{t('employees.language.col.language')}</th>
                          <th className={th}>{t('employees.language.col.testType')}</th>
                          <th className={th}>{t('employees.language.col.acquisitionDate')}</th>
                          <th className={th}>{t('employees.language.col.score')}</th>
                          <th className={th}>{t('employees.language.col.grade')}</th>
                          <th className={th}>{t('employees.language.col.expiryDate')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {languages.map((row, i) => (
                          <tr key={String(row.id ?? i)}>
                            <td className={td}>{i + 1}</td>
                            <td className={td}>{optLabel('lang', row.language_code)}</td>
                            <td className={td}>{optLabel('test', row.test_type)}</td>
                            <td className={td}>{disp(row.acquisition_date)}</td>
                            <td className={td}>
                              {row.score != null && row.score !== '' ? disp(row.score) : '—'}
                            </td>
                            <td className={td}>{optLabel('grade', row.grade)}</td>
                            <td className={td}>{disp(row.expiry_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard title={t('employees.tab.family')} bodyClassName="p-4">
                {families.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('employees.inquiry.detailEmptySection')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm">
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className={th}>#</th>
                          <th className={th}>{t('employees.family.col.name')}</th>
                          <th className={th}>{t('employees.family.col.relation')}</th>
                          <th className={th}>{t('employees.family.col.residentNumber')}</th>
                          <th className={th}>{t('employees.family.col.domesticForeign')}</th>
                          <th className={th}>{t('employees.family.col.highestEducation')}</th>
                          <th className={th}>{t('employees.family.col.occupation')}</th>
                          <th className={th}>{t('employees.family.col.workplace')}</th>
                          <th className={th}>{t('employees.family.col.position')}</th>
                          <th className={th}>{t('employees.family.col.remarks')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {families.map((row, i) => (
                          <tr key={String(row.id ?? i)}>
                            <td className={td}>{i + 1}</td>
                            <td className={td}>{disp(row.name)}</td>
                            <td className={td}>{disp(row.relation)}</td>
                            <td className={td}>{disp(row.resident_number)}</td>
                            <td className={td}>{familyDomesticForeignLabel(row.domestic_foreign)}</td>
                            <td className={td}>{disp(row.highest_education)}</td>
                            <td className={td}>{disp(row.occupation)}</td>
                            <td className={td}>{disp(row.workplace)}</td>
                            <td className={td}>{disp(row.position)}</td>
                            <td className={td}>{disp(row.support_reason)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard title={t('employees.tab.address')} bodyClassName="p-4">
                {!address || Object.keys(address).length === 0 ? (
                  <p className="text-sm text-slate-500">{t('employees.inquiry.detailEmptySection')}</p>
                ) : (
                  <div className="space-y-4 text-xs">
                    {addrRows.map(({ prefix, legend }) => (
                      <div
                        key={prefix}
                        className="border border-slate-200/90 rounded-xl p-4 bg-slate-50/50 shadow-sm"
                      >
                        <p className="font-semibold text-slate-700 mb-3 text-sm">{legend}</p>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                          {[
                            ['house_no_th', `${prefix}_house_no_th`],
                            ['house_no_en', `${prefix}_house_no_en`],
                            ['building_th', `${prefix}_building_th`],
                            ['building_en', `${prefix}_building_en`],
                            ['soi_th', `${prefix}_soi_th`],
                            ['soi_en', `${prefix}_soi_en`],
                            ['street_th', `${prefix}_street_th`],
                            ['street_en', `${prefix}_street_en`],
                            ['nationality', `${prefix}_nationality`],
                            ['zone', `${prefix}_zone`],
                            ['province', `${prefix}_province`],
                            ['district', `${prefix}_district`],
                            ['sub_district', `${prefix}_sub_district`],
                            ['postcode', `${prefix}_postcode`],
                            ['telephone', `${prefix}_telephone`],
                          ].map(([rowKey, field]) => (
                            <div key={field} className="flex gap-2">
                              <dt className="text-slate-500 shrink-0 min-w-[8rem] font-medium">
                                {t(`employees.address.field.${rowKey}` as never)}
                              </dt>
                              <dd className="text-slate-900 break-words">
                                {displayAddressField(address, rowKey, field)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
