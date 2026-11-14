/**
 * Pure helpers for the live loot list's reveal effect (name revealing in
 * random letter order, per-slot progress). No React, no Date.
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

export type RevealKind = 'shown' | 'frontier' | 'masked';
export interface RevealSegment {
  text: string;
  kind: RevealKind;
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Order in which a name's letters are revealed: a shuffle seeded by `seed`
 * (the slot id), so it is random per find but stable from frame to frame.
 * Spaces are left out — they always show, so word shape reads through.
 */
export function revealOrder(chars: string[], seed: string): number[] {
  const idx = chars.flatMap((c, i) => (c === ' ' ? [] : [i]));
  let state = hashString(seed) || 1;
  const next = () => {
    // xorshift32 — tiny, deterministic, good enough for a shuffle.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/**
 * Reveal a name in random letter order as `progress` goes 0 → 1. Hidden
 * letters show a mask glyph; the next letter to land scrambles while
 * `scrambleTick` is given (the row is being searched). Returns runs of
 * same-kind text for rendering.
 */
export function revealName(
  name: string,
  progress: number,
  scrambleTick: number | null,
  seed: string,
): RevealSegment[] {
  const chars = Array.from(name);
  if (progress >= 1) return [{ text: name, kind: 'shown' }];
  const order = revealOrder(chars, seed);
  const n = Math.min(order.length, Math.floor(Math.max(0, progress) * order.length));
  const kinds: RevealKind[] = chars.map((c) => (c === ' ' ? 'shown' : 'masked'));
  for (let k = 0; k < n; k++) kinds[order[k]] = 'shown';
  const frontierAt = n < order.length ? order[n] : -1;
  if (frontierAt >= 0) kinds[frontierAt] = 'frontier';

  const segs: RevealSegment[] = [];
  chars.forEach((c, i) => {
    const kind = kinds[i];
    let text = c;
    if (kind === 'masked') {
      // Glyph picked from the hidden character: stable, varies between names.
      text = MASK[((c.codePointAt(0) ?? 0) + i) % MASK.length];
    } else if (kind === 'frontier') {
      text =
        scrambleTick == null
          ? MASK[((c.codePointAt(0) ?? 0) + i) % MASK.length]
          : SCRAMBLE[(scrambleTick + i) % SCRAMBLE.length];
    }
    const last = segs[segs.length - 1];
    if (last && last.kind === kind) last.text += text;
    else segs.push({ text, kind });
  });
  return segs;
}
