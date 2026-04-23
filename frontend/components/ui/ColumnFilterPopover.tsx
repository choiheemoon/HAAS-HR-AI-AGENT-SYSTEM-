'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export type ColumnFilterPopoverLabels = {
  title: string;
  reset: string;
  noValues: string;
  noMatchingValues: string;
  valueSearchPlaceholder: string;
  selectAll: string;
  deselectAll: string;
  emptyValue: string;
  /** e.g. "선택: {count}개" */
  selectedCountTemplate: string;
};

type ColumnFilterPopoverProps = {
  options: string[];
  selected: string[];
  valueCounts?: Record<string, number>;
  numberLocale: string;
  labels: ColumnFilterPopoverLabels;
  onReset: () => void;
  onSelectionChange: (nextSelected: string[]) => void;
  /** Show selected count under the list (Excel-style footer) */
  showSelectedFooter?: boolean;
  /** Extra classes on root (width / max-height). Default: w-64 max-h-72 flex flex-col */
  rootClassName?: string;
};

export function ColumnFilterPopover({
  options,
  selected,
  valueCounts,
  numberLocale,
  labels,
  onReset,
  onSelectionChange,
  showSelectedFooter = false,
  rootClassName = 'w-64 max-h-72 flex flex-col',
}: ColumnFilterPopoverProps) {
  const [search, setSearch] = useState('');
  const searchQ = search.trim().toLowerCase();
  const filteredOptions = useMemo(
    () =>
      searchQ ? options.filter((val) => (val ?? '').toLowerCase().includes(searchQ)) : options,
    [options, searchQ]
  );

  return (
    <div className={`${rootClassName} bg-white border border-gray-200 rounded-lg shadow-lg py-2`}>
      <div className="px-2 pb-2 border-b border-gray-100 flex justify-between items-center shrink-0">
        <span className="text-xs font-medium text-gray-600">{labels.title}</span>
        <button type="button" onClick={onReset} className="text-xs text-blue-600 hover:underline">
          {labels.reset}
        </button>
      </div>
      <div className="px-2 pt-2 pb-1 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="search"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={labels.valueSearchPlaceholder}
            className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>
      <div className="px-2 pt-1 pb-2 flex gap-2 shrink-0">
        <button
          type="button"
          disabled={filteredOptions.length === 0}
          onClick={() => {
            const next = new Set(selected);
            for (const v of filteredOptions) next.add(v);
            onSelectionChange(Array.from(next));
          }}
          className="flex-1 text-xs py-1.5 px-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {labels.selectAll}
        </button>
        <button
          type="button"
          disabled={filteredOptions.length === 0}
          onClick={() => {
            const remove = new Set(filteredOptions);
            onSelectionChange(selected.filter((x) => !remove.has(x)));
          }}
          className="flex-1 text-xs py-1.5 px-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {labels.deselectAll}
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto py-1 min-h-0 border-t border-gray-100">
        {options.length === 0 ? (
          <p className="px-2 py-1 text-xs text-gray-500">{labels.noValues}</p>
        ) : filteredOptions.length === 0 ? (
          <p className="px-2 py-1 text-xs text-gray-500">{labels.noMatchingValues}</p>
        ) : (
          filteredOptions.map((val) => (
            <label key={val} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(val)}
                onChange={() =>
                  onSelectionChange(
                    selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val]
                  )
                }
                className="rounded border-gray-300 shrink-0"
              />
              <span className="text-xs truncate flex-1 min-w-0 text-gray-800" title={val}>
                {val || labels.emptyValue}
              </span>
              {valueCounts ? (
                <span className="text-xs text-gray-400 tabular-nums shrink-0">
                  {(valueCounts[val] ?? 0).toLocaleString(numberLocale)}
                </span>
              ) : null}
            </label>
          ))
        )}
      </div>
      {showSelectedFooter && selected.length > 0 ? (
        <p className="px-2 pt-1 text-xs text-gray-500 shrink-0">
          {labels.selectedCountTemplate.replace('{count}', String(selected.length))}
        </p>
      ) : null}
    </div>
  );
}
