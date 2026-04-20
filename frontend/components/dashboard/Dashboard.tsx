'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  Users,
  Briefcase,
  TrendingUp,
  DollarSign,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';

interface DashboardData {
  total_employees: number;
  new_hires_this_month: number;
  turnover_rate: number;
  average_salary: number;
  active_job_postings: number;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await apiClient.getDashboard();
        setData(response.data);
      } catch (error: any) {
        console.error('Dashboard load error:', error);
        // 오류 발생 시 기본값 설정
        setData({
          total_employees: 0,
          new_hires_this_month: 0,
          turnover_rate: 0,
          average_salary: 0,
          active_job_postings: 0
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">{t('dashboard.error.loadFailed')}</div>
      </div>
    );
  }

  const stats = [
    {
      label: t('dashboard.stats.totalEmployees'),
      value: data.total_employees,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      label: t('dashboard.stats.newHiresThisMonth'),
      value: data.new_hires_this_month,
      icon: Briefcase,
      color: 'bg-green-500',
    },
    {
      label: t('dashboard.stats.turnoverRate'),
      value: `${data.turnover_rate}%`,
      icon: TrendingUp,
      color: 'bg-yellow-500',
    },
    {
      label: t('dashboard.stats.averageSalary'),
      value: formatCurrency(data.average_salary),
      icon: DollarSign,
      color: 'bg-purple-500',
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-lg shadow p-4 md:p-6 border border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-xs md:text-sm font-medium text-gray-600">
                    {stat.label}
                  </p>
                  <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1 md:mt-2">
                    {stat.value}
                  </p>
                </div>
                <div className={`${stat.color} p-2 md:p-3 rounded-lg flex-shrink-0 ml-2`}>
                  <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{t('dashboard.recentActivity.title')}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">{t('dashboard.recentActivity.newApplications')}</span>
              <span className="font-medium">{t('dashboard.count.withUnit', '5 items').replace('{count}', '5')}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">{t('dashboard.recentActivity.payrollCompleted')}</span>
              <span className="font-medium">{t('dashboard.count.withUnit', '12 items').replace('{count}', '12')}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">{t('dashboard.recentActivity.leavePending')}</span>
              <span className="font-medium">{t('dashboard.count.withUnit', '3 items').replace('{count}', '3')}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{t('dashboard.activeHiring.title')}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">{t('dashboard.activeHiring.backendDeveloper')}</span>
              <span className="text-sm text-gray-500">{t('dashboard.count.applicants').replace('{count}', '5')}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-600">{t('dashboard.activeHiring.frontendDeveloper')}</span>
              <span className="text-sm text-gray-500">{t('dashboard.count.applicants').replace('{count}', '8')}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">{t('dashboard.activeHiring.aiEngineer')}</span>
              <span className="text-sm text-gray-500">{t('dashboard.count.applicants').replace('{count}', '3')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
