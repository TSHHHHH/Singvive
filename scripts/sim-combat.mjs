// Combat pacing sim — `npm run sim:combat`.
//
// Runs the production resolvers (`resolvePlayerAction` / `resolveEnemyAction`)
// on the same fill-the-track race the store runs, for every catalog enemy
// against a ladder of loadouts, and reports how long fights take and how much
// of that time is whiffed swings. Nothing here is a model of combat: it is the
// real d20 code, loaded through Vite's SSR runner so `import.meta.env` resolves.
//
//   npm run sim:combat                 summary per loadout
//   npm run sim:combat -- --detail     one row per enemy
//   npm run sim:combat -- --json f     also write raw rows to f
//   npm run sim:combat -- --n 4000     fights per matchup (default 2000)
//
// Player death is approximated as "took 100 total damage"; the real game can
// end a run earlier on a destroyed head or torso, so `win` reads slightly high.

import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const N = Number(opt('n', 2000));
const PLAYER_HP = 100;
const MAX_ACTIONS = 400;
const STANCE_IDS = ['aggressive', 'guarded', 'precision'];

/** Loadouts a run actually passes through, each met at the danger it lives at. */
const LOADOUTS = [
  { id: 'bare', label: 'Bare hands', danger: 1, gear: {} },
  { id: 'starter', label: 'Kitchen knife', danger: 2, gear: { mainHand: 'kitchen_knife', legs: 'jeans' } },
  {
    id: 'mid',
    label: 'Crowbar + jacket',
    danger: 3,
    gear: {
      mainHand: 'crowbar',
      head: 'hard_hat',
      body: 'leather_jacket',
      hands: 'work_gloves',
      legs: 'jeans',
      feet: 'sneakers',
    },
  },
  {
    id: 'heavy',
    label: 'Fire axe + vest',
    danger: 4,
    gear: {
      mainHand: 'fire_axe',
      head: 'motorcycle_helmet',
      body: 'security_vest',
      hands: 'work_gloves',
      legs: 'riding_pants',
      feet: 'combat_boots',
    },
  },
  {
    id: 'late',
    label: 'Parang + riot kit',
    danger: 5,
    gear: {
      mainHand: 'parang',
      offHand: 'riot_shield',
      head: 'riot_helmet',
      body: 'kevlar_vest',
      hands: 'tactical_gloves',
      legs: 'riot_pads',
      feet: 'combat_boots',
    },
  },
];

