'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { getApiErrorDetail } from '@/lib/utils';

type Group = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
};

export default function SystemRoleGroupsPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getPermissionGroups();
      setGroups(res.data as Group[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createGroup = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      alert(t('system.groups.validate'));
      return;
    }
    setSaving(true);
    try {
      await apiClient.createPermissionGroup({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: true,
      });
      setForm({ code: '', name: '', description: '' });
      await load();
      alert(t('system.saved'));
    } catch (e) {
      console.error(e);
      alert(
        getApiErrorDetail(e, t('system.saveError'), {
          409: t('system.groups.duplicateCode'),
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (g: Group) => {
    setSaving(true);
    try {
      await apiClient.updatePermissionGroup(g.id, { is_active: !g.is_active });
      await load();
    } catch (e) {
      console.error(e);
      alert(t('system.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = async (g: Group) => {
    if (!window.confirm(t('system.groups.confirmDelete'))) return;
    setSaving(true);
    try {
      await apiClient.deletePermissionGroup(g.id);
      await load();
      alert(t('system.saved'));
    } catch (e) {
      console.error(e);
      alert(getApiErrorDetail(e, t('system.saveError')));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-500">{t('common.loading')}</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-lg font-bold text-gray-900">{t('menu.systemRoleGroups')}</h1>
        <p className="text-sm text-gray-500">{t('system.groups.subtitle')}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-slate-50 p-4 flex flex-wrap gap-2 items-end">
        <input
          className="border rounded px-2 py-1 text-sm"
          placeholder={t('system.groups.code')}
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
        <input
          className="border rounded px-2 py-1 text-sm flex-1 min-w-[120px]"
          placeholder={t('system.groups.name')}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          className="border rounded px-2 py-1 text-sm flex-1 min-w-[160px]"
          placeholder={t('system.groups.description')}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void createGroup()}
          className="text-sm px-3 py-1.5 rounded bg-primary-600 text-white hover:bg-primary-700"
        >
          {t('system.groups.add')}
        </button>
      </div>
      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg bg-white">
        {groups.map((g) => (
          <li key={g.id} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono font-medium text-primary-700">{g.code}</span>
            <span className="font-medium">{g.name}</span>
            <span className="text-gray-500 text-xs flex-1">{g.description}</span>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={g.is_active} onChange={() => void toggleActive(g)} />
              {t('system.users.active')}
            </label>
            <button
              type="button"
              className="text-xs text-red-600 hover:underline"
              onClick={() => void removeGroup(g)}
            >
              {t('system.groups.delete')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
