'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database, Settings } from 'lucide-react';
import { apiClient } from '@/lib/api';

type Company = { id: number; company_code: string; name_kor?: string | null };

type SetupForm = {
  source_company_id: number;
  create_new_company: boolean;
  target_company_id?: number;
  major_minor_codes: boolean;
  hr_reference: boolean;
  attendance_reference: boolean;
  system_rbac: boolean;
};

function parseApiError(err: any): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  return '템플릿 생성(기준정보)에 실패했습니다.';
}

export default function SystemTemplateGenerationPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState<SetupForm>({
    source_company_id: 0,
    create_new_company: true,
    target_company_id: undefined,
    major_minor_codes: true,
    hr_reference: true,
    attendance_reference: true,
    system_rbac: true,
  });
  const [loading, setLoading] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoadingCompanies(true);
      try {
        const res = await apiClient.getCompanies();
        const rows = (res.data as Company[]) || [];
        setCompanies(rows);
        if (rows.length > 0) {
          setForm((prev) => ({
            ...prev,
            source_company_id: rows[0].id,
            target_company_id: rows[0].id,
          }));
        }
      } catch (e: any) {
        setError(parseApiError(e));
      } finally {
        setLoadingCompanies(false);
      }
    };
    void load();
  }, []);

  const selectableTargetCompanies = useMemo(
    () => companies.filter((c) => c.id !== form.source_company_id),
    [companies, form.source_company_id]
  );

  const handleRun = async () => {
    if (!form.source_company_id) {
      setError('복제 대상 회사를 선택해주세요.');
      return;
    }
    if (!form.create_new_company && !form.target_company_id) {
      setError('기준정보를 생성할 대상 회사를 선택해주세요.');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);
    setProgress(8);
    setProgressMessage('생성 작업을 준비하고 있습니다...');
    const sequence: Array<{ at: number; message: string }> = [
      { at: 20, message: '대상 회사 및 접근권한을 확인하고 있습니다...' },
      { at: 42, message: '회사 기준 Major/Minor 코드를 생성하고 있습니다...' },
      { at: 62, message: '인사기준정보를 생성하고 있습니다...' },
      { at: 80, message: '근태기준정보/근무달력을 생성하고 있습니다...' },
      { at: 92, message: '시스템 권한그룹/메뉴권한을 생성하고 있습니다...' },
    ];
    let idx = 0;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + 3, 95);
        while (idx < sequence.length && next >= sequence[idx].at) {
          setProgressMessage(sequence[idx].message);
          idx += 1;
        }
        return next;
      });
    }, 400);
    try {
      const payload = {
        source_company_id: form.source_company_id,
        create_new_company: form.create_new_company,
        target_company_id: form.create_new_company ? undefined : form.target_company_id,
        major_minor_codes: form.major_minor_codes,
        hr_reference: form.hr_reference,
        attendance_reference: form.attendance_reference,
        system_rbac: form.system_rbac,
      };
      const res = await apiClient.runSystemTemplateGeneration(payload);
      window.clearInterval(timer);
      setProgress(100);
      setProgressMessage('기준정보 템플릿 생성이 완료되었습니다.');
      const code = res?.data?.company_code ? ` (${res.data.company_code})` : '';
      setMessage(`템플릿 생성이 완료되었습니다${code}.`);
    } catch (e: any) {
      window.clearInterval(timer);
      setError(parseApiError(e));
      setProgress(0);
      setProgressMessage('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">템플릿생성 (기준정보)</h1>
          <p className="text-sm text-gray-600 mt-1">
            회원가입 온보딩과 동일한 기준정보 생성 템플릿을 시스템 메뉴에서 수동 실행합니다.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">복제 대상 회사</span>
            <select
              disabled={loading || loadingCompanies}
              className="w-full border rounded px-3 py-2"
              value={form.source_company_id || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, source_company_id: Number(e.target.value) }))
              }
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_code} {c.name_kor ? `- ${c.name_kor}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-gray-700 mb-1">생성 방식</span>
            <select
              disabled={loading}
              className="w-full border rounded px-3 py-2"
              value={form.create_new_company ? 'new' : 'existing'}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, create_new_company: e.target.value === 'new' }))
              }
            >
              <option value="new">신규 회사 생성 후 기준정보 생성</option>
              <option value="existing">기존 회사에 기준정보 생성</option>
            </select>
          </label>
        </div>

        {!form.create_new_company && (
          <label className="text-sm block">
            <span className="block text-gray-700 mb-1">기준정보를 생성할 대상 회사</span>
            <select
              disabled={loading}
              className="w-full border rounded px-3 py-2"
              value={form.target_company_id || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, target_company_id: Number(e.target.value) }))
              }
            >
              {selectableTargetCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_code} {c.name_kor ? `- ${c.name_kor}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="space-y-2">
          {[
            ['major_minor_codes', '회사 기준 Major/Minor 코드 생성'],
            ['hr_reference', '인사기준정보 관리 전체 생성'],
            ['attendance_reference', '근태기준정보 관리 전체 생성'],
            ['system_rbac', '시스템 권한그룹/권한그룹별 메뉴관리 생성'],
          ].map(([k, label]) => (
            <label
              key={k}
              className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={(form as any)[k]}
                onChange={(e) => setForm((prev) => ({ ...prev, [k]: e.target.checked } as SetupForm))}
                className="w-4 h-4"
                disabled={loading}
              />
              <span className="text-sm text-gray-800">{label}</span>
            </label>
          ))}
        </div>

        {loading && (
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
              <span>{progressMessage || '기준정보 템플릿을 생성하고 있습니다...'}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleRun}
          disabled={loading || loadingCompanies}
          className="w-full bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>생성 중 ({progress}%)...</span>
            </>
          ) : (
            <>
              <Settings className="w-5 h-5" />
              <span>템플릿 생성 실행</span>
            </>
          )}
        </button>
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <Database className="w-4 h-4" />
          <span>회사 등록 후 신규 회사 기준정보 템플릿 생성에 사용할 수 있습니다.</span>
        </div>
      </div>
    </div>
  );
}
