import { describe, expect, it } from 'vitest';
import { landmarkBeacons } from '../map/beacons';
import { startingStanding } from './character';
import { applyFactionServices, outpostKit, type OutpostIds } from './factions';
import { snapshot, visibilityOf } from './fog';
import { applyPreciseReveal } from './intel';
import { Rng } from './rng';
import { applyStartingFactionIntel } from './startingIntel';
import type { FactionId, LocationState } from './types';

function site(id: string, factionId: FactionId): LocationState {
  return {
    id, name: id, factionId, category: 'supermarket', size: 'small',
    lat: 1.35, lng: 103.82, distanceFromSpawn: 1000,
    baseDanger: 2, currentDanger: 2, remainingSearches: 3,
    exhausted: false, cleared: false, looted: false, isMrtStation: false,
    isFactionRevealed: false, discovered: false, lastSeen: null,
  };
}

const outposts: OutpostIds = {
  muster: ['muster1', 'muster2'],
  gotong: ['gotong1', 'gotong2'],
  syndicate_88: ['syndicate1'],
  sta: ['sta1'],
};

function world(): Record<string, LocationState> {
  const sites = [
    site('muster1', 'muster'), site('muster2', 'muster'),
    site('gotong1', 'gotong'), site('gotong2', 'gotong'),
    site('syndicate1', 'syndicate_88'), site('sta1', 'sta'),
    site('territory', 'gotong'), site('shop', null),
  ];
  return applyFactionServices(Object.fromEntries(sites.map((loc) => [loc.id, loc])), outposts, 'HUBS');
}

describe('starting faction intel', () => {
  it('keeps all hubs unknown by default while assigning their full services', () => {
    const locations = world();
    const result = applyStartingFactionIntel(new Rng('SPAWN'), locations, outposts, []);
    expect(result.locations).toBe(locations);
    expect(result.revealed).toEqual([]);
    for (const loc of Object.values(locations)) {
      expect(loc.discovered).toBe(false);
      expect(loc.isFactionRevealed).toBe(false);
      expect(loc.lastSeen).toBeNull();
      if (loc.isFactionOutpost && loc.factionId) {
        expect(loc.factionServices).toEqual(outpostKit(loc.factionId));
        expect(visibilityOf(loc, 1000, 500)).toBe('hidden');
        expect(visibilityOf(loc, 200, 500)).toBe('detected');
      }
    }
    expect(landmarkBeacons(Object.values(locations), null)).toEqual([]);
  });

  it('reveals exactly two hubs from distinct factions, including map memory and beacons', () => {
    const locations = world();
    const result = applyStartingFactionIntel(new Rng('SPAWN'), locations, outposts, ['local_contacts']);
    expect(result.revealed).toHaveLength(2);
    expect(new Set(result.revealed.map((loc) => loc.factionId)).size).toBe(2);
    expect(Object.values(result.locations).filter((loc) => loc.discovered)).toHaveLength(2);
    expect(landmarkBeacons(Object.values(result.locations), null)).toHaveLength(2);
    for (const loc of result.revealed) {
      expect(loc.isFactionOutpost).toBe(true);
      expect(loc.isFactionRevealed).toBe(true);
      expect(loc.lastSeen).toEqual(snapshot(loc));
      expect(visibilityOf(loc, 1000, 500)).toBe('memory');
    }
    for (const loc of Object.values(locations)) {
      expect(loc.discovered).toBe(false);
      if (!result.revealed.some((known) => known.id === loc.id)) {
        expect(result.locations[loc.id]).toBe(loc);
      }
    }
    expect(startingStanding(['local_contacts'])).toEqual(startingStanding([]));
  });

  it('does not grant hub knowledge for faction-standing traits', () => {
    const locations = world();
    const result = applyStartingFactionIntel(new Rng('SPAWN'), locations, outposts, ['kampong_spirit']);
    expect(result.revealed).toEqual([]);
    expect(startingStanding(['kampong_spirit']).muster).toBeGreaterThan(0);
  });

  it('reproduces the same hubs independently of object order and other RNG draws', () => {
    const locations = world();
    const rng = new Rng('SPAWN');
    rng.next();
    const reversed = Object.fromEntries(Object.entries(outposts).reverse().map(([id, ids]) => [id, [...ids!].reverse()]));
    expect(applyStartingFactionIntel(rng, locations, reversed, ['local_contacts'])).toEqual(
      applyStartingFactionIntel(new Rng('SPAWN'), locations, outposts, ['local_contacts']),
    );
  });

  it('reveals only available factions on a sparse map, skipping missing or stale ids', () => {
    const locations = world();
    const sparse: OutpostIds = {
      gotong: ['missing', 'territory', 'muster1', 'gotong1', 'gotong2'],
      sta: [],
    };
    const result = applyStartingFactionIntel(new Rng('SPAWN'), locations, sparse, ['local_contacts']);
    expect(result.revealed).toHaveLength(1);
    expect(result.revealed[0].factionId).toBe('gotong');
    expect(applyStartingFactionIntel(new Rng('SPAWN'), {}, {}, ['local_contacts']).revealed).toEqual([]);
  });

  it('does not reveal additional hubs when services are applied again or the world expands', () => {
    const result = applyStartingFactionIntel(new Rng('SPAWN'), world(), outposts, ['local_contacts']);
    expect(applyFactionServices(result.locations, outposts, 'HUBS')).toBe(result.locations);
    const expanded = { ...result.locations, newHub: site('newHub', 'sta') };
    const stamped = applyFactionServices(expanded, { ...outposts, sta: ['sta1', 'newHub'] }, 'HUBS', ['newHub']);
    expect(stamped.newHub.isFactionOutpost).toBe(true);
    expect(stamped.newHub.discovered).toBe(false);
    expect(stamped.newHub.lastSeen).toBeNull();
    expect(Object.values(stamped).filter((loc) => loc.discovered)).toHaveLength(2);
  });

  it('preserves existing knowledge when stamping a legacy site', () => {
    const old = site('old', 'gotong');
    const known = applyPreciseReveal({ old }, 'old')!.target;
    const locations = { old: known, hidden: site('hidden', 'gotong') };
    const stamped = applyFactionServices(locations, { gotong: ['old', 'hidden'] }, 'HUBS');
    expect(stamped.old.discovered).toBe(true);
    expect(stamped.old.isFactionRevealed).toBe(true);
    expect(stamped.old.lastSeen).toBe(known.lastSeen);
    expect(stamped.hidden.discovered).toBe(false);
    expect(stamped.hidden.isFactionRevealed).toBe(false);
    expect(stamped.hidden.lastSeen).toBeNull();
  });
});
