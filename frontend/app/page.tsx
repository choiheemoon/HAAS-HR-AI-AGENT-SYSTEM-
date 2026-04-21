'use client';

import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { X, Briefcase, Users, Clock, DollarSign, FileText, BarChart3, Receipt, LayoutDashboard, Bot, FileEdit, CheckCircle2, Send, UserPlus, FileSearch, Calendar, Award, Languages, FileSignature, ClipboardList, Search, Building2, UserCog, Shield, Share2, Link2, Database, MapPin, UsersRound, Contact, SlidersHorizontal, Calculator, Table2, LayoutList, Timer } from 'lucide-react';
import Dashboard from '@/components/dashboard/Dashboard';
import RecruitmentPage from '@/app/recruitment/page';
import RecruitmentRequestPage from '@/app/recruitment/request/page';
import RecruitmentApprovalPage from '@/app/recruitment/approval/page';
import RecruitmentPublishPage from '@/app/recruitment/publish/page';
import RecruitmentApplicationsPage from '@/app/recruitment/applications/page';
import RecruitmentApplicationListPage from '@/app/recruitment/application-list/page';
import RecruitmentScreeningPage from '@/app/recruitment/screening/page';
import RecruitmentInterviewPage from '@/app/recruitment/interview/page';
import RecruitmentOfferPage from '@/app/recruitment/offer/page';
import RecruitmentSignaturePage from '@/app/recruitment/signature/page';
import EmployeesPage from '@/app/employees/page';
import { HrMasterInquiryPage } from '@/components/employees/HrMasterInquiryScreen';
import CareerInquiryPage from '@/app/employees/career-inquiry/page';
import DependentInquiryPage from '@/app/employees/dependent-inquiry/page';
import EducationInquiryPage from '@/app/employees/education-inquiry/page';
import HrMasterCertificationInquiryPage from '@/app/employees/certification-inquiry/page';
import HrMasterFamilyInquiryPage from '@/app/employees/family-inquiry/page';
import HrMasterAddressInquiryPage from '@/app/employees/address-inquiry/page';
import LanguageInquiryPage from '@/app/employees/language-inquiry/page';
import PersonnelRecordCardPage from '@/app/employees/personnel-record-card/page';
import PersonnelRecordCardHistoryPage from '@/app/employees/personnel-record-card-history/page';
import AttendancePage from '@/app/attendance/page';
import AttendanceStandardManagePage from '@/app/attendance/standard-manage/page';
import AttendanceMasterManagePage from '@/app/attendance/master-manage/page';
import AttendanceAnnualManagePage from '@/app/attendance/annual-manage/page';
import AttendanceInquiryPage from '@/app/attendance/inquiry/page';
import AttendanceAdditionalOtManagePage from '@/app/attendance/additional-ot-manage/page';
import AttendanceOverviewPage from '@/app/attendance/overview/page';
import AttendanceReportPage from '@/app/attendance/report/page';
import AttendanceAggregatePage from '@/app/attendance/aggregate/page';
import AttendanceStatusInquiryPage from '@/app/attendance/status-inquiry/page';
import AttendanceAllowanceStatusInquiryPage from '@/app/attendance/allowance-status-inquiry/page';
import AttendanceOtAllowanceReportPage from '@/app/attendance/ot-allowance-report/page';
import AttendancePayrollBucketAggregatePage from '@/app/attendance/payroll-bucket-aggregate/page';
import AttendancePayrollBucketStatusPage from '@/app/attendance/payroll-bucket-status/page';
import AttendancePayrollBucketStatusPeriodPage from '@/app/attendance/payroll-bucket-status-period/page';
import AttendanceWorkCalendarManagePage from '@/app/attendance/work-calendar-manage/page';
import AttendanceLeaveManagePage from '@/app/attendance/leave-manage/page';
import AttendanceLeaveStatusPage from '@/app/attendance/leave-status/page';
import PayrollPage from '@/app/payroll/page';
import PayslipPage from '@/app/payslip/page';
import ReportsPage from '@/app/reports/page';
import TaxPage from '@/app/tax/page';
import CompanyManagePage from '@/app/tax/company-manage/page';
import EmployeeTypeManagePage from '@/app/tax/employee-type-manage/page';
import MajorCodeManagePage from '@/app/master/major-code-manage/page';
import MinorCodeManagePage from '@/app/master/minor-code-manage/page';
import HrMasterReferenceManagePage from '@/app/employees/hr-master-reference-manage/page';
import HrMasterReportPage from '@/app/employees/hr-report/page';
import SystemUsersPage from '@/app/system/users/page';
import SystemRoleGroupsPage from '@/app/system/role-groups/page';
import SystemRoleGroupMenusPage from '@/app/system/role-group-menus/page';
import SystemUserCompaniesPage from '@/app/system/user-companies/page';
import SystemTemplateGenerationPage from '@/app/system/template-generation/page';
import ChatPage from '@/app/chat/page';
import { TabDataProvider } from '@/contexts/TabDataContext';
import { useI18n } from '@/contexts/I18nContext';
import { getUser, userHasElevatedAccess } from '@/lib/auth';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';

