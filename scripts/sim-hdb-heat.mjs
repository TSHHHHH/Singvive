// HDB heat sim — `npm run sim:hdb-heat`.
//
// A scripted survivor clears seeded blocks bottom-up (forcing every locked
// door, no lockpicks) and walks back down. Compares the shipping door rule
// (forced doors spread through the stairwell, see DOOR_SPREAD) with the old
// landing-only rule. Runs through Vite's SSR runner so the game modules load
// exactly as in the app.
//
//   npm run sim:hdb-heat             default 400 runs per row
//   npm run sim:hdb-heat -- --n 1000

import { createServer } from 'vite';

const args = process.argv.slice(2);
const i = args.indexOf('--n');
const N = i >= 0 ? Number(args[i + 1]) : 400;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { summarize } = await server.ssrLoadModule('/src/dev/hdbHeatSim.ts');
  const { DOOR_SPREAD, COOL_PER_HOUR } = await server.ssrLoadModule('/src/game/hdbDungeon.ts');
  console.log(`\nDOOR_SPREAD ${JSON.stringify(DOOR_SPREAD)} · cool ${COOL_PER_HOUR}/h · ${N} runs per row\n`);
  const head = ['rule', 'events', 'storeys', 'landings', 'forced', 'fights', 'mean heat', 'hunting+', 'swarm', 'runaway', 'clean exit', 'exit fights', 'hours', 'alarms', 'cut', 'skipped', 'loot mod'];
  const rows = [];
  const plan = [
    ...['legacy', 'spread'].map((rule) => [rule, 'off']),
    ['spread', 'blind'],
    ['spread', 'smart'],
  ];
  for (const [rule, events] of plan) {
    for (const storeys of [6, 12, 18, 30]) {
      const r = summarize(rule, storeys, N, events);
      rows.push([
        rule, events, storeys, r.landings.toFixed(1), r.forced.toFixed(1), r.doorFights.toFixed(1),
        r.meanHeat.toFixed(0), r.huntingLandings.toFixed(2), r.swarmLandings.toFixed(2),
        `${(r.runaway * 100).toFixed(0)}%`, `${(r.cleanExit * 100).toFixed(0)}%`, r.exitFights.toFixed(2), r.hours.toFixed(1),
        r.alarmsTripped.toFixed(2), r.alarmsCut.toFixed(2), r.skipped.toFixed(2), r.lootMod.toFixed(2),
      ]);
    }
  }
  const w = head.map((h, c) => Math.max(h.length, ...rows.map((r) => String(r[c]).length)));
  const line = (r) => r.map((v, c) => String(v).padStart(w[c])).join('  ');
  console.log(line(head));
  for (const r of rows) console.log(line(r));
  console.log('\nevents: off = no room events · blind = never reads doors · smart = reads doors, cuts or skips spotted alarms.');
  console.log('\nrunaway = runs ending with more than half the open landings at Hunting or above.');
} finally {
  await server.close();
}
process.exit(0);
