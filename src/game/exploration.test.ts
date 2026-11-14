import { describe, expect, it } from 'vitest';
import type { LocationState } from './types';
import { completeExplorationLeads, discoverLocalFacility, findExplorationLeads, localFacilityFor, normalizeExplorationLeads, recognitionRadius, recognizeNearby, type ExplorationLead } from './exploration';

const origin = { lat: 1.3, lng: 103.8 };
function site(id: string, northM = 0, extra: Partial<LocationState> = {}): LocationState {
  return { id, name: id, category: 'community', ...origin, lat: origin.lat + northM / 111195,
    size: 'small', baseDanger: 2, currentDanger: 3, remainingSearches: 2, exhausted: false,
    cleared: false, looted: false, factionId: null, isFactionRevealed: false, isMrtStation: false,
    discovered: false, lastSeen: null, distanceFromSpawn: northM, ...extra };
}
const record = (...sites: LocationState[]) => Object.fromEntries(sites.map(s => [s.id, s]));
function ring(southM: number, northM: number): [number, number][] {
  return [[origin.lat + southM / 111195, origin.lng - 0.00005],
    [origin.lat + northM / 111195, origin.lng - 0.00005],
    [origin.lat + northM / 111195, origin.lng + 0.00005],
    [origin.lat + southM / 111195, origin.lng + 0.00005]];
}
const lead = (targetId: string, extra: Partial<ExplorationLead> = {}): ExplorationLead => ({
  id: `lead-${targetId}`, sourceId: 'source', targetId, source: 'search', createdDay: 1, ...extra,
});

describe('nearby recognition', () => {
  it('bounds awareness before darkness and weather reduce recognition', () => {
    expect(recognitionRadius(5, 1, 'clear')).toBe(35);
    expect(recognitionRadius(-100, 1, 'clear')).toBe(20);
    expect(recognitionRadius(100, 1, 'clear')).toBe(60);
    expect(recognitionRadius(5, 0.5, 'clear')).toBe(17.5);
    for (const weather of ['rain', 'haze', 'thunderstorm'] as const) {
      expect(recognitionRadius(5, 1, weather)).toBeLessThan(35);
    }
    expect(recognitionRadius(5, 0, 'clear')).toBe(0);
  });
  it('identifies an exterior without granting a visit, snapshot or faction intel', () => {
    const near = site('near', 20, { factionId: 'muster' });
    const far = site('far', 70);
    const locations = record(near, far);
    const next = recognizeNearby(locations, origin, 35);
    expect(next.near).toEqual({ ...near, identified: true });
    expect(next.near.discovered).toBe(false);
    expect(next.near.lastSeen).toBeNull();
    expect(next.near.visited).toBeUndefined();
    expect(next.far).toBe(far);
    expect(recognizeNearby(next, origin, 35)).toBe(next);
    expect(recognizeNearby(locations, origin, 0)).toBe(locations);
  });
  it('blocks a known intervening footprint and shops inside another building', () => {
    const wall = site('wall', 15, { category: 'industrial', outline: ring(10, 20) });
    const behind = site('behind', 30);
    const shop = site('shop', 15, { category: 'supermarket' });
    const next = recognizeNearby(record(wall, behind, shop), origin, 60);
    expect(next.behind.identified).not.toBe(true);
    expect(next.shop.identified).not.toBe(true);
  });
  it('does not identify synthetic waypoints or overwrite known memories', () => {
    const known = site('known', 10, { discovered: true });
    const waypoint = site('waypoint', 10, { category: 'waypoint' });
    const locations = record(known, waypoint);
    expect(recognizeNearby(locations, origin, 35)).toBe(locations);
  });
});

