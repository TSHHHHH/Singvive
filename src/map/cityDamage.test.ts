import { describe, expect, it } from 'vitest';
import { BURN_FROM, DAMAGE_SHARE, FIRE_MIN_H, cityDamage } from './cityDamage';

const N = 200_000;
const ids = Array.from({ length: N }, (_, i) => String(1_000_000 + i * 7));

describe('cityDamage', () => {
  it('is stable per building id', () => {
    for (const id of ids.slice(0, 500)) expect(cityDamage(id, 30)).toEqual(cityDamage(id, 30));
  });

  it('only the most destroyed buildings burn, and fewer than before', () => {
    let damaged = 0;
    let burning = 0;
    for (const id of ids) {
      const d = cityDamage(id, 30);
      if (d.level !== 'intact') damaged++;
      if (d.level === 'burning') {
        burning++;
        expect(d.severity).toBeGreaterThanOrEqual(BURN_FROM);
      } else {
        expect(d.burn).toBe(0);
      }
    }
    expect(damaged / N).toBeCloseTo(DAMAGE_SHARE, 2);
    // Was an independent 1% roll; now the top of the damage scale only.
    expect(burning / N).toBeLessThan(0.008);
    expect(burning / N).toBeGreaterThan(0.004);
  });

  it('a bigger fire means a more destroyed building', () => {
    const fires = ids.map((id) => cityDamage(id, 30)).filter((d) => d.level === 'burning');
    fires.sort((a, b) => a.severity - b.severity);
    for (let i = 1; i < fires.length; i++) {
      expect(fires[i].burn).toBeGreaterThanOrEqual(fires[i - 1].burn);
      expect(fires[i].stands).toBeLessThanOrEqual(fires[i - 1].stands);
    }
    expect(fires[0].burn).toBeLessThan(0.1);
    expect(fires[fires.length - 1].burn).toBeGreaterThan(0.9);
  });

  it('a low building never burns or collapses', () => {
    for (const id of ids.slice(0, 20_000)) {
      const d = cityDamage(id, FIRE_MIN_H - 1);
      expect(d.level === 'intact' || d.level === 'scorched').toBe(true);
    }
  });
});
