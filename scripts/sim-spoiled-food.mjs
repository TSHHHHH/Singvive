// Seeded survival sim for spoiled food and the upset-stomach rule.
// Runs the real survival ticks (tickMeters / tickInjuries / tickSystemicDamage)
// and the real infection.ts rules through Vite's SSR runner, with a scripted
// eater who lives on scavenged perishables for a week.
//
//   node scripts/sim-spoiled-food.mjs [runs=400]
//
// "old" replays the previous rules (restore floor 50%, +12 permanent infection
// only at 0% freshness, death at infection 100) next to the shipped ones.
import { createServer } from 'vite';

const RUNS = Number(process.argv[2] ?? 400);
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
const S = await server.ssrLoadModule('/src/game/survival.ts');
const I = await server.ssrLoadModule('/src/game/infection.ts');
const { ITEMS } = await server.ssrLoadModule('/src/game/loot.ts');
const { Rng } = await server.ssrLoadModule('/src/game/rng.ts');
const { CONSUMABLE_FLOOR } = await server.ssrLoadModule('/src/game/inventory.ts');

const FOODS = Object.values(ITEMS).filter((d) => d.perishable && d.effect.kind === 'food');
const SPOIL_PER_HOUR = 2.4;

// Where meals come from: the loot ruin bands (loot.ts), then aged in the bag.
const DIETS = {
  allGutted: (r) => r.int(6, 22) - SPOIL_PER_HOUR * r.int(0, 8),
  mixed: (r) => {
    const x = r.next();
    const base = x < 0.4 ? r.int(6, 22) : x < 0.7 ? r.int(28, 46) : r.int(52, 70);
    return base - SPOIL_PER_HOUR * r.int(0, 12);
  },
};

function run(rules, diet, seed, { meds = false, startInfection = 0, hours = 168 } = {}) {
  const r = new Rng(`spoil:${seed}`);
  const old = rules === 'old';
  let parts = S.initialBodyParts(90);
  let m = { ...S.initialMeters(), infection: startInfection };
  let meals = 0, bad = 0, minHp = 1, peak = startInfection, hungerSum = 0, steps = 0;
  let nextMed = meds ? 36 : Infinity, medsHeld = 0;
  const dt = 0.25;
  for (let t = 0; t < hours; t += dt) {
    const hourOfDay = (6 + t) % 24;
    const sleeping = hourOfDay >= 22 || hourOfDay < 6;
    if (t >= nextMed) { medsHeld++; nextMed += 36; }
    if (!sleeping) {
      if (m.hunger < 45) {
        const def = FOODS[r.int(0, FOODS.length - 1)];
        const c = Math.max(0, DIETS[diet](r));
        const scale = old ? 0.5 + 0.5 * (c / 100) : CONSUMABLE_FLOOR + (1 - CONSUMABLE_FLOOR) * (c / 100);
        m = { ...m, hunger: Math.min(100, m.hunger + Math.max(1, Math.round(def.effect.hunger * scale))) };
        if (def.effect.thirst) m = { ...m, thirst: Math.min(100, m.thirst + Math.round(def.effect.thirst * scale)) };
        if (old) {
          if (c <= 0) { m = { ...m, infection: Math.min(100, m.infection + 12) }; bad++; }
        } else {
          const load = I.ingestLoad(def, { condition: c }).load;
          if (load > 0) bad++;
          m = I.upsetStomach(m, load);
        }
        meals++;
      }
      if (m.thirst < 45) m = { ...m, thirst: Math.min(100, m.thirst + 28) };
      // Po Chai: settles a pending stomach (new) or trims infection (both).
      if (medsHeld > 0 && ((!old && (m.stomach ?? 0) > 5) || m.infection > 25)) {
        medsHeld--;
        m = I.settleStomach(I.cureInfection(m, 18), 'po_chai');
      }
    }
    parts = S.tickInjuries(parts, dt, false, m.hunger, 0, 0, I.infectionEffect(m.infection).recovery).parts;
    parts = S.tickSystemicDamage(parts, m, dt);
    m = S.tickMeters(m, dt, { sleeping });
    if (sleeping) m = { ...m, energy: S.sleepRestore(m.energy, dt, m) };
    else if (m.energy < 25) m = { ...m, energy: 60 }; // naps; energy isn't under test
    peak = Math.max(peak, m.infection);
    minHp = Math.min(minHp, S.totalHp(parts) / S.totalMaxHp(parts));
    hungerSum += m.hunger; steps++;
    const dead = (old && m.infection >= 100) || S.checkDeath(m, parts);
    if (dead) return { dead: true, peak, minHp, meals, bad, hunger: hungerSum / steps };
  }
  return { dead: false, peak, minHp, meals, bad, hunger: hungerSum / steps };
}

function summarize(label, opts) {
  console.log(`\n== ${label} ==`);
  console.log('rules  died  avgPeakInf p90PeakInf  minHP(p10)  avgHunger  meals  badMeals');
  for (const rules of ['old', 'new']) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) rs.push(run(rules, opts.diet, `${label}:${i}`, opts));
    const peak = rs.map((x) => x.peak).sort((a, b) => a - b);
    const hp = rs.map((x) => x.minHp).sort((a, b) => a - b);
    const avg = (f) => rs.reduce((s, x) => s + f(x), 0) / rs.length;
    console.log(
      `${rules.padEnd(5)} ${String(rs.filter((x) => x.dead).length).padStart(5)}  ${avg((x) => x.peak).toFixed(1).padStart(10)} ${peak[Math.floor(rs.length * 0.9)].toFixed(0).padStart(10)}  ${(hp[Math.floor(rs.length * 0.1)] * 100).toFixed(0).padStart(9)}%  ${avg((x) => x.hunger).toFixed(1).padStart(9)}  ${avg((x) => x.meals).toFixed(1).padStart(5)}  ${avg((x) => x.bad).toFixed(1).padStart(8)}`,
    );
  }
}

console.log(`${RUNS} seeded runs per row, 7 days each`);
summarize('every meal from Gutted sites, no meds', { diet: 'allGutted' });
summarize('mixed sources, no meds', { diet: 'mixed' });
summarize('mixed sources, 1 Po Chai per 36 h', { diet: 'mixed', meds: true });
summarize('every meal Gutted, already 30 infection from wounds', { diet: 'allGutted', startInfection: 30 });
summarize('every meal Gutted, already 70 infection from wounds', { diet: 'allGutted', startInfection: 70 });
await server.close();
