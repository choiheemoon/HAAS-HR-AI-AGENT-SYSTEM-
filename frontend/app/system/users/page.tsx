'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { Filter, ChevronDown } from 'lucide-react';
import { isValid, parseISO } from 'date-fns';
import { ColumnFilterPopover } from '@/components/ui/ColumnFilterPopover';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

function parseErrorMessage(e: any, fallback: string): string {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === 'string') return first;
    if (first?.msg) return String(first.msg);
  }
  return fallback;
}

type SysUser = {
  id: number;
  system_group_code: string;
  email: string;
  username: string;
  full_name?: string | null;
  role: string;
  is_active: boolean;
  is_superuser: boolean;
  can_manage_system?: boolean;
  permission_group_id?: number | null;
  last_login?: string | null;
  created_at?: string;
  updated_at?: string;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const USER_COLUMN_KEYS = [
  'id',
  'system_group_code',
  'username',
  'email',
  'full_name',
  'role',
  'permission_group',
  'superuser',
  'manage_system',
  'last_login',
  'created_at',
  'updated_at',
  'active',
] as const;

type UserColumnKey = (typeof USER_COLUMN_KEYS)[number];

/** JSON 시각 필드 → ISO 문자열 (문자열·숫자·camelCase·일부 중첩 형식 대응) */
function coerceApiInstantString(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : undefined;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = Math.abs(v) < 1e11 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof v === 'object' && v !== null && '$date' in (v as Record<string, unknown>)) {
    return coerceApiInstantString((v as { $date: unknown }).$date);
  }
  return undefined;
}

function pickInstant(r: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const s = coerceApiInstantString(r[k]);
    if (s) return s;
  }
  return undefined;
}

/** parseISO 안정화: 공백 구분·초 단위 초과 소수(마이크로초) 축약 */
function normalizeIsoInstantForParse(input: string): string {
  let s = input.trim();
  if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) s = s.replace(' ', 'T');
  return s.replace(/(\.\d{3})\d+/, '$1');
}

/** API(JSON) 한 건을 SysUser로 통일 (snake_case / camelCase·날짜 문자열 형식 차이 흡수) */
function normalizeSystemUserRow(raw: unknown): SysUser {
  const r = raw as Record<string, unknown>;
  return {
    id: Number(r.id),
    system_group_code: String(r.system_group_code ?? r.systemGroupCode ?? ''),
    email: String(r.email ?? ''),
    username: String(r.username ?? ''),
    full_name: (r.full_name as string | null | undefined) ?? (r.fullName as string | null | undefined) ?? null,
    role: String(r.role ?? ''),
    is_active: Boolean(r.is_active ?? r.isActive),
    is_superuser: Boolean(r.is_superuser ?? r.isSuperuser),
    can_manage_system: Boolean(r.can_manage_system ?? r.canManageSystem ?? false),
    permission_group_id:
      r.permission_group_id != null
        ? Number(r.permission_group_id)
        : r.permissionGroupId != null
          ? Number(r.permissionGroupId)
          : null,
    last_login: pickInstant(r, 'last_login', 'lastLogin') ?? null,
    created_at: pickInstant(r, 'created_at', 'createdAt'),
    updated_at: pickInstant(r, 'updated_at', 'updatedAt'),
  };
}

function formatUserDate(iso: string | null | undefined, localeTag: string): string {
  if (iso == null || String(iso).trim() === '') return '—';
  const normalized = normalizeIsoInstantForParse(String(iso));
  const d = parseISO(normalized);
  if (!isValid(d)) return '—';
  return d.toLocaleString(localeTag);
}

function getUserRowDisplayValues(
  u: SysUser,
  groups: { id: number; code: string }[],
  dateLocale: string,
  t: (key: string, fallback?: string) => string
): Record<UserColumnKey, string> {
  const pg = groups.find((g) => g.id === u.permission_group_id);
  const yn = (v: boolean) => (v ? t('system.users.boolYes') : t('system.users.boolNo'));
  return {
    id: String(u.id),
    system_group_code: (u.system_group_code ?? '').trim() || '—',
    username: (u.username ?? '').trim() || '—',
    email: (u.email ?? '').trim() || '—',
    full_name: (u.full_name ?? '').trim() || '—',
    role: (u.role ?? '').trim() || '—',
    permission_group: pg ? pg.code : t('system.users.noGroup'),
    superuser: yn(!!u.is_superuser),
    manage_system: yn(!!u.can_manage_system),
    last_login: formatUserDate(u.last_login, dateLocale),
    created_at: formatUserDate(u.created_at, dateLocale),
    updated_at: formatUserDate(u.updated_at, dateLocale),
    active: yn(!!u.is_active),
  };
}

