'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, FileEdit, Search, Filter, XCircle, AlertCircle, Edit, Trash2, X, MapPin, Clock, DollarSign, Users, Mail, Phone, Building, Eye } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function RecruitmentRequestPage() {
  const [jobPostings, setJobPostings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailJob, setDetailJob] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingJob, setEditingJob] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('draft');
  const [formData, setFormData] = useState({
    // 공통항목
    title: '',
    recruitment_fields: [] as string[],
    responsibilities: '',
    experience_type: '',
    education: '',
    education_expected_graduate: false,
    job_role: '',
    requirements: '',
    preferred_qualifications: '',
    employment_type: [] as string[],
    salary_type: 'annual',
    salary_amount: '',
    working_hours: '40',
    location: '',
    location_detail: '',
    remote_work_available: false,
    overseas_location: false,
    // 접수기간 및 채용절차
    application_start_date: '',
    application_start_time: '16:00',
    application_end_date: '',
    application_end_time: '23:59',
    application_period_type: '1month',
    recruitment_process: [] as string[],
    benefits: '',
    required_documents: '',
    notes: '',
    // 사람인 관련
    application_method: [] as string[],
    application_form: 'saramin',
    number_of_recruits: '',
    department: '',
    job_level: '',
    industry: [] as string[],
    // 담당자 정보
    contact_person: '',
    contact_person_private: true,
    contact_department: '',
    contact_department_private: false,
    contact_phone: '',
    contact_phone_private: true,
    contact_mobile: '',
    contact_mobile_private: true,
    contact_email: '',
    contact_email_private: true,
  });

  const [newRecruitmentField, setNewRecruitmentField] = useState('');
  const [newProcessStep, setNewProcessStep] = useState('');
  const modalContentRef = useRef<HTMLDivElement>(null);

  /** 필수 항목 누락 여부를 순서대로 반환 (첫 번째 누락 필드로 스크롤용). inputRecruitmentField: 입력란에만 있고 아직 추가되지 않은 값도 유효로 인정 */
  const getRequiredMissing = (inputRecruitmentField?: string): string[] => {
    const missing: string[] = [];
    if (!formData.title) missing.push('공고제목');
    const hasRecruitmentField = formData.recruitment_fields.length > 0 || (inputRecruitmentField || '').trim().length > 0;
    if (!hasRecruitmentField) missing.push('모집분야명');
    if (!formData.responsibilities) missing.push('주요업무');
    if (!formData.experience_type) missing.push('경력');
    if (!formData.education) missing.push('학력');
    if (!formData.job_role) missing.push('직무');
    if (!formData.employment_type.length) missing.push('고용형태');
    if (!formData.salary_amount) missing.push('급여');
    if (!formData.location) missing.push('근무지');
    if (!formData.application_start_date || !formData.application_end_date) missing.push('접수기간');
    if (!formData.application_method.length) missing.push('접수방법');
    if (!formData.industry.length) missing.push('업종');
    if (!formData.contact_person) missing.push('담당자');
    if (!formData.contact_phone) missing.push('전화번호');
    if (!formData.contact_email) missing.push('이메일');
    return missing;
  };

  const scrollToRequiredField = (fieldLabel: string) => {
    const id = fieldLabel.replace(/\s+/g, '-');
    const el = modalContentRef.current?.querySelector(`[data-required-field="${id}"]`);
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      ((el as HTMLElement).querySelector('input, select, textarea') as HTMLElement | null)?.focus();
    }
  };

  useEffect(() => {
    loadJobPostings();
  }, [statusFilter]);

  const loadJobPostings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getJobPostings(statusFilter);
      setJobPostings(response.data || []);
    } catch (error) {
      console.error('채용 공고 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const [creating, setCreating] = useState(false);

  const handleCreate = async (overrideRecruitmentFields?: string[]) => {
    if (creating) return;
    setCreating(true);
    
    try {
      const effectiveRecruitmentFields = (overrideRecruitmentFields ?? formData.recruitment_fields).length > 0
        ? (overrideRecruitmentFields ?? formData.recruitment_fields)
        : null;
      // 디버깅: 전송할 데이터 확인
      console.log('[채용 공고 저장] 전송할 formData:', formData);
      
      const payload: any = { 
        title: formData.title,
        recruitment_fields: effectiveRecruitmentFields,
        responsibilities: formData.responsibilities || null,
        experience_type: formData.experience_type || null,
        education: formData.education || null,
        education_expected_graduate: formData.education_expected_graduate || false,
        job_role: formData.job_role || null,
        requirements: formData.requirements || null,
        preferred_qualifications: formData.preferred_qualifications || null,
        employment_type: formData.employment_type.length > 0 ? formData.employment_type : null, // 배열로 전송 (Pydantic validator가 처리)
        salary_min: formData.salary_type === 'annual' && formData.salary_amount ? parseFloat(formData.salary_amount) * 10000 : null,
        salary_max: formData.salary_type === 'annual' && formData.salary_amount ? parseFloat(formData.salary_amount) * 10000 : null,
        working_hours: formData.working_hours ? parseInt(formData.working_hours) : null,
        location: formData.location || null,
        remote_work_available: formData.remote_work_available || false,
        overseas_location: formData.overseas_location || false,
        application_start_date: formData.application_start_date || null,
        application_end_date: formData.application_end_date || null,
        recruitment_process: formData.recruitment_process.length > 0 ? formData.recruitment_process : null,
        benefits: formData.benefits || null,
        required_documents: formData.required_documents || null,
        notes: formData.notes || null,
        application_method: formData.application_method.length > 0 ? formData.application_method : null,
        application_form: formData.application_form || null,
        number_of_recruits: formData.number_of_recruits ? parseInt(formData.number_of_recruits) : null,
        department: formData.department || null,
        job_level: formData.job_level || null,
        industry: formData.industry.length > 0 ? formData.industry : null,
        contact_person: formData.contact_person || null,
        contact_department: formData.contact_department || null,
        contact_phone: formData.contact_phone || null,
        contact_mobile: formData.contact_mobile || null,
        contact_email: formData.contact_email || null,
        contact_private: {
          person: formData.contact_person_private !== undefined ? formData.contact_person_private : true,
          department: formData.contact_department_private !== undefined ? formData.contact_department_private : false,
          phone: formData.contact_phone_private !== undefined ? formData.contact_phone_private : true,
          mobile: formData.contact_mobile_private !== undefined ? formData.contact_mobile_private : true,
          email: formData.contact_email_private !== undefined ? formData.contact_email_private : true,
        },
      };
      
      // 디버깅: 전송할 payload 확인
      console.log('[채용 공고 저장] 전송할 payload:', payload);
      console.log('[채용 공고 저장] 경력:', payload.experience_type);
      console.log('[채용 공고 저장] 학력:', payload.education);
      console.log('[채용 공고 저장] 접수 시작일:', payload.application_start_date);
      console.log('[채용 공고 저장] 접수 종료일:', payload.application_end_date);
      console.log('[채용 공고 저장] 담당자:', payload.contact_person);
      console.log('[채용 공고 저장] 담당자 전화:', payload.contact_phone);
      console.log('[채용 공고 저장] 담당자 이메일:', payload.contact_email);

      if (editingJob) {
        await apiClient.updateJobPosting(editingJob.id, payload);
        alert('수정되었습니다.');
      } else {
        await apiClient.createJobPosting(payload);
        alert('작성되었습니다.');
      }
      
      setShowModal(false);
      setEditingJob(null);
      resetForm();
      loadJobPostings();
    } catch (error: any) {
      alert(error.response?.data?.detail || (editingJob ? '수정 중 오류가 발생했습니다.' : '작성 중 오류가 발생했습니다.'));
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      recruitment_fields: [],
      responsibilities: '',
      experience_type: '',
      education: '',
      education_expected_graduate: false,
      job_role: '',
      requirements: '',
      preferred_qualifications: '',
      employment_type: [],
      salary_type: 'annual',
      salary_amount: '',
      working_hours: '40',
      location: '',
      location_detail: '',
      remote_work_available: false,
      overseas_location: false,
      application_start_date: '',
      application_start_time: '16:00',
      application_end_date: '',
      application_end_time: '23:59',
      application_period_type: '1month',
      recruitment_process: [],
      benefits: '',
      required_documents: '',
      notes: '',
      application_method: [],
      application_form: 'saramin',
      number_of_recruits: '',
      department: '',
      job_level: '',
      industry: [],
      contact_person: '',
      contact_person_private: true,
      contact_department: '',
      contact_department_private: false,
      contact_phone: '',
      contact_phone_private: true,
      contact_mobile: '',
      contact_mobile_private: true,
      contact_email: '',
      contact_email_private: true,
    });
  };

  const handleViewDetail = async (job: any) => {
    setDetailLoading(true);
    setDetailJob(null);
    setShowDetailModal(true);
    try {
      const response = await apiClient.getJobPosting(job.id);
      setDetailJob(response.data);
    } catch (error) {
      console.error('채용 공고 상세 로드 오류:', error);
      alert('채용 공고 상세를 불러오는 중 오류가 발생했습니다.');
      setShowDetailModal(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEdit = async (job: any) => {
    // 상세 정보를 다시 가져오기 (새 필드 포함)
    try {
      const response = await apiClient.getJobPosting(job.id);
      const fullJob = response.data;
      
      console.log('로드된 채용 공고 데이터:', fullJob); // 디버깅용
      
      // JSON 필드 파싱 헬퍼 함수
      const parseJsonField = (field: any, defaultValue: any = []) => {
        if (!field) return defaultValue;
        if (Array.isArray(field)) return field;
        if (typeof field === 'string') {
          try {
            const parsed = JSON.parse(field);
            return Array.isArray(parsed) ? parsed : defaultValue;
          } catch {
            // 쉼표로 구분된 문자열인 경우
            if (field.includes(',')) {
              return field.split(',').map((s: string) => s.trim()).filter((s: string) => s);
            }
            // 단일 문자열인 경우 배열로 변환
            return field.trim() ? [field.trim()] : defaultValue;
          }
        }
        return defaultValue;
      };

      // 날짜 형식 변환 헬퍼 함수
      const formatDate = (date: any) => {
        if (!date) return '';
        if (typeof date === 'string') {
          // ISO 형식에서 YYYY-MM-DD로 변환
          if (date.includes('T')) {
            return date.split('T')[0];
          }
          // 이미 YYYY-MM-DD 형식인 경우
          if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return date;
          }
          // 다른 형식 시도
          try {
            const d = new Date(date);
            if (!isNaN(d.getTime())) {
              return d.toISOString().split('T')[0];
            }
          } catch (e) {
            console.warn('날짜 파싱 실패:', date, e);
          }
        }
        if (date instanceof Date) {
          return date.toISOString().split('T')[0];
        }
        // Python date 객체인 경우 (서버에서 온 경우)
        if (date && typeof date === 'object' && 'year' in date && 'month' in date && 'day' in date) {
          const year = date.year;
          const month = String(date.month).padStart(2, '0');
          const day = String(date.day).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        return '';
      };

      setEditingJob(fullJob);
      const formDataToSet = {
        title: fullJob.title || '',
        recruitment_fields: parseJsonField(fullJob.recruitment_fields, []),
        responsibilities: fullJob.responsibilities || '',
        experience_type: fullJob.experience_type || '',
        education: fullJob.education || '',
        education_expected_graduate: fullJob.education_expected_graduate === true || fullJob.education_expected_graduate === 1,
        job_role: fullJob.job_role || '',
        requirements: fullJob.requirements || '',
        preferred_qualifications: fullJob.preferred_qualifications || '',
        employment_type: parseJsonField(fullJob.employment_type, []),
        salary_type: 'annual',
        salary_amount: fullJob.salary_min ? (fullJob.salary_min / 10000).toString() : '',
        working_hours: fullJob.working_hours ? fullJob.working_hours.toString() : '40',
        location: fullJob.location || '',
        location_detail: '',
        remote_work_available: fullJob.remote_work_available === true || fullJob.remote_work_available === 1,
        overseas_location: fullJob.overseas_location === true || fullJob.overseas_location === 1,
        application_start_date: formatDate(fullJob.application_start_date),
        application_start_time: '16:00',
        application_end_date: formatDate(fullJob.application_end_date || fullJob.closing_date),
        application_end_time: '23:59',
        application_period_type: '1month',
        recruitment_process: parseJsonField(fullJob.recruitment_process, []),
        benefits: fullJob.benefits || '',
        required_documents: fullJob.required_documents || '',
        notes: fullJob.notes || '',
        application_method: parseJsonField(fullJob.application_method, []),
        application_form: fullJob.application_form || 'saramin',
        number_of_recruits: fullJob.number_of_recruits ? fullJob.number_of_recruits.toString() : '',
        department: fullJob.department || '',
        job_level: fullJob.job_level || '',
        industry: parseJsonField(fullJob.industry, []),
        contact_person: fullJob.contact_person || '',
        contact_person_private: fullJob.contact_private?.person !== false && fullJob.contact_private?.person !== 0,
        contact_department: fullJob.contact_department || '',
        contact_department_private: fullJob.contact_private?.department === true || fullJob.contact_private?.department === 1,
        contact_phone: fullJob.contact_phone || '',
        contact_phone_private: fullJob.contact_private?.phone !== false && fullJob.contact_private?.phone !== 0,
        contact_mobile: fullJob.contact_mobile || '',
        contact_mobile_private: fullJob.contact_private?.mobile !== false && fullJob.contact_private?.mobile !== 0,
        contact_email: fullJob.contact_email || '',
        contact_email_private: fullJob.contact_private?.email !== false && fullJob.contact_private?.email !== 0,
      };
      
      console.log('설정할 formData:', formDataToSet); // 디버깅용
      console.log('로드된 모집분야명:', fullJob.recruitment_fields, '(타입:', typeof fullJob.recruitment_fields, ') -> 파싱:', formDataToSet.recruitment_fields);
      console.log('로드된 경력:', fullJob.experience_type, '(타입:', typeof fullJob.experience_type, ') -> 설정:', formDataToSet.experience_type);
      console.log('로드된 직무:', fullJob.job_role, '(타입:', typeof fullJob.job_role, ') -> 설정:', formDataToSet.job_role);
      console.log('전체 fullJob 객체:', JSON.stringify(fullJob, null, 2));
      setFormData(formDataToSet);
      setShowModal(true);
    } catch (error) {
      console.error('채용 공고 상세 정보 로드 오류:', error);
      alert('채용 공고 정보를 불러오는 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 채용 공고를 삭제하시겠습니까?')) return;
    
    try {
      await apiClient.deleteJobPosting(id);
      alert('삭제되었습니다.');
      loadJobPostings();
    } catch (error: any) {
      alert(error.response?.data?.detail || '삭제 중 오류가 발생했습니다.');
    }
  };

  const handleRequestApproval = async (id: number) => {
    if (!confirm('이 채용 공고를 승인 요청하시겠습니까?')) return;
    
    try {
      await apiClient.requestApproval(id);
      alert('승인 요청이 완료되었습니다.');
      loadJobPostings();
    } catch (error: any) {
      alert(error.response?.data?.detail || '승인 요청 중 오류가 발생했습니다.');
    }
  };

  const handleCancelApproval = async (id: number) => {
    if (!confirm('이 채용 공고의 승인 요청을 취소하시겠습니까?')) return;
    
    try {
      await apiClient.cancelApproval(id);
      alert('승인 요청이 취소되었습니다.');
      loadJobPostings();
    } catch (error: any) {
      alert(error.response?.data?.detail || '승인 취소 중 오류가 발생했습니다.');
    }
  };

  const addRecruitmentField = () => {
    if (newRecruitmentField.trim() && formData.recruitment_fields.length < 30) {
      setFormData({
        ...formData,
        recruitment_fields: [...formData.recruitment_fields, newRecruitmentField.trim()]
      });
      setNewRecruitmentField('');
    }
  };

  const removeRecruitmentField = (index: number) => {
    setFormData({
      ...formData,
      recruitment_fields: formData.recruitment_fields.filter((_, i) => i !== index)
    });
  };

  const addProcessStep = () => {
    if (newProcessStep.trim()) {
      setFormData({
        ...formData,
        recruitment_process: [...formData.recruitment_process, newProcessStep.trim()]
      });
      setNewProcessStep('');
    }
  };

  const removeProcessStep = (index: number) => {
    setFormData({
      ...formData,
      recruitment_process: formData.recruitment_process.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center space-x-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-5 h-5" />
          <span>채용 공고 작성</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">채용 공고 요청 목록</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="draft">초안</option>
            <option value="pending_approval">승인 대기</option>
            <option value="approved">승인됨</option>
            <option value="published">배포됨</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12">로딩 중...</div>
        ) : jobPostings.length === 0 ? (
          <div className="text-center py-12 text-gray-500">채용 공고가 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {jobPostings.map((job) => (
              <div key={job.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{job.title}</h3>
                    <p className="text-sm text-gray-600">{job.department} · {job.position}</p>
                    {job.description && (
                      <p className="text-sm text-gray-500 mt-2">{job.description.substring(0, 100)}...</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4 flex-wrap">
                    <button
                      onClick={() => handleViewDetail(job)}
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm flex items-center space-x-1"
                      title="상세보기"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="hidden sm:inline">상세보기</span>
                    </button>
                    <span className={`px-2 py-1 rounded text-xs ${
                      job.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                      job.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-800' :
                      job.status === 'approved' ? 'bg-green-100 text-green-800' :
                      job.status === 'published' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {job.status === 'draft' ? '초안' : job.status === 'pending_approval' ? '승인 대기' : job.status === 'approved' ? '승인됨' : job.status === 'published' ? '배포됨' : job.status}
                    </span>
                    {/* 초안만 수정·삭제·승인 요청 가능 */}
                    {job.status === 'draft' && (
                      <>
                        <button
                          onClick={() => handleEdit(job)}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center space-x-1"
                          title="수정"
                        >
                          <Edit className="w-4 h-4" />
                          <span className="hidden sm:inline">수정</span>
                        </button>
                        <button
                          onClick={() => handleDelete(job.id)}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex items-center space-x-1"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">삭제</span>
                        </button>
                        <button
                          onClick={() => handleRequestApproval(job.id)}
                          className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm flex items-center space-x-1"
                          title="승인 요청"
                        >
                          <AlertCircle className="w-4 h-4" />
                          <span className="hidden sm:inline">승인 요청</span>
                        </button>
                      </>
                    )}
                    {/* 승인 대기만 승인 취소 가능 */}
                    {job.status === 'pending_approval' && (
                      <button
                        onClick={() => handleCancelApproval(job.id)}
                        className="px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm flex items-center space-x-1"
                        title="승인 취소"
                      >
                        <X className="w-4 h-4" />
                        <span className="hidden sm:inline">승인 취소</span>
                      </button>
                    )}
                    {/* 승인됨·배포됨: 수정·삭제 불가 (버튼 없음) */}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 채용 공고 상세보기 모달 (읽기 전용) */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 sticky top-0 bg-white border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">채용 공고 상세</h2>
              <button
                onClick={() => { setShowDetailModal(false); setDetailJob(null); }}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              {detailLoading ? (
                <div className="text-center py-12 text-gray-500">로딩 중...</div>
              ) : detailJob ? (
                <div className="space-y-6">
                  {(() => {
                    const j = detailJob;
                    const arr = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
                    const str = (v: any) => (v == null || v === '' ? '—' : String(v));
                    const dateStr = (v: any) => (!v ? '—' : typeof v === 'string' ? v.split('T')[0] : `${(v as any).year}-${String((v as any).month).padStart(2, '0')}-${String((v as any).day).padStart(2, '0')}`);
                    return (
                      <>
                        <section>
                          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">공고 정보</h3>
                          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                            <p><span className="text-gray-500 w-28 inline-block">제목</span> {str(j.title)}</p>
                            <p><span className="text-gray-500 w-28 inline-block">모집분야</span> {arr(j.recruitment_fields).join(', ') || '—'}</p>
                            <p><span className="text-gray-500 w-28 inline-block">경력</span> {str(j.experience_type)}</p>
                            <p><span className="text-gray-500 w-28 inline-block">학력</span> {str(j.education)}</p>
                            <p><span className="text-gray-500 w-28 inline-block">직무</span> {str(j.job_role)}</p>
                            <p><span className="text-gray-500 w-28 inline-block">근무지</span> {str(j.location)}</p>
                            <p><span className="text-gray-500 w-28 inline-block">고용형태</span> {arr(j.employment_type).join(', ') || '—'}</p>
                            {j.salary_min != null || j.salary_max != null ? (
                              <p><span className="text-gray-500 w-28 inline-block">급여</span> {j.salary_min != null && j.salary_max != null ? `${Number(j.salary_min).toLocaleString()} ~ ${Number(j.salary_max).toLocaleString()} ${j.currency || 'KRW'}` : j.salary_min != null ? `${Number(j.salary_min).toLocaleString()} 이상` : `${Number(j.salary_max).toLocaleString()} 이하`}</p>
                            ) : null}
                            <p><span className="text-gray-500 w-28 inline-block">모집인원</span> {j.number_of_recruits != null ? `${j.number_of_recruits}명` : '—'}</p>
                          </div>
                        </section>
                        <section>
                          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">주요 업무</h3>
                          <div className="rounded-lg border border-gray-200 p-4"><p className="text-gray-700 whitespace-pre-wrap">{str(j.responsibilities)}</p></div>
                        </section>
                        <section>
                          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">자격 요건</h3>
                          <div className="rounded-lg border border-gray-200 p-4"><p className="text-gray-700 whitespace-pre-wrap">{str(j.requirements)}</p></div>
                        </section>
                        <section>
                          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">우대 사항</h3>
                          <div className="rounded-lg border border-gray-200 p-4"><p className="text-gray-700 whitespace-pre-wrap">{str(j.preferred_qualifications)}</p></div>
                        </section>
                        <section>
                          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">접수 기간</h3>
                          <div className="bg-gray-50 rounded-lg p-4">
                            <p>{dateStr(j.application_start_date)} ~ {dateStr(j.application_end_date)}</p>
                          </div>
                        </section>
                        {arr(j.recruitment_process).length > 0 && (
                          <section>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">채용 절차</h3>
                            <ul className="list-decimal list-inside space-y-1 text-gray-700">{arr(j.recruitment_process).map((step: string, i: number) => <li key={i}>{step}</li>)}</ul>
                          </section>
                        )}
                        {(j.benefits || j.required_documents || j.notes) && (
                          <section>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">기타</h3>
                            <div className="space-y-2 text-gray-700">
                              {j.benefits && <p><span className="text-gray-500 font-medium">복지·혜택</span><br /><span className="whitespace-pre-wrap">{j.benefits}</span></p>}
                              {j.required_documents && <p><span className="text-gray-500 font-medium">제출서류</span><br /><span className="whitespace-pre-wrap">{j.required_documents}</span></p>}
                              {j.notes && <p><span className="text-gray-500 font-medium">유의사항</span><br /><span className="whitespace-pre-wrap">{j.notes}</span></p>}
                            </div>
                          </section>
                        )}
                        <section>
                          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">담당자 정보</h3>
                          <div className="bg-gray-50 rounded-lg p-4 space-y-1">
                            <p><span className="text-gray-500 w-24 inline-block">담당자</span> {str(j.contact_person)}</p>
                            <p><span className="text-gray-500 w-24 inline-block">부서</span> {str(j.contact_department)}</p>
                            <p><span className="text-gray-500 w-24 inline-block">전화</span> {str(j.contact_phone)}</p>
                            <p><span className="text-gray-500 w-24 inline-block">휴대폰</span> {str(j.contact_mobile)}</p>
                            <p><span className="text-gray-500 w-24 inline-block">이메일</span> {str(j.contact_email)}</p>
                          </div>
                        </section>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">데이터를 불러올 수 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 채용 공고 작성 모달 - 새 양식 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div ref={modalContentRef} className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[95vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editingJob ? '채용 공고 수정' : '채용 공고 작성'}
                </h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingJob(null);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              {/* 공통항목 섹션 */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">공통항목</h3>
                
                {/* 공고제목 */}
                <div className="mb-4" data-required-field="공고제목">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    공고제목 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="예: 백엔드 개발자"
                  />
                </div>

                {/* 모집분야명 */}
                <div className="mb-4" data-required-field="모집분야명">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    모집분야명 <span className="text-red-500">*</span>
                  </label>
                  <div className="mb-2">
                    <input
                      type="text"
                      value={newRecruitmentField}
                      onChange={(e) => setNewRecruitmentField(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addRecruitmentField()}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="모집분야명을 입력해주세요 (여러 개는 Enter로 추가)"
                      maxLength={30}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.recruitment_fields.map((field, index) => (
                      <span key={index} className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                        {field}
                        <button
                          onClick={() => removeRecruitmentField(index)}
                          className="ml-2 text-blue-600 hover:text-blue-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{formData.recruitment_fields.length}/30</p>
                </div>

                {/* 주요업무 */}
                <div className="mb-4" data-required-field="주요업무">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    주요업무 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.responsibilities}
                    onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="주요업무를 입력해주세요"
                    maxLength={3000}
                  />
                  <p className="text-xs text-gray-500 mt-1">{formData.responsibilities.length}/3000</p>
                </div>

                {/* 경력 */}
                <div className="mb-4" data-required-field="경력">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    경력 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="experience_type"
                        value="신입"
                        checked={formData.experience_type === '신입'}
                        onChange={(e) => setFormData({ ...formData, experience_type: e.target.value })}
                        className="mr-2"
                      />
                      신입
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="experience_type"
                        value="경력"
                        checked={formData.experience_type === '경력'}
                        onChange={(e) => setFormData({ ...formData, experience_type: e.target.value })}
                        className="mr-2"
                      />
                      경력
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="experience_type"
                        value="경력무관"
                        checked={formData.experience_type === '경력무관'}
                        onChange={(e) => setFormData({ ...formData, experience_type: e.target.value })}
                        className="mr-2"
                      />
                      경력무관
                    </label>
                  </div>
                </div>

                {/* 학력 */}
                <div className="mb-4" data-required-field="학력">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    학력 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-4 items-center">
                    <select
                      value={formData.education}
                      onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">선택하세요</option>
                      <option value="학력무관">학력무관</option>
                      <option value="고졸">고졸</option>
                      <option value="전문대졸">전문대졸</option>
                      <option value="대졸">대졸</option>
                      <option value="석사">석사</option>
                      <option value="박사">박사</option>
                    </select>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.education_expected_graduate}
                        onChange={(e) => setFormData({ ...formData, education_expected_graduate: e.target.checked })}
                        className="mr-2"
                      />
                      졸업 예정자 가능
                    </label>
                  </div>
                </div>

                {/* 직무 */}
                <div className="mb-4" data-required-field="직무">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    직무 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.job_role}
                    onChange={(e) => setFormData({ ...formData, job_role: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="직무를 선택하세요"
                  />
                </div>

                {/* 자격요건 및 우대사항 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">자격요건</label>
                    <textarea
                      value={formData.requirements}
                      onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="자격요건을 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">우대사항</label>
                    <textarea
                      value={formData.preferred_qualifications}
                      onChange={(e) => setFormData({ ...formData, preferred_qualifications: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="우대사항을 입력하세요"
                    />
                  </div>
                </div>

                {/* 고용형태 */}
                <div className="mb-4" data-required-field="고용형태">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    고용형태 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-4 flex-wrap">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.employment_type.includes('정규직')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, employment_type: [...formData.employment_type, '정규직'] });
                          } else {
                            setFormData({ ...formData, employment_type: formData.employment_type.filter(t => t !== '정규직') });
                          }
                        }}
                        className="mr-2"
                      />
                      정규직
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.employment_type.includes('계약직')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, employment_type: [...formData.employment_type, '계약직'] });
                          } else {
                            setFormData({ ...formData, employment_type: formData.employment_type.filter(t => t !== '계약직') });
                          }
                        }}
                        className="mr-2"
                      />
                      계약직
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.employment_type.includes('프리랜서')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, employment_type: [...formData.employment_type, '프리랜서'] });
                          } else {
                            setFormData({ ...formData, employment_type: formData.employment_type.filter(t => t !== '프리랜서') });
                          }
                        }}
                        className="mr-2"
                      />
                      프리랜서
                    </label>
                  </div>
                </div>

                {/* 급여 */}
                <div className="mb-4" data-required-field="급여">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    급여 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={formData.salary_type}
                      onChange={(e) => setFormData({ ...formData, salary_type: e.target.value })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="annual">연봉</option>
                      <option value="monthly">월급</option>
                      <option value="hourly">시급</option>
                    </select>
                    <input
                      type="number"
                      value={formData.salary_amount}
                      onChange={(e) => setFormData({ ...formData, salary_amount: e.target.value })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="0"
                    />
                    <span className="text-gray-600">만원</span>
                  </div>
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
                    주 40시간 기준 최저연봉 약 25,882,560원 (2026년 최저시급 10,320원)
                  </div>
                </div>

                {/* 근무시간 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">근무시간</label>
                  <div className="flex gap-2 items-center">
                    <span className="text-gray-600">주</span>
                    <input
                      type="number"
                      value={formData.working_hours}
                      onChange={(e) => setFormData({ ...formData, working_hours: e.target.value })}
                      className="w-20 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="40"
                    />
                    <span className="text-gray-600">시간</span>
                  </div>
                </div>

                {/* 근무지 */}
                <div className="mb-4" data-required-field="근무지">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    근무지 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="경기 화성시 정남면 가장로"
                    />
                    <input
                      type="text"
                      value={formData.location_detail}
                      onChange={(e) => setFormData({ ...formData, location_detail: e.target.value })}
                      className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="277"
                    />
                    <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
                      변경
                    </button>
                  </div>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.remote_work_available}
                        onChange={(e) => setFormData({ ...formData, remote_work_available: e.target.checked })}
                        className="mr-2"
                      />
                      재택근무 가능
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.overseas_location}
                        onChange={(e) => setFormData({ ...formData, overseas_location: e.target.checked })}
                        className="mr-2"
                      />
                      해외지역
                    </label>
                  </div>
                </div>
              </div>

              {/* 접수기간 및 채용절차 섹션 */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">접수기간 및 채용절차</h3>
                
                {/* 접수기간 */}
                <div className="mb-4" data-required-field="접수기간">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    접수기간 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2 items-center flex-wrap">
                    <input
                      type="date"
                      value={formData.application_start_date}
                      onChange={(e) => setFormData({ ...formData, application_start_date: e.target.value })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <input
                      type="time"
                      value={formData.application_start_time}
                      onChange={(e) => setFormData({ ...formData, application_start_time: e.target.value })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <span>~</span>
                    <input
                      type="date"
                      value={formData.application_end_date}
                      onChange={(e) => setFormData({ ...formData, application_end_date: e.target.value })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <input
                      type="time"
                      value={formData.application_end_time}
                      onChange={(e) => setFormData({ ...formData, application_end_time: e.target.value })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="flex gap-2">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="period_type"
                          value="1month"
                          checked={formData.application_period_type === '1month'}
                          onChange={(e) => setFormData({ ...formData, application_period_type: e.target.value })}
                          className="mr-1"
                        />
                        1개월
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="period_type"
                          value="2month"
                          checked={formData.application_period_type === '2month'}
                          onChange={(e) => setFormData({ ...formData, application_period_type: e.target.value })}
                          className="mr-1"
                        />
                        2개월
                      </label>
                    </div>
                  </div>
                </div>

                {/* 채용절차 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">채용절차</label>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {formData.recruitment_process.map((step, index) => (
                      <span key={index} className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
                        {step}
                        <button
                          onClick={() => removeProcessStep(index)}
                          className="ml-2 text-gray-600 hover:text-gray-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {index < formData.recruitment_process.length - 1 && <span className="ml-2 text-gray-400">&gt;</span>}
                      </span>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newProcessStep}
                        onChange={(e) => setNewProcessStep(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addProcessStep()}
                        className="px-3 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="단계 추가"
                      />
                      <button
                        onClick={addProcessStep}
                        className="px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* 복지·혜택, 제출서류, 유의사항 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">복지·혜택</label>
                    <textarea
                      value={formData.benefits}
                      onChange={(e) => setFormData({ ...formData, benefits: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="복지·혜택을 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">제출서류</label>
                    <textarea
                      value={formData.required_documents}
                      onChange={(e) => setFormData({ ...formData, required_documents: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="제출서류를 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">유의사항</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="유의사항을 입력하세요"
                    />
                  </div>
                </div>
              </div>

              {/* 사람인 관련 섹션 */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">S</span>
                  사람인
                </h3>
                
                {/* 접수방법 */}
                <div className="mb-4" data-required-field="접수방법">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    접수방법 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-4 flex-wrap">
                    {['사람인 접수', '홈페이지', '우편', '방문', '전화', 'FAX'].map((method) => (
                      <label key={method} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.application_method.includes(method)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, application_method: [...formData.application_method, method] });
                            } else {
                              setFormData({ ...formData, application_method: formData.application_method.filter(m => m !== method) });
                            }
                          }}
                          className="mr-2"
                        />
                        {method}
                      </label>
                    ))}
                  </div>
                </div>

                {/* 지원서 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    지원서 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.application_form}
                    onChange={(e) => setFormData({ ...formData, application_form: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="saramin">사람인 지원서</option>
                    <option value="custom">커스텀 지원서</option>
                  </select>
                </div>

                {/* 모집인원, 근무부서, 직급·직책 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">모집인원</label>
                    <input
                      type="number"
                      value={formData.number_of_recruits}
                      onChange={(e) => setFormData({ ...formData, number_of_recruits: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="명"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">근무부서</label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="부서명"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">직급·직책</label>
                    <input
                      type="text"
                      value={formData.job_level}
                      onChange={(e) => setFormData({ ...formData, job_level: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="직급·직책"
                    />
                  </div>
                </div>

                {/* 업종 */}
                <div className="mb-4" data-required-field="업종">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    업종 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={Array.isArray(formData.industry) ? formData.industry.join(', ') : (formData.industry || '')}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.trim()) {
                        setFormData({ ...formData, industry: value.split(',').map(i => i.trim()).filter(i => i) });
                      } else {
                        setFormData({ ...formData, industry: [] });
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="업종을 입력하세요 (쉼표로 구분)"
                  />
                  {formData.industry.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.industry.map((ind, index) => (
                        <span key={index} className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                          {ind}
                          <button
                            onClick={() => setFormData({ ...formData, industry: formData.industry.filter((_, i) => i !== index) })}
                            className="ml-2 text-blue-600 hover:text-blue-800"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 담당자 정보 섹션 */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">담당자 정보</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div data-required-field="담당자">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      담당자 <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.contact_person}
                        onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="강영욱"
                      />
                      <label className="flex items-center px-3 border border-gray-300 rounded-lg">
                        <input
                          type="checkbox"
                          checked={formData.contact_person_private}
                          onChange={(e) => setFormData({ ...formData, contact_person_private: e.target.checked })}
                          className="mr-2"
                        />
                        비공개
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">부서명</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.contact_department}
                        onChange={(e) => setFormData({ ...formData, contact_department: e.target.value })}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="인사팀"
                      />
                      <label className="flex items-center px-3 border border-gray-300 rounded-lg">
                        <input
                          type="checkbox"
                          checked={formData.contact_department_private}
                          onChange={(e) => setFormData({ ...formData, contact_department_private: e.target.checked })}
                          className="mr-2"
                        />
                        비공개
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div data-required-field="전화번호">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      전화번호 <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={formData.contact_phone}
                        onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="010-7273-2907"
                      />
                      <label className="flex items-center px-3 border border-gray-300 rounded-lg">
                        <input
                          type="checkbox"
                          checked={formData.contact_phone_private}
                          onChange={(e) => setFormData({ ...formData, contact_phone_private: e.target.checked })}
                          className="mr-2"
                        />
                        비공개
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">휴대폰번호</label>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={formData.contact_mobile}
                        onChange={(e) => setFormData({ ...formData, contact_mobile: e.target.value })}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="010-7273-2907"
                      />
                      <label className="flex items-center px-3 border border-gray-300 rounded-lg">
                        <input
                          type="checkbox"
                          checked={formData.contact_mobile_private}
                          onChange={(e) => setFormData({ ...formData, contact_mobile_private: e.target.checked })}
                          className="mr-2"
                        />
                        비공개
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mb-4" data-required-field="이메일">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이메일 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="hrkang@atechsolution.co.kr"
                    />
                    <label className="flex items-center px-3 border border-gray-300 rounded-lg">
                      <input
                        type="checkbox"
                        checked={formData.contact_email_private}
                        onChange={(e) => setFormData({ ...formData, contact_email_private: e.target.checked })}
                        className="mr-2"
                      />
                      비공개
                    </label>
                  </div>
                </div>
              </div>

              {/* 버튼 */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingJob(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    const missingFields = getRequiredMissing(newRecruitmentField);
                    if (missingFields.length > 0) {
                      const firstMissing = missingFields[0];
                      scrollToRequiredField(firstMissing);
                      setTimeout(() => {
                        alert(`다음 필수 항목을 입력해주세요:\n${missingFields.join(', ')}\n\n첫 번째 누락 항목("${firstMissing}")으로 스크롤했습니다.`);
                      }, 400);
                      return;
                    }
                    const recruitmentOverride = formData.recruitment_fields.length === 0 && newRecruitmentField.trim()
                      ? [newRecruitmentField.trim()]
                      : undefined;
                    handleCreate(recruitmentOverride);
                  }}
                  disabled={creating}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {creating ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>{editingJob ? '수정 중...' : '작성 중...'}</span>
                    </>
                  ) : (
                    <span>{editingJob ? '수정' : '작성'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
