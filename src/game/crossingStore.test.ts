import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './store';
import { cancelPersist, flushPersist } from './persistRun';
import { loadRun } from './storage';
import { rollHazardChecks, trekRisk } from './wilds';
import type { LocationState } from './types';

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
vi.mock('./wilds', async (original) => {
  const actual = await original<typeof import('./wilds')>();
  return {
    ...actual,
    trekRisk: vi.fn(() => ({ encounterChance: 0, fightChance: 0, combatDanger: 2,
      hazards: [{ id: 'rubble', kind: 'collapse', severity: 3, lat: 1.3, lng: 103.8, radiusM: 60, discs: [] }],
    })),
    // By default the zone catches the survivor; the check
    // itself is covered in wilds.test.ts. Individual tests override the result.
    rollHazardChecks: vi.fn((...args: Parameters<typeof actual.rollHazardChecks>) =>
      actual.rollHazardChecks(...args).map((check) => ({ ...check, success: false }))),
  };
});

describe('surface hazard crossings', () => {
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
      currentPos: { lat: 1.3, lng: 103.8 },
    });
  });
  afterEach(() => { cancelPersist(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('crosses a zone that catches the survivor straight away, with no decision', () => {
    const before = useGame.getState();
    before.trek(1.301, 103.8);
    const after = useGame.getState();
    expect(after.log.some((entry) => entry.crossing?.kind === 'caught')).toBe(true);
    expect(after.log.some((entry) => entry.crossing?.kind === 'resolved')).toBe(true);
    expect(after.meters.energy).toBeLessThan(before.meters.energy);
    expect(after.hour).toBeGreaterThan(before.hour);
    expect(after.travelAnim).not.toBeNull();
  });

  it('crosses on a known-site walk too', () => {
    const site = { id: 'market', name: 'Market', lat: 1.301, lng: 103.8,
      category: 'foodcourt', currentDanger: 2 } as LocationState;
    useGame.setState({ locations: { market: site } });
    const before = useGame.getState();
    before.travel('market');
    const after = useGame.getState();
    expect(after.log.some((entry) => entry.crossing?.kind === 'caught')).toBe(true);
    expect(after.hour).toBeGreaterThan(before.hour);
    expect(after.travelAnim?.toId).toBe('market');
  });

  it('walks straight past a zone when the check passes, with no crossing result', () => {
    vi.mocked(rollHazardChecks).mockImplementationOnce((_rng, hazards) => hazards.map((zone) => ({
      zone, mode: 'cross' as const, attr: 'dexterity' as const, roll: 18, total: 23, dc: 17, success: true,
    })));
    const before = useGame.getState();
    before.trek(1.301, 103.8);
    const after = useGame.getState();
    expect(after.travelAnim).not.toBeNull();
    expect(after.meters.energy).toBeLessThan(before.meters.energy);
    expect(after.log.some((entry) => entry.crossing?.kind === 'slipped')).toBe(true);
    expect(after.log.some((entry) => entry.crossing?.kind === 'caught')).toBe(false);
    expect(after.log.some((entry) => entry.crossing?.kind === 'resolved')).toBe(false);
    const hp = (parts: typeof before.bodyParts) => Object.values(parts).map((part) => part.hp);
    expect(hp(after.bodyParts)).toEqual(hp(before.bodyParts));
  });

  it('crosses only the zones that caught the survivor', () => {
    vi.mocked(trekRisk).mockReturnValueOnce({ encounterChance: 0, fightChance: 0, combatDanger: 2, hazards: [
      { id: 'rubble', kind: 'collapse', severity: 3, lat: 1.3, lng: 103.8, radiusM: 60, discs: [] },
      { id: 'pack', kind: 'horde_pocket', severity: 2, lat: 1.3, lng: 103.8, radiusM: 60, discs: [] },
    ] });
    vi.mocked(rollHazardChecks).mockImplementationOnce((_rng, hazards) => hazards.map((zone) => ({
      zone, mode: 'exit' as const, attr: 'perception' as const, roll: 10, total: 15, dc: 12,
      success: zone.kind === 'horde_pocket',
    })));
    useGame.getState().trek(1.301, 103.8);
    const log = useGame.getState().log;
    expect(log.find((entry) => entry.crossing?.kind === 'caught')?.crossing).toEqual({ kind: 'caught', hazards: ['collapse'] });
    expect(log.some((entry) => entry.crossing?.kind === 'slippedOut')).toBe(true);
  });

  it('ignores a decision left in an older save and loads at the departure point', () => {
    useGame.getState().trek(1.301, 103.8);
    vi.advanceTimersByTime(useGame.getState().travelAnim!.durationMs);
    flushPersist();
    const raw = JSON.parse(localStorage.getItem('singvive.run.v7')!);
    raw.pendingCrossing = { id: 'old', mode: 'trek', target: { lat: 1.302, lng: 103.8 },
      from: raw.currentPos, day: 1, hour: 8, hazards: [], carefulMinutes: 9 };
    localStorage.setItem('singvive.run.v7', JSON.stringify(raw));
    expect(loadRun()?.currentPos).toEqual({ lat: 1.301, lng: 103.8 });
    useGame.getState().continueRun();
    const resumed = useGame.getState();
    expect(resumed.phase).toBe('game');
    expect(resumed.currentPos).toEqual({ lat: 1.301, lng: 103.8 });
    expect('pendingCrossing' in resumed).toBe(false);
  });
});
