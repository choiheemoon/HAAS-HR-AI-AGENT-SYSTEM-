'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import type { MasterExtFields } from '@/lib/employeeMasterExtension';
import { ageFromBirthDate } from '@/lib/employeeAgeService';
import { useI18n } from '@/contexts/I18nContext';
import ReferenceSelectWithSearch, {
  type ReferenceCrudFlags,
} from '@/components/employees/ReferenceSelectWithSearch';

export interface GeneralCoreDraft {
  company_id: string;
  employee_number: string;
  email: string;
  name: string;
  phone: string;
  department: string;
  position: string;
  job_level: string;
  employment_type: string;
  hire_date: string;
  birth_date: string;
  gender: string;
  address: string;
  tax_id: string;
  bank_name: string;
  bank_account: string;
  base_salary: string;
  currency: string;
  status: string;
  /** YYYY-MM-DD, DB termination_date */
  termination_date: string;
}

interface EmployeeGeneralFormProps {
  locked: boolean;
  emailReadOnly: boolean;
  /** 신규 직원 등록 시 필수(*) 표시 및 안내 */
  isNewRecord: boolean;
  /** DB PK(employees.id). 있으면 읽기 전용으로 표시 */
  recordDatabaseId?: number | null;
  core: GeneralCoreDraft;
  setCore: React.Dispatch<React.SetStateAction<GeneralCoreDraft>>;
  ext: MasterExtFields;
  setExt: React.Dispatch<React.SetStateAction<MasterExtFields>>;
  t: (key: string) => string;
  companyOptions: Array<{
    id: number;
    company_code: string;
    name_kor?: string | null;
    name_thai?: string | null;
    name_eng?: string | null;
  }>;
  orgReferenceOptions: {
    division: Array<{ id?: number; code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
    department: Array<{ id?: number; code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
    level: Array<{ id?: number; code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
    work_place: Array<{ id?: number; code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
    area: Array<{ id?: number; code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
    work_status: Array<{ id?: number; code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
    position: Array<{ id?: number; code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
    employment_type: Array<{ id?: number; code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
    employee_type: Array<{ id?: number; code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
    employee_level: Array<{ id?: number; code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }>;
  };
  /** 인사기준정보관리 메뉴 권한(검색 팝업 내 추가/수정/삭제) */
  referenceCrud?: ReferenceCrudFlags;
  onReferenceDataChanged?: () => void | Promise<void>;
}

const inputCls =
  'w-full border border-gray-300 rounded px-1.5 py-1 text-xs sm:text-sm leading-tight bg-white disabled:bg-gray-100 disabled:text-gray-600';

function Fld({
  label,
  required,
  children,
  className,
  t,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  t: (key: string) => string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label className="flex items-baseline gap-0.5 text-[11px] font-medium text-gray-600 leading-snug mb-0.5">
        <span className="truncate" title={label}>
          {label}
        </span>
        {required && (
          <abbr title={t('employees.general.requiredAria')} className="text-red-600 no-underline shrink-0 cursor-help">
            *
          </abbr>
        )}
      </label>
      {children}
    </div>
  );
}

function SectionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
        {children}
      </span>
      <span className="flex-1 h-px bg-gray-200 min-w-[1rem]" aria-hidden />
    </div>
  );
}

export default function EmployeeGeneralForm({
  locked,
  emailReadOnly,
  isNewRecord,
  recordDatabaseId = null,
  core,
  setCore,
  ext,
  setExt,
  t,
  companyOptions,
  orgReferenceOptions,
  referenceCrud,
  onReferenceDataChanged,
}: EmployeeGeneralFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { locale } = useI18n();

  const pickCompanyLabel = (c: {
    name_kor?: string | null;
    name_thai?: string | null;
    name_eng?: string | null;
    company_code: string;
  }) => {
    if (locale === 'ko') return c.name_kor || c.name_eng || c.name_thai || c.company_code;
    if (locale === 'en') return c.name_eng || c.name_kor || c.name_thai || c.company_code;
    // th (default)
    return c.name_thai || c.name_kor || c.name_eng || c.company_code;
  };

  const setPhotoFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      setExt((e) => ({ ...e, photo_data_url: url }));
    };
    reader.readAsDataURL(file);
  };

  const clearPhoto = () => {
    setExt((e) => ({ ...e, photo_data_url: '' }));
    if (fileRef.current) fileRef.current.value = '';
  };

  const showRequired = !locked;
  const reqName = showRequired;
  const reqHire = showRequired;
  const reqEmp = isNewRecord && showRequired;
  const reqEmail = isNewRecord && showRequired;
  const reqCompany = isNewRecord && showRequired;

  const pickRefLabel = (it: {
    code: string;
    name_kor?: string | null;
    name_eng?: string | null;
    name_thai?: string | null;
  }) => {
    if (locale === 'ko') return it.name_kor || it.name_eng || it.name_thai || it.code;
    if (locale === 'en') return it.name_eng || it.name_kor || it.name_thai || it.code;
    return it.name_thai || it.name_kor || it.name_eng || it.code;
  };

  const renderReferenceSelect = (
    value: string,
    onChange: (next: string) => void,
    options: Array<{
      id?: number;
      code: string;
      name_kor?: string | null;
      name_eng?: string | null;
      name_thai?: string | null;
    }>,
    dialogTitle: string,
    category: string
  ) => (
    <ReferenceSelectWithSearch
      value={value}
      onChange={onChange}
      options={options}
      disabled={locked}
      pickLabel={pickRefLabel}
      t={t}
      dialogTitle={dialogTitle}
      selectClassName={inputCls}
      referenceCategory={category}
      companyId={core.company_id ? Number(core.company_id) : null}
      referenceCrud={referenceCrud}
      onReferenceDataChanged={onReferenceDataChanged}
    />
  );

  return (
    <div className="rounded-md border border-gray-200 bg-slate-50/70 p-2 md:p-3">
      {isNewRecord && showRequired && (
        <p className="text-[11px] text-gray-600 mb-1.5 border-b border-gray-200/80 pb-1.5">
          {t('employees.general.requiredLegend')}
        </p>
      )}

      <div className="flex flex-col lg:flex-row gap-2 lg:gap-3 lg:items-start">
        {/* 사진 */}
        <div className="flex flex-row lg:flex-col gap-2 shrink-0 items-start">
          <div
            className="w-[76px] h-[86px] sm:w-[88px] sm:h-[99px] border border-dashed border-gray-300 rounded bg-white flex items-center justify-center overflow-hidden text-[9px] text-gray-400 text-center p-0.5 leading-tight"
            style={{ aspectRatio: '153 / 162' }}
          >
            {ext.photo_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ext.photo_data_url} alt="" className="w-full h-full object-cover" />
            ) : (
              t('employees.general.photoPlaceholder')
            )}
          </div>
          {!locked && (
            <div className="flex lg:flex-col gap-1">
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 whitespace-nowrap"
                onClick={() => fileRef.current?.click()}
              >
                {t('employees.general.selectPicture')}
              </button>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-red-200 text-red-600 bg-white hover:bg-red-50 whitespace-nowrap"
                onClick={clearPhoto}
              >
                {t('employees.general.delPhoto')}
              </button>
              <p className="text-[9px] text-gray-500 max-w-[88px] leading-tight mt-0.5">
                {t('employees.general.photoUploadHint')}
              </p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* 필드 그리드: 최대 6열로 밀도 확보 */}
        <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-x-2 gap-y-1.5">
          {recordDatabaseId != null && (
            <Fld label={t('employees.general.systemRecordId')} t={t}>
              <input
                className={cn(inputCls)}
                value={String(recordDatabaseId)}
                disabled
                tabIndex={-1}
                title={t('employees.general.systemRecordIdHint')}
              />
            </Fld>
          )}
          <Fld label={t('employees.field.company')} required={reqCompany} t={t}>
            <select
              className={cn(inputCls)}
              value={core.company_id}
              onChange={(e) => setCore((c) => ({ ...c, company_id: e.target.value }))}
              // 요구사항: 회사 정보는 수정 불가(화면에서 변경 불가)
              disabled
            >
              {companyOptions.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {pickCompanyLabel(c)}
                </option>
              ))}
            </select>
          </Fld>
          <Fld label={t('employees.general.empCode')} required={reqEmp} t={t}>
            <input
              className={cn(inputCls)}
              value={core.employee_number}
              onChange={(e) => setCore((c) => ({ ...c, employee_number: e.target.value }))}
              disabled={locked || !isNewRecord}
              title={!isNewRecord ? t('employees.general.empCodeLocked') : undefined}
            />
          </Fld>
          <Fld label={t('employees.general.swipeCard')} t={t}>
            <input
              className={cn(inputCls)}
              value={ext.swipe_card}
              onChange={(e) => setExt((x) => ({ ...x, swipe_card: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.startDate')} required={reqHire} t={t}>
            <input
              type="date"
              className={cn(inputCls)}
              value={core.hire_date}
              onChange={(e) => setCore((c) => ({ ...c, hire_date: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.terminationDate')} t={t}>
            <input
              type="date"
              className={cn(inputCls)}
              value={core.termination_date}
              onChange={(e) => setCore((c) => ({ ...c, termination_date: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.employmentStatus')} t={t}>
            <select
              className={cn(inputCls)}
              value={core.status === 'terminated' ? 'terminated' : 'active'}
              onChange={(e) => {
                const v = e.target.value;
                const today = new Date().toISOString().slice(0, 10);
                setCore((c) => ({
                  ...c,
                  status: v === 'terminated' ? 'terminated' : 'active',
                  termination_date: v === 'terminated' ? (c.termination_date.trim() ? c.termination_date : today) : '',
                }));
              }}
              disabled={locked}
            >
              <option value="active">{t('employees.status.active')}</option>
              <option value="terminated">{t('employees.status.terminated')}</option>
            </select>
          </Fld>
          <Fld label={t('employees.field.name')} required={reqName} t={t} className="sm:col-span-2">
            <input
              className={cn(inputCls)}
              value={core.name}
              onChange={(e) => setCore((c) => ({ ...c, name: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.field.email')} required={reqEmail} t={t} className="sm:col-span-2">
            <input
              type="email"
              className={cn(inputCls)}
              value={core.email}
              onChange={(e) => setCore((c) => ({ ...c, email: e.target.value }))}
              disabled={locked || emailReadOnly}
              title={emailReadOnly ? t('employees.general.emailLocked') : undefined}
            />
          </Fld>
          <Fld label={t('employees.field.phone')} t={t}>
            <input
              className={cn(inputCls)}
              value={core.phone}
              onChange={(e) => setCore((c) => ({ ...c, phone: e.target.value }))}
              disabled={locked}
            />
          </Fld>

          <SectionBar>{t('employees.general.nameLocal')}</SectionBar>
          <Fld label={t('employees.general.titlePrefix')} t={t}>
            <input
              className={cn(inputCls)}
              value={ext.name_th_title}
              onChange={(e) => setExt((x) => ({ ...x, name_th_title: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.firstNameLocal')} t={t}>
            <input
              className={cn(inputCls)}
              value={ext.name_th_first}
              onChange={(e) => setExt((x) => ({ ...x, name_th_first: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.lastNameLocal')} t={t}>
            <input
              className={cn(inputCls)}
              value={ext.name_th_last}
              onChange={(e) => setExt((x) => ({ ...x, name_th_last: e.target.value }))}
              disabled={locked}
            />
          </Fld>

          <SectionBar>{t('employees.general.nameEnglish')}</SectionBar>
          <Fld label={t('employees.general.titleEnglish')} t={t}>
            <select
              className={cn(inputCls)}
              value={ext.name_en_title}
              onChange={(e) => setExt((x) => ({ ...x, name_en_title: e.target.value }))}
              disabled={locked}
            >
              <option value="Mr.">Mr.</option>
              <option value="Ms.">Ms.</option>
              <option value="Mrs.">Mrs.</option>
            </select>
          </Fld>
          <Fld label={t('employees.general.firstNameEn')} t={t}>
            <input
              className={cn(inputCls)}
              value={ext.name_en_first}
              onChange={(e) => setExt((x) => ({ ...x, name_en_first: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.lastNameEn')} t={t}>
            <input
              className={cn(inputCls)}
              value={ext.name_en_last}
              onChange={(e) => setExt((x) => ({ ...x, name_en_last: e.target.value }))}
              disabled={locked}
            />
          </Fld>

          <SectionBar>{t('employees.general.sectionOrg')}</SectionBar>
          <Fld label={t('employees.general.division')} t={t}>
            {renderReferenceSelect(
              ext.division,
              (next) => setExt((x) => ({ ...x, division: next })),
              orgReferenceOptions.division,
              t('employees.general.division'),
              'division'
            )}
          </Fld>
          <Fld label={t('employees.general.department')} t={t}>
            {renderReferenceSelect(
              core.department,
              (next) => setCore((c) => ({ ...c, department: next })),
              orgReferenceOptions.department,
              t('employees.general.department'),
              'department'
            )}
          </Fld>
          <Fld label={t('employees.general.level')} t={t}>
            {renderReferenceSelect(
              core.job_level,
              (next) => setCore((c) => ({ ...c, job_level: next })),
              orgReferenceOptions.level,
              t('employees.general.level'),
              'level'
            )}
          </Fld>
          <Fld label={t('employees.general.workplace')} t={t}>
            {renderReferenceSelect(
              ext.workplace,
              (next) => setExt((x) => ({ ...x, workplace: next })),
              orgReferenceOptions.work_place,
              t('employees.general.workplace'),
              'work_place'
            )}
          </Fld>
          <Fld label={t('employees.general.area')} t={t}>
            {renderReferenceSelect(
              ext.area,
              (next) => setExt((x) => ({ ...x, area: next })),
              orgReferenceOptions.area,
              t('employees.general.area'),
              'area'
            )}
          </Fld>
          <Fld label={t('employees.general.workStatus')} t={t}>
            {renderReferenceSelect(
              ext.work_status,
              (next) => setExt((x) => ({ ...x, work_status: next })),
              orgReferenceOptions.work_status,
              t('employees.general.workStatus'),
              'work_status'
            )}
          </Fld>
          <Fld label={t('employees.general.position')} t={t} className="md:col-span-2 xl:col-span-3">
            {renderReferenceSelect(
              core.position,
              (next) => setCore((c) => ({ ...c, position: next })),
              orgReferenceOptions.position,
              t('employees.general.position'),
              'position'
            )}
          </Fld>

          <SectionBar>{t('employees.general.sectionPay')}</SectionBar>
          <Fld label={t('employees.general.empType')} t={t}>
            {renderReferenceSelect(
              core.employment_type,
              (next) => setCore((c) => ({ ...c, employment_type: next })),
              orgReferenceOptions.employment_type,
              t('employees.general.empType'),
              'employment_type'
            )}
          </Fld>
          <Fld label={t('employees.general.processSalaryType')} t={t}>
            {renderReferenceSelect(
              ext.salary_process_type,
              (next) => setExt((x) => ({ ...x, salary_process_type: next })),
              orgReferenceOptions.employee_type,
              t('employees.general.processSalaryType'),
              'employee_type'
            )}
          </Fld>
          <Fld label={t('employees.general.empLevel')} t={t}>
            {renderReferenceSelect(
              ext.emp_level,
              (next) => setExt((x) => ({ ...x, emp_level: next })),
              orgReferenceOptions.employee_level,
              t('employees.general.empLevel'),
              'employee_level'
            )}
          </Fld>
          <Fld label={t('employees.general.jgLevel')} t={t}>
            <input
              className={cn(inputCls)}
              value={ext.jg_level}
              onChange={(e) => setExt((x) => ({ ...x, jg_level: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.fundNumber')} t={t} className="md:col-span-2">
            <input
              className={cn(inputCls)}
              value={ext.fund_number}
              onChange={(e) => setExt((x) => ({ ...x, fund_number: e.target.value }))}
              disabled={locked}
            />
          </Fld>

          <SectionBar>{t('employees.general.sectionAge')}</SectionBar>
          <Fld label={t('employees.general.birthDate')} t={t}>
            <input
              type="date"
              className={cn(inputCls)}
              value={core.birth_date}
              onChange={(e) => setCore((c) => ({ ...c, birth_date: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.ageYmd')} t={t}>
            <p className="py-1 text-xs font-mono text-gray-900 tabular-nums">{ageFromBirthDate(core.birth_date || null)}</p>
          </Fld>
          <Fld label={t('employees.general.sex')} t={t}>
            <select
              className={cn(inputCls)}
              value={core.gender}
              onChange={(e) => setCore((c) => ({ ...c, gender: e.target.value }))}
              disabled={locked}
            >
              <option value="">{t('employees.general.selectPlaceholder')}</option>
              <option value="male">{t('employees.general.genderMale')}</option>
              <option value="female">{t('employees.general.genderFemale')}</option>
              <option value="other">{t('employees.general.genderOther')}</option>
            </select>
          </Fld>
          <Fld label={t('employees.general.maritalStatus')} t={t}>
            <select
              className={cn(inputCls)}
              value={ext.marital_status}
              onChange={(e) => setExt((x) => ({ ...x, marital_status: e.target.value }))}
              disabled={locked}
            >
              <option value="">{t('employees.general.selectPlaceholder')}</option>
              <option value="single">{t('employees.general.maritalSingle')}</option>
              <option value="married">{t('employees.general.maritalMarried')}</option>
              <option value="divorced">{t('employees.general.maritalDivorced')}</option>
              <option value="widowed">{t('employees.general.maritalWidowed')}</option>
            </select>
          </Fld>

          <SectionBar>{t('employees.general.sectionIds')}</SectionBar>
          <Fld label={t('employees.general.passDate')} t={t}>
            <input
              type="date"
              className={cn(inputCls)}
              value={ext.probation_end}
              onChange={(e) => setExt((x) => ({ ...x, probation_end: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.idCard')} t={t}>
            <input
              className={cn(inputCls)}
              value={ext.national_id}
              onChange={(e) => setExt((x) => ({ ...x, national_id: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.idExpire')} t={t}>
            <input
              type="date"
              className={cn(inputCls)}
              value={ext.id_card_expire}
              onChange={(e) => setExt((x) => ({ ...x, id_card_expire: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.taxId')} t={t}>
            <input
              className={cn(inputCls)}
              value={core.tax_id}
              onChange={(e) => setCore((c) => ({ ...c, tax_id: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.ssoNumber')} t={t}>
            <input
              className={cn(inputCls)}
              value={ext.sso_number}
              onChange={(e) => setExt((x) => ({ ...x, sso_number: e.target.value }))}
              disabled={locked}
            />
          </Fld>
          <Fld label={t('employees.general.ssoHospital')} t={t} className="md:col-span-2">
            <input
              className={cn(inputCls)}
              value={ext.sso_hospital}
              onChange={(e) => setExt((x) => ({ ...x, sso_hospital: e.target.value }))}
              disabled={locked}
            />
          </Fld>
        </div>
      </div>
    </div>
  );
}
