'use client';

import { useState, useEffect } from 'react';
import { Send, Globe, Link2 } from 'lucide-react';
import { apiClient } from '@/lib/api';

/** 배포 가능한 채용 사이트 목록 */
const JOB_SITE_OPTIONS = [
  { id: 'saramin', label: '사람인', name: '사람인' },
  { id: 'jobkorea', label: '잡코리아', name: '잡코리아' },
  { id: 'incruit', label: '인크루트', name: '인크루트' },
];

export default function RecruitmentPublishPage() {
  const [jobPostings, setJobPostings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [generatingUrlId, setGeneratingUrlId] = useState<number | null>(null);
  const [selectedSites, setSelectedSites] = useState<string[]>(JOB_SITE_OPTIONS.map((o) => o.name));

  useEffect(() => {
    loadJobPostings();
  }, []);

  const loadJobPostings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getJobPostings('approved');
      setJobPostings(response.data || []);
    } catch (error) {
      console.error('채용 공고 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSite = (name: string) => {
    setSelectedSites((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  };

  const handlePublish = async (job: any) => {
    const sitesToUse = selectedSites.length > 0 ? selectedSites : JOB_SITE_OPTIONS.map((o) => o.name);
    if (!confirm(`선택한 채용 사이트(${sitesToUse.join(', ')})로 이 공고를 배포하시겠습니까?`)) return;

    setPublishingId(job.id);
    try {
      await apiClient.publishJobPosting(job.id, sitesToUse);
      alert(`배포되었습니다. (${sitesToUse.join(', ')})`);
      loadJobPostings();
    } catch (error: any) {
      alert(error.response?.data?.detail || '배포 중 오류가 발생했습니다.');
    } finally {
      setPublishingId(null);
    }
  };

  const handleGeneratePublicUrl = async (job: any) => {
    setGeneratingUrlId(job.id);
    try {
      const res = await apiClient.generatePublicJobUrl(job.id);
      const url = res.data?.public_url;
      if (url) {
        await navigator.clipboard.writeText(url);
        alert(`공개 URL이 클립보드에 복사되었습니다.\n\n${url}\n\n이 링크로 누구나 채용 공고를 볼 수 있습니다.`);
      } else {
        alert('공개 URL 생성에 실패했습니다.');
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      let msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d?.msg || d).join(', ') : null;
      if (!msg) msg = '공개 URL 생성 중 오류가 발생했습니다.';
      if (error.response?.status === 404 && msg === 'Not Found') {
        msg = 'API 경로를 찾을 수 없습니다. 백엔드 서버(port 8000)를 재시작한 뒤 다시 시도하세요. DB에 public_slug 컬럼이 없다면 add_public_slug.sql 을 실행하세요.';
      }
      alert(msg);
    } finally {
      setGeneratingUrlId(null);
    }
  };

  const titleDisplay = (job: any) =>
    job.title || job.recruitment_fields?.[0] || `공고 #${job.id}`;
  const subDisplay = (job: any) => {
    const parts = [];
    if (job.department) parts.push(job.department);
    if (job.position) parts.push(job.position);
    if (job.recruitment_fields?.length) parts.push(job.recruitment_fields.join(', '));
    if (job.job_role) parts.push(job.job_role);
    return parts.length ? parts.join(' · ') : null;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-2">배포 방식</h2>
        <p className="text-sm text-gray-500 mb-2">
          <strong>채용 사이트 배포:</strong> 아래 선택한 사이트(사람인, 잡코리아 등)로 공고를 배포합니다.
        </p>
        <p className="text-sm text-gray-500 mb-4">
          <strong>웹 배포(공개 URL):</strong> 「공개 URL」 버튼을 누르면 로그인 없이 볼 수 있는 링크가 생성되며, 클립보드에 복사됩니다. SNS·이메일 등으로 공유할 수 있습니다.
        </p>
        <h3 className="text-lg font-semibold mb-2">배포할 채용 사이트 선택</h3>
        <div className="flex flex-wrap gap-4 mb-6">
          {JOB_SITE_OPTIONS.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedSites.includes(opt.name)}
                onChange={() => toggleSite(opt.name)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Globe className="w-4 h-4 text-gray-500" />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>

        <h2 className="text-xl font-semibold mb-4">승인된 채용 공고</h2>

        {loading ? (
          <div className="text-center py-12">로딩 중...</div>
        ) : jobPostings.length === 0 ? (
          <div className="text-center py-12 text-gray-500">배포할 채용 공고가 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {jobPostings.map((job) => (
              <div key={job.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{titleDisplay(job)}</h3>
                    {subDisplay(job) && (
                      <p className="text-sm text-gray-600">{subDisplay(job)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleGeneratePublicUrl(job)}
                      disabled={generatingUrlId === job.id}
                      className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center space-x-2"
                      title="웹 공개 URL 생성 후 클립보드에 복사"
                    >
                      {generatingUrlId === job.id ? (
                        <span>생성 중...</span>
                      ) : (
                        <>
                          <Link2 className="w-4 h-4" />
                          <span>공개 URL</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handlePublish(job)}
                      disabled={publishingId === job.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
                    >
                      {publishingId === job.id ? (
                        <span>배포 중...</span>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>배포</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
