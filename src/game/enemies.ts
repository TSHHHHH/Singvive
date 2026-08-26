import type { Enemy, FactionId } from './types';
import type { IconName } from '../icons/keys';
import type { Rng } from './rng';
import { ITEMS } from './loot';
import enemiesCatalog from './data/enemies.json' with { type: 'json' };

export type FactionKey = Exclude<FactionId, null>;
export type LonerKind = 'scavenger' | 'survivor' | 'raider' | 'tout';
export type EliteId = 'hulk' | 'stalker';
export type EliteContext = 'hdb' | 'tunnel';

export type IntRange = [number, number];

export type AnimalHabitat = 'water' | 'forest' | 'urban';

export const ANIMAL_HABITATS: readonly AnimalHabitat[] = ['water', 'forest', 'urban'] as const;

export interface AnimalArchetype {
  id: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  damage: number;
  infectious: number;
  armor: number;
  speed: number;
  hpJitter: IntRange;
  habitats: AnimalHabitat[];
  weight: number;
  dropChance: number;
  drops: string[];
  icon: IconName;
}

export interface ZombieArchetype {
  id: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  damage: number;
  infectious: number;
  armor: number;
  speed: number;
  hpJitter: IntRange;
}

export interface EliteArchetype {
  id: EliteId;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  damage: number;
  infectious: number;
  armor: number;
  speed: number;
  hpPerDanger: number;
  hpJitter: IntRange;
}

/** Shared scaling for faction humans; factions may override per-field. */
export interface HumanScaling {
  baseHp: number;
  hpPerDanger: number;
  hpJitter: IntRange;
  baseAttack: number;
  attackPerDangerDiv: number;
  attackJitter: IntRange;
  baseDefense: number;
  defensePerDangerDiv: number;
  baseDamage: number;
  damagePerDanger: number;
  damageJitter: IntRange;
  baseSpeed: number;
}

export interface HumanFactionEntry extends Partial<HumanScaling> {
  name: string;
  armor: number;
  drops: string[];
}

/** Fully resolved human kit (defaults merged with faction overrides). */
export type HumanArchetype = HumanScaling & {
  name: string;
  armor: number;
  drops: string[];
};

export interface LonerArchetype {
  name: string;
  armor: number;
  speed: number;
  baseHp: number;
  hpPerDanger: number;
  hpJitter: IntRange;
  baseAttack: number;
  attackPerDangerDiv: number;
  attackBonus: number;
  baseDefense: number;
  defensePerDangerDiv: number;
  baseDamage: number;
  damagePerDanger: number;
  damageJitter: IntRange;
  dropChance: number;
  drops: string[];
}

export interface SpawnRules {
  zombieTierJitter: IntRange;
  humanDropChance: number;
  wildsGangFaction: FactionKey;
  eliteBindings: Record<EliteContext, EliteId>;
}

export interface EnemiesCatalog {
  zombies: ZombieArchetype[];
  elites: Record<EliteId, EliteArchetype>;
  humanDefaults: HumanScaling;
  humans: Record<FactionKey, HumanFactionEntry>;
  loners: Record<LonerKind, LonerArchetype>;
  animals: AnimalArchetype[];
  spawn: SpawnRules;
}

export const FACTION_KEYS: readonly FactionKey[] = [
  'muster',
  'gotong',
  'syndicate_88',
  'sta',
] as const;

export const LONER_KINDS: readonly LonerKind[] = [
  'scavenger',
  'survivor',
  'raider',
  'tout',
] as const;
export const ELITE_IDS: readonly EliteId[] = ['hulk', 'stalker'] as const;

export const HUMAN_SCALING_KEYS: readonly (keyof HumanScaling)[] = [
  'baseHp',
  'hpPerDanger',
  'hpJitter',
  'baseAttack',
  'attackPerDangerDiv',
  'attackJitter',
  'baseDefense',
  'defensePerDangerDiv',
  'baseDamage',
  'damagePerDanger',
  'damageJitter',
  'baseSpeed',
] as const;

/** Source of truth is src/game/data/enemies.json (editable via the DEV enemy browser). */
export const ENEMIES: EnemiesCatalog = structuredClone(enemiesCatalog) as unknown as EnemiesCatalog;

