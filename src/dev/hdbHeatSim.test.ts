import { describe, expect, it } from 'vitest';
import { summarize } from './hdbHeatSim';

// Full bottom-up clears of seeded blocks, forced doors spreading through the
// stairwell. The bounds are the design promise: the block wakes up noticeably,
// but a normal clear never pins the building or makes the way out unwinnable.
describe('HDB heat over a full clear', () => {
  for (const storeys of [8, 24]) {
    it(`${storeys} storeys: hotter than landing-only heat, no runaway`, () => {
      const legacy = summarize('legacy', storeys, 150);
      const spread = summarize('spread', storeys, 150);
      // Spread is felt across the block.
      expect(spread.meanHeat).toBeGreaterThan(legacy.meanHeat + 8);
      // ...but it never locks the building down.
      expect(spread.swarmLandings).toBeLessThan(0.5);
      expect(spread.runaway).toBeLessThan(0.25);
      // The walk back down stays mostly fight-free at base stats.
      expect(spread.cleanExit).toBeGreaterThan(0.6);
      expect(spread.exitFights).toBeLessThan(0.5);
    }, 30000);
  }
});
