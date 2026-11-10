import { describe, expect, it } from 'vitest';
import type { Poi } from '../game/types';
import { FACTION_CONFIG } from '../game/factions';
import {
  BEACON_MAX_PX,
  BEACON_MIN_PX,
  EVAC_BEACON_COLOR,
  beaconHeightPx,
  beaconsKey,
  landmarkBeacons,
} from './beacons';

const factionId = Object.keys(FACTION_CONFIG)[0] as Exclude<Poi['factionId'], null>;

function poi(id: string, extra: Partial<Poi> = {}): Poi {
  return { id, lat: 1.3, lng: 103.8, discovered: true, factionId: null, isFactionOutpost: false, ...extra } as Poi;
}

describe('landmarkBeacons', () => {
  it('lights the extraction zone and known faction outposts only', () => {
    const pois = [
      poi('shop'),
      poi('held', { factionId }),
      poi('op', { factionId, isFactionOutpost: true }),
      poi('hiddenOp', { factionId, isFactionOutpost: true, discovered: false }),
      poi('evac'),
    ];
    const out = landmarkBeacons(pois, 'evac');
    expect(out.map((b) => [b.id, b.kind])).toEqual([
      ['evac', 'evac'],
      ['op', 'outpost'],
    ]);
    expect(out[0].color).toBe(EVAC_BEACON_COLOR);
    expect(out[1].color).toBe(FACTION_CONFIG[factionId].color);
  });

  it('gives an outpost that is also the evac zone a single evac light', () => {
    const out = landmarkBeacons([poi('op', { factionId, isFactionOutpost: true })], 'op');
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('evac');
  });

  it('is empty with no evac and no outposts', () => {
    expect(landmarkBeacons([poi('a'), poi('b')], null)).toEqual([]);
  });

  it('keys the same set the same way', () => {
    const pois = [poi('op', { factionId, isFactionOutpost: true }), poi('evac')];
    expect(beaconsKey(landmarkBeacons(pois, 'evac'))).toBe(beaconsKey(landmarkBeacons([...pois], 'evac')));
    expect(beaconsKey(landmarkBeacons(pois, 'evac'))).not.toBe(beaconsKey(landmarkBeacons(pois, null)));
  });
});

describe('beaconHeightPx', () => {
  it('grows with zoom and tilt', () => {
    expect(beaconHeightPx(16.5, 1.35, 50)).toBeGreaterThan(beaconHeightPx(15.5, 1.35, 50));
    expect(beaconHeightPx(16, 1.35, 60)).toBeGreaterThan(beaconHeightPx(16, 1.35, 30));
  });

  it('stays visible zoomed out and flat, and bounded zoomed in', () => {
    expect(beaconHeightPx(11, 1.35, 50)).toBe(BEACON_MIN_PX);
    expect(beaconHeightPx(16, 1.35, 0)).toBe(BEACON_MIN_PX);
    expect(beaconHeightPx(19, 1.35, 60)).toBe(BEACON_MAX_PX);
  });
});
