/**
 * Pure sequential search session — haul layout, per-slot timing, and queue
 * prioritization. No React, no Date, no Math.random.
 */
import type { ItemDef } from './types';
import { itemDef } from './loot';
import { SEARCH_DIMS, footprint } from './inventory';

export type SlotState = 'fogged' | 'searching' | 'found' | 'taken' | 'abandoned';

export type SearchHighlight = 'pristine' | 'exotic' | 'scarce';

export interface SearchSlot {
  id: string;
  defId: string;
  count: number;
  condition?: number;
  x: number;
  y: number;
  rotated: boolean;
  state: SlotState;
  /** Full real-time search duration for this slot. */
  searchMs: number;
  /** Remaining real-time ms (shrinks when paused mid-search). */
  remainingMs: number;
  /** In-game minutes spent when this slot is revealed. */
  searchMinutes: number;
  /** Materialized instance once found. */
  uid?: string;
  /** One-shot good-find cue after reveal. */
  highlight?: SearchHighlight | null;
}

export interface SearchSession {
  locationId: string;
  /** Site stash that receives overflow when taking / finishing. */
  stashLocationId: string;
  raiding: boolean;
  fled: boolean;
  containerId: string;
  nonce: string;
  slots: SearchSlot[];
  /** Fogged / in-progress slot ids; head is current or next. */
  queue: string[];
  /** Wall-clock ms when the current head entered `searching`. */
  searchingStartedAt: number | null;
  chargeBudget: number;
  revealedCount: number;
  /** Spend against location.remainingSearches (site / raid searches). */
  spendCharges: boolean;
  lastWhisper: string | null;
  /** Charge + danger already applied. */
  settled: boolean;
}

export function qualityMult(def: ItemDef, condition?: number): number {
  let m = 1;
  if (condition !== undefined && condition >= 75) m *= 1.35;
  if (def.exotic) m *= 1.4;
  if ((def.scarcity ?? 1) < 0.45) m *= 1.25;
  return Math.min(1.8, m);
}

export function highlightFor(def: ItemDef, condition?: number): SearchHighlight | null {
  if (def.exotic) return 'exotic';
  if (condition !== undefined && condition >= 75) return 'pristine';
  if ((def.scarcity ?? 1) <= 0.45) return 'scarce';
  return null;
}

export function isGoodFind(def: ItemDef, condition?: number): boolean {
  return highlightFor(def, condition) !== null;
}

export function whisperFor(def: ItemDef, highlight: SearchHighlight | null): string | null {
  if (!highlight) return null;
  if (highlight === 'exotic') return `Something rare — ${def.name}.`;
  if (highlight === 'pristine') return `${def.name} — barely touched.`;
  return `A scarce find: ${def.name}.`;
}

/** Speed factor < 1 means faster searches. */
export function searchSpeedFactor(
  equipSearchSpeed: number,
  perception: number,
  traitSearchSpeed: number,
): number {
  return 1 / (1 + Math.max(0, equipSearchSpeed) + Math.max(0, perception - 5) * 0.04 + Math.max(0, traitSearchSpeed));
}

function slotWeight(def: ItemDef, condition?: number): number {
  return Math.max(1, def.w * def.h) * qualityMult(def, condition);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function cellsFree(
  occupied: Set<string>,
  x: number,
  y: number,
  w: number,
  h: number,
  dims: { w: number; h: number },
): boolean {
  if (x < 0 || y < 0 || x + w > dims.w || y + h > dims.h) return false;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (occupied.has(`${x + dx},${y + dy}`)) return false;
    }
  }
  return true;
}

function markOccupied(occupied: Set<string>, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      occupied.add(`${x + dx},${y + dy}`);
    }
  }
}

function findPlace(
  occupied: Set<string>,
  def: ItemDef,
  dims: { w: number; h: number },
): { x: number; y: number; rotated: boolean } | null {
  for (const rotated of def.w === def.h ? [false] : [false, true]) {
    const { w, h } = footprint(def, rotated);
    for (let y = 0; y <= dims.h - h; y++) {
      for (let x = 0; x <= dims.w - w; x++) {
        if (cellsFree(occupied, x, y, w, h, dims)) return { x, y, rotated };
      }
    }
  }
  return null;
}

export interface SearchLootPiece {
  defId: string;
  count: number;
  condition?: number;
}

/**
 * Pack rolled loot into fogged slots and split the category time budget by weight.
 */
export function buildSearchSession(opts: {
  locationId: string;
  stashLocationId: string;
  raiding: boolean;
  fled: boolean;
  nonce: string;
  pieces: SearchLootPiece[];
  totalMinutes: number;
  speedFactor: number;
  spendCharges?: boolean;
  chargeBudget?: number;
}): SearchSession {
  const dims = SEARCH_DIMS;
  const occupied = new Set<string>();
  const weights: number[] = [];
  const placed: Omit<SearchSlot, 'searchMs' | 'remainingMs' | 'searchMinutes'>[] = [];

  for (let i = 0; i < opts.pieces.length; i++) {
    const piece = opts.pieces[i];
    const def = itemDef(piece.defId);
    if (!def) continue;
    const spot = findPlace(occupied, def, dims);
    if (!spot) continue;
    const { w, h } = footprint(def, spot.rotated);
    markOccupied(occupied, spot.x, spot.y, w, h);
    weights.push(slotWeight(def, piece.condition));
    placed.push({
      id: `${opts.nonce}:${i}`,
      defId: piece.defId,
      count: piece.count,
      condition: piece.condition,
      x: spot.x,
      y: spot.y,
      rotated: spot.rotated,
      state: 'fogged',
      highlight: null,
    });
  }

  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const speed = Math.max(0.35, opts.speedFactor);
  const slots: SearchSlot[] = placed.map((p, i) => {
    const w = weights[i] ?? 1;
    const searchMs = Math.round(clamp(450 + w * 350, 400, 3500) * speed);
    const searchMinutes = opts.totalMinutes * (w / weightSum);
    return {
      ...p,
      searchMs,
      remainingMs: searchMs,
      searchMinutes,
    };
  });

  return {
    locationId: opts.locationId,
    stashLocationId: opts.stashLocationId,
    raiding: opts.raiding,
    fled: opts.fled,
    containerId: `search:${opts.locationId}:${opts.nonce}`,
    nonce: opts.nonce,
    slots,
    queue: slots.map((s) => s.id),
    searchingStartedAt: null,
    chargeBudget: opts.chargeBudget ?? 1,
    revealedCount: 0,
    spendCharges: opts.spendCharges ?? true,
    lastWhisper: null,
    settled: false,
  };
}