const tabComponents: { [key: string]: React.ComponentType } = {
  dashboard: Dashboard,
  recruitment: RecruitmentPage,
  'recruitment-request': RecruitmentRequestPage,
  'recruitment-approval': RecruitmentApprovalPage,
  'recruitment-publish': RecruitmentPublishPage,
  'recruitment-applications': RecruitmentApplicationsPage,
  'recruitment-application-list': RecruitmentApplicationListPage,
  'recruitment-screening': RecruitmentScreeningPage,
  'recruitment-interview': RecruitmentInterviewPage,
  'recruitment-offer': RecruitmentOfferPage,
  'recruitment-signature': RecruitmentSignaturePage,
  employees: EmployeesPage,
  'hr-master-manage': EmployeesPage,
  'hr-master-report': HrMasterReportPage,
  'hr-master-inquiry': HrMasterInquiryPage,
  'career-inquiry': CareerInquiryPage,
  'dependent-inquiry': DependentInquiryPage,
  'education-inquiry': EducationInquiryPage,
  'hr-master-certification-inquiry': HrMasterCertificationInquiryPage,
  'hr-master-family-inquiry': HrMasterFamilyInquiryPage,
  'hr-master-address-inquiry': HrMasterAddressInquiryPage,
  'hr-master-language-inquiry': LanguageInquiryPage,
  'hr-personnel-record-card': PersonnelRecordCardPage,
  'hr-personnel-record-card-history': PersonnelRecordCardHistoryPage,
  attendance: AttendancePage,
  'attendance-standard-manage': AttendanceStandardManagePage,
  'attendance-master-manage': AttendanceMasterManagePage,
  'attendance-annual-manage': AttendanceAnnualManagePage,
  'attendance-leave-manage': AttendanceLeaveManagePage,
  'attendance-leave-status': AttendanceLeaveStatusPage,
  'attendance-inquiry': AttendanceInquiryPage,
  'attendance-additional-ot-manage': AttendanceAdditionalOtManagePage,
  'attendance-overview': AttendanceOverviewPage,
  'attendance-report': AttendanceReportPage,
  'attendance-aggregate': AttendanceAggregatePage,
  'attendance-status-inquiry': AttendanceStatusInquiryPage,
  'attendance-allowance-status-inquiry': AttendanceAllowanceStatusInquiryPage,
  'attendance-ot-allowance-report': AttendanceOtAllowanceReportPage,
  'attendance-payroll-bucket-aggregate': AttendancePayrollBucketAggregatePage,
  'attendance-payroll-bucket-status': AttendancePayrollBucketStatusPage,
  'attendance-payroll-bucket-status-period': AttendancePayrollBucketStatusPeriodPage,
  'attendance-work-calendar-manage': AttendanceWorkCalendarManagePage,
  payroll: PayrollPage,
  payslip: PayslipPage,
  reports: ReportsPage,
  tax: TaxPage,
  'tax-company-manage': CompanyManagePage,
  'tax-employee-type-manage': EmployeeTypeManagePage,
  'master-major-code-manage': MajorCodeManagePage,
  'master-minor-code-manage': MinorCodeManagePage,
  'hr-master-reference-manage': HrMasterReferenceManagePage,
  'system-users': SystemUsersPage,
  'system-user-companies': SystemUserCompaniesPage,
  'system-role-groups': SystemRoleGroupsPage,
  'system-role-group-menus': SystemRoleGroupMenusPage,
  'system-template-generation': SystemTemplateGenerationPage,
  chat: ChatPage,
};

