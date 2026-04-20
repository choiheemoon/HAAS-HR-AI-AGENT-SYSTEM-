'use client';

import { useMemo, type ReactNode } from 'react';
import { getEmployeePhotoImageUrl } from '@/lib/api';
import { ageFromBirthDate } from '@/lib/employeeAgeService';
import type { MasterExtFields } from '@/lib/employeeMasterExtension';
import {
  resolveEducationMinorCell,
  type MinorMaps,
  type PerCompanyAddressGeoMinorMaps,
  type PerCompanyCertificationMinorMaps,
  type PerCompanyEducationMinorMaps,
} from '@/lib/educationMinorLookup';

type RefItem = {
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};
type OrgRef = Record<string, RefItem[]>;

export type PersonnelRecordBundle = {
  employee: Record<string, unknown> | null;
  personal: Record<string, unknown> | null;
  address: Record<string, unknown> | null;
  families: Record<string, unknown>[];
  educations: Record<string, unknown>[];
  certifications: Record<string, unknown>[];
  careers: Record<string, unknown>[];
  languages: Record<string, unknown>[];
  masterExt: MasterExtFields;
  orgRef: OrgRef;
  companyName: string;
  /** 회사명(한글) — 증명서 하단 등 */
  companyNameKor: string | null;
  /** 대표이사 성명 — 증명서 */
  companyRepresentativeName: string | null;
  /** 회사 주소(증명서 문구용) */
  companyAddress: string | null;
  /** 회사 마스터의 logo_data_url (없으면 헤더 우측 로고 영역 비움) */
  companyLogoUrl: string | null;
  locale: string;
  educationMinorMaps: PerCompanyEducationMinorMaps | null;
  addressGeoMaps: PerCompanyAddressGeoMinorMaps | null;
  certificationMinorMaps: PerCompanyCertificationMinorMaps | null;
};

