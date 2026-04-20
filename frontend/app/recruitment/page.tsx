'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Briefcase, Users, Search, Filter, CheckCircle, XCircle,
  Clock, Mail, FileText, Star, Eye, Edit, Trash2, Send, Download,
  CheckSquare, AlertCircle, Calendar, DollarSign, MapPin, Building
} from 'lucide-react';
import { useTabData } from '@/contexts/TabDataContext';
import { apiClient } from '@/lib/api';

interface JobPosting {
  id: number;
  title: string;
  department: string;
  position: string;
  status: string;
  application_count: number;
  created_at: string;
  posted_date?: string;
  closing_date?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
}

interface Application {
  id: number;
  job_posting_id: number;
  applicant_id: number;
  status: string;
  applied_date: string;
  screening_score?: number;
  applicant?: {
    id: number;
    name: string;
    email: string;
    phone?: string;
    ai_match_score?: number;
    experience_years?: number;
    skills?: string[];
  };
}

export default function RecruitmentPage() {
  const [activeTab, setActiveTab] = useState<'postings' | 'applications'>('postings');
  const [selectedJobPosting, setSelectedJobPosting] = useState<number | null>(null);
  const { getCache, setCache } = useTabData();
  
  const cachedData = getCache('recruitment');
  
  const [jobPostings, setJobPostings] = useState<JobPosting[]>(cachedData?.jobPostings || []);
  const [applications, setApplications] = useState<Application[]>(cachedData?.applications || []);
  const [loading, setLoading] = useState(false);
  const [creatingJobPosting, setCreatingJobPosting] = useState(false);
  const [showJobPostingModal, setShowJobPostingModal] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!cachedData) {
      loadJobPostings();
    }
  }, []);

  useEffect(() => {
    if (selectedJobPosting) {
      loadApplications(selectedJobPosting);
    }
  }, [selectedJobPosting]);

  useEffect(() => {
    const currentData = { jobPostings, applications };
    const cachedDataStr = JSON.stringify(cachedData);
    const currentDataStr = JSON.stringify(currentData);
    
    if (cachedDataStr !== currentDataStr) {
      setCache('recruitment', currentData);
    }
  }, [jobPostings, applications]);

  const loadJobPostings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getJobPostings(statusFilter === 'all' ? undefined : statusFilter);
      setJobPostings(response.data || []);
    } catch (error) {
      console.error('채용 공고 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async (jobPostingId: number) => {
    setLoading(true);
    try {
      const response = await apiClient.getApplications(jobPostingId);
      setApplications(response.data || []);
    } catch (error) {
      console.error('지원서 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestApproval = async (id: number) => {
    try {
      await apiClient.requestApproval(id);
      alert('승인 요청이 완료되었습니다.');
      loadJobPostings();
    } catch (error: any) {
      console.error('승인 요청 오류:', error);
      const errorMessage = error.response?.data?.detail || '승인 요청 중 오류가 발생했습니다.';
      alert(errorMessage);
    }
  };

  const handleApproveJobPosting = async (id: number) => {
    try {
      await apiClient.approveJobPosting(id);
      alert('승인되었습니다.');
      loadJobPostings();
    } catch (error: any) {
      console.error('승인 오류:', error);
      const errorMessage = error.response?.data?.detail || '승인 중 오류가 발생했습니다.';
      alert(errorMessage);
    }
  };

  const handlePublishJobPosting = async (id: number) => {
    try {
      await apiClient.publishJobPosting(id, ['사람인', '잡코리아', '인크루트']);
      loadJobPostings();
    } catch (error) {
      console.error('배포 오류:', error);
      alert('배포 중 오류가 발생했습니다.');
    }
  };

  const handleEvaluateApplication = async (applicationId: number, score: number, notes: string) => {
    try {
      await apiClient.evaluateApplication(applicationId, {
        score,
        notes,
        status: score >= 70 ? 'interview_scheduled' : 'rejected'
      });
      if (selectedJobPosting) {
        loadApplications(selectedJobPosting);
      }
    } catch (error) {
      console.error('평가 오류:', error);
      alert('평가 중 오류가 발생했습니다.');
    }
  };

  const handleSendCommunication = async (applicationId: number, message: string) => {
    try {
      await apiClient.sendCommunication(applicationId, {
        message_type: 'email',
        message,
        subject: '채용 프로세스 안내'
      });
      alert('메시지가 전송되었습니다.');
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      alert('메시지 전송 중 오류가 발생했습니다.');
    }
  };

  const handleCreateOfferLetter = async (applicationId: number) => {
    try {
      const response = await apiClient.createOfferLetter(applicationId, {
        position: '신입 개발자',
        salary: 35000000,
        start_date: new Date().toISOString().split('T')[0],
        benefits: {
          '4대보험': '가입',
          '휴가': '15일',
          '식대': '월 20만원'
        }
      });
      alert('제안서가 발행되었습니다.');
    } catch (error) {
      console.error('제안서 생성 오류:', error);
      alert('제안서 생성 중 오류가 발생했습니다.');
    }
  };

  const filteredJobPostings = useMemo(() => {
    return jobPostings.filter(jp => {
      const matchesSearch = !searchQuery || 
        jp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        jp.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        jp.position?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [jobPostings, searchQuery]);

  const getStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { label: string; color: string } } = {
      draft: { label: '초안', color: 'bg-gray-100 text-gray-800' },
      pending_approval: { label: '승인 대기', color: 'bg-yellow-100 text-yellow-800' },
      approved: { label: '승인됨', color: 'bg-blue-100 text-blue-800' },
      published: { label: '공개', color: 'bg-green-100 text-green-800' },
      closed: { label: '마감', color: 'bg-red-100 text-red-800' },
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getApplicationStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { label: string; color: string } } = {
      applied: { label: '지원', color: 'bg-blue-100 text-blue-800' },
      screening: { label: '서류심사', color: 'bg-yellow-100 text-yellow-800' },
      interview_scheduled: { label: '면접 예정', color: 'bg-purple-100 text-purple-800' },
      interview_completed: { label: '면접 완료', color: 'bg-indigo-100 text-indigo-800' },
      offered: { label: '제안', color: 'bg-green-100 text-green-800' },
      accepted: { label: '수락', color: 'bg-emerald-100 text-emerald-800' },
      rejected: { label: '불합격', color: 'bg-red-100 text-red-800' },
      withdrawn: { label: '지원 취소', color: 'bg-gray-100 text-gray-800' },
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const [jobPostingForm, setJobPostingForm] = useState({
    title: '',
    department: '',
    position: '',
    location: '',
    employment_type: '',
    description: '',
    requirements: '',
    salary_min: '',
    salary_max: '',
    closing_date: '',
  });

  const handleCreateJobPosting = async () => {
    // 이미 생성 중이면 중복 요청 방지
    if (creatingJobPosting) {
      return;
    }

    setCreatingJobPosting(true);
    
    try {
      // 빈 문자열을 undefined로 변환하여 백엔드 스키마와 일치시킴
      const payload: any = {
        title: jobPostingForm.title,
      };

      // Optional 필드들은 빈 문자열이 아닐 때만 추가
      if (jobPostingForm.department) payload.department = jobPostingForm.department;
      if (jobPostingForm.position) payload.position = jobPostingForm.position;
      if (jobPostingForm.location) payload.location = jobPostingForm.location;
      if (jobPostingForm.employment_type) payload.employment_type = jobPostingForm.employment_type;
      if (jobPostingForm.description) payload.description = jobPostingForm.description;
      if (jobPostingForm.requirements) payload.requirements = jobPostingForm.requirements;
      if (jobPostingForm.salary_min) payload.salary_min = parseFloat(jobPostingForm.salary_min);
      if (jobPostingForm.salary_max) payload.salary_max = parseFloat(jobPostingForm.salary_max);
      if (jobPostingForm.closing_date) payload.closing_date = jobPostingForm.closing_date;

      await apiClient.createJobPosting(payload);
      
      // 성공 메시지 표시
      alert('작성되었습니다.');
      
      setShowJobPostingModal(false);
      setJobPostingForm({
        title: '',
        department: '',
        position: '',
        location: '',
        employment_type: '',
        description: '',
        requirements: '',
        salary_min: '',
        salary_max: '',
        closing_date: '',
      });
      
      // 채용 공고 목록 새로고침
      await loadJobPostings();
    } catch (error: any) {
      console.error('채용 공고 생성 오류:', error);
      
      // 401 오류인 경우 (인증 실패) - API 인터셉터가 자동으로 로그인 페이지로 리다이렉트
      if (error.response?.status === 401) {
        // API 인터셉터가 처리하므로 여기서는 추가 처리 불필요
        return;
      }
      
      const errorMessage = error.response?.data?.detail || '채용 공고 생성 중 오류가 발생했습니다.';
      if (Array.isArray(errorMessage)) {
        // Pydantic validation errors
        const messages = errorMessage.map((err: any) => `${err.loc.join('.')}: ${err.msg}`).join('\n');
        alert(`입력 데이터 오류:\n${messages}`);
      } else {
        alert(errorMessage);
      }
    } finally {
      setCreatingJobPosting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowJobPostingModal(true)}
          className="flex items-center space-x-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>채용 공고 작성</span>
        </button>
      </div>

      {/* 채용 공고 작성 모달 */}
      {showJobPostingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">채용 공고 작성</h2>
                <button
                  onClick={() => setShowJobPostingModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    제목 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={jobPostingForm.title}
                    onChange={(e) => setJobPostingForm({ ...jobPostingForm, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="예: 백엔드 개발자"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">부서</label>
                    <input
                      type="text"
                      value={jobPostingForm.department}
                      onChange={(e) => setJobPostingForm({ ...jobPostingForm, department: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="예: 개발팀"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">직책</label>
                    <input
                      type="text"
                      value={jobPostingForm.position}
                      onChange={(e) => setJobPostingForm({ ...jobPostingForm, position: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="예: 시니어 개발자"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">근무지</label>
                    <input
                      type="text"
                      value={jobPostingForm.location}
                      onChange={(e) => setJobPostingForm({ ...jobPostingForm, location: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="예: 서울시 강남구"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">고용 형태</label>
                    <select
                      value={jobPostingForm.employment_type}
                      onChange={(e) => setJobPostingForm({ ...jobPostingForm, employment_type: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">선택하세요</option>
                      <option value="정규직">정규직</option>
                      <option value="계약직">계약직</option>
                      <option value="인턴">인턴</option>
                      <option value="파트타임">파트타임</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">최소 급여 (원)</label>
                    <input
                      type="number"
                      value={jobPostingForm.salary_min}
                      onChange={(e) => setJobPostingForm({ ...jobPostingForm, salary_min: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="예: 30000000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">최대 급여 (원)</label>
                    <input
                      type="number"
                      value={jobPostingForm.salary_max}
                      onChange={(e) => setJobPostingForm({ ...jobPostingForm, salary_max: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="예: 50000000"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">마감일</label>
                  <input
                    type="date"
                    value={jobPostingForm.closing_date}
                    onChange={(e) => setJobPostingForm({ ...jobPostingForm, closing_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">직무 설명</label>
                  <textarea
                    value={jobPostingForm.description}
                    onChange={(e) => setJobPostingForm({ ...jobPostingForm, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="직무에 대한 상세 설명을 입력하세요"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">자격 요건</label>
                  <textarea
                    value={jobPostingForm.requirements}
                    onChange={(e) => setJobPostingForm({ ...jobPostingForm, requirements: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="필요한 자격 요건을 입력하세요"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => setShowJobPostingModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleCreateJobPosting}
                    disabled={!jobPostingForm.title}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    작성
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto">
            <button
              onClick={() => {
                setActiveTab('postings');
                setSelectedJobPosting(null);
              }}
              className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                activeTab === 'postings'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Briefcase className="w-5 h-5 inline mr-2" />
              채용 공고
            </button>
            <button
              onClick={() => setActiveTab('applications')}
              className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                activeTab === 'applications'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="w-5 h-5 inline mr-2" />
              지원자 관리
            </button>
          </nav>
        </div>

        <div className="p-4 md:p-6">
          {activeTab === 'postings' ? (
            <div className="space-y-4">
              {/* 검색 및 필터 */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="채용 공고 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Filter className="w-5 h-5 text-gray-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      loadJobPostings();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="all">전체</option>
                    <option value="draft">초안</option>
                    <option value="pending_approval">승인 대기</option>
                    <option value="approved">승인됨</option>
                    <option value="published">공개</option>
                    <option value="closed">마감</option>
                  </select>
                </div>
              </div>

              {/* 채용 공고 목록 */}
              {loading ? (
                <div className="text-center py-12 text-gray-500">로딩 중...</div>
              ) : filteredJobPostings.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  채용 공고가 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredJobPostings.map((job) => (
                    <div
                      key={job.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => {
                        setSelectedJobPosting(job.id);
                        setActiveTab('applications');
                      }}
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                            {getStatusBadge(job.status)}
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                            {job.department && (
                              <span className="flex items-center">
                                <Building className="w-4 h-4 mr-1" />
                                {job.department}
                              </span>
                            )}
                            {job.position && (
                              <span className="flex items-center">
                                <Briefcase className="w-4 h-4 mr-1" />
                                {job.position}
                              </span>
                            )}
                            {job.location && (
                              <span className="flex items-center">
                                <MapPin className="w-4 h-4 mr-1" />
                                {job.location}
                              </span>
                            )}
                            {(job.salary_min || job.salary_max) && (
                              <span className="flex items-center">
                                <DollarSign className="w-4 h-4 mr-1" />
                                {job.salary_min != null && job.salary_max != null
                                  ? `${(job.salary_min / 10000).toFixed(0)}만원 ~ ${(job.salary_max / 10000).toFixed(0)}만원`
                                  : job.salary_min != null
                                  ? `${(job.salary_min / 10000).toFixed(0)}만원 이상`
                                  : job.salary_max != null
                                  ? `${(job.salary_max / 10000).toFixed(0)}만원 이하`
                                  : ''}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>지원자: {job.application_count}명</span>
                            {job.posted_date && (
                              <span>공개일: {new Date(job.posted_date).toLocaleDateString('ko-KR')}</span>
                            )}
                            {job.closing_date && (
                              <span>마감일: {new Date(job.closing_date).toLocaleDateString('ko-KR')}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {job.status === 'draft' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRequestApproval(job.id);
                              }}
                              className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm flex items-center space-x-1"
                              title="승인 요청"
                            >
                              <AlertCircle className="w-4 h-4" />
                              <span>승인 요청</span>
                            </button>
                          )}
                          {job.status === 'pending_approval' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApproveJobPosting(job.id);
                              }}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center space-x-1"
                              title="승인"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>승인</span>
                            </button>
                          )}
                          {job.status === 'approved' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePublishJobPosting(job.id);
                              }}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center space-x-1"
                              title="배포"
                            >
                              <Send className="w-4 h-4" />
                              <span>배포</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedJobPosting(job.id);
                              setActiveTab('applications');
                            }}
                            className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm flex items-center space-x-1"
                            title="상세 보기"
                          >
                            <Eye className="w-4 h-4" />
                            <span>상세</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {selectedJobPosting ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">지원자 목록</h2>
                    <button
                      onClick={() => setSelectedJobPosting(null)}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      ← 목록으로
                    </button>
                  </div>
                  {loading ? (
                    <div className="text-center py-12 text-gray-500">로딩 중...</div>
                  ) : applications.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      지원자가 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {applications.map((app) => (
                        <div
                          key={app.id}
                          className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h3 className="text-lg font-semibold text-gray-900">
                                    {app.applicant?.name || '이름 없음'}
                                  </h3>
                                  <p className="text-sm text-gray-600">{app.applicant?.email}</p>
                                </div>
                                {getApplicationStatusBadge(app.status)}
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                                {app.applicant?.phone && (
                                  <span>연락처: {app.applicant.phone}</span>
                                )}
                                {app.applicant?.experience_years !== undefined && (
                                  <span>경력: {app.applicant.experience_years}년</span>
                                )}
                                {app.applicant?.ai_match_score !== undefined && (
                                  <span className="flex items-center">
                                    <Star className="w-4 h-4 mr-1 text-yellow-500 fill-yellow-500" />
                                    AI 매칭: {app.applicant.ai_match_score.toFixed(1)}점
                                  </span>
                                )}
                                {app.screening_score !== undefined && (
                                  <span>평가 점수: {app.screening_score}점</span>
                                )}
                              </div>
                              {app.applicant?.skills && app.applicant.skills.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {app.applicant.skills.map((skill, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                                    >
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="text-xs text-gray-500">
                                지원일: {new Date(app.applied_date).toLocaleDateString('ko-KR')}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleEvaluateApplication(app.id, 85, '우수한 지원자입니다.')}
                                className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center justify-center space-x-1"
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span>합격</span>
                              </button>
                              <button
                                onClick={() => handleSendCommunication(app.id, '면접 일정을 안내드립니다.')}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center justify-center space-x-1"
                              >
                                <Mail className="w-4 h-4" />
                                <span>연락</span>
                              </button>
                              {app.status === 'interview_completed' && (
                                <button
                                  onClick={() => handleCreateOfferLetter(app.id)}
                                  className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm flex items-center justify-center space-x-1"
                                >
                                  <FileText className="w-4 h-4" />
                                  <span>제안서</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  채용 공고를 선택하여 지원자를 확인하세요.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
