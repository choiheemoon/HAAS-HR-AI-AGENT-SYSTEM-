'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

type SysUser = {
  id: number;
  email: string;
  username: string;
  full_name?: string | null;
  is_active: boolean;
  system_group_code?: string;
};

type CompanyRow = {
  id: number;
  company_code: string;
  system_group_code?: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

export default function SystemUserCompaniesPage() {
  const { t, locale } = useI18n();
  const [users, setUsers] = useState<SysUser[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [userId, setUserId] = useState<number | ''>('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meIsSuperuser, setMeIsSuperuser] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const rawFilteredUsers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const idStr = String(u.id);
      const name = (u.full_name ?? '').trim().toLowerCase();
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        idStr.includes(q) ||
        name.includes(q)
      );
    });
  }, [users, userSearchQuery]);

  const filteredUsers = useMemo(() => {
    let list = rawFilteredUsers;
    if (userId !== '') {
      const sel = users.find((u) => u.id === userId);
      if (sel && !list.some((u) => u.id === userId)) {
        list = [sel, ...list];
      }
    }
    return list;
  }, [rawFilteredUsers, users, userId]);

  const showUserSearchEmpty =
    userSearchQuery.trim().length > 0 && rawFilteredUsers.length === 0 && userId === '';

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [u, c, me] = await Promise.all([
        apiClient.getSystemUsers(),
        apiClient.getCompanies(),
        apiClient.getAuthMe(),
      ]);
      setUsers(u.data as SysUser[]);
      const list = c.data;
      setCompanies(Array.isArray(list) ? (list as CompanyRow[]) : []);
      setMeIsSuperuser(Boolean((me.data as { is_superuser?: boolean })?.is_superuser));
    } catch (e) {
      console.error(e);
      setUsers([]);
      setCompanies([]);
      setMeIsSuperuser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const pickCompanyNameByLocale = (co: CompanyRow) => {
    if (locale === 'ko') return co.name_kor || co.name_eng || co.name_thai || co.company_code;
    if (locale === 'en') return co.name_eng || co.name_kor || co.name_thai || co.company_code;
    return co.name_thai || co.name_kor || co.name_eng || co.company_code;
  };

  const loadAccess = useCallback(
    async (uid: number) => {
      try {
        const res = await apiClient.getUserCompanyAccess(uid);
        const rawIds = (res.data as { company_ids?: number[] })?.company_ids ?? [];
        if (meIsSuperuser) {
          setSelected(new Set(rawIds));
          return;
        }
        const u = users.find((x) => x.id === uid);
        const g = (u?.system_group_code ?? '').trim();
        const allowed = new Set(
          companies.filter((c) => (c.system_group_code ?? '').trim() === g).map((c) => c.id)
        );
        const ids = g ? rawIds.filter((id) => allowed.has(id)) : rawIds;
        setSelected(new Set(ids));
      } catch (e) {
        console.error(e);
        setSelected(new Set());
      }
    },
    [users, companies, meIsSuperuser]
  );

  useEffect(() => {
    if (userId === '') {
      setSelected(new Set());
      return;
    }
    void loadAccess(userId);
  }, [userId, loadAccess]);

  const toggleCompany = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (userId === '') {
      alert(t('system.ucm.pickUser'));
      return;
    }
    setSaving(true);
    try {
      await apiClient.putUserCompanyAccess(userId as number, Array.from(selected));
      alert(t('system.saved'));
    } catch (e: unknown) {
      console.error(e);
      const ax = e as { response?: { data?: { detail?: unknown } } };
      const detail = ax.response?.data?.detail;
      const msg =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((x: { msg?: string }) => x?.msg ?? String(x)).join('\n')
            : null;
      alert(msg ? `${t('system.saveError')}\n${msg}` : t('system.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-500">{t('common.loading')}</div>;
  }

  const selectedUser = userId === '' ? null : users.find((u) => u.id === userId);
  const userGroup = (selectedUser?.system_group_code ?? '').trim();
  const assignableCompanies =
    selectedUser == null
      ? []
      : meIsSuperuser
        ? companies
        : userGroup
          ? companies.filter((co) => (co.system_group_code ?? '').trim() === userGroup)
          : [];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-lg font-bold text-gray-900">{t('menu.systemUserCompanies')}</h1>
        <p className="text-sm text-gray-500">{t('system.ucm.subtitle')}</p>
        {meIsSuperuser && (
          <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
            {t('system.ucm.superuserListHint')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">{t('system.ucm.selectUser')}</label>
        <div className="max-w-md w-full space-y-2">
          <input
            type="search"
            className="border rounded-md px-3 py-2 text-sm w-full"
            placeholder={t('system.ucm.userSearchPlaceholder')}
            value={userSearchQuery}
            onChange={(e) => setUserSearchQuery(e.target.value)}
            autoComplete="off"
          />
          <select
            className="border rounded-md px-3 py-2 text-sm w-full"
            value={userId === '' ? '' : String(userId)}
            onChange={(e) => {
              const v = e.target.value;
              setUserId(v === '' ? '' : Number(v));
            }}
          >
            <option value="">{t('system.rgm.choose')}</option>
            {filteredUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name?.trim()
                  ? `${u.full_name.trim()} · ${u.username} (${u.email})`
                  : `${u.username} (${u.email})`}
              </option>
            ))}
          </select>
        </div>
        {showUserSearchEmpty ? (
          <p className="text-xs text-gray-500 max-w-md">{t('system.ucm.userSearchNoMatch')}</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="px-3 py-2 border-b border-gray-100 text-sm font-medium text-gray-700">
          {t('system.ucm.companies')}
        </div>
        <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 text-sm">
          {userId === '' ? (
            <li className="px-3 py-4 text-gray-500">{t('system.ucm.pickUser')}</li>
          ) : !meIsSuperuser && !userGroup ? (
            <li className="px-3 py-4 text-amber-800 bg-amber-50">{t('system.ucm.noUserGroup')}</li>
          ) : assignableCompanies.length === 0 ? (
            <li className="px-3 py-4 text-gray-500">
              {companies.length === 0 ? t('system.ucm.noCompanies') : t('system.ucm.noCompaniesInGroup')}
            </li>
          ) : (
            assignableCompanies.map((co) => (
              <li key={co.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  id={`co-${co.id}`}
                  checked={selected.has(co.id)}
                  disabled={false}
                  onChange={() => toggleCompany(co.id)}
                  className="rounded border-gray-300"
                />
                <label htmlFor={`co-${co.id}`} className="flex-1 cursor-pointer">
                  <span className="font-mono text-xs text-gray-500">{co.company_code}</span>{' '}
                  <span className="text-gray-900">{pickCompanyNameByLocale(co) || '—'}</span>
                  {meIsSuperuser && (co.system_group_code ?? '').trim() !== userGroup ? (
                    <span className="ml-2 text-[10px] text-gray-400 font-normal">
                      ({co.system_group_code ?? '—'})
                    </span>
                  ) : null}
                </label>
              </li>
            ))
          )}
        </ul>
      </div>

      <button
        type="button"
        disabled={saving || userId === ''}
        onClick={() => void save()}
        className="text-sm px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {t('system.saveMatrix')}
      </button>
      <p className="text-xs text-gray-500">{t('system.ucm.hint')}</p>
    </div>
  );
}
