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

// Alarm rooms must add stakes without breaking a normal clear: a survivor who
// never reads doors pays a little, one who reads them comes out about as well
// as before alarms existed.
describe('HDB room events over a full clear', () => {
  for (const storeys of [8, 24]) {
    it(`${storeys} storeys: alarms bite the blind, reading doors pays`, () => {
      const off = summarize('spread', storeys, 150, 'off');
      const blind = summarize('spread', storeys, 150, 'blind');
      const smart = summarize('spread', storeys, 150, 'smart');
      // Alarms actually happen, but they are a few rooms, not every block.
      expect(blind.alarmsTripped).toBeGreaterThan(0.3);
      expect(blind.alarmsTripped).toBeLessThan(1);
      // Blind clears get hotter, but stay winnable.
      expect(blind.meanHeat).toBeGreaterThan(off.meanHeat);
      expect(blind.swarmLandings).toBeLessThan(0.5);
      expect(blind.runaway).toBeLessThan(0.3);
      expect(blind.cleanExit).toBeGreaterThan(0.6);
      // Reading doors and cutting or skipping spotted alarms gets most of it back.
      expect(smart.alarmsTripped).toBeLessThan(blind.alarmsTripped);
      expect(smart.cleanExit).toBeGreaterThan(blind.cleanExit);
      expect(smart.cleanExit).toBeGreaterThanOrEqual(off.cleanExit - 0.03);
      // Alarmed rooms pay out a little more loot.
      expect(blind.lootMod).toBeGreaterThan(off.lootMod);
    }, 60000);
  }
});
