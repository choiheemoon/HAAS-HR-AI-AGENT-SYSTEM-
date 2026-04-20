'use client';

import { Clock, Calendar, CheckCircle } from 'lucide-react';

export default function AttendancePage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">오늘 출근</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">45명</p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">지각</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">2명</p>
            </div>
            <Clock className="w-12 h-12 text-yellow-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">휴가 신청 대기</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">5건</p>
            </div>
            <Calendar className="w-12 h-12 text-blue-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">근태 현황</h2>
        <div className="text-center py-12 text-gray-500">
          근태 현황이 여기에 표시됩니다.
        </div>
      </div>
    </div>
  );
}
