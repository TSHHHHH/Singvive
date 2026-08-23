import { useEffect, useRef, useState } from 'react';
import {
  DEV_TOOL_STATE_EVENT,
  openEnemyEditor,
  openIconBrowser,
  openLocaleEditor,
  openLootEditor,
  type DevToolId,
  type DevToolStateDetail,
} from './devBridge';
import { tip } from '../components/tips';

const HIDDEN_KEY = 'singvive.devMenuHidden';

const TOOLS: { id: DevToolId; label: string; open: () => void }[] = [
  { id: 'loot', label: 'Loot', open: () => openLootEditor() },
  { id: 'enemies', label: 'Enemies', open: () => openEnemyEditor() },
  { id: 'icons', label: 'Icons', open: () => openIconBrowser() },
  { id: 'locale', label: 'Locale', open: () => openLocaleEditor() },
];

function readHidden(): boolean {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Single DEV launcher — replaces stacked Loot / Enemies chips.
 * Ctrl+Shift+D toggles FAB visibility for clean playtest screenshots.
 */
export function DevToolsMenu() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [hidden, setHidden] = useState(readHidden);
  const [active, setActive] = useState<Partial<Record<DevToolId, boolean>>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onState = (e: Event) => {
      const { tool, open } = (e as CustomEvent<DevToolStateDetail>).detail;
      setActive((prev) => ({ ...prev, [tool]: open }));
      if (open) setPanelOpen(false);
    };
    window.addEventListener(DEV_TOOL_STATE_EVENT, onState);
    return () => window.removeEventListener(DEV_TOOL_STATE_EVENT, onState);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'D' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setHidden((h) => {
          const next = !h;
          try {
            sessionStorage.setItem(HIDDEN_KEY, next ? '1' : '0');
          } catch {
            /* ignore */
          }
          if (next) setPanelOpen(false);
          return next;
        });
        return;
      }
      if (e.key === 'Escape' && panelOpen) {
        const anyToolOpen = Object.values(active).some(Boolean);
        if (!anyToolOpen) {
          e.stopPropagation();
          setPanelOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, active]);

  useEffect(() => {
    if (!panelOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [panelOpen]);

  if (hidden) return null;

  return (
    <div
      ref={rootRef}
      className="fixed bottom-3 left-3 z-[2000] flex flex-col items-start gap-1 max-lg:bottom-auto max-lg:top-14"
    >
      {panelOpen && (
        <div className="mb-1 min-w-[10.5rem] overflow-hidden rounded border border-signal/40 bg-concrete-900/95 shadow-lg">
          <div className="border-b border-white/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Dev tools
          </div>
          <ul className="py-1">
            {TOOLS.map((t) => {
              const isOpen = !!active[t.id];
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => t.open()}
                    className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left text-xs hover:bg-white/5"
                  >
                    <span className={isOpen ? 'font-semibold text-signal' : 'text-white/80'}>
                      {t.label}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wide ${
                        isOpen ? 'text-signal' : 'text-white/30'
                      }`}
                    >
                      {isOpen ? 'open' : 'open →'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-white/10 px-2.5 py-1.5 text-[10px] text-white/35">
            Ctrl+Shift+D hides this
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        className="rounded border border-signal/40 bg-concrete-900/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-signal shadow-lg hover:bg-concrete-800"
        {...tip('DEV tools (Ctrl+Shift+D to hide)')}
        aria-expanded={panelOpen}
      >
        Dev
      </button>
    </div>
  );
}
