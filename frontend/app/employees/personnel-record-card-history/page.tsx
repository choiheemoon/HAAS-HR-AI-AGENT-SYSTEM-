'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, Printer, RefreshCw, Eye, Filter, ChevronDown, X, Link2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';
import PersonnelRecordCard, { type PersonnelRecordBundle } from '@/components/employees/PersonnelRecordCard';
import { pickCompanyDisplayName } from '@/lib/companyDisplayName';
import {
  buildCertificateDocumentNumber,
  HrCertificateDocument,
  createDefaultProbationEvaluationData,
  type HrCertificateKind,
  type ProbationEvaluationData,
} from '@/components/employees/HrCertificateDocument';

type IssueRow = {
  id: number;
  employee_id: number;
  certificate_kind: HrCertificateKind;
  issue_date: string;
  created_at: string;
  created_by?: string | null;
  created_by_name?: string | null;
  payload_json?: {
    bundle?: PersonnelRecordBundle;
    certificate?: {
      kind?: HrCertificateKind;
      documentNumber?: string;
      issueDate?: string;
      submitTo?: string;
      purpose?: string;
      remarks?: string;
      employmentPosition?: string;
      employmentDuty?: string;
      employmentSalary?: string;
      employmentBenefits?: string;
      laborContractWitness1?: string;
      laborContractWitness2?: string;
      warningTitle?: string;
      warningBody?: string;
      warningReason?: string;
      warningActionRequired?: string;
      warningIssuerName?: string;
      warningIssuerSignatureDataUrl?: string | null;
      probationSignerName?: string;
      probationSignatureDataUrl?: string | null;
      probationEvaluationData?: ProbationEvaluationData;
      employeeSignatureDataUrl?: string | null;
    };
  };
  employee_portal_opened_at?: string | null;
  employee_portal_signed_at?: string | null;
  employee_portal_acknowledged_at?: string | null;
};

type FilterKey =
  | 'id'
  | 'employee'
  | 'docNo'
  | 'kind'
  | 'issueDate'
  | 'registeredBy'
  | 'registeredAt'
  | 'portal';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/** 인사카드/증명서 이력 조회 필터(백엔드 certificate_kind + UI 인사카드 탭) */
const HISTORY_CERTIFICATE_KIND_VALUES = [
  'card',
  'employment',
  'career',
  'salary',
  'warningLetter',
  'privacyConsent',
  'laborContract',
  'probationResult',
  'probationEvaluation',
] as const;

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 발급일 조회 기본 구간: 종료=오늘, 시작=오늘 기준 1개월 전 */
function defaultCertificateIssueDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  from.setMonth(from.getMonth() - 1);
  return { from: toIsoDateLocal(from), to: toIsoDateLocal(to) };
}

