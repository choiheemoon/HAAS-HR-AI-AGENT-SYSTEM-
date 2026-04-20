'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, Printer, RefreshCw, Save, Search } from 'lucide-react';
import { apiClient, getEmployeePhotoImageUrl } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import { emptyMasterExt, loadMasterExt, type MasterExtFields } from '@/lib/employeeMasterExtension';
import {
  fetchPerCompanyAddressGeoMinorMaps,
  fetchPerCompanyCertificationMinorMaps,
  fetchPerCompanyEducationMinorMaps,
} from '@/lib/educationMinorLookup';
import PersonnelRecordCard, { type PersonnelRecordBundle } from '@/components/employees/PersonnelRecordCard';
import { pickCompanyDisplayName } from '@/lib/companyDisplayName';
import {
  buildCertificateDocumentNumber,
  HrCertificateDocument,
  createDefaultProbationEvaluationData,
  type HrCertificateKind,
  type ProbationEvaluationData,
} from '@/components/employees/HrCertificateDocument';

type CompanyOption = {
  id: number;
  company_code: string;
  name_kor?: string | null;
  name_thai?: string | null;
  name_eng?: string | null;
};

type EmployeeRow = {
  id: number;
  name: string;
  employee_number: string;
  company_id?: number | null;
};

type RefItem = {
  code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

const REF_CATEGORIES = [
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
] as const;

function mergeMasterExtWithEmployee(emp: Record<string, unknown>, employeeId: number): MasterExtFields {
  const extLoaded = loadMasterExt(employeeId);
  const merged = { ...extLoaded };
  const hasManual = Boolean(merged.name_en_first || merged.name_en_last);
  const nameEn = emp.name_en != null ? String(emp.name_en).trim() : '';
  if (!hasManual && nameEn) {
    const parts = nameEn.split(/\s+/);
    if (parts.length >= 1) merged.name_en_first = parts[0];
    if (parts.length >= 2) merged.name_en_last = parts.slice(1).join(' ');
  }
  const take = (v: unknown) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
  const sp = take(emp.salary_process_type);
  if (sp) merged.salary_process_type = sp;
  const div = take(emp.division);
  if (div) merged.division = div;
  const wp = take(emp.work_place);
  if (wp) merged.workplace = wp;
  const ar = take(emp.area);
  if (ar) merged.area = ar;
  const ws = take(emp.work_status);
  if (ws) merged.work_status = ws;
  const el = take(emp.employee_level);
  if (el) merged.emp_level = el;
  const photo = take(emp.photo_path);
  if (photo) merged.photo_data_url = getEmployeePhotoImageUrl(employeeId);
  return merged;
}

function emptyBundle(locale: string): PersonnelRecordBundle {
  return {
    employee: null,
    personal: null,
    address: null,
    families: [],
    educations: [],
    certifications: [],
    careers: [],
    languages: [],
    masterExt: emptyMasterExt(),
    orgRef: {},
    companyName: '',
    companyNameKor: null,
    companyRepresentativeName: null,
    companyAddress: null,
    companyLogoUrl: null,
    locale,
    educationMinorMaps: null,
    addressGeoMaps: null,
    certificationMinorMaps: null,
  };
}

function toThaiDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return '';
  }
}

function toLocalizedDateText(d: Date, locale: string): string {
  try {
    if (locale === 'th') return toThaiDate(d);
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return '';
  }
}

