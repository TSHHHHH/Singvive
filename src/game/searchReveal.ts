/**
 * Pure helpers for the live loot list's reveal effect (name typing in,
 * per-slot progress). No React, no Date.
 */
import type { SearchSession, SearchSlot } from './searchSession';

/** Mask glyphs for unrevealed characters (fixed per position, so no flicker). */
const MASK = '▓▒░#%@&$▒░▓';
/** The character about to be revealed cycles through these while searching. */
const SCRAMBLE = '#%@&$?!*/\\<>=+';

/**
 * Per-slot reveal progress 0..1. Paused slots keep their partial progress
 * (remainingMs shrinks when a search is interrupted), so a row never jumps
 * back to empty when the player re-prioritizes.
 */
export function slotProgress(
  slot: SearchSlot,
  session: SearchSession,
  now: number,
): number {
  if (slot.state === 'found' || slot.state === 'taken') return 1;
  if (slot.searchMs <= 0) return 0;
  let done = slot.searchMs - slot.remainingMs;
  if (
    slot.state === 'searching' &&
    session.queue[0] === slot.id &&
    session.searchingStartedAt != null
  ) {
    done += Math.max(0, now - session.searchingStartedAt);
  }
  return Math.max(0, Math.min(1, done / slot.searchMs));
}

/** Split a name into its revealed prefix and a masked tail. */
export function revealName(
  name: string,
  progress: number,
  scrambleTick: number | null,
): { shown: string; frontier: string; masked: string } {
  const chars = Array.from(name);
  if (progress >= 1) return { shown: name, frontier: '', masked: '' };
  const n = Math.min(chars.length, Math.floor(progress * chars.length));
  const shown = chars.slice(0, n).join('');
  const rest = chars.slice(n);
  // Glyph picked from the hidden character itself: stable per position, but
  // different names get different-looking masks.
  const mask = (c: string, i: number) =>
    c === ' ' ? ' ' : MASK[((c.codePointAt(0) ?? 0) + n + i) % MASK.length];
  if (rest.length === 0) return { shown, frontier: '', masked: '' };
  const frontier =
    scrambleTick == null
      ? mask(rest[0], 0)
      : rest[0] === ' '
        ? ' '
        : SCRAMBLE[(scrambleTick + n) % SCRAMBLE.length];
  const masked = rest
    .slice(1)
    .map((c, i) => mask(c, i + 1))
    .join('');
  return { shown, frontier, masked };
}

