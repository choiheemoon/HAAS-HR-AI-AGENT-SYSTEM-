'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

type Group = {
  id: number;
  system_group_code: string;
  code: string;
  name: string;
  description?: string | null;
};

type CompanyRow = {
  id: number;
  system_group_code: string;
  company_code: string;
  name_kor?: string | null;
  name_eng?: string | null;
  name_thai?: string | null;
};

function companyListLabel(c: CompanyRow): string {
  const name = (c.name_kor || c.name_eng || c.name_thai || '').trim();
  return name ? `${name} (${c.company_code})` : c.company_code;
}

function permissionGroupOptionLabel(g: Group, showSystemGroupPrefix: boolean): string {
  const prefix = showSystemGroupPrefix ? `[${g.system_group_code}] ` : '';
  return `${prefix}${g.code} — ${g.name}`;
}

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
/**
 * Sidebar와 동일한 평면 트리: 직원·근태 하위는 각각 `employees` / `attendance` 직속.
 * (menu_key 접두사 규칙만 쓰면 payroll-bucket-status-period 등이 중간 노드 아래로 붙는다.)
 */
const MENU_PARENT_BY_KEY: Record<string, string> = {
  chat: 'dashboard',
  'hr-master-manage': 'employees',
  'hr-master-inquiry': 'employees',
  'career-inquiry': 'employees',
  'dependent-inquiry': 'employees',
  'education-inquiry': 'employees',
  'hr-master-certification-inquiry': 'employees',
  'hr-master-family-inquiry': 'employees',
  'hr-master-address-inquiry': 'employees',
  'hr-master-language-inquiry': 'employees',
  'hr-personnel-record-card': 'employees',
  'hr-personnel-record-card-history': 'employees',
  'hr-master-report': 'employees',
  'hr-master-reference-manage': 'employees',
  'attendance-master-manage': 'attendance',
  'attendance-annual-manage': 'attendance',
  'attendance-leave-manage': 'attendance',
  'attendance-leave-status': 'attendance',
  'attendance-inquiry': 'attendance',
  'attendance-additional-ot-manage': 'attendance',
  'attendance-overview': 'attendance',
  'attendance-report': 'attendance',
  'attendance-aggregate': 'attendance',
  'attendance-status-inquiry': 'attendance',
  'attendance-allowance-status-inquiry': 'attendance',
  'attendance-ot-allowance-report': 'attendance',
  'attendance-payroll-bucket-aggregate': 'attendance',
  'attendance-payroll-bucket-status': 'attendance',
  'attendance-payroll-bucket-status-period': 'attendance',
  'attendance-work-calendar-manage': 'attendance',
  'attendance-standard-manage': 'attendance',
  'tax-company-manage': 'master-data',
  'master-major-code-manage': 'master-data',
  'master-minor-code-manage': 'master-data',
  'system-users': 'system',
  'system-user-companies': 'system',
  'system-role-groups': 'system',
  'system-role-group-menus': 'system',
  'system-schedule-manage': 'system',
  'system-template-generation': 'system',
};

