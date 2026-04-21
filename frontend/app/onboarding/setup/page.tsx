'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, Settings, XCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';

type SetupForm = {
  major_minor_codes: boolean;
  hr_reference: boolean;
  attendance_reference: boolean;
  system_rbac: boolean;
};

function parseApiError(err: any): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  return '환경설정 일괄 생성에 실패했습니다.';
}

export default function OnboardingSetupPage() {
  const router = useRouter();
  const [form, setForm] = useState<SetupForm>({
    major_minor_codes: true,
    hr_reference: true,
    attendance_reference: true,
    system_rbac: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
    }
  }, [router]);

  const handleSetup = async () => {
    setError('');
    setLoading(true);
    setProgress(8);
    setProgressMessage('회사(HAAS) 기준정보 생성을 준비하고 있습니다...');
    const sequence: Array<{ at: number; message: string }> = [
      { at: 25, message: '회사(HAAS) 및 접근권한을 생성하고 있습니다...' },
      { at: 45, message: '코드(Major/Minor) 기준정보를 복제하고 있습니다...' },
      { at: 68, message: '인사기준정보를 복제하고 있습니다...' },
      { at: 82, message: '근태기준정보를 복제하고 있습니다...' },
      { at: 92, message: '권한그룹(ADMIN) 및 전체 메뉴권한을 생성하고 있습니다...' },
    ];
    let idx = 0;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + 3, 94);
        while (idx < sequence.length && next >= sequence[idx].at) {
          setProgressMessage(sequence[idx].message);
          idx += 1;
        }
        return next;
      });
    }, 400);

    try {
      await apiClient.runOnboardingSetup(form);
      window.clearInterval(timer);
      setProgress(100);
      setProgressMessage('환경설정이 완료되었습니다. 메인 화면으로 이동합니다...');
      router.push('/');
    } catch (err: any) {
      window.clearInterval(timer);
      setError(parseApiError(err));
      setProgress(0);
      setProgressMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 px-4 py-8">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary-600 mb-2">환경설정</h1>
          <p className="text-gray-600">
            체크된 항목을 기준으로 신규 회사(HAAS) 기준정보를 일괄 생성합니다.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-8">
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={form.major_minor_codes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, major_minor_codes: e.target.checked }))
              }
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-800">
              회사 기준 `Major/Minor` 코드 일괄 생성 (AAA 템플릿 복제)
            </span>
          </label>

          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={form.hr_reference}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, hr_reference: e.target.checked }))
              }
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-800">
              인사기준정보 관리 전체 일괄 생성 (AAA 템플릿 복제)
            </span>
          </label>

          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={form.attendance_reference}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, attendance_reference: e.target.checked }))
              }
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-800">
              근태기준정보 관리 전체 일괄 생성 (AAA 템플릿 복제)
            </span>
          </label>

          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={form.system_rbac}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, system_rbac: e.target.checked }))
              }
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-800">
              시스템 권한그룹(ADMIN) 및 권한그룹별 메뉴관리 전체 권한 생성
            </span>
          </label>
        </div>

        {loading && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
              <span>{progressMessage || '기준정보를 생성하고 있습니다...'}</span>
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

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSetup}
            disabled={loading}
            className="flex-1 bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>생성 중 ({progress}%)...</span>
              </>
            ) : (
              <>
                <Settings className="w-5 h-5" />
                <span>환경설정</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="px-5 py-3 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <XCircle className="w-5 h-5" />
            <span>취소</span>
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-500 flex items-center gap-2">
          <CheckSquare className="w-4 h-4" />
          <span>취소 시 자동 로그인 상태로 메인 화면으로 이동합니다.</span>
        </div>
      </div>
    </div>
  );
}
