import { describe, expect, it } from 'vitest';
import { bountyBoard, bountyProgress, BOUNTY_PASS_DAYS, type ActiveBounty } from './bounties';
import { emptyStanding, hasFactionClearance, rollGatePolicy, STANDING_KNOWN } from './factions';
import { Rng } from './rng';
import type { LocationState } from './types';

const site = (over: Partial<LocationState> = {}): LocationState =>
  ({
    id: 'site', name: 'Site', category: 'supermarket', lat: 1.3, lng: 103.8, size: 'medium',
    baseDanger: 2, currentDanger: 2, remainingSearches: 3, discovered: true, cleared: false,
    exhausted: false, factionId: 'gotong', isFactionRevealed: true, isMrtStation: false,
    distanceFromSpawn: 0, lastSeen: null, gatePolicy: 'fee', ...over,
  }) as LocationState;

const neighbour = (id: string, dLat: number): LocationState =>
  site({ id, name: id, factionId: null, lat: 1.3 + dLat, gatePolicy: undefined, visited: false });

describe('door rules', () => {
  it('open doors take strangers, members doors want standing, fee doors want a pass', () => {
    const s = emptyStanding();
    expect(hasFactionClearance(site({ gatePolicy: 'open' }), s, 1)).toBe(true);
    expect(hasFactionClearance(site({ gatePolicy: 'members', gateMinStanding: STANDING_KNOWN }), s, 1)).toBe(false);
    expect(hasFactionClearance(site({ gatePolicy: 'members', gateMinStanding: STANDING_KNOWN }), { ...s, gotong: 1 }, 1)).toBe(true);
    expect(hasFactionClearance(site({ gatePolicy: 'fee' }), s, 1)).toBe(false);
    expect(hasFactionClearance(site({ gatePolicy: 'fee', tollPaidThroughDay: 3 }), s, 1)).toBe(true);
  });

  it('a feud closes even an open door', () => {
    expect(hasFactionClearance(site({ gatePolicy: 'open' }), { ...emptyStanding(), gotong: -2 }, 1)).toBe(false);
  });

  it('outposts use the fixed rule and the 88 never rolls an open door', () => {
    expect(rollGatePolicy(new Rng('a'), 'gotong', true)).toBe('open');
    for (let i = 0; i < 200; i++) expect(rollGatePolicy(new Rng(`s${i}`), 'syndicate_88', false)).not.toBe('open');
  });
});

describe('bounty board', () => {
  const locations = Object.fromEntries(
    [site(), neighbour('n1', 0.005), neighbour('n2', 0.008)].map((l) => [l.id, l]),
  );

  it('is stable for a site and day and turns over the next day', () => {
    const a = bountyBoard('seed', locations.site, 1, locations);
    expect(bountyBoard('seed', locations.site, 1, locations)).toEqual(a);
    expect(a).toHaveLength(2);
    expect(new Set(a.map((o) => o.kind)).size).toBe(2);
    expect(bountyBoard('seed', locations.site, 2, locations).map((o) => o.id)).not.toEqual(a.map((o) => o.id));
  });

  it('lets the first job stand in for the fee at a fee door only', () => {
    expect(bountyBoard('seed', locations.site, 1, locations)[0].passDays).toBe(BOUNTY_PASS_DAYS);
    const open = site({ gatePolicy: 'open' });
    expect(bountyBoard('seed', open, 1, { ...locations, site: open }).some((o) => o.passDays)).toBe(false);
  });

  it('tracks progress from kills, visits and the pack', () => {
    const base = { id: 'x', factionId: 'gotong', siteId: 'site', rewardStanding: 1, rewardDefId: 'bandage', rewardCount: 1, acceptedDay: 1 } as const;
    const ctx = { kills: 5, locations, carried: () => 1 };
    const cull: ActiveBounty = { ...base, kind: 'cull', count: 3, killsAtAccept: 3 };
    expect(bountyProgress(cull, ctx)).toEqual({ have: 2, need: 3, done: false });
    const deliver: ActiveBounty = { ...base, kind: 'deliver', defId: 'scrap_metal', count: 1, killsAtAccept: 0 };
    expect(bountyProgress(deliver, ctx).done).toBe(true);
    const scout: ActiveBounty = { ...base, kind: 'scout', targetId: 'n1', count: 1, killsAtAccept: 0 };
    expect(bountyProgress(scout, ctx).done).toBe(false);
    expect(bountyProgress(scout, { ...ctx, locations: { ...locations, n1: { ...locations.n1, visited: true } } }).done).toBe(true);
  });
});
