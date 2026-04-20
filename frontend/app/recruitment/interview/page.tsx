'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, Mail, CheckCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';

export default function RecruitmentInterviewPage() {
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
          const appResponse = await apiClient.getApplications(job.id, 'interview_scheduled');
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

  const handleSendInterviewSchedule = async (applicationId: number) => {
    try {
      await apiClient.sendCommunication(applicationId, {
        message_type: 'email',
        message: '면접 일정을 안내드립니다. 일정: 2026년 1월 20일 오후 2시',
        subject: '면접 일정 안내'
      });
      alert('면접 일정이 전송되었습니다.');
    } catch (error: any) {
      alert(error.response?.data?.detail || '전송 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">면접 예정 목록</h2>

        {loading ? (
          <div className="text-center py-12">로딩 중...</div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 text-gray-500">면접 예정인 지원자가 없습니다.</div>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <div key={app.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{app.applicant?.name || '이름 없음'}</h3>
                    <p className="text-sm text-gray-600">{app.applicant?.email}</p>
                    {app.interview_scheduled_at && (
                      <div className="flex items-center mt-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4 mr-1" />
                        <span>면접 일정: {new Date(app.interview_scheduled_at).toLocaleDateString('ko-KR')}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleSendInterviewSchedule(app.id)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center space-x-1"
                  >
                    <Mail className="w-4 h-4" />
                    <span>일정 전송</span>
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
