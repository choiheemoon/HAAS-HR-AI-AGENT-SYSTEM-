'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import {
  fetchPerCompanyAddressGeoMinorMaps,
  fetchPerCompanyEducationMinorMaps,
  resolveEducationMinorCell,
  type AddressGeoCodeField,
  type PerCompanyAddressGeoMinorMaps,
  type PerCompanyEducationMinorMaps,
} from '@/lib/educationMinorLookup';

export type HrMasterInquiryDetailEmployee = {
  id: number;
  name: string;
  employee_number: string;
};

function disp(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return String(v);
}

/** 본적/현주소 중 minor 기준정보로 풀 수 있는 컬럼만 명칭으로 표시 */
function formatAddressColumn(
  addr: Record<string, unknown>,
  column: string,
  eduMaps: PerCompanyEducationMinorMaps | null,
  geoMaps: PerCompanyAddressGeoMinorMaps | null,
  loc: string
): string {
  const m = column.match(/^(perm|curr)_(nationality|zone|province|district|sub_district|postcode)$/);
  if (!m) return disp(addr[column]);
  const [, prefix, suffix] = m;
  const idKey = `${prefix}_${suffix}_minor_code_id`;
  const maps =
    suffix === 'nationality'
      ? eduMaps?.nationality
      : geoMaps?.[suffix as AddressGeoCodeField];
  const label = resolveEducationMinorCell(
    maps,
    addr[idKey] as number | null | undefined,
    addr[column] as string | null | undefined,
    loc
  );
  return label === '-' ? '—' : label;
}