// `worn` is the survivor a run actually fields by day two: tired, a weapon arm
// at 70% and a knock to the head, caught out after dark in the rain.
const CONDITIONS = [
  { id: 'day', label: 'day, fresh', weather: { kind: 'clear', time: 'day' }, energy: 65, hurt: false },
  { id: 'night', label: 'night, rain', weather: { kind: 'rain', time: 'night' }, energy: 65, hurt: false },
  { id: 'worn', label: 'night, worn', weather: { kind: 'rain', time: 'night' }, energy: 30, hurt: true },
];

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const combat = await server.ssrLoadModule('/src/game/combat.ts');
  const inventory = await server.ssrLoadModule('/src/game/inventory.ts');
  const survival = await server.ssrLoadModule('/src/game/survival.ts');
  const { Rng } = await server.ssrLoadModule('/src/game/rng.ts');
  const { ENEMIES } = await server.ssrLoadModule('/src/game/enemies.ts');
  const balance = await server.ssrLoadModule('/src/dev/enemyBalance.ts');

  const attrs = { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 };
  const terrain = combat.TERRAIN.open_ground;

  const equip = (gear) => {
    const eq = inventory.emptyEquipment();
    for (const [slot, defId] of Object.entries(gear)) {
      eq[slot] = { uid: `sim-${slot}`, defId, container: 'equipment', x: 0, y: 0, rotated: false, stack: 1 };
    }
    return eq;
  };

  const toEnemy = (row) => ({
    name: row.name,
    kind: row.kind === 'zombie' || row.kind === 'elite' ? 'zombie' : row.kind === 'animal' ? 'animal' : 'human',
    hp: row.hp,
    maxHp: row.hp,
    attack: row.attack,
    defense: row.defense,
    damage: row.damage,
    infectious: row.infectious,
    armor: row.armor,
    speed: row.speed,
  });

  const rows = [];
  for (const cond of CONDITIONS) {
    const energy = cond.energy;
    for (const lo of LOADOUTS) {
      const eq = equip(lo.gear);
      const parts = survival.initialBodyParts(PLAYER_HP);
      if (cond.hurt) {
        parts.rightArm = { ...parts.rightArm, hp: Math.round(parts.rightArm.maxHp * 0.7) };
        parts.head = { ...parts.head, hp: Math.round(parts.head.maxHp * 0.8) };
      }
      const pStats = combat.playerCombatStats(
        attrs,
        [],
        eq,
        survival.armCombatPenalty(parts) + survival.headCombatPenalty(parts),
      );
      const equipSpd =
        inventory.equipSpeedBonus(eq) +
        combat.offHandCombatMods(eq, survival.guardArmFactor(parts)).speed;

      for (const stanceId of STANCE_IDS) {
        const stance = combat.STANCES[stanceId];
        const pSpeed = combat.playerSpeed(attrs, stance, energy, 1, equipSpd, pStats.speedFactor, 1);

        for (const row of balance.buildOverviewRows(ENEMIES, lo.danger)) {
          const enemy = toEnemy(row);
          const acc = { fights: 0, wins: 0, pSwings: 0, pHits: 0, eSwings: 0, eHits: 0, seconds: 0, dmgTaken: 0, actions: 0, gameMin: 0 };
          for (let i = 0; i < N; i++) {
            const rng = new Rng(`sim:${cond.id}:${lo.id}:${stanceId}:${row.key}:${i}`);
            let hp = enemy.hp;
            let taken = 0;
            let pg = 0;
            let eg = 0;
            let t = 0;
            let actions = 0;
            let round = 1;
            while (hp > 0 && taken < PLAYER_HP && actions < MAX_ACTIONS) {
              // Jump straight to whichever marker lands first (ties: player).
              const dtP = (combat.GAUGE_FULL - pg) / pSpeed;
              const dtE = (combat.GAUGE_FULL - eg) / enemy.speed;
              const playerActs = dtP <= dtE;
              const dt = playerActs ? dtP : dtE;
              t += dt;
              pg += pSpeed * dt;
              eg += enemy.speed * dt;
              actions++;
              if (playerActs) {
                pg = 0;
                const res = combat.resolvePlayerAction(
                  rng, pStats, { ...enemy, hp }, cond.weather, round, stance, terrain, energy,
                );
                acc.pSwings++;
                acc.gameMin += res.timeCostHours * 60;
                if (res.hit) acc.pHits++;
                hp = res.zombieHpAfter;
              } else {
                eg = 0;
                const res = combat.resolveEnemyAction(
                  rng, pStats, { ...enemy, hp }, cond.weather, round, stance, terrain, energy,
                  attrs, [], eq, parts, 0,
                );
                acc.eSwings++;
                if (res.playerDamage > 0) acc.eHits++;
                // Guarded's ×0.75, applied where the store applies it (`applyPartDamage`).
                taken += res.playerDamage > 0
                  ? Math.max(1, Math.round(res.playerDamage * res.limbDamageMult))
                  : 0;
                round++;
              }
            }
            acc.fights++;
            if (hp <= 0) acc.wins++;
            acc.seconds += t;
            acc.actions += actions;
            acc.dmgTaken += Math.min(PLAYER_HP, taken);
          }
          rows.push({
            condition: cond.id,
            loadout: lo.id,
            danger: lo.danger,
            stance: stanceId,
            enemy: row.key,
            kind: row.kind,
            enemyHp: enemy.hp,
            actions: acc.actions / acc.fights,
            seconds: acc.seconds / acc.fights,
            gameMin: acc.gameMin / acc.fights,
            playerHit: acc.pHits / Math.max(1, acc.pSwings),
            enemyHit: acc.eHits / Math.max(1, acc.eSwings),
            whiff: 1 - (acc.pHits + acc.eHits) / Math.max(1, acc.pSwings + acc.eSwings),
            dmgTaken: acc.dmgTaken / acc.fights,
            win: acc.wins / acc.fights,
          });
        }
      }
    }
  }

  const pct = (n) => `${Math.round(n * 100)}%`.padStart(4);
  const f1 = (n) => n.toFixed(1).padStart(6);
  const mean = (list, key) => list.reduce((s, r) => s + r[key], 0) / Math.max(1, list.length);
  // A zombie tier only turns up near its own danger; score a loadout against the
  // tiers it actually meets instead of a bare survivor against an Abomination.
  const tierDanger = (key) => {
    const i = ENEMIES.zombies.findIndex((z) => `zombie:${z.id}` === key);
    return i < 0 ? null : 1 + Math.round((i / Math.max(1, ENEMIES.zombies.length - 1)) * 4);
  };
  const relevant = (r) => {
    const d = tierDanger(r.enemy);
    return d == null ? r.kind !== 'elite' : Math.abs(d - r.danger) <= 1;
  };

  console.log(`\nCombat pacing — ${N} fights per matchup, Dex 5 / Str 5, open ground`);
  console.log('Averages over the enemies each loadout meets at its danger (elites excluded).\n');
  console.log('condition    loadout                 stance      swings  secs@1x  game min  you hit  they hit  whiffs  dmg taken  win');
  for (const cond of CONDITIONS) {
    for (const lo of LOADOUTS) {
      for (const stanceId of STANCE_IDS) {
        const set = rows.filter(
          (r) => r.condition === cond.id && r.loadout === lo.id && r.stance === stanceId && relevant(r),
        );
        console.log(
          [
            cond.label.padEnd(12),
            `${lo.label} (d${lo.danger})`.padEnd(23),
            stanceId.padEnd(10),
            f1(mean(set, 'actions')),
            f1(mean(set, 'seconds')) + '  ',
            f1(mean(set, 'gameMin')) + '    ',
            pct(mean(set, 'playerHit')) + '    ',
            pct(mean(set, 'enemyHit')) + '     ',
            pct(mean(set, 'whiff')) + '  ',
            f1(mean(set, 'dmgTaken')) + '    ',
            pct(mean(set, 'win')),
          ].join(' '),
        );
      }
    }
  }

  if (flag('detail')) {
    console.log('\nPer enemy (day, fresh · guarded, the stance every fight opens in)\n');
    console.log('loadout   enemy                    hp  swings  secs@1x  you hit  they hit  dmg taken  win');
    for (const r of rows.filter((x) => x.condition === 'day' && x.stance === 'guarded')) {
      if (!relevant(r) && r.kind !== 'elite') continue;
      console.log(
        [
          r.loadout.padEnd(9),
          r.enemy.padEnd(22),
          String(r.enemyHp).padStart(4),
          f1(r.actions),
          f1(r.seconds) + '  ',
          pct(r.playerHit) + '    ',
          pct(r.enemyHit) + '     ',
          f1(r.dmgTaken) + '    ',
          pct(r.win),
        ].join(' '),
      );
    }
  }

  const out = opt('json', '');
  if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
} finally {
  await server.close();
}
