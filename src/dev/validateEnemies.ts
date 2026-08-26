/** Shared enemies-catalog validation for the DEV enemy API and browser UI. */

const ELITE_IDS = ['hulk', 'stalker'] as const;
const FACTION_KEYS = ['muster', 'gotong', 'syndicate_88', 'sta'] as const;
const LONER_KINDS = ['scavenger', 'survivor', 'raider', 'tout'] as const;

export type EliteId = (typeof ELITE_IDS)[number];
export type FactionKey = (typeof FACTION_KEYS)[number];
export type LonerKind = (typeof LONER_KINDS)[number];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isIntRange(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    isNumber(v[0]) &&
    isNumber(v[1]) &&
    v[0] <= v[1]
  );
}

function isSafeId(id: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(id);
}

function validateDrops(
  label: string,
  drops: unknown,
  errors: string[],
  knownItemIds?: ReadonlySet<string>,
): void {
  if (!Array.isArray(drops)) {
    errors.push(`${label}: drops must be an array`);
    return;
  }
  const seen = new Set<string>();
  for (const id of drops) {
    if (typeof id !== 'string' || !isSafeId(id)) {
      errors.push(`${label}: drop id must match /^[a-z][a-z0-9_]*$/`);
      continue;
    }
    if (seen.has(id)) errors.push(`${label}: duplicate drop "${id}"`);
    seen.add(id);
    if (knownItemIds && !knownItemIds.has(id)) {
      errors.push(`${label}: unknown item "${id}"`);
    }
  }
}

function validateZombie(raw: unknown, index: number, errors: string[], seenIds: Set<string>): void {
  const label = `zombies[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${label}: must be an object`);
    return;
  }
  if (typeof raw.id !== 'string' || !isSafeId(raw.id)) {
    errors.push(`${label}: id must match /^[a-z][a-z0-9_]*$/`);
  } else if (seenIds.has(raw.id)) {
    errors.push(`${label}: duplicate id "${raw.id}"`);
  } else {
    seenIds.add(raw.id);
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    errors.push(`${label}: name is required`);
  }
  for (const key of ['hp', 'attack', 'defense', 'damage', 'armor', 'speed'] as const) {
    if (!isNumber(raw[key])) errors.push(`${label}: ${key} must be a number`);
  }
  if (!isNumber(raw.infectious) || raw.infectious < 0 || raw.infectious > 1) {
    errors.push(`${label}: infectious must be 0..1`);
  }
  if (!isIntRange(raw.hpJitter)) errors.push(`${label}: hpJitter must be [lo, hi]`);
  if (isNumber(raw.hp) && raw.hp < 1) errors.push(`${label}: hp must be ≥ 1`);
  if (isNumber(raw.speed) && raw.speed < 1) errors.push(`${label}: speed must be ≥ 1`);
}

function validateElite(id: string, raw: unknown, errors: string[]): void {
  const label = `elites.${id}`;
  if (!isRecord(raw)) {
    errors.push(`${label}: must be an object`);
    return;
  }
  if (raw.id !== id) errors.push(`${label}: id must equal key "${id}"`);
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    errors.push(`${label}: name is required`);
  }
  for (const key of ['hp', 'attack', 'defense', 'damage', 'armor', 'speed', 'hpPerDanger'] as const) {
    if (!isNumber(raw[key])) errors.push(`${label}: ${key} must be a number`);
  }
  if (!isNumber(raw.infectious) || raw.infectious < 0 || raw.infectious > 1) {
    errors.push(`${label}: infectious must be 0..1`);
  }
  if (!isIntRange(raw.hpJitter)) errors.push(`${label}: hpJitter must be [lo, hi]`);
}

function validateHumanScaling(label: string, raw: Record<string, unknown>, errors: string[], required: boolean): void {
  const keys = [
    'baseHp',
    'hpPerDanger',
    'baseAttack',
    'attackPerDangerDiv',
    'baseDefense',
    'defensePerDangerDiv',
    'baseDamage',
    'damagePerDanger',
    'baseSpeed',
  ] as const;
  for (const key of keys) {
    if (raw[key] === undefined) {
      if (required) errors.push(`${label}: ${key} must be a number`);
      continue;
    }
    if (!isNumber(raw[key])) errors.push(`${label}: ${key} must be a number`);
  }
  if (raw.hpJitter !== undefined || required) {
    if (!isIntRange(raw.hpJitter)) errors.push(`${label}: hpJitter must be [lo, hi]`);
  }
  if (raw.attackJitter !== undefined || required) {
    if (!isIntRange(raw.attackJitter)) errors.push(`${label}: attackJitter must be [lo, hi]`);
  }
  if (raw.damageJitter !== undefined || required) {
    if (!isIntRange(raw.damageJitter)) errors.push(`${label}: damageJitter must be [lo, hi]`);
  }
  if (isNumber(raw.attackPerDangerDiv) && raw.attackPerDangerDiv < 1) {
    errors.push(`${label}: attackPerDangerDiv must be ≥ 1`);
  }
  if (isNumber(raw.defensePerDangerDiv) && raw.defensePerDangerDiv < 1) {
    errors.push(`${label}: defensePerDangerDiv must be ≥ 1`);
  }
}

