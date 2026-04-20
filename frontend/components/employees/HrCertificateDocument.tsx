'use client';

import { useMemo } from 'react';
import type { PersonnelRecordBundle } from '@/components/employees/PersonnelRecordCard';
import { getPersonnelRecordAddressBlocks, resolveEmployeeOrgRef } from '@/components/employees/PersonnelRecordCard';
import { getEmployeePhotoImageUrl } from '@/lib/api';
import { translate } from '@/i18n';
import type { Locale } from '@/i18n/types';
import { SignaturePad } from '@/components/employees/SignaturePad';

export type HrCertificateKind =
  | 'card'
  | 'employment'
  | 'career'
  | 'salary'
  | 'privacyConsent'
  | 'laborContract'
  | 'warningLetter'
  | 'probationResult'
  | 'probationEvaluation';

export type ProbationEvaluationData = Record<string, string | boolean>;

export function createDefaultProbationEvaluationData(): ProbationEvaluationData {
  return {
    lateTimes: '',
    leaveDays: '',
    absentDays: '',
    warningTimes: '',
    attendanceTotal: '',
    aExcellent: '',
    aGood: '',
    aFair: '',
    aImprove: '',
    aPoor: '',
    aTotal: '',
    bExcellent: '',
    bGood: '',
    bFair: '',
    bImprove: '',
    bPoor: '',
    bTotal: '',
    cRow1Excellent: '',
    cRow1Good: '',
    cRow1Fair: '',
    cRow1Improve: '',
    cRow1Poor: '',
    cRow1Total: '',
    cRow2Excellent: '',
    cRow2Good: '',
    cRow2Fair: '',
    cRow2Improve: '',
    cRow2Poor: '',
    cRow2Total: '',
    cRow3Excellent: '',
    cRow3Good: '',
    cRow3Fair: '',
    cRow3Improve: '',
    cRow3Poor: '',
    cRow3Total: '',
    cRow4Excellent: '',
    cRow4Good: '',
    cRow4Fair: '',
    cRow4Improve: '',
    cRow4Poor: '',
    cRow4Total: '',
    totalPoints: '',
    passChecked: false,
    rejectChecked: false,
    evaluatedBy: '',
    evaluatedDate: '',
    deptMgr: '',
    deptMgrDate: '',
    hrMgr: '',
    hrMgrDate: '',
    remark: '',
  };
}

type Props = {
  data: PersonnelRecordBundle;
  kind: HrCertificateKind;
  issueDate: Date;
  submitTo: string;
  purpose: string;
  remarks: string;
  onSubmitToChange: (v: string) => void;
  onPurposeChange: (v: string) => void;
  onRemarksChange: (v: string) => void;
  employmentPosition?: string;
  employmentDuty?: string;
  employmentSalary?: string;
  employmentBenefits?: string;
  onEmploymentPositionChange?: (v: string) => void;
  onEmploymentDutyChange?: (v: string) => void;
  onEmploymentSalaryChange?: (v: string) => void;
  onEmploymentBenefitsChange?: (v: string) => void;
  laborContractWitness1?: string;
  laborContractWitness2?: string;
  onLaborContractWitness1Change?: (v: string) => void;
  onLaborContractWitness2Change?: (v: string) => void;
  warningTitle?: string;
  warningBody?: string;
  warningReason?: string;
  warningActionRequired?: string;
  warningIssuerName?: string;
  warningIssuerSignatureDataUrl?: string | null;
  onWarningTitleChange?: (v: string) => void;
  onWarningBodyChange?: (v: string) => void;
  onWarningReasonChange?: (v: string) => void;
  onWarningActionRequiredChange?: (v: string) => void;
  onWarningIssuerNameChange?: (v: string) => void;
  onWarningIssuerSignatureChange?: (dataUrl: string | null) => void;
  probationSignerName?: string;
  onProbationSignerNameChange?: (v: string) => void;
  /** PNG data URL; stored in certificate issue payload_json */
  probationSignatureDataUrl?: string | null;
  onProbationSignatureChange?: (dataUrl: string | null) => void;
  /** 증명서 조회 등: 서명 패드 숨김 */
  probationSignatureReadOnly?: boolean;
  probationEvaluationData?: ProbationEvaluationData;
  onProbationEvaluationDataChange?: (key: string, value: string | boolean) => void;
  certificateNumber?: string;
  t: (key: string, fallback?: string) => string;
  /** 직원 전달 화면: 본문 입력 비활성(스크롤·인쇄는 유지) */
  lockDocumentFields?: boolean;
  /** 직원 확인용 전자서명(PNG data URL). 수습기간평가 결과 통지(probationResult)에는 사용하지 않음 */
  employeeSignatureDataUrl?: string | null;
  onEmployeeSignatureChange?: (dataUrl: string | null) => void;
  /** true이면 서명 패드 표시(미서명 시) */
  employeeSignatureCaptureEnabled?: boolean;
  /** 공개 전달 링크 등: 증명사진 URL 직접 지정(미지정 시 기존 API+토큰 방식) */
  employeePhotoSrcOverride?: string | null;
  onIssueDateChange?: (next: Date) => void;
};

function localeToDateTag(locale: string): string {
  if (locale === 'th') return 'th-TH-u-ca-buddhist';
  if (locale === 'en') return 'en-US';
  return 'ko-KR';
}

function formatLocalizedDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(localeToDateTag(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

function formatLocalizedDateFromIso(iso: string | null | undefined, locale: string): string {
  if (iso == null || String(iso).trim() === '') return '—';
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return String(iso);
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return String(iso);
  return formatLocalizedDate(date, locale);
}

function toLocalIsoDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 증명서·계약서 금액: 저장은 숫자만, 표시는 로케일별 천단위 구분 */
function localeToNumberFormatTag(locale: string): string {
  if (locale === 'th') return 'th-TH';
  if (locale === 'en') return 'en-US';
  return 'ko-KR';
}

function salaryDigitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

function formatSalaryThousandsDisplay(stored: string, locale: string): string {
  const digits = salaryDigitsOnly(stored);
  if (!digits) return '';
  const n = Number(digits);
  if (!Number.isFinite(n)) return stored;
  try {
    return new Intl.NumberFormat(localeToNumberFormatTag(locale), {
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(n);
  } catch {
    return digits;
  }
}

function maskResidentDisplay(raw: unknown): string {
  if (raw == null || String(raw).trim() === '') return '—';
  const s = String(raw).trim();
  if (s.includes('*')) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 7) return `${digits.slice(0, 6)}-${digits[6]}******`;
  return s;
}

function kindNumberBase(kind: HrCertificateKind): number {
  if (kind === 'card') return 50;
  if (kind === 'employment') return 100;
  if (kind === 'career') return 200;
  if (kind === 'salary') return 300;
  if (kind === 'warningLetter') return 350;
  if (kind === 'privacyConsent') return 400;
  if (kind === 'laborContract') return 500;
  if (kind === 'probationResult') return 600;
  return 700; // probationEvaluation
}

export function buildCertificateDocumentNumber(issueDate: Date, employeeId: number, kind: HrCertificateKind): string {
  const y = issueDate.getFullYear();
  const mo = String(issueDate.getMonth() + 1).padStart(2, '0');
  const da = String(issueDate.getDate()).padStart(2, '0');
  // 증명서 종류별 번호 대역 + 직원번호 오프셋으로 자동 채번
  const seq = String((kindNumberBase(kind) + (employeeId % 100)) % 1000).padStart(3, '0');
  return `${y}${mo}${da}-${seq}`;
}

function workPeriodLine(
  hire: unknown,
  termination: unknown,
  status: unknown,
  issueDate: Date,
  presentLabel: string,
  locale: string
): string {
  const hireStr = formatLocalizedDateFromIso(hire != null ? String(hire) : null, locale);
  const issueStr = formatLocalizedDate(issueDate, locale);
  const termRaw = termination != null && String(termination).trim() !== '' ? String(termination) : '';
  const termStr = termRaw ? formatLocalizedDateFromIso(termRaw, locale) : '';
  const isActive = String(status || '').trim() === 'active';
  if (isActive || !termStr || termStr === '—') {
    return `${hireStr} ~ ${presentLabel} (${issueStr})`;
  }
  return `${hireStr} ~ ${termStr} (${issueStr})`;
}

type PrivacyConsentContent = {
  heading: string;
  subtitle: string;
  sections: Array<{ title?: string; body: string[] }>;
  consentLines: string[];
  signatureOwnerLabel: string;
  signatureDateLabel: string;
  fallbackSignerName: string;
};

function getPrivacyConsentContent(
  locale: string,
  companyDisplay: string,
  employeeName: string
): PrivacyConsentContent {
  if (locale === 'en') {
    return {
      heading: 'Consent Form for Collection, Use, and Disclosure of Personal Data',
      subtitle: `For employees of ${companyDisplay}`,
      sections: [
        {
          body: [
            `${companyDisplay} values and is committed to protecting personal data. This document explains how employee personal data is collected, used, disclosed, and protected in accordance with applicable personal data protection laws.`,
          ],
        },
        {
          title: '1. Personal data collected',
          body: [
            'Basic data may include name, national ID/passport information, date of birth, contact details, address, education, work history, health-related records required by law, and supporting documents needed for employment management.',
            'In some cases, third-party contact information (such as emergency contacts or references) may also be collected for legitimate employment purposes.',
          ],
        },
        {
          title: '2. Purpose of processing',
          body: [
            'Data is processed for recruitment, onboarding, employment administration, payroll, benefits, legal compliance, training, performance management, disciplinary process, and separation procedures.',
            'Data may also be processed for communication with relevant internal departments, social security, financial institutions, or government agencies where legally required.',
          ],
        },
        {
          title: '3. Limits on use and disclosure',
          body: [
            'The Company uses and discloses personal data only to the extent necessary for the stated purposes and restricts access to authorized personnel only.',
            'Personal data will not be sold or improperly transferred to unrelated third parties. Data will be retained only for the lawful retention period and then securely deleted or anonymized.',
          ],
        },
        {
          title: '4. Data subject rights',
          body: [
            'Employees may exercise their rights under applicable law, including the right to be informed, access, rectification, objection, restriction, deletion, and withdrawal of consent where lawful.',
          ],
        },
        {
          body: [
            'I have read and understood the information above.',
          ],
        },
      ],
      consentLines: [
        `□ I consent to ${companyDisplay} collecting, using, and/or disclosing my personal data as described above.`,
        `□ I do not consent to ${companyDisplay} collecting, using, and/or disclosing my personal data as described above.`,
      ],
      signatureOwnerLabel: 'Signature..................................................... Data subject',
      signatureDateLabel: 'Date............../................./...................',
      fallbackSignerName: employeeName,
    };
  }

  if (locale === 'ko') {
    return {
      heading: '개인정보 수집·이용·제공 동의서',
      subtitle: `${companyDisplay} 임직원 대상`,
      sections: [
        {
          body: [
            `${companyDisplay}는 임직원의 개인정보 보호를 중요하게 생각하며, 관련 법령에 따라 개인정보의 수집·이용·제공 및 보호 절차를 안내드립니다.`,
          ],
        },
        {
          title: '1. 수집하는 개인정보 항목',
          body: [
            '성명, 주민등록/신분 정보, 생년월일, 연락처, 주소, 학력, 경력, 법령상 필요한 건강/자격 관련 정보 및 인사관리상 필요한 증빙서류를 수집할 수 있습니다.',
            '필요한 경우 비상연락처·추천인 등 제3자 정보가 포함될 수 있습니다.',
          ],
        },
        {
          title: '2. 이용 목적',
          body: [
            '채용, 입사 및 재직관리, 급여·복리후생, 교육, 평가, 징계, 퇴직 처리, 법적 의무 이행 등 인사관리 목적에 이용됩니다.',
            '관련 법령에 따라 정부기관, 사회보험기관, 금융기관 또는 사내 관련 부서와 정보를 공유할 수 있습니다.',
          ],
        },
        {
          title: '3. 이용·제공 제한 및 보관',
          body: [
            '개인정보는 목적 범위 내에서만 처리되며, 권한 있는 담당자에게만 접근이 제한됩니다.',
            '회사는 개인정보를 판매하거나 부당 제공하지 않으며, 법령상 보존기간 종료 후 안전하게 파기 또는 비식별화합니다.',
          ],
        },
        {
          title: '4. 정보주체의 권리',
          body: [
            '정보주체는 관련 법령이 보장하는 열람, 정정, 삭제, 처리정지, 반대, 동의철회 등 권리를 행사할 수 있습니다.',
          ],
        },
        {
          body: ['본인은 위 내용을 읽고 충분히 이해하였습니다.'],
        },
      ],
      consentLines: [
        `□ 본인은 ${companyDisplay}의 위 개인정보 수집·이용·제공에 동의합니다.`,
        `□ 본인은 ${companyDisplay}의 위 개인정보 수집·이용·제공에 동의하지 않습니다.`,
      ],
      signatureOwnerLabel: '서명..................................................... 정보주체',
      signatureDateLabel: '작성일............../................./...................',
      fallbackSignerName: employeeName,
    };
  }

  return {
    heading: 'หนังสือให้ความยินยอมเก็บรวบรวม ใช้ เปิดเผยข้อมูลส่วนบุคคล',
    subtitle: `ของ พนักงาน ${companyDisplay}`,
    sections: [
      {
        body: [
          `${companyDisplay} ให้ความสำคัญและมุ่งมั่นในการคุ้มครองข้อมูลส่วนบุคคลของพนักงาน โดยดำเนินการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลตามวัตถุประสงค์ที่ชอบด้วยกฎหมายและจำเป็นต่อการบริหารทรัพยากรบุคคล`,
        ],
      },
      {
        title: '1. ข้อมูลส่วนบุคคลที่เก็บรวบรวม',
        body: [
          'อาจรวมถึงข้อมูลพื้นฐาน เช่น ชื่อ-นามสกุล เลขประจำตัวประชาชน/หนังสือเดินทาง วันเดือนปีเกิด ที่อยู่ ข้อมูลติดต่อ การศึกษา ประวัติการทำงาน และเอกสารประกอบที่จำเป็น',
          'ในบางกรณีอาจมีข้อมูลบุคคลที่สาม เช่น ผู้ติดต่อฉุกเฉิน หรือบุคคลอ้างอิงตามความจำเป็น',
        ],
      },
      {
        title: '2. วัตถุประสงค์ในการใช้ข้อมูล',
        body: [
          'เพื่อการรับสมัครงาน บรรจุแต่งตั้ง การบริหารสัญญาจ้าง ค่าจ้าง สวัสดิการ การพัฒนาและประเมินผล การดำเนินการทางวินัย และการสิ้นสุดการจ้างงาน',
          'รวมถึงการปฏิบัติตามกฎหมาย การติดต่อหน่วยงานภาครัฐ ประกันสังคม สถาบันการเงิน หรือหน่วยงานภายในที่เกี่ยวข้อง',
        ],
      },
      {
        title: '3. ข้อจำกัดในการใช้และเปิดเผยข้อมูล',
        body: [
          'บริษัทจะใช้หรือเปิดเผยข้อมูลเท่าที่จำเป็นตามวัตถุประสงค์ และจำกัดการเข้าถึงเฉพาะผู้มีหน้าที่เกี่ยวข้อง',
          'บริษัทไม่มีนโยบายขายข้อมูลส่วนบุคคลแก่บุคคลภายนอก และจะเก็บรักษาข้อมูลตามระยะเวลาที่กฎหมายกำหนดก่อนทำลายหรือทำให้ไม่สามารถระบุตัวตนได้',
        ],
      },
      {
        title: '4. สิทธิของเจ้าของข้อมูล',
        body: [
          'เจ้าของข้อมูลมีสิทธิตามกฎหมาย เช่น สิทธิขอเข้าถึง แก้ไข คัดค้าน ระงับการใช้ ลบข้อมูล และถอนความยินยอม ภายใต้เงื่อนไขที่กฎหมายกำหนด',
        ],
      },
      {
        body: ['ข้าพเจ้าได้อ่านและเข้าใจข้อความข้างต้นแล้ว'],
      },
    ],
    consentLines: [
      `□ ยินยอมให้ ${companyDisplay} เก็บรวบรวม ใช้ และ/หรือเปิดเผยข้อมูลส่วนบุคคลของข้าพเจ้า ตามรายละเอียดข้างต้น`,
      `□ ไม่ยินยอมให้ ${companyDisplay} เก็บรวบรวม ใช้ และ/หรือเปิดเผยข้อมูลส่วนบุคคลของข้าพเจ้า ตามรายละเอียดข้างต้น`,
    ],
    signatureOwnerLabel: 'ลงชื่อ..................................................... เจ้าของข้อมูล',
    signatureDateLabel: 'วันที่............../................./...................',
    fallbackSignerName: employeeName,
  };
}

const thLab =
  'hr-cert-th border border-black px-1.5 py-1.5 text-center text-[11px] sm:text-xs font-bold bg-white align-middle whitespace-nowrap print:py-1 print:px-1 print:text-[9pt]';
const tdVal =
  'hr-cert-td border border-black px-1.5 py-1.5 align-middle text-[11px] sm:text-xs print:py-1 print:px-1 print:text-[9pt]';
const tdValWide = `${tdVal} min-w-0`;
const inp =
  'w-full min-h-[1.35rem] bg-transparent text-[11px] sm:text-xs outline-none print:text-black print:min-h-[1.05rem] print:text-[9pt] placeholder:text-gray-400';
const lineInput =
  'block w-full bg-transparent border-0 border-b border-gray-500 focus:border-black outline-none leading-normal py-1 min-h-[1.9rem]';
/** Employment certificate: position / salary / benefits — no underline */
const employmentCertLineFieldInput =
  'block w-full bg-transparent border-0 outline-none leading-normal py-1 min-h-[1.9rem] focus:ring-0';
const inlineLineInput =
  'inline-block w-full bg-transparent border-0 border-b border-gray-500 focus:border-black outline-none leading-normal py-0.5 min-h-0 align-middle';

/** 근로계약서 제2조 월급여: 밑줄 없이 굵게만 표시 */
const laborContractSalaryInput =
  'inline-block min-w-[5rem] max-w-[14rem] bg-transparent border-0 outline-none leading-normal py-0.5 min-h-0 align-baseline font-bold focus:ring-0';

/** 수습평가 점수대 헤더: 줄바꿈 허용, 부모의 hr-cert-th 글자 강제와 분리 */
const peScoreThShell = 'border border-black p-0 align-middle bg-white print:p-0';

function ProbationScoreBandHeader({ title, band }: { title: string; band: string }) {
  return (
    <td className={peScoreThShell}>
      <div className="flex min-h-[2.4rem] flex-col items-center justify-center gap-0 px-0.5 py-1 text-center text-[7px] font-semibold leading-[1.2] text-black sm:min-h-[2.5rem] sm:text-[8px] print:min-h-[2.1rem] print:px-0.5 print:text-[6.5pt]">
        <span className="max-w-full break-words">{title}</span>
        <span className="tabular-nums">{band}</span>
      </div>
    </td>
  );
}

function ProbationTotalHeader({ label, points }: { label: string; points: string }) {
  return (
    <td className={peScoreThShell} style={{ width: '11%' }}>
      <div className="flex min-h-[2.4rem] flex-col items-center justify-center px-0.5 py-1 text-center text-[7px] font-semibold leading-[1.2] text-red-600 sm:text-[8px] print:text-[6.5pt]">
        <span className="max-w-full break-words">{label}</span>
        <span className="tabular-nums">{points}</span>
      </div>
    </td>
  );
}

const peScoreInputTd = `${tdVal} min-w-0 text-center [&_input]:text-center`;

function probationEvalText(locale: string) {
  if (locale === 'en') {
    return {
      formTitle: 'EMPLOYEE EVALUATION (PROBATION)',
      evalType: 'Evaluation type : Probation',
      startDate: 'Start date',
      employeeNo: 'Employee No',
      issueDate: 'Issue date',
      trialEndDate: 'End of probation',
      employeeName: 'Name of employee',
      position: 'Position',
      division: 'Division/Department',
      attendanceTitle: 'A Attendance Record (20)',
      late: 'Late',
      leave: 'Leave',
      absent: 'Absent',
      warning: 'Warning letter',
      times: 'Times',
      days: 'Days',
      points: 'Points',
      performance: 'Performance',
      skill: 'Skill / Responsibility',
      general: 'General',
      totalPoints: 'TOTAL POINTS',
      pass: 'PASS (70 point up)',
      reject: 'REJECT (69 point down)',
      evaluatedBy: 'EVALUATED BY',
      deptMgr: 'DEPT. MGR.',
      hrMgr: 'HR. MGR.',
      remark: 'REMARK',
    };
  }
  if (locale === 'ko') {
    return {
      formTitle: '직원평가서 (수습)',
      evalType: '평가유형 : 수습',
      startDate: '입사일',
      employeeNo: '사번',
      issueDate: '평가서 발행일',
      trialEndDate: '수습종료예정일',
      employeeName: '직원명',
      position: '직위',
      division: '부서/팀',
      attendanceTitle: 'A 근태 기록 (20)',
      late: '지각',
      leave: '휴가/휴직',
      absent: '결근',
      warning: '경고장',
      times: '회',
      days: '일',
      points: '점',
      performance: '업무 성과',
      skill: '직무 역량 / 책임감',
      skillLines: ['직무 역량', '책임감'] as const,
      general: '일반 항목',
      totalPoints: '총점',
      pass: '합격 (70점 이상)',
      reject: '불합격 (69점 이하)',
      evaluatedBy: '평가자',
      deptMgr: '부서장',
      hrMgr: '인사담당자',
      remark: '비고',
    };
  }
  return {
    formTitle: 'ประเมินผลพนักงาน (ทดลองงาน)',
    evalType: 'ประเภทการประเมิน : ทดลองงาน',
    startDate: 'วันที่เริ่มงาน',
    employeeNo: 'รหัสพนักงาน',
    issueDate: 'วันที่ออกใบประเมิน',
    trialEndDate: 'วันที่ครบทดลองงาน',
    employeeName: 'ชื่อพนักงาน',
    position: 'ตำแหน่ง',
    division: 'ฝ่าย/แผนก',
    attendanceTitle: 'A สถิติการทำงาน (20)',
    late: 'มาสาย',
    leave: 'ลา',
    absent: 'ขาดงาน',
    warning: 'หนังสือเตือน',
    times: 'ครั้ง',
    days: 'วัน',
    points: 'คะแนน',
    performance: 'ผลการทำงาน',
    skill: 'ความสามารถเฉพาะ / ความรับผิดชอบ',
    general: 'ทั่วไป',
    totalPoints: 'คะแนนรวม',
    pass: 'PASS (70 point up)',
    reject: 'REJECT (69 point down)',
    evaluatedBy: 'EVALUATED BY',
    deptMgr: 'DEPT.MGR.',
    hrMgr: 'HR.MGR.',
    remark: 'REMARK',
  };
}

export function HrCertificateDocument({
  data,
  kind,
  issueDate,
  submitTo,
  purpose,
  remarks,
  onSubmitToChange,
  onPurposeChange,
  onRemarksChange,
  employmentPosition = '',
  employmentDuty = '',
  employmentSalary = '',
  employmentBenefits = '',
  onEmploymentPositionChange = () => {},
  onEmploymentDutyChange = () => {},
  onEmploymentSalaryChange = () => {},
  onEmploymentBenefitsChange = () => {},
  laborContractWitness1 = '',
  laborContractWitness2 = '',
  onLaborContractWitness1Change = () => {},
  onLaborContractWitness2Change = () => {},
  warningTitle = '',
  warningBody = '',
  warningReason = '',
  warningActionRequired = '',
  warningIssuerName = '',
  warningIssuerSignatureDataUrl = null,
  onWarningTitleChange = () => {},
  onWarningBodyChange = () => {},
  onWarningReasonChange = () => {},
  onWarningActionRequiredChange = () => {},
  onWarningIssuerNameChange = () => {},
  onWarningIssuerSignatureChange = () => {},
  probationSignerName = '',
  onProbationSignerNameChange = () => {},
  probationSignatureDataUrl = null,
  onProbationSignatureChange = () => {},
  probationSignatureReadOnly = false,
  probationEvaluationData = createDefaultProbationEvaluationData(),
  onProbationEvaluationDataChange = () => {},
  certificateNumber = '',
  t,
  lockDocumentFields = false,
  employeeSignatureDataUrl = null,
  onEmployeeSignatureChange = () => {},
  employeeSignatureCaptureEnabled = false,
  employeePhotoSrcOverride = null,
  onIssueDateChange,
}: Props) {
  const e = data.employee;
  const empId = Number(e?.id) || 0;

  const dept = useMemo(
    () => (e ? resolveEmployeeOrgRef(data, 'department', e.department) : '—'),
    [data, e]
  );
  const position = useMemo(
    () => (e ? resolveEmployeeOrgRef(data, 'position', e.position) : '—'),
    [data, e]
  );

  const currAddr = useMemo(() => {
    const { curr } = getPersonnelRecordAddressBlocks(data);
    const zip = curr.zip && curr.zip !== '—' ? curr.zip : '';
    const line = curr.line && curr.line !== '—' ? curr.line : '';
    const joined = [zip, line].filter(Boolean).join(' ');
    return joined || '—';
  }, [data]);

  const resident = maskResidentDisplay(e?.resident_number);
  const name = e?.name != null && String(e.name).trim() !== '' ? String(e.name) : '—';
  const photoPath = e?.photo_path != null ? String(e.photo_path).trim() : '';
  const photoUrl =
    (employeePhotoSrcOverride && String(employeePhotoSrcOverride).trim()) ||
    (empId > 0 && photoPath ? getEmployeePhotoImageUrl(empId) : '');
  const companyDisplay = (
    data.companyNameKor?.trim() ||
    data.companyName?.trim() ||
    '—'
  ).trim();
  const rep = data.companyRepresentativeName?.trim() || '';
  const companyAddress = data.companyAddress?.trim() || '—';

  const docNo = certificateNumber.trim() || buildCertificateDocumentNumber(issueDate, empId, kind);
  const presentLabel = t('employees.certificate.present');
  const workPeriod = workPeriodLine(e?.hire_date, e?.termination_date, e?.status, issueDate, presentLabel, data.locale);
  const privacyConsentContent = getPrivacyConsentContent(
    data.locale,
    companyDisplay,
    name !== '—' ? name : data.locale === 'ko' ? '홍길동' : data.locale === 'en' ? 'Employee Name' : 'ชื่อพนักงาน'
  );
  const peText = probationEvalText(data.locale);
  const peDocLocale = useMemo((): Locale => {
    const l = String(data.locale ?? 'ko');
    return l === 'en' || l === 'th' || l === 'ko' ? l : 'ko';
  }, [data.locale]);
  const peFormLabels = useMemo(
    () => ({
      excellent: translate(peDocLocale, 'employees.certificate.probationEvaluation.bandExcellent', 'Excellent'),
      good: translate(peDocLocale, 'employees.certificate.probationEvaluation.bandGood', 'Good'),
      fair: translate(peDocLocale, 'employees.certificate.probationEvaluation.bandFair', 'Fair'),
      improvement: translate(peDocLocale, 'employees.certificate.probationEvaluation.bandImprovement', 'Improvement'),
      poor: translate(peDocLocale, 'employees.certificate.probationEvaluation.bandPoor', 'Poor'),
      total: translate(peDocLocale, 'employees.certificate.probationEvaluation.bandTotal', 'Total'),
      generalItems: [
        translate(peDocLocale, 'employees.certificate.probationEvaluation.itemDiligence', 'Diligence'),
        translate(peDocLocale, 'employees.certificate.probationEvaluation.itemDiscipline', 'Discipline'),
        translate(peDocLocale, 'employees.certificate.probationEvaluation.itemAttitude', 'Attitude'),
        translate(peDocLocale, 'employees.certificate.probationEvaluation.itemCooperation', 'Cooperation'),
      ],
      photoPlaceholder: translate(peDocLocale, 'employees.certificate.probationEvaluation.photoPlaceholder', 'PHOTO'),
    }),
    [peDocLocale]
  );
  const probationNoticeTodayStr = formatLocalizedDate(new Date(), data.locale);
  const probationResultIssueDateLine = `${translate(peDocLocale, 'employees.certificate.probation.issueDatePrefix', '날짜: ')}${probationNoticeTodayStr}`;
  const probationResultReferenceLine = translate(
    peDocLocale,
    'employees.certificate.probation.referenceWithDate',
    '참조: {{date}}자 근무평가서'
  ).replace(/\{\{date\}\}/g, probationNoticeTodayStr);
  const peVal = (key: string) => String(probationEvaluationData[key] ?? '');
  const peChecked = (key: string) => Boolean(probationEvaluationData[key]);

  const salaryThousandsDisplay = formatSalaryThousandsDisplay(employmentSalary, data.locale);
  const onSalaryThousandsInput = (ev: React.ChangeEvent<HTMLInputElement>) => {
    onEmploymentSalaryChange(salaryDigitsOnly(ev.target.value));
  };

  let title = t('employees.certificate.titleLaborContract');
  if (kind === 'employment') title = t('employees.certificate.titleEmploymentSpaced');
  else if (kind === 'career') title = t('employees.certificate.titleCareerSpaced');
  else if (kind === 'salary') title = t('employees.certificate.titleSalarySpaced');
  else if (kind === 'privacyConsent') title = t('employees.certificate.titlePrivacyConsent');
  else if (kind === 'warningLetter') title = t('employees.certificate.titleWarningLetter');
  else if (kind === 'probationResult') title = t('employees.certificate.titleProbationResult');
  else if (kind === 'probationEvaluation') title = t('employees.certificate.titleProbationEvaluation');

  let statement = t('employees.certificate.statementSalary');
  if (kind === 'employment') statement = t('employees.certificate.statementEmployment');
  else if (kind === 'career') statement = t('employees.certificate.statementCareer');
  else if (kind === 'salary') statement = '';
  const outerFrame =
    kind === 'employment' || kind === 'salary' || kind === 'privacyConsent'
      ? 'border-4 border-double border-black p-1 sm:p-1.5 print:border-2 print:p-0.5'
      : 'border-2 border-black p-1 sm:p-1.5 print:border print:p-0.5';

  const innerPad = 'p-3 sm:p-5 print:p-2.5';

  const showEmployeeSignatureFooter =
    kind !== 'probationResult' &&
    (employeeSignatureCaptureEnabled || !!employeeSignatureDataUrl);

  return (
    <div
      data-hr-cert-kind={kind}
      className={`hr-certificate-doc flex w-full flex-col bg-white text-black ${kind === 'probationEvaluation' ? 'font-sans' : 'font-serif'} ${outerFrame} mx-auto box-border`}
    >
      <div
        className={`hr-cert-inner flex min-h-0 flex-1 flex-col ${kind === 'laborContract' ? 'overflow-visible' : 'overflow-hidden'} ${innerPad} ${kind === 'employment' ? 'border border-black print:border' : ''}`}
      >
        <div className={lockDocumentFields ? 'pointer-events-none select-none min-h-0 flex min-h-0 flex-1 flex-col' : 'min-h-0 flex min-h-0 flex-1 flex-col'}>
        <div
          className={`hr-cert-top min-h-0 shrink-0 ${kind === 'laborContract' ? 'overflow-visible' : 'overflow-hidden'}`}
        >
          <div
            className={`flex items-start justify-between gap-2 ${
              kind === 'probationResult'
                ? 'mb-8 sm:mb-10 print:mb-8'
                : 'mb-2 print:mb-1.5'
            }`}
          >
            <p className="text-xs sm:text-sm tabular-nums pt-0.5 print:text-[9pt]">
              {t('employees.certificate.docNoPrefix')} ({docNo})
            </p>
            <div className="shrink-0 max-h-12 sm:max-h-14 print:max-h-9 flex items-center justify-end w-[min(200px,45%)]">
              {data.companyLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.companyLogoUrl} alt="" className="max-h-12 sm:max-h-14 print:max-h-9 w-auto object-contain object-right" />
              ) : null}
            </div>
          </div>

          <h1 className="text-center text-xl sm:text-2xl font-bold tracking-[0.35em] mb-3 print:mb-2 print:text-[17pt] print:tracking-[0.22em]">
            {title}
          </h1>

          {kind === 'employment' ? (
            <div className="space-y-3 text-[11px] sm:text-sm leading-relaxed print:text-[10pt]">
              <p className="text-right">{`${t('employees.certificate.lblDate')} ${formatLocalizedDate(issueDate, data.locale)}`}</p>
              <p>{t('employees.certificate.bodyEmploymentIntro', 'This letter certifies employment as follows.')}</p>
              <p className="pl-4">
                {t('employees.certificate.bodyEmploymentNameLine', 'Employee name')}: <span className="font-semibold">{name}</span>
              </p>
              <p className="pl-4">
                {t('employees.certificate.bodyEmploymentCompanyLine', 'Company')}: <span className="font-semibold">{companyDisplay}</span>
              </p>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-2 items-start pl-4">
                <span>{t('employees.certificate.lblDept')}</span>
                <span>: {dept}</span>
                <span>{t('employees.certificate.lblPosition')}</span>
                <span>
                  :{' '}
                  <input
                    type="text"
                    className={employmentCertLineFieldInput}
                    value={employmentPosition || (position !== '—' ? position : '')}
                    onChange={(ev) => onEmploymentPositionChange(ev.target.value)}
                    placeholder={position || t('employees.certificate.placeholderPosition')}
                    aria-label={t('employees.certificate.lblPosition')}
                  />
                </span>
              </div>
              <div className="pl-4">
                <p className="mb-1">{t('employees.certificate.lblDuty')}</p>
                <textarea
                  className={`${lineInput} min-h-[12rem] print:min-h-[8.5rem] resize-none leading-relaxed`}
                  rows={10}
                  value={employmentDuty}
                  onChange={(ev) => onEmploymentDutyChange(ev.target.value)}
                  placeholder={t('employees.certificate.placeholderDuty')}
                  aria-label={t('employees.certificate.lblDuty')}
                />
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-2 items-start pl-4">
                <span>{t('employees.certificate.lblSalary')}</span>
                <span>
                  :{' '}
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className={employmentCertLineFieldInput}
                    value={salaryThousandsDisplay}
                    onChange={onSalaryThousandsInput}
                    placeholder={t('employees.certificate.placeholderSalary')}
                    aria-label={t('employees.certificate.lblSalary')}
                  />
                </span>
                <span>{t('employees.certificate.lblBenefits')}</span>
                <span>
                  :{' '}
                  <input
                    type="text"
                    className={employmentCertLineFieldInput}
                    value={employmentBenefits}
                    onChange={(ev) => onEmploymentBenefitsChange(ev.target.value)}
                    placeholder={t('employees.certificate.placeholderBenefits')}
                    aria-label={t('employees.certificate.lblBenefits')}
                  />
                </span>
                <span>{t('employees.certificate.lblPeriod')}</span>
                <span>: {workPeriod}</span>
              </div>
            </div>
          ) : kind === 'privacyConsent' ? (
            <div className="space-y-3 text-[11px] sm:text-sm leading-relaxed print:text-[10pt]">
              <p className="text-center">{privacyConsentContent.subtitle}</p>
              {privacyConsentContent.sections.map((section, idx) => (
                <div key={`privacy-section-${idx}`} className="space-y-1">
                  {section.title ? <p className="font-semibold">{section.title}</p> : null}
                  {section.body.map((line, bodyIdx) => (
                    <p key={`privacy-section-${idx}-line-${bodyIdx}`}>{line}</p>
                  ))}
                </div>
              ))}
              {privacyConsentContent.consentLines.map((line, idx) => (
                <p key={`privacy-consent-line-${idx}`}>{line}</p>
              ))}
              <div className="pt-5 space-y-2">
                <p>{privacyConsentContent.signatureOwnerLabel}</p>
                <p className="pl-6">( {name !== '—' ? name : privacyConsentContent.fallbackSignerName} )</p>
                <p>{privacyConsentContent.signatureDateLabel}</p>
              </div>
            </div>
          ) : kind === 'career' ? (
          <table className="hr-cert-table w-full border-collapse table-fixed">
          <tbody>
            <tr>
              <td className={thLab} style={{ width: '14%' }}>
                {t('employees.certificate.lblDept')}
              </td>
              <td className={tdVal} style={{ width: '28%' }}>
                {dept}
              </td>
              <td className={thLab} style={{ width: '14%' }}>
                {t('employees.certificate.lblPosition')}
              </td>
              <td className={tdVal} style={{ width: '28%' }}>
                {position}
              </td>
            </tr>
            <tr>
              <td className={thLab}>{t('employees.certificate.lblName')}</td>
              <td className={tdVal}>{name}</td>
              <td className={thLab}>{t('employees.certificate.lblResident')}</td>
              <td className={tdVal}>
                <span className="tabular-nums">{resident}</span>
              </td>
            </tr>
            <tr>
              <td className={thLab}>{t('employees.certificate.lblAddress')}</td>
              <td className={tdValWide} colSpan={3}>
                <span className="line-clamp-4 break-words leading-snug">{currAddr}</span>
              </td>
            </tr>
            <tr>
              <td className={thLab}>{t('employees.certificate.lblPeriod')}</td>
              <td className={tdValWide} colSpan={3}>
                <span className="line-clamp-2 break-words leading-snug">{workPeriod}</span>
              </td>
            </tr>
            <tr>
              <td className={thLab}>{t('employees.certificate.lblSubmitTo')}</td>
              <td className={tdValWide} colSpan={3}>
                <input
                  type="text"
                  className={inp}
                  value={submitTo}
                  onChange={(ev) => onSubmitToChange(ev.target.value)}
                  placeholder={t('employees.certificate.placeholderSubmitTo')}
                  aria-label={t('employees.certificate.lblSubmitTo')}
                />
              </td>
            </tr>
            <tr>
              <td className={thLab}>{t('employees.certificate.lblPurpose')}</td>
              <td className={tdValWide} colSpan={3}>
                <input
                  type="text"
                  className={inp}
                  value={purpose}
                  onChange={(ev) => onPurposeChange(ev.target.value)}
                  placeholder={t('employees.certificate.placeholderPurpose')}
                  aria-label={t('employees.certificate.lblPurpose')}
                />
              </td>
            </tr>
            <tr>
              <td className={thLab}>{t('employees.certificate.lblRemarks')}</td>
              <td className={tdValWide} colSpan={3}>
                <input
                  type="text"
                  className={inp}
                  value={remarks}
                  onChange={(ev) => onRemarksChange(ev.target.value)}
                  placeholder={t('employees.certificate.placeholderRemarks')}
                  aria-label={t('employees.certificate.lblRemarks')}
                />
              </td>
            </tr>
          </tbody>
        </table>
          ) : kind === 'salary' ? (
            <div className="space-y-4 text-[11px] sm:text-sm leading-relaxed print:text-[10pt]">
              <p className="text-center whitespace-pre-wrap">
                {t('employees.certificate.salaryBodyIntro', 'This document is issued to certify monthly income.')}
              </p>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-2 items-start px-2">
                <span>{t('employees.certificate.bodyEmploymentNameLine')}</span>
                <span>: {name}</span>
                <span>{t('employees.certificate.bodyEmploymentCompanyLine')}</span>
                <span>: {companyDisplay}</span>
                <span>{t('employees.certificate.lblPosition')}</span>
                <span>: {position}</span>
                <span>{t('employees.certificate.lblDept')}</span>
                <span>: {dept}</span>
                <span>{t('employees.certificate.lblSalary')}</span>
                <span>
                  :{' '}
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className={inlineLineInput}
                    value={salaryThousandsDisplay}
                    onChange={onSalaryThousandsInput}
                    placeholder={t('employees.certificate.placeholderSalary')}
                    aria-label={t('employees.certificate.lblSalary')}
                  />
                </span>
                <span>{t('employees.certificate.lblOtherIncome')}</span>
                <span>
                  :{' '}
                  <input
                    type="text"
                    className={inlineLineInput}
                    value={employmentBenefits}
                    onChange={(ev) => onEmploymentBenefitsChange(ev.target.value)}
                    placeholder={t('employees.certificate.placeholderOtherIncome')}
                    aria-label={t('employees.certificate.lblOtherIncome')}
                  />
                </span>
                <span>{t('employees.certificate.lblStartDate')}</span>
                <span>: {formatLocalizedDateFromIso(e?.hire_date != null ? String(e.hire_date) : null, data.locale)}</span>
              </div>
            </div>
          ) : kind === 'warningLetter' ? (
            <div className="space-y-4 text-[12px] sm:text-sm leading-relaxed print:text-[10pt]">
              <p className="text-right">
                {t('employees.certificate.lblDate')}{' '}
                {onIssueDateChange ? (
                  <input
                    type="date"
                    className="inline-block bg-transparent border-0 border-b border-gray-500 outline-none py-0.5 text-right"
                    value={toLocalIsoDateForInput(issueDate)}
                    onChange={(ev) => {
                      const v = String(ev.target.value || '');
                      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
                      if (!m) return;
                      onIssueDateChange?.(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
                    }}
                    aria-label={t('employees.certificate.lblDate')}
                  />
                ) : (
                  formatLocalizedDate(issueDate, data.locale)
                )}
              </p>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-2 items-start">
                <span>{t('employees.certificate.warning.subject', '제목')}</span>
                <span>
                  :{' '}
                  <input
                    type="text"
                    className={lineInput}
                    value={warningTitle}
                    onChange={(ev) => onWarningTitleChange(ev.target.value)}
                    placeholder={t('employees.certificate.warning.subjectPlaceholder', '경고장 제목을 입력하세요')}
                    aria-label={t('employees.certificate.warning.subject', '제목')}
                  />
                </span>
                <span>{t('employees.certificate.lblName')}</span>
                <span>: {name}</span>
                <span>{t('employees.certificate.lblDept')}</span>
                <span>: {dept}</span>
                <span>{t('employees.certificate.lblPosition')}</span>
                <span>: {position}</span>
              </div>
              <div>
                <p className="mb-1">{t('employees.certificate.warning.body', 'หนังสือเตือน')}</p>
                <textarea
                  className={`${lineInput} min-h-[28rem] print:min-h-[20rem] resize-none leading-relaxed whitespace-pre-wrap`}
                  rows={20}
                  value={warningBody}
                  onChange={(ev) => onWarningBodyChange(ev.target.value)}
                  placeholder={t('employees.certificate.warning.bodyPlaceholder', 'กรอกเนื้อหาหนังสือเตือน')}
                  aria-label={t('employees.certificate.warning.body', 'หนังสือเตือน')}
                />
              </div>
              <div>
                <p className="mb-1">{t('employees.certificate.warning.reason', '경고 사유')}</p>
                <textarea
                  className={`${lineInput} min-h-[10rem] print:min-h-[8rem] resize-none leading-relaxed`}
                  rows={8}
                  value={warningReason}
                  onChange={(ev) => onWarningReasonChange(ev.target.value)}
                  placeholder={t(
                    'employees.certificate.warning.reasonPlaceholder',
                    '경고 사유와 발생 사실을 구체적으로 입력하세요.'
                  )}
                  aria-label={t('employees.certificate.warning.reason', '경고 사유')}
                />
              </div>
              <div>
                <p className="mb-1">{t('employees.certificate.warning.actionRequired', '개선 및 조치 사항')}</p>
                <textarea
                  className={`${lineInput} min-h-[7rem] print:min-h-[5rem] resize-none leading-relaxed`}
                  rows={5}
                  value={warningActionRequired}
                  onChange={(ev) => onWarningActionRequiredChange(ev.target.value)}
                  placeholder={t(
                    'employees.certificate.warning.actionRequiredPlaceholder',
                    '재발 방지를 위한 개선 계획과 기한을 입력하세요.'
                  )}
                  aria-label={t('employees.certificate.warning.actionRequired', '개선 및 조치 사항')}
                />
              </div>
              <div className="pt-6 text-right space-y-3">
                <p>{t('employees.certificate.warning.closing', '위 사항을 숙지하고 동일 사례가 재발하지 않도록 하시기 바랍니다.')}</p>
                <div className="flex justify-end">
                  <input
                    type="text"
                    className="block w-[18rem] max-w-full text-right bg-transparent border-0 border-b border-gray-500 outline-none py-1"
                    value={warningIssuerName}
                    onChange={(ev) => onWarningIssuerNameChange(ev.target.value)}
                    placeholder={t('employees.certificate.warning.issuerPlaceholder', '발행자 성명')}
                    aria-label={t('employees.certificate.warning.issuer', '발행자')}
                  />
                </div>
                {warningIssuerSignatureDataUrl ? (
                  <div className="mt-2 flex justify-end">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={warningIssuerSignatureDataUrl}
                      alt=""
                      className="max-h-[4.5rem] max-w-[min(240px,85%)] object-contain object-right"
                    />
                  </div>
                ) : null}
                <div className="hr-cert-pdf-ignore mt-2 print:hidden flex justify-end">
                  {warningIssuerSignatureDataUrl ? (
                    <button
                      type="button"
                      onClick={() => onWarningIssuerSignatureChange(null)}
                      className="text-xs px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      {t('employees.personnelRecord.signatureRedraw', '서명 다시 입력')}
                    </button>
                  ) : (
                    <div className="w-full max-w-md">
                      <SignaturePad
                        key={empId > 0 ? `warning-issuer-sig-${empId}` : 'warning-issuer-sig'}
                        onChange={onWarningIssuerSignatureChange}
                        t={t}
                      />
                    </div>
                  )}
                </div>
                <p>{t('employees.certificate.warning.issuerRole', '인사담당자')}</p>
              </div>
            </div>
          ) : kind === 'probationEvaluation' ? (
            <div className="space-y-3 text-[12px] sm:text-[13px] leading-relaxed print:text-[10.5pt]">
              <div className="border border-black p-3">
                <div className="grid grid-cols-[1fr_120px] border border-black">
                  <div>
                    <table className="w-full border-collapse">
                      <tbody>
                        <tr>
                          <td className={thLab} style={{ width: '33%' }}>
                            {peText.evalType}
                          </td>
                          <td className={thLab} style={{ width: '33%' }}>
                            {peText.startDate} : {formatLocalizedDateFromIso(e?.hire_date != null ? String(e.hire_date) : null, data.locale)}
                          </td>
                          <td className={thLab} style={{ width: '34%' }}>
                            {peText.employeeNo} : {e?.employee_number != null ? String(e.employee_number) : '—'}
                          </td>
                        </tr>
                        <tr>
                          <td className={thLab}>
                            {peText.issueDate} : {formatLocalizedDate(issueDate, data.locale)}
                          </td>
                          <td className={thLab}>
                            {peText.trialEndDate} : {formatLocalizedDateFromIso(e?.termination_date != null ? String(e.termination_date) : null, data.locale)}
                          </td>
                          <td className={thLab}> </td>
                        </tr>
                        <tr>
                          <td className={thLab}>
                            {peText.employeeName} : {name}
                          </td>
                          <td className={thLab}>
                            {peText.position} : {position}
                          </td>
                          <td className={thLab}>
                            {peText.division} : {dept}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-center border-l border-black p-1">
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl} alt="" className="h-[120px] w-[90px] border border-black object-cover" />
                    ) : (
                      <div className="flex h-[120px] w-[90px] items-center justify-center border border-black text-[10px]">
                        {peFormLabels.photoPlaceholder}
                      </div>
                    )}
                  </div>
                </div>

                <table className="mt-2 w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className={thLab} style={{ width: '22%' }}>
                        <span className="text-blue-700">{peText.attendanceTitle}</span>
                      </td>
                      <td className={tdVal}>
                        <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 text-[10px] leading-snug">
                          <span>{peText.late}</span>
                          <input className={inlineLineInput} value={peVal('lateTimes')} onChange={(ev) => onProbationEvaluationDataChange('lateTimes', ev.target.value)} />
                          <span className="text-red-600">(-2) {peText.points}</span>
                          <span>{peText.leave}</span>
                          <input className={inlineLineInput} value={peVal('leaveDays')} onChange={(ev) => onProbationEvaluationDataChange('leaveDays', ev.target.value)} />
                          <span className="text-red-600">(-1) {peText.points}</span>
                          <span>{peText.absent}</span>
                          <input className={inlineLineInput} value={peVal('absentDays')} onChange={(ev) => onProbationEvaluationDataChange('absentDays', ev.target.value)} />
                          <span className="text-red-600">(-5) {peText.points}</span>
                          <span>{peText.warning}</span>
                          <input className={inlineLineInput} value={peVal('warningTimes')} onChange={(ev) => onProbationEvaluationDataChange('warningTimes', ev.target.value)} />
                          <span className="text-red-600">(-5) {peText.points}</span>
                        </div>
                      </td>
                      <td className={thLab} style={{ width: '12%' }}>
                        <input className={inlineLineInput} value={peVal('attendanceTotal')} onChange={(ev) => onProbationEvaluationDataChange('attendanceTotal', ev.target.value)} />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <table className="mt-2 w-full table-fixed border-collapse">
                  <tbody>
                    <tr>
                      <td className={`${thLab} !whitespace-normal`} rowSpan={2} style={{ width: '20%' }}>
                        A
                        <div className="break-words text-[15px] font-bold leading-tight text-blue-700 sm:text-[17px] print:text-[14pt]">
                          {peText.performance}
                        </div>
                      </td>
                      <ProbationScoreBandHeader title={peFormLabels.excellent} band="(30-25)" />
                      <ProbationScoreBandHeader title={peFormLabels.good} band="(24-19)" />
                      <ProbationScoreBandHeader title={peFormLabels.fair} band="(18-13)" />
                      <ProbationScoreBandHeader title={peFormLabels.improvement} band="(12-7)" />
                      <ProbationScoreBandHeader title={peFormLabels.poor} band="(6-1)" />
                      <ProbationTotalHeader label={peFormLabels.total} points="(30)" />
                    </tr>
                    <tr>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('aExcellent')} onChange={(ev) => onProbationEvaluationDataChange('aExcellent', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('aGood')} onChange={(ev) => onProbationEvaluationDataChange('aGood', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('aFair')} onChange={(ev) => onProbationEvaluationDataChange('aFair', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('aImprove')} onChange={(ev) => onProbationEvaluationDataChange('aImprove', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('aPoor')} onChange={(ev) => onProbationEvaluationDataChange('aPoor', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('aTotal')} onChange={(ev) => onProbationEvaluationDataChange('aTotal', ev.target.value)} />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <table className="mt-2 w-full table-fixed border-collapse">
                  <tbody>
                    <tr>
                      <td className={`${thLab} !whitespace-normal`} rowSpan={2} style={{ width: '20%' }}>
                        B
                        <div className="break-words pb-0.5 text-center text-[13px] font-bold leading-snug text-blue-700 sm:text-[15px] print:text-[12pt]">
                          {'skillLines' in peText && peText.skillLines ? (
                            <>
                              <span className="block">{peText.skillLines[0]}</span>
                              <span className="block">{peText.skillLines[1]}</span>
                            </>
                          ) : (
                            <span className="block">{peText.skill}</span>
                          )}
                        </div>
                      </td>
                      <ProbationScoreBandHeader title={peFormLabels.excellent} band="(15-13)" />
                      <ProbationScoreBandHeader title={peFormLabels.good} band="(12-10)" />
                      <ProbationScoreBandHeader title={peFormLabels.fair} band="(9-7)" />
                      <ProbationScoreBandHeader title={peFormLabels.improvement} band="(6-4)" />
                      <ProbationScoreBandHeader title={peFormLabels.poor} band="(3-1)" />
                      <ProbationTotalHeader label={peFormLabels.total} points="(30)" />
                    </tr>
                    <tr>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('bExcellent')} onChange={(ev) => onProbationEvaluationDataChange('bExcellent', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('bGood')} onChange={(ev) => onProbationEvaluationDataChange('bGood', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('bFair')} onChange={(ev) => onProbationEvaluationDataChange('bFair', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('bImprove')} onChange={(ev) => onProbationEvaluationDataChange('bImprove', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('bPoor')} onChange={(ev) => onProbationEvaluationDataChange('bPoor', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('bTotal')} onChange={(ev) => onProbationEvaluationDataChange('bTotal', ev.target.value)} />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <table className="mt-2 w-full table-fixed border-collapse">
                  <tbody>
                    <tr>
                      <td className={`${thLab} !whitespace-normal align-top`} rowSpan={5} style={{ width: '22%' }}>
                        <div className="break-words text-[14px] font-bold leading-snug text-blue-700 sm:text-[16px] print:text-[13pt]">
                          C {peText.general}
                        </div>
                        <ul className="mt-1.5 list-none space-y-1 pl-0 text-left text-[7px] font-semibold leading-snug sm:text-[8px] print:text-[6.5pt]">
                          {peFormLabels.generalItems.map((label, idx) => (
                            <li key={`pe-gen-${idx}`} className="break-words">
                              <span className="block">{label}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <ProbationScoreBandHeader title={peFormLabels.excellent} band="(5)" />
                      <ProbationScoreBandHeader title={peFormLabels.good} band="(4)" />
                      <ProbationScoreBandHeader title={peFormLabels.fair} band="(3)" />
                      <ProbationScoreBandHeader title={peFormLabels.improvement} band="(2)" />
                      <ProbationScoreBandHeader title={peFormLabels.poor} band="(1)" />
                      <ProbationTotalHeader label={peFormLabels.total} points="(20)" />
                    </tr>
                    <tr>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow1Excellent')} onChange={(ev) => onProbationEvaluationDataChange('cRow1Excellent', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow1Good')} onChange={(ev) => onProbationEvaluationDataChange('cRow1Good', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow1Fair')} onChange={(ev) => onProbationEvaluationDataChange('cRow1Fair', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow1Improve')} onChange={(ev) => onProbationEvaluationDataChange('cRow1Improve', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow1Poor')} onChange={(ev) => onProbationEvaluationDataChange('cRow1Poor', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow1Total')} onChange={(ev) => onProbationEvaluationDataChange('cRow1Total', ev.target.value)} />
                      </td>
                    </tr>
                    <tr>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow2Excellent')} onChange={(ev) => onProbationEvaluationDataChange('cRow2Excellent', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow2Good')} onChange={(ev) => onProbationEvaluationDataChange('cRow2Good', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow2Fair')} onChange={(ev) => onProbationEvaluationDataChange('cRow2Fair', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow2Improve')} onChange={(ev) => onProbationEvaluationDataChange('cRow2Improve', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow2Poor')} onChange={(ev) => onProbationEvaluationDataChange('cRow2Poor', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow2Total')} onChange={(ev) => onProbationEvaluationDataChange('cRow2Total', ev.target.value)} />
                      </td>
                    </tr>
                    <tr>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow3Excellent')} onChange={(ev) => onProbationEvaluationDataChange('cRow3Excellent', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow3Good')} onChange={(ev) => onProbationEvaluationDataChange('cRow3Good', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow3Fair')} onChange={(ev) => onProbationEvaluationDataChange('cRow3Fair', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow3Improve')} onChange={(ev) => onProbationEvaluationDataChange('cRow3Improve', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow3Poor')} onChange={(ev) => onProbationEvaluationDataChange('cRow3Poor', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow3Total')} onChange={(ev) => onProbationEvaluationDataChange('cRow3Total', ev.target.value)} />
                      </td>
                    </tr>
                    <tr>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow4Excellent')} onChange={(ev) => onProbationEvaluationDataChange('cRow4Excellent', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow4Good')} onChange={(ev) => onProbationEvaluationDataChange('cRow4Good', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow4Fair')} onChange={(ev) => onProbationEvaluationDataChange('cRow4Fair', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow4Improve')} onChange={(ev) => onProbationEvaluationDataChange('cRow4Improve', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow4Poor')} onChange={(ev) => onProbationEvaluationDataChange('cRow4Poor', ev.target.value)} />
                      </td>
                      <td className={peScoreInputTd}>
                        <input className={inlineLineInput} value={peVal('cRow4Total')} onChange={(ev) => onProbationEvaluationDataChange('cRow4Total', ev.target.value)} />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-2 border border-black p-2 text-[11px]">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{peText.totalPoints}</span>
                    <input className={`${inlineLineInput} w-16`} value={peVal('totalPoints')} onChange={(ev) => onProbationEvaluationDataChange('totalPoints', ev.target.value)} />
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" className="h-3.5 w-3.5" checked={peChecked('passChecked')} onChange={(ev) => onProbationEvaluationDataChange('passChecked', ev.target.checked)} />
                      <span>{peText.pass}</span>
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" className="h-3.5 w-3.5" checked={peChecked('rejectChecked')} onChange={(ev) => onProbationEvaluationDataChange('rejectChecked', ev.target.checked)} />
                      <span>{peText.reject}</span>
                    </label>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3 text-center text-[11px]">
                  <div>
                    <div>{peText.evaluatedBy}</div>
                    <div className="mt-2"><input className={inlineLineInput} value={peVal('evaluatedBy')} onChange={(ev) => onProbationEvaluationDataChange('evaluatedBy', ev.target.value)} /></div>
                    <div className="mt-1"><input className={inlineLineInput} value={peVal('evaluatedDate')} onChange={(ev) => onProbationEvaluationDataChange('evaluatedDate', ev.target.value)} /></div>
                  </div>
                  <div>
                    <div>{peText.deptMgr}</div>
                    <div className="mt-2"><input className={inlineLineInput} value={peVal('deptMgr')} onChange={(ev) => onProbationEvaluationDataChange('deptMgr', ev.target.value)} /></div>
                    <div className="mt-1"><input className={inlineLineInput} value={peVal('deptMgrDate')} onChange={(ev) => onProbationEvaluationDataChange('deptMgrDate', ev.target.value)} /></div>
                  </div>
                  <div>
                    <div>{peText.hrMgr}</div>
                    <div className="mt-2"><input className={inlineLineInput} value={peVal('hrMgr')} onChange={(ev) => onProbationEvaluationDataChange('hrMgr', ev.target.value)} /></div>
                    <div className="mt-1"><input className={inlineLineInput} value={peVal('hrMgrDate')} onChange={(ev) => onProbationEvaluationDataChange('hrMgrDate', ev.target.value)} /></div>
                  </div>
                </div>

                <div className="mt-2 text-[11px]">
                  {peText.remark}
                  <input className={`${inlineLineInput} ml-2 w-[70%]`} value={peVal('remark')} onChange={(ev) => onProbationEvaluationDataChange('remark', ev.target.value)} />
                </div>
              </div>
            </div>
          ) : kind === 'probationResult' ? (
            <div className="space-y-4 text-[12px] sm:text-[14px] leading-[1.9] print:text-[10.8pt] print:leading-[1.85]">
              <p className="text-right">{probationResultIssueDateLine}</p>
              <div className="space-y-1">
                <p>{t('employees.certificate.probation.subject')}</p>
                <p>{`${t('employees.certificate.probation.to')}: ${name}(${t('employees.certificate.probation.employeeNo')} ${e?.employee_number != null ? String(e.employee_number) : '—'})`}</p>
                <p>{probationResultReferenceLine}</p>
              </div>
              <p className="whitespace-pre-line tracking-[0.01em]">{t('employees.certificate.probation.bodyIntro')}</p>
              <p className="whitespace-pre-line tracking-[0.01em]">{t('employees.certificate.probation.bodyResult')}</p>
              <p className="tracking-[0.01em]">{t('employees.certificate.probation.bodyEncourage')}</p>
              <p className="tracking-[0.01em]">{t('employees.certificate.probation.bodyClosing')}</p>
              <div className="pt-8 text-right whitespace-pre-line">
                <p>{t('employees.certificate.probation.signatureRegards')}</p>
                <p className="mt-10">{t('employees.certificate.probation.signatureLine')}</p>
                {probationSignatureDataUrl ? (
                  <div className="mt-3 flex justify-end">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={probationSignatureDataUrl}
                      alt=""
                      className="max-h-[4.5rem] max-w-[min(240px,85%)] object-contain object-right"
                    />
                  </div>
                ) : null}
                {!probationSignatureReadOnly ? (
                  <div className="hr-cert-pdf-ignore mt-3 print:hidden">
                    {probationSignatureDataUrl ? (
                      <button
                        type="button"
                        onClick={() => onProbationSignatureChange(null)}
                        className="text-xs px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        {t('employees.personnelRecord.signatureRedraw', '서명 다시 입력')}
                      </button>
                    ) : (
                      <SignaturePad key={empId > 0 ? `prob-sig-${empId}` : 'prob-sig'} onChange={onProbationSignatureChange} t={t} />
                    )}
                  </div>
                ) : null}
                <div
                  className={`flex flex-col items-end gap-2.5 w-full max-w-full ${
                    probationSignatureDataUrl || !probationSignatureReadOnly ? 'mt-4' : 'mt-3'
                  }`}
                >
                  <input
                    type="text"
                    className="block w-[20rem] max-w-full text-right bg-transparent border-0 outline-none py-2 px-1 min-h-[2.25rem] leading-relaxed text-[12px] sm:text-[13px] placeholder:text-gray-500 focus:ring-0 print:text-[10.5pt] print:py-2"
                    value={probationSignerName}
                    onChange={(ev) => onProbationSignerNameChange(ev.target.value)}
                    placeholder={t(
                      'employees.certificate.probation.signerNamePlaceholder',
                      '서명자 성명(선택)'
                    )}
                    aria-label={t(
                      'employees.certificate.probation.signerNamePlaceholder',
                      '서명자 성명(선택)'
                    )}
                  />
                  <div
                    className="mt-0.5 h-0 w-[20rem] max-w-full shrink-0 border-b border-gray-600 print:border-gray-800"
                    aria-hidden
                  />
                </div>
                <p className="mt-7 sm:mt-8 print:mt-6 leading-relaxed">
                  {t('employees.certificate.probation.signatureTitle')}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-[13.5px] sm:text-[15.5px] leading-8 print:text-[11.4pt] print:leading-[1.78]">
              <section className="hr-contract-page p-1.5 print:p-1">
                <p className="whitespace-pre-line">
                  {data.locale === 'th' && (
                    <>
                      {`สัญญาฉบับนี้ทำที่ ${companyDisplay} เมื่อวันที่ ${formatLocalizedDate(issueDate, data.locale)} ระหว่าง
${companyDisplay} โดย ${rep || '—'} กรรมการผู้มีอำนาจลงนาม สำนักงานตั้งอยู่เลขที่ ${companyAddress}
ซึ่งต่อไปในสัญญาฉบับนี้จะเรียกว่า “บริษัท” ฝ่ายหนึ่ง กับ
${name} ต่อไปในสัญญาฉบับนี้จะเรียกว่า “พนักงาน” อีกฝ่ายหนึ่ง ทั้งสองฝ่ายตกลงทำสัญญาต่อกันดังต่อไปนี้

ข้อ 1. บริษัทตกลงจ้างพนักงานในตำแหน่ง ${position} แผนก ${dept}
โดยเงื่อนไขการทดลองงานและการประเมินผลให้เป็นไปตามระเบียบของบริษัท

ข้อ 2. บริษัทตกลงจ่ายค่าจ้างรายเดือนจำนวน `}
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        className={laborContractSalaryInput}
                        value={salaryThousandsDisplay}
                        onChange={onSalaryThousandsInput}
                        placeholder="กรอกจำนวนเงิน (บาท)"
                        aria-label="monthly salary thb"
                      />
                      {` บาท ผ่านบัญชีธนาคารของพนักงานตามรอบการจ่ายของบริษัท

ข้อ 3. พนักงานต้องปฏิบัติตามประกาศ คำสั่ง และข้อบังคับในการทำงานของบริษัทอย่างเคร่งครัด
ข้อ 4. บริษัทอาจพิจารณาเปลี่ยนแปลงตำแหน่งหรือหน้าที่การงานตามความเหมาะสม`}
                    </>
                  )}
                  {data.locale === 'en' && (
                    <>
                      {`This contract is made at ${companyDisplay} on ${formatLocalizedDate(issueDate, data.locale)} between
${companyDisplay}, represented by ${rep || '—'}, authorized director, with registered office at ${companyAddress},
hereinafter called the "Company", and ${name}, hereinafter called the "Employee".

Clause 1. The Company hires the Employee in ${position} position, ${dept} department,
subject to company probation and performance rules.

Clause 2. The Company agrees to pay monthly wages of `}
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        className={laborContractSalaryInput}
                        value={salaryThousandsDisplay}
                        onChange={onSalaryThousandsInput}
                        placeholder="Enter THB amount"
                        aria-label="monthly salary thb"
                      />
                      {` THB via the employee bank account according to company payroll cycle.

Clause 3. The Employee shall comply with company announcements, instructions, and regulations.
Clause 4. The Company may change position or duties based on business necessity and performance.`}
                    </>
                  )}
                  {data.locale === 'ko' && (
                    <>
                      {`본 계약은 ${formatLocalizedDate(issueDate, data.locale)} ${companyDisplay}에서 체결된다.
회사(${companyDisplay}, 대표이사 ${rep || '—'}, 주소 ${companyAddress})와 직원(${name})은 다음과 같이 합의한다.

제1조 직원의 소속은 ${dept}, 직위는 ${position}이며 수습·평가 기준은 회사 규정에 따른다.
제2조 회사는 직원에게 월 급여 `}
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        className={laborContractSalaryInput}
                        value={salaryThousandsDisplay}
                        onChange={onSalaryThousandsInput}
                        placeholder="월 급여(바트) 입력"
                        aria-label="monthly salary thb"
                      />
                      {` 바트를 지급하며 회사 급여지급일에 직원 계좌로 송금한다.

제3조 직원은 회사의 공지·지시·취업규칙을 성실히 준수해야 한다.
제4조 회사는 업무상 필요 및 평가 결과에 따라 직무·직위를 변경할 수 있다.`}
                    </>
                  )}
                </p>
              </section>

              <section className="hr-contract-page hr-labor-contract-page-start p-1.5 print:p-1">
                <p className="whitespace-pre-line">
                  {data.locale === 'th'
                    ? `ข้อ 5. พนักงานรับรองว่าข้อมูลประวัติส่วนตัว การศึกษา และการทำงานที่แจ้งต่อบริษัทเป็นความจริง
หากภายหลังปรากฏว่าเป็นเท็จ บริษัทมีสิทธิเลิกจ้างได้ทันที

ข้อ 6. พนักงานต้องไม่ประกอบกิจการหรือมีส่วนได้เสียในธุรกิจที่แข่งขันกับบริษัท
ไม่ว่าโดยทางตรงหรือทางอ้อม เว้นแต่ได้รับความยินยอมเป็นลายลักษณ์อักษรจากบริษัท

ข้อ 7. ข้อมูล ความคิด ผลงาน หรือสิ่งประดิษฐ์ที่พนักงานจัดทำขึ้นในการทำงาน
ให้ถือเป็นสิทธิของบริษัท

ข้อ 8. ตลอดระยะเวลาการจ้างงานและภายหลังสิ้นสุดสัญญา พนักงานต้องรักษาความลับทางธุรกิจของบริษัท
หากฝ่าฝืน บริษัทมีสิทธิเรียกร้องค่าเสียหาย`
                    : data.locale === 'en'
                      ? `Clause 5. The Employee certifies that all submitted personal, education, and work history information is true.
If any information is found false, the Company may terminate employment immediately.

Clause 6. The Employee shall not directly or indirectly engage in competing business
without prior written approval from the Company.

Clause 7. Information, ideas, works, and inventions created in the course of work
shall belong to the Company.

Clause 8. During and after employment, the Employee shall keep company business information confidential.
If violated, the Company may claim damages.`
                      : `제5조 직원이 제출한 개인·학력·경력 정보가 허위로 확인될 경우 회사는 즉시 계약을 해지할 수 있다.

제6조 직원은 회사의 사전 서면 승인 없이 경쟁업종에 직·간접적으로 관여할 수 없다.

제7조 재직 중 업무 수행으로 발생한 정보·아이디어·성과·발명에 관한 권리는 회사에 귀속된다.

제8조 직원은 재직 중 및 퇴직 후에도 회사의 영업비밀을 외부에 누설해서는 안 되며,
위반 시 회사는 손해배상을 청구할 수 있다.`}
                </p>
              </section>

              <section className="hr-contract-page hr-labor-contract-page-start p-1.5 print:p-1">
                <p className="whitespace-pre-line">
                  {data.locale === 'th'
                    ? `ข้อ 9. กรณีพนักงานประสงค์ลาออก ต้องแจ้งเป็นหนังสือล่วงหน้าไม่น้อยกว่า 30 วัน
และต้องส่งมอบงานพร้อมทรัพย์สินของบริษัทให้เรียบร้อยก่อนสิ้นสุดสัญญา

สัญญานี้ทำขึ้นสองฉบับ มีข้อความตรงกัน คู่สัญญาได้อ่านและเข้าใจโดยตลอดแล้วจึงลงลายมือชื่อไว้เป็นหลักฐาน`
                    : data.locale === 'en'
                      ? `Clause 9. If the Employee resigns, written notice must be given at least 30 days in advance.
The Employee must complete handover and return company property before termination.

This contract is made in two originals. Both parties have read and understood all terms and sign below as evidence.`
                      : `제9조 직원이 사직하고자 할 경우 최소 30일 전에 서면 통지해야 하며,
계약 종료 전까지 인수인계 및 회사 자산 반납을 완료해야 한다.

본 계약은 동일한 내용의 2부를 작성하여 당사자가 각각 1부씩 보관한다.`}
                </p>

                <div className="mt-10 grid grid-cols-2 gap-x-10 gap-y-8 text-center">
                  <div>
                    <div className="mb-2">
                      {`${t('employees.certificate.laborContract.signPrefix', 'ลงชื่อ')}................................................. ${t('employees.certificate.laborContract.signEmployer', 'นายจ้าง')}`}
                    </div>
                    <div>( {rep || '—'} )</div>
                    <div>{t('employees.certificate.laborContract.roleAuthorizedDirector', 'กรรมการผู้มีอำนาจ')}</div>
                  </div>
                  <div>
                    <div className="mb-2">
                      {`${t('employees.certificate.laborContract.signPrefix', 'ลงชื่อ')}................................................. ${t('employees.certificate.laborContract.signEmployee', 'ลูกจ้าง')}`}
                    </div>
                    <div>( {name} )</div>
                    <div>{t('employees.certificate.laborContract.roleEmployee', 'พนักงาน')}</div>
                  </div>
                  <div>
                    <div className="mb-2">
                      {`${t('employees.certificate.laborContract.signPrefix', 'ลงชื่อ')}................................................. ${t('employees.certificate.laborContract.signWitness', 'พยาน')}`}
                    </div>
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span>(</span>
                      <input
                        type="text"
                        className={`${inlineLineInput} w-[12rem]`}
                        value={laborContractWitness1}
                        onChange={(ev) => onLaborContractWitness1Change(ev.target.value)}
                        placeholder={data.locale === 'en' ? 'Witness 1' : '증인 1 / พยาน 1'}
                        aria-label="witness 1"
                      />
                      <span>)</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2">
                      {`${t('employees.certificate.laborContract.signPrefix', 'ลงชื่อ')}................................................. ${t('employees.certificate.laborContract.signWitness', 'พยาน')}`}
                    </div>
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span>(</span>
                      <input
                        type="text"
                        className={`${inlineLineInput} w-[12rem]`}
                        value={laborContractWitness2}
                        onChange={(ev) => onLaborContractWitness2Change(ev.target.value)}
                        placeholder={data.locale === 'en' ? 'Witness 2' : '증인 2 / พยาน 2'}
                        aria-label="witness 2"
                      />
                      <span>)</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        {kind === 'career' || kind === 'salary' ? <div className="hr-cert-spacer min-h-[3mm] flex-1" aria-hidden /> : null}

        <div className={`hr-cert-footer shrink-0 ${kind === 'employment' ? 'pt-5' : 'pt-1'} ${kind === 'laborContract' || kind === 'probationResult' || kind === 'probationEvaluation' || kind === 'privacyConsent' ? 'hidden' : ''}`}>
          {statement ? (
            <p className="text-center text-sm sm:text-base font-medium mb-1 print:mb-1 print:text-[10.5pt]">{statement}</p>
          ) : null}
          <p className="text-center text-sm sm:text-base mb-3 tabular-nums print:mb-2 print:text-[10.5pt]">
            {formatLocalizedDate(issueDate, data.locale)}
          </p>

          <div className="text-right text-sm sm:text-base space-y-1 pr-0.5 print:text-[10.5pt]">
            <div className="font-semibold">{companyDisplay}</div>
            <div className="whitespace-pre-wrap">
              {[t('employees.certificate.ceoPrefix'), rep].filter(Boolean).join('\u00A0\u00A0\u00A0')}
            </div>
          </div>
        </div>
        </div>

        {showEmployeeSignatureFooter ? (
          <div className="employee-signature-portal-zone mt-4 shrink-0 border-t border-gray-400 pt-4 pointer-events-auto print:pt-3">
            <p className="text-sm font-semibold text-gray-900 mb-2">
              {t('employees.certificate.employeeConfirmSignature', '직원 확인 서명')}
            </p>
            {employeeSignatureDataUrl ? (
              <div className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={employeeSignatureDataUrl}
                  alt=""
                  className="max-h-[5rem] max-w-[min(280px,90%)] object-contain object-left border border-gray-200 rounded bg-white"
                />
                {employeeSignatureCaptureEnabled ? (
                  <div className="hr-cert-pdf-ignore print:hidden">
                    <button
                      type="button"
                      onClick={() => onEmployeeSignatureChange(null)}
                      className="text-xs px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      {t('employees.personnelRecord.signatureRedraw', '서명 다시 입력')}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {employeeSignatureCaptureEnabled && !employeeSignatureDataUrl ? (
              <div className="hr-cert-pdf-ignore print:hidden max-w-md">
                <SignaturePad
                  key={empId > 0 ? `emp-sig-${empId}` : 'emp-sig'}
                  onChange={onEmployeeSignatureChange}
                  t={t}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
