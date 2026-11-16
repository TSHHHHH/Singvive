import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { useDockWidth } from './useDockWidth';

export function DockResizeHandle({ width, min, max, resize, commit, cancel }: ReturnType<typeof useDockWidth>) {
  const { t } = useT();
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const abort = useCallback(() => {
    drag.current = null;
    setResizing(false);
    cancel();
  }, [cancel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        abort();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', abort);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', abort);
      cancel();
    };
  }, [abort, cancel]);
  const clamp = (value: number) => Math.round(Math.max(min, Math.min(max, value)));
  return (
    <div role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label={t('ui.dock.resize')} aria-valuemin={min} aria-valuemax={max} aria-valuenow={width}
      title={t('ui.dock.resizeHint')} data-dock-resizer data-dock-resizing={resizing}
      className="group absolute inset-y-0 -right-1 z-30 flex w-2 cursor-col-resize touch-none items-center justify-center focus-visible:outline focus-visible:outline-signal"
      onPointerDown={(e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { pointer: e.pointerId, x: e.clientX, width };
        setResizing(true);
      }}
      onPointerMove={(e) => {
        const active = drag.current;
        if (!active || active.pointer !== e.pointerId) return;
        resize(clamp(active.width + e.clientX - active.x));
      }}
      onPointerUp={(e) => {
        const active = drag.current;
        if (!active || active.pointer !== e.pointerId) return;
        const next = clamp(active.width + e.clientX - active.x);
        drag.current = null;
        setResizing(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
        commit(next);
      }}
      onPointerCancel={abort} onLostPointerCapture={() => { if (drag.current) abort(); }}
      onDoubleClick={() => commit(null)}
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Enter') commit(null);
        else commit(e.key === 'Home' ? min : e.key === 'End' ? max : clamp(width + (e.key === 'ArrowLeft' ? -16 : 16)));
      }}>
      <span aria-hidden className={`h-10 w-1 rounded-full transition-colors group-hover:bg-signal/70 group-focus-visible:bg-signal ${resizing ? 'bg-signal' : 'bg-white/20'}`} />
    </div>
  );
}
