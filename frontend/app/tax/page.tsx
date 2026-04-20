'use client';

import { Receipt, Calculator, FileCheck } from 'lucide-react';

export default function TaxPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">이번 달 원천세</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">₩12,500,000</p>
            </div>
            <Calculator className="w-12 h-12 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">연말정산 완료</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">45명</p>
            </div>
            <Receipt className="w-12 h-12 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">세금 신고서</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">12건</p>
            </div>
            <FileCheck className="w-12 h-12 text-purple-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">세금 계산 내역</h2>
        <div className="text-center py-12 text-gray-500">
          세금 계산 내역이 여기에 표시됩니다.
        </div>
      </div>
    </div>
  );
}
