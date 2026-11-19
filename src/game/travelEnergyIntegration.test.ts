import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './store';
import { cancelPersist } from './persistRun';
import { haversine } from './overpass';
import { routeLandPath } from './route';
import { vegetationCost } from './vegetation';
import { resolveCrossing } from './wilds';
import { surfaceTravelProfile } from './travelEnergy';
import type { LocationState } from './types';

// Control route geometry and encounters; keep the store, clock, meters and costs real.
vi.mock('./route', async (original) => ({ ...await original<typeof import('./route')>(), routeLandPath: vi.fn() }));
vi.mock('./vegetation', () => ({ vegetationCost: vi.fn() }));
vi.mock('./playable', async (original) => ({ ...await original<typeof import('./playable')>(), walkabilityOf: () => 'ok' }));
vi.mock('./wilds', async (original) => ({ ...await original<typeof import('./wilds')>(), resolveCrossing: vi.fn() }));

const from = { lat: 1.3, lng: 103.85 };
const target = (metres: number) => ({ lat: from.lat + metres / 6371000 * 180 / Math.PI, lng: from.lng });

beforeEach(() => {
  vi.useFakeTimers();
  useGame.setState(useGame.getInitialState(), true);
  useGame.getState().commitCharacter({ name: 'Walker', traitIds: [],
    attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 } });
  const equipment = { ...useGame.getState().equipment };
  for (const slot of Object.keys(equipment) as (keyof typeof equipment)[]) equipment[slot] = null;
  useGame.setState({ phase: 'game', seed: 'walking-budget', spawn: null, currentPos: from,
    hour: 8, items: [], equipment, meters: { hunger: 50, thirst: 50, energy: 15, infection: 0 } });
  vi.mocked(routeLandPath).mockImplementation((a, b) => ({ points: [a, b], lengthM: haversine(a.lat, a.lng, b.lat, b.lng), detoured: false }));
  vi.mocked(vegetationCost).mockReturnValue({ travelMult: 1, patches: [] });
  vi.mocked(resolveCrossing).mockReturnValue({ energyCost: 0, extraHours: 0, woundHp: 0,
    woundPreferLeg: false, infectionDelta: 0, ambush: null, logs: [], travelFind: null });
});
afterEach(async () => { await Promise.resolve(); cancelPersist(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

function move(mode: 'trek' | 'travel', metres: number) {
  const to = target(metres);
  if (mode === 'trek') useGame.getState().trek(to.lat, to.lng);
  else {
    const site: LocationState = { id: 'target', name: 'Target', ...to, category: 'clinic', size: 'small',
      baseDanger: 0, currentDanger: 0, discovered: false, remainingSearches: 1,
      exhausted: false, factionId: null, distanceFromSpawn: metres };
    useGame.setState({ locations: { target: site } });
    useGame.getState().travel('target');
  }
}

describe.each(['travel', 'trek'] as const)('%s surface energy', (mode) => {
  it('short hops advance time and earn only proportional fitness practice', () => {
    move(mode, 2);
    const after = useGame.getState();
    expect(after.travelAnim).not.toBeNull();
    expect(after.hour).toBeGreaterThan(8);
    expect(after.meters.thirst).toBeLessThan(50);
    expect(after.skills.fitness.xp).toBeGreaterThan(0);
    expect(after.skills.fitness.xp).toBeLessThan(0.1);
  });

  it('can spend the full budget and rejects destinations just beyond it', () => {
    move(mode, 150.01);
    expect(useGame.getState().travelAnim).toBeNull();
    expect(useGame.getState().meters.energy).toBe(15);
    move(mode, 150);
    expect(useGame.getState().travelAnim).not.toBeNull();
    expect(useGame.getState().meters.energy).toBeCloseTo(0, 8);
    vi.advanceTimersByTime(useGame.getState().travelAnim!.durationMs);
    expect(useGame.getState().travelAnim).toBeNull();
    expect(useGame.getState().currentPos.lat).toBeCloseTo(target(150).lat, 10);
    expect(useGame.getState().meters.energy).toBeCloseTo(0, 8);
  });

  it('charges the same energy across a long detour and forest, while time and thirst advance', () => {
    vi.mocked(routeLandPath).mockImplementation((a, b) => ({ points: [a, b], lengthM: 900, detoured: true }));
    vi.mocked(vegetationCost).mockReturnValue({ travelMult: 1.85, patches: [] });
    move(mode, 100);
    const after = useGame.getState();
    expect(after.travelAnim).not.toBeNull();
    expect(after.meters.energy).toBeCloseTo(5, 8);
    expect(after.hour).toBeGreaterThan(8.5);
    expect(after.meters.thirst).toBeLessThan(50);
    expect(after.meters.hunger).toBeLessThan(50);
  });

  it('allows a short affordable walk below five energy', () => {
    useGame.setState({ meters: { ...useGame.getState().meters, energy: 4 } });
    move(mode, 35);
    expect(useGame.getState().travelAnim).not.toBeNull();
    expect(useGame.getState().meters.energy).toBeCloseTo(0.5, 8);
  });

  it('charges explicit encounter energy but not its extra travel time', () => {
    vi.mocked(resolveCrossing).mockReturnValue({ energyCost: 2, extraHours: 1, woundHp: 0,
      woundPreferLeg: false, infectionDelta: 0, ambush: null, logs: [], travelFind: null });
    move(mode, 100);
    expect(useGame.getState().meters.energy).toBeCloseTo(3, 8);
    expect(useGame.getState().hour).toBeGreaterThan(9);
  });

  it('uses the same fitness bonuses as the displayed range', () => {
    const skills = { ...useGame.getState().skills, fitness: { level: 5, xp: 0 } };
    useGame.setState({ skills });
    const s = useGame.getState();
    const profile = surfaceTravelProfile({ ...s, character: s.character! });
    expect(profile.range).toBeCloseTo(200);
    move(mode, profile.range);
    expect(useGame.getState().travelAnim).not.toBeNull();
    expect(useGame.getState().meters.energy).toBeCloseTo(0, 8);
  });

  it('shows zero range and refuses to move when pinned by load', () => {
    useGame.setState({ items: [{ uid: 'heavy', defId: 'scrap_metal', stack: 1000,
      container: 'backpack', x: 0, y: 0, rotated: false }] });
    const s = useGame.getState();
    expect(surfaceTravelProfile({ ...s, character: s.character! }).range).toBe(0);
    move(mode, 10);
    expect(useGame.getState().travelAnim).toBeNull();
    expect(useGame.getState().meters.energy).toBe(15);
  });
});
