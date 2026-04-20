'use client';

import { useState, useEffect, useMemo, useRef, Fragment, type ReactNode } from 'react';
import { FileText, Eye, Filter, X, FileDown, ChevronDown, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { downloadTextFile } from '@/lib/downloadTextFile';
import { useI18n } from '@/contexts/I18nContext';

const getFormLabels = (t: (key: string, fallback?: string) => string): Record<number, string> => ({
  1: t('appList.form.1', 'Form 1 (Jobbkk)'),
  2: t('appList.form.2', 'Form 2 (JobThai)'),
  3: t('appList.form.3', 'Form 3 (LinkedIn)'),
  4: t('appList.form.4', 'Form 4 (Linked Simple)'),
  5: t('appList.form.5', 'Form 5'),
  6: t('appList.form.6', 'Web Apply'),
});

const getLangLabels = (t: (key: string, fallback?: string) => string): Record<string, string> => ({
  ko: t('header.langKo', 'Korean'),
  en: t('header.langEn', 'English'),
  th: t('header.langTh', 'Thai'),
});

/** 양식별 원본 PDF 섹션 순서 (양식1 jobbkk, 양식2 JobThai, 양식3 LinkedIn) - 원본 PDF 레이아웃에 맞춤 */
const SECTION_ORDER: Record<number, string[]> = {
  /* 양식1 (jobbkk): 기본 정보(파일명/이름/연락처) → 헤더(접수일/지원직위/코드/수정일) → 개인상세 → 희망직무 → 학력 → 경력/실습 → 훈련/자격증 → 능력·성과 */
  1: ['basic', 'header', 'personal', 'desired_job', 'education', 'experience', 'training', 'skills'],
  /* 양식2 (JobThai): 헤더 → 기본 정보 → 개인 정보 상세 → 희망 직무 특성 → 학력 → 경력/실습 기록 → 훈련/자격증 내역 → 능력·성과·경력 */
  2: ['header', 'basic', 'personal', 'desired_job', 'education', 'experience', 'training', 'skills'],
  /* 양식3 (LinkedIn): Contact → Application Info → Personal → Summary → Career Preferences → Education → Experience → Certifications → Skills */
  3: ['basic', 'header', 'personal', 'summary', 'desired_job', 'education', 'experience', 'training', 'skills'],
  /* 양식4 (Linked Simple): LinkedIn 단순형 - Contact → Summary → Education → Experience → Skills */
  4: ['basic', 'header', 'personal', 'summary', 'desired_job', 'education', 'experience', 'training', 'skills'],
  /* 웹지원: 기본 정보 → 헤더(접수일/지원직위) → 개인 상세 → Summary → 희망직무 → 학력 → 경력 → 기술 */
  6: ['basic', 'header', 'personal', 'summary', 'desired_job', 'education', 'experience', 'training', 'skills'],
};
const DEFAULT_SECTION_ORDER = SECTION_ORDER[2];

/** 양식3(LinkedIn) 상세 모달 섹션 제목 (원본 PDF 구조에 맞춤) */
const SECTION_TITLE_LINKEDIN: Record<string, string> = {
  header: 'Application Info',
  basic: 'Contact',
  personal: 'Personal Details',
  summary: 'Summary',
  desired_job: 'Career Preferences',
  education: 'Education',
  experience: 'Experience',
  training: 'Certifications',
  skills: 'Skills',
};
const SECTION_TITLE_KO: Record<string, string> = {
  header: '헤더 정보',
  basic: '기본 정보',
  personal: '개인 정보 상세',
  summary: 'Summary / About',
  desired_job: '희망 직무 특성',
  education: '학력',
  experience: '경력 / 실습 기록',
  training: '훈련 / 자격증 내역',
  skills: '능력 · 성과 · 경력',
};
function getSectionTitle(formType: number, sectionKey: string): string {
  return (formType === 3 || formType === 4 ? SECTION_TITLE_LINKEDIN : SECTION_TITLE_KO)[sectionKey] ?? sectionKey;
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

interface ParsedApplicationItem {
  id: number;
  original_filename: string;
  pdf_file_path: string;
  form_type: number;
  document_language: string;
  applicant_name: string | null;
  applicant_surname?: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
  applicant_id?: string | null;
  age?: string | null;
  application_date?: string | null;
  applied_position?: string | null;
  company_name?: string | null;
  business_type?: string | null;
  position?: string | null;
  employment_period?: string | null;
  salary?: string | null;
  address?: string | null;
  education?: string | null;
  experience?: string | null;
  skills?: string | null;
  summary?: string | null;
  sections_intro?: string | null;
  sections_skills?: string | null;
  sections_experience?: string | null;
  sections_education?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  gender?: string | null;
  certification_license?: string | null;
  linkedin_url?: string | null;
  update_date?: string | null;
  height_weight?: string | null;
  height?: string | null;
  weight?: string | null;
  religion?: string | null;
  marital_status?: string | null;
  desired_salary?: string | null;
  military_status?: string | null;
  facebook_url?: string | null;
  line_id?: string | null;
  desired_work_locations?: string | null;
  employment_type_preference?: string | null;
  can_work_bangkok?: string | null;
  can_work_provinces?: string | null;
  willing_work_abroad?: string | null;
  occupation_field?: string | null;
  sub_occupation?: string | null;
  vehicles_owned?: string | null;
  driving_license?: string | null;
  driving_ability?: string | null;
  language_skills?: string | null;
  training_info?: string | null;
  start_date_available?: string | null;
  desired_positions?: string | null;
  education_level?: string | null;
  faculty?: string | null;
  major?: string | null;
  qualification?: string | null;
  gpa?: string | null;
  other_notes?: string | null;
  last_working_1?: string | null;
  lw1_period?: string | null;
  last_working_2?: string | null;
  lw2_period?: string | null;
  last_working_3?: string | null;
  lw3_period?: string | null;
  parsed_data: Record<string, unknown> | null;
  raw_text: string | null;
  job_posting_id: number | null;
  job_posting_title?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

/** 긴 텍스트를 줄/불릿 단위로 쪼개서 가독성 있게 표시 */
function formatFieldValue(value: string): ReactNode {
  const s = String(value).trim();
  if (!s) return null;
  // 이미 줄바꿈이 있으면 그대로 유지하고, 각 줄을 블록으로 표시
  const byNewline = s.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (byNewline.length > 1) {
    return (
      <ul className="list-disc list-inside space-y-1 text-gray-800">
        {byNewline.map((line, i) => (
          <li key={i} className="break-words">{line}</li>
        ))}
      </ul>
    );
  }
  // 한 줄인데 길면 구분자로 나누기: " - ", " : ", "  " (연속 공백), "•" (캡처 없이 split)
  const separators = /\s+[-–—]\s+|\s+:\s+|\s{2,}|\s•\s|•\s/;
  const parts = s.split(separators).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    return (
      <ul className="list-disc list-inside space-y-1 text-gray-800">
        {parts.map((part, i) => (
          <li key={i} className="break-words">{part}</li>
        ))}
      </ul>
    );
  }
  return <span className="break-words text-gray-800">{s}</span>;
}

const PARSED_FIELD_LABELS: { key: keyof ParsedApplicationItem; label: string }[] = [
  { key: 'applicant_id', label: '지원자 ID (외부)' },
  { key: 'applicant_surname', label: '성' },
  { key: 'applied_position', label: '지원 직위' },
  { key: 'age', label: '나이' },
  { key: 'company_name', label: '회사/기업명' },
  { key: 'business_type', label: '업종/사업유형' },
  { key: 'position', label: '직위/직무' },
  { key: 'employment_period', label: '근무기간' },
  { key: 'salary', label: '급여' },
  { key: 'address', label: '주소' },
  { key: 'education', label: '학력' },
  { key: 'experience', label: '경력' },
  { key: 'skills', label: '기술/스킬' },
  { key: 'summary', label: '요약/자기소개' },
  { key: 'date_of_birth', label: '생년월일' },
  { key: 'nationality', label: '국적' },
  { key: 'gender', label: '성별' },
  { key: 'height_weight', label: '신장/체중' },
  { key: 'certification_license', label: '자격/면허' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'update_date', label: '갱신일' },
  { key: 'sections_intro', label: '인적사항' },
  { key: 'sections_skills', label: '기술 상세' },
  { key: 'sections_experience', label: '경력 상세' },
  { key: 'sections_education', label: '학력 상세' },
  { key: 'religion', label: '종교' },
  { key: 'marital_status', label: '혼인상태' },
  { key: 'desired_salary', label: '희망급여' },
  { key: 'military_status', label: '병역' },
  { key: 'facebook_url', label: 'Facebook' },
  { key: 'line_id', label: 'Line@' },
  { key: 'desired_work_locations', label: '희망근무지' },
  { key: 'employment_type_preference', label: '희망고용형태' },
  { key: 'can_work_bangkok', label: '방콕 근무가능' },
  { key: 'can_work_provinces', label: '지방 근무가능' },
  { key: 'willing_work_abroad', label: '해외근무희망' },
  { key: 'occupation_field', label: '직종' },
  { key: 'sub_occupation', label: '세부직종' },
  { key: 'vehicles_owned', label: '보유차량' },
  { key: 'driving_license', label: '운전면허' },
  { key: 'driving_ability', label: '운전능력' },
  { key: 'language_skills', label: '언어능력' },
  { key: 'training_info', label: '교육훈련' },
  { key: 'start_date_available', label: '근무 시작 가능일' },
  { key: 'desired_positions', label: '희망 직위 목록' },
  { key: 'education_level', label: '학력 수준' },
  { key: 'major', label: '전공' },
  { key: 'gpa', label: '평점/GPA' },
  { key: 'other_notes', label: '비고' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/** 테이블/상세 공통 필드 라벨 (한글) */
const FIELD_LABELS: Record<string, string> = {
  applicationNo: '지원번호',
  applicationDate: '지원날짜',
  fullName: '성명',
  firstName: '이름',
  surname: '성',
  birthYear: '생년',
  dateOfBirthFull: '생년월일',
  age: '나이',
  phoneNumber: '연락처',
  email: '이메일',
  lineId: 'Line ID',
  originalFilename: '원본 파일명',
  educationMajor: '학력 / 전공',
  educationLevel: '학력 수준',
  faculty: '단과대학',
  major: '전공',
  qualification: '자격',
  gpa: '평점/GPA',
  positionAppliedFor: '지원 직위',
  appropriatePosition: '적합 직위',
  desiredPositionOrTitle: '지원하려는 직위 또는 직책',
  desiredJobNotes: '희망직무 특성',
  desiredWorkType: '원하는 업무유형',
  workStartAvailable: '근무시작 가능',
  desiredPositions: '희망 직위 목록',
  companyName: '회사/기업명',
  businessType: '업종/사업유형',
  position: '직위/직무',
  employmentPeriod: '근무기간',
  expectedSalary: '희망 급여',
  currentSalary: '현재 급여',
  currentAddress: '현재 주소',
  lastWorking1: '최근 경력 1',
  lw1Period: '경력1 기간',
  lastWorking2: '최근 경력 2',
  lw2Period: '경력2 기간',
  lastWorking3: '최근 경력 3',
  lw3Period: '경력3 기간',
  experience: '경력',
  summary: '요약/자기소개',
  desiredWorkLocations: '희망 근무지',
  startDateAvailable: '근무 시작 가능일',
  languageSkills: '언어 능력',
  otherSkills: '기타 스킬',
  trainingInfo: '교육훈련',
  certificationLicense: '자격/면허',
  nationality: '국적',
  gender: '성별',
  religion: '종교',
  maritalStatus: '혼인상태',
  heightWeight: '신장/체중',
  height: '신장',
  weight: '체중',
  militaryStatus: '병역',
  employmentTypePreference: '희망 고용형태',
  canWorkBangkok: '방콕 근무가능',
  canWorkProvinces: '지방 근무가능',
  willingWorkAbroad: '해외근무 희망',
  occupationField: '직종',
  subOccupation: '세부직종',
  vehiclesOwned: '보유차량',
  drivingLicense: '운전면허',
  drivingAbility: '운전능력',
  linkedinUrl: 'LinkedIn',
  facebookUrl: 'Facebook',
  updateDate: '갱신일',
  lastResumeModified: '최종 이력서 수정일',
  sectionsIntro: '인적사항 섹션',
  sectionsSkills: '기술 섹션',
  sectionsExperience: '경력 섹션',
  sectionsEducation: '학력 섹션',
  otherNotes: '비고',
  jobPosting: '채용공고',
  form: '양식',
  language: '언어',
  status: '상태',
  registeredAt: '등록일시',
  registeredBy: '등록자',
};

/** 테이블 컬럼 정의: key, label, filterable, getValue(row) */
function getRowDisplayValues(
  row: ParsedApplicationItem,
  formLabels: Record<number, string>,
  langLabels: Record<string, string>
) {
  const birthYear = row.date_of_birth ? (() => { const m = row.date_of_birth.match(/\d{4}/); return m ? m[0] : null; })() : null;
  const fullName = [row.applicant_name, row.applicant_surname].filter(Boolean).join(' ') || '-';
  const educationMajor = [row.education, row.major].filter(Boolean).join(' / ') || '-';
  return {
    applicationNo: row.applicant_id ?? '-',
    fullName,
    birthYear: birthYear ?? '-',
    age: row.age ?? '-',
    phoneNumber: row.applicant_phone || '-',
    email: row.applicant_email || '-',
    lineId: row.line_id ?? '-',
    educationMajor,
    positionAppliedFor: row.applied_position || '-',
    appropriatePosition: row.desired_positions || '-',
    expectedSalary: row.desired_salary ?? '-',
    currentSalary: row.salary ?? '-',
    currentAddress: row.address || '-',
    lastWorking1: row.last_working_1 ?? '-',
    lw1Period: row.lw1_period ?? '-',
    languageSkills: row.language_skills ?? '-',
    otherSkills: row.skills ?? '-',
    jobPosting: row.job_posting_title || '-',
    form: formLabels[row.form_type] ?? String(row.form_type),
    language: langLabels[row.document_language] ?? row.document_language,
    status: row.status,
    registeredAt: row.created_at ? (() => {
      try {
        const d = new Date(row.created_at);
        return isNaN(d.getTime()) ? row.created_at : d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
      } catch {
        return row.created_at;
      }
    })() : '-',
    registeredBy: row.created_by ?? '-',
  };
}

const TABLE_COLUMN_KEYS = [
  'applicationNo', 'fullName', 'birthYear', 'age', 'phoneNumber', 'email', 'lineId',
  'educationMajor', 'positionAppliedFor', 'expectedSalary', 'currentSalary', 'currentAddress',
  'lastWorking1', 'lw1Period', 'languageSkills', 'otherSkills', 'jobPosting', 'form', 'language', 'status',
] as const;

export default function RecruitmentApplicationListPage() {
  const { t } = useI18n();
  const FORM_LABELS = useMemo(() => getFormLabels(t), [t]);
  const LANG_LABELS = useMemo(() => getLangLabels(t), [t]);
  const [items, setItems] = useState<ParsedApplicationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ParsedApplicationItem | null>(null);
  const [filterFormType, setFilterFormType] = useState<number | ''>('');
  const [filterLang, setFilterLang] = useState<string>('');
  const [fileLoading, setFileLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const openOriginalFile = async (id: number) => {
    setFileLoading(true);
    try {
      const res = await apiClient.getParsedApplicationFile(id);
      if (res.status !== 200 || !(res.data instanceof Blob)) {
        alert(t('appList.alert.originalFileLoadFail'));
        return;
      }
      const blob = res.data.type ? res.data : new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      console.error('Original file open error:', err);
      const msg = err && typeof err === 'object' && 'response' in err && err.response && typeof err.response === 'object' && 'status' in err.response
        ? (err.response as { status: number }).status === 404
          ? t('appList.alert.originalFileNotFound')
          : t('appList.alert.originalFileLoadFail')
        : t('appList.alert.originalFileLoadFail');
      alert(msg);
    } finally {
      setFileLoading(false);
    }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const params: { form_type?: number; document_language?: string; limit?: number; skip?: number } = {};
      if (filterFormType !== '') params.form_type = filterFormType as number;
      if (filterLang) params.document_language = filterLang;
      params.limit = pageSize;
      params.skip = (page - 1) * pageSize;
      const res = await apiClient.getParsedApplications(params);
      const data = res.data as
        | { items?: ParsedApplicationItem[]; total?: number; data?: { items?: ParsedApplicationItem[]; total?: number } }
        | ParsedApplicationItem[];
      // 페이지네이션: 반드시 API의 total 사용 (items.length 사용 금지). 10건씩 조회 시에도 전체 98건이면 98로 표시
      const isObj = data != null && typeof data === 'object' && !Array.isArray(data);
      const payload = isObj && (data as { data?: { items?: unknown; total?: number } }).data != null
        ? (data as { data: { items?: ParsedApplicationItem[]; total?: number } }).data
        : (data as { items?: ParsedApplicationItem[]; total?: number });
      const itemsList =
        Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(data)
            ? data
            : [];
      const totalCount =
        typeof payload?.total === 'number'
          ? payload.total
          : Array.isArray(data)
            ? data.length
            : 0;
      setItems(itemsList);
      setTotal(totalCount);
    } catch (err) {
      console.error('Parsed application list load error:', err);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, [filterFormType, filterLang, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const filteredItems = useMemo(() => {
    if (Object.keys(columnFilters).every((k) => !columnFilters[k]?.length)) return items;
    return items.filter((row) => {
      const v = getRowDisplayValues(row, FORM_LABELS, LANG_LABELS);
      return TABLE_COLUMN_KEYS.every((key) => {
        const selected = columnFilters[key];
        if (!selected || selected.length === 0) return true;
        const cellVal = String((v as Record<string, string>)[key] ?? '-').trim();
        return selected.includes(cellVal);
      });
    });
  }, [items, columnFilters, FORM_LABELS, LANG_LABELS]);

  const uniqueValuesByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    TABLE_COLUMN_KEYS.forEach((key) => {
      const set = new Set<string>();
      items.forEach((row) => {
        const v = getRowDisplayValues(row, FORM_LABELS, LANG_LABELS);
        const val = String((v as Record<string, string>)[key] ?? '-').trim();
        if (val) set.add(val);
      });
      map[key] = Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
    });
    return map;
  }, [items, FORM_LABELS, LANG_LABELS]);

  const toggleColumnFilter = (key: string, value: string) => {
    setColumnFilters((prev) => {
      const arr = prev[key] ?? [];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      if (next.length === 0) {
        const u = { ...prev };
        delete u[key];
        return u;
      }
      return { ...prev, [key]: next };
    });
  };

  const clearColumnFilter = (key: string) => {
    setColumnFilters((prev) => {
      const u = { ...prev };
      delete u[key];
      return u;
    });
    setOpenFilterKey(null);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size >= filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((r) => r.id)));
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      alert(t('appList.alert.selectToDelete'));
      return;
    }
    if (!confirm(t('appList.alert.confirmDelete').replace('{count}', String(ids.length)))) return;
    setDeleting(true);
    try {
      const res = await apiClient.deleteParsedApplications(ids);
      const data = res.data as { deleted?: number; message?: string };
      setSelectedIds(new Set());
      await loadList();
      alert(data?.message ?? t('appList.alert.deletedCount').replace('{count}', String(data?.deleted ?? 0)));
    } catch (err: unknown) {
      console.error('Application delete error:', err);
      const res = (err as { response?: { data?: { detail?: string | string[] } } })?.response?.data;
      const detail = res?.detail;
      const msg = Array.isArray(detail) ? detail.join('\n') : (typeof detail === 'string' ? detail : null);
      alert(msg || t('appList.alert.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

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

  const openDetail = async (id: number) => {
    try {
      const res = await apiClient.getParsedApplication(id);
      setSelected(res.data as ParsedApplicationItem);
    } catch (err) {
      console.error('Application detail fetch error:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{t('appList.filter.title')}</span>
            </div>
            <select
              value={filterFormType}
              onChange={(e) => setFilterFormType(e.target.value === '' ? '' : Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{t('appList.filter.allForms')}</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{FORM_LABELS[n] ?? `Form ${n}`}</option>
              ))}
            </select>
            <select
              value={filterLang}
              onChange={(e) => setFilterLang(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{t('appList.filter.allLanguages')}</option>
              <option value="ko">{t('header.langKo')}</option>
              <option value="en">{t('header.langEn')}</option>
              <option value="th">{t('header.langTh')}</option>
            </select>
            <button
              type="button"
              onClick={loadList}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              {t('appList.filter.refresh')}
            </button>
            <button
              type="button"
              onClick={() => {
                const header = TABLE_COLUMN_KEYS.map((k) => FIELD_LABELS[k]);
                const rows = filteredItems.map((row) => {
                  const v = getRowDisplayValues(row, FORM_LABELS, LANG_LABELS);
                  return TABLE_COLUMN_KEYS.map((k) => v[k] ?? '-');
                });
                const lines = [
                  header.map(csvEscape).join(','),
                  ...rows.map((r) => r.map(csvEscape).join(',')),
                ];
                downloadTextFile(
                  `application-list-${new Date().toISOString().slice(0, 10)}.csv`,
                  lines.join('\n')
                );
              }}
              className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 text-sm"
            >
              엑셀 다운로드
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={deleting || selectedIds.size === 0}
              className="px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm inline-flex items-center gap-1"
            >
              <Trash2 className="w-4 h-4" /> {t('appList.filter.deleteSelected')} {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </button>
          </div>
          {!loading && total >= 0 && (
            <div className="flex flex-wrap items-center gap-3 ml-auto">
              <span className="text-sm text-gray-600">
                {t('appList.pagination.summary').replace('{total}', String(total)).replace('{start}', String(startItem)).replace('{end}', String(endItem))}
                {filteredItems.length !== items.length && (
                  <span className="ml-1 text-blue-600">{t('appList.pagination.filtered').replace('{count}', String(filteredItems.length))}</span>
                )}
              </span>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                {t('appList.pagination.perPage')}
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{t('appList.pagination.countUnit').replace('{count}', String(n))}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.prev')}
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">{t('common.loading')}</div>
        ) : items.length === 0 && total === 0 ? (
          <div className="p-12 text-center text-gray-500">{t('appList.empty')}</div>
        ) : (
          <>
          <div className="max-h-[70vh] overflow-auto relative">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-2 py-2 text-left bg-gray-50 border-b border-gray-200 w-10">
                    <input
                      type="checkbox"
                      checked={filteredItems.length > 0 && selectedIds.size >= filteredItems.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                      title={t('appList.table.selectAll')}
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap bg-gray-50">{t('appList.table.no')}</th>
                  {TABLE_COLUMN_KEYS.map((key) => {
                    const label = FIELD_LABELS[key];
                    const selectedList = columnFilters[key] ?? [];
                    const hasFilter = selectedList.length > 0;
                    const options = uniqueValuesByKey[key] ?? [];
                    return (
                      <Fragment key={key}>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap bg-gray-50 border-b border-gray-200">
                          <div className="flex items-center gap-1 group">
                            <span>{label}</span>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setOpenFilterKey((k) => (k === key ? null : key))}
                                className={`p-0.5 rounded hover:bg-gray-200 ${hasFilter ? 'text-blue-600' : 'text-gray-400'}`}
                                title={t('appList.filter.title')}
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                              {openFilterKey === key && (
                                <div
                                  ref={filterPopoverRef}
                                  className="absolute left-0 top-full mt-1 z-20 w-56 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-2"
                                >
                                  <div className="px-2 pb-2 border-b border-gray-100 flex justify-between items-center">
                                    <span className="text-xs font-medium text-gray-600">{t('appList.filter.title')}</span>
                                    <button type="button" onClick={() => clearColumnFilter(key)} className="text-xs text-blue-600 hover:underline">
                                      {t('common.reset')}
                                    </button>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto py-1">
                                    {options.length === 0 ? (
                                      <p className="px-2 py-1 text-xs text-gray-500">{t('appList.filter.noValues')}</p>
                                    ) : (
                                      options.map((val) => (
                                        <label key={val} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={selectedList.includes(val)}
                                            onChange={() => toggleColumnFilter(key, val)}
                                            className="rounded border-gray-300"
                                          />
                                          <span className="text-xs truncate flex-1" title={val}>{val || t('common.emptyValue')}</span>
                                        </label>
                                      ))
                                    )}
                                  </div>
                                  {hasFilter && (
                                    <p className="px-2 pt-1 text-xs text-gray-500">{t('appList.filter.selectedCount').replace('{count}', String(selectedList.length))}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </th>
                        {key === 'otherSkills' && (
                          <th key="detail" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap bg-gray-50 border-b border-gray-200">{t('common.detail')}</th>
                        )}
                      </Fragment>
                    );
                  })}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap bg-gray-50 border-b border-gray-200">{t('appList.table.registeredAt')}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap bg-gray-50 border-b border-gray-200">{t('appList.table.registeredBy')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredItems.map((row, index) => {
                  const v = getRowDisplayValues(row, FORM_LABELS, LANG_LABELS);
                  const rowNo = total > 0 ? total - startItem + 1 - index : 0;
                  return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">{rowNo}</td>
                    <td className="px-3 py-2 text-sm">
                      <button
                        type="button"
                        onClick={() => openDetail(row.id)}
                        className="text-primary-600 hover:underline text-left font-medium"
                      >
                        {v.applicationNo}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-900">{v.fullName}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{v.birthYear}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{v.age}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{v.phoneNumber}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 truncate max-w-[140px]" title={v.email}>{v.email}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{v.lineId}</td>
                    <td className="px-3 py-2 text-sm text-gray-700 max-w-[160px] truncate" title={v.educationMajor}>{v.educationMajor}</td>
                    <td className="px-3 py-2 text-sm text-gray-700 max-w-[140px] truncate" title={v.positionAppliedFor}>{v.positionAppliedFor}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{v.expectedSalary}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{v.currentSalary}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 max-w-[160px] truncate" title={v.currentAddress}>{v.currentAddress}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 max-w-[120px] truncate" title={v.lastWorking1}>{v.lastWorking1}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 max-w-[100px] truncate">{v.lw1Period}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 max-w-[140px] truncate" title={v.languageSkills}>{v.languageSkills}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 max-w-[140px] truncate" title={v.otherSkills}>{v.otherSkills}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openDetail(row.id)}
                        className="inline-flex items-center gap-1 text-primary-600 hover:underline text-sm"
                      >
                        <Eye className="w-4 h-4" /> {t('common.detail')}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700 max-w-[120px] truncate" title={v.jobPosting}>{v.jobPosting}</td>
                    <td className="px-3 py-2 text-sm">{v.form}</td>
                    <td className="px-3 py-2 text-sm">{v.language}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">{v.status}</span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{v.registeredAt}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{v.registeredBy}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && (
            <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 bg-gray-50">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  {t('appList.pagination.summary').replace('{total}', String(total)).replace('{start}', String(startItem)).replace('{end}', String(endItem))}
                  {filteredItems.length !== items.length && (
                    <span className="ml-1 text-blue-600">{t('appList.pagination.filtered').replace('{count}', String(filteredItems.length))}</span>
                  )}
                </span>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  {t('appList.pagination.perPage')}
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{t('appList.pagination.countUnit').replace('{count}', String(n))}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.prev')}
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더: 제목 + 채용공고 정보 + 원본 첨부파일 열람 + 닫기 */}
            <div className="px-6 py-4 border-b border-gray-200 bg-slate-50 flex justify-between items-start gap-4 flex-wrap">
              <div>
                <h3 className="text-xl font-bold text-slate-800">지원서 상세</h3>
                <p className="text-base mt-1">
                  <span className="font-bold text-slate-700">채용공고 </span>
                  <span className="font-semibold text-slate-800 text-lg">{selected.job_posting_title || '-'}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openOriginalFile(selected.id)}
                  disabled={fileLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                >
                  <FileDown className="w-4 h-4" />
                  {fileLoading ? '불러오는 중…' : '원본 첨부파일 열람'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {(() => {
                const birthYear = selected.date_of_birth ? (() => { const m = selected.date_of_birth.match(/\d{4}/); return m ? m[0] : null; })() : null;
                const fullName = [selected.applicant_name, selected.applicant_surname].filter(Boolean).join(' ') || '-';
                const educationMajor = [selected.education, selected.major].filter(Boolean).join(' / ') || '-';
                const v = (s: string | null | undefined) => (s == null || s === '') ? '-' : s;
                const isJobThai = selected.form_type === 2;

                const DetailRow = ({ label, value, fullWidth = false }: { label: string; value: string | ReactNode; fullWidth?: boolean }) => (
                  <div className={fullWidth ? 'sm:col-span-2' : ''}>
                    <dt className="text-slate-500 font-medium">{label}</dt>
                    <dd className="text-slate-900 break-words mt-0.5">{typeof value === 'string' ? value : value}</dd>
                  </div>
                );

                if (isJobThai) {
                  return (
                    <>
                      {/* 채용공고: 지원 정보 상단에 굵고 크게 */}
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-4 bg-slate-50 border-b border-slate-200">
                          <p className="text-slate-500 font-bold text-base">채용공고</p>
                          <p className="text-slate-800 font-bold text-xl mt-1">{selected.job_posting_title || '-'}</p>
                        </div>
                      </section>
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-sky-100 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700">지원 정보 (JobThai 양식)</h4>
                        </div>
                        <div className="p-4">
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            <DetailRow label={FIELD_LABELS.applicationNo} value={v(selected.applicant_id)} />
                            <DetailRow label={FIELD_LABELS.applicationDate} value={v(selected.application_date)} />
                            <DetailRow label={FIELD_LABELS.positionAppliedFor} value={v(selected.applied_position)} />
                            <DetailRow label={FIELD_LABELS.lastResumeModified} value={v(selected.update_date)} />
                            <DetailRow label={FIELD_LABELS.originalFilename} value={v(selected.original_filename)} />
                          </dl>
                        </div>
                      </section>
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-sky-50 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700">연락처</h4>
                        </div>
                        <div className="p-4">
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            <DetailRow label={FIELD_LABELS.firstName} value={v(selected.applicant_name)} />
                            <DetailRow label={FIELD_LABELS.surname} value={v(selected.applicant_surname)} />
                            <DetailRow label={FIELD_LABELS.fullName} value={fullName} />
                            <DetailRow label={FIELD_LABELS.currentAddress} value={v(selected.address)} fullWidth />
                            <DetailRow label={FIELD_LABELS.email} value={v(selected.applicant_email)} />
                            <DetailRow label={FIELD_LABELS.phoneNumber} value={v(selected.applicant_phone)} />
                            <DetailRow label={FIELD_LABELS.lineId} value={v(selected.line_id)} />
                          </dl>
                        </div>
                      </section>
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-sky-50 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700">개인 상세 (รายละเอียดส่วนตัว)</h4>
                        </div>
                        <div className="p-4">
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            <DetailRow label={FIELD_LABELS.gender} value={v(selected.gender)} />
                            <DetailRow label={FIELD_LABELS.dateOfBirthFull} value={v(selected.date_of_birth)} />
                            <DetailRow label={FIELD_LABELS.birthYear} value={birthYear ?? '-'} />
                            <DetailRow label={FIELD_LABELS.age} value={v(selected.age)} />
                            <DetailRow label={FIELD_LABELS.height} value={v(selected.height)} />
                            <DetailRow label={FIELD_LABELS.weight} value={v(selected.weight)} />
                            <DetailRow label={FIELD_LABELS.heightWeight} value={v(selected.height_weight)} />
                            <DetailRow label={FIELD_LABELS.nationality} value={v(selected.nationality)} />
                            <DetailRow label={FIELD_LABELS.religion} value={v(selected.religion)} />
                            <DetailRow label={FIELD_LABELS.maritalStatus} value={v(selected.marital_status)} />
                            <DetailRow label={FIELD_LABELS.militaryStatus} value={v(selected.military_status)} fullWidth />
                          </dl>
                        </div>
                      </section>
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-amber-50 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700">희망직무 특성 (ลักษณะงานที่ต้องการ)</h4>
                        </div>
                        <div className="p-4">
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            <DetailRow label={FIELD_LABELS.desiredJobNotes} value={v(selected.other_notes || selected.desired_positions)} fullWidth />
                            <DetailRow label={FIELD_LABELS.desiredPositionOrTitle} value={v(selected.desired_positions)} fullWidth />
                            <DetailRow label={FIELD_LABELS.expectedSalary} value={v(selected.desired_salary)} />
                            <DetailRow label={FIELD_LABELS.desiredWorkLocations} value={v(selected.desired_work_locations)} fullWidth />
                            <DetailRow label={FIELD_LABELS.desiredWorkType} value={v(selected.employment_type_preference)} />
                            <DetailRow label={FIELD_LABELS.workStartAvailable} value={v(selected.start_date_available)} />
                          </dl>
                        </div>
                      </section>
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-sky-50 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700">학력 (ประวัติการศึกษา)</h4>
                        </div>
                        <div className="p-4">
                          {(() => {
                            const entries = (selected.parsed_data?.education_entries as Array<{ institution?: string; year?: string; education_level?: string; faculty?: string; major?: string; qualification?: string; gpa?: string }>) ?? [];
                            if (entries.length > 0) {
                              return (
                                <dl className="space-y-4 text-sm">
                                  {entries.map((entry, idx) => {
                                    const fallback = idx === 0 ? selected : null;
                                    return (
                                      <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-2">
                                        <div className="font-medium text-slate-700">학력 {idx + 1}</div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                          <DetailRow label="대학교/기관" value={v(entry.institution)} />
                                          <DetailRow label="졸업년도" value={v(entry.year)} />
                                          <DetailRow label={FIELD_LABELS.educationLevel} value={v(entry.education_level ?? fallback?.education_level)} />
                                          <DetailRow label={FIELD_LABELS.faculty} value={v(entry.faculty ?? fallback?.faculty)} />
                                          <DetailRow label={FIELD_LABELS.major} value={v(entry.major ?? fallback?.major)} />
                                          <DetailRow label={FIELD_LABELS.qualification} value={v(entry.qualification ?? fallback?.qualification)} />
                                          <DetailRow label={FIELD_LABELS.gpa} value={v(entry.gpa ?? fallback?.gpa)} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </dl>
                              );
                            }
                            return (
                              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                <DetailRow label={FIELD_LABELS.educationMajor} value={educationMajor} fullWidth />
                                <DetailRow label={FIELD_LABELS.educationLevel} value={v(selected.education_level)} />
                                <DetailRow label={FIELD_LABELS.faculty} value={v(selected.faculty)} />
                                <DetailRow label={FIELD_LABELS.major} value={v(selected.major)} />
                                <DetailRow label={FIELD_LABELS.qualification} value={v(selected.qualification)} />
                                <DetailRow label={FIELD_LABELS.gpa} value={v(selected.gpa)} />
                              </dl>
                            );
                          })()}
                        </div>
                      </section>
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-sky-50 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700">경력 (ประวัติการทำงาน)</h4>
                        </div>
                        <div className="p-4">
                          {(() => {
                            const expEntries = (selected.parsed_data?.experience_entries as Array<{ company_name?: string; period?: string; work_location?: string; position?: string; salary?: string; level?: string; department?: string; responsibilities?: string }>) ?? [];
                            if (expEntries.length > 0) {
                              return (
                                <dl className="space-y-4 text-sm">
                                  {expEntries.map((entry, idx) => (
                                    <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-2">
                                      <div className="font-medium text-slate-700">경력 {idx + 1}</div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                        <DetailRow label="근무회사명" value={v(entry.company_name)} />
                                        <DetailRow label="근무기간" value={v(entry.period)} />
                                        <DetailRow label="근무 지역" value={v(entry.work_location)} />
                                        <DetailRow label="직책" value={v(entry.position)} />
                                        <DetailRow label="급여" value={v(entry.salary)} />
                                        <DetailRow label="수준" value={v(entry.level)} />
                                        <DetailRow label="담당부서" value={v(entry.department)} />
                                        {entry.responsibilities ? (
                                          <div className="sm:col-span-2">
                                            <span className="text-slate-500 font-medium">담당부서 및 역할</span>
                                            <div className="mt-1 text-gray-700 whitespace-pre-wrap">{entry.responsibilities}</div>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </dl>
                              );
                            }
                            return (
                              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                <DetailRow label={FIELD_LABELS.lastWorking1} value={v(selected.last_working_1)} />
                                <DetailRow label={FIELD_LABELS.lw1Period} value={v(selected.lw1_period)} />
                                <DetailRow label={FIELD_LABELS.lastWorking2} value={v(selected.last_working_2)} />
                                <DetailRow label={FIELD_LABELS.lw2Period} value={v(selected.lw2_period)} />
                                <DetailRow label={FIELD_LABELS.lastWorking3} value={v(selected.last_working_3)} />
                                <DetailRow label={FIELD_LABELS.lw3Period} value={v(selected.lw3_period)} />
                                <DetailRow label={FIELD_LABELS.experience} value={v(selected.experience)} fullWidth />
                              </dl>
                            );
                          })()}
                        </div>
                      </section>
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-sky-50 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700">교육 이력/자격증</h4>
                        </div>
                        <div className="p-4">
                          {(() => {
                            const tcEntries = (selected.parsed_data?.training_cert_entries as Array<{ institution?: string; period?: string; course?: string; certificate?: string }>) ?? [];
                            if (tcEntries.length > 0) {
                              return (
                                <dl className="space-y-4 text-sm">
                                  {tcEntries.map((entry, idx) => (
                                    <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-2">
                                      <div className="font-medium text-slate-700">교육/자격 {idx + 1}</div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                        <DetailRow label="교육기관" value={v(entry.institution)} />
                                        <DetailRow label="교육기간" value={v(entry.period)} />
                                        <DetailRow label="과정" value={v(entry.course)} fullWidth />
                                        {entry.certificate ? (
                                          <DetailRow label="자격증/졸업증서" value={v(entry.certificate)} fullWidth />
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </dl>
                              );
                            }
                            return (
                              <p className="text-sm text-slate-500">-</p>
                            );
                          })()}
                        </div>
                      </section>
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-sky-50 border-b border-slate-200">
                          <h4 className="text-sm font-semibold text-slate-700">기타(능력,성과,경력)</h4>
                        </div>
                        <div className="p-4">
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            <DetailRow label={FIELD_LABELS.currentSalary} value={v(selected.salary)} />
                            <DetailRow label={FIELD_LABELS.languageSkills} value={v(selected.language_skills)} fullWidth />
                            <DetailRow label="타이핑 속도" value={v((selected.parsed_data as Record<string, unknown>)?.typing_speed as string)} />
                            <DetailRow label="특수 능력" value={v((selected.parsed_data as Record<string, unknown>)?.special_skills as string)} fullWidth />
                            <DetailRow label={FIELD_LABELS.otherSkills} value={v(selected.skills)} fullWidth />
                            <DetailRow label="성과 / 프로젝트" value={v((selected.parsed_data as Record<string, unknown>)?.achievements as string)} fullWidth />
                            <DetailRow label="참조인" value={v((selected.parsed_data as Record<string, unknown>)?.references as string)} />
                          </dl>
                        </div>
                      </section>
                    </>
                  );
                }

                const rows: { label: string; value: string | ReactNode; fullWidth?: boolean }[] = [
                  { label: FIELD_LABELS.applicationNo, value: v(selected.applicant_id) },
                  { label: FIELD_LABELS.applicationDate, value: v(selected.application_date) },
                  { label: FIELD_LABELS.fullName, value: fullName },
                  { label: FIELD_LABELS.firstName, value: v(selected.applicant_name) },
                  { label: FIELD_LABELS.surname, value: v(selected.applicant_surname) },
                  { label: FIELD_LABELS.birthYear, value: birthYear ?? '-' },
                  { label: FIELD_LABELS.dateOfBirthFull, value: v(selected.date_of_birth) },
                  { label: FIELD_LABELS.lastResumeModified, value: v(selected.update_date) },
                  { label: FIELD_LABELS.age, value: v(selected.age) },
                  { label: FIELD_LABELS.phoneNumber, value: v(selected.applicant_phone) },
                  { label: FIELD_LABELS.email, value: v(selected.applicant_email) },
                  { label: FIELD_LABELS.lineId, value: v(selected.line_id) },
                  { label: FIELD_LABELS.originalFilename, value: v(selected.original_filename) },
                  { label: FIELD_LABELS.positionAppliedFor, value: v(selected.applied_position) },
                  { label: FIELD_LABELS.appropriatePosition, value: v(selected.desired_positions) },
                  { label: FIELD_LABELS.educationMajor, value: educationMajor },
                  { label: FIELD_LABELS.educationLevel, value: v(selected.education_level) },
                  { label: FIELD_LABELS.faculty, value: v(selected.faculty) },
                  { label: FIELD_LABELS.major, value: v(selected.major) },
                  { label: FIELD_LABELS.qualification, value: v(selected.qualification) },
                  { label: FIELD_LABELS.gpa, value: v(selected.gpa) },
                  { label: FIELD_LABELS.companyName, value: v(selected.company_name) },
                  { label: FIELD_LABELS.businessType, value: v(selected.business_type) },
                  { label: FIELD_LABELS.position, value: v(selected.position) },
                  { label: FIELD_LABELS.employmentPeriod, value: v(selected.employment_period) },
                  { label: FIELD_LABELS.expectedSalary, value: v(selected.desired_salary) },
                  { label: FIELD_LABELS.currentSalary, value: v(selected.salary) },
                  { label: FIELD_LABELS.currentAddress, value: v(selected.address), fullWidth: true },
                  { label: FIELD_LABELS.lastWorking1, value: v(selected.last_working_1) },
                  { label: FIELD_LABELS.lw1Period, value: v(selected.lw1_period) },
                  { label: FIELD_LABELS.lastWorking2, value: v(selected.last_working_2) },
                  { label: FIELD_LABELS.lw2Period, value: v(selected.lw2_period) },
                  { label: FIELD_LABELS.lastWorking3, value: v(selected.last_working_3) },
                  { label: FIELD_LABELS.lw3Period, value: v(selected.lw3_period) },
                  { label: FIELD_LABELS.experience, value: v(selected.experience), fullWidth: true },
                  { label: FIELD_LABELS.summary, value: v(selected.summary), fullWidth: true },
                  { label: FIELD_LABELS.desiredWorkLocations, value: v(selected.desired_work_locations), fullWidth: true },
                  { label: FIELD_LABELS.startDateAvailable, value: v(selected.start_date_available) },
                  { label: FIELD_LABELS.languageSkills, value: v(selected.language_skills), fullWidth: true },
                  { label: FIELD_LABELS.otherSkills, value: v(selected.skills), fullWidth: true },
                  { label: FIELD_LABELS.trainingInfo, value: v(selected.training_info), fullWidth: true },
                  { label: FIELD_LABELS.certificationLicense, value: v(selected.certification_license), fullWidth: true },
                  { label: FIELD_LABELS.nationality, value: v(selected.nationality) },
                  { label: FIELD_LABELS.gender, value: v(selected.gender) },
                  { label: FIELD_LABELS.religion, value: v(selected.religion) },
                  { label: FIELD_LABELS.maritalStatus, value: v(selected.marital_status) },
                  { label: FIELD_LABELS.heightWeight, value: v(selected.height_weight) },
                  { label: FIELD_LABELS.height, value: v(selected.height) },
                  { label: FIELD_LABELS.weight, value: v(selected.weight) },
                  { label: FIELD_LABELS.militaryStatus, value: v(selected.military_status) },
                  { label: FIELD_LABELS.employmentTypePreference, value: v(selected.employment_type_preference) },
                  { label: FIELD_LABELS.canWorkBangkok, value: v(selected.can_work_bangkok) },
                  { label: FIELD_LABELS.canWorkProvinces, value: v(selected.can_work_provinces) },
                  { label: FIELD_LABELS.willingWorkAbroad, value: v(selected.willing_work_abroad) },
                  { label: FIELD_LABELS.occupationField, value: v(selected.occupation_field) },
                  { label: FIELD_LABELS.subOccupation, value: v(selected.sub_occupation) },
                  { label: FIELD_LABELS.vehiclesOwned, value: v(selected.vehicles_owned), fullWidth: true },
                  { label: FIELD_LABELS.drivingLicense, value: v(selected.driving_license) },
                  { label: FIELD_LABELS.drivingAbility, value: v(selected.driving_ability) },
                  { label: FIELD_LABELS.linkedinUrl, value: selected.linkedin_url ? <a href={selected.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline break-all">{selected.linkedin_url}</a> : '-' },
                  { label: FIELD_LABELS.facebookUrl, value: selected.facebook_url ? <a href={selected.facebook_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline break-all">{selected.facebook_url}</a> : '-' },
                  { label: FIELD_LABELS.updateDate, value: v(selected.update_date) },
                  { label: FIELD_LABELS.sectionsIntro, value: v(selected.sections_intro), fullWidth: true },
                  { label: FIELD_LABELS.sectionsSkills, value: v(selected.sections_skills), fullWidth: true },
                  { label: FIELD_LABELS.sectionsExperience, value: v(selected.sections_experience), fullWidth: true },
                  { label: FIELD_LABELS.sectionsEducation, value: v(selected.sections_education), fullWidth: true },
                  { label: FIELD_LABELS.otherNotes, value: v(selected.other_notes), fullWidth: true },
                  { label: FIELD_LABELS.jobPosting, value: v(selected.job_posting_title) },
                  { label: FIELD_LABELS.form, value: FORM_LABELS[selected.form_type] ?? String(selected.form_type) },
                  { label: FIELD_LABELS.language, value: LANG_LABELS[selected.document_language] ?? selected.document_language },
                  { label: FIELD_LABELS.status, value: v(selected.status) },
                ];
                return (
                  <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-blue-50 border-b border-slate-200">
                      <h4 className="text-sm font-semibold text-slate-700">지원서 상세 정보</h4>
                    </div>
                    <div className="p-4">
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                        {rows.map((r) => (
                          <DetailRow key={r.label} label={r.label} value={r.value} fullWidth={r.fullWidth} />
                        ))}
                      </dl>
                    </div>
                  </section>
                );
              })()}

              {/* 원본 데이터 (접이식) */}
              {(selected.parsed_data || selected.raw_text) && (
                <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
                    <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">원본 데이터</h4>
                  </div>
                  <div className="p-4 space-y-4">
                    {selected.raw_text && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1.5">추출 원문</p>
                        <pre className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap text-slate-700">
                          {selected.raw_text}
                        </pre>
                      </div>
                    )}
                    {selected.parsed_data && typeof selected.parsed_data === 'object' && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1.5">파싱 JSON</p>
                        <pre className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-xs overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap text-slate-700">
                          {JSON.stringify(selected.parsed_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
