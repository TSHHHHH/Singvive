import type { Enemy } from '../game/types';
import type {
  EliteArchetype,
  EliteId,
  EnemiesCatalog,
  FactionKey,
  HumanArchetype,
  HumanScaling,
  IntRange,
  LonerArchetype,
  LonerKind,
  ZombieArchetype,
} from '../game/enemies';
import {
  ELITE_IDS,
  FACTION_KEYS,
  LONER_KINDS,
  resolveHuman,
} from '../game/enemies';

export function midRange(r: IntRange): number {
  return Math.round((r[0] + r[1]) / 2);
}

/** Mid-run scavenger assumptions for editor threat sketches (not live combat). */
export const THREAT_BASELINE = {
  playerHp: 80,
  playerDamage: 12,
  playerSpeed: 10,
  playerHit: 0.75,
  playerArmor: 2,
  enemyHit: 0.7,
} as const;

export type ThreatEstimate = {
  /** Player actions to kill the enemy (hit-rate adjusted). */
  toKill: number;
  /** Player-action-equivalent time until the baseline player dies. */
  toDie: number;
  /** Higher = scarier (toKill / toDie). */
  threat: number;
};

export function estimateThreat(enemy: Enemy): ThreatEstimate {
  const dmgOut = Math.max(1, THREAT_BASELINE.playerDamage - enemy.armor);
  const toKill = Math.max(
    1,
    Math.ceil(enemy.hp / (dmgOut * THREAT_BASELINE.playerHit)),
  );
  const dmgIn = Math.max(1, enemy.damage - THREAT_BASELINE.playerArmor);
  const enemyHits = Math.max(
    1,
    Math.ceil(THREAT_BASELINE.playerHp / (dmgIn * THREAT_BASELINE.enemyHit)),
  );
  const enemyActionsPerPlayer = enemy.speed / THREAT_BASELINE.playerSpeed;
  const toDie = Math.max(
    1,
    Math.ceil(enemyHits / Math.max(0.15, enemyActionsPerPlayer)),
  );
  const threat = Math.round((toKill / toDie) * 10) / 10;
  return { toKill, toDie, threat };
}

export function expectedZombie(t: ZombieArchetype): Enemy {
  const hp = t.hp + midRange(t.hpJitter);
  return {
    name: t.name,
    kind: 'zombie',
    hp,
    maxHp: hp,
    attack: t.attack,
    defense: t.defense,
    damage: t.damage,
    infectious: t.infectious,
    armor: t.armor,
    speed: t.speed,
  };
}

export function expectedElite(t: EliteArchetype, danger: number): Enemy {
  const hp = t.hp + danger * t.hpPerDanger + midRange(t.hpJitter);
  return {
    name: t.name,
    kind: 'zombie',
    hp,
    maxHp: hp,
    attack: t.attack,
    defense: t.defense,
    damage: t.damage,
    infectious: t.infectious,
    armor: t.armor,
    speed: t.speed,
  };
}

export function expectedHuman(t: HumanArchetype, danger: number): Enemy {
  const hp = t.baseHp + danger * t.hpPerDanger + midRange(t.hpJitter);
  return {
    name: t.name,
    kind: 'human',
    hp,
    maxHp: hp,
    attack: t.baseAttack + Math.floor(danger / t.attackPerDangerDiv) + midRange(t.attackJitter),
    defense: t.baseDefense + Math.floor(danger / t.defensePerDangerDiv),
    damage: t.baseDamage + danger * t.damagePerDanger + midRange(t.damageJitter),
    infectious: 0,
    armor: t.armor,
    speed: t.baseSpeed - t.armor,
  };
}

export function expectedLoner(t: LonerArchetype, danger: number): Enemy {
  const hp = t.baseHp + danger * t.hpPerDanger + midRange(t.hpJitter);
  return {
    name: t.name,
    kind: 'human',
    hp,
    maxHp: hp,
    attack: t.baseAttack + Math.floor(danger / t.attackPerDangerDiv) + t.attackBonus,
    defense: t.baseDefense + Math.floor(danger / t.defensePerDangerDiv),
    damage: t.baseDamage + danger * t.damagePerDanger + midRange(t.damageJitter),
    infectious: 0,
    armor: t.armor,
    speed: t.speed,
  };
}

export function expectedFromScaling(s: HumanScaling, danger: number, name = 'Human', armor = 0): Enemy {
  return expectedHuman(
    {
      ...s,
      name,
      armor,
      drops: [],
    },
    danger,
  );
}

export type OverviewKind = 'zombie' | 'elite' | 'human' | 'loner';

export type OverviewRow = {
  key: string;
  kind: OverviewKind;
  name: string;
  context: string;
  hp: number;
  attack: number;
  defense: number;
  damage: number;
  armor: number;
  speed: number;
  infectious: number;
  toKill: number;
  toDie: number;
  threat: number;
  /** Navigation target inside the editor. */
  nav:
    | { tab: 'zombies'; sel: { t: 'tier'; id: string } }
    | { tab: 'zombies'; sel: { t: 'elite'; id: EliteId } }
    | { tab: 'humans'; sel: { t: 'faction'; id: FactionKey } }
    | { tab: 'humans'; sel: { t: 'loner'; id: LonerKind } }
    | { tab: 'humans'; sel: { t: 'defaults' } };
};

