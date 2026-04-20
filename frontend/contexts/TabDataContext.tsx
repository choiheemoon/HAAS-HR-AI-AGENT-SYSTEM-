'use client';

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

interface TabDataCache {
  [key: string]: any;
}

interface TabDataContextType {
  cache: TabDataCache;
  setCache: (tab: string, data: any) => void;
  getCache: (tab: string) => any;
  clearCache: (tab?: string) => void;
}

const TabDataContext = createContext<TabDataContextType | undefined>(undefined);

export function TabDataProvider({ children }: { children: ReactNode }) {
  const [cache, setCacheState] = useState<TabDataCache>({});
  const cacheRef = useRef<TabDataCache>({});

  const setCache = useCallback((tab: string, data: any) => {
    setCacheState((prev) => {
      // 데이터가 실제로 변경되었을 때만 업데이트 (무한 루프 방지)
      const prevData = prev[tab];
      if (prevData && JSON.stringify(prevData) === JSON.stringify(data)) {
        return prev;
      }
      const newCache = {
        ...prev,
        [tab]: data,
      };
      cacheRef.current = newCache;
      return newCache;
    });
  }, []);

  const getCache = useCallback((tab: string) => {
    return cacheRef.current[tab] || cache[tab];
  }, [cache]);

  const clearCache = useCallback((tab?: string) => {
    if (tab) {
      setCacheState((prev) => {
        const newCache = { ...prev };
        delete newCache[tab];
        delete cacheRef.current[tab];
        return newCache;
      });
    } else {
      setCacheState({});
      cacheRef.current = {};
    }
  }, []);

  return (
    <TabDataContext.Provider value={{ cache, setCache, getCache, clearCache }}>
      {children}
    </TabDataContext.Provider>
  );
}

export function useTabData() {
  const context = useContext(TabDataContext);
  if (context === undefined) {
    throw new Error('useTabData must be used within a TabDataProvider');
  }
  return context;
}
