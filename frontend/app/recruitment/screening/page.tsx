'use client';

import { useState, useEffect } from 'react';
import { FileSearch, Star, CheckCircle, XCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function RecruitmentScreeningPage() {
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
          const appResponse = await apiClient.getApplications(job.id, 'screening');
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

  const handleEvaluate = async (applicationId: number, score: number, status: string) => {
    try {
      await apiClient.evaluateApplication(applicationId, {
        score,
        notes: '',
        status
      });
      alert('평가가 완료되었습니다.');
      loadApplications();
    } catch (error: any) {
      alert(error.response?.data?.detail || '평가 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">서류 심사 대상</h2>

        {loading ? (
          <div className="text-center py-12">로딩 중...</div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 text-gray-500">심사 대상 지원서가 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <div key={app.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{app.applicant?.name || '이름 없음'}</h3>
                    <p className="text-sm text-gray-600">{app.applicant?.email}</p>
                    {app.applicant?.ai_match_score && (
                      <div className="flex items-center mt-2">
                        <Star className="w-4 h-4 text-yellow-500 mr-1" />
                        <span className="text-sm">AI 매칭: {app.applicant.ai_match_score.toFixed(1)}점</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEvaluate(app.id, 85, 'interview_scheduled')}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center space-x-1"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>합격</span>
                    </button>
                    <button
                      onClick={() => handleEvaluate(app.id, 50, 'rejected')}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex items-center space-x-1"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>불합격</span>
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
