'use client';

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Filter, Search } from 'lucide-react';
import { ColumnFilterPopover } from '@/components/ui/ColumnFilterPopover';
import { apiClient, getEmployeePhotoThumbnailUrl } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import { loadMasterExt, type MasterExtFields } from '@/lib/employeeMasterExtension';
import HrMasterInquiryDetailModal, {
  type HrMasterInquiryDetailEmployee,
} from '@/components/employees/HrMasterInquiryDetailModal';
import EducationInquiryDetailModal from '@/components/employees/EducationInquiryDetailModal';
import {
  fetchPerCompanyCertificationMinorMaps,
  fetchPerCompanyEducationMinorMaps,
  joinResolvedEducationMinorField,
  resolveEducationMinorCell,
  type PerCompanyCertificationMinorMaps,
  type PerCompanyEducationMinorMaps,
} from '@/lib/educationMinorLookup';

/** 인사마스터조회·학력조회 상세 모달 공통 최소 필드 + 학력조회 시 회사 표시용 */
type InquiryDetailEmployee = HrMasterInquiryDetailEmployee & {
  company_id?: number | null;
  company_label?: string | null;
};

type Employee = {
  id: number;
  company_id?: number | null;
  employee_number: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  hire_date?: string | null;
  termination_date?: string | null;
  department?: string | null;
  position?: string | null;
  division?: string | null;
  work_place?: string | null;
  area?: string | null;
  work_status?: string | null;
  employment_type?: string | null;
  salary_process_type?: string | null;
  employee_level?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  tax_id?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  currency?: string | null;
  job_level?: string | null;
  photo_path?: string | null;
};

type PersonalInfo = {
  nickname?: string | null;
  place_of_birth?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  race?: string | null;
  nationality?: string | null;
  religion?: string | null;
  blood_group?: string | null;
  personal_tel?: string | null;
  personal_email?: string | null;
  website?: string | null;
  military_status?: string | null;
  hobby?: string | null;
  sports?: string | null;
  typing_thai_wpm?: number | null;
  typing_english_wpm?: number | null;
  has_driving_license?: boolean | null;
  driving_license_number?: string | null;
  own_car?: boolean | null;
  has_motorcycle_license?: boolean | null;
  motorcycle_license_number?: string | null;
  own_motorcycle?: boolean | null;
};

type PersonalInfoBulkRow = PersonalInfo & { employee_id: number };

type CompanyOption = {
  id: number;
  company_code: string;
  name_kor?: string | null;
  name_thai?: string | null;
  name_eng?: string | null;
};

type InquiryRow = {
  employee: Employee;
  personal: PersonalInfo | null;
};
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
type OrgRefByCompany = Record<number, Partial<Record<RefCategory, RefItem[]>>>;

/** 인사기준정보 bulk API와 맞춤(회사당 1회 로드) */
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

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
type ColumnKey =
  | 'photo'
  | 'company'
  | 'employeeNumber'
  | 'swipeCard'
  | 'name'
  | 'nameThTitle'
  | 'nameThFirst'
  | 'nameThLast'
  | 'nameEnTitle'
  | 'nameEnFirst'
  | 'nameEnLast'
  | 'status'
  | 'hireDate'
  | 'terminationDate'
  | 'probationEnd'
  | 'department'
  | 'position'
  | 'division'
  | 'jobLevel'
  | 'workPlace'
  | 'area'
  | 'workStatus'
  | 'employmentType'
  | 'salaryProcessType'
  | 'employeeLevel'
  | 'jgLevel'
  | 'fundNumber'
  | 'birthDate'
  | 'gender'
  | 'maritalStatus'
  | 'nationalId'
  | 'idCardExpire'
  | 'taxId'
  | 'ssoNumber'
  | 'ssoHospital'
  | 'email'
  | 'phone'
  | 'nickname'
  | 'placeOfBirth'
  | 'race'
  | 'nationality'
  | 'religion'
  | 'heightCm'
  | 'weightKg'
  | 'bloodGroup'
  | 'personalTel'
  | 'personalEmail'
  | 'website'
  | 'military'
  | 'hobby'
  | 'sports'
  | 'typing'
  | 'drivingLicense'
  | 'ownCar'
  | 'motorcycleLicense'
  | 'ownMotorcycle'
  | 'eduQualification'
  | 'eduInstitution'
  | 'eduDegree'
  | 'eduField'
  | 'eduNationality'
  | 'eduPeriod'
  | 'eduGrade'
  | 'carCompanyName'
  | 'carPositionTitle'
  | 'carWorkDetails'
  | 'carEnterDate'
  | 'carResignedDate'
  | 'carAddress'
  | 'carTelephone'
  | 'carBeginSalary'
  | 'carLatestSalary'
  | 'carTenure'
  | 'carResignationReason'
  | 'certLicenseType'
  | 'certLicenseCode'
  | 'certGrade'
  | 'certIssuerName'
  | 'certIssuerCode'
  | 'certAcquiredDate'
  | 'certEffectiveDate'
  | 'certNextRenewal'
  | 'certCertificateNumber'
  | 'addrPermPostcode'
  | 'addrPermPrimary'
  | 'addrPermStreet'
  | 'addrPermRegion'
  | 'addrPermNationality'
  | 'addrPermZone'
  | 'addrPermTelephone'
  | 'addrCurrPostcode'
  | 'addrCurrPrimary'
  | 'addrCurrStreet'
  | 'addrCurrRegion'
  | 'addrCurrNationality'
  | 'addrCurrZone'
  | 'addrCurrTelephone'
  | 'langLanguage'
  | 'langTestType'
  | 'langAcquisitionDate'
  | 'langScore'
  | 'langGrade'
  | 'langExpiryDate'
  | 'famRelation'
  | 'famMemberName'
  | 'famResidentNumber'
  | 'famEducation'
  | 'famOccupation'
  | 'famCohabitation'
  | 'famDependency';

type PreparedInquiryRow = { row: InquiryRow; cells: Record<ColumnKey, string> };

export type HrMasterInquiryVariant =
  | 'hr-master'
  | 'education'
  | 'career'
  | 'certification'
  | 'family'
  | 'address'
  | 'language';

type HrMasterInquiryPageProps = {
  variant?: HrMasterInquiryVariant;
};

type EmployeeEducationRow = {
  employee_id: number;
  sort_order: number;
  degree?: string | null;
  field_of_study?: string | null;
  institution?: string | null;
  nationality?: string | null;
  degree_minor_code_id?: number | null;
  field_of_study_minor_code_id?: number | null;
  institution_minor_code_id?: number | null;
  nationality_minor_code_id?: number | null;
  from_date?: string | null;
  to_date?: string | null;
  from_year?: number | null;
  to_year?: number | null;
  grade?: string | null;
  educational_qualification?: string | null;
};