function buildMenuTree(rows: Row[]) {
  const norm = (v: string) => (v || '').trim();
  const byKey = new Map(rows.map((r) => [norm(r.menu_key), r]));
  const keys = Array.from(byKey.keys());

  const parentKeyOf = (menuKey: string): string | null => {
    const key = norm(menuKey);
    const forced = MENU_PARENT_BY_KEY[key];
    if (forced && byKey.has(forced)) return forced;
    let best: string | null = null;
    for (const k of keys) {
      if (k === key) continue;
      if (key.startsWith(`${k}-`)) {
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
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [companyFilterId, setCompanyFilterId] = useState<number | ''>('');
  const [companyFilterSearch, setCompanyFilterSearch] = useState('');
  const [groupFilterSearch, setGroupFilterSearch] = useState('');
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

  const sortedCompanies = useMemo(
    () =>
      [...companies].sort((a, b) =>
        companyListLabel(a).localeCompare(companyListLabel(b), undefined, {
          sensitivity: 'base',
        })
      ),
    [companies]
  );

  const companySearchNorm = companyFilterSearch.trim().toLowerCase();

  const visibleCompanies = useMemo(() => {
    if (!companySearchNorm) return sortedCompanies;
    return sortedCompanies.filter((c) =>
      [c.company_code, c.name_kor ?? '', c.name_eng ?? '', c.name_thai ?? '']
        .join(' ')
        .toLowerCase()
        .includes(companySearchNorm)
    );
  }, [sortedCompanies, companySearchNorm]);

  const groupsForCompanyFilter = useMemo(() => {
    if (companyFilterId === '') return groups;
    const co = companies.find((c) => c.id === companyFilterId);
    if (!co) return groups;
    const sg = (co.system_group_code || '').trim();
    return groups.filter((g) => (g.system_group_code || '').trim() === sg);
  }, [groups, companies, companyFilterId]);

  const groupSearchNorm = groupFilterSearch.trim().toLowerCase();

  const visibleGroups = useMemo(() => {
    if (!groupSearchNorm) return groupsForCompanyFilter;
    return groupsForCompanyFilter.filter((g) => {
      const blob = [g.system_group_code, g.code, g.name, g.description ?? '']
        .join(' ')
        .toLowerCase();
      return blob.includes(groupSearchNorm);
    });
  }, [groupsForCompanyFilter, groupSearchNorm]);

  const showSystemGroupInGroupOptions = companyFilterId === '';

  useEffect(() => {
    if (groupId === '') return;
    if (!visibleGroups.some((g) => g.id === groupId)) {
      setGroupId('');
    }
  }, [visibleGroups, groupId]);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const gRes = await apiClient.getPermissionGroups();
      setGroups(gRes.data as Group[]);
      try {
        const cRes = await apiClient.getCompanies();
        setCompanies(cRes.data as CompanyRow[]);
      } catch {
        setCompanies([]);
      }
    } catch (e) {
      console.error(e);
      setGroups([]);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
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

    renderRows.push(
      <tr
        key={r.menu_id}
        className="group border-b border-slate-100 bg-white transition-colors hover:bg-slate-50/90"
      >
        <td className="px-0 py-0 align-middle">
          <div
            className="flex items-start gap-1.5 py-2.5 pr-3 min-w-[12rem]"
            style={{
              paddingLeft: `${10 + depth * 16}px`,
              ...(depth > 0
                ? {
                    borderLeftWidth: 2,
                    borderLeftStyle: 'solid',
                    borderLeftColor: 'rgb(203 213 225)',
                  }
                : {}),
            }}
          >
            {hasChildren ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => toggleExpanded(r.menu_id)}
                className="mt-0.5 p-0.5 rounded-md text-slate-500 bg-slate-100/90 hover:bg-slate-200/90 shrink-0 leading-none"
              >
                {expanded ? (
                  <ChevronDown className="w-4 h-4" aria-hidden />
                ) : (
                  <ChevronRight className="w-4 h-4" aria-hidden />
                )}
              </button>
            ) : (
              <span className="w-6 shrink-0 inline-block" aria-hidden />
            )}
            {hasChildren ? (
              <Folder
                className="w-4 h-4 text-slate-400 shrink-0 mt-0.5"
                aria-hidden
              />
            ) : (
              <FileText
                className="w-4 h-4 text-slate-300 shrink-0 mt-0.5"
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <span className="text-sm font-medium text-slate-900 leading-snug">
                {t(r.label_key)}
              </span>
              <span className="text-sm font-normal text-slate-400">, </span>
              <code className="text-xs font-mono text-slate-500 font-normal break-all">
                {r.menu_key}
              </code>
            </div>
          </div>
        </td>
        {(['can_create', 'can_read', 'can_update', 'can_delete'] as const).map((k) => {
          const { all, none } = permRollup(r.menu_id, k);
          const indeterminate = hasChildren && !all && !none;
          return (
            <td
              key={k}
              className="px-2 py-2 text-center align-middle bg-white group-hover:bg-slate-50/90 w-14"
            >
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="flex flex-col gap-1 text-sm text-gray-700 min-w-[200px] lg:max-w-xs">
            <span>{t('system.rgm.companySearchLabel')}</span>
            <input
              type="search"
              value={companyFilterSearch}
              onChange={(e) => setCompanyFilterSearch(e.target.value)}
              placeholder={t('system.rgm.companySearchPlaceholder')}
              aria-label={t('system.rgm.companySearchPlaceholder')}
              className="border rounded px-2 py-1.5 text-gray-800 placeholder:text-gray-400 w-full"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700 min-w-[200px] lg:max-w-xs">
            <span>{t('system.rgm.filterCompany')}</span>
            <select
              className="border rounded px-2 py-1.5 text-gray-800 w-full"
              value={companyFilterId === '' ? '' : String(companyFilterId)}
              onChange={(e) => {
                const v = e.target.value;
                setCompanyFilterId(v === '' ? '' : Number(v));
              }}
            >
              <option value="">{t('system.rgm.allCompanies')}</option>
              {visibleCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {companyListLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700 flex-1 min-w-[200px] max-w-md">
            <span>{t('system.rgm.groupFilterLabel')}</span>
            <input
              type="search"
              value={groupFilterSearch}
              onChange={(e) => setGroupFilterSearch(e.target.value)}
              placeholder={t('system.rgm.groupSearchPlaceholder')}
              aria-label={t('system.rgm.groupSearchPlaceholder')}
              className="border rounded px-2 py-1.5 text-gray-800 placeholder:text-gray-400 w-full"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700 flex-1 min-w-[220px] max-w-lg">
            <span>{t('system.rgm.selectGroup')}</span>
            <select
              className="border rounded px-2 py-1.5 text-gray-800 w-full"
              value={groupId === '' ? '' : String(groupId)}
              onChange={(e) =>
                setGroupId(e.target.value === '' ? '' : Number(e.target.value))
              }
            >
              <option value="">{t('system.rgm.choose')}</option>
              {visibleGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {permissionGroupOptionLabel(g, showSystemGroupInGroupOptions)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left">
          <thead className="bg-slate-100/95 text-slate-600 text-xs font-semibold uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 text-left">{t('system.crud.menu')}</th>
              <th className="px-2 py-3 text-center w-14">{t('system.crud.create')}</th>
              <th className="px-2 py-3 text-center w-14">{t('system.crud.read')}</th>
              <th className="px-2 py-3 text-center w-14">{t('system.crud.update')}</th>
              <th className="px-2 py-3 text-center w-14">{t('system.crud.delete')}</th>
            </tr>
          </thead>
          <tbody className="text-xs">
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