describe('local exploration leads', () => {
  const source = site('source');
  it('keeps board targets stable across days and caps selection to local unvisited sites', () => {
    const locations = record(source, site('near', 100), site('other', 200), site('far', 900), site('visited', 50, { visited: true }), site('evac', 30));
    const a = findExplorationLeads('seed', locations, 'source', 'noticeboard', 1, [], 'evac');
    const b = findExplorationLeads('seed', locations, 'source', 'noticeboard', 9, [], 'evac');
    expect(a).toHaveLength(1);
    expect(['near', 'other']).toContain(a[0].targetId);
    expect(b[0].targetId).toBe(a[0].targetId);
    expect(b[0].id).toBe(a[0].id);
    expect(findExplorationLeads('seed', locations, 'source', 'noticeboard', 9, a, 'evac')).toEqual([]);
  });
  it('restricts locality maps to MRT public destinations within 400 metres', () => {
    const station = site('source', 0, { category: 'mrt', isMrtStation: true });
    const locations = record(station, ...Array.from({ length: 5 }, (_, i) => site(`near${i}`, 100 + i * 20)),
      site('far', 500), site('shop', 100, { category: 'eatery' }), site('waypoint', 10, { category: 'waypoint' }));
    const found = findExplorationLeads('seed', locations, 'source', 'locality', 1, []);
    expect(found).toHaveLength(3);
    expect(found.every(l => l.targetId.startsWith('near'))).toBe(true);
    expect(findExplorationLeads('seed', { ...locations, source }, 'source', 'locality', 1, [])).toEqual([]);
  });
  it('lists useful public shops on MRT maps without claiming their surviving facilities', () => {
    const station = site('source', 0, { category: 'mrt', isMrtStation: true });
    const locations = record(station, site('clinic', 100, { category: 'clinic' }),
      site('pharmacy', 120, { category: 'pharmacy' }), site('supermarket', 140, { category: 'supermarket' }));
    const found = findExplorationLeads('seed', locations, 'source', 'locality', 1, []);
    expect(found.map(l => l.targetId).sort()).toEqual(['clinic', 'pharmacy', 'supermarket']);
    const publicSites = record(station, ...Array.from({ length: 10 }, (_, i) => site(`community${i}`, 100 + i)));
    for (let n = 0; n < 20; n++) {
      expect(findExplorationLeads(`s${n}`, publicSites, 'source', 'locality', 1, []).every(l => l.facility === undefined)).toBe(true);
    }
  });
  it('prioritizes useful facilities and excludes already discovered legacy destinations', () => {
    const locations = record(source, site('clinic', 100, { category: 'clinic' }),
      site('known', 30, { discovered: true }), site('plain-home', 40, { category: 'housing' }), site('facility', 120));
    let facilitySeeds = 0;
    for (let n = 0; n < 40; n++) {
      const seed = `seed${n}`;
      const found = findExplorationLeads(seed, locations, 'source', 'noticeboard', 1, []);
      expect(found).toHaveLength(1);
      expect(found[0].targetId).not.toBe('known');
      if (localFacilityFor(seed, locations.facility)) {
        facilitySeeds++;
        expect(localFacilityFor(seed, locations[found[0].targetId])).not.toBeNull();
        expect(found[0].facility).toBeDefined();
      }
      if (!localFacilityFor(seed, locations['plain-home'])) expect(found[0].targetId).not.toBe('plain-home');
    }
    expect(facilitySeeds).toBeGreaterThan(0);
  });
  it('respects the six-active cap and never reuses completed or active targets', () => {
    const locations = record(source, ...Array.from({ length: 12 }, (_, i) => site(`target${i}`, 30 + i * 20)));
    const existing = Array.from({ length: 6 }, (_, i) => lead(`target${i}`, { sourceId: `old${i}` }));
    expect(findExplorationLeads('seed', locations, 'source', 'noticeboard', 1, existing)).toEqual([]);
    existing[0] = { ...existing[0], completedDay: 2 };
    const found = findExplorationLeads('seed', locations, 'source', 'noticeboard', 3, existing);
    expect(found).toHaveLength(1);
    expect(existing.map(l => l.targetId)).not.toContain(found[0].targetId);
  });
  it('rolls a single stable search chance per source and blocks already-checked sources', () => {
    const locations = record(source, site('target', 100));
    let successes = 0;
    for (let n = 0; n < 200; n++) {
      const found = findExplorationLeads(`seed${n}`, locations, 'source', 'search', 1, []);
      successes += found.length;
      expect(findExplorationLeads(`seed${n}`, locations, 'source', 'search', 10, []).map(l => l.targetId)).toEqual(found.map(l => l.targetId));
    }
    expect(successes).toBeGreaterThan(45);
    expect(successes).toBeLessThan(95);
    expect(findExplorationLeads('seed', record({ ...source, searchClueChecked: true }, site('target', 100)), 'source', 'search', 1, [])).toEqual([]);
    expect(findExplorationLeads('seed', record({ ...source, localMapRead: true }, site('target', 100)), 'source', 'noticeboard', 1, [])).toEqual([]);
  });
  it('completes only the supplied physical destination and preserves other identities', () => {
    const leads = [lead('a'), lead('b'), lead('c', { completedDay: 2 })];
    expect(completeExplorationLeads(leads, 'missing', 3)).toBe(leads);
    const next = completeExplorationLeads(leads, 'a', 3);
    expect(next[0].completedDay).toBe(3);
    expect(next[1]).toBe(leads[1]);
    expect(next[2]).toBe(leads[2]);
    expect(completeExplorationLeads(next, 'a', 5)).toBe(next);
  });
  it('validates old or malformed saves and bounds active leads and history', () => {
    const locations = record(source, ...Array.from({ length: 40 }, (_, i) => site(`t${i}`)));
    expect(normalizeExplorationLeads(undefined, locations)).toEqual([]);
    expect(normalizeExplorationLeads({}, locations)).toEqual([]);
    const malformed = [null, {}, lead('absent'), lead('t0', { createdDay: NaN }), lead('t1', { sourceId: 'absent' }),
      { ...lead('t2'), source: 'bad' }, lead('t3', { completedDay: -1 }), lead('t4', { facility: 'water' }), lead('t4')];
    expect(normalizeExplorationLeads(malformed, locations)).toEqual([lead('t4', { facility: 'water' })]);
    const saved = Array.from({ length: 40 }, (_, i) => lead(`t${i}`, i < 30 ? { completedDay: i + 2 } : {}));
    const normalized = normalizeExplorationLeads(saved, locations);
    expect(normalized.length).toBeLessThanOrEqual(24);
    expect(normalized.filter(l => l.completedDay === undefined)).toHaveLength(6);
  });
});

