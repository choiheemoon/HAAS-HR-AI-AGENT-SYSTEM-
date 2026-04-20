'use client';

import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient, getEmployeePhotoImageUrl } from '@/lib/api';
import { Search, User, Filter, X } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import HrMasterToolbar, { type MasterUiMode } from '@/components/employees/HrMasterToolbar';
import EmployeeGeneralForm, { type GeneralCoreDraft } from '@/components/employees/EmployeeGeneralForm';
import EmployeeEducationPanel from '@/components/employees/EmployeeEducationPanel';
import MinorCodeSearchCrudModal, { type MinorOption } from '@/components/employees/MinorCodeSearchCrudModal';
import {
  emptyMasterExt,
  loadMasterExt,
  saveMasterExt,
} from '@/lib/employeeMasterExtension';

interface Employee {
  id: number;
  company_id?: number | null;
  employee_number: string;
  name: string;
  email: string;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  job_level?: string | null;
  employment_type?: string | null;
  salary_process_type?: string | null;
  division?: string | null;
  work_place?: string | null;
  area?: string | null;
  work_status?: string | null;
  employee_level?: string | null;
  name_en?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  address?: string | null;
  tax_id?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  termination_date?: string | null;
  currency?: string | null;
  status: string;
  hire_date: string;
  base_salary?: number | null;
  education_activity_study?: string | null;
  education_certificate?: string | null;
  photo_path?: string | null;
  swipe_card?: string | null;
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

interface FamilyRow {
  id?: number;
  rowKey: string;
  name: string;
  relation: string;
  resident_number: string;
  domestic_foreign: string;
  highest_education: string;
  occupation: string;
  workplace: string;
  position: string;
  support_reason: string;
}

interface CareerRow {
  id?: number;
  rowKey: string;
  position_title: string;
  work_details: string;
  enter_date: string;
  resigned_date: string;
  company_name: string;
  address: string;
  telephone: string;
  begin_salary: string;
  resignation_reason: string;
  latest_salary: string;
  tenure_text: string;
}

interface CertificationRow {
  id?: number;
  rowKey: string;
  license_type_minor_code_id?: number | null;
  license_code: string;
  license_type_name: string;
  grade: string;
  issuer_minor_code_id?: number | null;
  issuer_code: string;
  issuer_name: string;
  acquired_date: string;
  effective_date: string;
  next_renewal_date: string;
  certificate_number: string;
}

interface LanguageRow {
  id?: number;
  rowKey: string;
  acquisition_date: string;
  language_code: string;
  test_type: string;
  score: string;
  grade: string;
  expiry_date: string;
}

/** 개인정보 탭 (직원당 1건, Language 제외) */
interface PersonalDraft {
  nickname: string;
  place_of_birth: string;
  height_cm: string;
  weight_kg: string;
  race: string;
  nationality: string;
  religion: string;
  blood_group: string;
  personal_tel: string;
  personal_email: string;
  website: string;
  military_status: string;
  personal_notes: string;
  hobby: string;
  sports: string;
  typing_thai_wpm: string;
  typing_english_wpm: string;
  has_driving_license: boolean;
  driving_license_number: string;
  own_car: boolean;
  has_motorcycle_license: boolean;
  motorcycle_license_number: string;
  own_motorcycle: boolean;
}

interface ForeignerDraft {
  is_foreigner: boolean;
  passport_number: string;
  passport_issue_place: string;
  passport_issue_date: string;
  passport_expire_date: string;
  passport_note: string;
  visa_number: string;
  visa_issue_place: string;
  visa_issue_date: string;
  visa_expire_date: string;
  visa_note: string;
  work_permit_number: string;
  work_permit_issue_place: string;
  work_permit_issue_date: string;
  work_permit_expire_date: string;
  work_permit_note: string;
}

const BLOOD_GROUP_OPTIONS = ['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Other'] as const;

const MILITARY_CODES = ['', 'completed', 'exempt', 'not_applicable', 'in_service', 'other'] as const;

function emptyPersonalDraft(): PersonalDraft {
  return {
    nickname: '',
    place_of_birth: '',
    height_cm: '',
    weight_kg: '',
    race: '',
    nationality: '',
    religion: '',
    blood_group: '',
    personal_tel: '',
    personal_email: '',
    website: '',
    military_status: '',
    personal_notes: '',
    hobby: '',
    sports: '',
    typing_thai_wpm: '',
    typing_english_wpm: '',
    has_driving_license: false,
    driving_license_number: '',
    own_car: false,
    has_motorcycle_license: false,
    motorcycle_license_number: '',
    own_motorcycle: false,
  };
}

function personalFromApi(p: Record<string, unknown>): PersonalDraft {
  const numStr = (v: unknown) =>
    v == null || v === '' ? '' : String(typeof v === 'number' ? v : Number(v) || '');
  return {
    nickname: String(p.nickname ?? ''),
    place_of_birth: String(p.place_of_birth ?? ''),
    height_cm: numStr(p.height_cm),
    weight_kg: numStr(p.weight_kg),
    race: String(p.race ?? ''),
    nationality: String(p.nationality ?? ''),
    religion: String(p.religion ?? ''),
    blood_group: String(p.blood_group ?? ''),
    personal_tel: String(p.personal_tel ?? ''),
    personal_email: String(p.personal_email ?? ''),
    website: String(p.website ?? ''),
    military_status: String(p.military_status ?? ''),
    personal_notes: String(p.personal_notes ?? ''),
    hobby: String(p.hobby ?? ''),
    sports: String(p.sports ?? ''),
    typing_thai_wpm: numStr(p.typing_thai_wpm),
    typing_english_wpm: numStr(p.typing_english_wpm),
    has_driving_license: Boolean(p.has_driving_license),
    driving_license_number: String(p.driving_license_number ?? ''),
    own_car: Boolean(p.own_car),
    has_motorcycle_license: Boolean(p.has_motorcycle_license),
    motorcycle_license_number: String(p.motorcycle_license_number ?? ''),
    own_motorcycle: Boolean(p.own_motorcycle),
  };
}

function parseIntField(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function personalDraftToApi(d: PersonalDraft): Record<string, unknown> {
  return {
    nickname: d.nickname.trim() || null,
    place_of_birth: d.place_of_birth.trim() || null,
    height_cm: parseIntField(d.height_cm),
    weight_kg: parseIntField(d.weight_kg),
    race: d.race.trim() || null,
    nationality: d.nationality.trim() || null,
    religion: d.religion.trim() || null,
    blood_group: d.blood_group.trim() || null,
    personal_tel: d.personal_tel.trim() || null,
    personal_email: d.personal_email.trim() || null,
    website: d.website.trim() || null,
    military_status: d.military_status.trim() || null,
    personal_notes: d.personal_notes.trim() || null,
    hobby: d.hobby.trim() || null,
    sports: d.sports.trim() || null,
    typing_thai_wpm: parseIntField(d.typing_thai_wpm),
    typing_english_wpm: parseIntField(d.typing_english_wpm),
    has_driving_license: d.has_driving_license,
    driving_license_number: d.driving_license_number.trim() || null,
    own_car: d.own_car,
    has_motorcycle_license: d.has_motorcycle_license,
    motorcycle_license_number: d.motorcycle_license_number.trim() || null,
    own_motorcycle: d.own_motorcycle,
  };
}

function emptyForeignerDraft(): ForeignerDraft {
  return {
    is_foreigner: false,
    passport_number: '',
    passport_issue_place: '',
    passport_issue_date: '',
    passport_expire_date: '',
    passport_note: '',
    visa_number: '',
    visa_issue_place: '',
    visa_issue_date: '',
    visa_expire_date: '',
    visa_note: '',
    work_permit_number: '',
    work_permit_issue_place: '',
    work_permit_issue_date: '',
    work_permit_expire_date: '',
    work_permit_note: '',
  };
}

function foreignerFromApi(p: Record<string, unknown>): ForeignerDraft {
  return {
    is_foreigner: Boolean(p.is_foreigner),
    passport_number: String(p.passport_number ?? ''),
    passport_issue_place: String(p.passport_issue_place ?? ''),
    passport_issue_date: isoSlice(String(p.passport_issue_date ?? '')),
    passport_expire_date: isoSlice(String(p.passport_expire_date ?? '')),
    passport_note: String(p.passport_note ?? ''),
    visa_number: String(p.visa_number ?? ''),
    visa_issue_place: String(p.visa_issue_place ?? ''),
    visa_issue_date: isoSlice(String(p.visa_issue_date ?? '')),
    visa_expire_date: isoSlice(String(p.visa_expire_date ?? '')),
    visa_note: String(p.visa_note ?? ''),
    work_permit_number: String(p.work_permit_number ?? ''),
    work_permit_issue_place: String(p.work_permit_issue_place ?? ''),
    work_permit_issue_date: isoSlice(String(p.work_permit_issue_date ?? '')),
    work_permit_expire_date: isoSlice(String(p.work_permit_expire_date ?? '')),
    work_permit_note: String(p.work_permit_note ?? ''),
  };
}

function foreignerDraftToApi(d: ForeignerDraft): Record<string, unknown> {
  const dateOrNull = (v: string) => {
    const s = v.trim();
    return s ? s : null;
  };
  return {
    is_foreigner: d.is_foreigner,
    passport_number: d.passport_number.trim() || null,
    passport_issue_place: d.passport_issue_place.trim() || null,
    passport_issue_date: dateOrNull(d.passport_issue_date),
    passport_expire_date: dateOrNull(d.passport_expire_date),
    passport_note: d.passport_note.trim() || null,
    visa_number: d.visa_number.trim() || null,
    visa_issue_place: d.visa_issue_place.trim() || null,
    visa_issue_date: dateOrNull(d.visa_issue_date),
    visa_expire_date: dateOrNull(d.visa_expire_date),
    visa_note: d.visa_note.trim() || null,
    work_permit_number: d.work_permit_number.trim() || null,
    work_permit_issue_place: d.work_permit_issue_place.trim() || null,
    work_permit_issue_date: dateOrNull(d.work_permit_issue_date),
    work_permit_expire_date: dateOrNull(d.work_permit_expire_date),
    work_permit_note: d.work_permit_note.trim() || null,
  };
}

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

type RefItem = {
  id: number;
  company_id: number;
  category: RefCategory | string;
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};
type EmployeeListFilterKey = 'name' | 'employeeNumber' | 'department' | 'position' | 'status';
type EmployeeListRowView = {
  emp: Employee;
  values: Record<EmployeeListFilterKey, string>;
};

type OrgReferenceOptions = {
  division: RefItem[];
  department: RefItem[];
  level: RefItem[];
  work_place: RefItem[];
  area: RefItem[];
  work_status: RefItem[];
  position: RefItem[];
  employment_type: RefItem[];
  employee_type: RefItem[];
  employee_level: RefItem[];
};

type DepartmentPositionRefByCompany = Record<number, { department: RefItem[]; position: RefItem[] }>;

function emptyOrgReferenceOptions(): OrgReferenceOptions {
  return {
    division: [],
    department: [],
    level: [],
    work_place: [],
    area: [],
    work_status: [],
    position: [],
    employment_type: [],
    employee_type: [],
    employee_level: [],
  };
}

function newRowKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type DetailTab =
  | 'basic'
  | 'education'
  | 'family'
  | 'career'
  | 'personal'
  | 'foreigner'
  | 'certification'
  | 'language'
  | 'address';
type EducationToolbarActions = {
  add: () => Promise<void>;
  del: () => Promise<void>;
  save: () => Promise<void>;
  cancel: () => Promise<void>;
};

function isoSlice(d: string | null | undefined) {
  if (!d) return '';
  return String(d).slice(0, 10);
}

function detailToCore(emp: Employee): GeneralCoreDraft {
  return {
    company_id: emp.company_id != null ? String(emp.company_id) : '',
    employee_number: emp.employee_number ?? '',
    email: emp.email ?? '',
    name: emp.name ?? '',
    phone: emp.phone ?? '',
    department: emp.department ?? '',
    position: emp.position ?? '',
    job_level: emp.job_level ?? '',
    employment_type: emp.employment_type ?? '',
    hire_date: isoSlice(emp.hire_date),
    birth_date: isoSlice(emp.birth_date ?? undefined),
    gender: emp.gender ?? '',
    address: emp.address ?? '',
    tax_id: emp.tax_id ?? '',
    bank_name: emp.bank_name ?? '',
    bank_account: emp.bank_account ?? '',
    base_salary: emp.base_salary != null ? String(emp.base_salary) : '',
    currency: emp.currency ?? 'KRW',
    status: emp.status ?? 'active',
    termination_date: isoSlice(emp.termination_date ?? undefined),
  };
}

function emptyFamilyRow(): FamilyRow {
  return {
    rowKey: newRowKey(),
    name: '',
    relation: '',
    resident_number: '',
    domestic_foreign: 'domestic',
    highest_education: '',
    occupation: '',
    workplace: '',
    position: '',
    support_reason: '',
  };
}

function familyRowToApiPayload(row: FamilyRow) {
  return {
    ...(typeof row.id === 'number' ? { id: row.id } : {}),
    name: row.name || null,
    relation: row.relation || null,
    resident_number: row.resident_number || null,
    domestic_foreign: row.domestic_foreign || null,
    highest_education: row.highest_education || null,
    occupation: row.occupation || null,
    workplace: row.workplace || null,
    position: row.position || null,
    support_reason: row.support_reason || null,
  };
}

function emptyCareerRow(): CareerRow {
  return {
    rowKey: newRowKey(),
    position_title: '',
    work_details: '',
    enter_date: '',
    resigned_date: '',
    company_name: '',
    address: '',
    telephone: '',
    begin_salary: '',
    resignation_reason: '',
    latest_salary: '',
    tenure_text: '',
  };
}

function careerRowToApiPayload(row: CareerRow) {
  return {
    ...(typeof row.id === 'number' ? { id: row.id } : {}),
    position_title: row.position_title || null,
    work_details: row.work_details || null,
    enter_date: row.enter_date?.trim() || null,
    resigned_date: row.resigned_date?.trim() || null,
    company_name: row.company_name || null,
    address: row.address || null,
    telephone: row.telephone || null,
    begin_salary: row.begin_salary || null,
    resignation_reason: row.resignation_reason || null,
    latest_salary: row.latest_salary || null,
    tenure_text: row.tenure_text || null,
  };
}

function emptyCertificationRow(): CertificationRow {
  return {
    rowKey: newRowKey(),
    license_type_minor_code_id: null,
    license_code: '',
    license_type_name: '',
    grade: '',
    issuer_minor_code_id: null,
    issuer_code: '',
    issuer_name: '',
    acquired_date: '',
    effective_date: '',
    next_renewal_date: '',
    certificate_number: '',
  };
}

function certificationRowToApiPayload(row: CertificationRow) {
  return {
    ...(typeof row.id === 'number' ? { id: row.id } : {}),
    license_type_minor_code_id:
      typeof row.license_type_minor_code_id === 'number' ? row.license_type_minor_code_id : null,
    license_code: row.license_code.trim() || null,
    license_type_name: row.license_type_name.trim() || null,
    grade: row.grade.trim() || null,
    issuer_minor_code_id: typeof row.issuer_minor_code_id === 'number' ? row.issuer_minor_code_id : null,
    issuer_code: row.issuer_code.trim() || null,
    issuer_name: row.issuer_name.trim() || null,
    acquired_date: row.acquired_date?.trim() || null,
    effective_date: row.effective_date?.trim() || null,
    next_renewal_date: row.next_renewal_date?.trim() || null,
    certificate_number: row.certificate_number.trim() || null,
  };
}

const LANGUAGE_OPTION_CODES = [
  '',
  'english',
  'japanese',
  'chinese',
  'french',
  'german',
  'spanish',
  'thai',
  'vietnamese',
  'russian',
  'other',
] as const;

const LANGUAGE_TEST_CODES = [
  '',
  'toeic',
  'toefl',
  'ielts',
  'jlpt',
  'hsk',
  'topik',
  'teps',
  'opic',
  'gtec',
  'gre',
  'other',
] as const;

const LANGUAGE_GRADE_CODES = ['', 's', 'a', 'b', 'c', 'd', 'pass', 'n1', 'n2', 'n3', 'n4', 'n5', 'other'] as const;

function emptyLanguageRow(): LanguageRow {
  return {
    rowKey: newRowKey(),
    acquisition_date: '',
    language_code: '',
    test_type: '',
    score: '0',
    grade: '',
    expiry_date: '',
  };
}

function languageRowToApiPayload(row: LanguageRow) {
  return {
    ...(typeof row.id === 'number' ? { id: row.id } : {}),
    acquisition_date: row.acquisition_date?.trim() || null,
    language_code: row.language_code.trim() || null,
    test_type: row.test_type.trim() || null,
    score: parseIntField(row.score),
    grade: row.grade.trim() || null,
    expiry_date: row.expiry_date?.trim() || null,
  };
}

const ADDRESS_PAIR_KEYS = [
  'house_no_th',
  'house_no_en',
  'building_th',
  'building_en',
  'soi_th',
  'soi_en',
  'street_th',
  'street_en',
  'nationality',
  'zone',
  'province',
  'district',
  'sub_district',
  'postcode',
  'telephone',
] as const;

type AddressPairSuffix = (typeof ADDRESS_PAIR_KEYS)[number];
type AddressDraftKey = `perm_${AddressPairSuffix}` | `curr_${AddressPairSuffix}`;
type AddressDraft = Record<AddressDraftKey, string>;

const ADDRESS_LOOKUP_SUFFIXES = new Set<AddressPairSuffix>([
  'nationality',
  'zone',
  'province',
  'district',
  'sub_district',
  'postcode',
]);

function emptyAddressDraft(): AddressDraft {
  const o = {} as AddressDraft;
  for (const s of ADDRESS_PAIR_KEYS) {
    o[`perm_${s}`] = '';
    o[`curr_${s}`] = '';
  }
  return o;
}

function addressFromApi(p: Record<string, unknown>): AddressDraft {
  const d = emptyAddressDraft();
  for (const s of ADDRESS_PAIR_KEYS) {
    d[`perm_${s}`] = String(p[`perm_${s}`] ?? '');
    d[`curr_${s}`] = String(p[`curr_${s}`] ?? '');
  }
  return d;
}

function addressDraftToApi(d: AddressDraft): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const s of ADDRESS_PAIR_KEYS) {
    o[`perm_${s}`] = d[`perm_${s}`].trim() || null;
    o[`curr_${s}`] = d[`curr_${s}`].trim() || null;
  }
  return o;
}