function userColumnHeaderLabel(
  key: UserColumnKey,
  t: (key: string, fallback?: string) => string
): string {
  const map: Record<UserColumnKey, string> = {
    id: 'ID',
    system_group_code: t('system.users.groupCode'),
    username: t('system.users.username'),
    email: t('system.users.email'),
    full_name: t('system.users.fullName'),
    role: t('system.users.role'),
    permission_group: t('system.users.permissionGroup'),
    superuser: t('system.users.superuser'),
    manage_system: t('system.users.manageSystem'),
    last_login: t('system.users.lastLogin'),
    created_at: t('system.users.createdAt'),
    updated_at: t('system.users.updatedAt'),
    active: t('system.users.active'),
  };
  return map[key];
}

type Group = { id: number; code: string; name: string };

export default function SystemUsersPage() {
  const { t, locale } = useI18n();
  const dateLocale =
    locale === 'ko' ? 'ko-KR' : locale === 'th' ? 'th-TH' : 'en-US';
  const [users, setUsers] = useState<SysUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const [me, setMe] = useState<{ id: number; is_superuser: boolean } | null>(null);
  const [form, setForm] = useState({
    email: '',
    username: '',
    password: '',
    full_name: '',
    role: 'user',
    permission_group_id: '' as string | number,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, g, auth] = await Promise.all([
        apiClient.getSystemUsers(),
        apiClient.getPermissionGroups(),
        apiClient.getAuthMe(),
      ]);
      const rawList = Array.isArray(u.data) ? u.data : [];
      setUsers(rawList.map(normalizeSystemUserRow));
      setGroups(g.data as Group[]);
      const md = auth.data as { id?: number; is_superuser?: boolean };
      setMe({
        id: Number(md?.id),
        is_superuser: Boolean(md?.is_superuser),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    if (Object.keys(columnFilters).every((k) => !columnFilters[k]?.length)) return users;
    return users.filter((row) => {
      const v = getUserRowDisplayValues(row, groups, dateLocale, t);
      return USER_COLUMN_KEYS.every((key) => {
        const selected = columnFilters[key];
        if (!selected || selected.length === 0) return true;
        const cellVal = String(v[key] ?? '—').trim();
        return selected.includes(cellVal);
      });
    });
  }, [users, columnFilters, groups, dateLocale, t]);

  const uniqueValuesByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    USER_COLUMN_KEYS.forEach((key) => {
      const set = new Set<string>();
      users.forEach((row) => {
        const v = getUserRowDisplayValues(row, groups, dateLocale, t);
        const val = String(v[key] ?? '—').trim();
        if (val) set.add(val);
      });
      map[key] = Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
    });
    return map;
  }, [users, groups, dateLocale, t]);

  const valueCountsByKey = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    USER_COLUMN_KEYS.forEach((key) => {
      map[key] = {};
      users.forEach((row) => {
        const v = getUserRowDisplayValues(row, groups, dateLocale, t);
        const val = String(v[key] ?? '—').trim();
        if (!val) return;
        map[key][val] = (map[key][val] ?? 0) + 1;
      });
    });
    return map;
  }, [users, groups, dateLocale, t]);

  const columnFilterLabels = useMemo(
    () => ({
      title: t('appList.filter.title'),
      reset: t('common.reset'),
      noValues: t('appList.filter.noValues'),
      noMatchingValues: t('appList.filter.noMatchingValues'),
      valueSearchPlaceholder: t('appList.filter.valueSearchPlaceholder'),
      selectAll: t('appList.table.selectAll'),
      deselectAll: t('appList.filter.deselectAll'),
      emptyValue: t('common.emptyValue'),
      selectedCountTemplate: t('appList.filter.selectedCount'),
    }),
    [t]
  );

  const totalFiltered = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const startItem = totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalFiltered);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paginatedUsers = useMemo(
    () => filteredUsers.slice((page - 1) * pageSize, page * pageSize),
    [filteredUsers, page, pageSize]
  );

  const clearColumnFilter = (key: string) => {
    setColumnFilters((prev) => {
      const u = { ...prev };
      delete u[key];
      return u;
    });
    setOpenFilterKey(null);
    setPage(1);
  };

  useEffect(() => {
    if (!openFilterKey) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(target)) {
        setOpenFilterKey(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [openFilterKey]);

  const saveNew = async () => {
    if (!form.email.trim() || !form.username.trim() || !form.password.trim()) {
      alert(t('system.users.validateNew'));
      return;
    }
    setSaving(true);
    try {
      await apiClient.createSystemUser({
        email: form.email.trim(),
        username: form.username.trim(),
        password: form.password,
        full_name: form.full_name.trim() || null,
        role: form.role,
        permission_group_id: form.permission_group_id === '' ? null : Number(form.permission_group_id),
      });
      setShowForm(false);
      setForm({
        email: '',
        username: '',
        password: '',
        full_name: '',
        role: 'user',
        permission_group_id: '',
      });
      await load();
      setPage(1);
      alert(t('system.saved'));
    } catch (e) {
      console.error(e);
      alert(parseErrorMessage(e, t('system.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const patchUser = async (u: SysUser, patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await apiClient.updateSystemUser(u.id, patch);
      await load();
      alert(t('system.saved'));
    } catch (e) {
      console.error(e);
      alert(parseErrorMessage(e, t('system.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (u: SysUser) => {
    if (!window.confirm(t('system.users.confirmDeactivate'))) return;
    setSaving(true);
    try {
      await apiClient.deleteSystemUser(u.id);
      await load();
      setPage(1);
      alert(t('system.saved'));
    } catch (e) {
      console.error(e);
      alert(parseErrorMessage(e, t('system.saveError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-bold text-gray-900">{t('menu.systemUsers')}</h1>
        <p className="text-sm text-gray-500">{t('system.users.subtitle')}</p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{t('appList.filter.title')}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="text-sm px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              {showForm ? t('system.close') : t('system.users.add')}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              {t('appList.filter.refresh')}
            </button>
          </div>
          {!loading && (
            <div className="flex flex-wrap items-center gap-3 ml-auto">
              <span className="text-sm text-gray-600">
                {t('appList.pagination.summary')
                  .replace('{total}', String(totalFiltered))
                  .replace('{start}', String(startItem))
                  .replace('{end}', String(endItem))}
                {filteredUsers.length !== users.length && (
                  <span className="ml-1 text-blue-600">
                    {t('appList.pagination.filtered').replace('{count}', String(filteredUsers.length))}
                  </span>
                )}
              </span>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                {t('appList.pagination.perPage')}
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {t('appList.pagination.countUnit').replace('{count}', String(n))}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.prev')}
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>

        {showForm && (
          <div className="p-4 border-b border-gray-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2"
              placeholder={t('system.users.email')}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2"
              placeholder={t('system.users.username')}
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
            <input
              type="password"
              className="border border-gray-300 rounded-lg px-3 py-2"
              placeholder={t('system.users.password')}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2"
              placeholder={t('system.users.fullName')}
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2"
              placeholder="role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2"
              value={form.permission_group_id === '' ? '' : String(form.permission_group_id)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  permission_group_id: e.target.value === '' ? '' : Number(e.target.value),
                }))
              }
            >
              <option value="">{t('system.users.noGroup')}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} — {g.name}
                </option>
              ))}
            </select>
            <div className="sm:col-span-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveNew()}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              >
                {t('system.users.create')}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-gray-500">{t('common.loading')}</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{t('system.users.empty')}</div>
        ) : (
          <>
            <div className="max-h-[70vh] overflow-auto relative">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap bg-gray-50 border-b border-gray-200">
                      {t('appList.table.no')}
                    </th>
                    {USER_COLUMN_KEYS.map((key) => {
                      const label = userColumnHeaderLabel(key, t);
                      const selectedList = columnFilters[key] ?? [];
                      const hasFilter = selectedList.length > 0;
                      const options = uniqueValuesByKey[key] ?? [];
                      return (
                        <Fragment key={key}>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap bg-gray-50 border-b border-gray-200">
                            <div className="flex items-center gap-1 group">
                              <span>{label}</span>
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setOpenFilterKey((k) => (k === key ? null : key))}
                                  className={`p-0.5 rounded hover:bg-gray-200 ${hasFilter ? 'text-blue-600' : 'text-gray-400'}`}
                                  title={t('appList.filter.title')}
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                                {openFilterKey === key && (
                                  <div ref={filterPopoverRef} className="absolute left-0 top-full mt-1 z-20">
                                    <ColumnFilterPopover
                                      options={options}
                                      selected={selectedList}
                                      valueCounts={valueCountsByKey[key] ?? {}}
                                      numberLocale={dateLocale}
                                      labels={columnFilterLabels}
                                      onReset={() => clearColumnFilter(key)}
                                      onSelectionChange={(next) => {
                                        setColumnFilters((prev) => {
                                          if (next.length === 0) {
                                            const u = { ...prev };
                                            delete u[key];
                                            return u;
                                          }
                                          return { ...prev, [key]: next };
                                        });
                                        setPage(1);
                                      }}
                                      showSelectedFooter
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </th>
                        </Fragment>
                      );
                    })}
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap bg-gray-50 border-b border-gray-200" />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedUsers.map((u, index) => (
                    <tr
                      key={u.id}
                      className={cn('hover:bg-gray-50', !u.is_active && 'bg-gray-50 text-gray-500')}
                    >
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {(page - 1) * pageSize + index + 1}
                      </td>
                      <td className="px-3 py-2 font-mono text-sm">{u.id}</td>
                      <td className="px-3 py-2 font-mono text-xs">{u.system_group_code ?? '—'}</td>
                      <td className="px-3 py-2 text-sm">{u.username}</td>
                      <td className="px-3 py-2 text-sm">{u.email}</td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm max-w-[140px]"
                          defaultValue={u.full_name ?? ''}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (u.full_name ?? '')) void patchUser(u, { full_name: v || null });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm max-w-[100px]"
                          defaultValue={u.role}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== u.role) void patchUser(u, { role: v });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="border border-gray-300 rounded-lg px-2 py-1 text-sm max-w-[180px]"
                          defaultValue={u.permission_group_id ?? ''}
                          onChange={(e) =>
                            void patchUser(u, {
                              permission_group_id:
                                e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        >
                          <option value="">{t('system.users.noGroup')}</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.code}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          title={
                            !me?.is_superuser
                              ? t('system.users.superuserOnlyEdit')
                              : me.id === u.id
                                ? t('system.users.superuserNoSelfDemote')
                                : t('system.users.superuser')
                          }
                          type="checkbox"
                          checked={!!u.is_superuser}
                          disabled={!me?.is_superuser || me.id === u.id}
                          onChange={(e) =>
                            void patchUser(u, { is_superuser: e.target.checked })
                          }
                          className="rounded border-gray-300 disabled:opacity-60"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          title={t('system.users.manageSystem')}
                          type="checkbox"
                          checked={!!u.can_manage_system}
                          disabled={u.is_superuser}
                          onChange={(e) =>
                            void patchUser(u, { can_manage_system: e.target.checked })
                          }
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {formatUserDate(u.last_login, dateLocale)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {formatUserDate(u.created_at, dateLocale)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {formatUserDate(u.updated_at, dateLocale)}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={u.is_active}
                          onChange={(e) => void patchUser(u, { is_active: e.target.checked })}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {u.is_active && (
                          <button
                            type="button"
                            className="text-red-600 text-xs hover:underline"
                            onClick={() => void deactivate(u)}
                          >
                            {t('system.users.deactivate')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 bg-gray-50">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm text-gray-600">
                  {t('appList.pagination.summary')
                    .replace('{total}', String(totalFiltered))
                    .replace('{start}', String(startItem))
                    .replace('{end}', String(endItem))}
                  {filteredUsers.length !== users.length && (
                    <span className="ml-1 text-blue-600">
                      {t('appList.pagination.filtered').replace('{count}', String(filteredUsers.length))}
                    </span>
                  )}
                </span>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  {t('appList.pagination.perPage')}
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {t('appList.pagination.countUnit').replace('{count}', String(n))}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.prev')}
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50/90 px-4 py-3 text-xs text-gray-700 leading-relaxed space-y-2">
        <p className="font-semibold text-gray-800">{t('system.users.roleHelpTitle')}</p>
        <ul className="list-disc pl-4 space-y-2">
          <li>
            <span className="font-semibold text-gray-900">{t('system.users.superuser')}</span>
            <span className="text-gray-600"> — {t('system.users.roleHelpSuperuser')}</span>
          </li>
          <li>
            <span className="font-semibold text-gray-900">{t('system.users.manageSystem')}</span>
            <span className="text-gray-600"> — {t('system.users.roleHelpSysAdmin')}</span>
          </li>
          <li>
            <span className="font-semibold text-gray-900">{t('system.users.roleHelpRegularLabel')}</span>
            <span className="text-gray-600"> — {t('system.users.roleHelpRegular')}</span>
          </li>
        </ul>
        <p className="text-[11px] text-gray-500 border-t border-blue-100/80 pt-2">
          {t('system.users.roleHelpRoleField')}
        </p>
      </div>
    </div>
  );
}