export default function PersonnelRecordCardHistoryPage() {
  const { t, locale } = useI18n();
  const { can, loading: permLoading } = useMenuPermissions();
  const allowRead = can('hr-personnel-record-card-history', 'can_read');
  const printRef = useRef<HTMLDivElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<IssueRow | null>(null); // modal selected
  const [pdfWorking, setPdfWorking] = useState(false);
  /** 직원 전달 링크 발급 중인 발급이력 id (목록·모달 공통) */
  const [deliveryWorkingId, setDeliveryWorkingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [columnFilters, setColumnFilters] = useState<Record<FilterKey, string[]>>({
    id: [],
    employee: [],
    docNo: [],
    kind: [],
    issueDate: [],
    registeredBy: [],
    registeredAt: [],
    portal: [],
  });
  const [openFilterKey, setOpenFilterKey] = useState<FilterKey | null>(null);

  const [searchDateFrom, setSearchDateFrom] = useState(() => defaultCertificateIssueDateRange().from);
  const [searchDateTo, setSearchDateTo] = useState(() => defaultCertificateIssueDateRange().to);
  const [searchEmployeeName, setSearchEmployeeName] = useState('');
  const [searchDocNo, setSearchDocNo] = useState('');
  const [searchCertificateKind, setSearchCertificateKind] = useState<string>('');

  const viewKind = selected?.payload_json?.certificate?.kind || selected?.certificate_kind || 'employment';
  const rawBundle = selected?.payload_json?.bundle || null;
  const [companyMergeBundle, setCompanyMergeBundle] = useState<PersonnelRecordBundle | null>(null);
  const cert = selected?.payload_json?.certificate || {};

  useEffect(() => {
    setCompanyMergeBundle(null);
    if (!selected?.id) return;
    const raw = selected.payload_json?.bundle;
    if (!raw?.employee) return;
    const hasCoName =
      Boolean(raw.companyName?.trim()) || Boolean(raw.companyNameKor?.trim());
    if (hasCoName) return;
    const cid = Number(raw.employee.company_id);
    if (!Number.isFinite(cid) || cid <= 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient.getCompany(cid);
        const cd = (res.data ?? {}) as {
          name_kor?: string | null;
          name_eng?: string | null;
          name_thai?: string | null;
          company_code?: string | null;
          logo_data_url?: string | null;
          representative_director_name?: string | null;
          address_no?: string | null;
          soi?: string | null;
          road?: string | null;
          tumbon?: string | null;
          amphur?: string | null;
          province?: string | null;
          zip_code?: string | null;
        };
        const fromApi = pickCompanyDisplayName(cd, locale);
        const nameKor =
          typeof cd.name_kor === 'string' && cd.name_kor.trim() !== '' ? cd.name_kor.trim() : null;
        const logoRaw = cd.logo_data_url;
        const logo =
          typeof logoRaw === 'string' && logoRaw.trim() !== '' ? logoRaw.trim() : null;
        const rep =
          typeof cd.representative_director_name === 'string' && cd.representative_director_name.trim() !== ''
            ? cd.representative_director_name.trim()
            : null;
        const parts = [cd.address_no, cd.soi, cd.road, cd.tumbon, cd.amphur, cd.province, cd.zip_code]
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter(Boolean);
        const addr = parts.length > 0 ? parts.join(' ') : null;
        if (cancelled) return;
        setCompanyMergeBundle({
          ...raw,
          companyName: (raw.companyName?.trim() || fromApi).trim(),
          companyNameKor: raw.companyNameKor ?? nameKor,
          companyLogoUrl: raw.companyLogoUrl ?? logo,
          companyRepresentativeName: raw.companyRepresentativeName ?? rep,
          companyAddress: raw.companyAddress ?? addr,
        });
      } catch {
        /* keep snapshot as-is */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, locale]);

  const bundle = companyMergeBundle ?? rawBundle;
  const probationEvaluationData = cert.probationEvaluationData ?? createDefaultProbationEvaluationData();
  const issueDate = cert.issueDate ? new Date(cert.issueDate) : selected?.issue_date ? new Date(selected.issue_date) : new Date();

  const canOutput = !!selected && !!bundle?.employee;

  const formatDateTime = (v?: string | null) => {
    if (!v) return '-';
    try {
      const d = new Date(v);
      return Number.isNaN(d.getTime())
        ? v
        : d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return v;
    }
  };

  const portalStatusLabel = (r: IssueRow) => {
    if (r.employee_portal_signed_at) {
      return t('employees.personnelRecordHistory.portalSigned', '직원 서명 완료');
    }
    if (r.employee_portal_acknowledged_at) {
      return t('employees.personnelRecordHistory.portalAcked', '직원 확인 완료');
    }
    if (r.employee_portal_opened_at) {
      return t('employees.personnelRecordHistory.portalOpened', '직원 열람');
    }
    return '—';
  };

  const kindLabel = (kind: HrCertificateKind) => {
    if (kind === 'card') return t('employees.certificate.tabCard', '인사카드');
    if (kind === 'employment') return t('employees.certificate.tabEmployment', '재직증명서');
    if (kind === 'career') return t('employees.certificate.tabCareer', '경력증명서');
    if (kind === 'salary') return t('employees.certificate.tabSalary', '급여증명서');
    if (kind === 'warningLetter') return t('employees.certificate.tabWarningLetter', '경고장');
    if (kind === 'privacyConsent') return t('employees.certificate.tabPrivacyConsent', '개인정보 수집·이용·제공 동의서');
    if (kind === 'laborContract') return t('employees.certificate.tabLaborContract', '근로계약서');
    if (kind === 'probationResult') return t('employees.certificate.tabProbationResult', '수습기간평가 결과 통지');
    return t('employees.certificate.tabProbationEvaluation', '수습평가서');
  };

  const getRawCertificateKind = (r: IssueRow) =>
    String(r.payload_json?.certificate?.kind || r.certificate_kind || 'employment');

  const getRowDisplay = (r: IssueRow) => {
    const rawKind = getRawCertificateKind(r) as HrCertificateKind;
    const issueDateForDocNo = r.payload_json?.certificate?.issueDate || r.issue_date;
    const fallbackDocNo =
      issueDateForDocNo && r.employee_id
        ? buildCertificateDocumentNumber(new Date(issueDateForDocNo), r.employee_id, rawKind)
        : '-';
    const documentNumber = r.payload_json?.certificate?.documentNumber || fallbackDocNo;
    return {
      id: String(r.id),
      employee: String(r.payload_json?.bundle?.employee?.name ?? '-'),
      docNo: documentNumber,
      kind: kindLabel(rawKind),
      issueDate: r.issue_date || '-',
      registeredBy: r.created_by_name || r.created_by || '-',
      registeredAt: formatDateTime(r.created_at),
      portal: portalStatusLabel(r),
    };
  };

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getEmployeeCertificateIssuesBulk();
      const list = (res.data as IssueRow[]) ?? [];
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [
    pageSize,
    columnFilters,
    rows.length,
    searchDateFrom,
    searchDateTo,
    searchEmployeeName,
    searchDocNo,
    searchCertificateKind,
  ]);

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

  const handlePrint = () => {
    if (!canOutput) return;
    window.print();
  };

  const handleCreateDeliveryLinkForRow = async (row: IssueRow) => {
    const id = row.id;
    if (!id) return;
    setDeliveryWorkingId(id);
    try {
      const res = await apiClient.createCertificateIssueDeliveryToken(id);
      let url = String(res.data?.delivery_url || '').trim();
      if (url.startsWith('/')) {
        url = `${window.location.origin}${url}`;
      }
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* ignore */
      }
      window.alert(
        `${t('employees.personnelRecordHistory.deliveryLinkCopied', '직원에게 전달할 주소가 클립보드에 복사되었습니다(지원 브라우저).')}\n\n${url}`,
      );
    } catch {
      window.alert(t('employees.personnelRecordHistory.deliveryLinkFailed', '링크 발급에 실패했습니다.'));
    } finally {
      setDeliveryWorkingId(null);
      void loadRows();
    }
  };

  const handleCreateDeliveryLink = () => {
    if (!selected?.id) return;
    void handleCreateDeliveryLinkForRow(selected);
  };

  const pdfBaseName = useMemo(() => {
    if (!selected) return 'certificate-history';
    return `certificate-history-${selected.id}`;
  }, [selected]);

  const filteredRows = useMemo(() => {
    const bySearch = rows.filter((r) => {
      const issueDay = (r.issue_date && String(r.issue_date).slice(0, 10)) || '';
      if (searchDateFrom && (!issueDay || issueDay < searchDateFrom)) return false;
      if (searchDateTo && (!issueDay || issueDay > searchDateTo)) return false;

      const display = getRowDisplay(r);
      const empQ = searchEmployeeName.trim().toLowerCase();
      if (empQ && !display.employee.toLowerCase().includes(empQ)) return false;

      const docQ = searchDocNo.trim().toLowerCase();
      if (docQ && !display.docNo.toLowerCase().includes(docQ)) return false;

      if (searchCertificateKind && getRawCertificateKind(r) !== searchCertificateKind) return false;

      return true;
    });

    const hasColFilters = (Object.keys(columnFilters) as FilterKey[]).some(
      (k) => (columnFilters[k] ?? []).length > 0
    );
    if (!hasColFilters) return bySearch;

    return bySearch.filter((r) => {
      const d = getRowDisplay(r);
      return (Object.keys(columnFilters) as FilterKey[]).every((k) => {
        const selectedValues = columnFilters[k] ?? [];
        if (selectedValues.length === 0) return true;
        return selectedValues.includes(d[k]);
      });
    });
  }, [
    rows,
    columnFilters,
    searchDateFrom,
    searchDateTo,
    searchEmployeeName,
    searchDocNo,
    searchCertificateKind,
    t,
  ]);

  const uniqueValuesByKey = useMemo(() => {
    const map: Record<FilterKey, string[]> = {
      id: [],
      employee: [],
      docNo: [],
      kind: [],
      issueDate: [],
      registeredBy: [],
      registeredAt: [],
      portal: [],
    };
    (Object.keys(map) as FilterKey[]).forEach((k) => {
      const set = new Set<string>();
      rows.forEach((r) => {
        const v = getRowDisplay(r)[k];
        if (v) set.add(v);
      });
      map[k] = Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
    });
    return map;
  }, [rows]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);
  const startItem = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = total === 0 ? 0 : Math.min(safePage * pageSize, total);

  const toggleColumnFilter = (key: FilterKey, value: string) => {
    setColumnFilters((prev) => {
      const arr = prev[key] ?? [];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  };

  const clearColumnFilter = (key: FilterKey) => {
    setColumnFilters((prev) => ({ ...prev, [key]: [] }));
    setOpenFilterKey(null);
  };

  const handlePdf = async () => {
    const el = printRef.current;
    if (!el || !canOutput) return;
    setPdfWorking(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const vk = viewKind as HrCertificateKind;
      const isCert =
        vk === 'employment' ||
        vk === 'career' ||
        vk === 'salary' ||
        vk === 'warningLetter' ||
        vk === 'privacyConsent' ||
        vk === 'laborContract' ||
        vk === 'probationEvaluation' ||
        vk === 'probationResult';
      const isLaborContractPdf = vk === 'laborContract';
      const certNode = isCert ? el.querySelector<HTMLElement>('.hr-certificate-doc') : null;
      const pdfFrom = certNode && certNode.offsetHeight > 0 ? certNode : el;
      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `${pdfBaseName}.pdf`,
          image: { type: 'jpeg', quality: 0.92 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            letterRendering: true,
            ignoreElements: (node: Element) => node.classList?.contains('hr-cert-pdf-ignore') ?? false,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          ...({
            pagebreak: {
              mode: ['css', 'legacy'],
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
    } finally {
      setPdfWorking(false);
    }
  };

  if (permLoading) {
    return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
  }
  if (!allowRead) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-10 text-center text-sm text-amber-950">{t('permission.noAccess')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow border border-gray-200 p-4 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('employees.personnelRecordHistory.pageTitle', '인사카드/증명서 조회')}</h2>
          <p className="text-sm text-gray-600 mt-1">{t('employees.personnelRecordHistory.pageSubtitle', '저장된 증명서 발급 이력을 조회하고 재인쇄/PDF 저장할 수 있습니다.')}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-slate-50/90 p-3 space-y-3">
          <div className="text-sm font-medium text-gray-800">
            {t('employees.personnelRecordHistory.searchCriteria', '조회 조건')}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-xs font-medium text-gray-600">
                {t('employees.personnelRecordHistory.searchPeriod', '기간(발급일)')}
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={searchDateFrom}
                  onChange={(e) => setSearchDateFrom(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm min-w-[9.5rem]"
                />
                <span className="text-gray-400 text-sm">~</span>
                <input
                  type="date"
                  value={searchDateTo}
                  onChange={(e) => setSearchDateTo(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm min-w-[9.5rem]"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 min-w-[140px] flex-1 sm:max-w-[200px]">
              <label className="text-xs font-medium text-gray-600">
                {t('employees.personnelRecordHistory.searchEmployee', '대상직원')}
              </label>
              <input
                type="text"
                value={searchEmployeeName}
                onChange={(e) => setSearchEmployeeName(e.target.value)}
                placeholder={t('employees.personnelRecordHistory.searchEmployeePlaceholder', '이름 일부 입력')}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px] flex-1 sm:max-w-[200px]">
              <label className="text-xs font-medium text-gray-600">
                {t('employees.personnelRecordHistory.searchDocNo', '발급번호')}
              </label>
              <input
                type="text"
                value={searchDocNo}
                onChange={(e) => setSearchDocNo(e.target.value)}
                placeholder={t('employees.personnelRecordHistory.searchDocNoPlaceholder', '번호 일부 입력')}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[160px] flex-1 sm:max-w-[220px]">
              <label className="text-xs font-medium text-gray-600">
                {t('employees.personnelRecordHistory.searchKind', '증명서종류')}
              </label>
              <select
                value={searchCertificateKind}
                onChange={(e) => setSearchCertificateKind(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full bg-white"
              >
                <option value="">{t('employees.personnelRecordHistory.searchKindAll', '전체')}</option>
                {HISTORY_CERTIFICATE_KIND_VALUES.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k as HrCertificateKind)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                const r = defaultCertificateIssueDateRange();
                setSearchDateFrom(r.from);
                setSearchDateTo(r.to);
                setSearchEmployeeName('');
                setSearchDocNo('');
                setSearchCertificateKind('');
              }}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50"
            >
              {t('employees.personnelRecordHistory.resetSearch', '조건 초기화')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">필터</span>
          </div>
          <button
            type="button"
            onClick={() => void loadRows()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {t('appList.filter.refresh')}
          </button>
          <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
            <span>
              총 {total.toLocaleString()}건 ({startItem}~{endItem})
            </span>
            <label className="flex items-center gap-1">
              <span>페이지</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}개
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.prev')}
            </button>
            <span className="px-2">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.next')}
            </button>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left w-16">순번</th>
                {([
                  { key: 'employee', label: t('employees.personnelRecord.selectEmployee') },
                  { key: 'docNo', label: t('employees.personnelRecordHistory.docNoColumn', '발급번호') },
                  { key: 'kind', label: t('employees.personnelRecordHistory.certificateKind', '증명서 종류') },
                  { key: 'issueDate', label: t('employees.personnelRecordHistory.issueDate', '발급일') },
                  { key: 'registeredBy', label: t('employees.personnelRecordHistory.createdBy', '등록자') },
                  { key: 'registeredAt', label: t('employees.personnelRecordHistory.createdAt', '등록일') },
                  {
                    key: 'portal',
                    label: t('employees.personnelRecordHistory.portalColumn', '직원 전달'),
                  },
                ] as { key: FilterKey; label: string }[]).map(({ key, label }) => {
                  const selectedValues = columnFilters[key] ?? [];
                  const hasFilter = selectedValues.length > 0;
                  const options = uniqueValuesByKey[key] ?? [];
                  return (
                    <Fragment key={key}>
                      <th className="px-3 py-2 text-left">
                        <div className="flex items-center gap-1">
                          <span>{label}</span>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenFilterKey((k) => (k === key ? null : key))}
                              className={`p-0.5 rounded hover:bg-gray-200 ${hasFilter ? 'text-blue-600' : 'text-gray-400'}`}
                              title="필터"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            {openFilterKey === key && (
                              <div
                                ref={filterPopoverRef}
                                className="absolute left-0 top-full mt-1 z-20 w-56 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-2"
                              >
                                <div className="px-2 pb-2 border-b border-gray-100 flex justify-between items-center">
                                  <span className="text-xs font-medium text-gray-600">필터</span>
                                  <button
                                    type="button"
                                    onClick={() => clearColumnFilter(key)}
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                    초기화
                                  </button>
                                </div>
                                <div className="max-h-48 overflow-y-auto py-1">
                                  {options.length === 0 ? (
                                    <p className="px-2 py-1 text-xs text-gray-500">값이 없습니다.</p>
                                  ) : (
                                    options.map((val) => (
                                      <label key={val} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={selectedValues.includes(val)}
                                          onChange={() => toggleColumnFilter(key, val)}
                                          className="rounded border-gray-300"
                                        />
                                        <span className="text-xs truncate flex-1" title={val}>
                                          {val}
                                        </span>
                                      </label>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </th>
                    </Fragment>
                  );
                })}
                <th className="px-3 py-2 text-left min-w-[9.5rem]">
                  {t('employees.personnelRecordHistory.detailAndLinkColumn', '상세 · 전달')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-gray-500">{t('common.loading')}</td>
                </tr>
              )}
              {!loading && pagedRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-gray-500">{t('common.noData')}</td>
                </tr>
              )}
              {!loading && pagedRows.map((r, idx) => {
                const display = getRowDisplay(r);
                const seq = total > 0 ? total - ((safePage - 1) * pageSize + idx) : 0;
                return (
                <tr
                  key={r.id}
                  className="border-t hover:bg-gray-50"
                >
                  <td className="px-3 py-2 text-gray-600">{seq}</td>
                  <td className="px-3 py-2">{display.employee}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{display.docNo}</td>
                  <td className="px-3 py-2">{display.kind}</td>
                  <td className="px-3 py-2">{display.issueDate}</td>
                  <td className="px-3 py-2">{display.registeredBy}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{display.registeredAt}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{display.portal}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCreateDeliveryLinkForRow(r)}
                        disabled={deliveryWorkingId === r.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-800 hover:bg-indigo-100 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('employees.personnelRecordHistory.createDeliveryLink', '직원 전달 링크')}
                      >
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        {deliveryWorkingId === r.id
                          ? t('common.loading')
                          : t('employees.personnelRecordHistory.deliveryLinkShort', '전달')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {t('common.view', '보기')}
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">증명서 상세 조회</h3>
                <p className="text-sm text-slate-600 mt-0.5">
                  {kindLabel(viewKind as HrCertificateKind)} · {cert.issueDate || selected.issue_date || '-'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void handleCreateDeliveryLink()}
                  disabled={!selected?.id || deliveryWorkingId === selected.id}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Link2 className="w-4 h-4" />
                  {deliveryWorkingId === selected?.id
                    ? t('common.loading')
                    : t('employees.personnelRecordHistory.createDeliveryLink', '직원 전달 링크')}
                </button>
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

            <div ref={printRef} className="overflow-y-auto p-4 bg-white print:p-0 print:overflow-visible">
              {bundle?.employee && viewKind === 'card' && <PersonnelRecordCard data={bundle} t={t} />}
              {bundle?.employee && viewKind !== 'card' && (
                <HrCertificateDocument
                  data={bundle}
                  kind={viewKind as HrCertificateKind}
                  issueDate={issueDate}
                  certificateNumber={cert.documentNumber ?? ''}
                  submitTo={cert.submitTo ?? ''}
                  purpose={cert.purpose ?? ''}
                  remarks={cert.remarks ?? ''}
                  onSubmitToChange={() => {}}
                  onPurposeChange={() => {}}
                  onRemarksChange={() => {}}
                  employmentPosition={cert.employmentPosition ?? ''}
                  employmentDuty={cert.employmentDuty ?? ''}
                  employmentSalary={cert.employmentSalary ?? ''}
                  employmentBenefits={cert.employmentBenefits ?? ''}
                  onEmploymentPositionChange={() => {}}
                  onEmploymentDutyChange={() => {}}
                  onEmploymentSalaryChange={() => {}}
                  onEmploymentBenefitsChange={() => {}}
                  laborContractWitness1={cert.laborContractWitness1 ?? ''}
                  laborContractWitness2={cert.laborContractWitness2 ?? ''}
                  warningTitle={cert.warningTitle ?? ''}
                  warningBody={cert.warningBody ?? ''}
                  warningReason={cert.warningReason ?? ''}
                  warningActionRequired={cert.warningActionRequired ?? ''}
                  warningIssuerName={cert.warningIssuerName ?? ''}
                  warningIssuerSignatureDataUrl={cert.warningIssuerSignatureDataUrl ?? null}
                  onLaborContractWitness1Change={() => {}}
                  onLaborContractWitness2Change={() => {}}
                  onWarningTitleChange={() => {}}
                  onWarningBodyChange={() => {}}
                  onWarningReasonChange={() => {}}
                  onWarningActionRequiredChange={() => {}}
                  onWarningIssuerNameChange={() => {}}
                  onWarningIssuerSignatureChange={() => {}}
                  probationSignerName={cert.probationSignerName ?? ''}
                  onProbationSignerNameChange={() => {}}
                  probationSignatureDataUrl={cert.probationSignatureDataUrl ?? null}
                  onProbationSignatureChange={() => {}}
                  probationSignatureReadOnly
                  probationEvaluationData={probationEvaluationData}
                  onProbationEvaluationDataChange={() => {}}
                  employeeSignatureDataUrl={cert.employeeSignatureDataUrl ?? null}
                  onEmployeeSignatureChange={() => {}}
                  employeeSignatureCaptureEnabled={false}
                  t={t}
                />
              )}
              {!bundle?.employee && (
                <div className="text-center py-16 text-gray-500 text-sm">
                  {t('employees.personnelRecordHistory.empty', '조회 이력을 선택하세요.')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
