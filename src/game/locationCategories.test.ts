import { describe, expect, it } from 'vitest';
import { classifyOsm } from './poi';
import { ITEMS, LOOT_TABLES, isStreetLootPoi } from './loot';
import { evaluateSleepConditions } from './sleep';

describe('real location categories', () => {
  it('keeps ordinary housing and community buildings out of HDB interiors', () => {
    expect(classifyOsm({ building: 'apartments', construction: 'apartments' }, true)).toBeNull();
    expect(classifyOsm({ building: 'apartments' })).toBe('housing');
    expect(classifyOsm({ building: 'house' }, true)).toBe('housing');
    expect(classifyOsm({ building: 'apartments' }, true)).toBe('residential');
    expect(classifyOsm({ building: 'apartments', amenity: 'community_centre' }, true)).toBe('community');
    expect(classifyOsm({ amenity: 'restaurant' })).toBe('eatery');
    expect(classifyOsm({ leisure: 'park' })).toBe('park');
  });
  it('supports street scavenging with valid loot in every new category', () => {
    for (const category of ['housing', 'eatery', 'community', 'park'] as const) {
      expect(isStreetLootPoi(category)).toBe(true);
      expect(LOOT_TABLES[category].length).toBeGreaterThan(0);
      for (const [defId] of LOOT_TABLES[category]) expect(ITEMS[defId]).toBeDefined();
    }
  });
  it('keeps parks outdoors even when a rain shelter is built', () => {
    const context = { currentPositionId: 'park', category: 'park' as const, hdb: null, hasSleepingBag: false };
    expect(evaluateSleepConditions(context)).toMatchObject({ enclosed: 'none', roof: 'none' });
    expect(evaluateSleepConditions({ ...context, rainShelter: true })).toMatchObject({ enclosed: 'none', roof: 'yes' });
  });
});
