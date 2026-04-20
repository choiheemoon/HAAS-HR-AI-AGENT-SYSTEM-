'use client';

import { useState, useEffect } from 'react';
import { User, Mail, UserCircle, Save, Lock, Edit2, X } from 'lucide-react';
import api from '@/lib/api';
import { getUser, setUser } from '@/lib/auth';

export default function ProfilePage() {
  const [user, setUserState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    username: '',
  });

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        throw new Error('로그인 토큰이 없습니다.');
      }

      const response = await api.get('/api/v1/auth/me');
      const userData = response.data;
      
      if (!userData || !userData.id) {
        throw new Error('사용자 데이터가 올바르지 않습니다.');
      }

      setUserState(userData);
      setFormData({
        full_name: userData.full_name || '',
        email: userData.email || '',
        username: userData.username || '',
      });
      // 로컬 스토리지도 업데이트
      setUser(userData);
      setError('');
    } catch (err: any) {
      console.error('사용자 정보 로드 오류:', err);
      console.error('오류 상세:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
      });
      
      // 로컬 스토리지에서 사용자 정보 가져오기
      const localUser = getUser();
      if (localUser) {
        setUserState(localUser);
        setFormData({
          full_name: localUser.full_name || '',
          email: localUser.email || '',
          username: localUser.username || '',
        });
        
        // 401 오류인 경우 (인증 실패)
        if (err.response?.status === 401) {
          setError('인증이 만료되었습니다. 다시 로그인해주세요.');
        } else {
          setError('서버에서 사용자 정보를 불러올 수 없어 로컬 정보를 표시합니다.');
        }
      } else {
        if (err.response?.status === 401) {
          setError('인증이 만료되었습니다. 다시 로그인해주세요.');
        } else {
          setError('사용자 정보를 불러오는데 실패했습니다. 로그인을 다시 시도해주세요.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      // 백엔드 API 호출하여 사용자 정보 업데이트
      const response = await api.put('/api/v1/auth/me', {
        full_name: formData.full_name,
      });
      
      const updatedUserData = response.data;
      setSuccess('사용자 정보가 저장되었습니다.');
      setIsEditing(false);
      
      // 로컬 스토리지 업데이트
      setUser(updatedUserData);
      setUserState(updatedUserData);
      
      // 폼 데이터도 업데이트
      setFormData({
        full_name: updatedUserData.full_name || '',
        email: updatedUserData.email || '',
        username: updatedUserData.username || '',
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      full_name: user?.full_name || '',
      email: user?.email || '',
      username: user?.username || '',
    });
    setIsEditing(false);
    setError('');
    setSuccess('');
  };

  const handlePasswordChange = async () => {
    setError('');
    setSuccess('');
    
    // 유효성 검사
    if (!passwordData.current_password || !passwordData.new_password || !passwordData.confirm_password) {
      setError('모든 필드를 입력해주세요.');
      return;
    }
    
    if (passwordData.new_password.length < 6) {
      setError('새 비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    
    if (passwordData.new_password !== passwordData.confirm_password) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    
    if (passwordData.current_password === passwordData.new_password) {
      setError('새 비밀번호는 현재 비밀번호와 달라야 합니다.');
      return;
    }
    
    setChangingPassword(true);
    
    try {
      await api.put('/api/v1/auth/me/password', {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
      });
      
      setSuccess('비밀번호가 성공적으로 변경되었습니다.');
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      setTimeout(() => {
        setShowPasswordModal(false);
        setSuccess('');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || '비밀번호 변경에 실패했습니다.');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-end mb-6">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              <span>수정</span>
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
          </div>
        )}

        <div className="space-y-6">
          {/* 프로필 사진 영역 */}
          <div className="flex items-center space-x-6 pb-6 border-b border-gray-200">
            <div className="w-24 h-24 bg-primary-100 rounded-full flex items-center justify-center">
              <UserCircle className="w-12 h-12 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {user?.full_name || user?.username || '사용자'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{user?.email}</p>
              <p className="text-xs text-gray-400 mt-1">역할: {user?.role || 'user'}</p>
            </div>
          </div>

          {/* 사용자 정보 폼 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <UserCircle className="inline w-4 h-4 mr-1" />
                이름
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="이름을 입력하세요"
                />
              ) : (
                <div className="px-4 py-2 bg-gray-50 rounded-lg text-gray-900">
                  {formData.full_name || '-'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="inline w-4 h-4 mr-1" />
                이메일
              </label>
              <div className="px-4 py-2 bg-gray-50 rounded-lg text-gray-600">
                {formData.email}
              </div>
              <p className="text-xs text-gray-400 mt-1">이메일은 변경할 수 없습니다.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="inline w-4 h-4 mr-1" />
                사용자명
              </label>
              <div className="px-4 py-2 bg-gray-50 rounded-lg text-gray-600">
                {formData.username}
              </div>
              <p className="text-xs text-gray-400 mt-1">사용자명은 변경할 수 없습니다.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="inline w-4 h-4 mr-1" />
                비밀번호
              </label>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
              >
                비밀번호 변경
              </button>
            </div>
          </div>

          {/* 저장/취소 버튼 */}
          {isEditing && (
            <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                onClick={handleCancel}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center space-x-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? '저장 중...' : '저장'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 비밀번호 변경 모달 */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">비밀번호 변경</h2>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
                  setError('');
                  setSuccess('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {success}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  현재 비밀번호
                </label>
                <input
                  type="password"
                  value={passwordData.current_password}
                  onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="현재 비밀번호를 입력하세요"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  새 비밀번호
                </label>
                <input
                  type="password"
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="새 비밀번호를 입력하세요 (최소 6자)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  새 비밀번호 확인
                </label>
                <input
                  type="password"
                  value={passwordData.confirm_password}
                  onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="새 비밀번호를 다시 입력하세요"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
                  setError('');
                  setSuccess('');
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handlePasswordChange}
                disabled={changingPassword}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {changingPassword ? '변경 중...' : '변경'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
