import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { tip } from './tips';

/**
 * The shared anatomy of the here card, the target card and the HDB room card,
 * so the three read as one family when they sit side by side:
 *
 *   PlaceHead   boxed icon · name · muted meta · optional chip
 *   Ledger      the facts, one row each: icon, label left, value right
 *   Note        a line of consequence (muted, or red when it blocks you)
 *   BTN         primary / secondary / danger / tinted, one height
 *
 * Text uses three roles from the concrete ramp: concrete-50 for what you read,
 * concrete-200 for supporting values, concrete-400 for labels and blurbs.
 */

/** The quieter second line inside a button. */
export function BtnSub({ children }: { children: ReactNode }) {
  return <span className="block font-normal opacity-70">{children}</span>;
}

/** Identity row: what this place (or door) is. */
export function PlaceHead({
  icon,
  title,
  meta,
  aside,
}: {
  icon: IconName;
  title: ReactNode;
  meta?: ReactNode;
  /** Right-hand chip or claim — door status, last seen, the faction holding it. */
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-white/10 bg-black/30 text-concrete-200"
        aria-hidden
      >
        <Icon name={icon} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-read font-semibold text-concrete-50">{title}</div>
        {meta && <div className="mt-1 text-body text-concrete-400">{meta}</div>}
      </div>
      {aside}
    </div>
  );
}

/** A quiet tag beside the name. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-micro text-concrete-200">
      {children}
    </span>
  );
}

/** The facts box. Rows go in as {@link LedgerRow}; {@link LedgerRule} splits groups. */
export function Ledger({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded bg-black/30 px-2 py-1.5 text-body">{children}</div>
  );
}

export function LedgerRow({
  icon,
  label,
  children,
  tip: tipText,
}: {
  icon: IconName;
  label: ReactNode;
  children: ReactNode;
  tip?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3" {...tip(tipText)}>
      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-concrete-400">
        <Icon name={icon} />
        {label}
      </span>
      <span className="min-w-0 text-right tabular-nums text-concrete-50">{children}</span>
    </div>
  );
}

export function LedgerRule() {
  return <div className="my-0.5 border-t border-white/10" aria-hidden />;
}

/** `filled` of `of` dots in one colour, the rest ghosted — danger, ruin, standing. */
export function Dots({ filled, of, color }: { filled: number; of: number; color?: string }) {
  const n = Math.max(0, Math.min(of, filled));
  return (
    <span style={color ? { color } : undefined}>
      {'●'.repeat(n)}
      <span className="text-white/15">{'●'.repeat(of - n)}</span>
    </span>
  );
}

/** One line of consequence under the ledger. `warn` is for what blocks or bites. */
export function Note({
  tone = 'muted',
  icon,
  children,
}: {
  tone?: 'muted' | 'warn';
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <p
      className={`flex items-start gap-1.5 text-body ${
        tone === 'warn' ? 'text-hiss' : 'text-concrete-400'
      }`}
    >
      {icon && <Icon name={icon} className="mt-0.5 shrink-0" />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** The stack every card body uses, so section rhythm is the same in all three. */
export function PlaceStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}
