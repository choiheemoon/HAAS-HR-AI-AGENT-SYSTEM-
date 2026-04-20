'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

type Group = { id: number; code: string; name: string };
type Row = {
  menu_id: number;
  menu_key: string;
  label_key: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
};

type PermKey = 'can_create' | 'can_read' | 'can_update' | 'can_delete';

/**
 * DB menu_key가 `부모키-자식세그먼트` 패턴이 아닌 경우의 부모 지정.
 * (예: 인사 마스터 메뉴는 `employees-*`가 아니라 `hr-master-*` 네이밍)
 */
const MENU_PARENT_BY_KEY: Record<string, string> = {
  'hr-master-report': 'employees',
  'hr-master-manage': 'employees',
  'hr-master-inquiry': 'employees',
  'career-inquiry': 'employees',
  'dependent-inquiry': 'employees',
  'education-inquiry': 'employees',
  'hr-master-certification-inquiry': 'employees',
  'hr-master-address-inquiry': 'employees',
  'hr-master-language-inquiry': 'employees',
  'hr-personnel-record-card': 'employees',
  'hr-master-reference-manage': 'employees',
  'hr-master-family-inquiry': 'employees',
};

function buildMenuTree(rows: Row[]) {
  const byKey = new Map(rows.map((r) => [r.menu_key, r]));
  const keys = Array.from(byKey.keys());

  const parentKeyOf = (menuKey: string): string | null => {
    const forced = MENU_PARENT_BY_KEY[menuKey];
    if (forced && byKey.has(forced)) return forced;
    let best: string | null = null;
    for (const k of keys) {
      if (k === menuKey) continue;
      if (menuKey.startsWith(`${k}-`)) {
        if (best === null || k.length > best.length) best = k;
      }
    }
    return best;
  };

  const parentByChildId = new Map<number, number | null>();
  const childrenByParentId = new Map<number, Row[]>();

  for (const r of rows) {
    const pk = parentKeyOf(r.menu_key);
    const parentRow = pk ? byKey.get(pk) : undefined;
    const pid = parentRow?.menu_id ?? null;
    parentByChildId.set(r.menu_id, pid);
    if (pid != null) {
      const arr = childrenByParentId.get(pid) ?? [];
      arr.push(r);
      childrenByParentId.set(pid, arr);
    }
  }

  const orderIndex = new Map(rows.map((r, i) => [r.menu_id, i]));
  childrenByParentId.forEach((ch) => {
    ch.sort((a, b) => (orderIndex.get(a.menu_id)! - orderIndex.get(b.menu_id)!));
  });

  const roots = rows.filter((r) => parentByChildId.get(r.menu_id) == null);
  return { roots, childrenByParentId, parentByChildId };
}

function collectDescendantIds(
  menuId: number,
  childrenByParentId: Map<number, Row[]>
): number[] {
  const kids = childrenByParentId.get(menuId) ?? [];
  const out: number[] = [];
  for (const c of kids) {
    out.push(c.menu_id);
    out.push(...collectDescendantIds(c.menu_id, childrenByParentId));
  }
  return out;
}

function PermissionCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export default function SystemRoleGroupMenusPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<number | ''>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const tree = useMemo(() => buildMenuTree(rows), [rows]);

  /** Permission edits change `rows` but not menu ids/keys — avoid resetting expand/collapse. */
  const menuStructureKey = useMemo(
    () => rows.map((r) => `${r.menu_id}:${r.menu_key}`).join('|'),
    [rows]
  );

  const rowById = useMemo(() => new Map(rows.map((r) => [r.menu_id, r])), [rows]);

  const loadGroups = useCallback(async () => {
    const res = await apiClient.getPermissionGroups();
    setGroups(res.data as Group[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const loadMatrix = async (gid: number) => {
    const res = await apiClient.getGroupMenuPermissions(gid);
    setRows(res.data as Row[]);
  };

  useEffect(() => {
    if (groupId === '') {
      setRows([]);
      return;
    }
    void loadMatrix(groupId);
  }, [groupId]);

  useEffect(() => {
    if (!menuStructureKey) {
      setExpandedIds(new Set());
      return;
    }
    const { childrenByParentId } = buildMenuTree(rows);
    setExpandedIds(new Set(childrenByParentId.keys()));
    // rows: only id/menu_key participate in menuStructureKey; omitting `rows` avoids resetting expand on permission toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuStructureKey]);

  const searchNorm = menuSearch.trim().toLowerCase();

  const rowMatchesSearch = useCallback(
    (r: Row) => {
      if (!searchNorm) return true;
      const label = t(r.label_key).toLowerCase();
      return r.menu_key.toLowerCase().includes(searchNorm) || label.includes(searchNorm);
    },
    [searchNorm, t]
  );

  const subtreeHasSearchMatch = useMemo(() => {
    const memo = new Map<number, boolean>();
    const walk = (menuId: number): boolean => {
      const r = rowById.get(menuId);
      if (!r) return false;
      const self = rowMatchesSearch(r);
      const kids = tree.childrenByParentId.get(menuId) ?? [];
      const child = kids.some((c) => walk(c.menu_id));
      const v = self || child;
      memo.set(menuId, v);
      return v;
    };
    for (const root of tree.roots) walk(root.menu_id);
    return memo;
  }, [rowById, tree.childrenByParentId, tree.roots, rowMatchesSearch]);

  useEffect(() => {
    if (!searchNorm) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const r of rows) {
        if (!subtreeHasSearchMatch.get(r.menu_id)) continue;
        if (!rowMatchesSearch(r)) continue;
        let pid = tree.parentByChildId.get(r.menu_id);
        while (pid != null) {
          if (!next.has(pid)) {
            next.add(pid);
            changed = true;
          }
          pid = tree.parentByChildId.get(pid) ?? null;
        }
      }
      return changed ? next : prev;
    });
  }, [searchNorm, rows, subtreeHasSearchMatch, rowMatchesSearch, tree.parentByChildId]);

  const idsForPermRollup = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const r of rows) {
      const desc = collectDescendantIds(r.menu_id, tree.childrenByParentId);
      map.set(r.menu_id, [r.menu_id, ...desc]);
    }
    return map;
  }, [rows, tree.childrenByParentId]);

  const permRollup = useCallback(
    (menuId: number, key: PermKey) => {
      const ids = idsForPermRollup.get(menuId) ?? [menuId];
      let n = 0;
      let on = 0;
      for (const id of ids) {
        const row = rowById.get(id);
        if (!row) continue;
        n += 1;
        if (row[key]) on += 1;
      }
      return { n, on, all: n > 0 && on === n, none: on === 0 };
    },
    [idsForPermRollup, rowById]
  );

  const setFlag = (menuId: number, key: PermKey, v: boolean) => {
    const desc = collectDescendantIds(menuId, tree.childrenByParentId);
    const hasChildren = desc.length > 0;
    const targetIds = hasChildren ? [menuId, ...desc] : [menuId];
    setRows((prev) =>
      prev.map((r) => (targetIds.includes(r.menu_id) ? { ...r, [key]: v } : r))
    );
  };

  const setAllFlags = (value: boolean) => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        can_create: value,
        can_read: value,
        can_update: value,
        can_delete: value,
      }))
    );
  };

  const save = async () => {
    if (groupId === '') return;
    setSaving(true);
    try {
      await apiClient.putGroupMenuPermissions(
        groupId,
        rows.map((r) => ({
          menu_id: r.menu_id,
          can_create: r.can_create,
          can_read: r.can_read,
          can_update: r.can_update,
          can_delete: r.can_delete,
        }))
      );
      alert(t('system.saved'));
    } catch (e) {
      console.error(e);
      alert(t('system.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = (menuId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(menuId)) next.delete(menuId);
      else next.add(menuId);
      return next;
    });
  };

  const visibleRoots = useMemo(() => {
    if (!searchNorm) return tree.roots;
    return tree.roots.filter((r) => subtreeHasSearchMatch.get(r.menu_id));
  }, [tree.roots, searchNorm, subtreeHasSearchMatch]);

  const renderRows: JSX.Element[] = [];

  const appendNode = (r: Row, depth: number) => {
    if (searchNorm && !subtreeHasSearchMatch.get(r.menu_id)) return;
    const children = tree.childrenByParentId.get(r.menu_id) ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedIds.has(r.menu_id);
    const pad = depth * 14;

    renderRows.push(
      <tr key={r.menu_id}>
        <td className="px-2 py-1">
          <div className="flex items-start gap-0.5" style={{ paddingLeft: pad }}>
            {hasChildren ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => toggleExpanded(r.menu_id)}
                className="mt-0.5 p-0.5 rounded text-gray-500 hover:bg-gray-100 shrink-0"
              >
                {expanded ? (
                  <ChevronDown className="w-4 h-4" aria-hidden />
                ) : (
                  <ChevronRight className="w-4 h-4" aria-hidden />
                )}
              </button>
            ) : (
              <span className="w-5 shrink-0 inline-block" aria-hidden />
            )}
            <div>
              <span className="font-mono text-gray-600">{r.menu_key}</span>
              <br />
              <span className="text-gray-800">{t(r.label_key)}</span>
            </div>
          </div>
        </td>
        {(['can_create', 'can_read', 'can_update', 'can_delete'] as const).map((k) => {
          const { all, none } = permRollup(r.menu_id, k);
          const indeterminate = hasChildren && !all && !none;
          return (
            <td key={k} className="px-2 py-1 text-center align-top">
              <PermissionCheckbox
                checked={all}
                indeterminate={indeterminate}
                disabled={saving || groupId === ''}
                onChange={(v) => setFlag(r.menu_id, k, v)}
              />
            </td>
          );
        })}
      </tr>
    );

    if (hasChildren && expanded) {
      for (const c of children) appendNode(c, depth + 1);
    }
  };

  for (const root of visibleRoots) appendNode(root, 0);

  if (loading) {
    return <div className="p-6 text-gray-500">{t('common.loading')}</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">{t('menu.systemRoleGroupMenus')}</h1>
        <p className="text-sm text-gray-500">{t('system.rgm.subtitle')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700">
          {t('system.rgm.selectGroup')}
          <select
            className="ml-2 border rounded px-2 py-1"
            value={groupId === '' ? '' : String(groupId)}
            onChange={(e) =>
              setGroupId(e.target.value === '' ? '' : Number(e.target.value))
            }
          >
            <option value="">{t('system.rgm.choose')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} — {g.name}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          value={menuSearch}
          onChange={(e) => setMenuSearch(e.target.value)}
          placeholder={t('system.rgm.menuSearchPlaceholder')}
          aria-label={t('system.rgm.menuSearchPlaceholder')}
          disabled={groupId === '' || rows.length === 0}
          className="border rounded px-2 py-1 min-w-[200px] max-w-xs text-gray-800 placeholder:text-gray-400"
        />
        <button
          type="button"
          disabled={saving || groupId === '' || rows.length === 0}
          onClick={() => setAllFlags(true)}
          className="text-sm px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-40"
        >
          {t('system.rgm.selectAll')}
        </button>
        <button
          type="button"
          disabled={saving || groupId === '' || rows.length === 0}
          onClick={() => setAllFlags(false)}
          className="text-sm px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-40"
        >
          {t('system.rgm.clearAll')}
        </button>
        <button
          type="button"
          disabled={saving || groupId === ''}
          onClick={() => void save()}
          className="text-sm px-3 py-1.5 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40"
        >
          {t('system.saveMatrix')}
        </button>
      </div>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-xs text-left">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-2 py-2">{t('system.crud.menu')}</th>
              <th className="px-2 py-2">{t('system.crud.create')}</th>
              <th className="px-2 py-2">{t('system.crud.read')}</th>
              <th className="px-2 py-2">{t('system.crud.update')}</th>
              <th className="px-2 py-2">{t('system.crud.delete')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {groupId !== '' && rows.length > 0 && renderRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  {t('system.rgm.noMenuMatch')}
                </td>
              </tr>
            ) : (
              renderRows
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
