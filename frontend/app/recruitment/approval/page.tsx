'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Eye, Search, Filter, X } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function RecruitmentApprovalPage() {
  const [jobPostings, setJobPostings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadJobPostings();
  }, []);

  const loadJobPostings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getJobPostings('pending_approval');
      setJobPostings(response.data || []);
    } catch (error) {
      console.error('채용 공고 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    if (!confirm('이 채용 공고를 승인하시겠습니까?')) return;
    
    try {
      await apiClient.approveJobPosting(id);
      alert('승인되었습니다.');
      loadJobPostings();
    } catch (error: any) {
      alert(error.response?.data?.detail || '승인 중 오류가 발생했습니다.');
    }
  };

  const handleReject = async (id: number) => {
    if (!confirm('이 채용 공고를 반려하시겠습니까?')) return;
    
    try {
      // 반려 기능은 향후 구현
      alert('반려 기능은 향후 구현 예정입니다.');
    } catch (error: any) {
      alert('반려 중 오류가 발생했습니다.');
    }
  };

  const handleShowDetail = async (job: any) => {
    try {
      // 상세 정보 가져오기
      const response = await apiClient.getJobPosting(job.id);
      setSelectedJob(response.data);
      setShowDetailModal(true);
    } catch (error: any) {
      console.error('채용 공고 상세 조회 오류:', error);
      // API 호출 실패 시 기존 데이터로 표시
      setSelectedJob(job);
      setShowDetailModal(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">승인 대기 목록</h2>

        {loading ? (
          <div className="text-center py-12">로딩 중...</div>
        ) : jobPostings.length === 0 ? (
          <div className="text-center py-12 text-gray-500">승인 대기 중인 채용 공고가 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {jobPostings.map((job) => (
              <div key={job.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{job.title}</h3>
                    <p className="text-sm text-gray-600">{job.department} · {job.position}</p>
                    <p className="text-sm text-gray-500 mt-2">{job.description?.substring(0, 100)}...</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleShowDetail(job)}
                      className="px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm flex items-center space-x-1"
                    >
                      <Eye className="w-4 h-4" />
                      <span>상세</span>
                    </button>
                    <button
                      onClick={() => handleApprove(job.id)}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center space-x-1"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>승인</span>
                    </button>
                    <button
                      onClick={() => handleReject(job.id)}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex items-center space-x-1"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>반려</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 상세 보기 모달 */}
      {showDetailModal && selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">채용 공고 상세</h2>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedJob(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                    <p className="text-base text-gray-900">{selectedJob.title}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
                    <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">
                      {selectedJob.status === 'pending_approval' ? '승인 대기' : selectedJob.status}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">부서</label>
                    <p className="text-base text-gray-900">{selectedJob.department || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">직책</label>
                    <p className="text-base text-gray-900">{selectedJob.position || '-'}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">근무지</label>
                    <p className="text-base text-gray-900">{selectedJob.location || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">고용 형태</label>
                    <p className="text-base text-gray-900">{selectedJob.employment_type || '-'}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">급여 범위</label>
                    <p className="text-base text-gray-900">
                      {selectedJob.salary_min && selectedJob.salary_max
                        ? `${selectedJob.salary_min.toLocaleString()}원 ~ ${selectedJob.salary_max.toLocaleString()}원`
                        : selectedJob.salary_min
                        ? `${selectedJob.salary_min.toLocaleString()}원 이상`
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">마감일</label>
                    <p className="text-base text-gray-900">
                      {selectedJob.closing_date ? new Date(selectedJob.closing_date).toLocaleDateString('ko-KR') : '-'}
                    </p>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">직무 설명</label>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-base text-gray-900 whitespace-pre-wrap">
                      {selectedJob.description || '-'}
                    </p>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">자격 요건</label>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-base text-gray-900 whitespace-pre-wrap">
                      {selectedJob.requirements || '-'}
                    </p>
                  </div>
                </div>
                
                {selectedJob.responsibilities && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">주요 업무</label>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-base text-gray-900 whitespace-pre-wrap">
                        {selectedJob.responsibilities}
                      </p>
                    </div>
                  </div>
                )}
                
                {selectedJob.benefits && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">혜택</label>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-base text-gray-900 whitespace-pre-wrap">
                        {selectedJob.benefits}
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">작성일</label>
                    <p className="text-base text-gray-900">
                      {selectedJob.created_at ? new Date(selectedJob.created_at).toLocaleString('ko-KR') : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">수정일</label>
                    <p className="text-base text-gray-900">
                      {selectedJob.updated_at ? new Date(selectedJob.updated_at).toLocaleString('ko-KR') : '-'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedJob(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  닫기
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    handleApprove(selectedJob.id);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  승인하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
