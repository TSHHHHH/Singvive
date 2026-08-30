import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useT } from '../i18n';
import { tip } from './tips';

interface FoldApi {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
}

const FoldContext = createContext<FoldApi | null>(null);

export function useStatFold(): FoldApi {
  const ctx = useContext(FoldContext);
  if (!ctx) throw new Error('useStatFold requires StatFoldProvider');
  return ctx;
}

/**
 * Per-card expand/collapse for stat breakdowns. Expand/collapse all reset
 * individual row overrides inside this card only.
 */
export function StatFoldProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [defaultOpen, setDefaultOpen] = useState(true);

  const isOpen = useCallback(
    (id: string) => (Object.hasOwn(overrides, id) ? overrides[id]! : defaultOpen),
    [overrides, defaultOpen],
  );

  const toggle = useCallback(
    (id: string) => {
      setOverrides((prev) => {
        const current = Object.hasOwn(prev, id) ? prev[id]! : defaultOpen;
        return { ...prev, [id]: !current };
      });
    },
    [defaultOpen],
  );

  const expandAll = useCallback(() => {
    setOverrides({});
    setDefaultOpen(true);
  }, []);

  const collapseAll = useCallback(() => {
    setOverrides({});
    setDefaultOpen(false);
  }, []);

  const api = useMemo(
    () => ({ isOpen, toggle, expandAll, collapseAll }),
    [isOpen, toggle, expandAll, collapseAll],
  );

  return <FoldContext.Provider value={api}>{children}</FoldContext.Provider>;
}

const FOLD_BTN =
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/15 text-white/45 transition hover:border-signal/40 hover:text-signal';

function DoubleChevron({ dir }: { dir: 'up' | 'down' }) {
  const mark = dir === 'up' ? '▴' : '▾';
  return (
    <span className="flex flex-col items-center text-[9px] leading-[0.65]" aria-hidden>
      <span>{mark}</span>
      <span>{mark}</span>
    </span>
  );
}

function StatFoldBar() {
  const { t } = useT();
  const fold = useStatFold();
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={FOLD_BTN}
        onClick={fold.collapseAll}
        {...tip(t('ui.stats.collapseAll'), { label: true })}
      >
        <DoubleChevron dir="up" />
      </button>
      <button
        type="button"
        className={FOLD_BTN}
        onClick={fold.expandAll}
        {...tip(t('ui.stats.expandAll'), { label: true })}
      >
        <DoubleChevron dir="down" />
      </button>
    </div>
  );
}

/** Category card: title stays put; fold controls sit top-right as icons. */
export function StatCard({
  title,
  foldable = false,
  children,
}: {
  title: string;
  foldable?: boolean;
  children: ReactNode;
}) {
  const inner = (
    <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-xs uppercase tracking-widest text-white/30">
          {title}
        </h4>
        {foldable && <StatFoldBar />}
      </div>
      {children}
    </section>
  );
  return foldable ? <StatFoldProvider>{inner}</StatFoldProvider> : inner;
}