export type OverviewSortKey =
  | 'name'
  | 'kind'
  | 'hp'
  | 'attack'
  | 'defense'
  | 'damage'
  | 'armor'
  | 'speed'
  | 'infectious'
  | 'toKill'
  | 'toDie'
  | 'threat';

function rowFromEnemy(
  key: string,
  kind: OverviewKind,
  context: string,
  enemy: Enemy,
  nav: OverviewRow['nav'],
): OverviewRow {
  const threat = estimateThreat(enemy);
  return {
    key,
    kind,
    name: enemy.name,
    context,
    hp: enemy.hp,
    attack: enemy.attack,
    defense: enemy.defense,
    damage: enemy.damage,
    armor: enemy.armor,
    speed: enemy.speed,
    infectious: enemy.infectious,
    toKill: threat.toKill,
    toDie: threat.toDie,
    threat: threat.threat,
    nav,
  };
}

/** Build overview rows at a fixed danger (midpoint jitter, no RNG). */
export function buildOverviewRows(catalog: EnemiesCatalog, danger: number): OverviewRow[] {
  const rows: OverviewRow[] = [];

  catalog.zombies.forEach((z, i) => {
    rows.push(
      rowFromEnemy(
        `zombie:${z.id}`,
        'zombie',
        `tier ${i + 1} · danger ~${i + 1}`,
        expectedZombie(z),
        { tab: 'zombies', sel: { t: 'tier', id: z.id } },
      ),
    );
  });

  for (const id of ELITE_IDS) {
    const e = catalog.elites[id];
    const bound =
      catalog.spawn.eliteBindings.hdb === id
        ? 'HDB'
        : catalog.spawn.eliteBindings.tunnel === id
          ? 'tunnel'
          : 'unbound';
    rows.push(
      rowFromEnemy(
        `elite:${id}`,
        'elite',
        `${bound} · danger ${danger}`,
        expectedElite(e, danger),
        { tab: 'zombies', sel: { t: 'elite', id } },
      ),
    );
  }

  for (const id of FACTION_KEYS) {
    const resolved = resolveHuman(catalog, id);
    const gang = catalog.spawn.wildsGangFaction === id ? ' · wilds gang' : '';
    rows.push(
      rowFromEnemy(
        `human:${id}`,
        'human',
        `faction · danger ${danger}${gang}`,
        expectedHuman(resolved, danger),
        { tab: 'humans', sel: { t: 'faction', id } },
      ),
    );
  }

  for (const id of LONER_KINDS) {
    rows.push(
      rowFromEnemy(
        `loner:${id}`,
        'loner',
        `loner · danger ${danger}`,
        expectedLoner(catalog.loners[id], danger),
        { tab: 'humans', sel: { t: 'loner', id } },
      ),
    );
  }

  return rows;
}

export function sortOverviewRows(
  rows: OverviewRow[],
  key: OverviewSortKey,
  dir: 'asc' | 'desc',
): OverviewRow[] {
  const mul = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb) * mul || a.name.localeCompare(b.name);
    }
    return ((va as number) - (vb as number)) * mul || a.name.localeCompare(b.name);
  });
}

export function whereUsedNotes(
  catalog: EnemiesCatalog,
  target:
    | { t: 'tier'; id: string }
    | { t: 'elite'; id: EliteId }
    | { t: 'faction'; id: FactionKey }
    | { t: 'loner'; id: LonerKind }
    | { t: 'defaults' },
): string[] {
  const notes: string[] = [];
  if (target.t === 'tier') {
    const idx = catalog.zombies.findIndex((z) => z.id === target.id);
    if (idx >= 0) {
      notes.push(`Danger tier index ${idx + 1} (base pick at danger ${idx + 1})`);
      notes.push(
        `Tier jitter ${catalog.spawn.zombieTierJitter[0]}…${catalog.spawn.zombieTierJitter[1]} can shift ±1`,
      );
    }
  } else if (target.t === 'elite') {
    if (catalog.spawn.eliteBindings.hdb === target.id) {
      notes.push('Bound as HDB Corridor elite (makeBlockHunter)');
    }
    if (catalog.spawn.eliteBindings.tunnel === target.id) {
      notes.push('Bound as tunnel pressure elite (makeTunnelStalker)');
    }
    if (
      catalog.spawn.eliteBindings.hdb !== target.id &&
      catalog.spawn.eliteBindings.tunnel !== target.id
    ) {
      notes.push('Not bound to HDB or tunnel — unreachable by current spawn rules');
    }
  } else if (target.t === 'faction') {
    if (catalog.spawn.wildsGangFaction === target.id) {
      notes.push('Wilds gang_patrol spawns this faction');
    }
    notes.push(`Human drop chance ${catalog.spawn.humanDropChance}`);
    const overrides = Object.keys(catalog.humans[target.id]).filter(
      (k) => k !== 'name' && k !== 'armor' && k !== 'drops',
    );
    if (overrides.length) {
      notes.push(`Overrides shared defaults: ${overrides.join(', ')}`);
    } else {
      notes.push('Uses shared humanDefaults for all scaling');
    }
  } else if (target.t === 'loner') {
    notes.push('Doorway fight events (scavenger / desperate survivor)');
    notes.push(`Drop chance ${catalog.loners[target.id].dropChance}`);
  } else {
    notes.push('Applied to every faction human unless that faction overrides a field');
  }
  return notes;
}
