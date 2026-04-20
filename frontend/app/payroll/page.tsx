'use client';

import { DollarSign, Calculator, FileText } from 'lucide-react';

export default function PayrollPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">이번 달 급여 총액</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">₩125,000,000</p>
            </div>
            <DollarSign className="w-12 h-12 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">급여 계산 완료</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">45명</p>
            </div>
            <Calculator className="w-12 h-12 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">명세서 발급</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">45건</p>
            </div>
            <FileText className="w-12 h-12 text-purple-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">급여 목록</h2>
        <div className="text-center py-12 text-gray-500">
          급여 목록이 여기에 표시됩니다.
        </div>
      </div>
    </div>
  );
}
