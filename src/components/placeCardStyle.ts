import type { CSSProperties } from 'react';

/** Button classes and the tint helper shared by the place cards (see placeCard.tsx). */
const BTN_BASE =
  'w-full rounded px-3 py-1.5 text-center text-body transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-30 max-lg:min-h-11';

export const BTN = {
  /** The one move the card is selling. */
  primary: `${BTN_BASE} bg-signal/80 font-bold text-black hover:bg-signal`,
  /** Everything else you could do here. */
  secondary: `${BTN_BASE} border border-white/15 text-concrete-50 hover:bg-white/5`,
  /** Loud and costly: forcing, fighting. */
  danger: `${BTN_BASE} border border-hiss/50 text-hiss hover:bg-hiss/10`,
  /** Wears someone else's colour (a faction, an MRT line) — pair with {@link tint}. */
  tinted: `${BTN_BASE} border hover:brightness-125`,
} as const;

/** Border, wash and ink for a {@link BTN.tinted} button or a claim chip. */
export function tint(color: string): CSSProperties {
  return { color, borderColor: `${color}66`, background: `${color}14` };
}
