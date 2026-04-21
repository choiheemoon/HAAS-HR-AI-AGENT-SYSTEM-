'use client';

import { useState, Suspense, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Clock,
  DollarSign,
  FileText,
  BarChart3,
  Receipt,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  FileEdit,
  CheckCircle2,
  Send,
  UserPlus,
  FileSearch,
  ClipboardCheck,
  Calendar,
  Award,
  Languages,
  FileSignature,
  ClipboardList,
  Search,
  Building2,
  Database,
  Settings,
  UserCog,
  Shield,
  Share2,
  Link2,
  MapPin,
  UsersRound,
  Contact,
  SlidersHorizontal,
  Calculator,
  Table2,
  LayoutList,
  PanelLeftClose,
  PanelLeftOpen,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { getUser, setUser, userHasElevatedAccess, type User } from '@/lib/auth';
import { apiClient } from '@/lib/api';
import { useMenuPermissions } from '@/contexts/MenuPermissionContext';

const employeesSubMenus = [
  { labelKey: 'menu.hrMasterManage', tab: 'hr-master-manage', icon: ClipboardList },
  { labelKey: 'menu.hrMasterInquiry', tab: 'hr-master-inquiry', icon: Search },
  { labelKey: 'menu.careerInquiry', tab: 'career-inquiry', icon: Search },
  { labelKey: 'menu.dependentInquiry', tab: 'dependent-inquiry', icon: Search },
  { labelKey: 'menu.educationInquiry', tab: 'education-inquiry', icon: Search },
  { labelKey: 'menu.hrMasterCertificationInquiry', tab: 'hr-master-certification-inquiry', icon: Award },
  { labelKey: 'menu.familyInquiry', tab: 'hr-master-family-inquiry', icon: UsersRound },
  { labelKey: 'menu.hrMasterAddressInquiry', tab: 'hr-master-address-inquiry', icon: MapPin },
  { labelKey: 'menu.hrMasterLanguageInquiry', tab: 'hr-master-language-inquiry', icon: Languages },
  { labelKey: 'menu.personnelRecordCard', tab: 'hr-personnel-record-card', icon: Contact },
  { labelKey: 'menu.personnelRecordCardHistory', tab: 'hr-personnel-record-card-history', icon: Search },
  { labelKey: 'menu.hrMasterReport', tab: 'hr-master-report', icon: BarChart3 },
  { labelKey: 'menu.hrMasterReferenceManage', tab: 'hr-master-reference-manage', icon: Database },
];

const masterDataSubMenus = [
  { labelKey: 'menu.companyManage', tab: 'tax-company-manage', icon: Building2 },
  { labelKey: 'menu.majorCodeManage', tab: 'master-major-code-manage', icon: FileEdit },
  { labelKey: 'menu.minorCodeManage', tab: 'master-minor-code-manage', icon: FileEdit },
];

const systemSubMenus = [
  { labelKey: 'menu.systemUsers', tab: 'system-users', icon: UserCog },
  { labelKey: 'menu.systemUserCompanies', tab: 'system-user-companies', icon: Link2 },
  { labelKey: 'menu.systemRoleGroups', tab: 'system-role-groups', icon: Shield },
  { labelKey: 'menu.systemRoleGroupMenus', tab: 'system-role-group-menus', icon: Share2 },
  { labelKey: 'menu.systemTemplateGeneration', tab: 'system-template-generation', icon: Database },
];

const attendanceSubMenus = [
  { labelKey: 'menu.attendanceMasterManage', tab: 'attendance-master-manage', icon: Contact },
  { labelKey: 'menu.attendanceAnnualManage', tab: 'attendance-annual-manage', icon: ClipboardList },
  { labelKey: 'menu.attendanceLeaveManage', tab: 'attendance-leave-manage', icon: ClipboardList },
  { labelKey: 'menu.attendanceLeaveStatus', tab: 'attendance-leave-status', icon: Table2 },
  { labelKey: 'menu.attendanceInquiry', tab: 'attendance-inquiry', icon: Search },
  { labelKey: 'menu.attendanceAdditionalOtManage', tab: 'attendance-additional-ot-manage', icon: Timer },
  { labelKey: 'menu.attendanceOverview', tab: 'attendance-overview', icon: Table2 },
  { labelKey: 'menu.attendanceReport', tab: 'attendance-report', icon: BarChart3 },
  { labelKey: 'menu.attendanceAggregate', tab: 'attendance-aggregate', icon: Calculator },
  { labelKey: 'menu.attendanceStatusInquiry', tab: 'attendance-status-inquiry', icon: Table2 },
  { labelKey: 'menu.attendanceAllowanceStatusInquiry', tab: 'attendance-allowance-status-inquiry', icon: LayoutList },
  { labelKey: 'menu.attendanceOtAllowanceReport', tab: 'attendance-ot-allowance-report', icon: BarChart3 },
  { labelKey: 'menu.attendancePayrollBucketAggregate', tab: 'attendance-payroll-bucket-aggregate', icon: Calculator },
  { labelKey: 'menu.attendancePayrollBucketStatus', tab: 'attendance-payroll-bucket-status', icon: Table2 },
  { labelKey: 'menu.attendancePayrollBucketStatusPeriod', tab: 'attendance-payroll-bucket-status-period', icon: Table2 },
  { labelKey: 'menu.attendanceWorkCalendarManage', tab: 'attendance-work-calendar-manage', icon: Calendar },
  { labelKey: 'menu.attendanceStandardManage', tab: 'attendance-standard-manage', icon: SlidersHorizontal },
];

const recruitmentSubMenus = [
  { labelKey: 'recruitment.request', tab: 'recruitment-request', icon: FileEdit },
  { labelKey: 'recruitment.approval', tab: 'recruitment-approval', icon: CheckCircle2 },
  { labelKey: 'recruitment.publish', tab: 'recruitment-publish', icon: Send },
  { labelKey: 'recruitment.applications', tab: 'recruitment-applications', icon: UserPlus },
  { labelKey: 'recruitment.applicationList', tab: 'recruitment-application-list', icon: FileText },
  { labelKey: 'recruitment.screening', tab: 'recruitment-screening', icon: FileSearch },
  { labelKey: 'recruitment.interview', tab: 'recruitment-interview', icon: Calendar },
  { labelKey: 'recruitment.offer', tab: 'recruitment-offer', icon: Award },
  { labelKey: 'recruitment.signature', tab: 'recruitment-signature', icon: FileSignature },
];

const menuItems = [
  { href: '/', labelKey: 'menu.dashboard', icon: LayoutDashboard, tab: 'dashboard', subMenus: null },
  { 
    href: '/recruitment', 
    labelKey: 'menu.recruitment', 
    icon: Briefcase, 
    tab: 'recruitment',
    subMenus: recruitmentSubMenus
  },
  {
    href: '/',
    labelKey: 'menu.employees',
    icon: Users,
    tab: 'employees',
    subMenus: employeesSubMenus,
  },
  {
    href: '/attendance',
    labelKey: 'menu.attendance',
    icon: Clock,
    tab: 'attendance',
    subMenus: attendanceSubMenus,
  },
  { href: '/payroll', labelKey: 'menu.payroll', icon: DollarSign, tab: 'payroll', subMenus: null },
  { href: '/', labelKey: 'menu.tax', icon: Receipt, tab: 'tax', subMenus: null },
  {
    href: '/',
    labelKey: 'menu.masterData',
    icon: Database,
    tab: 'master-data',
    subMenus: masterDataSubMenus,
  },
  {
    href: '/',
    labelKey: 'menu.system',
    icon: Settings,
    tab: 'system',
    subMenus: systemSubMenus,
  },
];

function SidebarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  // 로그인 직후에는 서브메뉴가 펼쳐지지 않도록 기본을 모두 접힘으로 둡니다.
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [sessionUser, setSessionUser] = useState<User | null>(() =>
    typeof window !== 'undefined' ? getUser() : null
  );
  const { t } = useI18n();
  const { canReadTab, refresh: refreshMenuPermissions } = useMenuPermissions();

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const local = getUser();
      if (!local) {
        if (!cancelled) setSessionUser(null);
        return;
      }
      try {
        const { data } = await apiClient.getAuthMe();
        const u = data as User;
        setUser(u);
        if (!cancelled) setSessionUser(u);
        void refreshMenuPermissions();
      } catch {
        if (!cancelled) setSessionUser(local);
      }
    };
    void sync();
    return () => {
      cancelled = true;
    };
  }, [refreshMenuPermissions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('layout.sidebarCollapsed');
    if (saved === '1') setIsCollapsed(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('layout.sidebarCollapsed', isCollapsed ? '1' : '0');
  }, [isCollapsed]);

  type MenuItemType = (typeof menuItems)[number];

  const visibleMenuItems = useMemo(() => {
    const canSys = userHasElevatedAccess(sessionUser);
    const base = canSys ? menuItems : menuItems.filter((item) => item.tab !== 'system');

    const out: MenuItemType[] = [];
    for (const item of base) {
      if (item.subMenus && item.subMenus.length > 0) {
        const subs = item.subMenus.filter((sub) => canReadTab(sub.tab));
        if (subs.length === 0) continue;
        out.push({ ...item, subMenus: subs });
        continue;
      }
      if (!canReadTab(item.tab)) continue;
      out.push(item);
    }
    return out;
  }, [sessionUser, canReadTab]);

  const toggleSubMenu = (tab: string) => {
    setExpandedMenus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tab)) {
        newSet.delete(tab);
      } else {
        newSet.add(tab);
      }
      return newSet;
    });
  };

  return (
    <>
      {/* 모바일 햄버거 버튼 */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg"
        aria-label={t('menu.open')}
      >
        {isMobileMenuOpen ? (
          <X className="w-6 h-6 text-gray-700" />
        ) : (
          <Menu className="w-6 h-6 text-gray-700" />
        )}
      </button>

      {/* 모바일 오버레이 */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={cn(
          'fixed md:static inset-y-0 left-0 z-40 w-64 bg-white shadow-lg transform transition-all duration-300 ease-in-out overflow-y-auto',
          isCollapsed ? 'md:w-16' : 'md:w-64',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className={cn('p-4 md:p-6', isCollapsed && 'md:px-2 md:py-4')}>
          <div className={cn('flex items-start', isCollapsed ? 'md:justify-center' : 'justify-between')}>
            {!isCollapsed ? (
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-primary-600">{t('common.appName')}</h1>
                <p className="text-xs md:text-sm text-gray-500 mt-1">{t('common.systemName')}</p>
              </div>
            ) : (
              <div className="hidden md:flex w-8 h-8 rounded bg-primary-50 text-primary-700 items-center justify-center text-xs font-bold">
                HR
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsCollapsed((p) => !p)}
              className="hidden md:inline-flex p-1.5 rounded hover:bg-gray-100 text-gray-600"
              aria-label={isCollapsed ? t('menu.open') : t('menu.close')}
              title={isCollapsed ? t('menu.open') : t('menu.close')}
            >
              {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <nav className="mt-6">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === '/' && (searchParams?.get('tab') === item.tab || (!searchParams?.get('tab') && item.tab === 'dashboard'));
            const isExpanded = expandedMenus.has(item.tab);
            const hasSubMenus = item.subMenus && item.subMenus.length > 0;
            const activeSubMenu = item.subMenus?.find(sub => searchParams?.get('tab') === sub.tab);

            return (
              <div key={item.tab}>
                <div className="flex items-center">
                  {hasSubMenus ? (
                    <button
                      onClick={() => {
                        if (isCollapsed) setIsCollapsed(false);
                        toggleSubMenu(item.tab);
                      }}
                      title={t(item.labelKey)}
                      className={cn(
                        'flex-1 flex items-center px-4 md:px-6 py-3 text-sm md:text-base text-gray-700 hover:bg-primary-50 hover:text-primary-600 transition-colors',
                        isCollapsed && 'md:justify-center md:px-2',
                        (isActive || activeSubMenu) && 'bg-primary-50 text-primary-600 border-r-2 border-primary-600'
                      )}
                    >
                      <Icon className={cn('w-5 h-5 flex-shrink-0', !isCollapsed && 'mr-3')} />
                      {!isCollapsed && <span className="font-medium flex-1 text-left">{t(item.labelKey)}</span>}
                      {!isCollapsed && (isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      ))}
                    </button>
                  ) : (
                    <Link
                      href={item.href === '/' ? '/?tab=dashboard' : `/?tab=${item.tab}`}
                      onClick={() => setIsMobileMenuOpen(false)}
                      title={t(item.labelKey)}
                      className={cn(
                        'flex items-center px-4 md:px-6 py-3 text-sm md:text-base text-gray-700 hover:bg-primary-50 hover:text-primary-600 transition-colors w-full',
                        isCollapsed && 'md:justify-center md:px-2',
                        isActive && 'bg-primary-50 text-primary-600 border-r-2 border-primary-600'
                      )}
                    >
                      <Icon className={cn('w-5 h-5 flex-shrink-0', !isCollapsed && 'mr-3')} />
                      {!isCollapsed && <span className="font-medium">{t(item.labelKey)}</span>}
                    </Link>
                  )}
                </div>
                {hasSubMenus && isExpanded && !isCollapsed && (
                  <div className="bg-gray-50">
                    {item.subMenus!.map((subMenu) => {
                      const SubIcon = subMenu.icon;
                      const isSubActive = searchParams?.get('tab') === subMenu.tab;
                      return (
                        <Link
                          key={subMenu.tab}
                          href={`/?tab=${subMenu.tab}`}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={cn(
                            'flex items-center px-8 md:px-12 py-2 text-sm text-gray-600 hover:bg-primary-50 hover:text-primary-600 transition-colors',
                            isSubActive && 'bg-primary-100 text-primary-700 border-r-2 border-primary-600 font-medium'
                          )}
                        >
                          <SubIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                          <span>{t(subMenu.labelKey)}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

export default function Sidebar() {
  const { t } = useI18n();
  return (
    <Suspense fallback={
      <aside className="fixed md:static inset-y-0 left-0 z-40 w-64 bg-white shadow-lg">
        <div className="p-4 md:p-6">
          <h1 className="text-xl md:text-2xl font-bold text-primary-600">{t('common.appName')}</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-1">{t('common.systemName')}</p>
        </div>
        <div className="p-4 text-gray-500">{t('common.loading')}</div>
      </aside>
    }>
      <SidebarContent />
    </Suspense>
  );
}
