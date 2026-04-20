'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Search, User, LogOut, Bot } from 'lucide-react';
import { getUser, removeAuth } from '@/lib/auth';
import { useI18n } from '@/contexts/I18nContext';
import { Locale } from '@/i18n/types';

export default function Header() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [showMenu, setShowMenu] = useState(false);
  const { t, locale, setLocale } = useI18n();

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
  }, []);

  const handleLogout = () => {
    removeAuth();
    router.push('/login');
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-4">
        <div className="flex-1 max-w-xl hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={t('header.search')}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center space-x-2 md:space-x-4 ml-auto">
          <select
            aria-label={t('header.language')}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-700"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="ko">{t('header.langKo')}</option>
            <option value="en">{t('header.langEn')}</option>
            <option value="th">{t('header.langTh')}</option>
          </select>
          <button
            onClick={() => router.push('/?tab=chat')}
            className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex items-center space-x-1"
            title={t('header.aiAssistant')}
          >
            <Bot className="w-5 h-5 md:w-6 md:h-6" />
            <span className="hidden lg:inline text-sm font-medium">{t('header.aiAssistant')}</span>
          </button>
          <button className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <Bell className="w-5 h-5 md:w-6 md:h-6" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center space-x-2 px-3 md:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <User className="w-4 h-4 md:w-5 md:h-5" />
              <span className="font-medium text-sm md:text-base hidden sm:inline">
                {user?.full_name || user?.username || t('header.userDefault')}
              </span>
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                <div className="px-4 py-2 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{user?.full_name || user?.username}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <button
                  onClick={() => {
                    router.push('/profile');
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                >
                  <User className="w-4 h-4" />
                  <span>{t('header.userInfo')}</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t('header.logout')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