function validateHumanDefaults(raw: unknown, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push('humanDefaults: must be an object');
    return;
  }
  validateHumanScaling('humanDefaults', raw, errors, true);
}

function validateHuman(faction: string, raw: unknown, errors: string[], knownItemIds?: ReadonlySet<string>): void {
  const label = `humans.${faction}`;
  if (!isRecord(raw)) {
    errors.push(`${label}: must be an object`);
    return;
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    errors.push(`${label}: name is required`);
  }
  if (!isNumber(raw.armor)) errors.push(`${label}: armor must be a number`);
  validateDrops(label, raw.drops, errors, knownItemIds);
  // Optional per-faction scaling overrides
  validateHumanScaling(label, raw, errors, false);
}

function validateLoner(kind: string, raw: unknown, errors: string[], knownItemIds?: ReadonlySet<string>): void {
  const label = `loners.${kind}`;
  if (!isRecord(raw)) {
    errors.push(`${label}: must be an object`);
    return;
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    errors.push(`${label}: name is required`);
  }
  for (const key of [
    'armor',
    'speed',
    'baseHp',
    'hpPerDanger',
    'baseAttack',
    'attackPerDangerDiv',
    'attackBonus',
    'baseDefense',
    'defensePerDangerDiv',
    'baseDamage',
    'damagePerDanger',
    'dropChance',
  ] as const) {
    if (!isNumber(raw[key])) errors.push(`${label}: ${key} must be a number`);
  }
  if (isNumber(raw.dropChance) && (raw.dropChance < 0 || raw.dropChance > 1)) {
    errors.push(`${label}: dropChance must be 0..1`);
  }
  if (isNumber(raw.attackPerDangerDiv) && raw.attackPerDangerDiv < 1) {
    errors.push(`${label}: attackPerDangerDiv must be ≥ 1`);
  }
  if (isNumber(raw.defensePerDangerDiv) && raw.defensePerDangerDiv < 1) {
    errors.push(`${label}: defensePerDangerDiv must be ≥ 1`);
  }
  if (!isIntRange(raw.hpJitter)) errors.push(`${label}: hpJitter must be [lo, hi]`);
  if (!isIntRange(raw.damageJitter)) errors.push(`${label}: damageJitter must be [lo, hi]`);
  validateDrops(label, raw.drops, errors, knownItemIds);
}

function validateAnimal(
  raw: unknown,
  index: number,
  errors: string[],
  seenIds: Set<string>,
  knownItemIds?: ReadonlySet<string>,
): void {
  const label = `animals[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${label}: must be an object`);
    return;
  }
  if (typeof raw.id !== 'string' || !isSafeId(raw.id)) {
    errors.push(`${label}: id must match /^[a-z][a-z0-9_]*$/`);
  } else if (seenIds.has(raw.id)) {
    errors.push(`${label}: duplicate id "${raw.id}"`);
  } else {
    seenIds.add(raw.id);
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    errors.push(`${label}: name is required`);
  }
  for (const key of ['hp', 'attack', 'defense', 'damage', 'armor', 'speed', 'weight'] as const) {
    if (!isNumber(raw[key])) errors.push(`${label}: ${key} must be a number`);
  }
  if (!isNumber(raw.infectious) || raw.infectious < 0 || raw.infectious > 1) {
    errors.push(`${label}: infectious must be 0..1`);
  }
  if (!isNumber(raw.dropChance) || raw.dropChance < 0 || raw.dropChance > 1) {
    errors.push(`${label}: dropChance must be 0..1`);
  }
  if (!isIntRange(raw.hpJitter)) errors.push(`${label}: hpJitter must be [lo, hi]`);
  if (isNumber(raw.hp) && raw.hp < 1) errors.push(`${label}: hp must be ≥ 1`);
  if (isNumber(raw.speed) && raw.speed < 1) errors.push(`${label}: speed must be ≥ 1`);
  if (isNumber(raw.weight) && raw.weight < 1) errors.push(`${label}: weight must be ≥ 1`);
  if (!Array.isArray(raw.habitats) || raw.habitats.length < 1) {
    errors.push(`${label}: habitats must be a non-empty array`);
  } else {
    for (const h of raw.habitats) {
      if (h !== 'water' && h !== 'forest' && h !== 'urban') {
        errors.push(`${label}: unknown habitat "${String(h)}"`);
      }
    }
  }
  if (typeof raw.icon !== 'string' || !raw.icon.startsWith('combat.enemy')) {
    errors.push(`${label}: icon must be a combat.enemy* key`);
  }
  validateDrops(label, raw.drops, errors, knownItemIds);
}

