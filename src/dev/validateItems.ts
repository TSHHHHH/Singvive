/** Shared item-catalog validation for the DEV loot API and browser UI. */

const EFFECT_KINDS = new Set([
  'food',
  'water',
  'heal',
  'cure',
  'energy',
  'weapon',
  'ammo',
  'fuel',
  'misc',
]);

const EQUIP_SLOTS = new Set([
  'head',
  'body',
  'hands',
  'legs',
  'feet',
  'bag',
  'mainHand',
  'offHand',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateEffect(effect: unknown, id: string, errors: string[]): void {
  if (!isRecord(effect) || typeof effect.kind !== 'string') {
    errors.push(`${id}: effect must be an object with a kind`);
    return;
  }
  if (!EFFECT_KINDS.has(effect.kind)) {
    errors.push(`${id}: unknown effect.kind "${effect.kind}"`);
    return;
  }
  switch (effect.kind) {
    case 'food':
      if (!isNumber(effect.hunger)) errors.push(`${id}: food.hunger must be a number`);
      if (effect.thirst !== undefined && !isNumber(effect.thirst)) {
        errors.push(`${id}: food.thirst must be a number`);
      }
      if (effect.energy !== undefined && !isNumber(effect.energy)) {
        errors.push(`${id}: food.energy must be a number`);
      }
      break;
    case 'water':
      if (!isNumber(effect.thirst)) errors.push(`${id}: water.thirst must be a number`);
      if (effect.hunger !== undefined && !isNumber(effect.hunger)) {
        errors.push(`${id}: water.hunger must be a number`);
      }
      if (effect.energy !== undefined && !isNumber(effect.energy)) {
        errors.push(`${id}: water.energy must be a number`);
      }
      break;
    case 'heal':
      if (!isNumber(effect.health)) errors.push(`${id}: heal.health must be a number`);
      if (effect.partHeal !== undefined && !isNumber(effect.partHeal)) {
        errors.push(`${id}: heal.partHeal must be a number`);
      }
      if (
        effect.stopsBleeding !== undefined &&
        effect.stopsBleeding !== 'one' &&
        effect.stopsBleeding !== 'all'
      ) {
        errors.push(`${id}: heal.stopsBleeding must be "one" or "all"`);
      }
      if (effect.infectionRisk !== undefined && !isNumber(effect.infectionRisk)) {
        errors.push(`${id}: heal.infectionRisk must be a number`);
      }
      break;
    case 'cure':
      if (!isNumber(effect.infection)) errors.push(`${id}: cure.infection must be a number`);
      break;
    case 'energy':
      if (!isNumber(effect.energy)) errors.push(`${id}: energy.energy must be a number`);
      if (effect.hunger !== undefined && !isNumber(effect.hunger)) {
        errors.push(`${id}: energy.hunger must be a number`);
      }
      if (effect.thirst !== undefined && !isNumber(effect.thirst)) {
        errors.push(`${id}: energy.thirst must be a number`);
      }
      break;
    case 'weapon':
      if (!isNumber(effect.damage)) errors.push(`${id}: weapon.damage must be a number`);
      if (!isNumber(effect.accuracy)) errors.push(`${id}: weapon.accuracy must be a number`);
      if (typeof effect.ranged !== 'boolean') errors.push(`${id}: weapon.ranged must be a boolean`);
      if (effect.roundsPerShot !== undefined && !isNumber(effect.roundsPerShot)) {
        errors.push(`${id}: weapon.roundsPerShot must be a number`);
      }
      break;
    case 'ammo':
      if (!isNumber(effect.rounds)) errors.push(`${id}: ammo.rounds must be a number`);
      break;
    case 'fuel':
    case 'misc':
      break;
  }
}

function validateItem(id: string, raw: unknown, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${id}: item must be an object`);
    return;
  }
  if (raw.id !== id) {
    errors.push(`${id}: key must match id field (got "${String(raw.id)}")`);
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    errors.push(`${id}: name is required`);
  }
  for (const key of ['w', 'h', 'weight', 'value', 'maxStack'] as const) {
    if (!isNumber(raw[key])) errors.push(`${id}: ${key} must be a number`);
  }
  if (typeof raw.stackable !== 'boolean') errors.push(`${id}: stackable must be a boolean`);
  if (typeof raw.color !== 'string' || !raw.color.trim()) {
    errors.push(`${id}: color is required`);
  }
  validateEffect(raw.effect, id, errors);

  if (raw.slot !== undefined) {
    if (typeof raw.slot !== 'string' || !EQUIP_SLOTS.has(raw.slot)) {
      errors.push(`${id}: invalid slot "${String(raw.slot)}"`);
    }
  }
  if (raw.icon !== undefined && typeof raw.icon !== 'string') {
    errors.push(`${id}: icon must be a string`);
  }
  if (raw.exotic !== undefined && typeof raw.exotic !== 'boolean') {
    errors.push(`${id}: exotic must be a boolean`);
  }
  if (raw.perishable !== undefined && typeof raw.perishable !== 'boolean') {
    errors.push(`${id}: perishable must be a boolean`);
  }
  if (raw.maxCondition !== undefined && !isNumber(raw.maxCondition)) {
    errors.push(`${id}: maxCondition must be a number`);
  }
  if (raw.wearRate !== undefined && !isNumber(raw.wearRate)) {
    errors.push(`${id}: wearRate must be a number`);
  }
  if (raw.scarcity !== undefined) {
    if (!isNumber(raw.scarcity) || raw.scarcity <= 0 || raw.scarcity > 1) {
      errors.push(`${id}: scarcity must be a number in (0, 1]`);
    }
  }
  if (raw.startingItem !== undefined && typeof raw.startingItem !== 'boolean') {
    errors.push(`${id}: startingItem must be a boolean`);
  }
  if (raw.startingCount !== undefined) {
    if (!isNumber(raw.startingCount) || raw.startingCount < 1 || !Number.isInteger(raw.startingCount)) {
      errors.push(`${id}: startingCount must be an integer >= 1`);
    }
  }
  if (raw.modifiers !== undefined && !isRecord(raw.modifiers)) {
    errors.push(`${id}: modifiers must be an object`);
  }

  // Match loot.ts DEV invariants
  if (raw.maxCondition !== undefined && raw.stackable === true) {
    errors.push(`${id}: stackable items cannot have maxCondition`);
  }
  if (raw.perishable === true && raw.maxCondition === undefined) {
    errors.push(`${id}: perishable items require maxCondition`);
  }
  if (isNumber(raw.w) && (raw.w < 1 || !Number.isInteger(raw.w))) {
    errors.push(`${id}: w must be an integer >= 1`);
  }
  if (isNumber(raw.h) && (raw.h < 1 || !Number.isInteger(raw.h))) {
    errors.push(`${id}: h must be an integer >= 1`);
  }
  if (isNumber(raw.maxStack) && (raw.maxStack < 1 || !Number.isInteger(raw.maxStack))) {
    errors.push(`${id}: maxStack must be an integer >= 1`);
  }
}

/** Returns a list of human-readable errors; empty means valid. */
export function validateItemsCatalog(catalog: unknown): string[] {
  if (!isRecord(catalog)) {
    return ['Catalog must be a JSON object keyed by item id'];
  }
  const errors: string[] = [];
  const ids = Object.keys(catalog);
  if (ids.length === 0) {
    errors.push('Catalog must contain at least one item');
  }
  for (const id of ids) {
    if (!/^[a-z][a-z0-9_]*$/.test(id)) {
      errors.push(`${id}: id must match /^[a-z][a-z0-9_]*$/`);
    }
    validateItem(id, catalog[id], errors);
  }
  return errors;
}

export { EFFECT_KINDS, EQUIP_SLOTS };
