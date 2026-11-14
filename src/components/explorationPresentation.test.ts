import { describe, expect, it } from 'vitest';
import { knownFacilityKinds } from './explorationPresentation';

describe('logbook facility privacy', () => {
  it('does not reveal facilities before a physical visit', () => {
    expect(knownFacilityKinds({ facilities: { stove: true, rainShelter: true, water: { amount: 2, hotUntil: 0 } } })).toEqual([]);
  });

  it('remembers a water cache without exposing whether it is still stocked', () => {
    const stocked = knownFacilityKinds({ visited: true, facilities: { water: { amount: 2, hotUntil: 999 } } });
    const empty = knownFacilityKinds({ visited: true, facilities: { water: { amount: 0, hotUntil: 0 } } });
    expect(stocked).toEqual(['water']);
    expect(empty).toEqual(stocked);
  });

  it('includes durable visited facilities but not live heat or collector quantities', () => {
    expect(knownFacilityKinds({ visited: true, facilities: { stove: true, rainShelter: true, collector: { checkedAt: 12, water: 3 }, fireUntil: 60 } })).toEqual(['shelter', 'stove', 'collector']);
    expect(knownFacilityKinds({ visited: true })).toEqual([]);
  });
});
