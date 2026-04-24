'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import AuthGuard from '@/components/auth/AuthGuard';
import { I18nProvider } from '@/contexts/I18nContext';
import { MenuPermissionProvider } from '@/contexts/MenuPermissionContext';

interface LayoutWrapperProps {
  children: React.ReactNode;
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname();
  
  // 인증이 필요 없는 페이지 (로그인, 회원가입, 공개 채용공고, 증명서 직원 전달)
  const publicPaths = ['/login', '/register', '/forgot-password', '/certificate-delivery'];
  const isPublicPath = publicPaths.includes(pathname) || (pathname && pathname.startsWith('/jobs/'));

  if (isPublicPath) {
    return <I18nProvider>{children}</I18nProvider>;
  }

  return (
    <I18nProvider>
      <AuthGuard>
        <MenuPermissionProvider>
          <div className="flex h-screen bg-gray-50">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-4 md:p-6">
                {children}
              </main>
            </div>
          </div>
        </MenuPermissionProvider>
      </AuthGuard>
    </I18nProvider>
  );
}