const tabLabels: { [key: string]: { labelKey: string; icon: any; step?: number } } = {
  dashboard: { labelKey: 'menu.dashboard', icon: LayoutDashboard },
  recruitment: { labelKey: 'menu.recruitment', icon: Briefcase },
  'recruitment-request': { labelKey: 'recruitment.request', icon: FileEdit, step: 1 },
  'recruitment-approval': { labelKey: 'recruitment.approval', icon: CheckCircle2, step: 2 },
  'recruitment-publish': { labelKey: 'recruitment.publish', icon: Send, step: 3 },
  'recruitment-applications': { labelKey: 'recruitment.applications', icon: UserPlus, step: 4 },
  'recruitment-application-list': { labelKey: 'recruitment.applicationList', icon: FileText },
  'recruitment-screening': { labelKey: 'recruitment.screening', icon: FileSearch, step: 5 },
  'recruitment-interview': { labelKey: 'recruitment.interview', icon: Calendar, step: 6 },
  'recruitment-offer': { labelKey: 'recruitment.offer', icon: Award, step: 7 },
  'recruitment-signature': { labelKey: 'recruitment.signature', icon: FileSignature, step: 8 },
  employees: { labelKey: 'menu.employees', icon: Users },
  'hr-master-manage': { labelKey: 'menu.hrMasterManage', icon: ClipboardList },
  'hr-master-report': { labelKey: 'menu.hrMasterReport', icon: BarChart3 },
  'hr-master-inquiry': { labelKey: 'menu.hrMasterInquiry', icon: Search },
  'career-inquiry': { labelKey: 'menu.careerInquiry', icon: Search },
  'dependent-inquiry': { labelKey: 'menu.dependentInquiry', icon: Search },
  'education-inquiry': { labelKey: 'menu.educationInquiry', icon: Search },
  'hr-master-certification-inquiry': { labelKey: 'menu.hrMasterCertificationInquiry', icon: Award },
  'hr-master-family-inquiry': { labelKey: 'menu.familyInquiry', icon: UsersRound },
  'hr-master-address-inquiry': { labelKey: 'menu.hrMasterAddressInquiry', icon: MapPin },
  'hr-master-language-inquiry': { labelKey: 'menu.hrMasterLanguageInquiry', icon: Languages },
  'hr-personnel-record-card': { labelKey: 'menu.personnelRecordCard', icon: Contact },
  'hr-personnel-record-card-history': { labelKey: 'menu.personnelRecordCardHistory', icon: Search },
  'hr-master-reference-manage': { labelKey: 'menu.hrMasterReferenceManage', icon: Database },
  attendance: { labelKey: 'menu.attendance', icon: Clock },
  'attendance-standard-manage': { labelKey: 'menu.attendanceStandardManage', icon: SlidersHorizontal },
  'attendance-master-manage': { labelKey: 'menu.attendanceMasterManage', icon: Contact },
  'attendance-annual-manage': { labelKey: 'menu.attendanceAnnualManage', icon: ClipboardList },
  'attendance-leave-manage': { labelKey: 'menu.attendanceLeaveManage', icon: ClipboardList },
  'attendance-leave-status': { labelKey: 'menu.attendanceLeaveStatus', icon: Table2 },
  'attendance-inquiry': { labelKey: 'menu.attendanceInquiry', icon: Search },
  'attendance-additional-ot-manage': { labelKey: 'menu.attendanceAdditionalOtManage', icon: Timer },
  'attendance-overview': { labelKey: 'menu.attendanceOverview', icon: Table2 },
  'attendance-report': { labelKey: 'menu.attendanceReport', icon: BarChart3 },
  'attendance-aggregate': { labelKey: 'menu.attendanceAggregate', icon: Calculator },
  'attendance-status-inquiry': { labelKey: 'menu.attendanceStatusInquiry', icon: Table2 },
  'attendance-allowance-status-inquiry': { labelKey: 'menu.attendanceAllowanceStatusInquiry', icon: LayoutList },
  'attendance-ot-allowance-report': { labelKey: 'menu.attendanceOtAllowanceReport', icon: BarChart3 },
  'attendance-payroll-bucket-aggregate': { labelKey: 'menu.attendancePayrollBucketAggregate', icon: Calculator },
  'attendance-payroll-bucket-status': { labelKey: 'menu.attendancePayrollBucketStatus', icon: Table2 },
  'attendance-payroll-bucket-status-period': { labelKey: 'menu.attendancePayrollBucketStatusPeriod', icon: Table2 },
  'attendance-work-calendar-manage': { labelKey: 'menu.attendanceWorkCalendarManage', icon: Calendar },
  payroll: { labelKey: 'menu.payroll', icon: DollarSign },
  payslip: { labelKey: 'menu.payslip', icon: FileText },
  reports: { labelKey: 'menu.reports', icon: BarChart3 },
  tax: { labelKey: 'menu.tax', icon: Receipt },
  'tax-company-manage': { labelKey: 'menu.companyManage', icon: Building2 },
  'tax-employee-type-manage': { labelKey: 'menu.employeeTypeManage', icon: FileEdit },
  'master-major-code-manage': { labelKey: 'menu.majorCodeManage', icon: FileEdit },
  'master-minor-code-manage': { labelKey: 'menu.minorCodeManage', icon: FileEdit },
  'system-users': { labelKey: 'menu.systemUsers', icon: UserCog },
  'system-user-companies': { labelKey: 'menu.systemUserCompanies', icon: Link2 },
  'system-role-groups': { labelKey: 'menu.systemRoleGroups', icon: Shield },
  'system-role-group-menus': { labelKey: 'menu.systemRoleGroupMenus', icon: Share2 },
  'system-template-generation': { labelKey: 'menu.systemTemplateGeneration', icon: Database },
  chat: { labelKey: 'header.aiAssistant', icon: Bot },
};

