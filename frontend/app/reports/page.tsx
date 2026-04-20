'use client';

import { BarChart3, TrendingUp, Users } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <BarChart3 className="w-12 h-12 text-blue-500 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">이직률 분석</h3>
          <p className="text-gray-600 text-sm">부서별, 직급별 이직률을 분석합니다</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <TrendingUp className="w-12 h-12 text-green-500 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">채용 지표</h3>
          <p className="text-gray-600 text-sm">채용 기간, 채용 비용 등을 분석합니다</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <Users className="w-12 h-12 text-purple-500 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">인력 현황</h3>
          <p className="text-gray-600 text-sm">부서별, 직급별 인력 현황을 조회합니다</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">리포트 차트</h2>
        <div className="text-center py-12 text-gray-500">
          리포트 차트가 여기에 표시됩니다.
        </div>
      </div>
    </div>
  );
}
