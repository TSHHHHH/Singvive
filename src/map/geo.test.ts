import { expect, it } from 'vitest';
import { haversine } from '../game/overpass';
import { circleRing } from './geo';

it('draws the affordable radius in the same metres as travel, including sub-metre budgets', () => {
  for (const metres of [0.25, 150, 2000]) {
    for (const [lng, lat] of circleRing(1.3048, 103.8318, metres, 96)) {
      expect(haversine(1.3048, 103.8318, lat, lng)).toBeCloseTo(metres, 5);
    }
  }
});