function buildWarningLetterBody(params: {
  issueDate: Date;
  locale: string;
  employeeName: string;
  employeeNumber: string;
  position: string;
  department: string;
}): string {
  const issueDateText = toLocalizedDateText(params.issueDate, params.locale) || '.............................................';
  const employeeName = params.employeeName || '.............................................';
  const employeeNumber = params.employeeNumber || '.............................................';
  const position = params.position || '.............................................';
  const department = params.department || '.............................................';
  if (params.locale === 'en') {
    return `Warning Letter
Date  ${issueDateText}

Subject\tWarning for violating working regulations / announcements / company orders of Thai Atech Solution Co., Ltd.

To\tMr. ${employeeName}  Employee ID  ${employeeNumber}  Position  ${position}   Department  ${department}

\tOn 28 January 2026, Mr. Sawat Metta filled resin incorrectly. Resin intended for MC #3 was added to MC #2, causing mixed resin pellets and resulting damage: products were produced in the wrong color and unusable. Resin loss totaled 50 kilograms, with estimated damage of THB 10,000. This action is considered a violation of the working rules, announcements, and orders of Thai Atech Solution Co., Ltd. Therefore, the Company issues this warning letter with details as follows:

Chapter 8 Discipline and Disciplinary Measures
Clause 1. Discipline on working
1.1    Employees shall respect and strictly observe all company working regulations.
1.26  Employees shall obey and comply with legitimate orders and regulations of the company and supervisors, without rude, aggressive, or insubordinate behavior.
3.1    Employees shall be responsible for assigned duties and shall not be negligent or careless to the extent of causing damage to the company's work/property or endangering others or themselves.

Therefore, to ensure acknowledgment of the violation and immediate improvement/cessation of such behavior, the employer imposes the following disciplinary action:

\t\t•  Written warning • 1st warning  Date .............................................


\tI, ${employeeName}, acknowledge the above violation and disciplinary decision, and confirm that I will immediately improve my behavior. If I repeat the violation, I consent to disciplinary action according to company regulations.


Signature  ....................................................Employee\t\t\t    Signature ............................................. Department Manager  
          ( ${employeeName} )                                                        (                                    )

Signature..................................................  Witness    \t    \t\t    Signature................................................... Witness
          (                                  ) \t\t\t                      (                                    )`;
  }
  if (params.locale === 'ko') {
    return `경고장
날짜  ${issueDateText}

제목\t태국 에이텍 솔루션(주) 취업규칙 / 공지 / 지시 위반에 대한 경고

수신\t.............................................  사번  .............................................  직책  .............................................   부서  .............................................

\t2026년 1월 28일, .............................................은(는) 수지 투입 작업 중 오류를 발생시켜 MC #3용 수지를 MC #2에 투입하였습니다. 이로 인해 수지 혼입이 발생하였고, 제품 색상 불량으로 사용 불가 판정 및 수지 50kg 손실이 발생하였습니다. 손해 금액은 10,000바트로 산정됩니다. 위 행위는 회사 규정/공지/지시 위반에 해당하므로 아래와 같이 경고합니다.

제8장 징계 및 처벌 (Chapter 8 Discipline and Disciplinary Measures)
제1조 근무 규율 (Discipline on working)
1.1    직원은 회사의 근무 규정을 준수해야 합니다.
1.26  직원은 상사의 정당한 지시와 회사 규정을 준수해야 하며, 무례하거나 공격적인 태도를 보여서는 안 됩니다.
3.1    직원은 본인의 업무를 성실히 수행하고, 부주의로 회사 재산/업무에 손해를 끼치거나 타인·본인에게 위험을 초래해서는 안 됩니다.

따라서 귀하가 본 위반 사실을 인지하고 즉시 개선/중단하도록 아래와 같이 징계합니다.

\t\t•  서면 경고 • 1차  일자


\t본인 .............................................은(는) 상기 위반 사실 및 징계 내용을 확인하였으며, 즉시 개선할 것을 확인합니다. 재위반 시 회사 규정에 따른 추가 징계에 동의합니다.


서명  ....................................................직원\t\t\t    서명 ............................................. Department Manager  
          ( ............................................. )                                                        (                                    )

서명..................................................  증인    \t    \t\t    서명................................................... 증인
          (                                  ) \t\t\t                      (                                    )`;
  }
  return `หนังสือเตือน
วันที่  ${issueDateText}

เรื่อง\tตักเตือนพฤติกรรมฝ่าฝืนกฎระเบียบ ข้อบังคับเกี่ยวกับการทำงาน / ประกาศ / คำสั่งของ  บริษัท ไทย เอเทค โซลูชั่น จำกัด

เรียน\tนาย ${employeeName}  รหัสพนักงาน  ${employeeNumber}  ตำแหน่ง  ${position}   แผนก  ${department}

\tเมื่อวันที่ 28 มกราคม 2569  นายสวัสดิ์ เมตตา ได้เติมเรซิ่นผิด โดยนำเรซิ่นสำหรับเติมเครื่อง MC #3 ไปเติมที่เครื่อง MC # 2 ทำให้เม็ดเรซิ่นปนกัน เกิดความเสียหาย คือชิ้นงานออกมาผิดสีใช้งานไม่ได้ และเสียเรซิ่นไปจำนวน 50 กิโลกรัม คิดความเป็นหายเป็นเงิน 10,000 บาท ซึ่งการกระทำดังกล่าวถือว่าพนักงานมีเจตนาฝ่าฝืน ข้อบังคับของ ประกาศ/คำสั่ง ของ บริษัท ไทย เอเทค โซลูชั่น จำกัด บริษัทฯ ต้องออกเอกสารตักเตือนโดยมีรายละเอียดดังนี้

หมวดที่ 8 วินัยและการลงโทษ Chapter 8 Discipline and Disciplinary Measures
ข้อ 1. ระเบียบวินัยเกี่ยวกับการทำงาน  (Discipline on working)
1.1    พนักงานต้องเคารพ และปฏิบัติตามระเบียบข้อบังคับในการปฏิบัติงานของบริษัทฯ ทุกข้อโดยเคร่งครัด
        The employees shall respect and strictly observe the company’s working regulations.
1.26  พนักงานต้องเชื่อฟัง และปฏิบัติตามคำสั่งอันชอบด้วยกฎหมายและระเบียบข้อบังคับของบริษัทฯ หรือของผู้บังคับบัญชาของตน โดยไม่แสดงอาการ      หยาบคาย ก้าวร้าว หรือกระด้างกระเดื่องต่อผู้บังคับบัญชา
         The employees shall obey and comply with the legitimate orders and the regulations of the company or their supervisors, without expressing rude, aggressive or obstinate manners.
3.1    พนักงานต้องรับผิดชอบในหน้าที่ ไม่ประมาทเลินเล่อ ขาดความระมัดระวังจนเป็นเหตุให้เกิดความเสียหายต่องาน ทรัพย์สินของบริษัทฯ หรือเป็นอันตรายต่อผู้อื่น หรือต่อตนเอง
The employees shall be responsible for their tasks, not be careless or lacking precautions to the extent of causing damage to the company’s works or property or endangering others of themselves.

ดังนั้นเพื่อให้ท่านได้รับทราบความผิดและปรับปรุง / ยุติพฤติกรรมดังกล่าวทันทีในฐานะนายจ้างจึงพิจารณาลงโทษท่านโดยการ
\t\t
\t\t•  ตักเตือนด้วยลายลักษณ์อักษร • ครั้งที่ 1  วันที่ .............................................


\tข้าพเจ้า นาย ${employeeName} ได้รับทราบการกระทำความผิดและการพิจารณาลงโทษข้างต้นแล้ว และข้าพเจ้ายืนยันว่าจะปรับปรุงแก้ไขพฤติกรรมทันทีหากข้าพเจ้ากระทำผิดซ้ำคำเตือน ข้าพเจ้ายินยอมให้บริษัทฯ ลงโทษตามระเบียบข้อบังคับต่อไป


ลงชื่อ  ....................................................พนักงาน\t\t\t    ลงชื่อ ............................................. Department Manager  
          ( ${employeeName} )                                                        (                                    )

ลงชื่อ..................................................  พยาน    \t    \t\t    ลงชื่อ................................................... พยาน
          (                                  ) \t\t\t                      (                                    )`;
}

