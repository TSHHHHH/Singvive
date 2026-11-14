import { describe, expect, it } from 'vitest';
import { activityPressure, addActivity, freshActivity } from './activity';
import { trekRisk } from './wilds';

describe('disturbance along a walking route', () => {
  const from = { lat: 1.3, lng: 103.8468 };
  const to = { lat: 1.3, lng: 103.8532 };
  const noisy = addActivity(freshActivity(), { lat: 1.3, lng: 103.85,
    radiusMeters: 160, intensity: 0.8, kind: 'player' }, 8);
  const options = { band: 'day' as const, hordeIntensity: 0.42,
    weatherEncounterMod: 0, traitEncounterMod: 0 };
  const pressureAt = (lat: number, lng: number) => activityPressure(noisy, lat, lng, 8);
  it('accounts for noise between quiet endpoints', () => {
    const quiet = trekRisk('route-noise', from, to, options, []);
    const crossing = trekRisk('route-noise', from, to, { ...options, pressureAt }, []);
    expect(pressureAt(from.lat, from.lng)).toBe(0.42);
    expect(pressureAt(to.lat, to.lng)).toBe(0.42);
    expect(crossing.encounterChance).toBeGreaterThan(quiet.encounterChance);
  });
  it('samples the actual detour rather than a straight line through noise', () => {
    const via = [from, { lat: 1.304, lng: from.lng }, { lat: 1.304, lng: to.lng }, to];
    const quiet = trekRisk('detour-noise', from, to, options, [], via);
    const detour = trekRisk('detour-noise', from, to, { ...options, pressureAt }, [], via);
    expect(detour.encounterChance).toBe(quiet.encounterChance);
  });
});
