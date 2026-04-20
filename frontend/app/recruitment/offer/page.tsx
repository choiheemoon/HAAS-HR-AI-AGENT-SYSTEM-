'use client';

import { useState, useEffect } from 'react';
import { Award, FileText, Send } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function RecruitmentOfferPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getJobPostings('published');
      const jobPostings = response.data || [];
      
      const allApplications: any[] = [];
      for (const job of jobPostings) {
        try {
          const appResponse = await apiClient.getApplications(job.id, 'interview_completed');
          if (appResponse.data) {
            allApplications.push(...appResponse.data);
          }
        } catch (error) {
          console.error(`공고 ${job.id}의 지원서 로드 오류:`, error);
        }
      }
      setApplications(allApplications);
    } catch (error) {
      console.error('지원서 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOffer = async (applicationId: number) => {
    if (!confirm('제안서를 발행하시겠습니까?')) return;
    
    try {
      await apiClient.createOfferLetter(applicationId, {
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
      loadApplications();
    } catch (error: any) {
      alert(error.response?.data?.detail || '제안서 발행 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">제안서 발행 대상</h2>

        {loading ? (
          <div className="text-center py-12">로딩 중...</div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 text-gray-500">제안서 발행 대상이 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <div key={app.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{app.applicant?.name || '이름 없음'}</h3>
                    <p className="text-sm text-gray-600">{app.applicant?.email}</p>
                    {app.screening_score && (
                      <p className="text-sm text-gray-600 mt-1">평가 점수: {app.screening_score}점</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleCreateOffer(app.id)}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm flex items-center space-x-1"
                  >
                    <FileText className="w-4 h-4" />
                    <span>제안서 발행</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
