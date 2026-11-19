import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './store';
import { cancelPersist, flushPersist } from './persistRun';
import { loadRun } from './storage';
import { migrateBodyParts } from './survival';
import { trekRisk } from './wilds';
import type { ItemInstance, LocationState } from './types';

// Only map input is substituted. The store's meters, clock, log, choice and
// movement mutations remain real; the route always crosses the same rubble.
vi.mock('./route', () => ({
  NO_DRY_ROUTE_MSG: 'No dry route',
  routeLandPath: (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => ({ points: [from, to], lengthM: 100 }),
}));
vi.mock('./playable', async (original) => ({
  ...await original<typeof import('./playable')>(),
  walkabilityOf: () => 'ok',
}));
vi.mock('./wilds', async (original) => ({
  ...await original<typeof import('./wilds')>(),
  trekRisk: vi.fn(() => ({ encounterChance: 0, fightChance: 0, combatDanger: 2,
    hazards: [{ id: 'rubble', kind: 'collapse', severity: 3, lat: 1.3, lng: 103.8, radiusM: 60, discs: [] }],
  })),
}));

describe('surface crossing decisions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    });
    useGame.getState().resetToMenu();
    useGame.getState().commitCharacter({ name: 'Test', occupationId: 'office', traitIds: [],
      attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 } });
    useGame.setState({ phase: 'game', seed: 'crossing-test',
      spawn: { lat: 1.3, lng: 103.8, name: 'Start' },
      currentPos: { lat: 1.3, lng: 103.8 }, pendingCrossing: null,
    });
  });
  afterEach(() => { cancelPersist(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('puts the hazard in the timeline before spending walking energy or time', () => {
    const before = useGame.getState();
    before.trek(1.301, 103.8);
    const after = useGame.getState();
    expect(after.pendingCrossing?.hazards[0]?.kind).toBe('collapse');
    expect(after.log[0]?.crossing).toEqual({ kind: 'noticed', hazards: ['collapse'] });
    expect(after.meters).toEqual(before.meters);
    expect(after.bodyParts).toBe(before.bodyParts);
    expect(after.hour).toBe(before.hour);
    expect(after.currentPos).toEqual(before.currentPos);
    expect(after.travelAnim).toBeNull();
    expect(after.combat).toBeNull();
  });

  it('withdraws without paying for or committing the trip', () => {
    const before = useGame.getState();
    before.trek(1.301, 103.8);
    const event = useGame.getState().pendingCrossing!;
    useGame.getState().chooseCrossing(event.id, 'withdraw');
    const after = useGame.getState();
    expect(after.pendingCrossing).toBeNull();
    expect(after.meters).toEqual(before.meters);
    expect(after.hour).toBe(before.hour);
    expect(after.currentPos).toEqual(before.currentPos);
    expect(after.travelAnim).toBeNull();
  });

  it('rejects an old choice when the same route is considered again', () => {
    useGame.getState().trek(1.301, 103.8);
    const first = useGame.getState().pendingCrossing!;
    useGame.getState().chooseCrossing(first.id, 'withdraw');
    useGame.getState().trek(1.301, 103.8);
    const second = useGame.getState().pendingCrossing!;
    useGame.getState().chooseCrossing(first.id, 'withdraw');
    expect(useGame.getState().pendingCrossing).toBe(second);
  });

  it('settles an accepted crossing once and preserves the normal walking charge', () => {
    const before = useGame.getState();
    before.trek(1.301, 103.8);
    const crossing = useGame.getState().pendingCrossing!;
    useGame.getState().chooseCrossing(crossing.id, 'direct');
    const settled = useGame.getState();
    expect(settled.pendingCrossing).toBeNull();
    expect(settled.meters.energy).toBeLessThan(before.meters.energy);
    expect(settled.hour).toBeGreaterThan(before.hour);
    expect(settled.travelAnim).not.toBeNull();
    expect(settled.log.some((entry) => entry.text.startsWith('Crossing resolved:'))).toBe(true);
    useGame.getState().chooseCrossing(crossing.id, 'careful');
    expect(useGame.getState()).toBe(settled);
  });

  it('pauses a known-site walk before charging it too', () => {
    const site = { id: 'market', name: 'Market', lat: 1.301, lng: 103.8,
      category: 'foodcourt', currentDanger: 2 } as LocationState;
    useGame.setState({ locations: { market: site } });
    const before = useGame.getState();
    before.travel('market');
    const after = useGame.getState();
    expect(after.pendingCrossing?.mode).toBe('road');
    expect(after.pendingCrossing?.target.locationId).toBe('market');
    expect(after.meters).toEqual(before.meters);
    expect(after.hour).toBe(before.hour);
    expect(after.travelAnim).toBeNull();
  });

  it('saves the unanswered decision in v7 without hazard geometry or a prepaid trip', () => {
    const before = useGame.getState();
    before.trek(1.301, 103.8);
    const crossing = useGame.getState().pendingCrossing!;
    flushPersist();
    const run = loadRun()!;
    expect(run.pendingCrossing).toEqual(crossing);
    expect(run.pendingCrossing?.hazards[0]).not.toHaveProperty('discs');
    expect(run.meters).toEqual(before.meters);
    expect(run.hour).toBe(before.hour);
    expect(run.currentPos).toEqual(before.currentPos);
  });

  it('saves a consistent departure decision if hidden during an accepted glide', () => {
    const before = useGame.getState();
    before.trek(1.301, 103.8);
    const crossing = useGame.getState().pendingCrossing!;
    useGame.getState().chooseCrossing(crossing.id, 'direct');
    expect(useGame.getState().travelAnim).not.toBeNull();
    flushPersist();
    const run = loadRun()!;
    expect(run.pendingCrossing).toEqual(crossing);
    expect(run.meters).toEqual(before.meters);
    expect(run.hour).toBe(before.hour);
    expect(run.bodyParts).toEqual(migrateBodyParts(before.bodyParts, before.maxHp));
    expect(run.currentPos).toEqual(before.currentPos);
  });

  it('blocks reading and crafting while the departure choice is pending', () => {
    const carried = (uid: string, defId: string, stack: number): ItemInstance => ({ uid, defId, stack,
      container: 'backpack', x: 0, y: 0, rotated: false });
    useGame.setState({ items: [carried('book', 'book_reservist', 1), carried('cloth', 'cloth_rags', 4)] });
    useGame.getState().trek(1.301, 103.8);
    const before = useGame.getState();
    before.applyItem('book');
    before.craftItem('bandages');
    const after = useGame.getState();
    expect(after.hour).toBe(before.hour);
    expect(after.items).toBe(before.items);
    expect(after.skills).toBe(before.skills);
    expect(after.pendingCrossing).toBe(before.pendingCrossing);
  });

  it('settles cautious travel once with its advertised extra time', () => {
    const before = useGame.getState();
    before.trek(1.301, 103.8);
    let crossing = useGame.getState().pendingCrossing!;
    useGame.getState().chooseCrossing(crossing.id, 'direct');
    const directHour = useGame.getState().hour;
    vi.clearAllTimers();
    useGame.setState(before, true);
    before.trek(1.301, 103.8);
    crossing = useGame.getState().pendingCrossing!;
    useGame.getState().chooseCrossing(crossing.id, 'careful');
    const after = useGame.getState();
    expect(after.hour - directHour).toBeCloseTo(crossing.carefulMinutes / 60);
    expect(after.pendingCrossing).toBeNull();
    useGame.getState().chooseCrossing(crossing.id, 'careful');
    expect(useGame.getState()).toBe(after);
  });

  it('saves the committed arrival after the accepted glide finishes', () => {
    useGame.getState().trek(1.301, 103.8);
    const crossing = useGame.getState().pendingCrossing!;
    useGame.getState().chooseCrossing(crossing.id, 'careful');
    vi.advanceTimersByTime(useGame.getState().travelAnim!.durationMs);
    const arrived = useGame.getState();
    expect(arrived.travelAnim).toBeNull();
    expect(arrived.currentPos).toEqual({ lat: 1.301, lng: 103.8 });
    flushPersist();
    const run = loadRun()!;
    expect(run.pendingCrossing).toBeNull();
    expect(run.currentPos).toEqual(arrived.currentPos);
    expect(run.meters).toEqual(arrived.meters);
    expect(run.hour).toBe(arrived.hour);
  });

  it('retains the presented hazard if map geometry is not loaded when a saved choice resumes', () => {
    useGame.getState().trek(1.301, 103.8);
    const crossing = useGame.getState().pendingCrossing!;
    vi.mocked(trekRisk).mockReturnValueOnce({ encounterChance: 0, fightChance: 0, combatDanger: 2, hazards: [] });
    useGame.getState().chooseCrossing(crossing.id, 'careful');
    const outcome = useGame.getState().log.find((entry) => entry.crossing?.kind === 'resolved')?.crossing;
    expect(outcome?.kind).toBe('resolved');
    if (outcome?.kind === 'resolved') expect(outcome.extraMinutes).toBe(crossing.carefulMinutes);
  });
});
