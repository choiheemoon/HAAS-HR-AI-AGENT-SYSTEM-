'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Briefcase, MapPin, Calendar, Mail, Phone, Building2, FileText, Users, DollarSign, FileUp, UserPlus } from 'lucide-react';

function renderText(value: string | Record<string, unknown> | null | undefined): React.ReactNode {
  if (value == null || value === '') return <p className="text-gray-500 italic">등록된 내용이 없습니다.</p>;
  if (typeof value === 'object') return <pre className="whitespace-pre-wrap text-gray-700">{JSON.stringify(value, null, 2)}</pre>;
  return <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{String(value)}</div>;
}

export default function PublicJobPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApplyDoc, setShowApplyDoc] = useState(false);
  const [showApplyInfo, setShowApplyInfo] = useState(false);
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyForm, setApplyForm] = useState({ name: '', email: '', phone: '', cover_letter: '' });
  const [infoForm, setInfoForm] = useState({
    applicant_name: '',
    applicant_surname: '',
    applicant_email: '',
    applicant_phone: '',
    address: '',
    applied_position: '',
    date_of_birth: '',
    age: '',
    education: '',
    experience: '',
    skills: '',
    summary: '',
    gender: '',
    nationality: '',
    desired_salary: '',
    desired_positions: '',
    start_date_available: '',
    other_notes: '',
    document_language: 'ko',
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .getPublicJobPosting(slug)
      .then((res) => {
        if (!cancelled) setJob(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.detail || '채용 공고를 불러올 수 없습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  const resetApplyState = () => {
    setApplyForm({ name: '', email: '', phone: '', cover_letter: '' });
    setInfoForm({
      applicant_name: '',
      applicant_surname: '',
      applicant_email: '',
      applicant_phone: '',
      address: '',
      applied_position: '',
      date_of_birth: '',
      age: '',
      education: '',
      experience: '',
      skills: '',
      summary: '',
      gender: '',
      nationality: '',
      desired_salary: '',
      desired_positions: '',
      start_date_available: '',
      other_notes: '',
      document_language: 'ko',
    });
    setResumeFile(null);
    setApplyError(null);
    setApplySuccess(false);
  };

  const handleApplyDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !job) return;
    if (!resumeFile) {
      setApplyError('이력서(PDF) 파일을 첨부해 주세요.');
      return;
    }
    setApplySubmitting(true);
    setApplyError(null);
    try {
      await apiClient.applyToPublicJob(slug, {
        name: applyForm.name,
        email: applyForm.email,
        phone: applyForm.phone || undefined,
        cover_letter: applyForm.cover_letter || undefined,
        resume_file: resumeFile,
      });
      setApplySuccess(true);
      resetApplyState();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setApplyError(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d?.msg || d).join(', ') : '지원 접수 중 오류가 발생했습니다.');
    } finally {
      setApplySubmitting(false);
    }
  };

  const handleApplyInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !job) return;
    setApplySubmitting(true);
    setApplyError(null);
    try {
      const payload: Record<string, string> = {
        applicant_name: infoForm.applicant_name,
        applicant_email: infoForm.applicant_email,
        document_language: infoForm.document_language,
      };
      if (infoForm.applicant_surname) payload.applicant_surname = infoForm.applicant_surname;
      if (infoForm.applicant_phone) payload.applicant_phone = infoForm.applicant_phone;
      if (infoForm.address) payload.address = infoForm.address;
      if (infoForm.applied_position) payload.applied_position = infoForm.applied_position;
      if (infoForm.date_of_birth) payload.date_of_birth = infoForm.date_of_birth;
      if (infoForm.age) payload.age = infoForm.age;
      if (infoForm.education) payload.education = infoForm.education;
      if (infoForm.experience) payload.experience = infoForm.experience;
      if (infoForm.skills) payload.skills = infoForm.skills;
      if (infoForm.summary) payload.summary = infoForm.summary;
      if (infoForm.gender) payload.gender = infoForm.gender;
      if (infoForm.nationality) payload.nationality = infoForm.nationality;
      if (infoForm.desired_salary) payload.desired_salary = infoForm.desired_salary;
      if (infoForm.desired_positions) payload.desired_positions = infoForm.desired_positions;
      if (infoForm.start_date_available) payload.start_date_available = infoForm.start_date_available;
      if (infoForm.other_notes) payload.other_notes = infoForm.other_notes;
      await apiClient.applyInfoToPublicJob(slug, payload);
      setApplySuccess(true);
      resetApplyState();
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;
      const detail = data?.detail;
      let message: string;
      if (status === 404) {
        const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d?.msg || d).join(', ') : '';
        message = msg && msg !== 'Not Found' ? msg : '채용 공고를 찾을 수 없거나 요청을 처리할 수 없습니다. 백엔드 서버(localhost:8000)가 실행 중인지, 최신 코드로 재시작했는지 확인해 주세요.';
      } else {
        message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d?.msg || d).join(', ') : '지원 접수 중 오류가 발생했습니다.';
      }
      setApplyError(message);
    } finally {
      setApplySubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }
  if (error || !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-2">{error || '채용 공고를 찾을 수 없습니다.'}</p>
          <a href="/" className="text-blue-600 hover:underline">홈으로</a>
        </div>
      </div>
    );
  }

  const title = job.title || job.recruitment_fields?.[0] || `채용 공고 #${job.id}`;
  const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('ko-KR') : '-');
  const hasSalary = job.salary_min != null || job.salary_max != null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">{title}</h1>
          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
            {job.recruitment_fields?.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="w-4 h-4" />
                {job.recruitment_fields.join(', ')}
              </span>
            )}
            {job.experience_type && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{job.experience_type}</span>
            )}
            {job.education && (
              <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{job.education}</span>
            )}
            {job.job_role && (
              <span className="text-gray-600">{job.job_role}</span>
            )}
            {job.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {job.location}
              </span>
            )}
            {job.employment_type && (
              <span className="text-gray-600">{job.employment_type}</span>
            )}
          </div>
          {(job.application_start_date || job.application_end_date) && (
            <p className="mt-3 text-sm text-gray-500 flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              접수 기간: {formatDate(job.application_start_date)} ~ {formatDate(job.application_end_date)}
            </p>
          )}
          <div className="mt-6 pt-6 border-t border-gray-200 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => { resetApplyState(); setShowApplyDoc(true); }}
              className="flex-1 px-5 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <FileUp className="w-5 h-5" />
              입사 지원서 서류지원하기
            </button>
            <button
              type="button"
              onClick={() => { resetApplyState(); setShowApplyInfo(true); }}
              className="flex-1 px-5 py-3 border-2 border-blue-600 text-blue-600 font-medium rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2"
            >
              <UserPlus className="w-5 h-5" />
              입사정보 등록 지원하기
            </button>
          </div>
        </header>

        <div className="space-y-6">
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">모집 내용</h2>
            {renderText(job.description)}
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">자격 요건</h2>
            {renderText(job.requirements)}
          </section>

          {(job.responsibilities != null && job.responsibilities !== '') && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">주요 업무</h2>
              {renderText(job.responsibilities)}
            </section>
          )}

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">우대 사항</h2>
            {renderText(job.preferred_qualifications)}
          </section>

          {(hasSalary || job.number_of_recruits != null || (job.recruitment_process && job.recruitment_process.length) || job.required_documents) && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Users className="w-5 h-5" />
                채용 안내
              </h2>
              <ul className="space-y-2 text-gray-700">
                {hasSalary && (
                  <li className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    급여: {job.salary_min != null && job.salary_max != null
                      ? `${job.salary_min.toLocaleString()} ~ ${job.salary_max.toLocaleString()} ${job.currency || 'KRW'}`
                      : job.salary_min != null
                        ? `${job.salary_min.toLocaleString()} ${job.currency || 'KRW'} 이상`
                        : `${job.salary_max?.toLocaleString()} ${job.currency || 'KRW'} 이하`}
                  </li>
                )}
                {job.number_of_recruits != null && (
                  <li>모집 인원: {job.number_of_recruits}명</li>
                )}
                {job.recruitment_process?.length > 0 && (
                  <li>
                    <span className="font-medium">채용 절차</span>
                    <ul className="mt-1 list-decimal list-inside text-gray-600 space-y-0.5">
                      {job.recruitment_process.map((step: string, i: number) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  </li>
                )}
                {job.required_documents && (
                  <li>제출 서류: {typeof job.required_documents === 'string' ? job.required_documents : JSON.stringify(job.required_documents)}</li>
                )}
              </ul>
            </section>
          )}

          {job.notes && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">유의 사항</h2>
              {renderText(job.notes)}
            </section>
          )}

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              문의 안내
            </h2>
            {(job.contact_department || job.contact_person || job.contact_email || job.contact_phone || job.contact_mobile) ? (
              <ul className="space-y-2 text-gray-700">
                {job.contact_department && <li>부서: {job.contact_department}</li>}
                {job.contact_person && <li>담당자: {job.contact_person}</li>}
                {job.contact_email && (
                  <li className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    <a href={`mailto:${job.contact_email}`} className="text-blue-600 hover:underline">{job.contact_email}</a>
                  </li>
                )}
                {(job.contact_phone || job.contact_mobile) && (
                  <li className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    <a href={`tel:${job.contact_phone || job.contact_mobile}`} className="text-blue-600 hover:underline">
                      {job.contact_phone || job.contact_mobile}
                    </a>
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-gray-500 italic">등록된 문의처가 없습니다.</p>
            )}
          </section>
        </div>

        {/* 입사 지원서 서류지원하기 모달 (이력서 첨부) */}
        {showApplyDoc && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !applySubmitting && (setShowApplyDoc(false), resetApplyState())}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold text-gray-900 mb-2">입사 지원서 서류지원하기</h2>
              <p className="text-sm text-gray-500 mb-4">입사지원 서류(이력서)를 첨부하여 지원합니다.</p>
              {applySuccess ? (
                <div className="text-center py-4">
                  <p className="text-green-600 font-medium">지원이 접수되었습니다.</p>
                  <p className="text-sm text-gray-500 mt-2">담당자가 검토 후 연락드리겠습니다.</p>
                  <button type="button" onClick={() => { setShowApplyDoc(false); resetApplyState(); }} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">닫기</button>
                </div>
              ) : (
                <form onSubmit={handleApplyDocSubmit} className="space-y-4">
                  {applyError && <p className="text-red-600 text-sm">{applyError}</p>}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                    <input type="text" required value={applyForm.name} onChange={(e) => setApplyForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="홍길동" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">이메일 *</label>
                    <input type="email" required value={applyForm.email} onChange={(e) => setApplyForm((f) => ({ ...f, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="email@example.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                    <input type="tel" value={applyForm.phone} onChange={(e) => setApplyForm((f) => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="010-0000-0000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">자기소개서</label>
                    <textarea value={applyForm.cover_letter} onChange={(e) => setApplyForm((f) => ({ ...f, cover_letter: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="간단한 소개나 지원 동기 (선택)" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      이력서 (PDF) *
                    </label>
                    <input type="file" accept=".pdf" required onChange={(e) => setResumeFile(e.target.files?.[0] || null)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => { setShowApplyDoc(false); resetApplyState(); }} disabled={applySubmitting} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">취소</button>
                    <button type="submit" disabled={applySubmitting} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{applySubmitting ? '접수 중...' : '지원 접수'}</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* 입사정보 등록 지원하기 모달 (지원서 상세 입력란과 동일) */}
        {showApplyInfo && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !applySubmitting && (setShowApplyInfo(false), resetApplyState())}>
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">입사정보 등록 지원하기</h2>
                <p className="text-sm text-gray-500 mt-1">지원서 목록 상세와 동일한 항목을 입력합니다. 접수 후 지원서 목록에서 웹지원으로 조회됩니다.</p>
              </div>
              {applySuccess ? (
                <div className="p-6 text-center">
                  <p className="text-green-600 font-medium">지원이 접수되었습니다.</p>
                  <p className="text-sm text-gray-500 mt-2">지원서 목록에서 웹지원으로 확인할 수 있습니다.</p>
                  <button type="button" onClick={() => { setShowApplyInfo(false); resetApplyState(); }} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">닫기</button>
                </div>
              ) : (
                <form onSubmit={handleApplyInfoSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
                  {applyError && <p className="text-red-600 text-sm">{applyError}</p>}
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">기본 정보 (Contact)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                        <input type="text" required value={infoForm.applicant_name} onChange={(e) => setInfoForm((f) => ({ ...f, applicant_name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="홍길동" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">성</label>
                        <input type="text" value={infoForm.applicant_surname} onChange={(e) => setInfoForm((f) => ({ ...f, applicant_surname: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="김" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">이메일 *</label>
                      <input type="email" required value={infoForm.applicant_email} onChange={(e) => setInfoForm((f) => ({ ...f, applicant_email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="email@example.com" />
                    </div>
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">연락처 (모바일)</label>
                      <input type="tel" value={infoForm.applicant_phone} onChange={(e) => setInfoForm((f) => ({ ...f, applicant_phone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="010-0000-0000" />
                    </div>
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                      <input type="text" value={infoForm.address} onChange={(e) => setInfoForm((f) => ({ ...f, address: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="주소" />
                    </div>
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">지원 정보 (Application Info)</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">지원 직위</label>
                      <input type="text" value={infoForm.applied_position} onChange={(e) => setInfoForm((f) => ({ ...f, applied_position: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="지원하는 직위" />
                    </div>
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">개인 정보 (Personal)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">생년월일</label>
                        <input type="text" value={infoForm.date_of_birth} onChange={(e) => setInfoForm((f) => ({ ...f, date_of_birth: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="1990-01-01" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">나이</label>
                        <input type="text" value={infoForm.age} onChange={(e) => setInfoForm((f) => ({ ...f, age: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="30" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">성별</label>
                        <input type="text" value={infoForm.gender} onChange={(e) => setInfoForm((f) => ({ ...f, gender: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="남/여" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">국적</label>
                        <input type="text" value={infoForm.nationality} onChange={(e) => setInfoForm((f) => ({ ...f, nationality: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="대한민국" />
                      </div>
                    </div>
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">자기소개 / 지원 동기 (Summary)</h3>
                    <textarea required value={infoForm.summary} onChange={(e) => setInfoForm((f) => ({ ...f, summary: e.target.value }))} rows={5} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="지원 동기, 경력 요약, 포부 등을 작성해 주세요." />
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">학력</h3>
                    <textarea value={infoForm.education} onChange={(e) => setInfoForm((f) => ({ ...f, education: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="학교명, 전공, 졸업일 등" />
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">경력</h3>
                    <textarea value={infoForm.experience} onChange={(e) => setInfoForm((f) => ({ ...f, experience: e.target.value }))} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="회사명, 직위, 기간, 업무 내용 등" />
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">기술 / 스킬</h3>
                    <textarea value={infoForm.skills} onChange={(e) => setInfoForm((f) => ({ ...f, skills: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="보유 기술, 자격증 등" />
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">희망 사항</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">희망 급여</label>
                        <input type="text" value={infoForm.desired_salary} onChange={(e) => setInfoForm((f) => ({ ...f, desired_salary: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="희망 연봉 또는 협의" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">희망 직위</label>
                        <input type="text" value={infoForm.desired_positions} onChange={(e) => setInfoForm((f) => ({ ...f, desired_positions: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="희망 직위" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">근무 시작 가능일</label>
                        <input type="text" value={infoForm.start_date_available} onChange={(e) => setInfoForm((f) => ({ ...f, start_date_available: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="즉시 가능 / 2026-02-01 등" />
                      </div>
                    </div>
                  </section>
                  <section>
                    <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
                    <textarea value={infoForm.other_notes} onChange={(e) => setInfoForm((f) => ({ ...f, other_notes: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="기타 전달 사항" />
                  </section>
                  <div className="flex gap-2 pt-4 border-t border-gray-200">
                    <button type="button" onClick={() => { setShowApplyInfo(false); resetApplyState(); }} disabled={applySubmitting} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">취소</button>
                    <button type="submit" disabled={applySubmitting} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{applySubmitting ? '접수 중...' : '지원 접수'}</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-sm text-gray-500">
          본 공고는 HR AI Agent 채용 시스템을 통해 공개된 페이지입니다.
        </p>
      </div>
    </div>
  );
}
