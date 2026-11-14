// Starting-kit balance sim — `npm run sim:kits`.
//
// For every occupation preset and every gear-granting trait, resolves the real
// starting kit (`resolveStartingKit`) and measures what the *gear* is worth on
// top of the traits: the same build is fought twice through the production
// combat resolvers, once with its kit and once with the plain base kit. The
// difference is the kit's advantage. Also reports the non-combat haul: healing
// HP, hunger/thirst carried, carry capacity and pack cells.
//
//   npm run sim:kits             summary
//   npm run sim:kits -- --n 800  fights per matchup (default 400)

import { createServer } from 'vite';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const N = Number(opt('n', 400));
const PLAYER_HP = 100;
const MAX_ACTIONS = 400;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const combat = await server.ssrLoadModule('/src/game/combat.ts');
  const inventory = await server.ssrLoadModule('/src/game/inventory.ts');
  const survival = await server.ssrLoadModule('/src/game/survival.ts');
  const character = await server.ssrLoadModule('/src/game/character.ts');
  const skills = await server.ssrLoadModule('/src/game/skills.ts');
  const loot = await server.ssrLoadModule('/src/game/loot.ts');
  const kitMod = await server.ssrLoadModule('/src/game/startingKit.ts');
  const { OCCUPATIONS } = await server.ssrLoadModule('/src/game/occupations.ts');
  const { Rng } = await server.ssrLoadModule('/src/game/rng.ts');
  const { ENEMIES } = await server.ssrLoadModule('/src/game/enemies.ts');
  const balance = await server.ssrLoadModule('/src/dev/enemyBalance.ts');
  const terrain = combat.TERRAIN.open_ground;

  const equipFrom = (kit) => {
    const eq = inventory.emptyEquipment();
    for (const [slot, line] of Object.entries(kit.equip)) {
      if (line) eq[slot] = { uid: `k-${slot}`, defId: line.id, container: `equip:${slot}`, x: 0, y: 0, rotated: false, stack: 1, condition: 100 };
    }
    return eq;
  };
  const toEnemy = (row) => ({
    name: row.name,
    kind: row.kind === 'zombie' || row.kind === 'elite' ? 'zombie' : row.kind === 'animal' ? 'animal' : 'human',
    hp: row.hp, maxHp: row.hp, attack: row.attack, defense: row.defense, damage: row.damage,
    infectious: row.infectious, armor: row.armor, speed: row.speed,
  });
  // Early-run opposition: danger 1–2, no elites.
  const enemies = [1, 2].flatMap((d) =>
    balance.buildOverviewRows(ENEMIES, d).filter((r) => r.kind !== 'elite').map((r) => ({ d, row: r })),
  );
  const conds = [
    { id: 'day', weather: { kind: 'clear', time: 'day' } },
    { id: 'night', weather: { kind: 'rain', time: 'night' } },
  ];

  function fight(traitIds, eq) {
    const attrs = character.attributesFromTraits(traitIds);
    const sk = skills.previewStartingSkills(traitIds);
    const parts = survival.initialBodyParts(PLAYER_HP);
    const p = combat.playerCombatStats(attrs, traitIds, eq, 0, 0, sk);
    const equipSpd = inventory.equipSpeedBonus(eq) + combat.offHandCombatMods(eq, 1).speed;
    let wins = 0, taken = 0, fights = 0, swings = 0;
    for (const cond of conds) for (const stanceId of ['guarded', 'aggressive']) {
      const stance = combat.STANCES[stanceId];
      const pSpeed = combat.playerSpeed(attrs, stance, 65, 1, equipSpd, p.speedFactor, 1);
      for (const { d, row } of enemies) {
        const enemy = toEnemy(row);
        for (let i = 0; i < N; i++) {
          const rng = new Rng(`kit:${cond.id}:${stanceId}:${d}:${row.key}:${i}`);
          let hp = enemy.hp, tk = 0, pg = 0, eg = 0, actions = 0, round = 1;
          while (hp > 0 && tk < PLAYER_HP && actions < MAX_ACTIONS) {
            const dtP = (combat.GAUGE_FULL - pg) / pSpeed;
            const dtE = (combat.GAUGE_FULL - eg) / enemy.speed;
            const playerActs = dtP <= dtE;
            const dt = playerActs ? dtP : dtE;
            pg += pSpeed * dt; eg += enemy.speed * dt; actions++;
            if (playerActs) {
              pg = 0; swings++;
              hp = combat.resolvePlayerAction(rng, p, { ...enemy, hp }, cond.weather, round, stance, terrain, 65).zombieHpAfter;
            } else {
              eg = 0;
              const r = combat.resolveEnemyAction(rng, p, { ...enemy, hp }, cond.weather, round, stance, terrain, 65, attrs, traitIds, eq, parts, 0);
              tk += r.playerDamage > 0 ? Math.max(1, Math.round(r.playerDamage * r.limbDamageMult)) : 0;
              round++;
            }
          }
          fights++; if (hp <= 0) wins++; taken += Math.min(PLAYER_HP, tk);
        }
      }
    }
    return { win: wins / fights, taken: taken / fights, swings: swings / fights };
  }

  function haul(kit) {
    let heal = 0, food = 0, water = 0, cells = 0;
    for (const l of kitMod.kitLines(kit)) {
      const e = loot.itemDef(l.id).effect ?? {};
      if (e.kind === 'heal') heal += (e.health ?? 0) * l.count;
      if (e.kind === 'food') food += (e.hunger ?? 0) * l.count;
      if (e.thirst > 0) water += e.thirst * l.count;
      if (e.kind === 'water' && e.hunger) food += e.hunger * l.count;
    }
    const bag = kit.equip.bag ? loot.itemDef(kit.equip.bag.id) : null;
    if (bag?.packGrid) cells = bag.packGrid.w * bag.packGrid.h - (bag.packGrid.blocked?.length ?? 0);
    return { heal, food, water, cells, value: kitMod.kitLines(kit).reduce((s, l) => s + loot.itemDef(l.id).value * l.count, 0) };
  }

  const builds = [
    ['(base kit, no traits)', []],
    ...OCCUPATIONS.map((o) => [o.name, o.traitIds]),
    ...Object.keys(kitMod.TRAIT_KITS)
      .filter((id) => !OCCUPATIONS.some((o) => o.traitIds.includes(id)))
      .map((id) => [`+ ${character.getTrait(id).name} (${character.getTrait(id).cost})`, [id]]),
  ];
  const baseKit = kitMod.resolveStartingKit([]);
  const baseEq = equipFrom(baseKit);
  const pct = (n) => `${(n * 100).toFixed(0)}%`.padStart(5);
  const sgn = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);
  console.log(`\nStarting-kit sim — ${N} fights × ${enemies.length} early enemies × day/night × guarded/aggressive`);
  console.log('"kit Δ" = this build with its kit minus the same traits on the plain base kit.\n');
  console.log('build                          win   Δwin  dmg taken  Δdmg   Δswings  weapon         heal  food  water  cells  value');
  for (const [label, traitIds] of builds) {
    const kit = kitMod.resolveStartingKit(traitIds, new Rng('sim-kits'));
    const withKit = fight(traitIds, equipFrom(kit));
    const plain = fight(traitIds, baseEq);
    const h = haul(kit);
    console.log([
      label.padEnd(30), pct(withKit.win), sgn((withKit.win - plain.win) * 100, 0).padStart(5) + 'pt',
      withKit.taken.toFixed(1).padStart(8), sgn(withKit.taken - plain.taken).padStart(7),
      sgn(withKit.swings - plain.swings).padStart(8), '  ' + (kit.equip.mainHand?.id ?? '-').padEnd(14),
      String(h.heal).padStart(4), String(h.food).padStart(5), String(h.water).padStart(6),
      String(h.cells).padStart(6), String(h.value).padStart(6),
    ].join(' '));
  }
} finally {
  await server.close();
}