function disp(v: unknown): string {
  if (v == null || v === '') return '—';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function pickRefLabel(it: RefItem | undefined, locale: string): string {
  if (!it) return '';
  if (locale === 'ko') return it.name_kor || it.name_eng || it.name_thai || it.code;
  if (locale === 'en') return it.name_eng || it.name_kor || it.name_thai || it.code;
  return it.name_thai || it.name_kor || it.name_eng || it.code;
}

function resolveRef(orgRef: OrgRef, category: string, code: unknown, locale: string): string {
  if (code == null || String(code).trim() === '') return '—';
  const ck = String(code).trim();
  const list = orgRef[category] ?? [];
  const found =
    list.find((x) => (x.code || '').trim() === ck) ||
    list.find((x) => (x.code || '').trim().toLowerCase() === ck.toLowerCase());
  return pickRefLabel(found, locale) || ck;
}

function joinParts(...parts: (unknown)[]): string {
  const s = parts
    .map((p) => String(p ?? '').trim())
    .filter((x) => x && x !== '—' && x !== '-')
    .join(' ');
  return s || '—';
}

function toMinorId(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function minorDisp(v: string): string {
  if (!v || v === '-') return '—';
  return v;
}

function resolveGeoLabel(
  geo: PerCompanyAddressGeoMinorMaps | null | undefined,
  field: keyof PerCompanyAddressGeoMinorMaps,
  minorId: unknown,
  raw: unknown,
  locale: string
): string {
  const maps = geo?.[field] as MinorMaps | undefined;
  return minorDisp(
    resolveEducationMinorCell(maps, toMinorId(minorId), raw as string | null | undefined, locale)
  );
}

function formatAddressBlockResolved(
  row: Record<string, unknown> | null,
  prefix: 'perm' | 'curr',
  geo: PerCompanyAddressGeoMinorMaps | null | undefined,
  natMaps: MinorMaps | undefined,
  locale: string
): { zip: string; line: string } {
  if (!row) return { zip: '—', line: '—' };
  const pre = prefix;
  const zip = resolveGeoLabel(geo, 'postcode', row[`${pre}_postcode_minor_code_id`], row[`${pre}_postcode`], locale);
  const nat = minorDisp(
    resolveEducationMinorCell(
      natMaps,
      toMinorId(row[`${pre}_nationality_minor_code_id`]),
      row[`${pre}_nationality`] as string | null | undefined,
      locale
    )
  );
  const zone = resolveGeoLabel(geo, 'zone', row[`${pre}_zone_minor_code_id`], row[`${pre}_zone`], locale);
  const prov = resolveGeoLabel(geo, 'province', row[`${pre}_province_minor_code_id`], row[`${pre}_province`], locale);
  const dist = resolveGeoLabel(geo, 'district', row[`${pre}_district_minor_code_id`], row[`${pre}_district`], locale);
  const sub = resolveGeoLabel(
    geo,
    'sub_district',
    row[`${pre}_sub_district_minor_code_id`],
    row[`${pre}_sub_district`],
    locale
  );
  const line = joinParts(
    row[`${pre}_house_no_th`],
    row[`${pre}_building_th`],
    row[`${pre}_soi_th`],
    row[`${pre}_street_th`],
    nat,
    zone,
    prov,
    dist,
    sub
  );
  return { zip, line };
}

/** 인사기록카드·재직/경력증명서 공통 주소 블록 */
export function getPersonnelRecordAddressBlocks(data: PersonnelRecordBundle): {
  perm: { zip: string; line: string };
  curr: { zip: string; line: string };
} {
  const natMinorMaps = data.educationMinorMaps?.nationality;
  return {
    perm: formatAddressBlockResolved(data.address, 'perm', data.addressGeoMaps, natMinorMaps, data.locale),
    curr: formatAddressBlockResolved(data.address, 'curr', data.addressGeoMaps, natMinorMaps, data.locale),
  };
}

export function resolveEmployeeOrgRef(data: PersonnelRecordBundle, category: string, code: unknown): string {
  return resolveRef(data.orgRef, category, code, data.locale);
}

function minorCell(maps: MinorMaps | undefined, raw: unknown, locale: string): string {
  const s = resolveEducationMinorCell(maps, null, raw != null ? String(raw) : undefined, locale);
  if (!s || s === '-') return '—';
  return s;
}

function cellResolved(s: string): string {
  if (!s || s === '-') return '—';
  return s;
}

function translateLangOpt(
  t: (key: string) => string,
  prefix: 'lang' | 'test',
  raw: unknown
): string {
  const c = String(raw ?? '').trim();
  if (!c) return '—';
  const key = `employees.language.opt.${prefix}.${c}`;
  const label = t(key);
  return label === key ? c : label;
}

/** 카드·표 공통 (화면: 부드러운 테두리 / 인쇄: 단순) — 가독성을 위해 sm 이상 본문 14px 근처 */
const cardShell =
  'rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden print:shadow-none print:border-slate-300 print:rounded-md pr-pdf-avoid-break';
const panelTitle =
  'bg-gradient-to-r from-slate-100 via-slate-50 to-white px-3 py-2.5 text-sm sm:text-[15px] font-semibold text-slate-800 border-b border-slate-200';
const thGrid =
  'bg-slate-50 text-xs sm:text-sm font-semibold text-slate-600 px-2.5 py-2 text-center border-b border-slate-200 whitespace-nowrap';
const tdGrid =
  'text-xs sm:text-sm text-slate-800 px-2.5 py-2 border-b border-slate-100 align-top leading-relaxed';
const labelCell =
  'w-[38%] max-w-[11rem] text-xs sm:text-sm font-medium text-slate-600 bg-slate-50/90 border-b border-slate-100 px-2.5 py-2 align-top';
const valueCell =
  'text-xs sm:text-sm text-slate-900 border-b border-slate-100 px-2.5 py-2 align-top leading-relaxed break-words min-w-0';
/** 기본정보 2열(라벨·값·라벨·값) */
const labelCell4 =
  'w-[19%] max-w-[10.5rem] text-xs sm:text-sm font-medium text-slate-600 bg-slate-50/90 border-b border-slate-100 px-2 py-2 align-top';
const valueCell4 =
  'w-[31%] text-xs sm:text-sm text-slate-900 border-b border-slate-100 px-2 py-2 align-top leading-relaxed break-words min-w-0';

function Row2({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr className="print:break-inside-avoid">
      <td className={labelCell}>{label}</td>
      <td className={valueCell}>{value ?? '—'}</td>
    </tr>
  );
}

function Row4({
  left,
  right,
}: {
  left: { label: string; value: ReactNode };
  right: { label: string; value: ReactNode };
}) {
  return (
    <tr className="print:break-inside-avoid">
      <td className={labelCell4}>{left.label}</td>
      <td className={valueCell4}>{left.value ?? '—'}</td>
      <td className={labelCell4}>{right.label}</td>
      <td className={valueCell4}>{right.value ?? '—'}</td>
    </tr>
  );
}

function dispGender(v: unknown, t: (key: string) => string): string {
  const g = String(v ?? '').trim();
  if (!g) return '—';
  if (g === 'male') return t('employees.general.genderMale');
  if (g === 'female') return t('employees.general.genderFemale');
  if (g === 'other') return t('employees.general.genderOther');
  return disp(v);
}

function dispMarital(v: unknown, t: (key: string) => string): string {
  const m = String(v ?? '').trim();
  if (!m) return '—';
  const keys: Record<string, string> = {
    single: 'employees.general.maritalSingle',
    married: 'employees.general.maritalMarried',
    divorced: 'employees.general.maritalDivorced',
    widowed: 'employees.general.maritalWidowed',
  };
  const k = keys[m];
  return k ? t(k) : disp(m);
}

function checkMark(v: unknown): string {
  return v === true || v === 1 || v === '1' || v === 'true' ? '✓' : '—';
}

export default function PersonnelRecordCard({
  data,
  t,
}: {
  data: PersonnelRecordBundle;
  t: (key: string, fallback?: string) => string;
}) {
  const e = data.employee;
  const p = data.personal;
  const ext = data.masterExt;
  const org = data.orgRef;
  const loc = data.locale;
  const cid = (e?.company_id as number | null | undefined) ?? null;

  const empId = (e?.id as number) || 0;
  const photoPath = e?.photo_path != null ? String(e.photo_path).trim() : '';
  const photoUrl = empId > 0 && photoPath ? getEmployeePhotoImageUrl(empId) : '';

  const resolveOrgRef = useMemo(
    () => (category: string, code: unknown) => (cid != null ? resolveRef(org, category, code, loc) : disp(code)),
    [cid, org, loc]
  );

  const nationalityLabel = minorCell(
    data.educationMinorMaps?.nationality,
    p?.nationality,
    loc
  );

  const { perm: permAddr, curr: currAddr } = getPersonnelRecordAddressBlocks(data);

  const sortedEdu = useMemo(() => {
    const rows = [...data.educations];
    rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    return rows;
  }, [data.educations]);

  const sortedFam = useMemo(() => {
    const rows = [...data.families];
    rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    return rows;
  }, [data.families]);

  const sortedCert = useMemo(() => {
    const rows = [...data.certifications];
    rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    return rows;
  }, [data.certifications]);

  const sortedCareer = useMemo(() => {
    const rows = [...data.careers];
    rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    return rows;
  }, [data.careers]);

  const sortedLang = useMemo(() => {
    const rows = [...data.languages];
    rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    return rows;
  }, [data.languages]);

  const statusLabel =
    e?.status === 'active'
      ? t('employees.status.active')
      : e?.status === 'terminated'
        ? t('employees.status.terminated')
        : e?.status === 'inactive'
          ? t('employees.status.inactive')
          : disp(e?.status);

  const birthIso =
    e?.birth_date != null && String(e.birth_date).trim() !== '' ? String(e.birth_date).slice(0, 10) : '';

  const addr = data.address;

  return (
    <div className="personnel-record-card rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white text-slate-900 p-4 sm:p-5 print:p-3 print:rounded-none print:border-0 print:bg-white print:shadow-none font-sans antialiased text-sm sm:text-[15px]">
      <div className="flex items-start justify-between border-b border-slate-200 pb-3 mb-4 print:mb-3 pr-pdf-avoid-break">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {t('employees.personnelRecord.title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1.5">{data.companyName}</p>
        </div>
        <div className="flex shrink-0 items-start justify-end max-w-[min(200px,42vw)] sm:max-w-[220px]">
          {data.companyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.companyLogoUrl}
              alt=""
              className="max-h-12 sm:max-h-14 w-auto max-w-full object-contain object-right"
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 mb-4 print:flex-col print:items-stretch print:gap-3 print:mb-3">
        <div className="flex justify-center lg:justify-start shrink-0 pr-pdf-avoid-break print:justify-start">
          <div
            className="w-[116px] h-[132px] sm:w-[128px] sm:h-[146px] rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden shadow-inner print:w-[112px] print:h-[128px]"
            style={{ aspectRatio: '153 / 162' }}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                data-personnel-record-photo=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs sm:text-sm text-slate-400 px-2 text-center leading-snug">
                {t('employees.hrMaster.photoColumn')}
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 flex flex-col gap-3">
          <div className={cardShell}>
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr>
                  <td colSpan={4} className={panelTitle}>
                    {t('employees.tab.basic')}
                  </td>
                </tr>
              </thead>
              <tbody>
                <Row4
                  left={{ label: t('employees.field.company'), value: data.companyName || '—' }}
                  right={{ label: t('employees.general.empCode'), value: disp(e?.employee_number) }}
                />
                <Row4
                  left={{ label: t('employees.general.swipeCard'), value: disp(ext.swipe_card) }}
                  right={{ label: t('employees.general.startDate'), value: disp(e?.hire_date) }}
                />
                <Row4
                  left={{ label: t('employees.general.terminationDate'), value: disp(e?.termination_date) }}
                  right={{ label: t('employees.general.employmentStatus'), value: statusLabel }}
                />
                <Row4
                  left={{ label: t('employees.field.name'), value: disp(e?.name) }}
                  right={{ label: t('employees.field.email'), value: disp(e?.email) }}
                />
                <Row4
                  left={{ label: t('employees.field.phone'), value: disp(e?.phone) }}
                  right={{ label: t('employees.general.titlePrefix'), value: disp(ext.name_th_title) }}
                />
                <Row4
                  left={{ label: t('employees.general.firstNameLocal'), value: disp(ext.name_th_first) }}
                  right={{ label: t('employees.general.lastNameLocal'), value: disp(ext.name_th_last) }}
                />
                <Row4
                  left={{ label: t('employees.general.titleEnglish'), value: disp(ext.name_en_title) }}
                  right={{ label: t('employees.general.firstNameEn'), value: disp(ext.name_en_first) }}
                />
                <Row4
                  left={{ label: t('employees.general.lastNameEn'), value: disp(ext.name_en_last) }}
                  right={{
                    label: t('employees.general.division'),
                    value: resolveOrgRef('division', ext.division || e?.division),
                  }}
                />
                <Row4
                  left={{
                    label: t('employees.general.department'),
                    value: resolveOrgRef('department', e?.department),
                  }}
                  right={{ label: t('employees.general.level'), value: resolveOrgRef('level', e?.job_level) }}
                />
                <Row4
                  left={{
                    label: t('employees.general.workplace'),
                    value: resolveOrgRef('work_place', e?.work_place || ext.workplace),
                  }}
                  right={{ label: t('employees.general.area'), value: resolveOrgRef('area', e?.area || ext.area) }}
                />
                <Row4
                  left={{
                    label: t('employees.general.workStatus'),
                    value: resolveOrgRef('work_status', e?.work_status || ext.work_status),
                  }}
                  right={{ label: t('employees.general.position'), value: resolveOrgRef('position', e?.position) }}
                />
                <Row4
                  left={{
                    label: t('employees.general.empType'),
                    value: resolveOrgRef('employment_type', e?.employment_type),
                  }}
                  right={{
                    label: t('employees.general.processSalaryType'),
                    value: resolveOrgRef('employee_type', e?.salary_process_type ?? ext.salary_process_type),
                  }}
                />
                <Row4
                  left={{
                    label: t('employees.general.empLevel'),
                    value: resolveOrgRef('employee_level', e?.employee_level || ext.emp_level),
                  }}
                  right={{ label: t('employees.general.jgLevel'), value: disp(ext.jg_level) }}
                />
                <Row4
                  left={{ label: t('employees.general.fundNumber'), value: disp(ext.fund_number) }}
                  right={{ label: t('employees.general.birthDate'), value: disp(e?.birth_date) }}
                />
                <Row4
                  left={{ label: t('employees.general.ageYmd'), value: ageFromBirthDate(birthIso || null) }}
                  right={{ label: t('employees.general.sex'), value: dispGender(e?.gender, t) }}
                />
                <Row4
                  left={{ label: t('employees.general.maritalStatus'), value: dispMarital(ext.marital_status, t) }}
                  right={{ label: t('employees.general.passDate'), value: disp(ext.probation_end) }}
                />
                <Row4
                  left={{ label: t('employees.general.idCard'), value: disp(ext.national_id) }}
                  right={{ label: t('employees.general.idExpire'), value: disp(ext.id_card_expire) }}
                />
                <Row4
                  left={{ label: t('employees.general.taxId'), value: disp(e?.tax_id) }}
                  right={{ label: t('employees.general.ssoNumber'), value: disp(ext.sso_number) }}
                />
                <tr className="print:break-inside-avoid">
                  <td className={labelCell4}>{t('employees.general.ssoHospital')}</td>
                  <td className={`${valueCell4} border-b border-slate-100`} colSpan={3}>
                    {disp(ext.sso_hospital)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        <div className="space-y-3 min-w-0 pr-print-stack">
          <div className={cardShell}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <td colSpan={2} className={panelTitle}>
                  {t('employees.tab.personal')}
                </td>
              </tr>
            </thead>
            <tbody>
              <Row2 label={t('employees.personal.field.nickname')} value={disp(p?.nickname)} />
              <Row2 label={t('employees.personal.field.placeOfBirth')} value={disp(p?.place_of_birth)} />
              <Row2
                label={t('employees.personal.field.heightWeight')}
                value={`${p?.height_cm != null ? `${p.height_cm} cm` : '—'} / ${p?.weight_kg != null ? `${p.weight_kg} kg` : '—'}`}
              />
              <Row2 label={t('employees.personal.field.race')} value={disp(p?.race)} />
              <Row2 label={t('employees.personal.field.nationality')} value={nationalityLabel} />
              <Row2 label={t('employees.personal.field.religion')} value={disp(p?.religion)} />
              <Row2 label={t('employees.personal.field.bloodGroup')} value={disp(p?.blood_group)} />
              <Row2 label={t('employees.personal.field.tel')} value={disp(p?.personal_tel)} />
              <Row2 label={t('employees.personal.field.email')} value={disp(p?.personal_email)} />
              <Row2 label={t('employees.personal.field.website')} value={disp(p?.website)} />
              <Row2
                label={t('employees.personal.field.military')}
                value={
                  p?.military_status
                    ? t(`employees.personal.military.${String(p.military_status)}`, String(p.military_status))
                    : '—'
                }
              />
              <tr>
                <td className={labelCell}>{t('employees.personal.field.notes')}</td>
                <td className={`${valueCell} whitespace-pre-wrap`}>{disp(p?.personal_notes)}</td>
              </tr>
            </tbody>
          </table>
          </div>

          <div className={cardShell}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <td colSpan={2} className={panelTitle}>
                  {t('employees.personal.rightLegend')}
                </td>
              </tr>
            </thead>
            <tbody>
              <Row2 label={t('employees.personal.field.hobby')} value={disp(p?.hobby)} />
              <Row2 label={t('employees.personal.field.sports')} value={disp(p?.sports)} />
              <Row2
                label={t('employees.personal.field.typing')}
                value={`${p?.typing_thai_wpm != null && p.typing_thai_wpm !== '' ? String(p.typing_thai_wpm) : '—'} / ${p?.typing_english_wpm != null && p.typing_english_wpm !== '' ? String(p.typing_english_wpm) : '—'}`}
              />
            </tbody>
          </table>
          </div>

          <div className={cardShell}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <td colSpan={2} className={panelTitle}>
                  {t('employees.personal.licenseLegend')}
                </td>
              </tr>
            </thead>
            <tbody>
              <Row2 label={t('employees.personal.field.drivingLicense')} value={checkMark(p?.has_driving_license)} />
              <Row2 label={t('employees.personal.field.licenseNumb')} value={disp(p?.driving_license_number)} />
              <Row2 label={t('employees.personal.field.ownCar')} value={checkMark(p?.own_car)} />
              <Row2
                label={t('employees.personal.field.motorcycleLicense')}
                value={checkMark(p?.has_motorcycle_license)}
              />
              <Row2 label={t('employees.personal.field.licenseNumb')} value={disp(p?.motorcycle_license_number)} />
              <Row2 label={t('employees.personal.field.ownMotorcycle')} value={checkMark(p?.own_motorcycle)} />
            </tbody>
          </table>
          </div>
        </div>
        </div>
      </div>

      <section className={`${cardShell} mb-4 print:mb-3`}>
        <div className={panelTitle}>{t('employees.tab.address')}</div>
        <div className="p-3 sm:p-4 space-y-3 text-xs sm:text-sm leading-relaxed">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-1 md:gap-2">
            <div className="md:col-span-2 font-semibold text-slate-600 shrink-0">
              {t('employees.address.permanentLegend')}
            </div>
            <div className="md:col-span-10 text-slate-800">
              <span className="tabular-nums text-slate-500">{permAddr.zip}</span>
              {permAddr.zip !== '—' ? <span className="mx-1.5 text-slate-300">·</span> : null}
              <span>{permAddr.line}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-1 md:gap-2">
            <div className="md:col-span-2 font-semibold text-slate-600 shrink-0">
              {t('employees.address.currentLegend')}
            </div>
            <div className="md:col-span-10 text-slate-800">
              <span className="tabular-nums text-slate-500">{currAddr.zip}</span>
              {currAddr.zip !== '—' ? <span className="mx-1.5 text-slate-300">·</span> : null}
              <span>{currAddr.line}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <div>
              <span className="text-slate-500 font-medium">{t('employees.address.field.telephone')}</span>
              <span className="text-slate-400 mx-1">·</span>
              <span className="text-slate-600">{t('employees.address.permanentLegend')}</span>
              <span className="ml-2 text-slate-900">{disp(addr?.perm_telephone)}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">{t('employees.address.field.telephone')}</span>
              <span className="text-slate-400 mx-1">·</span>
              <span className="text-slate-600">{t('employees.address.currentLegend')}</span>
              <span className="ml-2 text-slate-900">{disp(addr?.curr_telephone)}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 print:grid-cols-1 print:gap-2">
        <div className={cardShell}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <td colSpan={5} className={panelTitle}>
                {t('employees.personnelRecord.family')}
              </td>
            </tr>
            <tr>
              <th className={thGrid}>{t('employees.family.col.name')}</th>
              <th className={thGrid}>{t('employees.family.col.relation')}</th>
              <th className={thGrid}>{t('employees.personnelRecord.birthDate')}</th>
              <th className={thGrid}>{t('employees.family.col.occupation')}</th>
              <th className={thGrid}>{t('employees.family.col.workplace')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedFam.length === 0 ? (
              <tr>
                <td colSpan={5} className={`${tdGrid} text-center text-slate-400`}>
                  {t('employees.inquiry.detailEmptySection')}
                </td>
              </tr>
            ) : (
              sortedFam.map((r, i) => (
                <tr key={String(r.id ?? i)}>
                  <td className={tdGrid}>{disp(r.name)}</td>
                  <td className={tdGrid}>{disp(r.relation)}</td>
                  <td className={tdGrid}>—</td>
                  <td className={tdGrid}>{disp(r.occupation)}</td>
                  <td className={tdGrid}>{disp(r.workplace)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        <div className={cardShell}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <td colSpan={4} className={panelTitle}>
                {t('employees.personnelRecord.education')}
              </td>
            </tr>
            <tr>
              <th className={thGrid}>{t('employees.education.col.qualification')}</th>
              <th className={thGrid}>{t('employees.education.inquiry.period')}</th>
              <th className={thGrid}>{t('employees.education.col.institution')}</th>
              <th className={thGrid}>{t('employees.education.col.fieldOfStudy')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedEdu.length === 0 ? (
              <tr>
                <td colSpan={4} className={`${tdGrid} text-center text-slate-400`}>
                  {t('employees.inquiry.detailEmptySection')}
                </td>
              </tr>
            ) : (
              sortedEdu.map((r, i) => {
                const eduM = data.educationMinorMaps;
                const qual = cellResolved(
                  resolveEducationMinorCell(
                    eduM?.degree,
                    toMinorId(r.degree_minor_code_id),
                    (r.educational_qualification ?? r.degree) as string | null | undefined,
                    loc
                  )
                );
                const inst = cellResolved(
                  resolveEducationMinorCell(
                    eduM?.institution,
                    toMinorId(r.institution_minor_code_id),
                    r.institution as string | null | undefined,
                    loc
                  )
                );
                const major = cellResolved(
                  resolveEducationMinorCell(
                    eduM?.field_of_study,
                    toMinorId(r.field_of_study_minor_code_id),
                    r.field_of_study as string | null | undefined,
                    loc
                  )
                );
                return (
                  <tr key={String(r.id ?? i)}>
                    <td className={tdGrid}>{qual}</td>
                    <td className={tdGrid}>
                      {r.from_year != null || r.to_year != null
                        ? `${r.from_year ?? ''}–${r.to_year ?? ''}`
                        : joinParts(r.from_date, r.to_date)}
                    </td>
                    <td className={tdGrid}>{inst}</td>
                    <td className={tdGrid}>{major}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 print:grid-cols-1 print:gap-2">
        <div className={cardShell}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <td colSpan={3} className={panelTitle}>
                {t('employees.personnelRecord.certification')}
              </td>
            </tr>
            <tr>
              <th className={thGrid}>{t('employees.certification.col.licenseType')}</th>
              <th className={thGrid}>{t('employees.certification.col.acquiredDate')}</th>
              <th className={thGrid}>{t('employees.certification.col.grade')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedCert.length === 0 ? (
              <tr>
                <td colSpan={3} className={`${tdGrid} text-center text-slate-400`}>
                  {t('employees.inquiry.detailEmptySection')}
                </td>
              </tr>
            ) : (
              sortedCert.map((r, i) => {
                const lic = cellResolved(
                  resolveEducationMinorCell(
                    data.certificationMinorMaps?.license_type,
                    toMinorId(r.license_type_minor_code_id),
                    (r.license_type_name ?? r.license_code) as string | null | undefined,
                    loc
                  )
                );
                return (
                  <tr key={String(r.id ?? i)}>
                    <td className={tdGrid}>{lic}</td>
                    <td className={tdGrid}>{disp(r.acquired_date)}</td>
                    <td className={tdGrid}>{disp(r.grade)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        <div className={cardShell}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <td colSpan={4} className={panelTitle}>
                {t('employees.personnelRecord.career')}
              </td>
            </tr>
            <tr>
              <th className={thGrid}>{t('employees.career.col.enterDate')}</th>
              <th className={thGrid}>{t('employees.career.col.resignedDate')}</th>
              <th className={thGrid}>{t('employees.career.col.companyName')}</th>
              <th className={thGrid}>{t('employees.career.col.positionTitle')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedCareer.length === 0 ? (
              <tr>
                <td colSpan={4} className={`${tdGrid} text-center text-slate-400`}>
                  {t('employees.inquiry.detailEmptySection')}
                </td>
              </tr>
            ) : (
              sortedCareer.map((r, i) => (
                <tr key={String(r.id ?? i)}>
                  <td className={tdGrid}>{disp(r.enter_date)}</td>
                  <td className={tdGrid}>{disp(r.resigned_date)}</td>
                  <td className={tdGrid}>{disp(r.company_name)}</td>
                  <td className={tdGrid}>{resolveOrgRef('position', r.position_title)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className={`${cardShell} mb-0`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td colSpan={4} className={panelTitle}>
              {t('employees.personnelRecord.language')}
            </td>
          </tr>
          <tr>
            <th className={thGrid}>{t('employees.language.col.language')}</th>
            <th className={thGrid}>{t('employees.language.col.testType')}</th>
            <th className={thGrid}>{t('employees.language.col.score')}</th>
            <th className={thGrid}>{t('employees.language.col.expiryDate')}</th>
          </tr>
        </thead>
        <tbody>
          {sortedLang.length === 0 ? (
            <tr>
              <td colSpan={4} className={`${tdGrid} text-center text-slate-400`}>
                {t('employees.inquiry.detailEmptySection')}
              </td>
            </tr>
          ) : (
            sortedLang.map((r, i) => (
              <tr key={String(r.id ?? i)}>
                <td className={tdGrid}>{translateLangOpt(t, 'lang', r.language_code)}</td>
                <td className={tdGrid}>{translateLangOpt(t, 'test', r.test_type)}</td>
                <td className={tdGrid}>{r.score != null ? String(r.score) : '—'}</td>
                <td className={tdGrid}>{disp(r.expiry_date)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