function validateSpawn(raw: unknown, errors: string[], eliteKeys: Set<string>, humanKeys: Set<string>): void {
  if (!isRecord(raw)) {
    errors.push('spawn: must be an object');
    return;
  }
  if (!isIntRange(raw.zombieTierJitter)) {
    errors.push('spawn.zombieTierJitter must be [lo, hi]');
  }
  if (!isNumber(raw.humanDropChance) || raw.humanDropChance < 0 || raw.humanDropChance > 1) {
    errors.push('spawn.humanDropChance must be 0..1');
  }
  if (typeof raw.wildsGangFaction !== 'string' || !humanKeys.has(raw.wildsGangFaction)) {
    errors.push('spawn.wildsGangFaction must be a known faction key');
  }
  if (!isRecord(raw.eliteBindings)) {
    errors.push('spawn.eliteBindings must be an object');
    return;
  }
  for (const ctx of ['hdb', 'tunnel'] as const) {
    const id = raw.eliteBindings[ctx];
    if (typeof id !== 'string' || !eliteKeys.has(id)) {
      errors.push(`spawn.eliteBindings.${ctx} must be a known elite id`);
    }
  }
}

/**
 * Validate an enemies catalog. When `knownItemIds` is provided, drop pools are
 * cross-checked against the item catalog.
 */
export function validateEnemiesCatalog(
  raw: unknown,
  knownItemIds?: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return ['catalog must be an object'];
  }

  if (!Array.isArray(raw.zombies) || raw.zombies.length < 1) {
    errors.push('zombies must be a non-empty array');
  } else {
    const seen = new Set<string>();
    raw.zombies.forEach((z, i) => validateZombie(z, i, errors, seen));
  }

  if (!isRecord(raw.elites)) {
    errors.push('elites must be an object');
  } else {
    for (const id of ELITE_IDS) {
      if (!(id in raw.elites)) errors.push(`elites: missing required "${id}"`);
    }
    for (const key of Object.keys(raw.elites)) {
      if (!(ELITE_IDS as readonly string[]).includes(key)) {
        errors.push(`elites: unknown key "${key}"`);
      } else {
        validateElite(key, raw.elites[key], errors);
      }
    }
  }

  validateHumanDefaults(raw.humanDefaults, errors);

  if (!isRecord(raw.humans)) {
    errors.push('humans must be an object');
  } else {
    for (const id of FACTION_KEYS) {
      if (!(id in raw.humans)) errors.push(`humans: missing required "${id}"`);
    }
    for (const key of Object.keys(raw.humans)) {
      if (!(FACTION_KEYS as readonly string[]).includes(key)) {
        errors.push(`humans: unknown key "${key}"`);
      } else {
        validateHuman(key, raw.humans[key], errors, knownItemIds);
      }
    }
  }

  if (!isRecord(raw.loners)) {
    errors.push('loners must be an object');
  } else {
    for (const id of LONER_KINDS) {
      if (!(id in raw.loners)) errors.push(`loners: missing required "${id}"`);
    }
    for (const key of Object.keys(raw.loners)) {
      if (!(LONER_KINDS as readonly string[]).includes(key)) {
        errors.push(`loners: unknown key "${key}"`);
      } else {
        validateLoner(key, raw.loners[key], errors, knownItemIds);
      }
    }
  }

  if (!Array.isArray(raw.animals) || raw.animals.length < 1) {
    errors.push('animals must be a non-empty array');
  } else {
    const seen = new Set<string>();
    raw.animals.forEach((a, i) => validateAnimal(a, i, errors, seen, knownItemIds));
  }

  const eliteKeys = new Set(
    isRecord(raw.elites) ? Object.keys(raw.elites) : [...ELITE_IDS],
  );
  const humanKeys = new Set(
    isRecord(raw.humans) ? Object.keys(raw.humans) : [...FACTION_KEYS],
  );
  validateSpawn(raw.spawn, errors, eliteKeys, humanKeys);

  return errors;
}
