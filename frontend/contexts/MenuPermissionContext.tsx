'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiClient } from '@/lib/api';
import { getToken } from '@/lib/auth';

export type MenuCrud = {
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
};

type MenuPermissionContextValue = {
  loading: boolean;
  ready: boolean;
  byKey: Record<string, MenuCrud>;
  refresh: () => Promise<void>;
  /** 메뉴 키별 단일 권한 (byKey에 없으면 false) */
  can: (menuKey: string, op: keyof MenuCrud) => boolean;
  /** 사이드바·탭 진입용: 조회 권한 */
  canReadTab: (tab: string) => boolean;
};

const MenuPermissionContext = createContext<MenuPermissionContextValue | null>(null);
const TAB_PERMISSION_ALIAS: Record<string, string> = {
  'attendance-master-manage': 'attendance',
  'attendance-annual-manage': 'attendance',
  'attendance-leave-manage': 'attendance',
  'attendance-leave-status': 'attendance',
  'attendance-inquiry': 'attendance',
  'attendance-additional-ot-manage': 'attendance-inquiry',
  'attendance-overview': 'attendance-inquiry',
  'attendance-report': 'attendance-inquiry',
  'attendance-aggregate': 'attendance-inquiry',
  'attendance-status-inquiry': 'attendance-inquiry',
  'attendance-allowance-status-inquiry': 'attendance-inquiry',
  'attendance-ot-allowance-report': 'attendance-allowance-status-inquiry',
  'attendance-payroll-bucket-aggregate': 'attendance-allowance-status-inquiry',
  'attendance-payroll-bucket-status': 'attendance-allowance-status-inquiry',
  'attendance-payroll-bucket-status-period': 'attendance-allowance-status-inquiry',
  'attendance-standard-manage': 'attendance',
  'attendance-work-calendar-manage': 'attendance',
  'education-inquiry': 'hr-master-inquiry',
  'career-inquiry': 'hr-master-inquiry',
  'hr-master-certification-inquiry': 'hr-master-inquiry',
  'hr-master-family-inquiry': 'hr-master-inquiry',
  'hr-master-address-inquiry': 'hr-master-inquiry',
  'hr-master-language-inquiry': 'hr-master-inquiry',
  'hr-personnel-record-card': 'hr-master-inquiry',
  'hr-personnel-record-card-history': 'hr-master-inquiry',
  'hr-master-report': 'hr-master-inquiry',
};

export function MenuPermissionProvider({ children }: { children: ReactNode }) {
  const [byKey, setByKey] = useState<Record<string, MenuCrud>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!getToken()) {
      setByKey({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.getMyMenuPermissions();
      const rows = res.data as Array<{
        menu_key: string;
        can_create: boolean;
        can_read: boolean;
        can_update: boolean;
        can_delete: boolean;
      }>;
      const next: Record<string, MenuCrud> = {};
      for (const r of rows) {
        next[r.menu_key] = {
          can_create: !!r.can_create,
          can_read: !!r.can_read,
          can_update: !!r.can_update,
          can_delete: !!r.can_delete,
        };
      }
      setByKey(next);
    } catch {
      setByKey({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const can = useCallback(
    (menuKey: string, op: keyof MenuCrud) => {
      const p = byKey[menuKey] ?? byKey[TAB_PERMISSION_ALIAS[menuKey] ?? ''];
      if (!p) return false;
      return !!p[op];
    },
    [byKey]
  );

  const canReadTab = useCallback(
    (tab: string) => {
      // 대시보드는 홈·로그인 후 기본 탭(매트릭스에서 조회 꺼져 있어도 허용)
      if (tab === 'dashboard') return true;
      if (loading) return false;
      const p = byKey[tab] ?? byKey[TAB_PERMISSION_ALIAS[tab] ?? ''];
      return !!p?.can_read;
    },
    [loading, byKey]
  );

  const value = useMemo<MenuPermissionContextValue>(
    () => ({
      loading,
      ready: !loading,
      byKey,
      refresh: load,
      can,
      canReadTab,
    }),
    [loading, byKey, load, can, canReadTab]
  );

  return (
    <MenuPermissionContext.Provider value={value}>{children}</MenuPermissionContext.Provider>
  );
}

/** 레이아웃 밖에서는 제한 없음으로 동작 */
export function useMenuPermissions(): MenuPermissionContextValue {
  const ctx = useContext(MenuPermissionContext);
  if (!ctx) {
    return {
      loading: false,
      ready: true,
      byKey: {},
      refresh: async () => {},
      can: () => false,
      canReadTab: (tab: string) => tab === 'dashboard',
    };
  }
  return ctx;
}
