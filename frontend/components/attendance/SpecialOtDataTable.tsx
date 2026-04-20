'use client';

import { cn } from '@/lib/utils';
import type { SpecialOtBufferRow } from '@/lib/specialOtModel';

export default function SpecialOtDataTable({
  t,
  empCode,
  displayRows,
  selectedRowIndex,
  setSelectedRowIndex,
  rowsLoading,
}: {
  t: (key: string) => string;
  empCode: string;
  displayRows: SpecialOtBufferRow[];
  selectedRowIndex: number;
  setSelectedRowIndex: (i: number) => void;
  rowsLoading: boolean;
}) {
  const colCount = 16;

  const cellText = (v: string) => (
    <span className="block px-1 py-0.5 text-center font-mono tabular-nums text-gray-800">{v?.trim() ? v : '—'}</span>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex-1 min-h-[8rem] overflow-auto border border-gray-200 rounded-md bg-white">
        <table className="min-w-max w-full text-[11px]">
          <thead className="sticky top-0 bg-sky-800 text-white z-[1]">
            <tr>
              <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap">{t('specialOt.col.empCode')}</th>
              <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('specialOt.dateFrom')}</th>
              <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('specialOt.dateTo')}</th>
              <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('specialOt.col.ot1')}</th>
              <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('specialOt.col.ot15')}</th>
              <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('specialOt.col.ot2')}</th>
              <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('specialOt.col.ot25')}</th>
              <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('specialOt.col.ot3')}</th>
              <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap">{t('specialOt.col.ot6')}</th>
              <th className="px-1.5 py-1 text-center font-semibold whitespace-nowrap min-w-[4rem]">{t('specialOt.col.shiftRadio')}</th>
              <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap">{t('specialOt.col.shiftText')}</th>
              <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap">{t('specialOt.col.food')}</th>
              <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap">{t('specialOt.col.special')}</th>
              <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap min-w-[5rem]">{t('specialOt.col.note')}</th>
              <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap">{t('specialOt.col.status')}</th>
              <th className="px-1.5 py-1 text-left font-semibold whitespace-nowrap">{t('specialOt.col.userUpd')}</th>
            </tr>
          </thead>
          <tbody>
            {rowsLoading ? (
              <tr>
                <td colSpan={colCount} className="px-2 py-4 text-center text-gray-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-2 py-4 text-center text-gray-500">
                  {t('specialOt.noRows')}
                </td>
              </tr>
            ) : (
              displayRows.map((row, idx) => {
                const active = selectedRowIndex === idx;
                return (
                  <tr
                    key={row.clientKey}
                    className={cn('border-b border-gray-100 cursor-pointer', active && 'bg-sky-100')}
                    onClick={() => setSelectedRowIndex(idx)}
                  >
                    <td className="px-1 py-0.5 align-top whitespace-nowrap">
                      <span className="px-1 font-medium text-gray-800">{empCode || '—'}</span>
                    </td>
                    <td className="px-1 py-0.5 align-top text-center whitespace-nowrap">
                      <span className="px-1 text-gray-800">{row.date_from || '—'}</span>
                    </td>
                    <td className="px-1 py-0.5 align-top text-center whitespace-nowrap">
                      <span className="px-1 text-gray-800">{row.date_to || '—'}</span>
                    </td>
                    <td className="px-1 py-0.5 align-top">{cellText(row.ot_1)}</td>
                    <td className="px-1 py-0.5 align-top">{cellText(row.ot_1_5)}</td>
                    <td className="px-1 py-0.5 align-top">{cellText(row.ot_2)}</td>
                    <td className="px-1 py-0.5 align-top">{cellText(row.ot_2_5)}</td>
                    <td className="px-1 py-0.5 align-top">{cellText(row.ot_3)}</td>
                    <td className="px-1 py-0.5 align-top">{cellText(row.ot_6)}</td>
                    <td className="px-1 py-1 align-top text-center">
                      <span className="text-gray-800">{row.shift_slot === 2 ? t('specialOt.shift2') : t('specialOt.shift1')}</span>
                    </td>
                    <td className="px-1 py-0.5 align-top">
                      <span className="px-1 text-gray-800">{row.shift_text?.trim() || '—'}</span>
                    </td>
                    <td className="px-1 py-0.5 align-top">
                      <span className="px-1 text-gray-800">{row.food?.trim() || '—'}</span>
                    </td>
                    <td className="px-1 py-0.5 align-top">
                      <span className="px-1 text-gray-800">{row.special?.trim() || '—'}</span>
                    </td>
                    <td className="px-1 py-0.5 align-top">
                      <span className="px-1 text-gray-800 max-w-[10rem] truncate block" title={row.note}>
                        {row.note?.trim() || '—'}
                      </span>
                    </td>
                    <td className="px-1 py-0.5 align-top">
                      <span className="px-1 text-gray-800">{row.status?.trim() || '—'}</span>
                    </td>
                    <td className="px-1 py-1 align-top text-gray-700 whitespace-nowrap max-w-[8rem] truncate" title={row.user_upd}>
                      {row.user_upd || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
