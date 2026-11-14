// Encounter odds sim — `npm run sim:encounters`.
//
// Runs the production rollers through Vite's SSR runner (so `import.meta.env`
// resolves) and prints what a player actually meets:
//   A. doorway events — how often one fires and which scene, by situation
//   B. search ambushes — per-search odds, streaks and dry spells over a site
//   C. road crossings — the route label vs the real fight rate
//
//   npm run sim:encounters             default 20000 rolls per case
//   npm run sim:encounters -- --n 5000

import { createServer } from 'vite';

const args = process.argv.slice(2);
const i = args.indexOf('--n');
const N = i >= 0 ? Number(args[i + 1]) : 20000;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const ev = await server.ssrLoadModule('/src/game/events.ts');
  const odds = await server.ssrLoadModule('/src/game/encounterOdds.ts');
  const { Rng } = await server.ssrLoadModule('/src/game/rng.ts');
  const w = await server.ssrLoadModule('/src/game/wilds.ts');
  const pct = (x) => `${(100 * x).toFixed(0)}%`;

  console.log('\n== A. Doorway events (one entry, ignoring cooldown / daily cap) ==');
  const SITUATIONS = [
    ['calm: d1 day', { danger: 1, boost: 0, time: 'day', pressure: 0 }],
    ['mid: d3 day', { danger: 3, boost: 0, time: 'day', pressure: 0.2 }],
    ['mid + noise', { danger: 3, boost: 2, time: 'day', pressure: 0.2 }],
    ['hot: d4 night', { danger: 4, boost: 0, time: 'night', pressure: 0.5 }],
  ];
  for (const cat of ['supermarket', 'police', 'mrt', 'school']) {
    for (const [label, sit] of SITUATIONS) {
      const loc = {
        id: 'x', name: 'Site', category: cat, currentDanger: sit.danger, tempDangerBoost: sit.boost,
        factionId: null, doorForced: false, lat: 1.3, lng: 103.8,
      };
      const counts = {};
      let fired = 0;
      for (let k = 0; k < N; k++) {
        const e = ev.rollPreScavengeEvent(new Rng(`s${k}`).fork('event'), loc, {
          day: 5, standing: {}, locale: 'en', time: sit.time, weather: 'clear', pressure: sit.pressure,
        });
        if (e) { fired++; counts[e.kind] = (counts[e.kind] ?? 0) + 1; }
      }
      const mix = Object.entries(counts).sort((a, b) => b[1] - a[1])
        .map(([k, c]) => `${k} ${pct(c / fired)}`).join(', ');
      console.log(`${cat.padEnd(11)} ${label.padEnd(14)} fires ${pct(fired / N).padStart(4)}  ${mix}`);
    }
  }

  console.log('\n== B. Search ambushes over 8 searches at one site (no traits) ==');
  const base = { weatherMod: 0, pressure: 0, encounterMod: 0, nightEncounterMod: 0, ambushMod: 0 };
  for (const [label, danger, band] of [['d2 day', 2, 'day'], ['d3 day', 3, 'day'], ['d3 night', 3, 'night']]) {
    for (const streak of [false, true]) {
      const r = new Rng(`streak:${label}`);
      let fights = 0, three = 0, none = 0;
      for (let t = 0; t < N; t++) {
        let since; let run = 0, best = 0, k = 0;
        for (let s = 0; s < 8; s++) {
          const p = odds.searchAmbushChance({ ...base, danger, band, searchesSinceAmbush: streak ? since : undefined });
          const hit = r.chance(p);
          if (streak) since = odds.nextSearchStreak(since, hit);
          if (hit) { k++; run++; best = Math.max(best, run); } else run = 0;
        }
        fights += k; if (best >= 3) three++; if (k === 0) none++;
      }
      console.log(`${label.padEnd(9)} ${streak ? 'with streak control' : 'independent rolls  '}  fights/8 ${(fights / N).toFixed(2)}  3+ in a row ${pct(three / N).padStart(4)}  none ${pct(none / N).padStart(3)}`);
    }
  }

  console.log('\n== C. Road crossing: route label vs real fight rate ==');
  const zone = (kind, severity) => ({ id: `${kind}${severity}`, kind, severity, lat: 1.3, lng: 103.8, radiusM: 60, discs: [] });
  const cases = [
    ['quiet 400 m day', [], 'day', 400],
    ['quiet 400 m night', [], 'night', 400],
    ['quiet 1200 m night', [], 'night', 1200],
    ['gang patrol s1 day', [zone('gang_patrol', 1)], 'day', 400],
    ['horde pocket s2 day', [zone('horde_pocket', 2)], 'day', 400],
    ['night swarm s1 night', [zone('night_swarm', 1)], 'night', 400],
    ['floodwater s1 day', [zone('floodwater', 1)], 'day', 400],
  ];
  for (const [label, hz, band, dist] of cases) {
    const risk = w.trekRisk('seed', { lat: 1.3, lng: 103.8 }, { lat: 1.3 + dist / 111000, lng: 103.8 },
      { band, hordeIntensity: 0.2, weatherEncounterMod: 0, traitEncounterMod: 0 }, hz);
    let fights = 0;
    for (let k = 0; k < N; k++) {
      const rng = new Rng(`c${k}`);
      const o = w.resolveCrossing(rng, risk, {
        mode: 'road', siteDanger: 2, dexterity: 5, checkBonus: 0, band, habitat: null, pressure: 0.2, forest: false, weather: 'clear',
      });
      // The store's floodwater fallback, as in travel().
      const flood = !o.ambush && hz.some((z) => z.kind === 'floodwater') && rng.chance(w.FLOODWATER_ANIMAL_CHANCE);
      if (o.ambush || flood) fights++;
    }
    console.log(`${label.padEnd(22)} label "${w.riskLabel(risk.fightChance).text}"`.padEnd(58) +
      `predicted ${pct(risk.fightChance).padStart(4)}  actual ${pct(fights / N).padStart(4)}`);
  }
} finally {
  await server.close();
}
