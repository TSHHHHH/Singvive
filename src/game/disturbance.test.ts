import { describe, expect, it } from 'vitest';
import {
  addDisturbance, disturbanceAt, disturbanceBonus, disturbanceSpec, normalizeDisturbances,
  quietDisturbance, type Disturbance,
} from './disturbance';
import { choiceNoise } from './choiceNoise';
import type { EventChoice } from './events';

const here = { lat: 1.3, lng: 103.85 };
const zone = (patch: Partial<Disturbance> = {}): Disturbance => ({
  id: 'z1', kind: 'gunshot', ...here, radiusM: 300, danger: 1.5, createdAt: 10, expiresAt: 12, ...patch,
});

describe('disturbance zones', () => {
  it('is a flat bonus inside the ring until it ends, and nothing outside', () => {
    const zones = [zone()];
    expect(disturbanceBonus(zones, here.lat, here.lng, 10)).toBe(1.5);
    expect(disturbanceBonus(zones, here.lat, here.lng, 11.99)).toBe(1.5);
    expect(disturbanceBonus(zones, here.lat, here.lng, 12)).toBe(0);
    expect(disturbanceBonus(zones, here.lat + 0.01, here.lng, 10)).toBe(0);
  });

  it('never stacks: overlapping zones give only the strongest', () => {
    const zones = [zone(), zone({ id: 'z2', kind: 'car_alarm', danger: 2.5, radiusM: 450 }), zone({ id: 'z3', kind: 'shutter', danger: 1 })];
    expect(disturbanceBonus(zones, here.lat, here.lng, 11)).toBe(2.5);
    expect(disturbanceAt(zones, here.lat, here.lng, 11)?.kind).toBe('car_alarm');
  });

  it('refreshes a zone of the same kind on the same spot instead of adding another', () => {
    const first = addDisturbance([], zone(), 10);
    const again = addDisturbance(first.zones, zone({ id: 'z2', createdAt: 11, expiresAt: 13 }), 11);
    expect(again.created).toBe(false);
    expect(again.zones).toHaveLength(1);
    expect(again.zones[0].expiresAt).toBe(13);
    const other = addDisturbance(again.zones, zone({ id: 'z3', kind: 'car_alarm' }), 11);
    expect(other.created).toBe(true);
    expect(other.zones).toHaveLength(2);
  });

  it('lasts longer at night and carries less far in the rain', () => {
    const day = disturbanceSpec('gunshot');
    expect(disturbanceSpec('gunshot', { night: true }).hours).toBe(day.hours * 1.5);
    expect(disturbanceSpec('gunshot', { wet: true }).radiusM).toBeLessThan(day.radiusM);
    expect(disturbanceSpec('car_alarm').danger).toBeGreaterThan(disturbanceSpec('gunshot').danger);
  });

  it('can be ended early', () => {
    const zones = [zone(), zone({ id: 'z2', kind: 'car_alarm' })];
    expect(quietDisturbance(zones, 'z2').map((z) => z.id)).toEqual(['z1']);
    expect(quietDisturbance(zones, 'nope')).toBe(zones);
  });

  it('drops malformed or finished zones from a save', () => {
    expect(normalizeDisturbances([
      zone(),
      zone({ id: 'big', danger: 50 }),
      zone({ id: 'long', expiresAt: 100 }),
      zone({ id: 'done', expiresAt: 10.5 }),
      { ...zone({ id: 'odd' }), kind: 'player' },
      'junk',
    ], 11)).toEqual([zone()]);
  });
});

describe('choice noise tags', () => {
  const base = { id: 'c', label: 'c' } as const;
  it('marks loud choices, risky checks and quieting choices', () => {
    const loud: EventChoice = { ...base, kind: 'leave', onSuccess: [{ t: 'disturb', kind: 'loud' }, { t: 'access' }] };
    const risky: EventChoice = { ...base, kind: 'check', attr: 'strength', dc: 10, onSuccess: [{ t: 'access' }],
      onFailure: [{ t: 'disturb', kind: 'botched' }, { t: 'zombies', line: 'x' }] };
    const quiet: EventChoice = { ...base, kind: 'check', attr: 'dexterity', dc: 10,
      onSuccess: [{ t: 'quiet', zoneId: 'z' }, { t: 'deny', line: 'x' }] };
    const shot: EventChoice = { ...base, kind: 'leave', needs: 'loadedGun', onSuccess: [{ t: 'fireShot' }, { t: 'access' }] };
    const calm: EventChoice = { ...base, kind: 'leave', onSuccess: [{ t: 'access' }] };
    expect(choiceNoise(loud)).toEqual({ tag: 'loud', kind: 'loud' });
    expect(choiceNoise(risky)).toEqual({ tag: 'riskLoud', kind: 'botched' });
    expect(choiceNoise(quiet)).toEqual({ tag: 'quiet' });
    expect(choiceNoise(shot, 'shotgun')).toEqual({ tag: 'loud', kind: 'shotgun' });
    expect(choiceNoise(calm)).toBeNull();
  });
});