function joinEducationFields(
  rows: EmployeeEducationRow[],
  pick: (r: EmployeeEducationRow) => string | null | undefined
): string {
  const parts = rows.map(pick).map((s) => String(s ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(' | ') : '-';
}

function formatOneEducationPeriod(r: EmployeeEducationRow): string {
  if (r.from_year != null || r.to_year != null) {
    const a = r.from_year != null ? String(r.from_year) : '';
    const b = r.to_year != null ? String(r.to_year) : '';
    if (a && b) return `${a}–${b}`;
    if (a || b) return a || b;
  }
  const d1 = r.from_date ? String(r.from_date).slice(0, 10) : '';
  const d2 = r.to_date ? String(r.to_date).slice(0, 10) : '';
  if (d1 && d2) return `${d1} ~ ${d2}`;
  if (d1 || d2) return d1 || d2;
  return '';
}

function joinEducationPeriods(rows: EmployeeEducationRow[]): string {
  const parts = rows.map(formatOneEducationPeriod).filter(Boolean);
  return parts.length ? parts.join(' | ') : '-';
}

type EmployeeCareerRow = {
  id?: number;
  employee_id: number;
  sort_order: number;
  company_name?: string | null;
  position_title?: string | null;
  work_details?: string | null;
  enter_date?: string | null;
  resigned_date?: string | null;
  address?: string | null;
  telephone?: string | null;
  begin_salary?: string | null;
  latest_salary?: string | null;
  tenure_text?: string | null;
  resignation_reason?: string | null;
};

function joinCareerFields(
  rows: EmployeeCareerRow[],
  pick: (r: EmployeeCareerRow) => string | null | undefined
): string {
  const parts = rows.map(pick).map((s) => String(s ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(' | ') : '-';
}

function joinCareerDates(rows: EmployeeCareerRow[], key: 'enter_date' | 'resigned_date'): string {
  const parts = rows
    .map((r) => {
      const v = r[key];
      if (v == null || v === '') return '';
      return String(v).slice(0, 10);
    })
    .filter(Boolean);
  return parts.length ? parts.join(' | ') : '-';
}

type EmployeeCertificationRow = {
  id?: number;
  employee_id: number;
  sort_order: number;
  license_type_minor_code_id?: number | null;
  issuer_minor_code_id?: number | null;
  license_code?: string | null;
  license_type_name?: string | null;
  grade?: string | null;
  issuer_code?: string | null;
  issuer_name?: string | null;
  acquired_date?: string | null;
  effective_date?: string | null;
  next_renewal_date?: string | null;
  certificate_number?: string | null;
};

type EmployeeFamilyRow = {
  id?: number;
  employee_id: number;
  sort_order: number;
  name?: string | null;
  relation?: string | null;
  resident_number?: string | null;
  domestic_foreign?: string | null;
  highest_education?: string | null;
  occupation?: string | null;
  workplace?: string | null;
  position?: string | null;
  support_reason?: string | null;
};

function joinFamFields(
  rows: EmployeeFamilyRow[],
  pick: (r: EmployeeFamilyRow) => string | null | undefined
): string {
  const parts = rows.map(pick).map((s) => String(s ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(' | ') : '-';
}

function joinCertFields(
  rows: EmployeeCertificationRow[],
  pick: (r: EmployeeCertificationRow) => string | null | undefined
): string {
  const parts = rows.map(pick).map((s) => String(s ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(' | ') : '-';
}

function joinCertDates(rows: EmployeeCertificationRow[], key: keyof EmployeeCertificationRow): string {
  const parts = rows
    .map((r) => {
      const v = r[key];
      if (v == null || v === '') return '';
      return String(v).slice(0, 10);
    })
    .filter(Boolean);
  return parts.length ? parts.join(' | ') : '-';
}

function joinCertLicenseTypeResolved(
  rows: EmployeeCertificationRow[],
  companyId: number | null | undefined,
  lookup: Record<number, PerCompanyCertificationMinorMaps>,
  locale: string
): string {
  const maps = companyId != null ? lookup[companyId] : undefined;
  const m = maps?.license_type;
  const parts: string[] = [];
  for (const r of rows) {
    const label = resolveEducationMinorCell(
      m,
      r.license_type_minor_code_id,
      r.license_type_name ?? r.license_code,
      locale
    );
    if (label && label !== '-') parts.push(label);
  }
  return parts.length ? parts.join(' | ') : '-';
}

function joinCertIssuerResolved(
  rows: EmployeeCertificationRow[],
  companyId: number | null | undefined,
  lookup: Record<number, PerCompanyCertificationMinorMaps>,
  locale: string
): string {
  const maps = companyId != null ? lookup[companyId] : undefined;
  const m = maps?.issuer;
  const parts: string[] = [];
  for (const r of rows) {
    const label = resolveEducationMinorCell(
      m,
      r.issuer_minor_code_id,
      r.issuer_name ?? r.issuer_code,
      locale
    );
    if (label && label !== '-') parts.push(label);
  }
  return parts.length ? parts.join(' | ') : '-';
}

type EmployeeAddressRow = {
  id?: number;
  employee_id: number;
  perm_house_no_th?: string | null;
  perm_house_no_en?: string | null;
  perm_building_th?: string | null;
  perm_building_en?: string | null;
  perm_soi_th?: string | null;
  perm_soi_en?: string | null;
  perm_street_th?: string | null;
  perm_street_en?: string | null;
  perm_nationality?: string | null;
  perm_zone?: string | null;
  perm_province?: string | null;
  perm_district?: string | null;
  perm_sub_district?: string | null;
  perm_postcode?: string | null;
  perm_telephone?: string | null;
  curr_house_no_th?: string | null;
  curr_house_no_en?: string | null;
  curr_building_th?: string | null;
  curr_building_en?: string | null;
  curr_soi_th?: string | null;
  curr_soi_en?: string | null;
  curr_street_th?: string | null;
  curr_street_en?: string | null;
  curr_nationality?: string | null;
  curr_zone?: string | null;
  curr_province?: string | null;
  curr_district?: string | null;
  curr_sub_district?: string | null;
  curr_postcode?: string | null;
  curr_telephone?: string | null;
};

function joinAddrParts(...parts: (string | null | undefined)[]): string {
  const s = parts.map((p) => String(p ?? '').trim()).filter(Boolean).join(' ');
  return s || '-';
}

function addrPrimaryTh(a: EmployeeAddressRow | null | undefined, kind: 'perm' | 'curr'): string {
  if (!a) return '-';
  const pre = kind === 'perm' ? 'perm' : 'curr';
  return joinAddrParts(
    a[`${pre}_house_no_th` as keyof EmployeeAddressRow] as string | null,
    a[`${pre}_building_th` as keyof EmployeeAddressRow] as string | null,
    a[`${pre}_soi_th` as keyof EmployeeAddressRow] as string | null
  );
}

function addrStreetLine(a: EmployeeAddressRow | null | undefined, kind: 'perm' | 'curr'): string {
  if (!a) return '-';
  const pre = kind === 'perm' ? 'perm' : 'curr';
  const th = a[`${pre}_street_th` as keyof EmployeeAddressRow] as string | null;
  const en = a[`${pre}_street_en` as keyof EmployeeAddressRow] as string | null;
  return joinAddrParts(th, en);
}

function addrRegionLine(a: EmployeeAddressRow | null | undefined, kind: 'perm' | 'curr'): string {
  if (!a) return '-';
  const pre = kind === 'perm' ? 'perm' : 'curr';
  return joinAddrParts(
    a[`${pre}_province` as keyof EmployeeAddressRow] as string | null,
    a[`${pre}_district` as keyof EmployeeAddressRow] as string | null,
    a[`${pre}_sub_district` as keyof EmployeeAddressRow] as string | null
  );
}

type EmployeeLanguageRow = {
  id?: number;
  employee_id: number;
  sort_order: number;
  language_code?: string | null;
  test_type?: string | null;
  score?: number | null;
  grade?: string | null;
  acquisition_date?: string | null;
  expiry_date?: string | null;
};

function translateLanguageOpt(
  t: (key: string) => string,
  prefix: 'lang' | 'test' | 'grade',
  raw: string | null | undefined
): string {
  const c = String(raw ?? '').trim();
  if (!c) return '';
  const key = `employees.language.opt.${prefix}.${c}`;
  const label = t(key);
  return label === key ? c : label;
}

function joinLanguageOptFields(
  rows: EmployeeLanguageRow[],
  pick: (r: EmployeeLanguageRow) => string | null | undefined,
  prefix: 'lang' | 'test' | 'grade',
  t: (key: string) => string
): string {
  const parts: string[] = [];
  for (const r of rows) {
    const s = translateLanguageOpt(t, prefix, pick(r));
    if (s) parts.push(s);
  }
  return parts.length ? parts.join(' | ') : '-';
}

function joinLanguageScores(rows: EmployeeLanguageRow[]): string {
  const parts = rows.map((r) => (r.score != null ? String(r.score) : '')).filter(Boolean);
  return parts.length ? parts.join(' | ') : '-';
}

function joinLanguageDates(rows: EmployeeLanguageRow[], key: 'acquisition_date' | 'expiry_date'): string {
  const parts = rows
    .map((r) => {
      const v = r[key];
      if (v == null || v === '') return '';
      return String(v).slice(0, 10);
    })
    .filter(Boolean);
  return parts.length ? parts.join(' | ') : '-';
}

const ALL_COLUMN_FILTER_KEYS: ColumnKey[] = [
  'photo',
  'company',
  'employeeNumber',
  'swipeCard',
  'name',
  'nameThTitle',
  'nameThFirst',
  'nameThLast',
  'nameEnTitle',
  'nameEnFirst',
  'nameEnLast',
  'status',
  'hireDate',
  'terminationDate',
  'probationEnd',
  'department',
  'position',
  'division',
  'jobLevel',
  'workPlace',
  'area',
  'workStatus',
  'employmentType',
  'salaryProcessType',
  'employeeLevel',
  'jgLevel',
  'fundNumber',
  'birthDate',
  'gender',
  'maritalStatus',
  'nationalId',
  'idCardExpire',
  'taxId',
  'ssoNumber',
  'ssoHospital',
  'email',
  'phone',
  'nickname',
  'placeOfBirth',
  'race',
  'nationality',
  'religion',
  'heightCm',
  'weightKg',
  'bloodGroup',
  'personalTel',
  'personalEmail',
  'website',
  'military',
  'hobby',
  'sports',
  'typing',
  'drivingLicense',
  'ownCar',
  'motorcycleLicense',
  'ownMotorcycle',
  'eduQualification',
  'eduInstitution',
  'eduDegree',
  'eduField',
  'eduNationality',
  'eduPeriod',
  'eduGrade',
  'carCompanyName',
  'carPositionTitle',
  'carWorkDetails',
  'carEnterDate',
  'carResignedDate',
  'carAddress',
  'carTelephone',
  'carBeginSalary',
  'carLatestSalary',
  'carTenure',
  'carResignationReason',
  'certLicenseType',
  'certLicenseCode',
  'certGrade',
  'certIssuerName',
  'certIssuerCode',
  'certAcquiredDate',
  'certEffectiveDate',
  'certNextRenewal',
  'certCertificateNumber',
  'addrPermPostcode',
  'addrPermPrimary',
  'addrPermStreet',
  'addrPermRegion',
  'addrPermNationality',
  'addrPermZone',
  'addrPermTelephone',
  'addrCurrPostcode',
  'addrCurrPrimary',
  'addrCurrStreet',
  'addrCurrRegion',
  'addrCurrNationality',
  'addrCurrZone',
  'addrCurrTelephone',
  'langLanguage',
  'langTestType',
  'langAcquisitionDate',
  'langScore',
  'langGrade',
  'langExpiryDate',
  'famRelation',
  'famMemberName',
  'famResidentNumber',
  'famEducation',
  'famOccupation',
  'famCohabitation',
  'famDependency',
];

function emptyColumnFilters(): Record<ColumnKey, string[]> {
  const r = {} as Record<ColumnKey, string[]>;
  for (const k of ALL_COLUMN_FILTER_KEYS) {
    r[k] = [];
  }
  return r;
}

export function HrMasterInquiryPage({ variant = 'hr-master' }: HrMasterInquiryPageProps) {
  const { t, locale } = useI18n();
  const numberLocale = locale === 'ko' ? 'ko-KR' : locale === 'th' ? 'th-TH' : 'en-US';
  const { can, loading: permLoading } = useMenuPermissions();
  const allowRead = can('hr-master-inquiry', 'can_read');

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [personalByEmployeeId, setPersonalByEmployeeId] = useState<Record<number, PersonalInfo | null>>({});
  const [masterExtByEmployeeId, setMasterExtByEmployeeId] = useState<Record<number, MasterExtFields>>({});
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'terminated'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [orgRefByCompany, setOrgRefByCompany] = useState<OrgRefByCompany>({});
  const [openFilterKey, setOpenFilterKey] = useState<ColumnKey | null>(null);
  const [excelExporting, setExcelExporting] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState<InquiryDetailEmployee | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<ColumnKey, string[]>>(() => emptyColumnFilters());
  const [educationsByEmployeeId, setEducationsByEmployeeId] = useState<Record<number, EmployeeEducationRow[]>>({});
  const [careersByEmployeeId, setCareersByEmployeeId] = useState<Record<number, EmployeeCareerRow[]>>({});
  const [certificationsByEmployeeId, setCertificationsByEmployeeId] = useState<
    Record<number, EmployeeCertificationRow[]>
  >({});
  const [familiesByEmployeeId, setFamiliesByEmployeeId] = useState<Record<number, EmployeeFamilyRow[]>>({});
  const [educationMinorLookupByCompany, setEducationMinorLookupByCompany] = useState<
    Record<number, PerCompanyEducationMinorMaps>
  >({});
  const [certificationMinorLookupByCompany, setCertificationMinorLookupByCompany] = useState<
    Record<number, PerCompanyCertificationMinorMaps>
  >({});
  const [languagesByEmployeeId, setLanguagesByEmployeeId] = useState<Record<number, EmployeeLanguageRow[]>>({});
  const [addressByEmployeeId, setAddressByEmployeeId] = useState<Record<number, EmployeeAddressRow | null>>({});
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);

  const educationLookupCompanyIds = useMemo(() => {
    if (variant !== 'education') return [] as number[];
    if (selectedCompanyId != null) return [selectedCompanyId];
    const s = new Set<number>();
    for (const e of employees) {
      if (e.company_id != null) s.add(e.company_id);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [variant, selectedCompanyId, employees]);

  const certificationLookupCompanyIds = useMemo(() => {
    if (variant !== 'certification') return [] as number[];
    if (selectedCompanyId != null) return [selectedCompanyId];
    const s = new Set<number>();
    for (const e of employees) {
      if (e.company_id != null) s.add(e.company_id);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [variant, selectedCompanyId, employees]);

  const educationLookupCompanyIdsKey = educationLookupCompanyIds.join(',');
  const certificationLookupCompanyIdsKey = certificationLookupCompanyIds.join(',');

  useEffect(() => {
    if (variant !== 'education') {
      setEducationMinorLookupByCompany({});
      return;
    }
    if (educationLookupCompanyIds.length === 0) {
      setEducationMinorLookupByCompany({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        educationLookupCompanyIds.map(async (cid) => {
          const maps = await fetchPerCompanyEducationMinorMaps(cid);
          return [cid, maps] as const;
        })
      );
      if (cancelled) return;
      const next: Record<number, PerCompanyEducationMinorMaps> = {};
      for (const [cid, maps] of results) {
        if (maps) next[cid] = maps;
      }
      setEducationMinorLookupByCompany(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [variant, educationLookupCompanyIdsKey]);

  useEffect(() => {
    if (variant !== 'certification') {
      setCertificationMinorLookupByCompany({});
      return;
    }
    if (certificationLookupCompanyIds.length === 0) {
      setCertificationMinorLookupByCompany({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        certificationLookupCompanyIds.map(async (cid) => {
          const maps = await fetchPerCompanyCertificationMinorMaps(cid);
          return [cid, maps] as const;
        })
      );
      if (cancelled) return;
      const next: Record<number, PerCompanyCertificationMinorMaps> = {};
      for (const [cid, maps] of results) {
        if (maps) next[cid] = maps;
      }
      setCertificationMinorLookupByCompany(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [variant, certificationLookupCompanyIdsKey]);

  const companyLabelById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of companyOptions) {
      if (locale === 'ko') m.set(c.id, c.name_kor || c.name_eng || c.name_thai || c.company_code);
      else if (locale === 'en') m.set(c.id, c.name_eng || c.name_kor || c.name_thai || c.company_code);
      else m.set(c.id, c.name_thai || c.name_kor || c.name_eng || c.company_code);
    }
    return m;
  }, [companyOptions, locale]);

  const pickRefLabel = useCallback(
    (it: RefItem) => {
      if (locale === 'ko') return it.name_kor || it.name_eng || it.name_thai || it.code;
      if (locale === 'en') return it.name_eng || it.name_kor || it.name_thai || it.code;
      return it.name_thai || it.name_kor || it.name_eng || it.code;
    },
    [locale]
  );

  /** 기준정보 코드 → 항목 O(1) 탐색(행×열 조회 시 선형 find 비용 제거) */
  const refCodeMapsByCompany = useMemo(() => {
    const companies = new Map<number, Partial<Record<RefCategory, Map<string, RefItem>>>>();
    for (const cid of Object.keys(orgRefByCompany).map(Number)) {
      const per = orgRefByCompany[cid];
      if (!per) continue;
      const maps: Partial<Record<RefCategory, Map<string, RefItem>>> = {};
      for (const cat of REF_CATEGORIES) {
        const list = per[cat] ?? [];
        const m = new Map<string, RefItem>();
        for (const it of list) {
          const c = (it.code || '').trim();
          if (!c) continue;
          m.set(c, it);
          m.set(c.toLowerCase(), it);
        }
        maps[cat] = m;
      }
      companies.set(cid, maps);
    }
    return companies;
  }, [orgRefByCompany]);

  const resolveRefLabelForRow = useCallback(
    (companyId: number | null | undefined, category: RefCategory, code?: string | null) => {
      if (companyId == null || code == null) return '-';
      const ck = String(code).trim();
      if (!ck) return '-';
      const maps = refCodeMapsByCompany.get(companyId);
      const m = maps?.[category];
      const found = m?.get(ck) ?? m?.get(ck.toLowerCase());
      return pickRefLabel(found || { code: ck });
    },
    [pickRefLabel, refCodeMapsByCompany]
  );

  const fetchEmployees = useCallback(async (companyId: number | null) => {
    const res =
      companyId == null ? await apiClient.getEmployees() : await apiClient.getEmployees({ company_id: companyId });
    return (res.data as Employee[]) ?? [];
  }, []);

  const fetchOrgRefs = useCallback(async (companyIds: number[]) => {
    if (companyIds.length === 0) {
      setOrgRefByCompany({});
      return;
    }
    const results = await Promise.allSettled(
      companyIds.map(async (cid) => {
        const res = await apiClient.getEmployeeReferenceItemsAllCategories(cid);
        const data = (res.data as Record<string, RefItem[]>) ?? {};
        const perCompany: Partial<Record<RefCategory, RefItem[]>> = {};
        for (const cat of REF_CATEGORIES) {
          const list = data[cat];
          perCompany[cat] = Array.isArray(list) ? list : [];
        }
        return { cid, perCompany };
      })
    );
    const next: OrgRefByCompany = {};
    for (const r of results) {
      if (r.status === 'fulfilled') {
        next[r.value.cid] = r.value.perCompany;
      }
    }
    setOrgRefByCompany(next);
  }, []);

  const fetchPersonalBulkMap = useCallback(async (empList: Employee[], companyFilter: number | null) => {
    const empty: Record<number, PersonalInfo | null> = {};
    for (const e of empList) empty[e.id] = null;
    if (empList.length === 0) return empty;
    try {
      const res = await apiClient.getEmployeePersonalInfoBulk(
        companyFilter != null ? { company_id: companyFilter } : undefined
      );
      const rows = (res.data as PersonalInfoBulkRow[] | undefined) ?? [];
      const next = { ...empty };
      for (const r of rows) {
        if (r.employee_id in next) next[r.employee_id] = r;
      }
      return next;
    } catch {
      return empty;
    }
  }, []);

  const fetchEducationsBulkMap = useCallback(async (companyFilter: number | null) => {
    try {
      const res = await apiClient.getEmployeeEducationsBulk(
        companyFilter != null ? { company_id: companyFilter } : undefined
      );
      const rows = (res.data as EmployeeEducationRow[]) ?? [];
      const next: Record<number, EmployeeEducationRow[]> = {};
      for (const r of rows) {
        const id = r.employee_id;
        if (!next[id]) next[id] = [];
        next[id].push(r);
      }
      for (const id of Object.keys(next)) {
        next[Number(id)]!.sort((a, b) => a.sort_order - b.sort_order);
      }
      return next;
    } catch {
      return {};
    }
  }, []);

  const fetchCareersBulkMap = useCallback(async (companyFilter: number | null) => {
    try {
      const res = await apiClient.getEmployeeCareersBulk(
        companyFilter != null ? { company_id: companyFilter } : undefined
      );
      const rows = (res.data as EmployeeCareerRow[]) ?? [];
      const next: Record<number, EmployeeCareerRow[]> = {};
      for (const r of rows) {
        const id = r.employee_id;
        if (!next[id]) next[id] = [];
        next[id].push(r);
      }
      for (const id of Object.keys(next)) {
        next[Number(id)]!.sort((a, b) => a.sort_order - b.sort_order || (a.id ?? 0) - (b.id ?? 0));
      }
      return next;
    } catch {
      return {};
    }
  }, []);

  const fetchCertificationsBulkMap = useCallback(async (companyFilter: number | null) => {
    try {
      const res = await apiClient.getEmployeeCertificationsBulk(
        companyFilter != null ? { company_id: companyFilter } : undefined
      );
      const rows = (res.data as EmployeeCertificationRow[]) ?? [];
      const next: Record<number, EmployeeCertificationRow[]> = {};
      for (const r of rows) {
        const id = r.employee_id;
        if (!next[id]) next[id] = [];
        next[id].push(r);
      }
      for (const id of Object.keys(next)) {
        next[Number(id)]!.sort((a, b) => a.sort_order - b.sort_order || (a.id ?? 0) - (b.id ?? 0));
      }
      return next;
    } catch {
      return {};
    }
  }, []);

  const fetchFamiliesBulkMap = useCallback(async (companyFilter: number | null) => {
    try {
      const res = await apiClient.getEmployeeFamiliesBulk(
        companyFilter != null ? { company_id: companyFilter } : undefined
      );
      const rows = (res.data as EmployeeFamilyRow[]) ?? [];
      const next: Record<number, EmployeeFamilyRow[]> = {};
      for (const r of rows) {
        const id = r.employee_id;
        if (!next[id]) next[id] = [];
        next[id].push(r);
      }
      for (const id of Object.keys(next)) {
        next[Number(id)]!.sort((a, b) => a.sort_order - b.sort_order || (a.id ?? 0) - (b.id ?? 0));
      }
      return next;
    } catch {
      return {};
    }
  }, []);

  const fetchLanguagesBulkMap = useCallback(async (companyFilter: number | null) => {
    try {
      const res = await apiClient.getEmployeeLanguagesBulk(
        companyFilter != null ? { company_id: companyFilter } : undefined
      );
      const rows = (res.data as EmployeeLanguageRow[]) ?? [];
      const next: Record<number, EmployeeLanguageRow[]> = {};
      for (const r of rows) {
        const id = r.employee_id;
        if (!next[id]) next[id] = [];
        next[id].push(r);
      }
      for (const id of Object.keys(next)) {
        next[Number(id)]!.sort((a, b) => a.sort_order - b.sort_order || (a.id ?? 0) - (b.id ?? 0));
      }
      return next;
    } catch {
      return {};
    }
  }, []);

  const fetchAddressesBulkMap = useCallback(async (companyFilter: number | null) => {
    try {
      const res = await apiClient.getEmployeeAddressesBulk(
        companyFilter != null ? { company_id: companyFilter } : undefined
      );
      const rows = (res.data as EmployeeAddressRow[]) ?? [];
      const next: Record<number, EmployeeAddressRow | null> = {};
      for (const r of rows) {
        next[r.employee_id] = r;
      }
      return next;
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    if (permLoading) return;
    if (!allowRead) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const companyRes = await apiClient.getMyCompanies();
        const companies = (companyRes.data as CompanyOption[]) ?? [];
        setCompanyOptions(companies);
        await fetchOrgRefs(companies.map((c) => c.id));
      } catch {
        setCompanyOptions([]);
      }
    })();
  }, [permLoading, allowRead, fetchOrgRefs]);

  useEffect(() => {
    if (permLoading || !allowRead) return;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const items = await fetchEmployees(selectedCompanyId);
          setEmployees(items);
          startTransition(() => {
            const extMap: Record<number, MasterExtFields> = {};
            for (const emp of items) {
              const loaded = loadMasterExt(emp.id);
              extMap[emp.id] = emp.photo_path?.trim()
                ? { ...loaded, photo_data_url: getEmployeePhotoThumbnailUrl(emp.id) }
                : loaded;
            }
            setMasterExtByEmployeeId(extMap);
          });
          if (variant === 'education') {
            setPersonalByEmployeeId({});
            setCareersByEmployeeId({});
            setCertificationsByEmployeeId({});
            setFamiliesByEmployeeId({});
            setLanguagesByEmployeeId({});
            setAddressByEmployeeId({});
            const eduMap = await fetchEducationsBulkMap(selectedCompanyId);
            setEducationsByEmployeeId(eduMap);
          } else if (variant === 'career') {
            setPersonalByEmployeeId({});
            setEducationsByEmployeeId({});
            setCertificationsByEmployeeId({});
            setFamiliesByEmployeeId({});
            setLanguagesByEmployeeId({});
            setAddressByEmployeeId({});
            const carMap = await fetchCareersBulkMap(selectedCompanyId);
            setCareersByEmployeeId(carMap);
          } else if (variant === 'certification') {
            setPersonalByEmployeeId({});
            setEducationsByEmployeeId({});
            setCareersByEmployeeId({});
            setFamiliesByEmployeeId({});
            setLanguagesByEmployeeId({});
            setAddressByEmployeeId({});
            const certMap = await fetchCertificationsBulkMap(selectedCompanyId);
            setCertificationsByEmployeeId(certMap);
          } else if (variant === 'family') {
            setPersonalByEmployeeId({});
            setEducationsByEmployeeId({});
            setCareersByEmployeeId({});
            setCertificationsByEmployeeId({});
            setLanguagesByEmployeeId({});
            setAddressByEmployeeId({});
            const famMap = await fetchFamiliesBulkMap(selectedCompanyId);
            setFamiliesByEmployeeId(famMap);
          } else if (variant === 'address') {
            setPersonalByEmployeeId({});
            setEducationsByEmployeeId({});
            setCareersByEmployeeId({});
            setCertificationsByEmployeeId({});
            setFamiliesByEmployeeId({});
            setLanguagesByEmployeeId({});
            const addrMap = await fetchAddressesBulkMap(selectedCompanyId);
            setAddressByEmployeeId(addrMap);
          } else if (variant === 'language') {
            setPersonalByEmployeeId({});
            setEducationsByEmployeeId({});
            setCareersByEmployeeId({});
            setCertificationsByEmployeeId({});
            setFamiliesByEmployeeId({});
            setAddressByEmployeeId({});
            const langMap = await fetchLanguagesBulkMap(selectedCompanyId);
            setLanguagesByEmployeeId(langMap);
          } else {
            setEducationsByEmployeeId({});
            setCareersByEmployeeId({});
            setCertificationsByEmployeeId({});
            setFamiliesByEmployeeId({});
            setLanguagesByEmployeeId({});
            setAddressByEmployeeId({});
            const nextMap = await fetchPersonalBulkMap(items, selectedCompanyId);
            setPersonalByEmployeeId(nextMap);
          }
        } catch {
          setEmployees([]);
          setPersonalByEmployeeId({});
          setEducationsByEmployeeId({});
          setCareersByEmployeeId({});
          setCertificationsByEmployeeId({});
          setFamiliesByEmployeeId({});
          setLanguagesByEmployeeId({});
          setAddressByEmployeeId({});
        } finally {
          setLoading(false);
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [
    permLoading,
    allowRead,
    fetchEmployees,
    fetchCareersBulkMap,
    fetchAddressesBulkMap,
    fetchCertificationsBulkMap,
    fetchEducationsBulkMap,
    fetchFamiliesBulkMap,
    fetchLanguagesBulkMap,
    fetchPersonalBulkMap,
    selectedCompanyId,
    variant,
  ]);

  const statusLabel = useCallback(
    (status: string) => {
      if (status === 'active') return t('employees.status.active');
      if (status === 'terminated') return t('employees.status.terminated');
      return t('employees.status.inactive');
    },
    [t]
  );

  const yesNo = (v: unknown) => {
    if (v === true) return 'Y';
    if (v === false) return 'N';
    return '-';
  };

  const genderLabel = useCallback(
    (raw: string | null | undefined): string => {
      if (raw == null || String(raw).trim() === '') return '-';
      const v = String(raw).trim().toLowerCase();
      if (['male', 'm', '남', '남성', 'man', 'ชาย'].includes(v)) return t('employees.general.genderMale');
      if (['female', 'f', '여', '여성', 'woman', 'หญิง'].includes(v)) return t('employees.general.genderFemale');
      return t('employees.general.genderOther');
    },
    [t]
  );

  const filteredRows = useMemo<InquiryRow[]>(() => {
    const q = searchTerm.trim().toLowerCase();
    return employees
      .filter((emp) => (statusFilter === 'all' ? true : emp.status === statusFilter))
      .filter((emp) => {
        if (!q) return true;
        const p = personalByEmployeeId[emp.id];
        const eduRows = educationsByEmployeeId[emp.id] ?? [];
        const eduMaps =
          emp.company_id != null ? educationMinorLookupByCompany[emp.company_id] : undefined;
        const eduText =
          variant === 'education'
            ? eduRows
                .map((r) =>
                  [
                    r.educational_qualification,
                    eduMaps
                      ? resolveEducationMinorCell(
                          eduMaps.institution,
                          r.institution_minor_code_id,
                          r.institution,
                          locale
                        )
                      : r.institution,
                    eduMaps
                      ? resolveEducationMinorCell(eduMaps.degree, r.degree_minor_code_id, r.degree, locale)
                      : r.degree,
                    eduMaps
                      ? resolveEducationMinorCell(
                          eduMaps.field_of_study,
                          r.field_of_study_minor_code_id,
                          r.field_of_study,
                          locale
                        )
                      : r.field_of_study,
                    eduMaps
                      ? resolveEducationMinorCell(
                          eduMaps.nationality,
                          r.nationality_minor_code_id,
                          r.nationality,
                          locale
                        )
                      : r.nationality,
                    r.grade,
                  ]
                    .filter((x) => x != null && String(x).trim() !== '' && String(x) !== '-')
                    .join(' ')
                )
                .join(' ')
            : '';
        const careerRows = careersByEmployeeId[emp.id] ?? [];
        const careerText =
          variant === 'career'
            ? careerRows
                .map((r) =>
                  [
                    r.company_name,
                    resolveRefLabelForRow(emp.company_id, 'position', r.position_title as string | null),
                    r.work_details,
                    r.enter_date,
                    r.resigned_date,
                    r.address,
                    r.telephone,
                    r.begin_salary,
                    r.latest_salary,
                    r.tenure_text,
                    r.resignation_reason,
                  ]
                    .filter((x) => x != null && String(x).trim() !== '' && String(x) !== '-')
                    .join(' ')
                )
                .join(' ')
            : '';
        const certRows = certificationsByEmployeeId[emp.id] ?? [];
        const certText =
          variant === 'certification'
            ? certRows
                .map((r) =>
                  [
                    joinCertLicenseTypeResolved([r], emp.company_id, certificationMinorLookupByCompany, locale),
                    r.license_code,
                    r.grade,
                    joinCertIssuerResolved([r], emp.company_id, certificationMinorLookupByCompany, locale),
                    r.issuer_code,
                    r.acquired_date,
                    r.effective_date,
                    r.next_renewal_date,
                    r.certificate_number,
                  ]
                    .filter((x) => x != null && String(x).trim() !== '' && String(x) !== '-')
                    .join(' ')
                )
                .join(' ')
            : '';
        const famRows = familiesByEmployeeId[emp.id] ?? [];
        const famText =
          variant === 'family'
            ? famRows
                .map((r) =>
                  [
                    r.relation,
                    r.name,
                    r.resident_number,
                    r.highest_education,
                    r.occupation,
                  ]
                    .filter((x) => x != null && String(x).trim() !== '' && String(x) !== '-')
                    .join(' ')
                )
                .join(' ')
            : '';
        const langRows = languagesByEmployeeId[emp.id] ?? [];
        const langText =
          variant === 'language'
            ? langRows
                .map((r) =>
                  [
                    translateLanguageOpt(t, 'lang', r.language_code),
                    translateLanguageOpt(t, 'test', r.test_type),
                    r.acquisition_date,
                    r.score != null ? String(r.score) : '',
                    translateLanguageOpt(t, 'grade', r.grade),
                    r.expiry_date,
                  ]
                    .filter((x) => x != null && String(x).trim() !== '' && String(x) !== '-')
                    .join(' ')
                )
                .join(' ')
            : '';
        const addrRow = addressByEmployeeId[emp.id];
        const addrText =
          variant === 'address' && addrRow
            ? [
                addrRow.perm_postcode,
                addrRow.perm_nationality,
                addrRow.perm_zone,
                addrRow.perm_province,
                addrRow.perm_district,
                addrRow.perm_sub_district,
                addrPrimaryTh(addrRow, 'perm'),
                addrStreetLine(addrRow, 'perm'),
                addrRow.perm_telephone,
                addrRow.curr_postcode,
                addrRow.curr_nationality,
                addrRow.curr_zone,
                addrRow.curr_province,
                addrRow.curr_district,
                addrRow.curr_sub_district,
                addrPrimaryTh(addrRow, 'curr'),
                addrStreetLine(addrRow, 'curr'),
                addrRow.curr_telephone,
              ]
                .filter((x) => x != null && String(x).trim() !== '' && String(x) !== '-')
                .join(' ')
            : '';
        const pool = [
          emp.name,
          emp.employee_number,
          emp.email ?? '',
          emp.department ?? '',
          emp.position ?? '',
          p?.nickname ?? '',
          p?.personal_email ?? '',
          p?.nationality ?? '',
          eduText,
          careerText,
          certText,
          famText,
          langText,
          addrText,
        ]
          .join(' ')
          .toLowerCase();
        return pool.includes(q);
      })
      .map((employee) => ({ employee, personal: personalByEmployeeId[employee.id] ?? null }));
  }, [
    addressByEmployeeId,
    careersByEmployeeId,
    certificationMinorLookupByCompany,
    certificationsByEmployeeId,
    familiesByEmployeeId,
    employees,
    educationsByEmployeeId,
    educationMinorLookupByCompany,
    languagesByEmployeeId,
    locale,
    personalByEmployeeId,
    resolveRefLabelForRow,
    searchTerm,
    statusFilter,
    t,
    variant,
  ]);

  const getCellValue = useCallback(
    (row: InquiryRow, key: ColumnKey): string => {
      const e = row.employee;
      const p = row.personal;
      const ext = masterExtByEmployeeId[e.id];
      const cid = e.company_id ?? undefined;
      switch (key) {
        case 'photo':
          return e.photo_path?.trim() || ext?.photo_data_url?.trim() ? t('system.users.boolYes') : '-';
        case 'company':
          return (e.company_id != null ? companyLabelById.get(e.company_id) : undefined) ?? '-';
        case 'employeeNumber':
          return e.employee_number || '-';
        case 'swipeCard':
          return ext?.swipe_card || '-';
        case 'name':
          return e.name || '-';
        case 'nameThTitle':
          return ext?.name_th_title || '-';
        case 'nameThFirst':
          return ext?.name_th_first || '-';
        case 'nameThLast':
          return ext?.name_th_last || '-';
        case 'nameEnTitle':
          return ext?.name_en_title || '-';
        case 'nameEnFirst':
          return ext?.name_en_first || '-';
        case 'nameEnLast':
          return ext?.name_en_last || '-';
        case 'status':
          return statusLabel(e.status);
        case 'hireDate':
          return e.hire_date ? String(e.hire_date).slice(0, 10) : '-';
        case 'terminationDate':
          return e.termination_date ? String(e.termination_date).slice(0, 10) : '-';
        case 'probationEnd':
          return ext?.probation_end || '-';
        case 'department':
          return resolveRefLabelForRow(cid, 'department', e.department);
        case 'position':
          return resolveRefLabelForRow(cid, 'position', e.position);
        case 'division':
          return resolveRefLabelForRow(cid, 'division', e.division || ext?.division);
        case 'jobLevel':
          return resolveRefLabelForRow(cid, 'level', e.job_level);
        case 'workPlace':
          return resolveRefLabelForRow(cid, 'work_place', e.work_place || ext?.workplace);
        case 'area':
          return resolveRefLabelForRow(cid, 'area', e.area || ext?.area);
        case 'workStatus':
          return resolveRefLabelForRow(cid, 'work_status', e.work_status || ext?.work_status);
        case 'employmentType':
          return resolveRefLabelForRow(cid, 'employment_type', e.employment_type);
        case 'salaryProcessType':
          return resolveRefLabelForRow(cid, 'employee_type', e.salary_process_type || ext?.salary_process_type);
        case 'employeeLevel':
          return resolveRefLabelForRow(cid, 'employee_level', e.employee_level || ext?.emp_level);
        case 'jgLevel':
          return ext?.jg_level || '-';
        case 'fundNumber':
          return ext?.fund_number || '-';
        case 'birthDate':
          return e.birth_date ? String(e.birth_date).slice(0, 10) : '-';
        case 'gender':
          return genderLabel(e.gender);
        case 'maritalStatus':
          return ext?.marital_status || '-';
        case 'nationalId':
          return ext?.national_id || '-';
        case 'idCardExpire':
          return ext?.id_card_expire || '-';
        case 'taxId':
          return e.tax_id || '-';
        case 'ssoNumber':
          return ext?.sso_number || '-';
        case 'ssoHospital':
          return ext?.sso_hospital || '-';
        case 'email':
          return e.email || '-';
        case 'phone':
          return e.phone || '-';
        case 'nickname':
          return p?.nickname || '-';
        case 'placeOfBirth':
          return p?.place_of_birth || '-';
        case 'race':
          return p?.race || '-';
        case 'nationality':
          return p?.nationality || '-';
        case 'religion':
          return p?.religion || '-';
        case 'heightCm':
          return p?.height_cm != null ? String(p.height_cm) : '-';
        case 'weightKg':
          return p?.weight_kg != null ? String(p.weight_kg) : '-';
        case 'bloodGroup':
          return p?.blood_group || '-';
        case 'personalTel':
          return p?.personal_tel || '-';
        case 'personalEmail':
          return p?.personal_email || '-';
        case 'website':
          return p?.website || '-';
        case 'military':
          return p?.military_status
            ? t(`employees.personal.military.${String(p.military_status)}`, p.military_status)
            : '-';
        case 'hobby':
          return p?.hobby || '-';
        case 'sports':
          return p?.sports || '-';
        case 'typing':
          return p?.typing_thai_wpm != null || p?.typing_english_wpm != null
            ? `${p?.typing_thai_wpm ?? '-'} / ${p?.typing_english_wpm ?? '-'}`
            : '-';
        case 'drivingLicense':
          return `${yesNo(p?.has_driving_license)}${p?.driving_license_number ? ` (${p.driving_license_number})` : ''}`;
        case 'ownCar':
          return yesNo(p?.own_car);
        case 'motorcycleLicense':
          return `${yesNo(p?.has_motorcycle_license)}${p?.motorcycle_license_number ? ` (${p.motorcycle_license_number})` : ''}`;
        case 'ownMotorcycle':
          return yesNo(p?.own_motorcycle);
        case 'eduQualification':
          return joinEducationFields(educationsByEmployeeId[e.id] ?? [], (r) => r.educational_qualification);
        case 'eduInstitution':
          return joinResolvedEducationMinorField(
            educationsByEmployeeId[e.id] ?? [],
            e.company_id,
            educationMinorLookupByCompany,
            'institution',
            locale
          );
        case 'eduDegree':
          return joinResolvedEducationMinorField(
            educationsByEmployeeId[e.id] ?? [],
            e.company_id,
            educationMinorLookupByCompany,
            'degree',
            locale
          );
        case 'eduField':
          return joinResolvedEducationMinorField(
            educationsByEmployeeId[e.id] ?? [],
            e.company_id,
            educationMinorLookupByCompany,
            'field_of_study',
            locale
          );
        case 'eduNationality':
          return joinResolvedEducationMinorField(
            educationsByEmployeeId[e.id] ?? [],
            e.company_id,
            educationMinorLookupByCompany,
            'nationality',
            locale
          );
        case 'eduPeriod':
          return joinEducationPeriods(educationsByEmployeeId[e.id] ?? []);
        case 'eduGrade':
          return joinEducationFields(educationsByEmployeeId[e.id] ?? [], (r) => r.grade);
        case 'carCompanyName':
          return joinCareerFields(careersByEmployeeId[e.id] ?? [], (r) => r.company_name);
        case 'carPositionTitle': {
          const rows = careersByEmployeeId[e.id] ?? [];
          const parts = rows.map((r) => {
            const raw = r.position_title;
            if (raw == null || String(raw).trim() === '') return '';
            const v = resolveRefLabelForRow(cid, 'position', String(raw));
            return v === '-' ? String(raw).trim() : v;
          }).filter(Boolean);
          return parts.length ? parts.join(' | ') : '-';
        }
        case 'carWorkDetails':
          return joinCareerFields(careersByEmployeeId[e.id] ?? [], (r) => r.work_details);
        case 'carEnterDate':
          return joinCareerDates(careersByEmployeeId[e.id] ?? [], 'enter_date');
        case 'carResignedDate':
          return joinCareerDates(careersByEmployeeId[e.id] ?? [], 'resigned_date');
        case 'carAddress':
          return joinCareerFields(careersByEmployeeId[e.id] ?? [], (r) => r.address);
        case 'carTelephone':
          return joinCareerFields(careersByEmployeeId[e.id] ?? [], (r) => r.telephone);
        case 'carBeginSalary':
          return joinCareerFields(careersByEmployeeId[e.id] ?? [], (r) => r.begin_salary);
        case 'carLatestSalary':
          return joinCareerFields(careersByEmployeeId[e.id] ?? [], (r) => r.latest_salary);
        case 'carTenure':
          return joinCareerFields(careersByEmployeeId[e.id] ?? [], (r) => r.tenure_text);
        case 'carResignationReason':
          return joinCareerFields(careersByEmployeeId[e.id] ?? [], (r) => r.resignation_reason);
        case 'certLicenseType':
          return joinCertLicenseTypeResolved(
            certificationsByEmployeeId[e.id] ?? [],
            e.company_id,
            certificationMinorLookupByCompany,
            locale
          );
        case 'certLicenseCode':
          return joinCertFields(certificationsByEmployeeId[e.id] ?? [], (r) => r.license_code);
        case 'certGrade':
          return joinCertFields(certificationsByEmployeeId[e.id] ?? [], (r) => r.grade);
        case 'certIssuerName':
          return joinCertIssuerResolved(
            certificationsByEmployeeId[e.id] ?? [],
            e.company_id,
            certificationMinorLookupByCompany,
            locale
          );
        case 'certIssuerCode':
          return joinCertFields(certificationsByEmployeeId[e.id] ?? [], (r) => r.issuer_code);
        case 'certAcquiredDate':
          return joinCertDates(certificationsByEmployeeId[e.id] ?? [], 'acquired_date');
        case 'certEffectiveDate':
          return joinCertDates(certificationsByEmployeeId[e.id] ?? [], 'effective_date');
        case 'certNextRenewal':
          return joinCertDates(certificationsByEmployeeId[e.id] ?? [], 'next_renewal_date');
        case 'certCertificateNumber':
          return joinCertFields(certificationsByEmployeeId[e.id] ?? [], (r) => r.certificate_number);
        case 'addrPermPostcode': {
          const a = addressByEmployeeId[e.id];
          return a?.perm_postcode?.trim() || '-';
        }
        case 'addrPermPrimary':
          return addrPrimaryTh(addressByEmployeeId[e.id], 'perm');
        case 'addrPermStreet':
          return addrStreetLine(addressByEmployeeId[e.id], 'perm');
        case 'addrPermRegion':
          return addrRegionLine(addressByEmployeeId[e.id], 'perm');
        case 'addrPermNationality': {
          const a = addressByEmployeeId[e.id];
          return a?.perm_nationality?.trim() || '-';
        }
        case 'addrPermZone': {
          const a = addressByEmployeeId[e.id];
          return a?.perm_zone?.trim() || '-';
        }
        case 'addrPermTelephone': {
          const a = addressByEmployeeId[e.id];
          return a?.perm_telephone?.trim() || '-';
        }
        case 'addrCurrPostcode': {
          const a = addressByEmployeeId[e.id];
          return a?.curr_postcode?.trim() || '-';
        }
        case 'addrCurrPrimary':
          return addrPrimaryTh(addressByEmployeeId[e.id], 'curr');
        case 'addrCurrStreet':
          return addrStreetLine(addressByEmployeeId[e.id], 'curr');
        case 'addrCurrRegion':
          return addrRegionLine(addressByEmployeeId[e.id], 'curr');
        case 'addrCurrNationality': {
          const a = addressByEmployeeId[e.id];
          return a?.curr_nationality?.trim() || '-';
        }
        case 'addrCurrZone': {
          const a = addressByEmployeeId[e.id];
          return a?.curr_zone?.trim() || '-';
        }
        case 'addrCurrTelephone': {
          const a = addressByEmployeeId[e.id];
          return a?.curr_telephone?.trim() || '-';
        }
        case 'langLanguage':
          return joinLanguageOptFields(languagesByEmployeeId[e.id] ?? [], (r) => r.language_code, 'lang', t);
        case 'langTestType':
          return joinLanguageOptFields(languagesByEmployeeId[e.id] ?? [], (r) => r.test_type, 'test', t);
        case 'langAcquisitionDate':
          return joinLanguageDates(languagesByEmployeeId[e.id] ?? [], 'acquisition_date');
        case 'langScore':
          return joinLanguageScores(languagesByEmployeeId[e.id] ?? []);
        case 'langGrade':
          return joinLanguageOptFields(languagesByEmployeeId[e.id] ?? [], (r) => r.grade, 'grade', t);
        case 'langExpiryDate':
          return joinLanguageDates(languagesByEmployeeId[e.id] ?? [], 'expiry_date');
        case 'famRelation':
          return joinFamFields(familiesByEmployeeId[e.id] ?? [], (r) => r.relation);
        case 'famMemberName':
          return joinFamFields(familiesByEmployeeId[e.id] ?? [], (r) => r.name);
        case 'famResidentNumber':
          return joinFamFields(familiesByEmployeeId[e.id] ?? [], (r) => r.resident_number);
        case 'famEducation':
          return joinFamFields(familiesByEmployeeId[e.id] ?? [], (r) => r.highest_education);
        case 'famOccupation':
          return joinFamFields(familiesByEmployeeId[e.id] ?? [], (r) => r.occupation);
        case 'famCohabitation':
          return '-';
        case 'famDependency':
          return '-';
        default:
          return '-';
      }
    },
    [
      addressByEmployeeId,
      careersByEmployeeId,
      certificationMinorLookupByCompany,
      certificationsByEmployeeId,
      familiesByEmployeeId,
      companyLabelById,
      educationsByEmployeeId,
      educationMinorLookupByCompany,
      genderLabel,
      languagesByEmployeeId,
      locale,
      masterExtByEmployeeId,
      resolveRefLabelForRow,
      statusLabel,
      t,
    ]
  );

  const columns = useMemo<Array<{ key: ColumnKey; label: string }>>(() => {
    if (variant === 'education') {
      return [
        { key: 'company', label: t('employees.field.company') },
        { key: 'photo', label: t('employees.hrMaster.photoColumn') },
        { key: 'employeeNumber', label: t('employees.field.employeeNumber') },
        { key: 'name', label: t('employees.field.name') },
        { key: 'eduQualification', label: t('employees.education.col.qualification') },
        { key: 'eduInstitution', label: t('employees.education.col.institution') },
        { key: 'eduDegree', label: t('employees.education.col.degree') },
        { key: 'eduField', label: t('employees.education.col.fieldOfStudy') },
        { key: 'eduNationality', label: t('employees.education.col.nationality') },
        { key: 'eduPeriod', label: t('employees.education.inquiry.period') },
        { key: 'eduGrade', label: t('employees.education.col.grade') },
        { key: 'department', label: t('employees.field.department') },
        { key: 'position', label: t('employees.field.position') },
        { key: 'status', label: t('employees.field.status') },
      ];
    }
    if (variant === 'career') {
      return [
        { key: 'company', label: t('employees.field.company') },
        { key: 'photo', label: t('employees.hrMaster.photoColumn') },
        { key: 'employeeNumber', label: t('employees.field.employeeNumber') },
        { key: 'name', label: t('employees.field.name') },
        { key: 'carCompanyName', label: t('employees.career.col.companyName') },
        { key: 'carPositionTitle', label: t('employees.career.col.positionTitle') },
        { key: 'carWorkDetails', label: t('employees.career.col.workDetails') },
        { key: 'carEnterDate', label: t('employees.career.col.enterDate') },
        { key: 'carResignedDate', label: t('employees.career.col.resignedDate') },
        { key: 'carAddress', label: t('employees.career.col.address') },
        { key: 'carTelephone', label: t('employees.career.col.telephone') },
        { key: 'carBeginSalary', label: t('employees.career.col.beginSalary') },
        { key: 'carLatestSalary', label: t('employees.career.col.latestSalary') },
        { key: 'carTenure', label: t('employees.career.col.tenure') },
        { key: 'carResignationReason', label: t('employees.career.col.resignationReason') },
        { key: 'department', label: t('employees.field.department') },
        { key: 'position', label: t('employees.field.position') },
        { key: 'status', label: t('employees.field.status') },
      ];
    }
    if (variant === 'certification') {
      return [
        { key: 'company', label: t('employees.field.company') },
        { key: 'photo', label: t('employees.hrMaster.photoColumn') },
        { key: 'employeeNumber', label: t('employees.field.employeeNumber') },
        { key: 'name', label: t('employees.field.name') },
        { key: 'certLicenseType', label: t('employees.certification.col.licenseType') },
        { key: 'certLicenseCode', label: t('employees.certification.col.licenseCode') },
        { key: 'certGrade', label: t('employees.certification.col.grade') },
        { key: 'certIssuerName', label: t('employees.certification.col.issuerName') },
        { key: 'certIssuerCode', label: t('employees.certification.col.issuerCode') },
        { key: 'certAcquiredDate', label: t('employees.certification.col.acquiredDate') },
        { key: 'certEffectiveDate', label: t('employees.certification.col.effectiveDate') },
        { key: 'certNextRenewal', label: t('employees.certification.col.nextRenewal') },
        { key: 'certCertificateNumber', label: t('employees.certification.col.certificateNumber') },
        { key: 'department', label: t('employees.field.department') },
        { key: 'position', label: t('employees.field.position') },
        { key: 'status', label: t('employees.field.status') },
      ];
    }
    if (variant === 'family') {
      return [
        { key: 'company', label: t('employees.field.company') },
        { key: 'photo', label: t('employees.hrMaster.photoColumn') },
        { key: 'employeeNumber', label: t('employees.field.employeeNumber') },
        { key: 'name', label: t('employees.field.name') },
        { key: 'famRelation', label: t('employees.family.col.relation') },
        { key: 'famMemberName', label: t('employees.family.col.name') },
        { key: 'famResidentNumber', label: t('employees.family.col.residentNumber') },
        { key: 'famEducation', label: t('employees.family.col.highestEducation') },
        { key: 'famOccupation', label: t('employees.family.col.occupation') },
        { key: 'famCohabitation', label: t('employees.familyInquiry.col.cohabitation') },
        { key: 'famDependency', label: t('employees.familyInquiry.col.dependency') },
        { key: 'department', label: t('employees.field.department') },
        { key: 'position', label: t('employees.field.position') },
        { key: 'status', label: t('employees.field.status') },
      ];
    }
    if (variant === 'address') {
      return [
        { key: 'company', label: t('employees.field.company') },
        { key: 'photo', label: t('employees.hrMaster.photoColumn') },
        { key: 'employeeNumber', label: t('employees.field.employeeNumber') },
        { key: 'name', label: t('employees.field.name') },
        { key: 'addrPermPostcode', label: t('employees.addressInquiry.col.permPostcode') },
        { key: 'addrPermPrimary', label: t('employees.addressInquiry.col.permPrimary') },
        { key: 'addrPermStreet', label: t('employees.addressInquiry.col.permStreet') },
        { key: 'addrPermRegion', label: t('employees.addressInquiry.col.permRegion') },
        { key: 'addrPermNationality', label: t('employees.addressInquiry.col.permNationality') },
        { key: 'addrPermZone', label: t('employees.addressInquiry.col.permZone') },
        { key: 'addrPermTelephone', label: t('employees.addressInquiry.col.permTelephone') },
        { key: 'addrCurrPostcode', label: t('employees.addressInquiry.col.currPostcode') },
        { key: 'addrCurrPrimary', label: t('employees.addressInquiry.col.currPrimary') },
        { key: 'addrCurrStreet', label: t('employees.addressInquiry.col.currStreet') },
        { key: 'addrCurrRegion', label: t('employees.addressInquiry.col.currRegion') },
        { key: 'addrCurrNationality', label: t('employees.addressInquiry.col.currNationality') },
        { key: 'addrCurrZone', label: t('employees.addressInquiry.col.currZone') },
        { key: 'addrCurrTelephone', label: t('employees.addressInquiry.col.currTelephone') },
        { key: 'department', label: t('employees.field.department') },
        { key: 'position', label: t('employees.field.position') },
        { key: 'status', label: t('employees.field.status') },
      ];
    }
    if (variant === 'language') {
      return [
        { key: 'company', label: t('employees.field.company') },
        { key: 'photo', label: t('employees.hrMaster.photoColumn') },
        { key: 'employeeNumber', label: t('employees.field.employeeNumber') },
        { key: 'name', label: t('employees.field.name') },
        { key: 'langLanguage', label: t('employees.language.col.language') },
        { key: 'langTestType', label: t('employees.language.col.testType') },
        { key: 'langAcquisitionDate', label: t('employees.language.col.acquisitionDate') },
        { key: 'langScore', label: t('employees.language.col.score') },
        { key: 'langGrade', label: t('employees.language.col.grade') },
        { key: 'langExpiryDate', label: t('employees.language.col.expiryDate') },
        { key: 'department', label: t('employees.field.department') },
        { key: 'position', label: t('employees.field.position') },
        { key: 'status', label: t('employees.field.status') },
      ];
    }
    return [
      { key: 'company', label: t('employees.field.company') },
      { key: 'photo', label: t('employees.hrMaster.photoColumn') },
      { key: 'employeeNumber', label: t('employees.field.employeeNumber') },
      { key: 'swipeCard', label: t('employees.general.swipeCard') },
      { key: 'name', label: t('employees.field.name') },
      { key: 'nameThTitle', label: t('employees.general.titlePrefix') },
      { key: 'nameThFirst', label: t('employees.general.firstNameLocal') },
      { key: 'nameThLast', label: t('employees.general.lastNameLocal') },
      { key: 'nameEnTitle', label: t('employees.general.titleEnglish') },
      { key: 'nameEnFirst', label: t('employees.general.firstNameEn') },
      { key: 'nameEnLast', label: t('employees.general.lastNameEn') },
      { key: 'status', label: t('employees.field.status') },
      { key: 'hireDate', label: t('employees.field.hireDate') },
      { key: 'terminationDate', label: t('employees.general.terminationDate') },
      { key: 'probationEnd', label: t('employees.general.passDate') },
      { key: 'department', label: t('employees.field.department') },
      { key: 'position', label: t('employees.field.position') },
      { key: 'division', label: t('employees.general.division') },
      { key: 'jobLevel', label: t('employees.general.level') },
      { key: 'workPlace', label: t('employees.general.workplace') },
      { key: 'area', label: t('employees.general.area') },
      { key: 'workStatus', label: t('employees.general.workStatus') },
      { key: 'employmentType', label: t('employees.general.empType') },
      { key: 'salaryProcessType', label: t('employees.general.processSalaryType') },
      { key: 'employeeLevel', label: t('employees.general.empLevel') },
      { key: 'jgLevel', label: t('employees.general.jgLevel') },
      { key: 'fundNumber', label: t('employees.general.fundNumber') },
      { key: 'birthDate', label: t('employees.general.birthDate') },
      { key: 'gender', label: t('employees.general.sex') },
      { key: 'maritalStatus', label: t('employees.general.maritalStatus') },
      { key: 'nationalId', label: t('employees.general.idCard') },
      { key: 'idCardExpire', label: t('employees.general.idExpire') },
      { key: 'taxId', label: t('employees.general.taxId') },
      { key: 'ssoNumber', label: t('employees.general.ssoNumber') },
      { key: 'ssoHospital', label: t('employees.general.ssoHospital') },
      { key: 'email', label: t('employees.field.email') },
      { key: 'phone', label: t('employees.field.phone') },
      { key: 'nickname', label: t('employees.personal.field.nickname', '별명') },
      { key: 'placeOfBirth', label: t('employees.personal.field.placeOfBirth') },
      { key: 'race', label: t('employees.personal.field.race') },
      { key: 'nationality', label: t('employees.personal.field.nationality') },
      { key: 'religion', label: t('employees.personal.field.religion') },
      { key: 'heightCm', label: '키(cm)' },
      { key: 'weightKg', label: '체중(kg)' },
      { key: 'bloodGroup', label: t('employees.personal.field.bloodGroup') },
      { key: 'personalTel', label: t('employees.personal.field.tel') },
      { key: 'personalEmail', label: t('employees.personal.field.email') },
      { key: 'website', label: t('employees.personal.field.website') },
      { key: 'military', label: t('employees.personal.field.military') },
      { key: 'hobby', label: t('employees.personal.field.hobby') },
      { key: 'sports', label: t('employees.personal.field.sports') },
      { key: 'typing', label: t('employees.personal.field.typing') },
      { key: 'drivingLicense', label: t('employees.personal.field.drivingLicense') },
      { key: 'ownCar', label: t('employees.personal.field.ownCar') },
      { key: 'motorcycleLicense', label: t('employees.personal.field.motorcycleLicense') },
      { key: 'ownMotorcycle', label: t('employees.personal.field.ownMotorcycle') },
    ];
  }, [t, variant]);

  const preparedFilteredRows = useMemo((): PreparedInquiryRow[] => {
    return filteredRows.map((row) => {
      const cells = {} as Record<ColumnKey, string>;
      for (const col of columns) {
        cells[col.key] = getCellValue(row, col.key);
      }
      return { row, cells };
    });
  }, [filteredRows, columns, getCellValue]);

  const uniqueValuesByKey = useMemo(() => {
    const byKey = {} as Record<ColumnKey, string[]>;
    for (const col of columns) {
      const uniq = new Set<string>();
      for (const { cells } of preparedFilteredRows) uniq.add(cells[col.key]);
      byKey[col.key] = Array.from(uniq).sort();
    }
    return byKey;
  }, [columns, preparedFilteredRows]);

  const valueCountsByKey = useMemo(() => {
    const byKey = {} as Record<ColumnKey, Record<string, number>>;
    for (const col of columns) {
      byKey[col.key] = {};
    }
    for (const { cells } of preparedFilteredRows) {
      for (const col of columns) {
        const v = cells[col.key];
        const m = byKey[col.key];
        m[v] = (m[v] ?? 0) + 1;
      }
    }
    return byKey;
  }, [columns, preparedFilteredRows]);

  const columnFilteredPrepared = useMemo(
    () =>
      preparedFilteredRows.filter(({ cells }) =>
        columns.every((col) => {
          const selected = columnFilters[col.key] ?? [];
          if (selected.length === 0) return true;
          return selected.includes(cells[col.key]);
        })
      ),
    [preparedFilteredRows, columns, columnFilters]
  );

  const total = columnFilteredPrepared.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedPrepared = useMemo(
    () => columnFilteredPrepared.slice(startIndex, startIndex + pageSize),
    [columnFilteredPrepared, startIndex, pageSize]
  );
  const startItem = total === 0 ? 0 : startIndex + 1;
  const endItem = total === 0 ? 0 : Math.min(startIndex + pageSize, total);

  useEffect(() => {
    setPage((p) => {
      const nextTotalPages = Math.max(1, Math.ceil(total / pageSize));
      return Math.min(p, nextTotalPages);
    });
  }, [total, pageSize]);

  useEffect(() => {
    if (!openFilterKey) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(target)) {
        setOpenFilterKey(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [openFilterKey]);

  const columnFilterLabels = useMemo(
    () => ({
      title: t('appList.filter.title'),
      reset: t('common.reset'),
      noValues: t('appList.filter.noValues'),
      noMatchingValues: t('appList.filter.noMatchingValues'),
      valueSearchPlaceholder: t('appList.filter.valueSearchPlaceholder'),
      selectAll: t('appList.table.selectAll'),
      deselectAll: t('appList.filter.deselectAll'),
      emptyValue: t('common.emptyValue'),
      selectedCountTemplate: t('appList.filter.selectedCount'),
    }),
    [t]
  );

  if (loading || permLoading) return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
  if (!allowRead) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-10 text-center text-sm text-amber-950" role="alert">
        {t('permission.noAccess')}
      </div>
    );
  }

  const reloadList = async () => {
    setLoading(true);
    try {
      const empList = await fetchEmployees(selectedCompanyId);
      setEmployees(empList);
      startTransition(() => {
        const extMap: Record<number, MasterExtFields> = {};
        for (const emp of empList) {
          const loaded = loadMasterExt(emp.id);
          extMap[emp.id] = emp.photo_path?.trim()
            ? { ...loaded, photo_data_url: getEmployeePhotoThumbnailUrl(emp.id) }
            : loaded;
        }
        setMasterExtByEmployeeId(extMap);
      });
      if (variant === 'education') {
        setPersonalByEmployeeId({});
        setCareersByEmployeeId({});
        setCertificationsByEmployeeId({});
        setFamiliesByEmployeeId({});
        setLanguagesByEmployeeId({});
        setAddressByEmployeeId({});
        const eduMap = await fetchEducationsBulkMap(selectedCompanyId);
        setEducationsByEmployeeId(eduMap);
      } else if (variant === 'career') {
        setPersonalByEmployeeId({});
        setEducationsByEmployeeId({});
        setCertificationsByEmployeeId({});
        setFamiliesByEmployeeId({});
        setLanguagesByEmployeeId({});
        setAddressByEmployeeId({});
        const carMap = await fetchCareersBulkMap(selectedCompanyId);
        setCareersByEmployeeId(carMap);
      } else if (variant === 'certification') {
        setPersonalByEmployeeId({});
        setEducationsByEmployeeId({});
        setCareersByEmployeeId({});
        setFamiliesByEmployeeId({});
        setLanguagesByEmployeeId({});
        setAddressByEmployeeId({});
        const certMap = await fetchCertificationsBulkMap(selectedCompanyId);
        setCertificationsByEmployeeId(certMap);
      } else if (variant === 'family') {
        setPersonalByEmployeeId({});
        setEducationsByEmployeeId({});
        setCareersByEmployeeId({});
        setCertificationsByEmployeeId({});
        setLanguagesByEmployeeId({});
        setAddressByEmployeeId({});
        const famMap = await fetchFamiliesBulkMap(selectedCompanyId);
        setFamiliesByEmployeeId(famMap);
      } else if (variant === 'address') {
        setPersonalByEmployeeId({});
        setEducationsByEmployeeId({});
        setCareersByEmployeeId({});
        setCertificationsByEmployeeId({});
        setFamiliesByEmployeeId({});
        setLanguagesByEmployeeId({});
        const addrMap = await fetchAddressesBulkMap(selectedCompanyId);
        setAddressByEmployeeId(addrMap);
      } else if (variant === 'language') {
        setPersonalByEmployeeId({});
        setEducationsByEmployeeId({});
        setCareersByEmployeeId({});
        setCertificationsByEmployeeId({});
        setFamiliesByEmployeeId({});
        setAddressByEmployeeId({});
        const langMap = await fetchLanguagesBulkMap(selectedCompanyId);
        setLanguagesByEmployeeId(langMap);
      } else {
        setEducationsByEmployeeId({});
        setCareersByEmployeeId({});
        setCertificationsByEmployeeId({});
        setFamiliesByEmployeeId({});
        setLanguagesByEmployeeId({});
        setAddressByEmployeeId({});
        const nextMap = await fetchPersonalBulkMap(empList, selectedCompanyId);
        setPersonalByEmployeeId(nextMap);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
      <div className="p-4 border-b border-gray-200 space-y-2">
        <p className="text-[11px] text-gray-500">{t('employees.hrMaster.photoHint')}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-1">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">{t('appList.filter.title')}</span>
          </div>
          <select
          className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
          value={selectedCompanyId ?? ''}
          onChange={async (e) => {
            const nextId = e.target.value ? Number(e.target.value) : null;
            setSelectedCompanyId(nextId);
            setPage(1);
            if (nextId != null) {
              await fetchOrgRefs([nextId]);
            } else {
              await fetchOrgRefs(companyOptions.map((c) => c.id));
            }
            setColumnFilters(emptyColumnFilters());
          }}
        >
          <option value="">{t('employees.companyFilter.all')}</option>
          {companyOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {companyLabelById.get(c.id) ?? c.company_code}
            </option>
          ))}
        </select>
        <select
          className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(
              e.target.value === 'active' ? 'active' : e.target.value === 'terminated' ? 'terminated' : 'all'
            );
            setPage(1);
          }}
        >
          <option value="all">{t('employees.filter.status.all')}</option>
          <option value="active">{t('employees.status.active')}</option>
          <option value="terminated">{t('employees.status.terminated')}</option>
        </select>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder={t('employees.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
          />
        </div>
        <button
          type="button"
          onClick={() => void reloadList()}
          className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
        >
          {t('appList.filter.refresh')}
        </button>
        <button
          type="button"
          disabled={excelExporting || columnFilteredPrepared.length === 0}
          onClick={() => {
            void (async () => {
              if (columnFilteredPrepared.length === 0) return;
              setExcelExporting(true);
              try {
                const { downloadHrMasterInquiryExcel } = await import('@/lib/hrMasterInquiryExcelExport');
                await downloadHrMasterInquiryExcel({
                  filename:
                    variant === 'education'
                      ? `education-inquiry-${new Date().toISOString().slice(0, 10)}.xlsx`
                      : variant === 'career'
                        ? `career-inquiry-${new Date().toISOString().slice(0, 10)}.xlsx`
                        : variant === 'certification'
                          ? `certification-inquiry-${new Date().toISOString().slice(0, 10)}.xlsx`
                          : variant === 'family'
                            ? `family-inquiry-${new Date().toISOString().slice(0, 10)}.xlsx`
                          : variant === 'address'
                            ? `address-inquiry-${new Date().toISOString().slice(0, 10)}.xlsx`
                            : variant === 'language'
                              ? `language-inquiry-${new Date().toISOString().slice(0, 10)}.xlsx`
                              : `hr-master-inquiry-${new Date().toISOString().slice(0, 10)}.xlsx`,
                  noColumnLabel: t('appList.table.no'),
                  columns: columns.map((c) => ({ key: c.key, label: c.label })),
                  rows: columnFilteredPrepared.map(({ row, cells }) => ({
                    employeeId: row.employee.id,
                    photoPath: row.employee.photo_path,
                    cells: cells as Record<string, string>,
                  })),
                });
              } catch {
                alert(t('employees.hrMaster.excelExportError'));
              } finally {
                setExcelExporting(false);
              }
            })();
          }}
          className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {excelExporting ? t('employees.hrMaster.excelExporting') : t('employees.hrMaster.excelDownload')}
        </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          <span className="text-sm text-gray-600">
            {t('appList.pagination.summary')
              .replace('{total}', String(total))
              .replace('{start}', String(startItem))
              .replace('{end}', String(endItem))}
          </span>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            {t('appList.pagination.perPage')}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {t('appList.pagination.countUnit').replace('{count}', String(n))}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.prev')}
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-600">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
        </div>
      </div>

      <div className="overflow-auto max-h-[calc(100vh-13rem)] relative">
        <table
          className={`${
            variant === 'education' ||
            variant === 'career' ||
            variant === 'certification' ||
            variant === 'family' ||
            variant === 'address' ||
            variant === 'language'
              ? 'min-w-[1200px]'
              : 'min-w-[1800px]'
          } w-full divide-y divide-gray-200`}
        >
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-b border-gray-200">
                {t('appList.table.no')}
              </th>
              {columns.map((col) => {
                const selected = columnFilters[col.key] ?? [];
                const hasFilter = selected.length > 0;
                const options = uniqueValuesByKey[col.key] ?? [];
                const valueCounts = valueCountsByKey[col.key] ?? {};
                return (
                  <th
                    key={col.key}
                    className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-b border-gray-200"
                  >
                    <div className="flex items-center gap-1">
                      <span>{col.label}</span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenFilterKey((k) => (k === col.key ? null : col.key))}
                          className={`p-0.5 rounded hover:bg-gray-200 ${hasFilter ? 'text-blue-600' : 'text-gray-400'}`}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        {openFilterKey === col.key && (
                          <div ref={filterPopoverRef} className="absolute left-0 top-full mt-1 z-20">
                            <ColumnFilterPopover
                              options={options}
                              selected={selected}
                              valueCounts={valueCounts}
                              numberLocale={numberLocale}
                              labels={columnFilterLabels}
                              onReset={() => setColumnFilters((prev) => ({ ...prev, [col.key]: [] }))}
                              onSelectionChange={(next) =>
                                setColumnFilters((prev) => ({ ...prev, [col.key]: next }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedPrepared.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-sm text-gray-500 text-center"
                  colSpan={columns.length + 1}
                >
                  {variant === 'family' ? t('employees.familyInquiry.empty') : t('employees.selectHint')}
                </td>
              </tr>
            ) : (
              pagedPrepared.map(({ row, cells }, index) => {
                const extRow = masterExtByEmployeeId[row.employee.id];
                const photoUrl =
                  row.employee.photo_path?.trim()
                    ? getEmployeePhotoThumbnailUrl(row.employee.id)
                    : extRow?.photo_data_url?.trim() || '';
                const openDetailModal = () => {
                  if (!Number.isInteger(row.employee.id) || row.employee.id <= 0) return;
                  setDetailEmployee({
                    id: row.employee.id,
                    name: row.employee.name,
                    employee_number: row.employee.employee_number,
                    ...(variant === 'education' ||
                    variant === 'career' ||
                    variant === 'certification' ||
                    variant === 'family' ||
                    variant === 'address' ||
                    variant === 'language'
                      ? {
                          company_id: row.employee.company_id ?? null,
                          company_label:
                            row.employee.company_id != null
                              ? companyLabelById.get(row.employee.company_id) ?? null
                              : null,
                        }
                      : {}),
                  });
                };
                return (
                  <tr
                    key={row.employee.id}
                    className="border-b border-gray-100 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <td className="px-2 py-2 whitespace-nowrap">{total - startIndex - index}</td>
                    {columns.map((col) => (
                      <td
                        key={`${row.employee.id}-${col.key}`}
                        className={`px-2 py-2 align-middle ${
                          (variant === 'education' && String(col.key).startsWith('edu')) ||
                          (variant === 'career' && String(col.key).startsWith('car')) ||
                          (variant === 'certification' && String(col.key).startsWith('cert')) ||
                          (variant === 'family' && String(col.key).startsWith('fam')) ||
                          (variant === 'address' && String(col.key).startsWith('addr')) ||
                          (variant === 'language' && String(col.key).startsWith('lang'))
                            ? 'whitespace-normal max-w-[18rem] align-top'
                            : 'whitespace-nowrap'
                        }`}
                      >
                        {col.key === 'photo' ? (
                          photoUrl ? (
                            <img
                              src={photoUrl}
                              alt=""
                              className="h-10 w-10 object-cover rounded border border-gray-200 bg-gray-50"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-gray-400">—</span>
                          )
                        ) : (
                          col.key === 'employeeNumber' || col.key === 'name' ? (
                            <button
                              type="button"
                              onClick={openDetailModal}
                              className="text-left text-blue-700 hover:text-blue-900 hover:underline"
                            >
                              {cells[col.key]}
                            </button>
                          ) : (
                            cells[col.key]
                          )
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-2 whitespace-nowrap align-middle">
                      <button
                        type="button"
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        onClick={openDetailModal}
                      >
                        {t('employees.inquiry.detailOpen')}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </div>
      {variant === 'education' ||
      variant === 'career' ||
      variant === 'certification' ||
      variant === 'family' ||
      variant === 'address' ||
      variant === 'language' ? (
        <EducationInquiryDetailModal
          open={detailEmployee != null}
          onClose={() => setDetailEmployee(null)}
          employee={detailEmployee}
        />
      ) : (
        <HrMasterInquiryDetailModal
          open={detailEmployee != null}
          onClose={() => setDetailEmployee(null)}
          employee={detailEmployee}
        />
      )}
    </div>
  );
}
