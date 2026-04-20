'use client';

import { useState, useEffect } from 'react';
import { FileSignature, CheckCircle, Clock } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function RecruitmentSignaturePage() {
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
          const appResponse = await apiClient.getApplications(job.id, 'offered');
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

  const handleAcceptOffer = async (applicationId: number) => {
    if (!confirm('제안서를 수락하고 전자 서명하시겠습니까?')) return;
    
    try {
      await apiClient.acceptOffer(applicationId, {
        signature: '전자 서명 데이터',
        signed_at: new Date().toISOString()
      });
      alert('제안서가 수락되었습니다.');
      loadApplications();
    } catch (error: any) {
      alert(error.response?.data?.detail || '제안서 수락 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">제안서 발행 목록</h2>

        {loading ? (
          <div className="text-center py-12">로딩 중...</div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 text-gray-500">발행된 제안서가 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <div key={app.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{app.applicant?.name || '이름 없음'}</h3>
                    <p className="text-sm text-gray-600">{app.applicant?.email}</p>
                    {app.offer_accepted ? (
                      <div className="flex items-center mt-2 text-sm text-green-600">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        <span>수락 완료</span>
                        {app.offer_accepted_at && (
                          <span className="ml-2 text-gray-500">
                            ({new Date(app.offer_accepted_at).toLocaleDateString('ko-KR')})
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center mt-2 text-sm text-yellow-600">
                        <Clock className="w-4 h-4 mr-1" />
                        <span>수락 대기 중</span>
                      </div>
                    )}
                  </div>
                  {!app.offer_accepted && (
                    <button
                      onClick={() => handleAcceptOffer(app.id)}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center space-x-1"
                    >
                      <FileSignature className="w-4 h-4" />
                      <span>수락 및 서명</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
