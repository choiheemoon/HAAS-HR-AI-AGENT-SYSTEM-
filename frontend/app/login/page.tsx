'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogIn, Lock, User, CheckCircle } from 'lucide-react';
import api from '@/lib/api';
import { setToken, setUser, isAuthenticated } from '@/lib/auth';

/** FastAPI/Starlette: detail may be string | { msg, loc, ... }[] */
function formatApiErrorDetail(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const parts = detail.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'msg' in item) {
        const o = item as { msg?: unknown; loc?: unknown };
        const path = Array.isArray(o.loc) ? ` (${o.loc.join('.')})` : '';
        return `${String(o.msg ?? '')}${path}`.trim();
      }
      return '';
    }).filter(Boolean);
    if (parts.length) return parts.join('. ');
  }
  if (detail && typeof detail === 'object' && 'msg' in (detail as object)) {
    return String((detail as { msg: unknown }).msg ?? fallback);
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    // 이미 로그인된 경우 대시보드로 이동
    if (isAuthenticated()) {
      router.push('/');
    }
    
    // 회원가입 성공 메시지
    if (searchParams?.get('registered') === 'true') {
      setRegistered(true);
      setTimeout(() => setRegistered(false), 5000);
    }
  }, [router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // OAuth2PasswordRequestForm 형식으로 전송
      const params = new URLSearchParams();
      params.append('username', formData.username);
      params.append('password', formData.password);

      const response = await api.post('/api/v1/auth/login', params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      // 응답 데이터 검증
      if (!response.data || !response.data.access_token) {
        throw new Error('로그인 응답이 올바르지 않습니다.');
      }

      // 토큰 저장 (이후 api 인터셉터가 /me 호출에 사용됨)
      setToken(response.data.access_token);

      try {
        const me = await apiClient.getAuthMe();
        setUser(me.data);
      } catch {
        if (response.data.user) {
          setUser(response.data.user);
        } else {
          console.warn('로그인 응답에 사용자 정보가 없고 /me 조회도 실패했습니다.');
        }
      }

      // 대시보드로 이동
      router.push('/');
    } catch (err: any) {
      console.error('로그인 오류:', err);
      console.error('오류 상세:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
      });
      
      setError(formatApiErrorDetail(err, '로그인에 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-600 mb-2">HR AI Agent</h1>
          <p className="text-gray-600">로그인하여 시작하세요</p>
        </div>

        {registered && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center space-x-2">
            <CheckCircle className="w-5 h-5" />
            <span>회원가입이 완료되었습니다. 로그인해주세요.</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              사용자명 또는 이메일
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="사용자명 또는 이메일"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              비밀번호
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="비밀번호"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>로그인 중...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>로그인</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            계정이 없으신가요?{' '}
            <Link href="/register" className="text-primary-600 hover:text-primary-700 font-medium">
              회원가입
            </Link>
          </p>
        </div>

        <div className="mt-6 border-t pt-5 text-center">
          <p className="text-sm text-gray-600">
            비밀번호를 잊으셨나요?{' '}
            <Link href="/forgot-password" className="text-primary-600 hover:text-primary-700 font-medium">
              임시비밀번호 발급
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
