'use client';

import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

type TFn = (key: string, fallback?: string) => string;

type Props = {
  open: boolean;
  portalReady: boolean;
  progress: { percent: number; done: number; total: number } | null;
  t: TFn;
};

export default function AttendanceAggregateBusyOverlay({ open, portalReady, progress, t }: Props) {
  if (!portalReady || !open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex cursor-wait items-center justify-center bg-slate-900/35 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-labelledby="attendance-aggregate-busy-title"
    >
      <div className="pointer-events-none mx-4 flex w-full max-w-md cursor-default flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-8 py-7 shadow-2xl">
        <Loader2 className="h-10 w-10 animate-spin text-slate-700" aria-hidden />
        <p id="attendance-aggregate-busy-title" className="text-center text-sm font-semibold text-slate-900">
          {t('attendanceAggregate.running')}
        </p>
        {progress != null && progress.total > 0 && (
          <>
            <p className="text-center text-2xl font-semibold tabular-nums text-slate-900" aria-live="polite">
              {t('attendanceAggregate.progressPercent').replace('{n}', String(progress.percent))}
            </p>
            <p className="text-center text-xs text-slate-500 tabular-nums">
              {t('attendanceAggregate.progressCounts')
                .replace('{done}', String(progress.done))
                .replace('{total}', String(progress.total))}
            </p>
            <div
              className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              aria-label={t('attendanceAggregate.running')}
            >
              <div
                className="h-full rounded-full bg-slate-800 transition-[width] duration-150 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </>
        )}
        <p className="text-center text-xs leading-relaxed text-slate-600">{t('attendanceAggregate.blockUiHint')}</p>
      </div>
    </div>,
    document.body
  );
}
