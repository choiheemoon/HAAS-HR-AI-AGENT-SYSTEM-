'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HrCertificateDocument,
  createDefaultProbationEvaluationData,
  type HrCertificateKind,
  type ProbationEvaluationData,
} from '@/components/employees/HrCertificateDocument';
import type { PersonnelRecordBundle } from '@/components/employees/PersonnelRecordCard';
import { useI18n } from '@/contexts/I18nContext';
import {
  certificateDeliveryPhotoUrl,
  fetchCertificateDeliveryPublic,
  postCertificateDeliveryAcknowledge,
  postCertificateDeliverySign,
  type CertificateDeliveryPublicPayload,
} from '@/lib/certificateDeliveryPublic';

function parseBundle(payload: CertificateDeliveryPublicPayload): PersonnelRecordBundle | null {
  const raw = payload.payload_json?.bundle;
  return raw && typeof raw === 'object' ? (raw as PersonnelRecordBundle) : null;
}

function parseCert(payload: CertificateDeliveryPublicPayload) {
  const c = payload.payload_json?.certificate;
  return c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
}

function CertificateDeliveryInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const token = (searchParams.get('token') || '').trim();

  const [data, setData] = useState<CertificateDeliveryPublicPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoadError('링크에 token 이 없습니다. 관리자가 보낸 주소 전체를 사용해 주세요.');
      return;
    }
    setLoadError(null);
    try {
      const row = await fetchCertificateDeliveryPublic(token);
      setData(row);
      const cert = parseCert(row);
      const existing = cert.employeeSignatureDataUrl;
      if (typeof existing === 'string' && existing.startsWith('data:image')) {
        setSig(existing);
      } else {
        setSig(null);
      }
      setDoneMessage(null);
      setSubmitError(null);
    } catch (e) {
      setData(null);
      setLoadError(e instanceof Error ? e.message : '불러오지 못했습니다.');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const bundle = data ? parseBundle(data) : null;
  const cert = data ? parseCert(data) : {};
  const viewKind = (cert.kind as HrCertificateKind) || (data?.certificate_kind as HrCertificateKind) || 'employment';
  const probationEvaluationData =
    (cert.probationEvaluationData as ProbationEvaluationData) ?? createDefaultProbationEvaluationData();
  const issueDate = cert.issueDate
    ? new Date(String(cert.issueDate))
    : data?.issue_date
      ? new Date(data.issue_date)
      : new Date();

  const photoOverride = token ? certificateDeliveryPhotoUrl(token) : '';

  const canSign = Boolean(data?.can_submit_signature);
  const canAck = Boolean(data?.can_acknowledge);
  const alreadyDone = Boolean(data && !canSign && !canAck && (data.signed || data.acknowledged));

  const title = useMemo(() => {
    if (!data) return '증명서 확인';
    if (!data.requires_employee_signature) return '문서 확인 · 수령 확인';
    return '증명서 확인 · 서명';
  }, [data]);

  const onSubmit = async () => {
    if (!token || !data) return;
    setSubmitError(null);
    if (data.requires_employee_signature) {
      if (!sig || !sig.startsWith('data:image/png;base64,')) {
        setSubmitError('서명을 입력해 주세요.');
        return;
      }
      setSubmitting(true);
      try {
        await postCertificateDeliverySign(token, sig);
        setDoneMessage('서명이 저장되었습니다. 창을 닫아도 됩니다.');
        await load();
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : '저장에 실패했습니다.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setSubmitting(true);
    try {
      await postCertificateDeliveryAcknowledge(token);
      setDoneMessage('내용을 확인하셨습니다. 창을 닫아도 됩니다.');
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 text-center text-gray-700">
        <p>{loadError}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-red-700 max-w-md">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!data || !bundle?.employee) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 text-gray-600">{t('common.loading')}</div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3 sm:px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-600 mt-1">
            링크 만료: {new Date(data.expires_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
          {doneMessage ? <p className="mt-3 text-sm text-emerald-700 font-medium">{doneMessage}</p> : null}
          {alreadyDone && !doneMessage ? (
            <p className="mt-3 text-sm text-gray-700">
              {data.requires_employee_signature ? '이미 서명이 완료된 문서입니다.' : '이미 확인이 완료된 문서입니다.'}
            </p>
          ) : null}
        </header>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4 overflow-x-auto">
          <HrCertificateDocument
            data={bundle}
            kind={viewKind}
            issueDate={issueDate}
            certificateNumber={typeof cert.documentNumber === 'string' ? cert.documentNumber : ''}
            submitTo={typeof cert.submitTo === 'string' ? cert.submitTo : ''}
            purpose={typeof cert.purpose === 'string' ? cert.purpose : ''}
            remarks={typeof cert.remarks === 'string' ? cert.remarks : ''}
            onSubmitToChange={() => {}}
            onPurposeChange={() => {}}
            onRemarksChange={() => {}}
            employmentPosition={typeof cert.employmentPosition === 'string' ? cert.employmentPosition : ''}
            employmentDuty={typeof cert.employmentDuty === 'string' ? cert.employmentDuty : ''}
            employmentSalary={typeof cert.employmentSalary === 'string' ? cert.employmentSalary : ''}
            employmentBenefits={typeof cert.employmentBenefits === 'string' ? cert.employmentBenefits : ''}
            onEmploymentPositionChange={() => {}}
            onEmploymentDutyChange={() => {}}
            onEmploymentSalaryChange={() => {}}
            onEmploymentBenefitsChange={() => {}}
            laborContractWitness1={typeof cert.laborContractWitness1 === 'string' ? cert.laborContractWitness1 : ''}
            laborContractWitness2={typeof cert.laborContractWitness2 === 'string' ? cert.laborContractWitness2 : ''}
            onLaborContractWitness1Change={() => {}}
            onLaborContractWitness2Change={() => {}}
            probationSignerName={typeof cert.probationSignerName === 'string' ? cert.probationSignerName : ''}
            onProbationSignerNameChange={() => {}}
            probationSignatureDataUrl={
              typeof cert.probationSignatureDataUrl === 'string' ? cert.probationSignatureDataUrl : null
            }
            onProbationSignatureChange={() => {}}
            probationSignatureReadOnly
            probationEvaluationData={probationEvaluationData}
            onProbationEvaluationDataChange={() => {}}
            lockDocumentFields
            employeePhotoSrcOverride={photoOverride}
            employeeSignatureDataUrl={sig}
            onEmployeeSignatureChange={setSig}
            employeeSignatureCaptureEnabled={canSign}
            t={t}
          />
        </div>

        {(canSign || canAck) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void onSubmit()}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {data.requires_employee_signature ? '서명 저장' : '내용을 확인했습니다'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CertificateDeliveryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-gray-600">로딩 중…</div>
      }
    >
      <CertificateDeliveryInner />
    </Suspense>
  );
}