describe('one-time useful local facilities', () => {
  it('is seeded, modest and unavailable on faction-owned ground', () => {
    const loc = site('site');
    const found = Array.from({ length: 200 }, (_, i) => localFacilityFor(`s${i}`, loc));
    expect(found.filter(Boolean).length).toBeGreaterThan(20);
    expect(found.filter(Boolean).length).toBeLessThan(100);
    expect(Array.from({ length: 200 }, (_, i) => localFacilityFor(`s${i}`, loc))).toEqual(found);
    expect(Array.from({ length: 30 }, (_, i) => localFacilityFor(`s${i}`, { ...loc, factionId: 'gotong' })).every(v => v === null)).toBe(true);
  });
  it('adds two finite clean water portions, an unlit stove or rain shelter only once', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 200; n++) {
      const loc = site('site');
      const seed = `s${n}`;
      const kind = localFacilityFor(seed, loc);
      const next = discoverLocalFacility(seed, loc);
      expect(next.localFacilityChecked).toBe(true);
      expect(next.discovered).toBe(false);
      expect(discoverLocalFacility(seed, next)).toBe(next);
      if (kind) seen.add(kind);
      if (kind === 'water') {
        expect(next.facilities?.water).toEqual({ amount: 2, hotUntil: 0 });
        const drained = { ...next, facilities: { ...next.facilities, water: { amount: 0, hotUntil: 0 } } };
        expect(discoverLocalFacility(seed, drained)).toBe(drained);
      }
      if (kind === 'stove') {
        expect(next.facilities?.stove).toBe(true);
        expect(next.facilities?.stoveUntil).toBeUndefined();
      }
      if (kind === 'shelter') expect(next.facilities?.rainShelter).toBe(true);
    }
    expect(seen).toEqual(new Set(['water', 'stove', 'shelter']));
  });
  it('preserves existing crafted facilities including an empty water batch', () => {
    const facilities = { stove: true, stoveUntil: 50, water: { amount: 0, hotUntil: 0 }, rainShelter: true };
    for (let n = 0; n < 50; n++) {
      expect(discoverLocalFacility(`s${n}`, site('site', 0, { facilities })).facilities).toEqual(facilities);
    }
  });
});
