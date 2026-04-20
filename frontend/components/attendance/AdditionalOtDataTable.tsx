'use client';

import { cn } from '@/lib/utils';
import { OT_TYPES, normalizeTimeInput, totalMinutesHhmm, type OtBufferRow } from '@/lib/additionalOtModel';

export default function AdditionalOtDataTable({
  t,
  displayRows,
  selectedRowIndex,
  setSelectedRowIndex,
  editing = false,
  updateRow,
  rowsLoading,
}: {
  t: (key: string) => string;
  displayRows: OtBufferRow[];
  selectedRowIndex: number;
  setSelectedRowIndex: (i: number) => void;
  editing?: boolean;
  updateRow?: (idx: number, patch: Partial<OtBufferRow>) => void;
  rowsLoading: boolean;
}) {
  const inputCls = 'w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white disabled:bg-gray-100 disabled:text-gray-600';
  const cellInputCls =
    'w-full min-w-[3.5rem] border border-gray-300 rounded px-1 py-0.5 text-center text-xs font-mono tabular-nums bg-white disabled:bg-gray-100';
  const cellText = (v: string) => (
    <span className="block px-1 py-0.5 text-center font-mono tabular-nums text-gray-800">{v?.trim() ? v : '—'}</span>
  );

  return (
    <div className="flex-1 min-h-0 overflow-auto border border-gray-200 rounded-md bg-white">
      <table className="min-w-max w-full text-[11px]">
        <thead className="sticky top-0 bg-sky-800 text-white z-[1]">
          <tr>
            <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap">{t('additionalOt.col.date')}</th>
            <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap min-w-[8rem] max-w-[11rem]">{t('additionalOt.col.otType')}</th>
            <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('additionalOt.col.otStart')}</th>
            <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('additionalOt.col.otEnd')}</th>
            <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('additionalOt.col.total')}</th>
            <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap">{t('additionalOt.col.typeOt')}</th>
            <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('additionalOt.col.jobTitle')}</th>
            <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('additionalOt.col.breakType')}</th>
            <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('additionalOt.col.blockPay')}</th>
            <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap">{t('additionalOt.col.approve')}</th>
            <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap min-w-[4rem] max-w-[9rem]">{t('additionalOt.col.note')}</th>
          </tr>
        </thead>
        <tbody>
          {rowsLoading ? (
            <tr>
              <td colSpan={11} className="px-2 py-4 text-center text-gray-500">
                {t('common.loading')}
              </td>
            </tr>
          ) : displayRows.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-2 py-4 text-center text-gray-500">
                {t('additionalOt.noRows')}
              </td>
            </tr>
          ) : (
            displayRows.map((row, idx) => {
              const active = selectedRowIndex === idx;
              const tot = totalMinutesHhmm(row.ot_start, row.ot_end);
              return (
                <tr
                  key={row.clientKey}
                  className={cn('border-b border-gray-100', active && 'bg-sky-100')}
                  onClick={() => !editing && setSelectedRowIndex(idx)}
                >
                  <td className="px-1 py-0.5 align-top text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <input
                        type="date"
                        className={inputCls}
                        disabled={!editing}
                        value={row.work_date}
                        onChange={(e) => updateRow?.(idx, { work_date: e.target.value })}
                      />
                    ) : (
                      <span className="px-1 text-gray-800">{row.work_date || '—'}</span>
                    )}
                  </td>
                  <td className="px-1 py-0.5 align-top" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <select className={inputCls} value={row.ot_type} onChange={(e) => updateRow?.(idx, { ot_type: e.target.value })}>
                        {OT_TYPES.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-1 text-gray-800 block truncate max-w-[14rem]" title={row.ot_type}>
                        {row.ot_type || '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-0.5 align-top" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <input
                        type="text"
                        className={cellInputCls}
                        value={row.ot_start}
                        onChange={(e) => updateRow?.(idx, { ot_start: e.target.value })}
                        onBlur={() => {
                          const v = normalizeTimeInput(row.ot_start);
                          if (v) updateRow?.(idx, { ot_start: v });
                        }}
                      />
                    ) : (
                      cellText(row.ot_start)
                    )}
                  </td>
                  <td className="px-1 py-0.5 align-top" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <input
                        type="text"
                        className={cellInputCls}
                        value={row.ot_end}
                        onChange={(e) => updateRow?.(idx, { ot_end: e.target.value })}
                        onBlur={() => {
                          const v = normalizeTimeInput(row.ot_end);
                          if (v) updateRow?.(idx, { ot_end: v });
                        }}
                      />
                    ) : (
                      cellText(row.ot_end)
                    )}
                  </td>
                  <td className="px-2 py-1 text-center font-mono tabular-nums">{tot.hhmm}</td>
                  <td className="px-1 py-0.5 align-top" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <input type="text" className={inputCls} value={row.type_ot} onChange={(e) => updateRow?.(idx, { type_ot: e.target.value })} />
                    ) : (
                      <span className="px-1 text-gray-800">{row.type_ot?.trim() || '—'}</span>
                    )}
                  </td>
                  <td className="px-1 py-0.5 align-top text-center" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <input
                        type="number"
                        className={cellInputCls}
                        value={row.job_title_code}
                        onChange={(e) => updateRow?.(idx, { job_title_code: parseInt(e.target.value, 10) || 0 })}
                      />
                    ) : (
                      <span className="px-1 text-gray-800">{String(row.job_title_code ?? 0)}</span>
                    )}
                  </td>
                  <td className="px-1 py-0.5 align-top text-center" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <input
                        type="number"
                        className={cellInputCls}
                        value={row.ot_breaktime_type}
                        onChange={(e) => updateRow?.(idx, { ot_breaktime_type: parseInt(e.target.value, 10) || 0 })}
                      />
                    ) : (
                      <span className="px-1 text-gray-800">{String(row.ot_breaktime_type ?? 0)}</span>
                    )}
                  </td>
                  <td className="px-1 py-1 text-center align-top" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <input
                        type="checkbox"
                        checked={row.block_payment}
                        onChange={(e) => updateRow?.(idx, { block_payment: e.target.checked })}
                      />
                    ) : (
                      <span className="text-gray-800">{row.block_payment ? 'Y' : 'N'}</span>
                    )}
                  </td>
                  <td className="px-1 py-0.5 align-top" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <input
                        type="text"
                        className={inputCls}
                        value={row.approve_status}
                        onChange={(e) => updateRow?.(idx, { approve_status: e.target.value })}
                      />
                    ) : (
                      <span className="px-1 text-gray-800">{row.approve_status?.trim() || '—'}</span>
                    )}
                  </td>
                  <td className="px-1 py-0.5 align-top" onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <input type="text" className={inputCls} value={row.note} onChange={(e) => updateRow?.(idx, { note: e.target.value })} />
                    ) : (
                      <span className="px-1 text-gray-800 max-w-[10rem] truncate block" title={row.note}>
                        {row.note?.trim() || '—'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