/** Merge shared humanDefaults with a faction entry's optional overrides. */
export function resolveHuman(catalog: EnemiesCatalog, faction: FactionKey): HumanArchetype {
  const h = catalog.humans[faction];
  const d = catalog.humanDefaults;
  return {
    name: h.name,
    armor: h.armor,
    drops: h.drops,
    baseHp: h.baseHp ?? d.baseHp,
    hpPerDanger: h.hpPerDanger ?? d.hpPerDanger,
    hpJitter: h.hpJitter ?? d.hpJitter,
    baseAttack: h.baseAttack ?? d.baseAttack,
    attackPerDangerDiv: h.attackPerDangerDiv ?? d.attackPerDangerDiv,
    attackJitter: h.attackJitter ?? d.attackJitter,
    baseDefense: h.baseDefense ?? d.baseDefense,
    defensePerDangerDiv: h.defensePerDangerDiv ?? d.defensePerDangerDiv,
    baseDamage: h.baseDamage ?? d.baseDamage,
    damagePerDanger: h.damagePerDanger ?? d.damagePerDanger,
    damageJitter: h.damageJitter ?? d.damageJitter,
    baseSpeed: h.baseSpeed ?? d.baseSpeed,
  };
}

function intRange(r: IntRange, rng: Rng): number {
  return rng.int(r[0], r[1]);
}

