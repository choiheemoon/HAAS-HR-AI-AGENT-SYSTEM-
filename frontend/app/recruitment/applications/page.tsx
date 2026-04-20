'use client';

import { useState, useCallback, useEffect } from 'react';
import { UserPlus, FileText, Upload, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';

const FORM_TYPES: { value: number | ''; label: string }[] = [
  { value: '', label: '자동 분류 (파일별 감지)' },
  { value: 1, label: '양식1(Jobbkk)' },
  { value: 2, label: '양식2(JobThai)' },
  { value: 3, label: '양식3(LinkedIn)' },
  { value: 4, label: '양식4(Linked Simple)' },
  { value: 5, label: '양식5' },
];
const LANGUAGES = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: '영어' },
  { value: 'th', label: '태국어' },
];

export default function RecruitmentApplicationsPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [formType, setFormType] = useState<number | ''>('');
  const [documentLanguage, setDocumentLanguage] = useState<string>('');
  const [jobPostingId, setJobPostingId] = useState<number | ''>('');
  const [jobPostings, setJobPostings] = useState<{ id: number; title?: string; department?: string; position?: string }[]>([]);
  const [jobPostingsLoading, setJobPostingsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const load = async () => {
      setJobPostingsLoading(true);
      try {
        const res = await apiClient.getJobPostings('approved');
        setJobPostings(res.data || []);
      } catch {
        setJobPostings([]);
      } finally {
        setJobPostingsLoading(false);
      }
    };
    load();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const list = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (list.length === 0) {
      setMessage({ type: 'error', text: 'PDF 파일만 업로드 가능합니다.' });
      return;
    }
    setFiles((prev) => [...prev, ...list]);
    setMessage(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (list.length === 0 && (e.target.files?.length ?? 0) > 0) {
      setMessage({ type: 'error', text: 'PDF 파일만 업로드 가능합니다.' });
    } else if (list.length > 0) {
      setFiles((prev) => [...prev, ...list]);
      setMessage(null);
    }
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setMessage({ type: 'error', text: 'PDF 파일을 선택해 주세요.' });
      return;
    }
    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    setMessage(null);
    const failed: string[] = [];
    const failedReasons: { name: string; reason: string }[] = [];
    let lastErrorText = '업로드 및 파싱에 실패했습니다.';
    let done = 0;
    for (const f of files) {
      try {
        await apiClient.uploadParsedApplication(
          f,
          formType === '' ? undefined : formType,
          documentLanguage || undefined,
          jobPostingId === '' ? undefined : jobPostingId
        );
      } catch (err: any) {
        failed.push(f.name);
        const status = err.response?.status;
        const detail = err.response?.data?.detail;
        let reason = '';
        if (status === 404) reason = 'API를 찾을 수 없습니다.';
        else if (status === 500) reason = typeof detail === 'string' ? detail : (err.message || '서버 오류');
        else if (status === 422) reason = Array.isArray(detail) ? detail.map((d: { msg?: string }) => d?.msg).join(', ') : (typeof detail === 'string' ? detail : '요청 형식 오류');
        else reason = typeof detail === 'string' ? detail : err.message || '실패';
        lastErrorText = `${f.name}: ${reason}`;
        failedReasons.push({ name: f.name, reason });
        setMessage({ type: 'error', text: lastErrorText });
      }
      done += 1;
      setUploadProgress({ current: done, total: files.length });
    }
    setUploadProgress(null);
    if (failed.length === 0) {
      setMessage({
        type: 'success',
        text: files.length === 1
          ? '지원서가 업로드되어 파싱 후 저장되었습니다. 지원서 목록에서 확인하세요.'
          : `${files.length}건의 지원서가 업로드·파싱되어 저장되었습니다. 지원서 목록에서 확인하세요.`,
      });
      setFiles([]);
    } else if (failed.length < files.length) {
      const reasonLine = failedReasons.length > 0 ? `\n실패 사유(예): ${failedReasons[0].reason}` : '';
      setMessage({
        type: 'success',
        text: `${files.length - failed.length}건 성공, ${failed.length}건 실패: ${failed.join(', ')}. 실패한 파일은 목록에 남아 있으니 다시 시도할 수 있습니다.${reasonLine}`,
      });
      setFiles(files.filter((f) => failed.includes(f.name)));
    } else {
      const detailBlock = failedReasons.length > 0
        ? `\n\n[실패 사유]\n${failedReasons.map((r) => `${r.name}: ${r.reason}`).join('\n')}`
        : '';
      setMessage({
        type: 'error',
        text: (failed.length === 1 ? lastErrorText : `모두 실패 (${failed.length}건): ${failed.join(', ')}`) + detailBlock,
      });
    }
    setUploading(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">PDF 지원서 업로드</h2>
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${dragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300'}
              ${files.length > 0 ? 'bg-green-50 border-green-400' : ''}
            `}
          >
            <Upload className="mx-auto h-10 w-10 text-gray-400 mb-2" />
            {files.length > 0 ? (
              <div className="space-y-1">
                <p className="text-gray-700 font-medium">선택된 파일 {files.length}개</p>
                <ul className="text-sm text-gray-600 max-h-32 overflow-y-auto text-left list-disc list-inside">
                  {files.map((f) => (
                    <li key={f.name + f.size}>{f.name}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setFiles([])}
                  className="text-sm text-red-600 hover:underline"
                >
                  목록 비우기
                </button>
              </div>
            ) : (
              <p className="text-gray-600">PDF 파일을 드래그하거나 아래 버튼으로 선택하세요 (여러 개 선택 가능)</p>
            )}
            <label className="mt-2 inline-block">
              <span className="px-4 py-2 bg-primary-600 text-white rounded-lg cursor-pointer hover:bg-primary-700">
                파일 선택
              </span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                multiple
                onChange={handleFileChange}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">채용공고 정보</label>
              <select
                value={jobPostingId}
                onChange={(e) => setJobPostingId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                disabled={jobPostingsLoading}
              >
                <option value="">선택 안 함</option>
                {jobPostings.map((jp) => (
                  <option key={jp.id} value={jp.id}>
                    {jp.title || `공고 #${jp.id}`}{jp.department || jp.position ? ` · ${jp.department || jp.position}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-0.5">채용 공고 배포 및 모집에 있는 승인된 공고에서 선택</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">지원서 종류</label>
              <select
                value={formType === '' ? '' : formType}
                onChange={(e) => setFormType(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                {FORM_TYPES.map((opt) => (
                  <option key={opt.value === '' ? 'auto' : opt.value} value={opt.value === '' ? '' : opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-0.5">자동 분류 시 파일명·내용으로 Jobbkk/JobThai/LinkedIn 구분</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">작성 언어 (선택, 미선택 시 자동 감지)</label>
              <select
                value={documentLanguage}
                onChange={(e) => setDocumentLanguage(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="">자동 감지</option>
                {LANGUAGES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {message && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg ${
                message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
            >
              <AlertCircle className="flex-shrink-0 w-5 h-5 mt-0.5" />
              <span className="whitespace-pre-wrap break-words">{message.text}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading && uploadProgress
              ? `업로드 및 파싱 중 (${uploadProgress.current}/${uploadProgress.total})...`
              : files.length > 0
                ? `업로드 후 파싱하여 저장 (${files.length}개 파일)`
                : '업로드 후 파싱하여 저장'}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            실패 시: 메시지에 &quot;실패 사유&quot;가 표시됩니다. 흔한 원인 — PDF 손상·이미지 기반 PDF, 제어 문자(NUL) 포함, 인코딩 오류, DB 저장 오류. PDF를 다시 저장하거나 다른 파일로 시도해 보세요.
          </p>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          저장된 지원서는 <strong>지원서 목록</strong> 메뉴에서 조회할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
