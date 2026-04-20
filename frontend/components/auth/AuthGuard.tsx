'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  // 인증이 필요 없는 페이지
  const publicPaths = ['/login', '/register'];

  useEffect(() => {
    const checkAuth = () => {
      if (publicPaths.includes(pathname)) {
        setLoading(false);
        return;
      }

      if (!isAuthenticated()) {
        router.push('/login');
      } else {
        setLoading(false);
      }
    };

    checkAuth();
  }, [pathname, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return <>{children}</>;
}
