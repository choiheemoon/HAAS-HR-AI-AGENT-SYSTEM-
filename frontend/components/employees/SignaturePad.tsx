'use client';

import { useCallback, useEffect, useRef } from 'react';

const LOGICAL_W = 320;
const LOGICAL_H = 120;

type Props = {
  className?: string;
  onChange: (pngDataUrl: string | null) => void;
  t: (key: string, fallback?: string) => string;
};

export function SignaturePad({ className = '', onChange, t }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const hasInkRef = useRef(false);

  const setupCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    c.width = LOGICAL_W * dpr;
    c.height = LOGICAL_H * dpr;
    c.style.width = `${LOGICAL_W}px`;
    c.style.height = `${LOGICAL_H}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    hasInkRef.current = false;
  }, []);

  useEffect(() => {
    setupCanvas();
  }, [setupCanvas]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const scaleX = LOGICAL_W / r.width;
    const scaleY = LOGICAL_H / r.height;
    return {
      x: (e.clientX - r.left) * scaleX,
      y: (e.clientY - r.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = getPos(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!ctx || !lastRef.current) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    hasInkRef.current = true;
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    const c = canvasRef.current;
    if (!c || !hasInkRef.current) return;
    try {
      const url = c.toDataURL('image/png');
      if (url && url.length > 200) onChange(url);
    } catch {
      onChange(null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    endStroke();
  };

  const handleClear = () => {
    setupCanvas();
    onChange(null);
  };

  return (
    <div className={`flex flex-col items-end gap-1.5 ${className}`}>
      <p className="text-[11px] text-gray-600 text-right max-w-[320px]">
        {t('employees.personnelRecord.signatureDrawHere', '아래 영역에 손가락·펜·마우스로 서명하세요.')}
      </p>
      <canvas
        ref={canvasRef}
        className="touch-none cursor-crosshair rounded border border-gray-400 bg-white shadow-sm"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(e) => {
          if (drawingRef.current) {
            endStroke();
          }
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }}
        aria-label={t('employees.personnelRecord.signatureAria', '전자서명')}
      />
      <button
        type="button"
        onClick={handleClear}
        className="text-xs px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      >
        {t('employees.personnelRecord.signatureClear', '서명 지우기')}
      </button>
    </div>
  );
}
