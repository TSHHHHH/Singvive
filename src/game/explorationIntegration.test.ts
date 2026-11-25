import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './store';
import { cancelPersist, flushPersist } from './persistRun';
import { loadRun } from './storage';
import { buildSearchSession } from './searchSession';
import type { LocationState } from './types';

const pos = { lat: 1.3, lng: 103.85 };
function site(id: string, offset = 0, category: LocationState['category'] = 'community'): LocationState {
  return { id, name: id, lat: pos.lat + offset, lng: pos.lng, category, size: 'small',
    baseDanger: 3, currentDanger: 3, factionId: null, isFactionRevealed: false,
    discovered: false, lastSeen: null, remainingSearches: 3, exhausted: false,
    looted: false, cleared: false, distanceFromSpawn: 0 };
}

beforeEach(() => {
  vi.useFakeTimers();
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  useGame.setState(useGame.getInitialState(), true);
  useGame.getState().commitCharacter({ name: 'Explorer', traitIds: [],
    attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 } });
  useGame.setState({ phase: 'game', seed: 'exploration-integration', spawn: { ...pos, name: 'Test' },
    currentPos: pos, currentPositionId: 'source', locations: {
      source: { ...site('source', 0, 'mrt'), discovered: true, visited: true },
      clinic: site('clinic', 0.001, 'clinic'), market: site('market', 0.002, 'supermarket'),
      distant: site('distant', 0.01, 'hospital'),
    } });
});
afterEach(() => { cancelPersist(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('local exploration store integration', () => {
  it('reads an MRT map once, costs five minutes and only identifies local destinations', () => {
    const before = useGame.getState();
    before.readLocalMap();
    const after = useGame.getState();
    expect(after.hour - before.hour).toBeCloseTo(5 / 60);
    expect(after.locations.source.localMapRead).toBe(true);
    expect(after.explorationLeads.length).toBeGreaterThan(0);
    expect(after.explorationLeads.every((lead) => lead.source === 'locality')).toBe(true);
    for (const lead of after.explorationLeads) {
      const target = after.locations[lead.targetId];
      expect(target.identified).toBe(true);
      expect(target.discovered).toBe(false);
      expect(target.lastSeen).toBeNull();
      expect(target.visited).not.toBe(true);
    }
    expect(after.locations.distant.identified).not.toBe(true);
    expect(after.exploredArea).toBe(before.exploredArea);
    expect(after.nearbyRecognition).toEqual([]);
    after.readLocalMap();
    expect(useGame.getState().hour).toBe(after.hour);
    expect(useGame.getState().explorationLeads).toBe(after.explorationLeads);
  });

  it.each(['combat', 'pendingEvent', 'pendingSearch', 'travelAnim', 'hdb', 'tunnel'] as const)(
    'cannot read a map while %s is active', (busy) => {
      useGame.setState({ [busy]: {} } as Partial<ReturnType<typeof useGame.getState>>);
      const before = useGame.getState();
      before.readLocalMap();
      expect(useGame.getState().hour).toBe(before.hour);
      expect(useGame.getState().locations).toBe(before.locations);
      expect(useGame.getState().explorationLeads).toHaveLength(0);
    },
  );

  it('keeps a full logbook from consuming a map or charging time', () => {
    useGame.setState({ explorationLeads: Array.from({ length: 6 }, (_, i) => ({
      id: `old${i}`, sourceId: 'source', targetId: `target${i}`, source: 'search' as const, createdDay: 1,
    })) });
    const before = useGame.getState();
    before.readLocalMap();
    expect(useGame.getState().hour).toBe(before.hour);
    expect(useGame.getState().locations.source.localMapRead).not.toBe(true);
  });

  it('persists identity, leads and spent boards in the existing v7 save', () => {
    useGame.getState().readLocalMap();
    flushPersist();
    const run = loadRun()!;
    expect(run).not.toBeNull();
    expect(run.explorationLeads).toEqual(useGame.getState().explorationLeads);
    expect(run.locations.source.localMapRead).toBe(true);
    expect(run.locations[run.explorationLeads![0].targetId].identified).toBe(true);
  });

  it('loads a pre-exploration v7 save with no leads and preserves the survivor', () => {
    useGame.getState().readLocalMap();
    flushPersist();
    const legacy = JSON.parse(localStorage.getItem('singvive.run.v7')!);
    delete legacy.explorationLeads;
    for (const loc of Object.values(legacy.locations) as Record<string, unknown>[]) {
      delete loc.identified;
      delete loc.visited;
      delete loc.localMapRead;
    }
    localStorage.setItem('singvive.run.v7', JSON.stringify(legacy));
    const run = loadRun()!;
    expect(run.character.name).toBe('Explorer');
    expect(run.explorationLeads).toEqual([]);
    expect(run.locations.source.discovered).toBe(true);
    expect(run.locations.clinic.discovered).toBe(false);
    expect(run.currentPositionId).toBe('source');
  });

  it('keeps taken and abandoned finds in the same search result', () => {
    const session = buildSearchSession({ locationId: 'source', stashLocationId: 'source',
      raiding: false, fled: false, nonce: 'mixed-haul',
      pieces: [{ defId: 'scrap_metal', count: 1 }, { defId: 'canned_food', count: 1 }],
      totalMinutes: 5, speedFactor: 1 });
    useGame.setState({ log: [], pendingSearch: { ...session, queue: [],
      slots: session.slots.map((slot, i) => ({ ...slot, state: i === 0 ? 'taken' : 'found' })) } });
    useGame.getState().abortSearch();
    const hauls = useGame.getState().log.filter((entry) => entry.loot?.length || entry.leftover?.length);
    expect(hauls).toHaveLength(1);
    expect(hauls[0].loot).toEqual([{ defId: session.slots[0].defId, count: 1 }]);
    expect(hauls[0].leftover).toEqual([{ defId: session.slots[1].defId, count: 1 }]);
  });

  it('checks for a search clue only after a full street search, never on abort', () => {
    const session = buildSearchSession({ locationId: 'source', stashLocationId: 'source',
      raiding: false, fled: false, nonce: 'fixture', pieces: [{ defId: 'scrap_metal', count: 1 }],
      totalMinutes: 5, speedFactor: 1 });
    useGame.setState({ pendingSearch: session });
    useGame.getState().abortSearch();
    expect(useGame.getState().locations.source.searchClueChecked).not.toBe(true);
    expect(useGame.getState().explorationLeads).toHaveLength(0);
    useGame.setState({ pendingSearch: { ...session, queue: [], revealedCount: 1,
      slots: session.slots.map((slot) => ({ ...slot, state: 'taken', remainingMs: 0 })) } });
    useGame.getState().completeSearch();
    expect(useGame.getState().locations.source.searchClueChecked).toBe(true);
    const first = useGame.getState().explorationLeads;
    useGame.setState({ pendingSearch: { ...session, queue: [], revealedCount: 1,
      slots: session.slots.map((slot) => ({ ...slot, state: 'taken', remainingMs: 0 })) } });
    useGame.getState().completeSearch();
    expect(useGame.getState().explorationLeads).toBe(first);
  });

  it('resets leads for a new survivor', () => {
    useGame.getState().readLocalMap();
    useGame.setState({ nearbyRecognition: ['clinic'] });
    useGame.getState().commitCharacter(useGame.getState().character!);
    expect(useGame.getState().explorationLeads).toEqual([]);
    expect(useGame.getState().nearbyRecognition).toEqual([]);
  });

  it('tracks one named clue at a time and restores the choice from a v7 save', () => {
    useGame.getState().readLocalMap();
    const state = useGame.getState();
    const [first, second] = state.explorationLeads;
    expect(state.log.some(entry => entry.focus?.leadId === first.id)).toBe(true);
    state.trackLead(first.id);
    state.trackLead(second.id);
    state.trackLead('missing-lead');
    flushPersist();
    expect(loadRun()?.explorationLeads?.filter(l => l.tracked).map(l => l.id)).toEqual([second.id]);
    state.trackLead(null);
    expect(useGame.getState().explorationLeads.some(l => l.tracked)).toBe(false);
  });

  it('dismisses only the displayed cue and never persists the animation', () => {
    const oldCue = ['clinic'];
    const newCue = ['market'];
    useGame.setState({ nearbyRecognition: newCue });
    useGame.getState().dismissNearbyRecognition(oldCue);
    expect(useGame.getState().nearbyRecognition).toBe(newCue);
    useGame.getState().readLocalMap();
    flushPersist();
    expect(JSON.parse(localStorage.getItem('singvive.run.v7')!)).not.toHaveProperty('nearbyRecognition');
    useGame.getState().dismissNearbyRecognition(newCue);
    expect(useGame.getState().nearbyRecognition).toEqual([]);
  });

  it('completes a lead only on arrival and recognizes nearby exteriors without visiting them', async () => {
    useGame.getState().readLocalMap();
    const s = useGame.getState();
    const target = s.locations[s.explorationLeads[0].targetId];
    const neighbour = { ...site('neighbour', 0, 'clinic'), lat: target.lat + 0.00009 };
    useGame.setState({ locations: { ...s.locations, neighbour },
      // Keep this small controlled world: no external bake expansion is needed.
      expandedCells: [`${Math.round(target.lat / 0.009)},${Math.round(target.lng / 0.009)}`],
    });
    s.trackLead(s.explorationLeads[0].id);
    useGame.getState().travel(target.id);
    expect(useGame.getState().explorationLeads[0].tracked).toBe(true);
    expect(useGame.getState().explorationLeads[0].completedDay).toBeUndefined();
    const anim = useGame.getState().travelAnim;
    expect(anim).not.toBeNull();
    await vi.advanceTimersByTimeAsync(anim!.durationMs + 1);
    const arrived = useGame.getState();
    expect(arrived.currentPositionId).toBe(target.id);
    expect(arrived.explorationLeads.some(l => l.tracked)).toBe(false);
    arrived.trackLead(s.explorationLeads[0].id);
    expect(useGame.getState().explorationLeads.some(l => l.tracked)).toBe(false);
    expect(arrived.locations[target.id].visited).toBe(true);
    expect(arrived.explorationLeads.find(lead => lead.targetId === target.id)?.completedDay).toBe(1);
    expect(arrived.locations.neighbour.identified).toBe(true);
    expect(arrived.locations.neighbour.discovered).toBe(false);
    expect(arrived.locations.neighbour.lastSeen).toBeNull();
    expect(arrived.locations.neighbour.visited).not.toBe(true);
    expect(arrived.nearbyRecognition).toEqual(['neighbour']);
  });

  it('a noticeboard names 5–12 places, cues the tour once and never persists the cue', () => {
    const many = Object.fromEntries(Array.from({ length: 16 }, (_, i) =>
      [`n${i}`, site(`n${i}`, 0.0004 * (i + 1), i % 2 ? 'clinic' : 'housing')]));
    useGame.setState({ locations: { source: { ...site('source', 0, 'residential'), discovered: true, visited: true }, ...many } });
    useGame.getState().readLocalMap();
    const s = useGame.getState();
    const named = Object.values(s.locations).filter((loc) => loc.identified && loc.id !== 'source');
    expect(named.length).toBeGreaterThanOrEqual(5);
    expect(named.length).toBeLessThanOrEqual(12);
    expect(named.every((loc) => !loc.discovered && loc.lastSeen === null)).toBe(true);
    expect(s.revealTour?.ids.slice().sort()).toEqual(named.map((loc) => loc.id).sort());
    expect(s.explorationLeads.length).toBeLessThanOrEqual(1);
    flushPersist();
    expect(JSON.parse(localStorage.getItem('singvive.run.v7')!)).not.toHaveProperty('revealTour');
    useGame.getState().dismissRevealTour(s.revealTour!.id + 1);
    expect(useGame.getState().revealTour).toBe(s.revealTour);
    useGame.getState().dismissRevealTour(s.revealTour!.id);
    expect(useGame.getState().revealTour).toBeNull();
  });
});
