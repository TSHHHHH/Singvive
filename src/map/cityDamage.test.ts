import { describe, expect, it } from 'vitest';
import { COLLAPSE_FROM, DAMAGE_SHARE, COLLAPSE_MIN_H, cityDamage } from './cityDamage';

const N = 200_000;
const ids = Array.from({ length: N }, (_, i) => String(1_000_000 + i * 7));

describe('cityDamage', () => {
  it('is stable per building id', () => {
    for (const id of ids.slice(0, 500)) expect(cityDamage(id, 30)).toEqual(cityDamage(id, 30));
  });

  it('distributes visible damage across ordinary blocks', () => {
    const levels = ids.map(id => cityDamage(id, 30).level);
    expect(levels.filter(l => l !== 'intact').length / N).toBeCloseTo(DAMAGE_SHARE, 2);
    expect(levels.filter(l => l === 'collapsed').length / N).toBeCloseTo(DAMAGE_SHARE * (1 - COLLAPSE_FROM), 2);
  });

  it('short buildings can be scorched but stay standing', () => {
    for (const id of ids.slice(0, 20_000)) {
      const d = cityDamage(id, COLLAPSE_MIN_H - 1);
      expect(d.level === 'intact' || d.level === 'scorched').toBe(true);
    }
  });
});
