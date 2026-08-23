import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { tip } from '../tips';
import { clampBox } from '../tips/clamp';

export type ContextMenuAction = {
  id: string;
  label: string;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
  onSelect: () => void;
};

export function ItemContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { left, top } = clampBox(rect.width, rect.height, x, y);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, actions]);

  return createPortal(
    <div
      ref={rootRef}
      className="fixed z-[930] min-w-[9rem] overflow-hidden rounded-md border border-white/20 bg-concrete-900 py-1 shadow-signage"
      style={{ left: x, top: y }}
      role="menu"
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          role="menuitem"
          disabled={a.disabled}
          {...tip(a.title, { placement: 'right' })}
          onClick={() => {
            if (a.disabled) return;
            a.onSelect();
            onClose();
          }}
          className={`block w-full px-3 py-1.5 text-left text-xs transition ${
            a.disabled
              ? 'cursor-not-allowed text-white/25'
              : a.danger
                ? 'text-hiss/90 hover:bg-hiss/15'
                : 'text-concrete-50 hover:bg-white/10'
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
