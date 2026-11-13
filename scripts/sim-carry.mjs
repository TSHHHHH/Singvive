// Carry-weight sim — `npm run sim:carry`.
//
// A hoarder who keeps every find: how heavy do they get, search by search, and
// which load tier does that put them in for each bag? Runs the production
// `rollLoot` / `addToCarry` / `loadEffects` through Vite's SSR runner, so
// `import.meta.env` resolves (plain tsx crashes on it).
//
//   npm run sim:carry                 table for a baseline 5/5 survivor
//   npm run sim:carry -- --runs 4000  hoards per row (default 2000)
//   npm run sim:carry -- --str 7      a stronger build
//
// Each "search" is one `rollLoot` at the category's richness over the street
// POI mix (no MRT), with nothing ever dropped, eaten or stashed. Real runs eat,
// stash and trade, so these numbers are the ceiling on how heavy a greedy
// player gets, not the average.

import { createServer } from 'vite';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const RUNS = Number(opt('runs', 2000));
const STR = Number(opt('str', 5));
const END = Number(opt('end', 5));
const CHECKPOINTS = [3, 5, 8, 12, 16, 20, 30];
const BAGS = [null, 'daypack', 'hiking_pack', 'military_rucksack'];
/** Knife + jeans + shoes, roughly what a starting survivor wears. */
const WORN = { mainHand: 'kitchen_knife', legs: 'jeans' };

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const inv = await server.ssrLoadModule('/src/game/inventory.ts');
  const { rollLoot } = await server.ssrLoadModule('/src/game/loot.ts');
  const { POI_CONFIG } = await server.ssrLoadModule('/src/game/poi.ts');
  const { Rng } = await server.ssrLoadModule('/src/game/rng.ts');

  const cats = Object.keys(POI_CONFIG).filter((c) => c !== 'mrt');
  const attrs = { strength: STR, agility: 5, endurance: END, perception: 5, intelligence: 5, charisma: 5 };

  const mkEquip = (bagId) => {
    const eq = inv.emptyEquipment();
    for (const [slot, defId] of Object.entries(WORN)) {
      eq[slot] = { uid: `w:${slot}`, defId, container: `equip:${slot}`, x: 0, y: 0, rotated: false, stack: 1 };
    }
    if (bagId) eq.bag = { uid: 'w:bag', defId: bagId, container: 'equip:bag', x: 0, y: 0, rotated: false, stack: 1 };
    return eq;
  };

  const cap = inv.maxCarry(attrs, mkEquip(null));
  console.log(`Survivor STR ${STR} / END ${END}: maxCarry ${cap} kg · ${RUNS} hoards per bag · keeps every find\n`);

  const TIERS = ['light', 'burdened', 'heavy', 'straining', 'pinned'];
  for (const bagId of BAGS) {
    const eq = mkEquip(bagId);
    inv.syncBackpackBonuses(0, eq);
    const rows = CHECKPOINTS.map(() => ({ ratio: [], rawKg: [], looseShare: [], tiers: Object.fromEntries(TIERS.map((t) => [t, 0])) }));
    for (let r = 0; r < RUNS; r++) {
      const rng = new Rng(`carry:${bagId}:${r}`);
      let items = [];
      let searches = 0;
      for (let c = 0; c < CHECKPOINTS.length; c++) {
        while (searches < CHECKPOINTS[c]) {
          const cat = rng.pick(cats);
          for (const s of rollLoot(rng.fork(`s${searches}`), cat, POI_CONFIG[cat].richness, 0)) {
            items = inv.addToCarry(items, s.defId, s.count).items;
          }
          searches++;
        }
        const b = inv.carriedBreakdown(items, eq);
        const ratio = inv.loadRatio(items, attrs, eq);
        rows[c].ratio.push(ratio);
        rows[c].rawKg.push(b.packKg + b.looseKg);
        rows[c].looseShare.push(b.looseKg / Math.max(0.001, b.packKg + b.looseKg));
        rows[c].tiers[inv.loadTier(ratio)]++;
      }
    }
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log(`── ${bagId ?? 'pockets (no bag)'} · cut ${Math.round(inv.bagWeightReduction(eq) * 100)}%`);
    console.log('searches  haul kg  loose%  load   ' + TIERS.map((t) => t.padStart(9)).join(''));
    CHECKPOINTS.forEach((n, c) => {
      const row = rows[c];
      const pct = (t) => `${Math.round((row.tiers[t] / RUNS) * 100)}%`.padStart(9);
      console.log(
        `${String(n).padStart(8)}  ${med(row.rawKg).toFixed(1).padStart(7)}  ${String(Math.round(med(row.looseShare) * 100)).padStart(5)}%  ${String(Math.round(med(row.ratio) * 100)).padStart(4)}%  ` +
          TIERS.map(pct).join(''),
      );
    });
    console.log('');
  }
} finally {
  await server.close();
}