/** Fractional search-charge spent on abort (empty haul handled by caller). */
export function abortChargeSpent(session: SearchSession): number {
  const total = session.slots.length;
  if (total === 0) return session.chargeBudget;
  const frac = session.revealedCount / total;
  // Starting a search always costs something — cancel after zero reveals isn't free.
  return session.chargeBudget * Math.max(0.15, frac);
}

export function remainingSearchMinutes(session: SearchSession): number {
  return session.slots
    .filter((s) => s.state === 'fogged' || s.state === 'searching')
    .reduce((sum, s) => sum + s.searchMinutes, 0);
}

/**
 * Ensure the queue head is in `searching`. Pass `now` (Date.now) from the store/UI.
 */
export function ensureSearching(session: SearchSession, now: number): SearchSession {
  if (session.queue.length === 0) {
    return { ...session, searchingStartedAt: null, lastWhisper: null };
  }
  const headId = session.queue[0];
  const head = session.slots.find((s) => s.id === headId);
  if (!head || head.state === 'found' || head.state === 'taken' || head.state === 'abandoned') {
    return {
      ...session,
      queue: session.queue.slice(1),
      searchingStartedAt: null,
    };
  }
  if (head.state === 'searching' && session.searchingStartedAt != null) return session;
  return {
    ...session,
    lastWhisper: null,
    searchingStartedAt: now,
    slots: session.slots.map((s) =>
      s.id === headId ? { ...s, state: 'searching' as const } : s,
    ),
  };
}

/**
 * Pause the current search (if any) and move `slotId` to the front of the queue.
 */
export function prioritizeSlot(session: SearchSession, slotId: string, now: number): SearchSession {
  const target = session.slots.find((s) => s.id === slotId);
  if (!target || (target.state !== 'fogged' && target.state !== 'searching')) return session;
  if (session.queue[0] === slotId && target.state === 'searching') return session;

  let slots = session.slots;
  const curId = session.queue[0];
  if (curId && session.searchingStartedAt != null) {
    const cur = slots.find((s) => s.id === curId);
    if (cur && cur.state === 'searching') {
      const elapsed = Math.max(0, now - session.searchingStartedAt);
      const left = Math.max(50, cur.remainingMs - elapsed);
      slots = slots.map((s) =>
        s.id === curId ? { ...s, state: 'fogged' as const, remainingMs: left } : s,
      );
    }
  }

  const queue = [slotId, ...session.queue.filter((id) => id !== slotId)];
  return ensureSearching({ ...session, slots, queue, searchingStartedAt: null }, now);
}

export interface RevealResult {
  session: SearchSession;
  /** Minutes of game time to advance. */
  minutes: number;
  slot: SearchSlot;
  highlight: SearchHighlight | null;
  whisper: string | null;
}

/**
 * If the current head's remaining time has elapsed, reveal it.
 * `uid` is the materialized item instance id from the store.
 */
export function tryReveal(
  session: SearchSession,
  now: number,
  uid: string,
): RevealResult | null {
  const active = ensureSearching(session, now);
  if (active.queue.length === 0) return null;
  const headId = active.queue[0];
  const head = active.slots.find((s) => s.id === headId);
  if (!head || head.state !== 'searching' || active.searchingStartedAt == null) return null;

  const elapsed = now - active.searchingStartedAt;
  if (elapsed < head.remainingMs) {
    return null;
  }

  const def = itemDef(head.defId);
  const highlight = highlightFor(def, head.condition);
  const whisper = whisperFor(def, highlight);
  const revealed: SearchSlot = {
    ...head,
    state: 'found',
    remainingMs: 0,
    uid,
    highlight,
  };

  const slots = active.slots.map((s) => (s.id === headId ? revealed : s));
  const next: SearchSession = {
    ...active,
    slots,
    queue: active.queue.slice(1),
    searchingStartedAt: null,
    revealedCount: active.revealedCount + 1,
    lastWhisper: whisper,
  };

  return {
    session: ensureSearching(next, now),
    minutes: head.searchMinutes,
    slot: revealed,
    highlight,
    whisper,
  };
}

/** Progress 0..1 for the currently searching slot. */
export function searchProgress(session: SearchSession, now: number): number {
  const headId = session.queue[0];
  if (!headId || session.searchingStartedAt == null) return 0;
  const head = session.slots.find((s) => s.id === headId);
  if (!head || head.state !== 'searching' || head.remainingMs <= 0) return 0;
  const elapsed = now - session.searchingStartedAt;
  return clamp(elapsed / head.remainingMs, 0, 1);
}

export function allSlotsResolved(session: SearchSession): boolean {
  return session.slots.every((s) => s.state === 'found' || s.state === 'taken' || s.state === 'abandoned');
}

export function hasFoggedOrSearching(session: SearchSession): boolean {
  return session.slots.some((s) => s.state === 'fogged' || s.state === 'searching');
}