/** Build a zombie scaled to danger (1..5) from an encounter catalog. */
export function rollZombie(catalog: EnemiesCatalog, rng: Rng, danger: number): Enemy {
  const tierRng = rng.fork('zombie');
  const jitter = catalog.spawn.zombieTierJitter;
  const max = catalog.zombies.length - 1;
  // Spread danger 1..5 across the full ladder so added mid/high tiers stay reachable.
  const base = Math.round(((Math.max(1, Math.min(5, danger)) - 1) / 4) * max);
  const idx = Math.max(0, Math.min(max, base + intRange(jitter, tierRng)));
  const t = catalog.zombies[idx]!;
  const hp = t.hp + intRange(t.hpJitter, tierRng);
  return {
    templateId: t.id,
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

export function rollElite(
  catalog: EnemiesCatalog,
  rng: Rng,
  eliteId: EliteId,
  danger: number,
  forkKey: string,
): Enemy {
  const t = catalog.elites[eliteId];
  const r = rng.fork(forkKey);
  const hp = t.hp + danger * t.hpPerDanger + intRange(t.hpJitter, r);
  return {
    templateId: eliteId,
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

export function rollHuman(
  catalog: EnemiesCatalog,
  rng: Rng,
  faction: FactionKey,
  danger: number,
): Enemy {
  const t = resolveHuman(catalog, faction);
  const r = rng.fork('human');
  const hp = t.baseHp + danger * t.hpPerDanger + intRange(t.hpJitter, r);
  return {
    templateId: `human.${faction}`,
    name: t.name,
    kind: 'human',
    hp,
    maxHp: hp,
    attack: t.baseAttack + Math.floor(danger / t.attackPerDangerDiv) + intRange(t.attackJitter, r),
    defense: t.baseDefense + Math.floor(danger / t.defensePerDangerDiv),
    damage: t.baseDamage + danger * t.damagePerDanger + intRange(t.damageJitter, r),
    infectious: 0,
    armor: t.armor,
    speed: t.baseSpeed - t.armor,
  };
}

export function rollLoner(
  catalog: EnemiesCatalog,
  rng: Rng,
  kind: LonerKind,
  danger: number,
): Enemy {
  const t = catalog.loners[kind];
  const r = rng.fork('loner');
  const hp = t.baseHp + danger * t.hpPerDanger + intRange(t.hpJitter, r);
  return {
    templateId: `loner.${kind}`,
    name: t.name,
    kind: 'human',
    hp,
    maxHp: hp,
    attack:
      t.baseAttack + Math.floor(danger / t.attackPerDangerDiv) + t.attackBonus,
    defense: t.baseDefense + Math.floor(danger / t.defensePerDangerDiv),
    damage: t.baseDamage + danger * t.damagePerDanger + intRange(t.damageJitter, r),
    infectious: 0,
    armor: t.armor,
    speed: t.speed,
  };
}

export function combatantIcon(enemy: Enemy): IconName {
  if (enemy.icon) return enemy.icon;
  if (enemy.kind === 'human') return 'combat.enemyHuman';
  if (enemy.kind === 'animal') return 'combat.enemyAnimal';
  return 'combat.enemyZombie';
}

function scaleAnimal(
  pick: AnimalArchetype,
  rng: Rng,
  danger: number,
): Enemy {
  const hpScale = 1 + Math.max(0, danger - 2) * 0.08;
  const hp = Math.max(1, Math.round((pick.hp + intRange(pick.hpJitter, rng)) * hpScale));
  return {
    templateId: pick.id,
    name: pick.name,
    kind: 'animal',
    hp,
    maxHp: hp,
    attack: pick.attack,
    defense: pick.defense,
    damage: pick.damage,
    infectious: pick.infectious,
    armor: pick.armor,
    speed: pick.speed,
    icon: pick.icon,
  };
}

export function rollAnimal(
  catalog: EnemiesCatalog,
  rng: Rng,
  habitat: AnimalHabitat,
  danger: number,
): Enemy {
  const pool = catalog.animals.filter((a) => a.habitats.includes(habitat));
  const r = rng.fork('animal');
  const pick = pool.length
    ? r.weighted(pool.map((a) => [a, Math.max(1, a.weight)] as const))
    : catalog.animals[0]!;
  return scaleAnimal(pick, r, danger);
}

/** Force a named animal (tunnel floodwater always wants the otter). */
export function rollAnimalById(
  catalog: EnemiesCatalog,
  rng: Rng,
  id: string,
  danger: number,
): Enemy {
  const pick = catalog.animals.find((a) => a.id === id) ?? catalog.animals[0]!;
  return scaleAnimal(pick, rng.fork('animal'), danger);
}

export function rollAnimalDrop(
  catalog: EnemiesCatalog,
  rng: Rng,
  enemyTemplateId: string,
): string | null {
  const t = catalog.animals.find((a) => a.id === enemyTemplateId);
  if (!t || !t.drops.length) return null;
  if (t.dropChance < 1 && !rng.chance(t.dropChance)) return null;
  return rng.pick(t.drops);
}

export function humanDrops(catalog: EnemiesCatalog, faction: FactionKey): string[] {
  return catalog.humans[faction].drops;
}

export function lonerDrops(catalog: EnemiesCatalog, kind: LonerKind): string[] {
  return catalog.loners[kind].drops;
}

export function rollHumanDrop(
  catalog: EnemiesCatalog,
  rng: Rng,
  faction: FactionKey,
): string | null {
  const pool = humanDrops(catalog, faction);
  if (!pool.length) return null;
  if (!rng.chance(catalog.spawn.humanDropChance)) return null;
  return rng.pick(pool);
}

export function rollLonerDrop(
  catalog: EnemiesCatalog,
  rng: Rng,
  kind: LonerKind,
): string | null {
  const t = catalog.loners[kind];
  if (!t.drops.length) return null;
  // dropChance ≥ 1 means always drop — skip the chance roll so seeds match
  // the old scavenger path (pick only, no Bernoulli draw).
  if (t.dropChance < 1 && !rng.chance(t.dropChance)) return null;
  return rng.pick(t.drops);
}

if (import.meta.env.DEV) {
  const seen = new Set<string>();
  for (const z of ENEMIES.zombies) {
    if (seen.has(z.id)) console.error(`[enemies] duplicate zombie id "${z.id}"`);
    seen.add(z.id);
  }
  for (const id of ELITE_IDS) {
    if (!ENEMIES.elites[id]) console.error(`[enemies] missing elite "${id}"`);
  }
  if (!ENEMIES.humanDefaults) console.error('[enemies] missing humanDefaults');
  for (const id of FACTION_KEYS) {
    if (!ENEMIES.humans[id]) console.error(`[enemies] missing human faction "${id}"`);
  }
  for (const id of LONER_KINDS) {
    if (!ENEMIES.loners[id]) console.error(`[enemies] missing loner "${id}"`);
  }
  if (!Array.isArray(ENEMIES.animals) || ENEMIES.animals.length < 1) {
    console.error('[enemies] animals must be a non-empty array');
  }
  const animalIds = new Set<string>();
  for (const a of ENEMIES.animals ?? []) {
    if (animalIds.has(a.id)) console.error(`[enemies] duplicate animal id "${a.id}"`);
    animalIds.add(a.id);
  }
  const allDrops = [
    ...Object.values(ENEMIES.humans).flatMap((h) => h.drops),
    ...Object.values(ENEMIES.loners).flatMap((l) => l.drops),
    ...(ENEMIES.animals ?? []).flatMap((a) => a.drops),
  ];
  for (const id of allDrops) {
    if (!ITEMS[id]) console.error(`[enemies] drop references unknown item "${id}"`);
  }
  const { hdb, tunnel } = ENEMIES.spawn.eliteBindings;
  if (!ENEMIES.elites[hdb]) console.error(`[enemies] spawn.eliteBindings.hdb unknown "${hdb}"`);
  if (!ENEMIES.elites[tunnel]) {
    console.error(`[enemies] spawn.eliteBindings.tunnel unknown "${tunnel}"`);
  }
  if (!ENEMIES.humans[ENEMIES.spawn.wildsGangFaction]) {
    console.error(`[enemies] spawn.wildsGangFaction unknown`);
  }
}