function copyPermanentToCurrentAddress(d: AddressDraft): AddressDraft {
  const next = { ...d };
  for (const s of ADDRESS_PAIR_KEYS) {
    next[`curr_${s}`] = d[`perm_${s}`];
  }
  return next;
}

/** YYYY-MM-DD → 달력 검증(로컬) */
function parseISODatePartsLocal(iso: string): { y: number; m: number; d: number } | null {
  const t = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

/**
 * 입사일~퇴사일(없으면 오늘) 근속 년·월 문자열. 퇴사가 입사보다 이르면 빈 문자열.
 */
function formatCareerTenureFromDates(
  enterIso: string,
  resignIso: string,
  formatParts: (years: number, months: number) => string
): string {
  const start = parseISODatePartsLocal(enterIso);
  if (!start) return '';
  const startDate = new Date(start.y, start.m - 1, start.d, 12, 0, 0, 0);
  let endDate: Date;
  if (resignIso.trim()) {
    const end = parseISODatePartsLocal(resignIso);
    if (!end) return '';
    endDate = new Date(end.y, end.m - 1, end.d, 12, 0, 0, 0);
  } else {
    endDate = new Date();
    endDate.setHours(12, 0, 0, 0);
  }
  if (endDate < startDate) return '';
  const sy = startDate.getFullYear();
  const sm = startDate.getMonth();
  const sd = startDate.getDate();
  const ey = endDate.getFullYear();
  const em = endDate.getMonth();
  const ed = endDate.getDate();
  let totalMonths = (ey - sy) * 12 + (em - sm);
  if (ed < sd) totalMonths -= 1;
  if (totalMonths < 0) return '';
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return formatParts(years, months);
}

function formatCareerTenurePartsI18n(years: number, months: number, t: (key: string) => string): string {
  if (years <= 0 && months <= 0) return '';
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}${t('employees.career.tenureYearUnit')}`);
  if (months > 0) parts.push(`${months}${t('employees.career.tenureMonthUnit')}`);
  return parts.join(' ');
}

function emptyGeneralCore(): GeneralCoreDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    company_id: '',
    employee_number: '',
    email: '',
    name: '',
    phone: '',
    department: '',
    position: '',
    job_level: '',
    employment_type: '',
    hire_date: today,
    birth_date: '',
    gender: '',
    address: '',
    tax_id: '',
    bank_name: '',
    bank_account: '',
    base_salary: '',
    currency: 'KRW',
    status: 'active',
    termination_date: '',
  };
}

function mergeNameEnFromApi(
  name_en: string | null | undefined,
  loaded: ReturnType<typeof emptyMasterExt>
): ReturnType<typeof emptyMasterExt> {
  const x = { ...loaded };
  const hasManual = Boolean(x.name_en_first || x.name_en_last);
  if (!hasManual && name_en) {
    const p = name_en.trim().split(/\s+/);
    if (p.length >= 1) x.name_en_first = p[0];
    if (p.length >= 2) x.name_en_last = p.slice(1).join(' ');
  }
  return x;
}

function buildNameEn(ext: ReturnType<typeof emptyMasterExt>) {
  return [ext.name_en_first, ext.name_en_last].filter(Boolean).join(' ').trim();
}

function parseApiErrorMessage(
  e: any,
  fallback: string,
  localize?: (detail: string) => string
): string {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return localize ? localize(detail) : detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === 'string') return localize ? localize(first) : first;
    if (first?.msg) {
      const path = Array.isArray(first.loc) ? ` (${first.loc.join('.')})` : '';
      const msg = `${String(first.msg)}${path}`;
      return localize ? localize(msg) : msg;
    }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

function toApiUpdatePayload(core: GeneralCoreDraft, ext: ReturnType<typeof emptyMasterExt>) {
  const nameEn = buildNameEn(ext);
  const td = core.termination_date?.trim() ?? '';
  const payload: Record<string, unknown> = {
    company_id: core.company_id ? Number(core.company_id) : undefined,
    name: core.name || undefined,
    phone: core.phone || undefined,
    department: core.department || undefined,
    position: core.position || undefined,
    job_level: core.job_level || undefined,
    employment_type: core.employment_type || undefined,
    salary_process_type: ext.salary_process_type?.trim() || undefined,
    division: ext.division?.trim() || undefined,
    work_place: ext.workplace?.trim() || undefined,
    area: ext.area?.trim() || undefined,
    work_status: ext.work_status?.trim() || undefined,
    employee_level: ext.emp_level?.trim() || undefined,
    swipe_card: ext.swipe_card?.trim() || undefined,
    hire_date: core.hire_date || undefined,
    birth_date: core.birth_date || undefined,
    gender: core.gender || undefined,
    tax_id: core.tax_id || undefined,
    name_en: nameEn || undefined,
    status: core.status,
  };
  if (core.status === 'terminated') {
    payload.termination_date = td || undefined;
  } else if (core.status === 'active') {
    payload.termination_date = null;
  }
  return payload;
}

function EmployeesPageContent() {
  const { t, locale } = useI18n();
  const localizeEmployeeErrorDetail = useCallback(
    (detail: string) => {
      const d = (detail || '').toLowerCase();
      if (
        d.includes('valid email') ||
        d.includes('email address must have an @-sign') ||
        d.includes('value is not a valid email address')
      ) {
        return t('employees.validation.emailFormat');
      }
      return detail;
    },
    [t]
  );
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') || 'employees';
  const menuKey = tabParam === 'hr-master-manage' ? 'hr-master-manage' : 'employees';
  const { can, loading: permLoading } = useMenuPermissions();
  const allowRead = can(menuKey, 'can_read');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const LIST_PAGE_SIZE = 200;
  const [listPage, setListPage] = useState(1);
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState<'active' | 'terminated' | 'all'>(
    'active'
  );
  const [columnFilters, setColumnFilters] = useState<Record<EmployeeListFilterKey, string[]>>({
    name: [],
    employeeNumber: [],
    department: [],
    position: [],
    status: [],
  });
  const [openFilterKey, setOpenFilterKey] = useState<EmployeeListFilterKey | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('basic');
  const [detail, setDetail] = useState<Employee | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uiMode, setUiMode] = useState<MasterUiMode>('browse');
  const [generalCore, setGeneralCore] = useState<GeneralCoreDraft>(() => emptyGeneralCore());
  const [masterExt, setMasterExt] = useState(() => emptyMasterExt());

  const [familyRows, setFamilyRows] = useState<FamilyRow[]>([]);
  const [careerRows, setCareerRows] = useState<CareerRow[]>([]);
  const [personalDraft, setPersonalDraft] = useState<PersonalDraft>(() => emptyPersonalDraft());
  const [personalRecordId, setPersonalRecordId] = useState<number | null>(null);
  const [certificationRows, setCertificationRows] = useState<CertificationRow[]>([]);
  const [certMinorOptionsByField, setCertMinorOptionsByField] = useState<{
    license_type: MinorOption[];
    issuer: MinorOption[];
  }>({ license_type: [], issuer: [] });
  const [certMajorIdByField, setCertMajorIdByField] = useState<{
    license_type: number | null;
    issuer: number | null;
  }>({ license_type: null, issuer: null });
  const [certPickerOpen, setCertPickerOpen] = useState(false);
  const [certPickerField, setCertPickerField] = useState<'license_type' | 'issuer'>('license_type');
  const [certPickerRowKey, setCertPickerRowKey] = useState<string | null>(null);
  type PersonalMinorField = 'nationality' | 'religion';
  const [personalPickerOpen, setPersonalPickerOpen] = useState(false);
  const [personalPickerField, setPersonalPickerField] = useState<PersonalMinorField>('nationality');
  const [personalMajorIdByField, setPersonalMajorIdByField] = useState<Record<PersonalMinorField, number | null>>({
    nationality: null,
    religion: null,
  });
  const [personalMinorOptionsByField, setPersonalMinorOptionsByField] = useState<
    Record<PersonalMinorField, MinorOption[]>
  >({
    nationality: [],
    religion: [],
  });
  const [languageRows, setLanguageRows] = useState<LanguageRow[]>([]);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(() => emptyAddressDraft());
  const [addressRecordId, setAddressRecordId] = useState<number | null>(null);
  const [foreignerDraft, setForeignerDraft] = useState<ForeignerDraft>(() => emptyForeignerDraft());
  const [foreignerRecordId, setForeignerRecordId] = useState<number | null>(null);
  const [resignDialogOpen, setResignDialogOpen] = useState(false);
  const [resignDialogDate, setResignDialogDate] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(searchInput);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // 주소정보(국적/도/시군구/동읍면/우편번호)를 Minor코드로 선택하기 위한 상태
  type AddressMinorField = 'nationality' | 'zone' | 'province' | 'district' | 'sub_district' | 'postcode';
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [addressPickerFullKey, setAddressPickerFullKey] = useState<AddressDraftKey | null>(null);

  const [addrMajorIdByField, setAddrMajorIdByField] = useState<Record<AddressMinorField, number | null>>({
    nationality: null,
    zone: null,
    province: null,
    district: null,
    sub_district: null,
    postcode: null,
  });
  const [addrMinorOptionsByField, setAddrMinorOptionsByField] = useState<
    Record<AddressMinorField, MinorOption[]>
  >({
    nationality: [],
    zone: [],
    province: [],
    district: [],
    sub_district: [],
    postcode: [],
  });

  const addressPickerSuffix = useMemo(() => {
    if (!addressPickerFullKey) return null;
    const suffix = addressPickerFullKey.replace(/^(perm_|curr_)/, '');
    return suffix as AddressMinorField;
  }, [addressPickerFullKey]);

  const handlePickAddressMinor = useCallback(
    (o: MinorOption) => {
      if (!addressPickerFullKey) return;
      setAddressDraft((d) => ({ ...d, [addressPickerFullKey]: o.minor_code }));
    },
    [addressPickerFullKey]
  );

  const handleClearAddressMinor = useCallback(() => {
    if (!addressPickerFullKey) return;
    setAddressDraft((d) => ({ ...d, [addressPickerFullKey]: '' }));
  }, [addressPickerFullKey]);

  const refreshAddressMinorOptions = useCallback(async () => {
    if (!addressPickerSuffix) return;
    const cid = Number(generalCore.company_id);
    const majorId = addrMajorIdByField[addressPickerSuffix];
    if (!Number.isInteger(cid) || cid <= 0 || majorId == null) return;
    try {
      const r = await apiClient.getMinorCodes({ company_id: cid, major_code_id: majorId });
      const list = (r.data as MinorOption[]) ?? [];
      setAddrMinorOptionsByField((prev) => ({ ...prev, [addressPickerSuffix]: list }));
    } catch {
      // no-op
    }
  }, [addressPickerSuffix, generalCore.company_id, addrMajorIdByField]);

  const handlePickPersonalMinor = useCallback(
    (o: MinorOption) => {
      if (personalPickerField === 'nationality') {
        setPersonalDraft((d) => ({ ...d, nationality: o.minor_code }));
      } else {
        setPersonalDraft((d) => ({ ...d, religion: o.minor_code }));
      }
    },
    [personalPickerField]
  );

  const handleClearPersonalMinor = useCallback(() => {
    if (personalPickerField === 'nationality') {
      setPersonalDraft((d) => ({ ...d, nationality: '' }));
    } else {
      setPersonalDraft((d) => ({ ...d, religion: '' }));
    }
  }, [personalPickerField]);

  const refreshPersonalMinorOptions = useCallback(async () => {
    const cid = Number(generalCore.company_id);
    const majorId = personalMajorIdByField[personalPickerField];
    if (!Number.isInteger(cid) || cid <= 0 || majorId == null) return;
    try {
      const r = await apiClient.getMinorCodes({ company_id: cid, major_code_id: majorId });
      const list = (r.data as MinorOption[]) ?? [];
      setPersonalMinorOptionsByField((prev) => ({ ...prev, [personalPickerField]: list }));
    } catch {
      // no-op
    }
  }, [generalCore.company_id, personalMajorIdByField, personalPickerField]);

  const [savingBasic, setSavingBasic] = useState(false);
  const [educationToolbarActions, setEducationToolbarActions] = useState<EducationToolbarActions | null>(null);

  const [companyOptions, setCompanyOptions] = useState<
    Array<{
      id: number;
      company_code: string;
      name_kor?: string | null;
      name_thai?: string | null;
      name_eng?: string | null;
    }>
  >([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [orgReferenceOptions, setOrgReferenceOptions] = useState<OrgReferenceOptions>(() =>
    emptyOrgReferenceOptions()
  );
  const [departmentPositionRefByCompany, setDepartmentPositionRefByCompany] =
    useState<DepartmentPositionRefByCompany>({});

  const companyById = useMemo(() => {
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
    const m = new Map<number, string>();
    for (const c of companyOptions) {
      m.set(c.id, pickCompanyLabel(c));
    }
    return m;
  }, [companyOptions, locale]);

  const fetchEmployees = useCallback(async (companyId?: number | null) => {
    try {
      const response =
        companyId == null ? await apiClient.getEmployees() : await apiClient.getEmployees({ company_id: companyId });
      setEmployees(response.data as Employee[]);
    } catch (error) {
      // Keep UI stable without noisy console output for transient load failures.
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOrgReferenceOptions = useCallback(async (companyId: number | null) => {
    if (companyId == null) {
      setOrgReferenceOptions(emptyOrgReferenceOptions());
      return;
    }
    const categories: RefCategory[] = [
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
    try {
      const results = await Promise.all(
        categories.map((category) => apiClient.getEmployeeReferenceItems(category, companyId))
      );
      const next = emptyOrgReferenceOptions();
      categories.forEach((category, i) => {
        next[category] = Array.isArray(results[i]?.data) ? (results[i]!.data as RefItem[]) : [];
      });
      setOrgReferenceOptions(next);
    } catch (e) {
      setOrgReferenceOptions(emptyOrgReferenceOptions());
    }
  }, []);

  const ensureDepartmentPositionRefs = useCallback(async (companyId: number | null) => {
    if (companyId == null) return;
    if (departmentPositionRefByCompany[companyId]) return;
    try {
      const [deptRes, posRes] = await Promise.all([
        apiClient.getEmployeeReferenceItems('department', companyId),
        apiClient.getEmployeeReferenceItems('position', companyId),
      ]);
      setDepartmentPositionRefByCompany((prev) => ({
        ...prev,
        [companyId]: {
          department: Array.isArray(deptRes.data) ? (deptRes.data as RefItem[]) : [],
          position: Array.isArray(posRes.data) ? (posRes.data as RefItem[]) : [],
        },
      }));
    } catch {
      // Keep existing cache to avoid UI flicker on transient API failures.
    }
  }, [departmentPositionRefByCompany]);

  useEffect(() => {
    if (permLoading) return;
    if (!allowRead) {
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        const res = await apiClient.getMyCompanies();
        const list = res.data as Array<{
          id: number;
          company_code: string;
          name_thai?: string | null;
          name_eng?: string | null;
        }>;
        setCompanyOptions(list);
        setSelectedCompanyId(null);
        await fetchEmployees(null);
      } catch (e) {
        setCompanyOptions([]);
        setSelectedCompanyId(null);
        setEmployees([]);
        setLoading(false);
      }
    })();
  }, [permLoading, allowRead, fetchEmployees]);

  useEffect(() => {
    const companyIdNum = Number(generalCore.company_id);
    if (!Number.isInteger(companyIdNum) || companyIdNum <= 0) {
      setOrgReferenceOptions(emptyOrgReferenceOptions());
      return;
    }
    void fetchOrgReferenceOptions(companyIdNum);
  }, [generalCore.company_id, fetchOrgReferenceOptions]);

  useEffect(() => {
    void ensureDepartmentPositionRefs(selectedCompanyId);
  }, [selectedCompanyId, ensureDepartmentPositionRefs]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await apiClient.getEmployee(id);
      let emp = res.data as Employee;
      const extLoaded = loadMasterExt(id);
      const localSwipe = (extLoaded.swipe_card || '').trim();
      const apiSwipe = (emp.swipe_card != null ? String(emp.swipe_card) : '').trim();
      if (!apiSwipe && localSwipe) {
        try {
          await apiClient.updateEmployee(id, { swipe_card: localSwipe });
          emp = { ...emp, swipe_card: localSwipe };
        } catch {
          /* DB 동기화 실패 시 로컬 확장 필드 값만 유지 */
        }
      }
      setDetail(emp);
      setGeneralCore(detailToCore(emp));
      const mergedExt = mergeNameEnFromApi(emp.name_en ?? undefined, extLoaded);
      if (emp.salary_process_type != null && String(emp.salary_process_type).trim() !== '') {
        mergedExt.salary_process_type = String(emp.salary_process_type).trim();
      }
      if (emp.division != null && String(emp.division).trim() !== '') {
        mergedExt.division = String(emp.division).trim();
      }
      if (emp.work_place != null && String(emp.work_place).trim() !== '') {
        mergedExt.workplace = String(emp.work_place).trim();
      }
      if (emp.area != null && String(emp.area).trim() !== '') {
        mergedExt.area = String(emp.area).trim();
      }
      if (emp.work_status != null && String(emp.work_status).trim() !== '') {
        mergedExt.work_status = String(emp.work_status).trim();
      }
      if (emp.employee_level != null && String(emp.employee_level).trim() !== '') {
        mergedExt.emp_level = String(emp.employee_level).trim();
      }
      if (emp.swipe_card != null && String(emp.swipe_card).trim() !== '') {
        mergedExt.swipe_card = String(emp.swipe_card).trim();
      }
      if (emp.photo_path?.trim()) {
        mergedExt.photo_data_url = getEmployeePhotoImageUrl(emp.id);
      }
      setMasterExt(mergedExt);
      // 탭 전용 데이터는 지연 로딩으로 처리(기본정보 조회 중 불필요한 404 연쇄 방지)
      setFamilyRows([]);
      setCareerRows([]);
      setPersonalRecordId(null);
      setPersonalDraft(emptyPersonalDraft());
      setCertificationRows([]);
      setLanguageRows([]);
      setAddressRecordId(null);
      setAddressDraft(emptyAddressDraft());
    } catch (e) {
      const fallback = employees.find((e) => e.id === id);
      if (fallback) {
        setDetail(fallback);
        setGeneralCore(detailToCore(fallback));
        const extLoaded = loadMasterExt(id);
        const mergedFb = mergeNameEnFromApi(fallback.name_en ?? undefined, extLoaded);
        if (fallback.salary_process_type != null && String(fallback.salary_process_type).trim() !== '') {
          mergedFb.salary_process_type = String(fallback.salary_process_type).trim();
        }
        if (fallback.division != null && String(fallback.division).trim() !== '') {
          mergedFb.division = String(fallback.division).trim();
        }
        if (fallback.work_place != null && String(fallback.work_place).trim() !== '') {
          mergedFb.workplace = String(fallback.work_place).trim();
        }
        if (fallback.area != null && String(fallback.area).trim() !== '') {
          mergedFb.area = String(fallback.area).trim();
        }
        if (fallback.work_status != null && String(fallback.work_status).trim() !== '') {
          mergedFb.work_status = String(fallback.work_status).trim();
        }
        if (fallback.employee_level != null && String(fallback.employee_level).trim() !== '') {
          mergedFb.emp_level = String(fallback.employee_level).trim();
        }
        if (fallback.swipe_card != null && String(fallback.swipe_card).trim() !== '') {
          mergedFb.swipe_card = String(fallback.swipe_card).trim();
        }
        if (fallback.photo_path?.trim()) {
          mergedFb.photo_data_url = getEmployeePhotoImageUrl(fallback.id);
        }
        setMasterExt(mergedFb);
        setFamilyRows([]);
        setCareerRows([]);
        setPersonalRecordId(null);
        setPersonalDraft(emptyPersonalDraft());
        setCertificationRows([]);
        setLanguageRows([]);
        setAddressRecordId(null);
        setAddressDraft(emptyAddressDraft());
      }
    } finally {
      setDetailLoading(false);
    }
  }, [employees]);

  useEffect(() => {
    if (selectedId != null) {
      void loadDetail(selectedId);
    } else if (uiMode !== 'new') {
      setDetail(null);
      setFamilyRows([]);
      setCareerRows([]);
      setPersonalRecordId(null);
      setPersonalDraft(emptyPersonalDraft());
      setCertificationRows([]);
      setLanguageRows([]);
      setAddressRecordId(null);
      setAddressDraft(emptyAddressDraft());
    }
  }, [selectedId, loadDetail, uiMode]);

  const getStatusText = useCallback(
    (status: string) => {
      if (status === 'active') return t('employees.status.active');
      if (status === 'terminated') return t('employees.status.terminated');
      return t('employees.status.inactive');
    },
    [t]
  );

  const confirmResignFromDialog = useCallback(async () => {
    if (!detail) return;
    const d = resignDialogDate.trim();
    if (!d) {
      alert(t('employees.toolbar.resignDateRequired'));
      return;
    }
    setSavingBasic(true);
    try {
      await apiClient.updateEmployee(detail.id, {
        status: 'terminated',
        termination_date: d,
      });
      setResignDialogOpen(false);
      await fetchEmployees(selectedCompanyId);
      await loadDetail(detail.id);
      alert(t('employees.toolbar.deleted'));
    } catch (e) {
      const msg = parseApiErrorMessage(e, t('employees.toolbar.deleteError'), localizeEmployeeErrorDetail);
      alert(msg);
    } finally {
      setSavingBasic(false);
    }
  }, [
    detail,
    resignDialogDate,
    fetchEmployees,
    selectedCompanyId,
    loadDetail,
    t,
    localizeEmployeeErrorDetail,
  ]);

  const pickRefItemLabel = useCallback(
    (it: { code: string; name_kor?: string | null; name_eng?: string | null; name_thai?: string | null }) => {
      if (locale === 'ko') return it.name_kor || it.name_eng || it.name_thai || it.code;
      if (locale === 'en') return it.name_eng || it.name_kor || it.name_thai || it.code;
      return it.name_thai || it.name_kor || it.name_eng || it.code;
    },
    [locale]
  );

  const departmentLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of orgReferenceOptions.department) {
      m.set(it.code, pickRefItemLabel(it));
    }
    return m;
  }, [orgReferenceOptions.department, pickRefItemLabel]);

  const positionLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of orgReferenceOptions.position) {
      m.set(it.code, pickRefItemLabel(it));
    }
    return m;
  }, [orgReferenceOptions.position, pickRefItemLabel]);

  const getDepartmentText = useCallback(
    (emp: Employee) => {
      const companyId = emp.company_id ?? null;
      const perCompanyRefs = companyId != null ? departmentPositionRefByCompany[companyId] : undefined;
      const departmentMap =
        selectedCompanyId != null
          ? departmentLabelByCode
          : new Map((perCompanyRefs?.department ?? []).map((it) => [it.code, pickRefItemLabel(it)]));
      const departmentText = emp.department ? departmentMap.get(emp.department) || emp.department : '-';
      return departmentText;
    },
    [
      departmentPositionRefByCompany,
      selectedCompanyId,
      departmentLabelByCode,
      pickRefItemLabel,
    ]
  );

  const getPositionText = useCallback(
    (emp: Employee) => {
      const companyId = emp.company_id ?? null;
      const perCompanyRefs = companyId != null ? departmentPositionRefByCompany[companyId] : undefined;
      const positionMap =
        selectedCompanyId != null
          ? positionLabelByCode
          : new Map((perCompanyRefs?.position ?? []).map((it) => [it.code, pickRefItemLabel(it)]));
      const positionText = emp.position ? positionMap.get(emp.position) || emp.position : '-';
      return positionText;
    },
    [departmentPositionRefByCompany, selectedCompanyId, positionLabelByCode, pickRefItemLabel]
  );

  const getEmployeeListFieldValue = useCallback(
    (emp: Employee, key: EmployeeListFilterKey): string => {
      if (key === 'name') return emp.name || '-';
      if (key === 'employeeNumber') return emp.employee_number || '-';
      if (key === 'department') return getDepartmentText(emp);
      if (key === 'position') return getPositionText(emp);
      return getStatusText(emp.status);
    },
    [getDepartmentText, getPositionText, getStatusText]
  );

  const baseFilteredEmployees = useMemo(() => {
    const q = deferredSearchTerm.trim().toLowerCase();
    return employees.filter((emp) => {
      const statusMatched =
        employmentStatusFilter === 'all' ? true : emp.status === employmentStatusFilter;
      if (!statusMatched) return false;

      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.employee_number.toLowerCase().includes(q) ||
        (emp.department || '').toLowerCase().includes(q)
      );
    });
  }, [employees, deferredSearchTerm, employmentStatusFilter]);

  const baseListRows = useMemo<EmployeeListRowView[]>(
    () =>
      baseFilteredEmployees.map((emp) => ({
        emp,
        values: {
          name: getEmployeeListFieldValue(emp, 'name'),
          employeeNumber: getEmployeeListFieldValue(emp, 'employeeNumber'),
          department: getEmployeeListFieldValue(emp, 'department'),
          position: getEmployeeListFieldValue(emp, 'position'),
          status: getEmployeeListFieldValue(emp, 'status'),
        },
      })),
    [baseFilteredEmployees, getEmployeeListFieldValue]
  );

  const filteredRows = useMemo(
    () =>
      baseListRows.filter((row) =>
        (Object.keys(columnFilters) as EmployeeListFilterKey[]).every((key) => {
          const selected = columnFilters[key];
          if (!selected || selected.length === 0) return true;
          return selected.includes(row.values[key]);
        })
      ),
    [baseListRows, columnFilters]
  );

  const listFilterValues = useMemo(() => {
    const toSortedUnique = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort();
    return {
      name: toSortedUnique(baseListRows.map((r) => r.values.name)),
      employeeNumber: toSortedUnique(baseListRows.map((r) => r.values.employeeNumber)),
      department: toSortedUnique(baseListRows.map((r) => r.values.department)),
      position: toSortedUnique(baseListRows.map((r) => r.values.position)),
      status: toSortedUnique(baseListRows.map((r) => r.values.status)),
    } as Record<EmployeeListFilterKey, string[]>;
  }, [baseListRows]);

  const toggleColumnFilterValue = useCallback((key: EmployeeListFilterKey, value: string) => {
    setColumnFilters((prev) => {
      const list = prev[key] ?? [];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [key]: next };
    });
  }, []);

  const sortedFiltered = useMemo(
    () => [...filteredRows].sort((a, b) => a.emp.employee_number.localeCompare(b.emp.employee_number)),
    [filteredRows]
  );

  const selectedIndex = useMemo(
    () => (selectedId != null ? sortedFiltered.findIndex((e) => e.emp.id === selectedId) : -1),
    [sortedFiltered, selectedId]
  );
  const listTotalPages = Math.max(1, Math.ceil(sortedFiltered.length / LIST_PAGE_SIZE));
  const safeListPage = Math.min(listPage, listTotalPages);
  const pagedSortedFiltered = useMemo(() => {
    const start = (safeListPage - 1) * LIST_PAGE_SIZE;
    return sortedFiltered.slice(start, start + LIST_PAGE_SIZE);
  }, [sortedFiltered, safeListPage]);

  useEffect(() => {
    setListPage(1);
  }, [deferredSearchTerm, employmentStatusFilter, columnFilters]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    const targetPage = Math.floor(selectedIndex / LIST_PAGE_SIZE) + 1;
    if (targetPage !== listPage) setListPage(targetPage);
  }, [selectedIndex, listPage]);

  const selectedListRow = useMemo(
    () => (selectedId != null ? employees.find((e) => e.id === selectedId) : undefined),
    [employees, selectedId]
  );

  const detailReady = selectedId != null && detail != null && !detailLoading;
  const showGeneralForm = uiMode === 'new' || detailReady;

  // 탭 전용 데이터 지연 로딩:
  // 기본정보(view/basic) 로딩 시점에 careers/personal/certifications/languages/address까지 호출하면
  // 백엔드가 아직 반영 전일 때 404가 연쇄로 떠서 "조회 화면 자체가 오류처럼 보이는" 문제가 있습니다.
  useEffect(() => {
    if (!detailReady || selectedId == null || !detail) return;
    if (detailTab === 'basic') return;

    let cancelled = false;
    const run = async () => {
      if (cancelled) return;

      if (detailTab === 'family') {
        try {
          const familyRes = await apiClient.getEmployeeFamilies(selectedId);
          const rows = Array.isArray(familyRes.data)
            ? (familyRes.data as Array<Record<string, unknown>>)
            : [];
          setFamilyRows(
            rows.map((r) => ({
              id: typeof r.id === 'number' ? r.id : undefined,
              rowKey: newRowKey(),
              name: String(r.name ?? ''),
              relation: String(r.relation ?? ''),
              resident_number: String(r.resident_number ?? ''),
              domestic_foreign: String(r.domestic_foreign ?? 'domestic'),
              highest_education: String(r.highest_education ?? ''),
              occupation: String(r.occupation ?? ''),
              workplace: String(r.workplace ?? ''),
              position: String(r.position ?? ''),
              support_reason: String(r.support_reason ?? ''),
            }))
          );
        } catch {
          setFamilyRows([]);
        }
        return;
      }

      if (detailTab === 'career') {
        try {
          const careerRes = await apiClient.getEmployeeCareers(selectedId);
          const crows = Array.isArray(careerRes.data)
            ? (careerRes.data as Array<Record<string, unknown>>)
            : [];
          setCareerRows(
            crows.map((r) => {
              const enter_date = isoSlice(String(r.enter_date ?? ''));
              const resigned_date = isoSlice(String(r.resigned_date ?? ''));
              const computedTenure = formatCareerTenureFromDates(
                enter_date,
                resigned_date,
                (y, m) => formatCareerTenurePartsI18n(y, m, t)
              );
              return {
                id: typeof r.id === 'number' ? r.id : undefined,
                rowKey: newRowKey(),
                position_title: String(r.position_title ?? ''),
                work_details: String(r.work_details ?? ''),
                enter_date,
                resigned_date,
                company_name: String(r.company_name ?? ''),
                address: String(r.address ?? ''),
                telephone: String(r.telephone ?? ''),
                begin_salary: String(r.begin_salary ?? ''),
                resignation_reason: String(r.resignation_reason ?? ''),
                latest_salary: String(r.latest_salary ?? ''),
                tenure_text: computedTenure || String(r.tenure_text ?? ''),
              };
            })
          );
        } catch {
          setCareerRows([]);
        }
        return;
      }

      if (detailTab === 'personal') {
        try {
          const pRes = await apiClient.getEmployeePersonalInfo(selectedId);
          const p = pRes.data as Record<string, unknown> | null;
          if (p && typeof p.id === 'number') {
            setPersonalRecordId(p.id);
            setPersonalDraft(personalFromApi(p));
          } else {
            setPersonalRecordId(null);
            setPersonalDraft(emptyPersonalDraft());
          }
        } catch {
          setPersonalRecordId(null);
          setPersonalDraft(emptyPersonalDraft());
        }
        return;
      }

      if (detailTab === 'certification') {
        try {
          const certRes = await apiClient.getEmployeeCertifications(selectedId);
          const certs = Array.isArray(certRes.data)
            ? (certRes.data as Array<Record<string, unknown>>)
            : [];
          setCertificationRows(
            certs.map((r) => ({
              id: typeof r.id === 'number' ? r.id : undefined,
              rowKey: newRowKey(),
              license_type_minor_code_id:
                typeof r.license_type_minor_code_id === 'number'
                  ? r.license_type_minor_code_id
                  : null,
              license_code: String(r.license_code ?? ''),
              license_type_name: String(r.license_type_name ?? ''),
              grade: String(r.grade ?? ''),
              issuer_minor_code_id:
                typeof r.issuer_minor_code_id === 'number' ? r.issuer_minor_code_id : null,
              issuer_code: String(r.issuer_code ?? ''),
              issuer_name: String(r.issuer_name ?? ''),
              acquired_date: isoSlice(String(r.acquired_date ?? '')),
              effective_date: isoSlice(String(r.effective_date ?? '')),
              next_renewal_date: isoSlice(String(r.next_renewal_date ?? '')),
              certificate_number: String(r.certificate_number ?? ''),
            }))
          );
        } catch {
          setCertificationRows([]);
        }
        return;
      }

      if (detailTab === 'language') {
        try {
          const langRes = await apiClient.getEmployeeLanguages(selectedId);
          const langs = Array.isArray(langRes.data)
            ? (langRes.data as Array<Record<string, unknown>>)
            : [];
          setLanguageRows(
            langs.map((r) => ({
              id: typeof r.id === 'number' ? r.id : undefined,
              rowKey: newRowKey(),
              acquisition_date: isoSlice(String(r.acquisition_date ?? '')),
              language_code: String(r.language_code ?? ''),
              test_type: String(r.test_type ?? ''),
              score:
                r.score != null && r.score !== ''
                  ? String(typeof r.score === 'number' ? r.score : Number(r.score) || 0)
                  : '0',
              grade: String(r.grade ?? ''),
              expiry_date: isoSlice(String(r.expiry_date ?? '')),
            }))
          );
        } catch {
          setLanguageRows([]);
        }
        return;
      }

      if (detailTab === 'address') {
        try {
          const addrRes = await apiClient.getEmployeeAddressInfo(selectedId);
          const a = addrRes.data as Record<string, unknown> | null;
          if (a && typeof a.id === 'number') {
            setAddressRecordId(a.id);
            setAddressDraft(addressFromApi(a));
          } else {
            setAddressRecordId(null);
            setAddressDraft(emptyAddressDraft());
          }
        } catch {
          setAddressRecordId(null);
          setAddressDraft(emptyAddressDraft());
        }
        return;
      }

      if (detailTab === 'foreigner') {
        try {
          const foreignRes = await apiClient.getEmployeeForeignerInfo(selectedId);
          const f = foreignRes.data as Record<string, unknown> | null;
          if (f && typeof f.id === 'number') {
            setForeignerRecordId(f.id);
            setForeignerDraft(foreignerFromApi(f));
          } else {
            setForeignerRecordId(null);
            setForeignerDraft(emptyForeignerDraft());
          }
        } catch {
          setForeignerRecordId(null);
          setForeignerDraft(emptyForeignerDraft());
        }
        return;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [detailReady, detailTab, selectedId, detail, t]);

  const familyThGroup =
    'text-center text-[10px] font-semibold text-gray-700 border border-gray-300 bg-rose-50/80';
  const familyThSub =
    'text-center text-[10px] font-medium text-gray-600 border border-gray-300 bg-gray-50 px-1 py-1';
  const familyInputCls =
    'w-full min-w-[4rem] border border-gray-200 rounded px-1 py-0.5 text-xs disabled:bg-gray-100 disabled:text-gray-600';

  const statusLabel = getStatusText;

  const pickMinorLabelForLocale = useCallback(
    (o: MinorOption) => {
      if (locale === 'ko') return o.name_kor || o.name_eng || o.name_thai || o.minor_code;
      if (locale === 'en') return o.name_eng || o.name_kor || o.name_thai || o.minor_code;
      // th (default)
      return o.name_thai || o.name_kor || o.name_eng || o.minor_code;
    },
    [locale]
  );

  const allowAdd = can(menuKey, 'can_create');
  const allowEdit = can(menuKey, 'can_update');
  const allowDelete = can(menuKey, 'can_delete');
  const allowSave =
    uiMode === 'new' ? allowAdd : uiMode === 'edit' ? allowEdit : false;
  const canEditExtension =
    uiMode === 'new' ? allowAdd : uiMode === 'edit' ? allowEdit : false;

  const referenceCrud = useMemo(
    () => ({
      create: can('hr-master-reference-manage', 'can_create'),
      update: can('hr-master-reference-manage', 'can_update'),
      delete: can('hr-master-reference-manage', 'can_delete'),
    }),
    [can]
  );

  const invalidateReferenceOptions = useCallback(() => {
    const cid = Number(generalCore.company_id);
    if (Number.isInteger(cid) && cid > 0) void fetchOrgReferenceOptions(cid);
  }, [generalCore.company_id, fetchOrgReferenceOptions]);

  const refreshCertMinorOptions = useCallback(async () => {
    const cid = Number(generalCore.company_id);
    if (!Number.isInteger(cid) || cid <= 0) return;

    try {
      const [ltMajorId, issMajorId] = [
        certMajorIdByField.license_type,
        certMajorIdByField.issuer,
      ];

      const fetchMinor = async (majorId: number | null) => {
        if (!majorId) return [] as MinorOption[];
        const r = await apiClient.getMinorCodes({ company_id: cid, major_code_id: majorId });
        return (r.data as MinorOption[]) ?? [];
      };

      const [lt, iss] = await Promise.all([fetchMinor(ltMajorId), fetchMinor(issMajorId)]);
      setCertMinorOptionsByField({ license_type: lt, issuer: iss });
    } catch {
      // Keep existing UI state if reference refresh fails.
    }
  }, [generalCore.company_id, certMajorIdByField]);

  // 자격증(자격면허종류/발행기관) - minor 기준정보 미리 로딩
  useEffect(() => {
    if (detailTab !== 'certification' || !detailReady || selectedId == null) return;
    const cid = Number(generalCore.company_id);
    if (!Number.isInteger(cid) || cid <= 0) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiClient.getMajorCodes({ company_id: cid });
        const majors = (res.data as Array<{
          id: number;
          major_code: string;
          name_kor?: string | null;
          name_eng?: string | null;
          name_thai?: string | null;
        }>) ?? [];

        const findMajorId = (...keywords: string[]) =>
          majors.find((m) => {
            const pool = `${m.major_code} ${m.name_kor ?? ''} ${m.name_eng ?? ''} ${m.name_thai ?? ''}`.toLowerCase();
            return keywords.some((k) => pool.includes(k.toLowerCase()));
          })?.id;

        const licenseTypeMajorId =
          findMajorId(
            '자격면허종류',
            '자격/면허종류',
            '자격 면허 종류',
            '자격 면허종류',
            '면허종류',
            '면허 종류'
          ) ?? null;
        const issuerMajorId =
          findMajorId(
            '자격/면허증발행기관',
            '자격면허증발행기관',
            '자격/면허증 발행기관',
            '면허증발행기관',
            '면허증 발행기관',
            '발행기관'
          ) ?? null;

        if (cancelled) return;
        setCertMajorIdByField({ license_type: licenseTypeMajorId, issuer: issuerMajorId });

        const fetchMinor = async (majorId: number | null) => {
          if (!majorId) return [] as MinorOption[];
          const r = await apiClient.getMinorCodes({ company_id: cid, major_code_id: majorId });
          return (r.data as MinorOption[]) ?? [];
        };

        const [lt, iss] = await Promise.all([fetchMinor(licenseTypeMajorId), fetchMinor(issuerMajorId)]);
        if (cancelled) return;
        setCertMinorOptionsByField({ license_type: lt, issuer: iss });
      } catch {
        // no-op
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailTab, detailReady, selectedId, generalCore.company_id]);

  // 서버에 minor id가 없더라도, 현재 코드에 매칭되는 minor id/이름을 보정
  useEffect(() => {
    if (detailTab !== 'certification') return;
    setCertificationRows((prev) =>
      prev.map((r) => {
        const ltOpt =
          (typeof r.license_type_minor_code_id === 'number'
            ? certMinorOptionsByField.license_type.find((o) => o.id === r.license_type_minor_code_id)
            : certMinorOptionsByField.license_type.find((o) => o.minor_code === r.license_code)) ?? null;
        const issOpt =
          (typeof r.issuer_minor_code_id === 'number'
            ? certMinorOptionsByField.issuer.find((o) => o.id === r.issuer_minor_code_id)
            : certMinorOptionsByField.issuer.find((o) => o.minor_code === r.issuer_code)) ?? null;

        const next = { ...r };
        if (ltOpt) {
          if (next.license_type_minor_code_id == null) next.license_type_minor_code_id = ltOpt.id;
          if (!next.license_type_name) next.license_type_name = pickMinorLabelForLocale(ltOpt);
        }
        if (issOpt) {
          if (next.issuer_minor_code_id == null) next.issuer_minor_code_id = issOpt.id;
          if (!next.issuer_name) next.issuer_name = pickMinorLabelForLocale(issOpt);
        }
        return next;
      })
    );
  }, [certMinorOptionsByField, detailTab, pickMinorLabelForLocale]);

  // 개인정보(국적/종교) - minor 기준정보 미리 로딩
  useEffect(() => {
    if (detailTab !== 'personal' || !detailReady || selectedId == null) return;
    const cid = Number(generalCore.company_id);
    if (!Number.isInteger(cid) || cid <= 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient.getMajorCodes({ company_id: cid });
        const majors = (res.data as Array<{
          id: number;
          major_code: string;
          name_kor?: string | null;
          name_eng?: string | null;
          name_thai?: string | null;
        }>) ?? [];

        const findMajorId = (...keywords: string[]) =>
          majors.find((m) => {
            const pool = `${m.major_code} ${m.name_kor ?? ''} ${m.name_eng ?? ''} ${m.name_thai ?? ''}`.toLowerCase();
            return keywords.some((k) => pool.includes(k.toLowerCase()));
          })?.id;

        const nationalityMajorId =
          findMajorId('국적', 'Nationality', 'สัญชาติ', 'nationality') ?? null;
        const religionMajorId =
          findMajorId('종교', 'Religion', 'ศาสนา', 'religion') ?? null;

        if (cancelled) return;
        setPersonalMajorIdByField({
          nationality: nationalityMajorId,
          religion: religionMajorId,
        });

        const fetchMinor = async (majorId: number | null) => {
          if (!majorId) return [] as MinorOption[];
          const r = await apiClient.getMinorCodes({ company_id: cid, major_code_id: majorId });
          return (r.data as MinorOption[]) ?? [];
        };

        const [nat, rel] = await Promise.all([
          fetchMinor(nationalityMajorId),
          fetchMinor(religionMajorId),
        ]);
        if (cancelled) return;
        setPersonalMinorOptionsByField({
          nationality: nat,
          religion: rel,
        });
      } catch {
        // no-op
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailTab, detailReady, selectedId, generalCore.company_id]);

  // 주소정보(국적/도/시군구/동읍면/우편번호) - minor 기준정보 미리 로딩
  useEffect(() => {
    if (detailTab !== 'address' || !detailReady || selectedId == null) return;
    const cid = Number(generalCore.company_id);
    if (!Number.isInteger(cid) || cid <= 0) return;

    let cancelled = false;

    void (async () => {
      try {
        const res = await apiClient.getMajorCodes({ company_id: cid });
        const majors = (res.data as Array<{
          id: number;
          major_code: string;
          name_kor?: string | null;
          name_eng?: string | null;
          name_thai?: string | null;
        }>) ?? [];

        const findMajorId = (...keywords: string[]) =>
          majors.find((m) => {
            const pool = `${m.major_code} ${m.name_kor ?? ''} ${m.name_eng ?? ''} ${m.name_thai ?? ''}`.toLowerCase();
            return keywords.some((k) => pool.includes(k.toLowerCase()));
          })?.id;

        const nationalityMajorId = findMajorId(
          '국적',
          'Nationality',
          'สัญชาติ',
          'nationality'
        ) ?? null;
        const zoneMajorId = findMajorId('zone', 'Zone', '권역', 'Zone 정보', '권역정보') ?? null;
        const provinceMajorId = findMajorId(
          '도시정보',
          '도시',
          'Province 정보',
          'Province',
          'จังหวัด',
          'province'
        ) ?? null;
        const districtMajorId = findMajorId(
          '시/군/구 정보',
          '시/군/구',
          '시군구',
          'District 정보',
          'District',
          'district',
          'อำเภอ'
        ) ?? null;
        const subDistrictMajorId = findMajorId(
          '동/읍/면 정보',
          '동/읍/면',
          '동읍면',
          'Sub district 정보',
          'Sub district',
          'sub district',
          'ตำบล',
          'tumbon',
          '읍',
          '면'
        ) ?? null;
        const postcodeMajorId = findMajorId(
          '우편번호',
          '우편 번호',
          'Postcode',
          'postcode',
          '우편번호 정보',
          'Zip',
          'zip',
          'Zip code',
          'รหัสไปรษณีย์'
        ) ?? null;

        if (cancelled) return;
        setAddrMajorIdByField({
          nationality: nationalityMajorId,
          zone: zoneMajorId,
          province: provinceMajorId,
          district: districtMajorId,
          sub_district: subDistrictMajorId,
          postcode: postcodeMajorId,
        });

        const fetchMinor = async (majorId: number | null) => {
          if (!majorId) return [] as MinorOption[];
          const r = await apiClient.getMinorCodes({ company_id: cid, major_code_id: majorId });
          return (r.data as MinorOption[]) ?? [];
        };

        const [nat, zon, prov, dist, subd, post] = await Promise.all([
          fetchMinor(nationalityMajorId),
          fetchMinor(zoneMajorId),
          fetchMinor(provinceMajorId),
          fetchMinor(districtMajorId),
          fetchMinor(subDistrictMajorId),
          fetchMinor(postcodeMajorId),
        ]);

        if (cancelled) return;
        setAddrMinorOptionsByField({
          nationality: nat,
          zone: zon,
          province: prov,
          district: dist,
          sub_district: subd,
          postcode: post,
        });
      } catch {
        // no-op
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailTab, detailReady, selectedId, generalCore.company_id]);

  const handleToolbarSave = async () => {
    if (detailTab === 'education' && detailReady) {
      if (!allowSave || !educationToolbarActions) return;
      await educationToolbarActions.save();
      setUiMode('browse');
      return;
    }
    if (detailTab === 'family' && detailReady) {
      if (!allowSave) return;
      await saveFamilyServer();
      setUiMode('browse');
      return;
    }
    if (detailTab === 'career' && detailReady) {
      if (!allowSave) return;
      await saveCareerServer();
      setUiMode('browse');
      return;
    }
    if (detailTab === 'personal' && detailReady) {
      if (!allowSave) return;
      await savePersonalServer();
      setUiMode('browse');
      return;
    }
    if (detailTab === 'certification' && detailReady) {
      if (!allowSave) return;
      await saveCertificationServer();
      setUiMode('browse');
      return;
    }
    if (detailTab === 'language' && detailReady) {
      if (!allowSave) return;
      await saveLanguageServer();
      setUiMode('browse');
      return;
    }
    if (detailTab === 'address' && detailReady) {
      if (!allowSave) return;
      await saveAddressServer();
      setUiMode('browse');
      return;
    }
    if (detailTab === 'foreigner' && detailReady) {
      if (!allowSave) return;
      await saveForeignerServer();
      setUiMode('browse');
      return;
    }
    if (uiMode === 'new' && !allowAdd) return;
    if (uiMode === 'edit' && !allowEdit) return;
    if (uiMode === 'new') {
      if (
        !generalCore.company_id.trim() ||
        !generalCore.employee_number.trim() ||
        !generalCore.name.trim() ||
        !generalCore.email.trim() ||
        !generalCore.hire_date.trim()
      ) {
        alert(t('employees.toolbar.validationNew'));
        return;
      }
      if (generalCore.status === 'terminated' && !generalCore.termination_date?.trim()) {
        alert(t('employees.toolbar.resignDateRequired'));
        return;
      }
      const companyIdNum = Number(generalCore.company_id);
      if (!Number.isInteger(companyIdNum) || companyIdNum <= 0) {
        alert(t('employees.toolbar.validationNew'));
        return;
      }
      setSavingBasic(true);
      try {
        const payload = {
          company_id: companyIdNum,
          employee_number: generalCore.employee_number.trim(),
          name: generalCore.name.trim(),
          email: generalCore.email.trim(),
          hire_date: generalCore.hire_date,
          phone: generalCore.phone || undefined,
          department: generalCore.department || undefined,
          position: generalCore.position || undefined,
          job_level: generalCore.job_level || undefined,
          employment_type: generalCore.employment_type || undefined,
          salary_process_type: masterExt.salary_process_type?.trim() || undefined,
          division: masterExt.division?.trim() || undefined,
          work_place: masterExt.workplace?.trim() || undefined,
          area: masterExt.area?.trim() || undefined,
          work_status: masterExt.work_status?.trim() || undefined,
          employee_level: masterExt.emp_level?.trim() || undefined,
          birth_date: generalCore.birth_date || undefined,
          gender: generalCore.gender || undefined,
          tax_id: generalCore.tax_id || undefined,
          name_en: buildNameEn(masterExt) || undefined,
          status: generalCore.status || 'active',
          termination_date:
            generalCore.status === 'terminated' && generalCore.termination_date?.trim()
              ? generalCore.termination_date.trim()
              : undefined,
        };
        const res = await apiClient.createEmployee(payload);
        const created = res.data as Employee;
        if (masterExt.photo_data_url?.startsWith('data:')) {
          try {
            const file = await dataUrlToFile(masterExt.photo_data_url, 'photo.jpg');
            await apiClient.uploadEmployeePhoto(created.id, file);
          } catch (uploadErr) {
            const msg = parseApiErrorMessage(
              uploadErr,
              t('employees.basic.saveError'),
              localizeEmployeeErrorDetail
            );
            alert(msg);
          }
        }
        saveMasterExt(created.id, masterExt);
        await fetchEmployees(selectedCompanyId);
        setUiMode('browse');
        setSelectedId(created.id);
        setDetailTab('basic');
        alert(t('employees.basic.saved'));
      } catch (e) {
        const msg = parseApiErrorMessage(e, t('employees.basic.saveError'), localizeEmployeeErrorDetail);
        alert(msg);
      } finally {
        setSavingBasic(false);
      }
      return;
    }

    if (!detail) return;
    if (generalCore.status === 'terminated' && !generalCore.termination_date?.trim()) {
      alert(t('employees.toolbar.resignDateRequired'));
      return;
    }
    setSavingBasic(true);
    try {
      if (masterExt.photo_data_url?.startsWith('data:')) {
        const file = await dataUrlToFile(masterExt.photo_data_url, 'photo.jpg');
        await apiClient.uploadEmployeePhoto(detail.id, file);
      } else if (!masterExt.photo_data_url?.trim() && detail.photo_path) {
        await apiClient.deleteEmployeePhoto(detail.id);
      }
      await apiClient.updateEmployee(detail.id, toApiUpdatePayload(generalCore, masterExt));
      saveMasterExt(detail.id, masterExt);
      await fetchEmployees(selectedCompanyId);
      await loadDetail(detail.id);
      setUiMode('browse');
      alert(t('employees.basic.saved'));
    } catch (e) {
      const msg = parseApiErrorMessage(e, t('employees.basic.saveError'), localizeEmployeeErrorDetail);
      alert(msg);
    } finally {
      setSavingBasic(false);
    }
  };

  const handleToolbarCancel = async () => {
    if (detailTab === 'education' && detailReady && educationToolbarActions) {
      await educationToolbarActions.cancel();
      setUiMode('browse');
      return;
    }
    if (detailTab === 'family' && detailReady && selectedId != null) {
      await loadDetail(selectedId);
      setUiMode('browse');
      return;
    }
    if (detailTab === 'career' && detailReady && selectedId != null) {
      await loadDetail(selectedId);
      setUiMode('browse');
      return;
    }
    if (detailTab === 'personal' && detailReady && selectedId != null) {
      await loadDetail(selectedId);
      setUiMode('browse');
      return;
    }
    if (detailTab === 'certification' && detailReady && selectedId != null) {
      await loadDetail(selectedId);
      setUiMode('browse');
      return;
    }
    if (detailTab === 'language' && detailReady && selectedId != null) {
      await loadDetail(selectedId);
      setUiMode('browse');
      return;
    }
    if (detailTab === 'address' && detailReady && selectedId != null) {
      await loadDetail(selectedId);
      setUiMode('browse');
      return;
    }
    if (detailTab === 'foreigner' && detailReady && selectedId != null) {
      await loadDetail(selectedId);
      setUiMode('browse');
      return;
    }
    if (uiMode === 'new') {
      const defaultCompanyId = selectedCompanyId ?? companyOptions[0]?.id ?? null;
      setUiMode('browse');
      setSelectedId(null);
      setGeneralCore({
        ...emptyGeneralCore(),
        company_id: defaultCompanyId != null ? String(defaultCompanyId) : '',
      });
      setMasterExt(emptyMasterExt());
      setDetailTab('basic');
      return;
    }
    if (selectedId != null) {
      void loadDetail(selectedId);
    }
    setUiMode('browse');
  };

  const handleToolbarAdd = () => {
    if (detailTab === 'education' && detailReady) {
      if (!allowAdd || !educationToolbarActions) return;
      setUiMode('edit');
      void educationToolbarActions.add();
      return;
    }
    if (detailTab === 'family' && detailReady) {
      if (!allowAdd) return;
      setUiMode('edit');
      addFamilyRow();
      return;
    }
    if (detailTab === 'career' && detailReady) {
      if (!allowAdd) return;
      setUiMode('edit');
      addCareerRow();
      return;
    }
    if (detailTab === 'personal' && detailReady) {
      if (!allowAdd) return;
      setUiMode('edit');
      return;
    }
    if (detailTab === 'certification' && detailReady) {
      if (!allowAdd) return;
      setUiMode('edit');
      addCertificationRow();
      return;
    }
    if (detailTab === 'language' && detailReady) {
      if (!allowAdd) return;
      setUiMode('edit');
      addLanguageRow();
      return;
    }
    if (detailTab === 'address' && detailReady) {
      if (!allowAdd) return;
      setUiMode('edit');
      return;
    }
    if (detailTab === 'foreigner' && detailReady) {
      if (!allowAdd) return;
      setUiMode('edit');
      return;
    }
    if (!allowAdd) return;
    const defaultCompanyId = selectedCompanyId ?? companyOptions[0]?.id ?? null;
    setUiMode('new');
    setSelectedId(null);
    setDetail(null);
    setGeneralCore({
      ...emptyGeneralCore(),
      company_id: defaultCompanyId != null ? String(defaultCompanyId) : '',
    });
    setMasterExt(emptyMasterExt());
    setFamilyRows([]);
    setCareerRows([]);
    setPersonalRecordId(null);
    setPersonalDraft(emptyPersonalDraft());
    setCertificationRows([]);
    setLanguageRows([]);
    setAddressRecordId(null);
    setAddressDraft(emptyAddressDraft());
    setForeignerRecordId(null);
    setForeignerDraft(emptyForeignerDraft());
    setDetailTab('basic');
  };

  const handleToolbarEdit = () => {
    if (detailTab === 'education' && detailReady) {
      if (!allowEdit) return;
      setUiMode('edit');
      return;
    }
    if (detailTab === 'family' && detailReady) {
      if (!allowEdit) return;
      setUiMode('edit');
      return;
    }
    if (detailTab === 'career' && detailReady) {
      if (!allowEdit) return;
      setUiMode('edit');
      return;
    }
    if (detailTab === 'personal' && detailReady) {
      if (!allowEdit) return;
      setUiMode('edit');
      return;
    }
    if (detailTab === 'certification' && detailReady) {
      if (!allowEdit) return;
      setUiMode('edit');
      return;
    }
    if (detailTab === 'language' && detailReady) {
      if (!allowEdit) return;
      setUiMode('edit');
      return;
    }
    if (detailTab === 'address' && detailReady) {
      if (!allowEdit) return;
      setUiMode('edit');
      return;
    }
    if (detailTab === 'foreigner' && detailReady) {
      if (!allowEdit) return;
      setUiMode('edit');
      return;
    }
    if (!detailReady || !allowEdit) return;
    setUiMode('edit');
  };

  const handleToolbarDelete = async () => {
    if (detailTab === 'education' && detailReady) {
      if (!allowDelete || !educationToolbarActions) return;
      await educationToolbarActions.del();
      return;
    }
    if (detailTab === 'family' && detailReady) {
      alert(t('employees.family.deleteRowHint'));
      return;
    }
    if (detailTab === 'career' && detailReady) {
      alert(t('employees.career.deleteRowHint'));
      return;
    }
    if (detailTab === 'certification' && detailReady) {
      alert(t('employees.certification.deleteRowHint'));
      return;
    }
    if (detailTab === 'language' && detailReady) {
      alert(t('employees.language.deleteRowHint'));
      return;
    }
    if (detailTab === 'address' && detailReady) {
      if (!allowDelete) return;
      if (addressRecordId == null) {
        alert(t('employees.address.nothingToDelete'));
        return;
      }
      if (!window.confirm(t('employees.address.confirmDelete'))) return;
      setSavingBasic(true);
      try {
        await apiClient.deleteEmployeeAddressInfo(detail!.id);
        await loadDetail(detail!.id);
        alert(t('employees.address.deleted'));
      } catch (e) {
        const msg = parseApiErrorMessage(e, t('employees.address.deleteError'));
        alert(msg);
      } finally {
        setSavingBasic(false);
      }
      return;
    }
    if (detailTab === 'foreigner' && detailReady) {
      if (!allowDelete) return;
      if (foreignerRecordId == null) {
        alert(t('employees.foreigner.nothingToDelete'));
        return;
      }
      if (!window.confirm(t('employees.foreigner.confirmDelete'))) return;
      setSavingBasic(true);
      try {
        await apiClient.deleteEmployeeForeignerInfo(detail!.id);
        await loadDetail(detail!.id);
        alert(t('employees.foreigner.deleted'));
      } catch (e) {
        const msg = parseApiErrorMessage(e, t('employees.foreigner.deleteError'));
        alert(msg);
      } finally {
        setSavingBasic(false);
      }
      return;
    }
    if (detailTab === 'personal' && detailReady) {
      if (!allowDelete) return;
      if (personalRecordId == null) {
        alert(t('employees.personal.nothingToDelete'));
        return;
      }
      if (!window.confirm(t('employees.personal.confirmDelete'))) return;
      setSavingBasic(true);
      try {
        await apiClient.deleteEmployeePersonalInfo(detail!.id);
        await loadDetail(detail!.id);
        alert(t('employees.personal.deleted'));
      } catch (e) {
        const msg = parseApiErrorMessage(e, t('employees.personal.deleteError'));
        alert(msg);
      } finally {
        setSavingBasic(false);
      }
      return;
    }
    if (!allowDelete) return;
    if (!detailReady || !detail) return;
    if (detailTab === 'basic') {
      setResignDialogDate(isoSlice(detail.termination_date) || new Date().toISOString().slice(0, 10));
      setResignDialogOpen(true);
      return;
    }
  };

  const goNav = (index: number) => {
    const row = sortedFiltered[index];
    if (row) {
      setUiMode('browse');
      setSelectedId(row.emp.id);
    }
  };

  const handleFirst = () => goNav(0);
  const handlePrev = () => {
    if (selectedIndex > 0) goNav(selectedIndex - 1);
  };
  const handleNext = () => {
    if (selectedIndex >= 0 && selectedIndex < sortedFiltered.length - 1) goNav(selectedIndex + 1);
  };
  const handleLast = () => {
    if (sortedFiltered.length > 0) goNav(sortedFiltered.length - 1);
  };

  const addFamilyRow = () => {
    if (!canEditExtension) return;
    setFamilyRows((prev) => [
      ...prev,
      emptyFamilyRow(),
    ]);
  };

  const updateFamily = (rowKey: string, patch: Partial<FamilyRow>) => {
    setFamilyRows((prev) => prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)));
  };

  const removeFamily = (rowKey: string) => {
    if (!canEditExtension) return;
    setFamilyRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
  };

  async function saveFamilyServer() {
    if (!canEditExtension || selectedId == null) return;
    setSavingBasic(true);
    try {
      await apiClient.bulkSaveEmployeeFamilies(selectedId, {
        rows: familyRows.map(familyRowToApiPayload),
      });
      await loadDetail(selectedId);
      alert(t('employees.family.savedServer'));
    } catch (e) {
      const msg = parseApiErrorMessage(e, t('employees.family.saveError'));
      alert(msg);
    } finally {
      setSavingBasic(false);
    }
  }

  const addCareerRow = () => {
    if (!canEditExtension) return;
    setCareerRows((prev) => [...prev, emptyCareerRow()]);
  };

  const updateCareer = useCallback((rowKey: string, patch: Partial<CareerRow>) => {
    setCareerRows((prev) =>
      prev.map((r) => {
        if (r.rowKey !== rowKey) return r;
        const next = { ...r, ...patch };
        if (patch.enter_date !== undefined || patch.resigned_date !== undefined) {
          next.tenure_text = formatCareerTenureFromDates(next.enter_date, next.resigned_date, (y, m) =>
            formatCareerTenurePartsI18n(y, m, t)
          );
        }
        return next;
      })
    );
  }, [t]);

  const removeCareer = (rowKey: string) => {
    if (!canEditExtension) return;
    setCareerRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
  };

  async function saveCareerServer() {
    if (!canEditExtension || selectedId == null) return;
    setSavingBasic(true);
    try {
      await apiClient.bulkSaveEmployeeCareers(selectedId, {
        rows: careerRows.map(careerRowToApiPayload),
      });
      await loadDetail(selectedId);
      alert(t('employees.career.savedServer'));
    } catch (e) {
      const msg = parseApiErrorMessage(e, t('employees.career.saveError'));
      alert(msg);
    } finally {
      setSavingBasic(false);
    }
  }

  const addCertificationRow = () => {
    if (!canEditExtension) return;
    setCertificationRows((prev) => [...prev, emptyCertificationRow()]);
  };

  const updateCertification = (rowKey: string, patch: Partial<CertificationRow>) => {
    setCertificationRows((prev) => prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)));
  };

  const openCertMinorPicker = (field: 'license_type' | 'issuer', rowKey: string) => {
    if (!canEditExtension) return;
    setCertPickerField(field);
    setCertPickerRowKey(rowKey);
    setCertPickerOpen(true);
  };

  const clearCertMinorSelection = () => {
    if (!certPickerRowKey) return;
    if (certPickerField === 'license_type') {
      updateCertification(certPickerRowKey, {
        license_code: '',
        license_type_name: '',
        license_type_minor_code_id: null,
      });
    } else {
      updateCertification(certPickerRowKey, {
        issuer_code: '',
        issuer_name: '',
        issuer_minor_code_id: null,
      });
    }
  };

  const handlePickCertMinor = (o: MinorOption) => {
    if (!certPickerRowKey) return;
    if (certPickerField === 'license_type') {
      updateCertification(certPickerRowKey, {
        license_code: o.minor_code,
        license_type_name: pickMinorLabelForLocale(o),
        license_type_minor_code_id: o.id,
      });
    } else {
      updateCertification(certPickerRowKey, {
        issuer_code: o.minor_code,
        issuer_name: pickMinorLabelForLocale(o),
        issuer_minor_code_id: o.id,
      });
    }
  };

  const removeCertification = (rowKey: string) => {
    if (!canEditExtension) return;
    setCertificationRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
  };

  async function saveCertificationServer() {
    if (!canEditExtension || selectedId == null) return;
    setSavingBasic(true);
    try {
      await apiClient.bulkSaveEmployeeCertifications(selectedId, {
        rows: certificationRows.map(certificationRowToApiPayload),
      });
      await loadDetail(selectedId);
      alert(t('employees.certification.savedServer'));
    } catch (e) {
      const msg = parseApiErrorMessage(e, t('employees.certification.saveError'));
      alert(msg);
    } finally {
      setSavingBasic(false);
    }
  }

  const addLanguageRow = () => {
    if (!canEditExtension) return;
    setLanguageRows((prev) => [...prev, emptyLanguageRow()]);
  };

  const updateLanguage = (rowKey: string, patch: Partial<LanguageRow>) => {
    setLanguageRows((prev) => prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)));
  };

  const removeLanguage = (rowKey: string) => {
    if (!canEditExtension) return;
    setLanguageRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
  };

  async function saveLanguageServer() {
    if (!canEditExtension || selectedId == null) return;
    setSavingBasic(true);
    try {
      await apiClient.bulkSaveEmployeeLanguages(selectedId, {
        rows: languageRows.map(languageRowToApiPayload),
      });
      await loadDetail(selectedId);
      alert(t('employees.language.savedServer'));
    } catch (e) {
      const msg = parseApiErrorMessage(e, t('employees.language.saveError'));
      alert(msg);
    } finally {
      setSavingBasic(false);
    }
  }

  async function savePersonalServer() {
    if (!canEditExtension || selectedId == null) return;
    const payload = personalDraftToApi(personalDraft);
    setSavingBasic(true);
    try {
      if (personalRecordId == null) {
        try {
          await apiClient.createEmployeePersonalInfo(selectedId, payload);
        } catch (e: unknown) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status === 409) {
            await apiClient.updateEmployeePersonalInfo(selectedId, payload);
          } else {
            throw e;
          }
        }
      } else {
        await apiClient.updateEmployeePersonalInfo(selectedId, payload);
      }
      await loadDetail(selectedId);
      alert(t('employees.personal.saved'));
    } catch (e) {
      const msg = parseApiErrorMessage(e, t('employees.personal.saveError'));
      alert(msg);
    } finally {
      setSavingBasic(false);
    }
  }

  async function saveAddressServer() {
    if (!canEditExtension || selectedId == null) return;
    const payload = addressDraftToApi(addressDraft);
    setSavingBasic(true);
    try {
      if (addressRecordId == null) {
        try {
          await apiClient.createEmployeeAddressInfo(selectedId, payload);
        } catch (e: unknown) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status === 409) {
            await apiClient.updateEmployeeAddressInfo(selectedId, payload);
          } else {
            throw e;
          }
        }
      } else {
        await apiClient.updateEmployeeAddressInfo(selectedId, payload);
      }
      await loadDetail(selectedId);
      alert(t('employees.address.saved'));
    } catch (e) {
      const msg = parseApiErrorMessage(e, t('employees.address.saveError'));
      alert(msg);
    } finally {
      setSavingBasic(false);
    }
  }

  async function saveForeignerServer() {
    if (!canEditExtension || selectedId == null) return;
    const payload = foreignerDraftToApi(foreignerDraft);
    setSavingBasic(true);
    try {
      if (foreignerRecordId == null) {
        try {
          await apiClient.createEmployeeForeignerInfo(selectedId, payload);
        } catch (e: unknown) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status === 409) {
            await apiClient.updateEmployeeForeignerInfo(selectedId, payload);
          } else {
            throw e;
          }
        }
      } else {
        await apiClient.updateEmployeeForeignerInfo(selectedId, payload);
      }
      await loadDetail(selectedId);
      alert(t('employees.foreigner.saved'));
    } catch (e) {
      const msg = parseApiErrorMessage(e, t('employees.foreigner.saveError'));
      alert(msg);
    } finally {
      setSavingBasic(false);
    }
  }

  if (loading || permLoading) {
    return (
      <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>
    );
  }

  if (!allowRead) {
    return (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-10 text-center text-sm text-amber-950"
        role="alert"
      >
        {t('permission.noAccess')}
      </div>
    );
  }

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'basic', label: t('employees.tab.basic') },
    { key: 'personal', label: t('employees.tab.personal') },
    { key: 'foreigner', label: t('employees.tab.foreigner') },
    { key: 'education', label: t('employees.tab.education') },
    { key: 'career', label: t('employees.tab.career') },
    { key: 'certification', label: t('employees.tab.certification') },
    { key: 'language', label: t('employees.tab.language') },
    { key: 'family', label: t('employees.tab.family') },
    { key: 'address', label: t('employees.tab.address') },
  ];

  const personalLocked = uiMode === 'browse' || !canEditExtension;
  const personalFieldCls =
    'w-full border border-gray-200 rounded px-2 py-1.5 text-xs disabled:bg-gray-100 disabled:text-gray-600';
  const personalLabelCls = 'w-36 shrink-0 text-xs font-medium text-gray-700 pt-1.5';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-stretch min-h-0 lg:min-h-[min(560px,calc(100vh-7.5rem))]">
        {/* 목록 */}
        <aside
          className={cn(
            'lg:col-span-4 flex flex-col bg-white rounded-lg shadow border border-gray-200 overflow-hidden',
            uiMode !== 'browse' && 'opacity-60 pointer-events-none'
          )}
        >
          <div className="p-3 md:p-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('employees.listTitle')}</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-[11px] font-medium text-gray-600 whitespace-nowrap">{t('employees.field.company')}</p>
                <select
                  className="w-full min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={selectedCompanyId ?? ''}
                onChange={(e) => {
                  const nextId = e.target.value ? Number(e.target.value) : null;
                  setSelectedCompanyId(nextId);
                  setSelectedId(null);
                  setDetail(null);
                  setUiMode('browse');
                  setDetailTab('basic');
                  setSearchTerm('');
                  setSearchInput('');
                  setColumnFilters({ name: [], employeeNumber: [], department: [], position: [], status: [] });
                  setFamilyRows([]);
                  setCareerRows([]);
                  setPersonalRecordId(null);
                  setPersonalDraft(emptyPersonalDraft());
      setCertificationRows([]);
      setLanguageRows([]);
                  setAddressRecordId(null);
                  setAddressDraft(emptyAddressDraft());
                  setForeignerRecordId(null);
                  setForeignerDraft(emptyForeignerDraft());
                  setLoading(true);
                  setEmployees([]);
                  void fetchEmployees(nextId);
                }}
              >
                <option value="">{t('employees.companyFilter.all')}</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {locale === 'ko'
                      ? c.name_kor || c.name_eng || c.name_thai || c.company_code
                      : locale === 'en'
                        ? c.name_eng || c.name_kor || c.name_thai || c.company_code
                        : c.name_thai || c.name_kor || c.name_eng || c.company_code}
                  </option>
                ))}
                </select>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-[11px] font-medium text-gray-600 whitespace-nowrap">
                  {t('employees.filter.status')}
                </p>
                <select
                  className="w-full min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={employmentStatusFilter}
                  onChange={(e) =>
                    setEmploymentStatusFilter(
                      e.target.value === 'terminated'
                        ? 'terminated'
                        : e.target.value === 'all'
                          ? 'all'
                          : 'active'
                    )
                  }
                >
                  <option value="active">{t('employees.status.active')}</option>
                  <option value="terminated">{t('employees.status.terminated')}</option>
                  <option value="all">{t('employees.filter.status.all')}</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder={t('employees.searchPlaceholder')}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <span className="shrink-0 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {t('employees.list.count').replace('{count}', String(sortedFiltered.length))}
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto max-h-[min(480px,calc(100vh-14rem))] lg:max-h-[calc(100vh-7.5rem)]">
            {sortedFiltered.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 text-center">{t('employees.selectHint')}</p>
            ) : (
              <>
                <div className="sticky top-0 z-10 bg-gray-50 border-y border-gray-200 px-4 py-2 text-[11px] font-semibold text-gray-600 flex items-center gap-2">
                  <span className="w-10 shrink-0 text-center">{t('employees.list.field.no')}</span>
                  <span className="text-gray-300">|</span>
                  {([
                    ['name', t('employees.list.field.name'), 'min-w-0 flex-[1.1] truncate'] as const,
                    ['employeeNumber', t('employees.field.employeeNumber'), 'min-w-0 flex-1 truncate'] as const,
                    ['department', t('employees.field.department'), 'min-w-0 flex-1 truncate'] as const,
                    ['position', t('employees.field.position'), 'min-w-0 flex-1 truncate'] as const,
                    ['status', t('employees.list.field.status'), 'ml-auto shrink-0'] as const,
                  ] as const).map(([key, label, cls], idx) => {
                    const selectedList = columnFilters[key];
                    const hasFilter = selectedList.length > 0;
                    const values = listFilterValues[key];
                    return (
                      <div key={key} className={cn('relative flex items-center gap-1', cls)}>
                        <span className="truncate">{label}</span>
                        <button
                          type="button"
                          className={cn(
                            'p-0.5 rounded hover:bg-gray-200',
                            hasFilter ? 'text-blue-600' : 'text-gray-400'
                          )}
                          onClick={() => setOpenFilterKey((prev) => (prev === key ? null : key))}
                          title={t('appList.filter.title')}
                        >
                          <Filter className="w-3.5 h-3.5" />
                        </button>
                        {openFilterKey === key && (
                          <div
                            ref={filterPopoverRef}
                            className="absolute top-5 left-0 z-20 w-60 rounded-md border border-gray-200 bg-white shadow-lg p-2"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between pb-1 border-b border-gray-100 mb-1">
                              <span className="text-xs font-medium text-gray-700">{label}</span>
                              <button
                                type="button"
                                className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                                onClick={() => setOpenFilterKey(null)}
                                aria-label={t('system.close')}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="max-h-40 overflow-auto space-y-1">
                              {values.length === 0 ? (
                                <p className="px-2 py-1 text-xs text-gray-500">{t('appList.filter.noValues')}</p>
                              ) : (
                                values.map((val) => (
                                  <label key={val} className="flex items-center gap-2 px-1 py-0.5 text-xs text-gray-700">
                                    <input
                                      type="checkbox"
                                      className="rounded border-gray-300"
                                      checked={selectedList.includes(val)}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={() => toggleColumnFilterValue(key, val)}
                                    />
                                    <span className="truncate">{val}</span>
                                  </label>
                                ))
                              )}
                            </div>
                            <div className="mt-1 pt-1 border-t border-gray-100 flex items-center justify-between">
                              <button
                                type="button"
                                className="text-[11px] text-gray-600 hover:text-gray-900"
                                onClick={() => setColumnFilters((prev) => ({ ...prev, [key]: [] }))}
                              >
                                {t('system.rgm.clearAll')}
                              </button>
                              <span className="text-[11px] text-gray-500">
                                {t('appList.filter.selectedCount').replace('{count}', String(selectedList.length))}
                              </span>
                            </div>
                          </div>
                        )}
                        {idx < 4 && <span className="text-gray-300">|</span>}
                      </div>
                    );
                  })}
                </div>
              <ul className="divide-y divide-gray-100">
                {pagedSortedFiltered.map((row, idx) => {
                  const emp = row.emp;
                  const active = selectedId === emp.id;
                  const rowNo = (safeListPage - 1) * LIST_PAGE_SIZE + idx + 1;
                  return (
                    <li key={emp.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (uiMode !== 'browse') {
                            alert(t('employees.toolbar.finishEditFirst'));
                            return;
                          }
                          setSelectedId(emp.id);
                        }}
                        className={cn(
                          'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors',
                          active ? 'bg-primary-50 border-l-4 border-primary-600' : 'hover:bg-gray-50 border-l-4 border-transparent'
                        )}
                      >
                        <span className="w-10 shrink-0 text-center text-xs text-gray-500 font-medium">{rowNo}</span>
                        <div className="min-w-0 flex-1 flex items-center gap-2 text-xs whitespace-nowrap overflow-hidden">
                          <div className="mt-0.5 p-1.5 rounded-full bg-gray-100 text-gray-600">
                            <User className="w-4 h-4" />
                          </div>
                          <span className="font-medium text-base text-gray-900 truncate max-w-[180px]">{emp.name}</span>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-500 truncate">{emp.employee_number || '-'}</span>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-600 truncate">
                            {(getDepartmentText(emp) || '-') + ' · ' + (getPositionText(emp) || '-')}
                          </span>
                          <span
                            className={cn(
                              'inline-block ml-auto px-2 py-0.5 text-xs rounded-full shrink-0',
                              emp.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                            )}
                          >
                            {statusLabel(emp.status)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  className="px-2 py-1 border border-gray-300 rounded disabled:opacity-50"
                  disabled={safeListPage <= 1}
                  onClick={() => setListPage((p) => Math.max(1, p - 1))}
                >
                  {t('common.prev')}
                </button>
                <span className="text-gray-600">
                  {safeListPage} / {listTotalPages}
                </span>
                <button
                  type="button"
                  className="px-2 py-1 border border-gray-300 rounded disabled:opacity-50"
                  disabled={safeListPage >= listTotalPages}
                  onClick={() => setListPage((p) => Math.min(listTotalPages, p + 1))}
                >
                  {t('common.next')}
                </button>
              </div>
              </>
            )}
          </div>
        </aside>

        {/* 상세 — 툴바 + 탭; 기본정보는 레거시 HR 스타일 폼 */}
        <section className="lg:col-span-8 flex flex-col bg-white rounded-lg shadow border border-gray-200 min-h-0 max-h-[min(100vh-7rem,920px)] lg:max-h-[calc(100vh-7.5rem)]">
          <div className="px-3 md:px-4 pt-3 md:pt-4 shrink-0">
            <HrMasterToolbar
              mode={uiMode}
              listLength={sortedFiltered.length}
              selectedIndex={selectedIndex}
              saving={savingBasic}
              allowAdd={allowAdd}
              allowEdit={allowEdit}
              allowDelete={allowDelete}
              allowSave={allowSave}
              onAdd={handleToolbarAdd}
              onEdit={handleToolbarEdit}
              onDelete={() => void handleToolbarDelete()}
              onSave={() => void handleToolbarSave()}
              onCancel={() => void handleToolbarCancel()}
              onFirst={handleFirst}
              onPrev={handlePrev}
              onNext={handleNext}
              onLast={handleLast}
              t={t}
            />
          </div>
          <div className="px-4 md:px-6 pt-2 md:pt-3 pb-0 border-b border-gray-100 shrink-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2 min-h-0">
              {uiMode === 'new' ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <h2 className="text-base sm:text-lg font-bold text-gray-900">{t('employees.toolbar.newRecord')}</h2>
                  <span className="text-[11px] text-gray-500">{t('employees.toolbar.newRecordHintShort')}</span>
                </div>
              ) : detailReady ? (
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{detail!.name}</h2>
                  <p className="text-sm text-gray-500">
                    {(detail!.company_id != null ? companyById.get(detail!.company_id) : undefined) ?? '-'} ·{' '}
                    {detail!.employee_number} · {formatDate(detail!.hire_date)} · {statusLabel(detail!.status)}
                  </p>
                </div>
              ) : selectedId != null && detailLoading ? (
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedListRow?.name ?? '—'}
                  </h2>
                  <p className="text-sm text-gray-500">{t('common.loading')}</p>
                </div>
              ) : (
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{t('employees.detailPanel')}</h2>
                  <p className="text-sm text-gray-500">{t('employees.subtitle')}</p>
                </div>
              )}
            </div>
            <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist" aria-label={t('employees.detailPanel')}>
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={detailTab === tab.key}
                  onClick={() => setDetailTab(tab.key)}
                  className={cn(
                    'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                    detailTab === tab.key
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 min-h-0 p-3 md:p-4 overflow-y-auto">
            {detailTab === 'basic' && !showGeneralForm && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-gray-500 text-center text-sm">
                {selectedId != null && detailLoading ? (
                  <p>{t('common.loading')}</p>
                ) : (
                  <p>{t('employees.selectHint')}</p>
                )}
              </div>
            )}
            {detailTab === 'basic' && showGeneralForm && (
              <EmployeeGeneralForm
                locked={
                  uiMode === 'browse' ||
                  (uiMode === 'edit' && !allowEdit) ||
                  (uiMode === 'new' && !allowAdd)
                }
                emailReadOnly={uiMode !== 'new'}
                isNewRecord={uiMode === 'new'}
                recordDatabaseId={uiMode === 'new' ? null : detail?.id ?? null}
                core={generalCore}
                setCore={setGeneralCore}
                ext={masterExt}
                setExt={setMasterExt}
                t={t}
                companyOptions={companyOptions}
                orgReferenceOptions={orgReferenceOptions}
                referenceCrud={referenceCrud}
                onReferenceDataChanged={invalidateReferenceOptions}
              />
            )}

            {detailTab === 'education' && (uiMode === 'new' || !detailReady) && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-amber-800 text-center text-sm bg-amber-50 rounded-lg border border-amber-100">
                {t('employees.toolbar.needEmployeeForTabs')}
              </div>
            )}

            {detailTab === 'education' && detailReady && detail && (
              <EmployeeEducationPanel
                employeeId={detail.id}
                companyId={detail.company_id ?? null}
                activityStudy={detail.education_activity_study}
                certificate={detail.education_certificate}
                locked={uiMode === 'browse' || !canEditExtension}
                t={t}
                onSaved={() => selectedId != null && void loadDetail(selectedId)}
                onBindToolbarActions={setEducationToolbarActions}
              />
            )}

            {detailTab === 'family' && (uiMode === 'new' || !detailReady) && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-amber-800 text-center text-sm bg-amber-50 rounded-lg border border-amber-100">
                {t('employees.toolbar.needEmployeeForTabs')}
              </div>
            )}

            {detailTab === 'family' && detailReady && detail && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={addFamilyRow}
                        disabled={!canEditExtension}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:pointer-events-none"
                      >
                        {t('employees.family.add')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveFamilyServer()}
                        disabled={!canEditExtension || savingBasic}
                        className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:pointer-events-none"
                      >
                        {t('employees.family.save')}
                      </button>
                    </div>
                    {familyRows.length === 0 ? (
                      <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-200 rounded-lg">
                        {t('employees.family.empty')}
                      </p>
                    ) : (
                      <div className="overflow-x-auto border border-gray-300 rounded-md bg-white">
                        <table className="min-w-[920px] w-full border-collapse text-xs">
                          <thead>
                            <tr>
                              <th rowSpan={2} className={cn(familyThGroup, 'w-10 px-1')}>
                                {t('employees.education.col.no')}
                              </th>
                              <th colSpan={3} className={familyThGroup}>
                                {t('employees.family.group.basicInfo')}
                              </th>
                              <th colSpan={2} className={familyThGroup}>
                                {t('employees.family.group.profile')}
                              </th>
                              <th colSpan={3} className={familyThGroup}>
                                {t('employees.family.group.career')}
                              </th>
                              <th rowSpan={2} className={cn(familyThGroup, 'min-w-[5rem]')}>
                                {t('employees.family.col.remarks')}
                              </th>
                              <th
                                rowSpan={2}
                                className={cn(familyThGroup, 'w-12 min-w-[3rem]')}
                                aria-label={t('employees.family.remove')}
                              />
                            </tr>
                            <tr>
                              <th className={familyThSub}>{t('employees.family.col.name')}</th>
                              <th className={familyThSub}>{t('employees.family.col.relation')}</th>
                              <th className={familyThSub}>{t('employees.family.col.residentNumber')}</th>
                              <th className={familyThSub}>{t('employees.family.col.domesticForeign')}</th>
                              <th className={familyThSub}>{t('employees.family.col.highestEducation')}</th>
                              <th className={familyThSub}>{t('employees.family.col.occupation')}</th>
                              <th className={familyThSub}>{t('employees.family.col.workplace')}</th>
                              <th className={familyThSub}>{t('employees.family.col.position')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {familyRows.map((row, idx) => (
                              <tr
                                key={row.rowKey}
                                className={cn(idx % 2 === 0 ? 'bg-white' : 'bg-rose-50/40')}
                              >
                                <td className="border border-gray-200 px-1 py-0.5 text-center font-mono text-gray-700">
                                  {idx + 1}
                                </td>
                                <td className="border border-gray-200 p-0.5">
                                  <input
                                    className={familyInputCls}
                                    value={row.name}
                                    disabled={!canEditExtension}
                                    onChange={(e) => updateFamily(row.rowKey, { name: e.target.value })}
                                  />
                                </td>
                                <td className="border border-gray-200 p-0.5">
                                  <input
                                    className={familyInputCls}
                                    value={row.relation}
                                    disabled={!canEditExtension}
                                    onChange={(e) => updateFamily(row.rowKey, { relation: e.target.value })}
                                  />
                                </td>
                                <td className="border border-gray-200 p-0.5 min-w-[20ch]">
                                  <input
                                    className={cn(familyInputCls, 'min-w-[20ch] max-w-[24rem] font-mono')}
                                    value={row.resident_number}
                                    disabled={!canEditExtension}
                                    onChange={(e) => updateFamily(row.rowKey, { resident_number: e.target.value })}
                                  />
                                </td>
                                <td className="border border-gray-200 p-0.5">
                                  <select
                                    className={cn(familyInputCls, 'min-w-[5.5rem] bg-white')}
                                    value={row.domestic_foreign}
                                    disabled={!canEditExtension}
                                    onChange={(e) => updateFamily(row.rowKey, { domestic_foreign: e.target.value })}
                                  >
                                    <option value="domestic">{t('employees.family.domestic')}</option>
                                    <option value="foreign">{t('employees.family.foreign')}</option>
                                  </select>
                                </td>
                                <td className="border border-gray-200 p-0.5">
                                  <input
                                    className={familyInputCls}
                                    value={row.highest_education}
                                    disabled={!canEditExtension}
                                    onChange={(e) => updateFamily(row.rowKey, { highest_education: e.target.value })}
                                  />
                                </td>
                                <td className="border border-gray-200 p-0.5">
                                  <input
                                    className={familyInputCls}
                                    value={row.occupation}
                                    disabled={!canEditExtension}
                                    onChange={(e) => updateFamily(row.rowKey, { occupation: e.target.value })}
                                  />
                                </td>
                                <td className="border border-gray-200 p-0.5">
                                  <input
                                    className={familyInputCls}
                                    value={row.workplace}
                                    disabled={!canEditExtension}
                                    onChange={(e) => updateFamily(row.rowKey, { workplace: e.target.value })}
                                  />
                                </td>
                                <td className="border border-gray-200 p-0.5">
                                  <input
                                    className={familyInputCls}
                                    value={row.position}
                                    disabled={!canEditExtension}
                                    onChange={(e) => updateFamily(row.rowKey, { position: e.target.value })}
                                  />
                                </td>
                                <td className="border border-gray-200 p-0.5">
                                  <input
                                    className={familyInputCls}
                                    value={row.support_reason}
                                    disabled={!canEditExtension}
                                    onChange={(e) => updateFamily(row.rowKey, { support_reason: e.target.value })}
                                  />
                                </td>
                                <td className="border border-gray-200 px-1 py-0.5 text-center align-middle">
                                  <button
                                    type="button"
                                    className="text-[10px] text-red-600 hover:underline disabled:opacity-40 disabled:pointer-events-none"
                                    disabled={!canEditExtension}
                                    onClick={() => removeFamily(row.rowKey)}
                                  >
                                    {t('employees.family.remove')}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

            {detailTab === 'career' && (uiMode === 'new' || !detailReady) && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-amber-800 text-center text-sm bg-amber-50 rounded-lg border border-amber-100">
                {t('employees.toolbar.needEmployeeForTabs')}
              </div>
            )}

            {detailTab === 'career' && detailReady && detail && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-1">
                  {t('employees.career.recordTitle')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addCareerRow}
                    disabled={!canEditExtension}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {t('employees.career.add')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCareerServer()}
                    disabled={!canEditExtension || savingBasic}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {t('employees.career.save')}
                  </button>
                </div>
                {careerRows.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-200 rounded-lg">
                    {t('employees.career.empty')}
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-gray-300 rounded-md bg-white">
                    <table className="min-w-[1100px] w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th rowSpan={2} className={cn(familyThGroup, 'w-10 px-1')}>
                            {t('employees.education.col.no')}
                          </th>
                          <th colSpan={2} className={familyThGroup}>
                            {t('employees.career.group.positionWork')}
                          </th>
                          <th colSpan={2} className={familyThGroup}>
                            {t('employees.career.group.dates')}
                          </th>
                          <th colSpan={2} className={familyThGroup}>
                            {t('employees.career.group.companyAddr')}
                          </th>
                          <th colSpan={2} className={familyThGroup}>
                            {t('employees.career.group.telBeginSalary')}
                          </th>
                          <th colSpan={2} className={familyThGroup}>
                            {t('employees.career.group.resignSalaries')}
                          </th>
                          <th rowSpan={2} className={cn(familyThGroup, 'min-w-[6rem]')}>
                            {t('employees.career.col.tenure')}
                          </th>
                          <th
                            rowSpan={2}
                            className={cn(familyThGroup, 'w-12 min-w-[3rem]')}
                            aria-label={t('employees.family.remove')}
                          />
                        </tr>
                        <tr>
                          <th className={familyThSub}>{t('employees.career.col.positionTitle')}</th>
                          <th className={familyThSub}>{t('employees.career.col.workDetails')}</th>
                          <th className={familyThSub}>{t('employees.career.col.enterDate')}</th>
                          <th className={familyThSub}>{t('employees.career.col.resignedDate')}</th>
                          <th className={familyThSub}>{t('employees.career.col.companyName')}</th>
                          <th className={familyThSub}>{t('employees.career.col.address')}</th>
                          <th className={familyThSub}>{t('employees.career.col.telephone')}</th>
                          <th className={familyThSub}>{t('employees.career.col.beginSalary')}</th>
                          <th className={familyThSub}>{t('employees.career.col.resignationReason')}</th>
                          <th className={familyThSub}>{t('employees.career.col.latestSalary')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {careerRows.map((row, idx) => (
                          <tr
                            key={row.rowKey}
                            className={cn(idx % 2 === 0 ? 'bg-white' : 'bg-rose-50/40')}
                          >
                            <td className="border border-gray-200 px-1 py-0.5 text-center font-mono text-gray-700">
                              {idx + 1}
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.position_title}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { position_title: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.work_details}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { work_details: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                type="date"
                                className={familyInputCls}
                                value={row.enter_date}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { enter_date: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                type="date"
                                className={familyInputCls}
                                value={row.resigned_date}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { resigned_date: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.company_name}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { company_name: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.address}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { address: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.telephone}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { telephone: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.begin_salary}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { begin_salary: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.resignation_reason}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { resignation_reason: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.latest_salary}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { latest_salary: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.tenure_text}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCareer(row.rowKey, { tenure_text: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 px-1 py-0.5 text-center align-middle">
                              <button
                                type="button"
                                className="text-[10px] text-red-600 hover:underline disabled:opacity-40 disabled:pointer-events-none"
                                disabled={!canEditExtension}
                                onClick={() => removeCareer(row.rowKey)}
                              >
                                {t('employees.family.remove')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {detailTab === 'personal' && (uiMode === 'new' || !detailReady) && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-amber-800 text-center text-sm bg-amber-50 rounded-lg border border-amber-100">
                {t('employees.toolbar.needEmployeeForTabs')}
              </div>
            )}

            {detailTab === 'personal' && detailReady && detail && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void savePersonalServer()}
                    disabled={personalLocked || savingBasic}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {t('employees.personal.save')}
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                  <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
                    <div className="px-3 py-2 text-sm font-semibold text-gray-800 border-b border-gray-300 bg-rose-50/80">
                      {t('employees.personal.leftLegend')}
                    </div>
                    <div className="p-3 space-y-2.5">
                      {(
                        [
                          ['nickname', t('employees.personal.field.nickname')],
                          ['place_of_birth', t('employees.personal.field.placeOfBirth')],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="flex gap-2 items-start">
                          <label className={personalLabelCls}>{label}</label>
                          <input
                            className={personalFieldCls}
                            disabled={personalLocked}
                            value={personalDraft[key]}
                            onChange={(e) =>
                              setPersonalDraft((d) => ({ ...d, [key]: e.target.value }))
                            }
                          />
                        </div>
                      ))}
                      <div className="flex gap-2 items-start">
                        <span className={personalLabelCls}>{t('employees.personal.field.heightWeight')}</span>
                        <div className="flex flex-1 gap-2 items-center">
                          <input
                            type="number"
                            min={0}
                            className={cn(personalFieldCls, 'flex-1')}
                            disabled={personalLocked}
                            placeholder="cm"
                            value={personalDraft.height_cm}
                            onChange={(e) =>
                              setPersonalDraft((d) => ({ ...d, height_cm: e.target.value }))
                            }
                          />
                          <input
                            type="number"
                            min={0}
                            className={cn(personalFieldCls, 'flex-1')}
                            disabled={personalLocked}
                            placeholder="kg"
                            value={personalDraft.weight_kg}
                            onChange={(e) =>
                              setPersonalDraft((d) => ({ ...d, weight_kg: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                      {(
                        [
                          ['race', t('employees.personal.field.race')],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="flex gap-2 items-start">
                          <label className={personalLabelCls}>{label}</label>
                          <input
                            className={personalFieldCls}
                            disabled={personalLocked}
                            value={personalDraft[key]}
                            onChange={(e) =>
                              setPersonalDraft((d) => ({ ...d, [key]: e.target.value }))
                            }
                          />
                        </div>
                      ))}
                      {(
                        [
                          ['nationality', t('employees.personal.field.nationality')],
                          ['religion', t('employees.personal.field.religion')],
                        ] as const
                      ).map(([key, label]) => {
                        const field = key as PersonalMinorField;
                        const majorId = personalMajorIdByField[field];
                        const opts = personalMinorOptionsByField[field];
                        const canMinorSelect = majorId != null;
                        return (
                          <div key={key} className="flex gap-2 items-start">
                            <label className={personalLabelCls}>{label}</label>
                            <div className="flex-1 min-w-0">
                              {canMinorSelect ? (
                                <div className="flex gap-0.5 items-stretch">
                                  <select
                                    className={cn(personalFieldCls, 'min-w-0 flex-1')}
                                    disabled={personalLocked}
                                    value={personalDraft[key]}
                                    onChange={(e) =>
                                      setPersonalDraft((d) => ({ ...d, [key]: e.target.value }))
                                    }
                                  >
                                    <option value="">{t('employees.general.selectPlaceholder')}</option>
                                    {opts.map((o) => (
                                      <option key={o.id} value={o.minor_code}>
                                        {pickMinorLabelForLocale(o)}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="shrink-0 px-1 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                                    disabled={personalLocked}
                                    onClick={() => {
                                      setPersonalPickerField(field);
                                      setPersonalPickerOpen(true);
                                    }}
                                    title={t('employees.general.refSearchOpen')}
                                    aria-label={t('employees.general.refSearchOpen')}
                                  >
                                    <Search className="w-3.5 h-3.5 text-gray-600" />
                                  </button>
                                </div>
                              ) : (
                                <input
                                  className={personalFieldCls}
                                  disabled={personalLocked}
                                  value={personalDraft[key]}
                                  onChange={(e) =>
                                    setPersonalDraft((d) => ({ ...d, [key]: e.target.value }))
                                  }
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex gap-2 items-start">
                        <label className={personalLabelCls}>{t('employees.personal.field.bloodGroup')}</label>
                        <select
                          className={personalFieldCls}
                          disabled={personalLocked}
                          value={personalDraft.blood_group}
                          onChange={(e) =>
                            setPersonalDraft((d) => ({ ...d, blood_group: e.target.value }))
                          }
                        >
                          <option value="">{t('employees.personal.selectPlaceholder')}</option>
                          {BLOOD_GROUP_OPTIONS.filter((x) => x !== '').map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                      {(
                        [
                          ['personal_tel', t('employees.personal.field.tel')],
                          ['personal_email', t('employees.personal.field.email')],
                          ['website', t('employees.personal.field.website')],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="flex gap-2 items-start">
                          <label className={personalLabelCls}>{label}</label>
                          <input
                            className={personalFieldCls}
                            disabled={personalLocked}
                            value={personalDraft[key]}
                            onChange={(e) =>
                              setPersonalDraft((d) => ({ ...d, [key]: e.target.value }))
                            }
                          />
                        </div>
                      ))}
                      <div className="flex gap-2 items-start">
                        <label className={personalLabelCls}>{t('employees.personal.field.military')}</label>
                        <select
                          className={personalFieldCls}
                          disabled={personalLocked}
                          value={personalDraft.military_status}
                          onChange={(e) =>
                            setPersonalDraft((d) => ({ ...d, military_status: e.target.value }))
                          }
                        >
                          <option value="">{t('employees.personal.selectPlaceholder')}</option>
                          {MILITARY_CODES.filter((c) => c !== '').map((c) => (
                            <option key={c} value={c}>
                              {t(`employees.personal.military.${c}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2 items-start">
                        <label className={personalLabelCls}>{t('employees.personal.field.notes')}</label>
                        <textarea
                          rows={4}
                          className={personalFieldCls}
                          disabled={personalLocked}
                          value={personalDraft.personal_notes}
                          onChange={(e) =>
                            setPersonalDraft((d) => ({ ...d, personal_notes: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
                      <div className="px-3 py-2 text-sm font-semibold text-gray-800 border-b border-gray-300 bg-rose-50/80">
                        {t('employees.personal.rightLegend')}
                      </div>
                      <div className="p-3 space-y-2.5">
                        {(
                          [
                            ['hobby', t('employees.personal.field.hobby')],
                            ['sports', t('employees.personal.field.sports')],
                          ] as const
                        ).map(([key, label]) => (
                          <div key={key} className="flex gap-2 items-start">
                            <label className={personalLabelCls}>{label}</label>
                            <input
                              className={personalFieldCls}
                              disabled={personalLocked}
                              value={personalDraft[key]}
                              onChange={(e) =>
                                setPersonalDraft((d) => ({ ...d, [key]: e.target.value }))
                              }
                            />
                          </div>
                        ))}
                        <div className="flex gap-2 items-start">
                          <label className={personalLabelCls}>{t('employees.personal.field.typing')}</label>
                          <div className="flex flex-1 items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              className={cn(personalFieldCls, 'w-20 shrink-0')}
                              disabled={personalLocked}
                              value={personalDraft.typing_thai_wpm}
                              onChange={(e) =>
                                setPersonalDraft((d) => ({ ...d, typing_thai_wpm: e.target.value }))
                              }
                            />
                            <span className="text-gray-500 text-xs">/</span>
                            <input
                              type="number"
                              min={0}
                              className={cn(personalFieldCls, 'w-20 shrink-0')}
                              disabled={personalLocked}
                              value={personalDraft.typing_english_wpm}
                              onChange={(e) =>
                                setPersonalDraft((d) => ({ ...d, typing_english_wpm: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
                      <div className="px-3 py-2 text-sm font-semibold text-gray-800 border-b border-gray-300 bg-rose-50/80">
                        {t('employees.personal.licenseLegend')}
                      </div>
                      <div className="p-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-3 justify-between">
                          <label className="flex items-center gap-2 text-xs text-gray-800">
                            <input
                              type="checkbox"
                              disabled={personalLocked}
                              checked={personalDraft.has_driving_license}
                              onChange={(e) =>
                                setPersonalDraft((d) => ({
                                  ...d,
                                  has_driving_license: e.target.checked,
                                }))
                              }
                            />
                            {t('employees.personal.field.drivingLicense')}
                          </label>
                          <div className="flex items-center gap-2 flex-1 min-w-[12rem]">
                            <span className="text-xs text-gray-600 whitespace-nowrap">
                              {t('employees.personal.field.licenseNumb')}
                            </span>
                            <input
                              className={personalFieldCls}
                              disabled={personalLocked || !personalDraft.has_driving_license}
                              value={personalDraft.driving_license_number}
                              onChange={(e) =>
                                setPersonalDraft((d) => ({
                                  ...d,
                                  driving_license_number: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <label className="flex items-center gap-2 text-xs text-gray-800">
                            <input
                              type="checkbox"
                              disabled={personalLocked}
                              checked={personalDraft.own_car}
                              onChange={(e) =>
                                setPersonalDraft((d) => ({ ...d, own_car: e.target.checked }))
                              }
                            />
                            {t('employees.personal.field.ownCar')}
                          </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 justify-between">
                          <label className="flex items-center gap-2 text-xs text-gray-800">
                            <input
                              type="checkbox"
                              disabled={personalLocked}
                              checked={personalDraft.has_motorcycle_license}
                              onChange={(e) =>
                                setPersonalDraft((d) => ({
                                  ...d,
                                  has_motorcycle_license: e.target.checked,
                                }))
                              }
                            />
                            {t('employees.personal.field.motorcycleLicense')}
                          </label>
                          <div className="flex items-center gap-2 flex-1 min-w-[12rem]">
                            <span className="text-xs text-gray-600 whitespace-nowrap">
                              {t('employees.personal.field.licenseNumb')}
                            </span>
                            <input
                              className={personalFieldCls}
                              disabled={personalLocked || !personalDraft.has_motorcycle_license}
                              value={personalDraft.motorcycle_license_number}
                              onChange={(e) =>
                                setPersonalDraft((d) => ({
                                  ...d,
                                  motorcycle_license_number: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <label className="flex items-center gap-2 text-xs text-gray-800">
                            <input
                              type="checkbox"
                              disabled={personalLocked}
                              checked={personalDraft.own_motorcycle}
                              onChange={(e) =>
                                setPersonalDraft((d) => ({
                                  ...d,
                                  own_motorcycle: e.target.checked,
                                }))
                              }
                            />
                            {t('employees.personal.field.ownMotorcycle')}
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {detailTab === 'foreigner' && (uiMode === 'new' || !detailReady) && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-amber-800 text-center text-sm bg-amber-50 rounded-lg border border-amber-100">
                {t('employees.toolbar.needEmployeeForTabs')}
              </div>
            )}

            {detailTab === 'foreigner' && detailReady && detail && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveForeignerServer()}
                    disabled={personalLocked || savingBasic}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {t('employees.foreigner.save')}
                  </button>
                </div>

                <div className="rounded-md border border-gray-300 bg-white p-3 space-y-4">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                    <input
                      type="checkbox"
                      disabled={personalLocked}
                      checked={foreignerDraft.is_foreigner}
                      onChange={(e) =>
                        setForeignerDraft((d) => ({ ...d, is_foreigner: e.target.checked }))
                      }
                    />
                    {t('employees.foreigner.isForeigner')}
                  </label>

                  {(
                    [
                      {
                        title: t('employees.foreigner.section.passport'),
                        numberKey: 'passport_number',
                        issuePlaceKey: 'passport_issue_place',
                        issueDateKey: 'passport_issue_date',
                        expireDateKey: 'passport_expire_date',
                        noteKey: 'passport_note',
                      },
                      {
                        title: t('employees.foreigner.section.visa'),
                        numberKey: 'visa_number',
                        issuePlaceKey: 'visa_issue_place',
                        issueDateKey: 'visa_issue_date',
                        expireDateKey: 'visa_expire_date',
                        noteKey: 'visa_note',
                      },
                      {
                        title: t('employees.foreigner.section.workPermit'),
                        numberKey: 'work_permit_number',
                        issuePlaceKey: 'work_permit_issue_place',
                        issueDateKey: 'work_permit_issue_date',
                        expireDateKey: 'work_permit_expire_date',
                        noteKey: 'work_permit_note',
                      },
                    ] as const
                  ).map((section) => (
                    <div key={section.numberKey} className="border border-gray-200 rounded-md overflow-hidden">
                      <div className="px-3 py-2 text-sm font-semibold text-gray-800 border-b border-gray-200 bg-gray-50">
                        {section.title}
                      </div>
                      <div className="p-3 space-y-2.5">
                        <div className="flex gap-2 items-start">
                          <label className={personalLabelCls}>{t('employees.foreigner.field.number')}</label>
                          <input
                            className={personalFieldCls}
                            disabled={personalLocked}
                            value={foreignerDraft[section.numberKey]}
                            onChange={(e) =>
                              setForeignerDraft((d) => ({ ...d, [section.numberKey]: e.target.value }))
                            }
                          />
                        </div>
                        <div className="flex gap-2 items-start">
                          <label className={personalLabelCls}>{t('employees.foreigner.field.issuePlace')}</label>
                          <input
                            className={personalFieldCls}
                            disabled={personalLocked}
                            value={foreignerDraft[section.issuePlaceKey]}
                            onChange={(e) =>
                              setForeignerDraft((d) => ({ ...d, [section.issuePlaceKey]: e.target.value }))
                            }
                          />
                        </div>
                        <div className="flex gap-2 items-start">
                          <label className={personalLabelCls}>{t('employees.foreigner.field.issueDate')}</label>
                          <input
                            type="date"
                            className={personalFieldCls}
                            disabled={personalLocked}
                            value={foreignerDraft[section.issueDateKey]}
                            onChange={(e) =>
                              setForeignerDraft((d) => ({ ...d, [section.issueDateKey]: e.target.value }))
                            }
                          />
                        </div>
                        <div className="flex gap-2 items-start">
                          <label className={personalLabelCls}>{t('employees.foreigner.field.expireDate')}</label>
                          <input
                            type="date"
                            className={personalFieldCls}
                            disabled={personalLocked}
                            value={foreignerDraft[section.expireDateKey]}
                            onChange={(e) =>
                              setForeignerDraft((d) => ({ ...d, [section.expireDateKey]: e.target.value }))
                            }
                          />
                        </div>
                        <div className="flex gap-2 items-start">
                          <label className={personalLabelCls}>{t('employees.foreigner.field.note')}</label>
                          <textarea
                            rows={2}
                            className={personalFieldCls}
                            disabled={personalLocked}
                            value={foreignerDraft[section.noteKey]}
                            onChange={(e) =>
                              setForeignerDraft((d) => ({ ...d, [section.noteKey]: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailTab === 'certification' && (uiMode === 'new' || !detailReady) && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-amber-800 text-center text-sm bg-amber-50 rounded-lg border border-amber-100">
                {t('employees.toolbar.needEmployeeForTabs')}
              </div>
            )}

            {detailTab === 'certification' && detailReady && detail && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-1">
                  {t('employees.certification.recordTitle')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addCertificationRow}
                    disabled={!canEditExtension}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {t('employees.certification.add')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCertificationServer()}
                    disabled={!canEditExtension || savingBasic}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {t('employees.certification.save')}
                  </button>
                </div>
                {certificationRows.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-200 rounded-lg">
                    {t('employees.certification.empty')}
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-gray-300 rounded-md bg-white">
                    <table className="min-w-[1200px] w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className={cn(familyThGroup, 'w-10 px-1')}>{t('employees.education.col.no')}</th>
                          <th className={cn(familyThGroup, 'min-w-[7rem]')}>
                            {t('employees.certification.col.licenseCode')}
                          </th>
                          <th className={cn(familyThGroup, 'min-w-[10rem]')}>
                            {t('employees.certification.col.licenseType')}
                          </th>
                          <th className={cn(familyThGroup, 'min-w-[5rem]')}>{t('employees.certification.col.grade')}</th>
                          <th className={cn(familyThGroup, 'min-w-[7rem]')}>
                            {t('employees.certification.col.issuerCode')}
                          </th>
                          <th className={cn(familyThGroup, 'min-w-[8rem]')}>
                            {t('employees.certification.col.issuerName')}
                          </th>
                          <th className={cn(familyThGroup, 'min-w-[7rem]')}>
                            {t('employees.certification.col.acquiredDate')}
                          </th>
                          <th className={cn(familyThGroup, 'min-w-[7rem]')}>
                            {t('employees.certification.col.effectiveDate')}
                          </th>
                          <th className={cn(familyThGroup, 'min-w-[7rem]')}>
                            {t('employees.certification.col.nextRenewal')}
                          </th>
                          <th className={cn(familyThGroup, 'min-w-[8rem]')}>
                            {t('employees.certification.col.certificateNumber')}
                          </th>
                          <th className={cn(familyThGroup, 'w-12 min-w-[3rem]')} aria-label={t('employees.family.remove')} />
                        </tr>
                      </thead>
                      <tbody>
                        {certificationRows.map((row, idx) => (
                          <tr
                            key={row.rowKey}
                            className={cn(idx % 2 === 0 ? 'bg-white' : 'bg-rose-50/40')}
                          >
                            <td className="border border-gray-200 px-1 py-0.5 text-center font-mono text-gray-700">
                              {idx + 1}
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <div className="flex gap-0.5 items-stretch">
                                <select
                                  className={cn(familyInputCls, 'min-w-0 flex-1')}
                                  value={row.license_code}
                                  disabled={!canEditExtension}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (!v) {
                                      updateCertification(row.rowKey, {
                                        license_code: '',
                                        license_type_name: '',
                                        license_type_minor_code_id: null,
                                      });
                                      return;
                                    }
                                    const opt = certMinorOptionsByField.license_type.find((o) => o.minor_code === v);
                                    updateCertification(row.rowKey, {
                                      license_code: v,
                                      license_type_name: opt ? pickMinorLabelForLocale(opt) : row.license_type_name,
                                      license_type_minor_code_id: opt ? opt.id : null,
                                    });
                                  }}
                                >
                                  <option value=""></option>
                                  {certMinorOptionsByField.license_type.map((o) => (
                                    <option key={o.id} value={o.minor_code}>
                                      {o.minor_code} - {pickMinorLabelForLocale(o)}
                                    </option>
                                  ))}
                                  {row.license_code &&
                                    !certMinorOptionsByField.license_type.some((o) => o.minor_code === row.license_code) && (
                                      <option value={row.license_code}>{row.license_type_name || row.license_code}</option>
                                    )}
                                </select>
                                <button
                                  type="button"
                                  className="shrink-0 px-1 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                                  disabled={!canEditExtension}
                                  title={t('employees.certification.lookupHint')}
                                  aria-label={t('employees.certification.lookupHint')}
                                  onClick={() => openCertMinorPicker('license_type', row.rowKey)}
                                >
                                  <Search className="w-3.5 h-3.5 text-gray-600" />
                                </button>
                              </div>
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input className={familyInputCls} value={row.license_type_name} disabled />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.grade}
                                disabled={!canEditExtension}
                                onChange={(e) => updateCertification(row.rowKey, { grade: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <div className="flex gap-0.5 items-stretch">
                                <select
                                  className={cn(familyInputCls, 'min-w-0 flex-1')}
                                  value={row.issuer_code}
                                  disabled={!canEditExtension}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (!v) {
                                      updateCertification(row.rowKey, {
                                        issuer_code: '',
                                        issuer_name: '',
                                        issuer_minor_code_id: null,
                                      });
                                      return;
                                    }
                                    const opt = certMinorOptionsByField.issuer.find((o) => o.minor_code === v);
                                    updateCertification(row.rowKey, {
                                      issuer_code: v,
                                      issuer_name: opt ? pickMinorLabelForLocale(opt) : row.issuer_name,
                                      issuer_minor_code_id: opt ? opt.id : null,
                                    });
                                  }}
                                >
                                  <option value=""></option>
                                  {certMinorOptionsByField.issuer.map((o) => (
                                    <option key={o.id} value={o.minor_code}>
                                      {o.minor_code} - {pickMinorLabelForLocale(o)}
                                    </option>
                                  ))}
                                  {row.issuer_code &&
                                    !certMinorOptionsByField.issuer.some((o) => o.minor_code === row.issuer_code) && (
                                      <option value={row.issuer_code}>{row.issuer_name || row.issuer_code}</option>
                                    )}
                                </select>
                                <button
                                  type="button"
                                  className="shrink-0 px-1 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                                  disabled={!canEditExtension}
                                  title={t('employees.certification.lookupHint')}
                                  aria-label={t('employees.certification.lookupHint')}
                                  onClick={() => openCertMinorPicker('issuer', row.rowKey)}
                                >
                                  <Search className="w-3.5 h-3.5 text-gray-600" />
                                </button>
                              </div>
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input className={familyInputCls} value={row.issuer_name} disabled />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                type="date"
                                className={familyInputCls}
                                value={row.acquired_date}
                                disabled={!canEditExtension}
                                onChange={(e) =>
                                  updateCertification(row.rowKey, { acquired_date: e.target.value })
                                }
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                type="date"
                                className={familyInputCls}
                                value={row.effective_date}
                                disabled={!canEditExtension}
                                onChange={(e) =>
                                  updateCertification(row.rowKey, { effective_date: e.target.value })
                                }
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                type="date"
                                className={familyInputCls}
                                value={row.next_renewal_date}
                                disabled={!canEditExtension}
                                onChange={(e) =>
                                  updateCertification(row.rowKey, { next_renewal_date: e.target.value })
                                }
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                className={familyInputCls}
                                value={row.certificate_number}
                                disabled={!canEditExtension}
                                onChange={(e) =>
                                  updateCertification(row.rowKey, { certificate_number: e.target.value })
                                }
                              />
                            </td>
                            <td className="border border-gray-200 px-1 py-0.5 text-center align-middle">
                              <button
                                type="button"
                                className="text-[10px] text-red-600 hover:underline disabled:opacity-40 disabled:pointer-events-none"
                                disabled={!canEditExtension}
                                onClick={() => removeCertification(row.rowKey)}
                              >
                                {t('employees.family.remove')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {detailTab === 'language' && (uiMode === 'new' || !detailReady) && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-amber-800 text-center text-sm bg-amber-50 rounded-lg border border-amber-100">
                {t('employees.toolbar.needEmployeeForTabs')}
              </div>
            )}

            {detailTab === 'language' && detailReady && detail && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-1">
                  {t('employees.language.recordTitle')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addLanguageRow}
                    disabled={!canEditExtension}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {t('employees.language.add')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveLanguageServer()}
                    disabled={!canEditExtension || savingBasic}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {t('employees.language.save')}
                  </button>
                </div>
                {languageRows.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-200 rounded-lg">
                    {t('employees.language.empty')}
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-gray-300 rounded-md bg-white">
                    <table className="min-w-[900px] w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className={cn(familyThGroup, 'w-10 px-1')}>{t('employees.education.col.no')}</th>
                          <th className={cn(familyThGroup, 'min-w-[8rem]')}>
                            {t('employees.language.col.acquisitionDate')}
                          </th>
                          <th className={cn(familyThGroup, 'min-w-[8rem]')}>
                            {t('employees.language.col.language')}
                          </th>
                          <th className={cn(familyThGroup, 'min-w-[8rem]')}>
                            {t('employees.language.col.testType')}
                          </th>
                          <th className={cn(familyThGroup, 'min-w-[5rem]')}>{t('employees.language.col.score')}</th>
                          <th className={cn(familyThGroup, 'min-w-[7rem]')}>{t('employees.language.col.grade')}</th>
                          <th className={cn(familyThGroup, 'min-w-[8rem]')}>
                            {t('employees.language.col.expiryDate')}
                          </th>
                          <th className={cn(familyThGroup, 'w-12 min-w-[3rem]')} aria-label={t('employees.family.remove')} />
                        </tr>
                      </thead>
                      <tbody>
                        {languageRows.map((row, idx) => (
                          <tr
                            key={row.rowKey}
                            className={cn(idx % 2 === 0 ? 'bg-white' : 'bg-rose-50/40')}
                          >
                            <td className="border border-gray-200 px-1 py-0.5 text-center font-mono text-gray-700">
                              {idx + 1}
                            </td>
                            <td className="border border-gray-200 p-0.5 bg-amber-50/60">
                              <input
                                type="date"
                                className={familyInputCls}
                                value={row.acquisition_date}
                                disabled={!canEditExtension}
                                onChange={(e) =>
                                  updateLanguage(row.rowKey, { acquisition_date: e.target.value })
                                }
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5 bg-amber-50/60">
                              <select
                                className={familyInputCls}
                                value={row.language_code}
                                disabled={!canEditExtension}
                                onChange={(e) =>
                                  updateLanguage(row.rowKey, { language_code: e.target.value })
                                }
                              >
                                <option value="">{t('employees.language.selectPlaceholder')}</option>
                                {LANGUAGE_OPTION_CODES.filter((c) => c !== '').map((c) => (
                                  <option key={c} value={c}>
                                    {t(`employees.language.opt.lang.${c}`)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="border border-gray-200 p-0.5 bg-amber-50/60">
                              <select
                                className={familyInputCls}
                                value={row.test_type}
                                disabled={!canEditExtension}
                                onChange={(e) => updateLanguage(row.rowKey, { test_type: e.target.value })}
                              >
                                <option value="">{t('employees.language.selectPlaceholder')}</option>
                                {LANGUAGE_TEST_CODES.filter((c) => c !== '').map((c) => (
                                  <option key={c} value={c}>
                                    {t(`employees.language.opt.test.${c}`)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                type="number"
                                min={0}
                                className={familyInputCls}
                                value={row.score}
                                disabled={!canEditExtension}
                                onChange={(e) => updateLanguage(row.rowKey, { score: e.target.value })}
                              />
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <select
                                className={familyInputCls}
                                value={row.grade}
                                disabled={!canEditExtension}
                                onChange={(e) => updateLanguage(row.rowKey, { grade: e.target.value })}
                              >
                                <option value="">{t('employees.language.selectPlaceholder')}</option>
                                {LANGUAGE_GRADE_CODES.filter((c) => c !== '').map((c) => (
                                  <option key={c} value={c}>
                                    {t(`employees.language.opt.grade.${c}`)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="border border-gray-200 p-0.5">
                              <input
                                type="date"
                                className={familyInputCls}
                                value={row.expiry_date}
                                disabled={!canEditExtension}
                                onChange={(e) =>
                                  updateLanguage(row.rowKey, { expiry_date: e.target.value })
                                }
                              />
                            </td>
                            <td className="border border-gray-200 px-1 py-0.5 text-center align-middle">
                              <button
                                type="button"
                                className="text-[10px] text-red-600 hover:underline disabled:opacity-40 disabled:pointer-events-none"
                                disabled={!canEditExtension}
                                onClick={() => removeLanguage(row.rowKey)}
                              >
                                {t('employees.family.remove')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {detailTab === 'address' && (uiMode === 'new' || !detailReady) && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-amber-800 text-center text-sm bg-amber-50 rounded-lg border border-amber-100">
                {t('employees.toolbar.needEmployeeForTabs')}
              </div>
            )}

            {detailTab === 'address' && detailReady && detail && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveAddressServer()}
                    disabled={personalLocked || savingBasic}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {t('employees.address.save')}
                  </button>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
                  <div className="border border-gray-300 rounded-md overflow-hidden bg-white flex flex-col min-h-0">
                    <div className="px-3 py-2 text-sm font-semibold text-gray-800 border-b border-gray-300 bg-rose-50/80 shrink-0">
                      {t('employees.address.permanentLegend')}
                    </div>
                    <div className="p-3 space-y-2 flex-1 overflow-y-auto max-h-[min(70vh,520px)]">
                      {ADDRESS_PAIR_KEYS.map((suffix) => {
                        const fullKey = `perm_${suffix}` as AddressDraftKey;
                        const isLookup = ADDRESS_LOOKUP_SUFFIXES.has(suffix);
                        const isStreet = suffix === 'street_th' || suffix === 'street_en';
                        const minorMajorId = isLookup ? addrMajorIdByField[suffix as AddressMinorField] : null;
                        const minorOptions = isLookup ? addrMinorOptionsByField[suffix as AddressMinorField] : [];
                        const canMinorSelect = isLookup && minorMajorId != null;
                        return (
                          <div key={fullKey} className="flex gap-2 items-start">
                            <label className={personalLabelCls} htmlFor={fullKey}>
                              {t(`employees.address.field.${suffix}`)}
                            </label>
                            <div className="flex-1 min-w-0">
                              {isLookup ? (
                                canMinorSelect ? (
                                  <div className="flex gap-0.5 items-stretch">
                                    <select
                                      id={fullKey}
                                      className={cn(personalFieldCls, 'min-w-0 flex-1')}
                                      disabled={personalLocked}
                                      value={addressDraft[fullKey]}
                                      onChange={(e) =>
                                        setAddressDraft((d) => ({ ...d, [fullKey]: e.target.value }))
                                      }
                                    >
                                      <option value="">{t('employees.general.selectPlaceholder')}</option>
                                      {minorOptions.map((o) => (
                                        <option key={o.id} value={o.minor_code}>
                                          {pickMinorLabelForLocale(o)}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      className="shrink-0 px-1 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                                      disabled={personalLocked}
                                      title={t('employees.address.lookupHint')}
                                      aria-label={t('employees.address.lookupHint')}
                                      onClick={() => {
                                        setAddressPickerFullKey(fullKey);
                                        setAddressPickerOpen(true);
                                      }}
                                    >
                                      <Search className="w-3.5 h-3.5 text-gray-600" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex gap-0.5 items-stretch">
                                    <input
                                      id={fullKey}
                                      type="text"
                                      className={cn(personalFieldCls, 'min-w-0 flex-1')}
                                      disabled={personalLocked}
                                      value={addressDraft[fullKey]}
                                      onChange={(e) =>
                                        setAddressDraft((d) => ({ ...d, [fullKey]: e.target.value }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="shrink-0 px-1 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                                      disabled={personalLocked}
                                      title={t('employees.address.lookupHint')}
                                      aria-label={t('employees.address.lookupHint')}
                                      onClick={() => alert(t('employees.address.lookupHint'))}
                                    >
                                      <Search className="w-3.5 h-3.5 text-gray-600" />
                                    </button>
                                  </div>
                                )
                              ) : isStreet ? (
                                <textarea
                                  id={fullKey}
                                  rows={2}
                                  className={cn(personalFieldCls, 'min-h-[2.75rem] resize-y')}
                                  disabled={personalLocked}
                                  value={addressDraft[fullKey]}
                                  onChange={(e) =>
                                    setAddressDraft((d) => ({ ...d, [fullKey]: e.target.value }))
                                  }
                                />
                              ) : (
                                <input
                                  id={fullKey}
                                  type="text"
                                  className={personalFieldCls}
                                  disabled={personalLocked}
                                  value={addressDraft[fullKey]}
                                  onChange={(e) =>
                                    setAddressDraft((d) => ({ ...d, [fullKey]: e.target.value }))
                                  }
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="border border-gray-300 rounded-md overflow-hidden bg-white flex flex-col min-h-0">
                    <div className="px-3 py-2 text-sm font-semibold text-gray-800 border-b border-gray-300 bg-rose-50/80 shrink-0">
                      {t('employees.address.currentLegend')}
                    </div>
                    <div className="p-3 space-y-2 flex-1 overflow-y-auto max-h-[min(70vh,520px)]">
                      {ADDRESS_PAIR_KEYS.map((suffix) => {
                        const fullKey = `curr_${suffix}` as AddressDraftKey;
                        const isLookup = ADDRESS_LOOKUP_SUFFIXES.has(suffix);
                        const isStreet = suffix === 'street_th' || suffix === 'street_en';
                        const minorMajorId = isLookup ? addrMajorIdByField[suffix as AddressMinorField] : null;
                        const minorOptions = isLookup ? addrMinorOptionsByField[suffix as AddressMinorField] : [];
                        const canMinorSelect = isLookup && minorMajorId != null;
                        return (
                          <div key={fullKey} className="flex gap-2 items-start">
                            <label className={personalLabelCls} htmlFor={fullKey}>
                              {t(`employees.address.field.${suffix}`)}
                            </label>
                            <div className="flex-1 min-w-0">
                              {isLookup ? (
                                canMinorSelect ? (
                                  <div className="flex gap-0.5 items-stretch">
                                    <select
                                      id={fullKey}
                                      className={cn(personalFieldCls, 'min-w-0 flex-1')}
                                      disabled={personalLocked}
                                      value={addressDraft[fullKey]}
                                      onChange={(e) =>
                                        setAddressDraft((d) => ({ ...d, [fullKey]: e.target.value }))
                                      }
                                    >
                                      <option value="">{t('employees.general.selectPlaceholder')}</option>
                                      {minorOptions.map((o) => (
                                        <option key={o.id} value={o.minor_code}>
                                          {pickMinorLabelForLocale(o)}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      className="shrink-0 px-1 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                                      disabled={personalLocked}
                                      title={t('employees.address.lookupHint')}
                                      aria-label={t('employees.address.lookupHint')}
                                      onClick={() => {
                                        setAddressPickerFullKey(fullKey);
                                        setAddressPickerOpen(true);
                                      }}
                                    >
                                      <Search className="w-3.5 h-3.5 text-gray-600" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex gap-0.5 items-stretch">
                                    <input
                                      id={fullKey}
                                      type="text"
                                      className={cn(personalFieldCls, 'min-w-0 flex-1')}
                                      disabled={personalLocked}
                                      value={addressDraft[fullKey]}
                                      onChange={(e) =>
                                        setAddressDraft((d) => ({ ...d, [fullKey]: e.target.value }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="shrink-0 px-1 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                                      disabled={personalLocked}
                                      title={t('employees.address.lookupHint')}
                                      aria-label={t('employees.address.lookupHint')}
                                      onClick={() => alert(t('employees.address.lookupHint'))}
                                    >
                                      <Search className="w-3.5 h-3.5 text-gray-600" />
                                    </button>
                                  </div>
                                )
                              ) : isStreet ? (
                                <textarea
                                  id={fullKey}
                                  rows={2}
                                  className={cn(personalFieldCls, 'min-h-[2.75rem] resize-y')}
                                  disabled={personalLocked}
                                  value={addressDraft[fullKey]}
                                  onChange={(e) =>
                                    setAddressDraft((d) => ({ ...d, [fullKey]: e.target.value }))
                                  }
                                />
                              ) : (
                                <input
                                  id={fullKey}
                                  type="text"
                                  className={personalFieldCls}
                                  disabled={personalLocked}
                                  value={addressDraft[fullKey]}
                                  onChange={(e) =>
                                    setAddressDraft((d) => ({ ...d, [fullKey]: e.target.value }))
                                  }
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="border-t border-gray-200 px-3 py-2 bg-gray-50/80 shrink-0">
                      <button
                        type="button"
                        disabled={personalLocked}
                        className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                        onClick={() => setAddressDraft((d) => copyPermanentToCurrentAddress(d))}
                      >
                        {t('employees.address.sameAsPermanent')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        <MinorCodeSearchCrudModal
          open={certPickerOpen}
          onClose={() => {
            setCertPickerOpen(false);
            setCertPickerRowKey(null);
          }}
          title={
            certPickerField === 'license_type'
              ? t('employees.certification.col.licenseType')
              : t('employees.certification.col.issuerCode')
          }
          locale={locale}
          companyId={Number.isInteger(Number(generalCore.company_id)) ? Number(generalCore.company_id) : null}
          majorId={
            certPickerField === 'license_type'
              ? certMajorIdByField.license_type
              : certMajorIdByField.issuer
          }
          options={
            certPickerField === 'license_type' ? certMinorOptionsByField.license_type : certMinorOptionsByField.issuer
          }
          referenceCrud={referenceCrud}
          onRefresh={refreshCertMinorOptions}
          onPick={handlePickCertMinor}
          onClear={clearCertMinorSelection}
        />

        <MinorCodeSearchCrudModal
          open={personalPickerOpen}
          onClose={() => setPersonalPickerOpen(false)}
          title={
            personalPickerField === 'nationality'
              ? t('employees.personal.field.nationality')
              : t('employees.personal.field.religion')
          }
          locale={locale}
          companyId={Number.isInteger(Number(generalCore.company_id)) ? Number(generalCore.company_id) : null}
          majorId={personalMajorIdByField[personalPickerField]}
          options={personalMinorOptionsByField[personalPickerField]}
          referenceCrud={referenceCrud}
          onRefresh={refreshPersonalMinorOptions}
          onPick={handlePickPersonalMinor}
          onClear={handleClearPersonalMinor}
        />

        <MinorCodeSearchCrudModal
          open={addressPickerOpen}
          onClose={() => {
            setAddressPickerOpen(false);
            setAddressPickerFullKey(null);
          }}
          title={addressPickerSuffix ? t(`employees.address.field.${addressPickerSuffix}`) : ''}
          locale={locale}
          companyId={Number.isInteger(Number(generalCore.company_id)) ? Number(generalCore.company_id) : null}
          majorId={addressPickerSuffix ? addrMajorIdByField[addressPickerSuffix] : null}
          options={addressPickerSuffix ? addrMinorOptionsByField[addressPickerSuffix] : []}
          referenceCrud={referenceCrud}
          onRefresh={refreshAddressMinorOptions}
          onPick={handlePickAddressMinor}
          onClear={handleClearAddressMinor}
        />

        {resignDialogOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resign-dialog-title"
          >
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4 space-y-3">
              <h2 id="resign-dialog-title" className="text-sm font-semibold text-gray-900">
                {t('employees.toolbar.resignDialogTitle')}
              </h2>
              <p className="text-xs text-gray-600">{t('employees.toolbar.resignDialogHint')}</p>
              <label className="block text-xs font-medium text-gray-700">
                {t('employees.general.terminationDate')}
                <input
                  type="date"
                  className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  value={resignDialogDate}
                  onChange={(e) => setResignDialogDate(e.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50"
                  onClick={() => setResignDialogOpen(false)}
                >
                  {t('employees.toolbar.resignDialogCancel')}
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={savingBasic}
                  onClick={() => void confirmResignFromDialog()}
                >
                  {t('employees.toolbar.resignDialogConfirm')}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default function EmployeesPage() {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>
      }
    >
      <EmployeesPageContent />
    </Suspense>
  );
}