interface Tab {
  id: string;
  key: string;
  label: string;
  icon: any;
}

function HomeContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { canReadTab, loading: permLoading } = useMenuPermissions();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // 현재 URL의 tab 파라미터 값 추출
  const currentTabKey = searchParams?.get('tab') || 'dashboard';

  // 탭 추가 함수
  const addTab = useCallback((tabKey: string) => {
    if (!tabKey || !tabLabels[tabKey]) return;

    setTabs((prevTabs) => {
      // 이미 존재하는 탭인지 확인
      const existingTab = prevTabs.find((tab) => tab.key === tabKey);
      if (existingTab) {
        // 이미 존재하면 해당 탭을 활성화
        setActiveTabId(existingTab.id);
        return prevTabs;
      }

      // 새 탭 생성
      const newTab: Tab = {
        id: `${tabKey}-${Date.now()}`,
        key: tabKey,
        label: `${tabLabels[tabKey].step ? `${tabLabels[tabKey].step}. ` : ''}${t(tabLabels[tabKey].labelKey)}`,
        icon: tabLabels[tabKey].icon,
      };

      const newTabs = [...prevTabs, newTab];
      setActiveTabId(newTab.id);
      return newTabs;
    });
  }, [t]);

  // URL·권한 반영: 시스템 메뉴 / 메뉴 조회 권한 없으면 대시보드로
  useEffect(() => {
    const tabKey = currentTabKey || 'dashboard';
    const u = getUser();
    if (tabKey.startsWith('system-') && !userHasElevatedAccess(u)) {
      router.replace('/?tab=dashboard', { scroll: false });
      return;
    }
    if (permLoading) {
      if (tabKey === 'dashboard' && tabLabels.dashboard) addTab('dashboard');
      return;
    }
    if (!canReadTab(tabKey)) {
      router.replace('/?tab=dashboard', { scroll: false });
      return;
    }
    if (tabLabels[tabKey]) addTab(tabKey);
  }, [currentTabKey, router, permLoading, canReadTab, addTab]);

  // 탭 제거 함수
  const removeTab = useCallback((tabId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    setTabs((prevTabs) => {
      const newTabs = prevTabs.filter((tab) => tab.id !== tabId);
      
      // 제거된 탭이 활성 탭이었다면 다른 탭 활성화
      if (activeTabId === tabId) {
        if (newTabs.length > 0) {
          const lastTab = newTabs[newTabs.length - 1];
          setActiveTabId(lastTab.id);
          router.replace(`/?tab=${lastTab.key}`, { scroll: false });
        } else {
          // 탭이 없으면 대시보드 추가
          setActiveTabId(null);
          router.replace('/?tab=dashboard', { scroll: false });
        }
      }
      
      return newTabs;
    });
  }, [activeTabId, router]);

  // 탭 전환 함수
  const switchTab = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      // URL 업데이트 (replace로 히스토리 스택 쌓이지 않도록)
      router.replace(`/?tab=${tab.key}`, { scroll: false });
    }
  }, [tabs, router]);

  // 활성 탭 정보
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const ActiveComponent = activeTab ? tabComponents[activeTab.key] : null;

  // 모든 탭 컴포넌트를 렌더링하되, 활성 탭만 표시 (데이터 캐싱을 위해 언마운트하지 않음)
  const renderedTabs = useMemo(() => {
    return tabs.map((tab) => {
      const Component = tabComponents[tab.key];
      if (!Component) return null;

      return (
        <div
          key={tab.id}
          className={activeTabId === tab.id ? 'block' : 'hidden'}
          style={{ display: activeTabId === tab.id ? 'block' : 'none' }}
        >
          <Component />
        </div>
      );
    });
  }, [tabs, activeTabId]);

  return (
    <TabDataProvider>
      <div className="space-y-4">
        {/* 동적 탭 메뉴 */}
        {tabs.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="border-b border-gray-200 px-4">
              <nav className="flex -mb-px space-x-1 overflow-x-auto">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTabId === tab.id;
                  return (
                    <div
                      key={tab.id}
                      onClick={() => switchTab(tab.id)}
                      className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer group ${
                        isActive
                          ? 'border-primary-600 text-primary-600 bg-primary-50'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="whitespace-nowrap">{tab.label}</span>
                      {tabs.length > 1 && (
                        <button
                          onClick={(e) => removeTab(tab.id, e)}
                          className="ml-1 p-0.5 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                          title={t('tabs.close')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* 탭 컨텐츠 */}
        <div className="min-h-[600px]">
          {ActiveComponent ? (
            renderedTabs
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">{t('tabs.empty')}</div>
            </div>
          )}
        </div>
      </div>
    </TabDataProvider>
  );
}

export default function Home() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-500">{t('common.loading')}</div></div>}>
      <HomeContent />
    </Suspense>
  );
}
