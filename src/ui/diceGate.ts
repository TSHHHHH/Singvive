import { useMemo, useRef } from 'react';
import { create } from 'zustand';
import { useGame } from '../game/store';
import { readSetting, useSetting } from '../game/settings';
import type { GameLogEntry } from '../game/types';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// Holding a check's outcome until its die lands.
//
// A check resolves in the store the instant it is made, so the log lines,
// wounds, spent time and sounds it causes all exist before the d20 overlay
// has finished tumbling. Game logic stays that way (headless, replayable);
// the UI instead shows the world as it was before the roll until the overlay
// reaches its verdict. Dice off or reduced motion = nothing is held.
// ---------------------------------------------------------------------------

interface DiceGateState {
  /** Id of the newest roll whose verdict is on screen. */
  revealedId: number | null;
}

const useDiceGate = create<DiceGateState>(() => ({ revealedId: null }));

/** The overlay calls this when the verdict stamps in (or the roll is skipped). */
export function markRollRevealed(id: number): void {
  if (useDiceGate.getState().revealedId !== id) useDiceGate.setState({ revealedId: id });
}

function osPrefersStill(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

/** Same resolution as useReducedMotion, readable outside React. */
function stillNow(): boolean {
  const choice = readSetting('reduceMotion');
  if (choice === 'on') return true;
  if (choice === 'off') return false;
  return osPrefersStill();
}

function pendingFor(id: number | null, revealedId: number | null, diceOn: boolean, still: boolean): boolean {
  return id !== null && diceOn && !still && id !== revealedId;
}

/** Outside React: is a roll on screen whose outcome is still being held? */
export function isDicePending(): boolean {
  const id = useGame.getState().shownRoll?.id ?? null;
  return pendingFor(id, useDiceGate.getState().revealedId, readSetting('diceFx') !== 'off', stillNow());
}

/** Calls `fn` each time a held outcome is released. Returns the unsubscribe. */
export function onDiceRelease(fn: () => void): () => void {
  let was = isDicePending();
  const check = () => {
    const now = isDicePending();
    if (was && !now) fn();
    was = now;
  };
  const a = useGame.subscribe(check);
  const b = useDiceGate.subscribe(check);
  return () => {
    a();
    b();
  };
}

/** True while a die is still tumbling toward a result the player hasn't seen. */
export function useDicePending(): boolean {
  const id = useGame((s) => s.shownRoll?.id ?? null);
  const revealedId = useDiceGate((s) => s.revealedId);
  const diceOn = useSetting('diceFx') !== 'off';
  const still = useReducedMotion();
  return pendingFor(id, revealedId, diceOn, still);
}

/**
 * `value` as it was before the pending roll, while one is pending; the live
 * value otherwise. The roll and its outcome land in the same render, so the
 * last value seen with nothing pending is exactly the pre-roll one.
 */
export function useHeldWhileRolling<T>(value: T): T {
  const pending = useDicePending();
  const held = useRef(value);
  if (!pending) held.current = value;
  return pending ? held.current : value;
}

/** The run log minus the lines a pending roll caused. */
export function useShownLog(): GameLogEntry[] {
  const log = useGame((s) => s.log);
  const mark = useGame((s) => s.shownRoll?.logMark ?? null);
  const pending = useDicePending();
  return useMemo(
    () => (pending && mark !== null ? log.filter((e) => e.id <= mark) : log),
    [log, mark, pending],
  );
}