export default function PersonnelRecordCardPage() {
  const { t, locale } = useI18n();
  const { can, loading: permLoading } = useMenuPermissions();
  const allowRead = can('hr-master-inquiry', 'can_read');

  const printRef = useRef<HTMLDivElement>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingCard, setLoadingCard] = useState(false);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [saveWorking, setSaveWorking] = useState(false);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [bundle, setBundle] = useState<PersonnelRecordBundle>(() => emptyBundle(locale));
  const [recordView, setRecordView] = useState<'card' | HrCertificateKind>('card');
  const [certSubmitTo, setCertSubmitTo] = useState('');
  const [certPurpose, setCertPurpose] = useState('');
  const [certRemarks, setCertRemarks] = useState('');
  const [certEmploymentPosition, setCertEmploymentPosition] = useState('');
  const [certEmploymentDuty, setCertEmploymentDuty] = useState('');
  const [certEmploymentSalary, setCertEmploymentSalary] = useState('');
  const [certEmploymentBenefits, setCertEmploymentBenefits] = useState('');
  const [contractWitness1, setContractWitness1] = useState('');
  const [contractWitness2, setContractWitness2] = useState('');
  const [warningTitle, setWarningTitle] = useState('');
  const [warningBody, setWarningBody] = useState('');
  const [warningReason, setWarningReason] = useState('');
  const [warningActionRequired, setWarningActionRequired] = useState('');
  const [warningIssuerName, setWarningIssuerName] = useState('');
  const [warningIssuerSignatureDataUrl, setWarningIssuerSignatureDataUrl] = useState<string | null>(null);
  const [probationSignerName, setProbationSignerName] = useState('');
  const [probationSignatureDataUrl, setProbationSignatureDataUrl] = useState<string | null>(null);
  const [probationEvaluationData, setProbationEvaluationData] = useState<ProbationEvaluationData>(
    () => createDefaultProbationEvaluationData()
  );
  const isCertificateView = recordView !== 'card';

  const applyEmployeeSearch = useCallback(
    (rawTerm: string, notifyWhenEmpty: boolean) => {
      const q = rawTerm.trim().toLowerCase();
      setAppliedSearchTerm(rawTerm);
      if (!notifyWhenEmpty || !q) return;
      const hasMatch = employees.some(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.employee_number.toLowerCase().includes(q)
      );
      if (!hasMatch) {
        alert(t('employees.personnelRecord.searchNoResult', '검색 결과가 없습니다.'));
      }
    },
    [employees, t]
  );

  const companyLabelById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of companies) {
      m.set(c.id, pickCompanyDisplayName(c, locale));
    }
    return m;
  }, [companies, locale]);

  const filteredEmployees = useMemo(() => {
    const q = appliedSearchTerm.trim().toLowerCase();
    return employees.filter((e) => {
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.employee_number.toLowerCase().includes(q)
      );
    });
  }, [employees, appliedSearchTerm]);

  useEffect(() => {
    setBundle((prev) => ({ ...prev, locale }));
  }, [locale]);

  useEffect(() => {
    setCertSubmitTo('');
    setCertPurpose('');
    setCertRemarks('');
    setCertEmploymentPosition('');
    setCertEmploymentDuty('');
    setCertEmploymentSalary('');
    setCertEmploymentBenefits('');
    setContractWitness1('');
    setContractWitness2('');
    setWarningTitle(t('employees.certificate.tabWarningLetter', '경고장'));
    setWarningBody('');
    setWarningReason('아래 사유로 경고합니다.');
    setWarningActionRequired('재발 방지를 위해 즉시 개선 바랍니다.');
    setWarningIssuerName('');
    setWarningIssuerSignatureDataUrl(null);
    setProbationSignerName('');
    setProbationSignatureDataUrl(null);
    setProbationEvaluationData(createDefaultProbationEvaluationData());
    setSavedSignature(null);
    setSaveMessage('');
  }, [selectedEmployeeId, t]);

  const [certIssueDate, setCertIssueDate] = useState(() => new Date());
  useEffect(() => {
    setCertIssueDate(new Date());
  }, [selectedEmployeeId]);
  useEffect(() => {
    if (recordView !== 'warningLetter') return;
    const name = String(bundle.employee?.name ?? '').trim();
    const employeeNumber = String(bundle.employee?.employee_number ?? '').trim();
    const position = String(bundle.employee?.position ?? '').trim();
    const department = String(bundle.employee?.department ?? '').trim();
    const next = buildWarningLetterBody({
      issueDate: certIssueDate,
      locale,
      employeeName: name,
      employeeNumber,
      position,
      department,
    });
    if (!warningBody.trim()) {
      setWarningBody(next);
    }
  }, [recordView, bundle.employee, certIssueDate, locale, warningBody]);
  useEffect(() => {
    setSaveMessage('');
  }, [recordView]);

  const certSignature = useMemo(() => {
    if (!isCertificateView) return '';
    return JSON.stringify({
      employeeId: selectedEmployeeId,
      recordView,
      issueDate: certIssueDate.toISOString().slice(0, 10),
      certSubmitTo,
      certPurpose,
      certRemarks,
      certEmploymentPosition,
      certEmploymentDuty,
      certEmploymentSalary,
      certEmploymentBenefits,
      contractWitness1,
      contractWitness2,
      warningTitle,
      warningBody,
      warningReason,
      warningActionRequired,
      warningIssuerName,
      warningIssuerSignatureDataUrl,
      probationSignerName,
      probationSignatureDataUrl,
      probationEvaluationData,
    });
  }, [
    isCertificateView,
    selectedEmployeeId,
    recordView,
    certIssueDate,
    certSubmitTo,
    certPurpose,
    certRemarks,
    certEmploymentPosition,
    certEmploymentDuty,
    certEmploymentSalary,
    certEmploymentBenefits,
    contractWitness1,
    contractWitness2,
    warningTitle,
    warningBody,
    warningReason,
    warningActionRequired,
    warningIssuerName,
    warningIssuerSignatureDataUrl,
    probationSignerName,
    probationSignatureDataUrl,
    probationEvaluationData,
  ]);
  const canOutput = !!selectedEmployeeId && !loadingCard && (!isCertificateView || savedSignature === certSignature);
  const certDocumentNumber =
    selectedEmployeeId != null && selectedEmployeeId > 0 && isCertificateView
      ? buildCertificateDocumentNumber(certIssueDate, selectedEmployeeId, recordView)
      : '';

  const toLocalIsoDate = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleSaveCertificate = async () => {
    if (!selectedEmployeeId || !bundle.employee || !isCertificateView) return;
    setSaveWorking(true);
    setSaveMessage('');
    try {
      await apiClient.createEmployeeCertificateIssue(selectedEmployeeId, {
        certificate_kind: recordView,
        issue_date: toLocalIsoDate(certIssueDate),
        submit_to: certSubmitTo || null,
        purpose: certPurpose || null,
        remarks: certRemarks || null,
        employment_position: certEmploymentPosition || null,
        employment_duty: certEmploymentDuty || null,
        employment_salary: certEmploymentSalary || null,
        employment_benefits: certEmploymentBenefits || null,
        labor_contract_witness1: contractWitness1 || null,
        labor_contract_witness2: contractWitness2 || null,
        probation_signer_name: probationSignerName || null,
        payload_json: {
          bundle,
          certificate: {
            kind: recordView,
            issueDate: toLocalIsoDate(certIssueDate),
            submitTo: certSubmitTo,
            purpose: certPurpose,
            remarks: certRemarks,
            employmentPosition: certEmploymentPosition,
            employmentDuty: certEmploymentDuty,
            employmentSalary: certEmploymentSalary,
            employmentBenefits: certEmploymentBenefits,
            laborContractWitness1: contractWitness1,
            laborContractWitness2: contractWitness2,
            warningTitle,
            warningBody,
            warningReason,
            warningActionRequired,
            warningIssuerName,
            warningIssuerSignatureDataUrl,
            probationSignerName,
            probationSignatureDataUrl,
            probationEvaluationData,
            documentNumber: certDocumentNumber,
          },
        },
      });
      setSavedSignature(certSignature);
      setSaveMessage(t('employees.personnelRecord.saveOk', '증명서가 저장되었습니다. 이제 인쇄/PDF 저장이 가능합니다.'));
    } catch {
      setSaveMessage(t('employees.personnelRecord.saveError', '증명서 저장에 실패했습니다.'));
    } finally {
      setSaveWorking(false);
    }
  };

  const fetchOrgRef = useCallback(async (companyId: number) => {
    const res = await apiClient.getEmployeeReferenceItemsAllCategories(companyId);
    const data = (res.data as Record<string, RefItem[]>) ?? {};
    const next: PersonnelRecordBundle['orgRef'] = {};
    for (const cat of REF_CATEGORIES) {
      const list = data[cat];
      next[cat] = Array.isArray(list) ? list : [];
    }
    return next;
  }, []);

  const loadEmployees = useCallback(async () => {
    setLoadingList(true);
    try {
      const res =
        selectedCompanyId == null
          ? await apiClient.getEmployees()
          : await apiClient.getEmployees({ company_id: selectedCompanyId });
      const list = (res.data as EmployeeRow[]) ?? [];
      setEmployees(list);
    } catch {
      setEmployees([]);
    } finally {
      setLoadingList(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (permLoading || !allowRead) return;
    void (async () => {
      try {
        const companyRes = await apiClient.getMyCompanies();
        setCompanies((companyRes.data as CompanyOption[]) ?? []);
      } catch {
        setCompanies([]);
      }
    })();
  }, [permLoading, allowRead]);

  useEffect(() => {
    if (permLoading || !allowRead) return;
    void loadEmployees();
  }, [permLoading, allowRead, loadEmployees]);

  const loadCard = useCallback(
    async (employeeId: number) => {
      setLoadingCard(true);
      try {
        const empRes = await apiClient.getEmployee(employeeId);
        const emp = (empRes.data as Record<string, unknown>) ?? null;
        const cid = (emp?.company_id as number | null) ?? null;

        const [personalRes, addrRes, famRes, eduRes, certRes, carRes, langRes] = await Promise.allSettled([
          apiClient.getEmployeePersonalInfo(employeeId),
          apiClient.getEmployeeAddressInfo(employeeId),
          apiClient.getEmployeeFamilies(employeeId),
          apiClient.getEmployeeEducations(employeeId),
          apiClient.getEmployeeCertifications(employeeId),
          apiClient.getEmployeeCareers(employeeId),
          apiClient.getEmployeeLanguages(employeeId),
        ]);

        const personal =
          personalRes.status === 'fulfilled' ? ((personalRes.value.data as Record<string, unknown>) ?? null) : null;
        const address =
          addrRes.status === 'fulfilled' ? ((addrRes.value.data as Record<string, unknown> | null) ?? null) : null;
        const families =
          famRes.status === 'fulfilled' ? ((famRes.value.data as Record<string, unknown>[]) ?? []) : [];
        const educations =
          eduRes.status === 'fulfilled' ? ((eduRes.value.data as Record<string, unknown>[]) ?? []) : [];
        const certifications =
          certRes.status === 'fulfilled' ? ((certRes.value.data as Record<string, unknown>[]) ?? []) : [];
        const careers =
          carRes.status === 'fulfilled' ? ((carRes.value.data as Record<string, unknown>[]) ?? []) : [];
        const languages =
          langRes.status === 'fulfilled' ? ((langRes.value.data as Record<string, unknown>[]) ?? []) : [];

        let orgRef: PersonnelRecordBundle['orgRef'] = {};
        let educationMinorMaps = null;
        let addressGeoMaps = null;
        let certificationMinorMaps = null;
        let companyLogoUrl: string | null = null;
        let companyNameKor: string | null = null;
        let companyRepresentativeName: string | null = null;
        let companyAddress: string | null = null;
        let companyNameFromApi = '';
        if (cid != null) {
          const [orgResult, eduM, addrM, certM, compRes] = await Promise.all([
            fetchOrgRef(cid).catch(() => ({} as PersonnelRecordBundle['orgRef'])),
            fetchPerCompanyEducationMinorMaps(cid),
            fetchPerCompanyAddressGeoMinorMaps(cid),
            fetchPerCompanyCertificationMinorMaps(cid),
            apiClient.getCompany(cid).catch(() => ({ data: {} })),
          ]);
          orgRef = orgResult;
          educationMinorMaps = eduM;
          addressGeoMaps = addrM;
          certificationMinorMaps = certM;
          const cd = (compRes.data ?? {}) as {
            logo_data_url?: string | null;
            name_kor?: string | null;
            name_eng?: string | null;
            name_thai?: string | null;
            company_code?: string | null;
            representative_director_name?: string | null;
            address_no?: string | null;
            soi?: string | null;
            road?: string | null;
            tumbon?: string | null;
            amphur?: string | null;
            province?: string | null;
            zip_code?: string | null;
          };
          const logoRaw = cd.logo_data_url;
          companyLogoUrl =
            typeof logoRaw === 'string' && logoRaw.trim() !== '' ? logoRaw.trim() : null;
          companyNameKor = typeof cd.name_kor === 'string' && cd.name_kor.trim() !== '' ? cd.name_kor.trim() : null;
          companyRepresentativeName =
            typeof cd.representative_director_name === 'string' && cd.representative_director_name.trim() !== ''
              ? cd.representative_director_name.trim()
              : null;
          const parts = [
            cd.address_no,
            cd.soi,
            cd.road,
            cd.tumbon,
            cd.amphur,
            cd.province,
            cd.zip_code,
          ]
            .map((v) => (typeof v === 'string' ? v.trim() : ''))
            .filter(Boolean);
          companyAddress = parts.length > 0 ? parts.join(' ') : null;
          companyNameFromApi = pickCompanyDisplayName(cd, locale);
        }

        const companyLabelFromList = cid != null ? companyLabelById.get(cid) ?? '' : '';
        const companyName = (companyLabelFromList || companyNameFromApi).trim();

        setBundle({
          employee: emp,
          personal,
          address,
          families,
          educations,
          certifications,
          careers,
          languages,
          masterExt: mergeMasterExtWithEmployee(emp, employeeId),
          orgRef,
          companyName,
          companyNameKor,
          companyRepresentativeName,
          companyAddress,
          companyLogoUrl,
          locale,
          educationMinorMaps,
          addressGeoMaps,
          certificationMinorMaps,
        });
      } catch {
        setBundle(emptyBundle(locale));
      } finally {
        setLoadingCard(false);
      }
    },
    [companyLabelById, fetchOrgRef, locale]
  );

  useEffect(() => {
    if (selectedEmployeeId == null || selectedEmployeeId <= 0) {
      setBundle(emptyBundle(locale));
      return;
    }
    void loadCard(selectedEmployeeId);
  }, [selectedEmployeeId, loadCard, locale]);

  const handlePrint = () => {
    if (!selectedEmployeeId) return;
    window.print();
  };

  const pdfBaseName = () => {
    const num = String(bundle.employee?.employee_number ?? selectedEmployeeId ?? 'employee');
    if (recordView === 'employment') return `employment-certificate-${num}`;
    if (recordView === 'career') return `career-certificate-${num}`;
    if (recordView === 'salary') return `salary-certificate-${num}`;
    if (recordView === 'privacyConsent') return `privacy-consent-${num}`;
    if (recordView === 'laborContract') return `labor-contract-${num}`;
    if (recordView === 'warningLetter') return `warning-letter-${num}`;
    if (recordView === 'probationEvaluation') return `probation-evaluation-form-${num}`;
    if (recordView === 'probationResult') return `probation-result-notice-${num}`;
    return `personnel-record-${num}`;
  };

  const handlePdf = async () => {
    const el = printRef.current;
    if (!el || !selectedEmployeeId) return;
    setPdfWorking(true);
    const photoImg = el.querySelector<HTMLImageElement>('img[data-personnel-record-photo]');
    let photoPrevSrc: string | null = null;
    const blobToDataUrl = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('read'));
        r.readAsDataURL(blob);
      });
    const waitPhotoDecoded = async (img: HTMLImageElement) => {
      if (img.complete && img.naturalWidth > 0) return;
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(() => resolve(), 4000);
        const done = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    };
    try {
      const hasPhoto =
        bundle.employee != null && String(bundle.employee.photo_path ?? '').trim() !== '';
      if (photoImg && hasPhoto) {
        const blob = await apiClient.getEmployeePhotoBlob(selectedEmployeeId);
        if (blob) {
          photoPrevSrc = photoImg.src;
          photoImg.src = await blobToDataUrl(blob);
          await waitPhotoDecoded(photoImg);
          await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        }
      }

      const html2pdf = (await import('html2pdf.js')).default;
      const isCert =
        recordView === 'employment' ||
        recordView === 'career' ||
        recordView === 'salary' ||
        recordView === 'privacyConsent' ||
        recordView === 'laborContract' ||
        recordView === 'warningLetter' ||
        recordView === 'probationEvaluation' ||
        recordView === 'probationResult';
      const isLaborContractPdf = recordView === 'laborContract';
      const certNode = isCert ? el.querySelector<HTMLElement>('.hr-certificate-doc') : null;
      const pdfFrom = certNode && certNode.offsetHeight > 0 ? certNode : el;
      await html2pdf()
        .set({
          /* 증명서는 여백을 줄여 1페이지 수납; 루트 전체 캡처 시 빈 2페이지 방지 위해 .hr-certificate-doc만 사용 */
          margin: [8, 8, 8, 8],
          filename: `${pdfBaseName()}.pdf`,
          image: { type: 'jpeg', quality: 0.92 },
          html2canvas: {
            scale: isCert ? 2 : 2,
            useCORS: true,
            logging: false,
            letterRendering: true,
            ignoreElements: (node: Element) => node.classList?.contains('hr-cert-pdf-ignore') ?? false,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          /* html2pdf.js 플러그인 옵션 — 번들 타입에 없음 */
          ...({
            pagebreak: {
              mode: ['css', 'legacy'],
              /* 근로계약서는 문서 루트를 avoid 하면 전체가 한 덩어리로 캡처되어 페이지가 나뉘지 않음 */
              avoid: isLaborContractPdf
                ? ['.hr-cert-table', '.hr-cert-footer']
                : isCert
                  ? ['.hr-certificate-doc', '.hr-cert-inner', '.hr-cert-table', '.hr-cert-footer']
                  : [
                      '.pr-pdf-avoid-break',
                      '.pr-print-stack',
                      '.personnel-record-card thead tr',
                      '.personnel-record-card tbody tr',
                    ],
            },
          } as Record<string, unknown>),
        } as Record<string, unknown>)
        .from(pdfFrom)
        .save();
    } catch {
      alert(t('employees.personnelRecord.pdfError'));
    } finally {
      if (photoImg && photoPrevSrc !== null) photoImg.src = photoPrevSrc;
      setPdfWorking(false);
    }
  };

  if (permLoading) {
    return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
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

  return (
    <div className="space-y-4">
      <div className="print:hidden bg-white rounded-lg shadow border border-gray-200 p-4 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('employees.personnelRecord.pageTitle')}</h2>
          <p className="text-sm text-gray-600 mt-1">{t('employees.personnelRecord.pageSubtitle')}</p>
        </div>

        <div className="pt-1 pb-3 border-b border-gray-100">
          <p className="text-xs text-gray-500 mb-2">{t('employees.certificate.switchHint')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRecordView('card')}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                recordView === 'card'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t('employees.certificate.tabCard')}
            </button>
            <button
              type="button"
              onClick={() => setRecordView('probationResult')}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                recordView === 'probationResult'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t('employees.certificate.tabProbationResult')}
            </button>
            <button
              type="button"
              onClick={() => setRecordView('probationEvaluation')}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                recordView === 'probationEvaluation'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t('employees.certificate.tabProbationEvaluation')}
            </button>
            <button
              type="button"
              onClick={() => setRecordView('laborContract')}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                recordView === 'laborContract'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t('employees.certificate.tabLaborContract')}
            </button>
            <button
              type="button"
              onClick={() => setRecordView('privacyConsent')}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                recordView === 'privacyConsent'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t('employees.certificate.tabPrivacyConsent')}
            </button>
            <button
              type="button"
              onClick={() => setRecordView('employment')}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                recordView === 'employment'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t('employees.certificate.tabEmployment')}
            </button>
            <button
              type="button"
              onClick={() => setRecordView('career')}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                recordView === 'career'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t('employees.certificate.tabCareer')}
            </button>
            <button
              type="button"
              onClick={() => setRecordView('salary')}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                recordView === 'salary'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t('employees.certificate.tabSalary')}
            </button>
            <button
              type="button"
              onClick={() => setRecordView('warningLetter')}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                recordView === 'warningLetter'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t('employees.certificate.tabWarningLetter')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white min-w-[200px]"
            value={selectedCompanyId ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setSelectedCompanyId(v);
              setSelectedEmployeeId(null);
            }}
          >
            <option value="">{t('employees.companyFilter.all')}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {companyLabelById.get(c.id) ?? c.company_code}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={t('employees.personnelRecord.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if ((e.nativeEvent as KeyboardEvent).isComposing) return;
                applyEmployeeSearch(searchTerm, true);
              }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
          </div>
          <button
            type="button"
            onClick={() => applyEmployeeSearch(searchTerm, true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
          >
            <Search className="w-4 h-4" />
            {t('appList.filter.search')}
          </button>
          <button
            type="button"
            onClick={() => void loadEmployees()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {t('appList.filter.refresh')}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-gray-700 shrink-0">{t('employees.personnelRecord.selectEmployee')}</label>
          <select
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white flex-1 min-w-[240px] max-w-xl"
            value={selectedEmployeeId ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setSelectedEmployeeId(v);
            }}
            disabled={loadingList}
          >
            <option value="">{t('employees.personnelRecord.selectPlaceholder')}</option>
            {filteredEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_number} — {e.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!canOutput}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            {t('employees.personnelRecord.print')}
          </button>
          <button
            type="button"
            onClick={() => void handlePdf()}
            disabled={!canOutput || pdfWorking}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileDown className="w-4 h-4" />
            {pdfWorking ? t('employees.personnelRecord.pdfBuilding') : t('employees.personnelRecord.pdf')}
          </button>
          {isCertificateView && (
            <button
              type="button"
              onClick={() => void handleSaveCertificate()}
              disabled={!selectedEmployeeId || loadingCard || saveWorking || savedSignature === certSignature}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {saveWorking
                ? t('employees.personnelRecord.saving', '저장 중...')
                : t('employees.personnelRecord.save', '저장')}
            </button>
          )}
        </div>
        {isCertificateView && !canOutput && selectedEmployeeId && (
          <p className="text-xs text-amber-700">{t('employees.personnelRecord.saveRequired', '증명서를 먼저 저장해야 인쇄/PDF 저장이 가능합니다.')}</p>
        )}
        {saveMessage && <p className="text-xs text-blue-700">{saveMessage}</p>}
      </div>

      <div
        id="personnel-record-print-root"
        ref={printRef}
        data-print-layout={
          recordView === 'employment' ||
          recordView === 'career' ||
          recordView === 'salary' ||
          recordView === 'privacyConsent' ||
          recordView === 'laborContract' ||
          recordView === 'warningLetter' ||
          recordView === 'probationEvaluation' ||
          recordView === 'probationResult'
            ? 'certificate'
            : 'card'
        }
        className="bg-white rounded-lg shadow border border-gray-200 print:shadow-none print:border-0"
      >
        {loadingCard && (
          <div className="print:hidden text-center py-16 text-gray-500 text-sm">{t('common.loading')}</div>
        )}
        {!loadingCard && selectedEmployeeId && bundle.employee && recordView === 'card' && (
          <PersonnelRecordCard data={bundle} t={t} />
        )}
        {!loadingCard && selectedEmployeeId && bundle.employee && recordView === 'employment' && (
          <HrCertificateDocument
            data={bundle}
            kind="employment"
            issueDate={certIssueDate}
            certificateNumber={certDocumentNumber}
            submitTo={certSubmitTo}
            purpose={certPurpose}
            remarks={certRemarks}
            onSubmitToChange={setCertSubmitTo}
            onPurposeChange={setCertPurpose}
            onRemarksChange={setCertRemarks}
            employmentPosition={certEmploymentPosition}
            employmentDuty={certEmploymentDuty}
            employmentSalary={certEmploymentSalary}
            employmentBenefits={certEmploymentBenefits}
            onEmploymentPositionChange={setCertEmploymentPosition}
            onEmploymentDutyChange={setCertEmploymentDuty}
            onEmploymentSalaryChange={setCertEmploymentSalary}
            onEmploymentBenefitsChange={setCertEmploymentBenefits}
            t={t}
          />
        )}
        {!loadingCard && selectedEmployeeId && bundle.employee && recordView === 'career' && (
          <HrCertificateDocument
            data={bundle}
            kind="career"
            issueDate={certIssueDate}
            certificateNumber={certDocumentNumber}
            submitTo={certSubmitTo}
            purpose={certPurpose}
            remarks={certRemarks}
            onSubmitToChange={setCertSubmitTo}
            onPurposeChange={setCertPurpose}
            onRemarksChange={setCertRemarks}
            t={t}
          />
        )}
        {!loadingCard && selectedEmployeeId && bundle.employee && recordView === 'laborContract' && (
          <HrCertificateDocument
            data={bundle}
            kind="laborContract"
            issueDate={certIssueDate}
            certificateNumber={certDocumentNumber}
            submitTo={certSubmitTo}
            purpose={certPurpose}
            remarks={certRemarks}
            onSubmitToChange={setCertSubmitTo}
            onPurposeChange={setCertPurpose}
            onRemarksChange={setCertRemarks}
            employmentSalary={certEmploymentSalary}
            onEmploymentSalaryChange={setCertEmploymentSalary}
            laborContractWitness1={contractWitness1}
            laborContractWitness2={contractWitness2}
            onLaborContractWitness1Change={setContractWitness1}
            onLaborContractWitness2Change={setContractWitness2}
            t={t}
          />
        )}
        {!loadingCard && selectedEmployeeId && bundle.employee && recordView === 'salary' && (
          <HrCertificateDocument
            data={bundle}
            kind="salary"
            issueDate={certIssueDate}
            certificateNumber={certDocumentNumber}
            submitTo={certSubmitTo}
            purpose={certPurpose}
            remarks={certRemarks}
            onSubmitToChange={setCertSubmitTo}
            onPurposeChange={setCertPurpose}
            onRemarksChange={setCertRemarks}
            employmentSalary={certEmploymentSalary}
            employmentBenefits={certEmploymentBenefits}
            onEmploymentSalaryChange={setCertEmploymentSalary}
            onEmploymentBenefitsChange={setCertEmploymentBenefits}
            t={t}
          />
        )}
        {!loadingCard && selectedEmployeeId && bundle.employee && recordView === 'warningLetter' && (
          <HrCertificateDocument
            data={bundle}
            kind="warningLetter"
            issueDate={certIssueDate}
            certificateNumber={certDocumentNumber}
            submitTo={certSubmitTo}
            purpose={certPurpose}
            remarks={certRemarks}
            onSubmitToChange={setCertSubmitTo}
            onPurposeChange={setCertPurpose}
            onRemarksChange={setCertRemarks}
            warningTitle={warningTitle}
            warningBody={warningBody}
            warningReason={warningReason}
            warningActionRequired={warningActionRequired}
            warningIssuerName={warningIssuerName}
            warningIssuerSignatureDataUrl={warningIssuerSignatureDataUrl}
            onWarningTitleChange={setWarningTitle}
            onWarningBodyChange={setWarningBody}
            onWarningReasonChange={setWarningReason}
            onWarningActionRequiredChange={setWarningActionRequired}
            onWarningIssuerNameChange={setWarningIssuerName}
            onWarningIssuerSignatureChange={setWarningIssuerSignatureDataUrl}
            onIssueDateChange={setCertIssueDate}
            t={t}
          />
        )}
        {!loadingCard && selectedEmployeeId && bundle.employee && recordView === 'privacyConsent' && (
          <HrCertificateDocument
            data={bundle}
            kind="privacyConsent"
            issueDate={certIssueDate}
            certificateNumber={certDocumentNumber}
            submitTo={certSubmitTo}
            purpose={certPurpose}
            remarks={certRemarks}
            onSubmitToChange={setCertSubmitTo}
            onPurposeChange={setCertPurpose}
            onRemarksChange={setCertRemarks}
            t={t}
          />
        )}
        {!loadingCard && selectedEmployeeId && bundle.employee && recordView === 'probationResult' && (
          <HrCertificateDocument
            data={bundle}
            kind="probationResult"
            issueDate={certIssueDate}
            certificateNumber={certDocumentNumber}
            submitTo={certSubmitTo}
            purpose={certPurpose}
            remarks={certRemarks}
            onSubmitToChange={setCertSubmitTo}
            onPurposeChange={setCertPurpose}
            onRemarksChange={setCertRemarks}
            probationSignerName={probationSignerName}
            onProbationSignerNameChange={setProbationSignerName}
            probationSignatureDataUrl={probationSignatureDataUrl}
            onProbationSignatureChange={setProbationSignatureDataUrl}
            t={t}
          />
        )}
        {!loadingCard && selectedEmployeeId && bundle.employee && recordView === 'probationEvaluation' && (
          <HrCertificateDocument
            data={bundle}
            kind="probationEvaluation"
            issueDate={certIssueDate}
            certificateNumber={certDocumentNumber}
            submitTo={certSubmitTo}
            purpose={certPurpose}
            remarks={certRemarks}
            onSubmitToChange={setCertSubmitTo}
            onPurposeChange={setCertPurpose}
            onRemarksChange={setCertRemarks}
            probationEvaluationData={probationEvaluationData}
            onProbationEvaluationDataChange={(key, value) =>
              setProbationEvaluationData((prev) => ({ ...prev, [key]: value }))
            }
            t={t}
          />
        )}
        {!loadingCard && selectedEmployeeId && !bundle.employee && (
          <div className="print:hidden text-center py-16 text-red-600 text-sm px-4">
            {t('employees.personnelRecord.loadError')}
          </div>
        )}
        {!loadingCard && !selectedEmployeeId && (
          <div className="print:hidden text-center py-16 text-gray-500 text-sm">
            {t('employees.personnelRecord.emptySelect')}
          </div>
        )}
      </div>
    </div>
  );
}