type RefItem = {
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

function SectionCard({
  title,
  children,
  bodyClassName = 'p-4',
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

export default function HrMasterInquiryDetailModal(props: {
  open: boolean;
  onClose: () => void;
  employee: HrMasterInquiryDetailEmployee | null;
}) {
  const { open, onClose, employee } = props;
  const { t, locale } = useI18n();
  const [state, setState] = useState<LoadState>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [educationExtra, setEducationExtra] = useState<{ activity?: string | null; certificate?: string | null }>(
    {}
  );
  const [educations, setEducations] = useState<Record<string, unknown>[]>([]);
  const [careers, setCareers] = useState<Record<string, unknown>[]>([]);
  const [certs, setCerts] = useState<Record<string, unknown>[]>([]);
  const [languages, setLanguages] = useState<Record<string, unknown>[]>([]);
  const [families, setFamilies] = useState<Record<string, unknown>[]>([]);
  const [address, setAddress] = useState<Record<string, unknown> | null>(null);
  const [minorMaps, setMinorMaps] = useState<PerCompanyEducationMinorMaps | null>(null);
  const [addressGeoMaps, setAddressGeoMaps] = useState<PerCompanyAddressGeoMinorMaps | null>(null);
  const [positionRefItems, setPositionRefItems] = useState<RefItem[]>([]);

  const positionCodeMap = useMemo(() => {
    const m = new Map<string, RefItem>();
    for (const it of positionRefItems) {
      const c = (it.code || '').trim();
      if (!c) continue;
      m.set(c, it);
      m.set(c.toLowerCase(), it);
    }
    return m;
  }, [positionRefItems]);

  const pickRefLabel = useCallback(
    (it: RefItem) => {
      if (locale === 'ko') return it.name_kor || it.name_eng || it.name_thai || it.code;
      if (locale === 'en') return it.name_eng || it.name_kor || it.name_thai || it.code;
      return it.name_thai || it.name_kor || it.name_eng || it.code;
    },
    [locale]
  );

  const resolveCareerPosition = useCallback(
    (raw: unknown): string => {
      if (raw == null || String(raw).trim() === '') return '—';
      const ck = String(raw).trim();
      const found = positionCodeMap.get(ck) ?? positionCodeMap.get(ck.toLowerCase());
      if (found) return pickRefLabel(found);
      return ck;
    },
    [pickRefLabel, positionCodeMap]
  );

  const load = useCallback(async () => {
    if (!employee || !Number.isInteger(employee.id) || employee.id <= 0) {
      setState('error');
      setErrMsg(t('employees.inquiry.detailLoadError'));
      return;
    }
    setState('loading');
    setErrMsg(null);
    setMinorMaps(null);
    setAddressGeoMaps(null);
    setPositionRefItems([]);
    const id = employee.id;
    try {
      const [empRes, eduRes, carRes, certRes, langRes, famRes, addrRes] = await Promise.allSettled([
        apiClient.getEmployee(id),
        apiClient.getEmployeeEducations(id),
        apiClient.getEmployeeCareers(id),
        apiClient.getEmployeeCertifications(id),
        apiClient.getEmployeeLanguages(id),
        apiClient.getEmployeeFamilies(id),
        apiClient.getEmployeeAddressInfo(id),
      ]);

      if (empRes.status === 'fulfilled') {
        const d = empRes.value.data as Record<string, unknown>;
        setEducationExtra({
          activity: (d.education_activity_study as string) ?? null,
          certificate: (d.education_certificate as string) ?? null,
        });
        const cid = d.company_id as number | null | undefined;
        if (cid != null) {
          const [minorRes, addrGeoRes, posRes] = await Promise.allSettled([
            fetchPerCompanyEducationMinorMaps(cid),
            fetchPerCompanyAddressGeoMinorMaps(cid),
            apiClient.getEmployeeReferenceItems('position', cid),
          ]);
          if (minorRes.status === 'fulfilled' && minorRes.value) {
            setMinorMaps(minorRes.value);
          }
          if (addrGeoRes.status === 'fulfilled' && addrGeoRes.value) {
            setAddressGeoMaps(addrGeoRes.value);
          }
          if (posRes.status === 'fulfilled') {
            const list = (posRes.value.data as RefItem[]) ?? [];
            setPositionRefItems(Array.isArray(list) ? list : []);
          }
        }
      } else {
        setEducationExtra({});
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
  }, [employee, t]);

  useEffect(() => {
    if (!open || !employee) {
      setState('idle');
      setMinorMaps(null);
      setAddressGeoMaps(null);
      setPositionRefItems([]);
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
        aria-labelledby="hr-inquiry-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-emerald-50/20 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-1 h-9 w-1 rounded-full bg-emerald-600 shrink-0" aria-hidden />
            <div className="min-w-0">
              <h2 id="hr-inquiry-detail-title" className="text-lg font-semibold text-slate-900 tracking-tight">
                {t('employees.inquiry.detailTitle')}
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
          {state === 'error' && errMsg && <p className="text-sm text-red-600 py-4 px-1">{errMsg}</p>}
          {state === 'done' && (
            <div className="space-y-5">
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
                          <tr key={String(row.id ?? i)} className="hover:bg-slate-50/60 transition-colors">
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
                          <tr key={String(row.id ?? i)} className="hover:bg-slate-50/60 transition-colors">
                            <td className={td}>{i + 1}</td>
                            <td className={td}>{disp(row.company_name)}</td>
                            <td className={td}>{resolveCareerPosition(row.position_title)}</td>
                            <td className={`${td} max-w-[14rem] whitespace-normal`}>{disp(row.work_details)}</td>
                            <td className={td}>{disp(row.enter_date)}</td>
                            <td className={td}>{disp(row.resigned_date)}</td>
                            <td className={`${td} max-w-[12rem] whitespace-normal`}>{disp(row.address)}</td>
                            <td className={td}>{disp(row.telephone)}</td>
                            <td className={td}>{disp(row.begin_salary)}</td>
                            <td className={td}>{disp(row.latest_salary)}</td>
                            <td className={td}>{disp(row.tenure_text)}</td>
                            <td className={`${td} max-w-[14rem] whitespace-normal`}>{disp(row.resignation_reason)}</td>
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
                          <tr key={String(row.id ?? i)} className="hover:bg-slate-50/60 transition-colors">
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
                          <tr key={String(row.id ?? i)} className="hover:bg-slate-50/60 transition-colors">
                            <td className={td}>{i + 1}</td>
                            <td className={td}>{disp(row.language_code)}</td>
                            <td className={td}>{disp(row.test_type)}</td>
                            <td className={td}>{disp(row.acquisition_date)}</td>
                            <td className={td}>{disp(row.score)}</td>
                            <td className={td}>{disp(row.grade)}</td>
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
                          <tr key={String(row.id ?? i)} className="hover:bg-slate-50/60 transition-colors">
                            <td className={td}>{i + 1}</td>
                            <td className={td}>{disp(row.name)}</td>
                            <td className={td}>{disp(row.relation)}</td>
                            <td className={td}>{disp(row.resident_number)}</td>
                            <td className={td}>{disp(row.domestic_foreign)}</td>
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
                          ].map(([key, field]) => (
                            <div key={field} className="flex gap-2">
                              <dt className="text-slate-500 shrink-0 min-w-[8rem] font-medium">
                                {t(`employees.address.field.${key}` as never)}
                              </dt>
                              <dd className="text-slate-900 break-words">
                                {formatAddressColumn(address, field, minorMaps, addressGeoMaps, locale)}
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
