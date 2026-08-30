import type {
  CombatContext,
  Equipment,
  FirearmCaliber,
  ItemDef,
  ItemInstance,
  ItemEffect,
  TerrainId,
  WeaponEffect,
} from './types';
import { itemDef } from './loot';
import { BACKPACK, conditionOf, effectiveDamage, isBroken } from './inventory';

export const GUN_CLUB_DAMAGE_MULT_PISTOL = 0.35;
export const GUN_CLUB_DAMAGE_MULT_SHOTGUN = 0.4;
export const GUN_CLUB_ACCURACY_PISTOL = -3;
export const GUN_CLUB_ACCURACY_SHOTGUN = -4;
export const GUN_CLUB_WEAR_MULT = 3;
export const GUN_CLUB_SPEED_PISTOL = 0.55;
export const GUN_CLUB_SPEED_SHOTGUN = 0.4;

export const DEFAULT_RELOAD_SPEED_PISTOL = 0.75;
export const DEFAULT_RELOAD_SPEED_SHOTGUN = 1.35;

export const DEFAULT_MAG_SIZE_PISTOL = 8;
export const DEFAULT_MAG_SIZE_SHOTGUN = 4;

export const GUN_DROP_MAG_CHANCE = 0.8;

/** Legacy item ids → typed ammo (save migration + loot aliases). */
export const AMMO_ID_ALIASES: Record<string, string> = {
  ammo_box: 'ammo_9mm_box',
  ammo_shell: 'ammo_12g_box',
};

export function normalizeAmmoDefId(defId: string): string {
  return AMMO_ID_ALIASES[defId] ?? defId;
}

export function isRangedWeaponEffect(e: ItemEffect): e is WeaponEffect {
  return e.kind === 'weapon' && e.ranged === true;
}

export function firearmProfile(def: ItemDef): WeaponEffect | null {
  if (def.effect.kind !== 'weapon' || !def.effect.ranged) return null;
  return def.effect;
}

export function loadedRoundsOf(inst: ItemInstance | null | undefined): number {
  return inst?.loadedRounds ?? 0;
}

export function magazineSizeFor(def: ItemDef): number {
  const w = firearmProfile(def);
  if (!w) return 0;
  return w.magazineSize ?? (w.caliber === '12g' ? DEFAULT_MAG_SIZE_SHOTGUN : DEFAULT_MAG_SIZE_PISTOL);
}

export function reloadSpeedFor(def: ItemDef): number {
  const w = firearmProfile(def);
  if (!w) return 1;
  return w.reloadSpeedFactor ?? (w.caliber === '12g' ? DEFAULT_RELOAD_SPEED_SHOTGUN : DEFAULT_RELOAD_SPEED_PISTOL);
}

export function usesMagazine(def: ItemDef): boolean {
  const w = firearmProfile(def);
  if (!w) return false;
  return w.usesMagazine ?? w.caliber !== '12g';
}

export function gunClubSpeed(defId: string): number {
  return defId === 'shotgun' ? GUN_CLUB_SPEED_SHOTGUN : GUN_CLUB_SPEED_PISTOL;
}

export function gunClubAccuracy(defId: string): number {
  return defId === 'shotgun' ? GUN_CLUB_ACCURACY_SHOTGUN : GUN_CLUB_ACCURACY_PISTOL;
}

export function gunClubDamageMult(defId: string): number {
  return defId === 'shotgun' ? GUN_CLUB_DAMAGE_MULT_SHOTGUN : GUN_CLUB_DAMAGE_MULT_PISTOL;
}

export function isGunClubMainHand(equipment: Equipment): boolean {
  const main = equipment.mainHand;
  if (!main || isBroken(main)) return false;
  return isRangedWeaponEffect(itemDef(main.defId).effect);
}

export function holsteredFirearm(equipment: Equipment): ItemInstance | null {
  const inst = equipment.firearm;
  if (!inst || isBroken(inst)) return null;
  const def = itemDef(inst.defId);
  if (!isRangedWeaponEffect(def.effect)) return null;
  return inst;
}

export function canFireHolstered(equipment: Equipment): boolean {
  const gun = holsteredFirearm(equipment);
  if (!gun || conditionOf(gun) <= 0) return false;
  return loadedRoundsOf(gun) > 0;
}

function backpackItems(items: ItemInstance[]): ItemInstance[] {
  return items.filter((i) => i.container === BACKPACK);
}

/** Best filled magazine in pack for a pistol reload. */
export function bestMagazineForReload(
  items: ItemInstance[],
  caliber: FirearmCaliber,
): ItemInstance | null {
  let best: ItemInstance | null = null;
  let bestFill = 0;
  for (const inst of backpackItems(items)) {
    const def = itemDef(inst.defId);
    if (def.effect.kind !== 'magazine' || def.effect.caliber !== caliber) continue;
    const fill = loadedRoundsOf(inst);
    if (fill > bestFill) {
      best = inst;
      bestFill = fill;
    }
  }
  return best;
}

/** First 12g ammo stack in pack with rounds remaining. */
export function firstShotgunAmmoInPack(items: ItemInstance[]): ItemInstance | null {
  for (const inst of backpackItems(items)) {
    const defId = normalizeAmmoDefId(inst.defId);
    const def = itemDef(defId);
    if (def.effect.kind !== 'ammo' || def.effect.caliber !== '12g') continue;
    if (inst.stack > 0) return inst;
  }
  return null;
}

export function canCombatReload(equipment: Equipment, items: ItemInstance[]): boolean {
  const gun = holsteredFirearm(equipment);
  if (!gun || conditionOf(gun) <= 0) return false;
  const def = itemDef(gun.defId);
  const w = firearmProfile(def);
  if (!w?.caliber) return false;
  if (loadedRoundsOf(gun) > 0) return false;
  if (usesMagazine(def)) {
    return bestMagazineForReload(items, w.caliber) !== null;
  }
  return firstShotgunAmmoInPack(items) !== null;
}

export interface CombatReloadResult {
  equipment: Equipment;
  items: ItemInstance[];
  roundsLoaded: number;
  log: string[];
}

/** Transfer ammo from backpack into holstered gun after reload gauge completes. */
export function resolveCombatReload(
  equipment: Equipment,
  items: ItemInstance[],
): CombatReloadResult {
  const gunInst = holsteredFirearm(equipment);
  if (!gunInst) {
    return { equipment, items, roundsLoaded: 0, log: ['Nothing holstered to reload.'] };
  }
  const gunDef = itemDef(gunInst.defId);
  const cap = magazineSizeFor(gunDef);
  const current = loadedRoundsOf(gunInst);
  const free = Math.max(0, cap - current);
  if (free <= 0) {
    return { equipment, items, roundsLoaded: 0, log: ['Already full.'] };
  }

  const w = firearmProfile(gunDef);
  if (!w?.caliber) {
    return { equipment, items, roundsLoaded: 0, log: ['Not a firearm.'] };
  }

  if (usesMagazine(gunDef)) {
    const mag = bestMagazineForReload(items, w.caliber);
    if (!mag) {
      return { equipment, items, roundsLoaded: 0, log: ['No loaded magazine in your pack.'] };
    }
    const transfer = Math.min(free, loadedRoundsOf(mag));
    if (transfer <= 0) {
      return { equipment, items, roundsLoaded: 0, log: ['No loaded magazine in your pack.'] };
    }
    const nextGun: ItemInstance = { ...gunInst, loadedRounds: current + transfer };
    const nextItems = items.map((i) =>
      i.uid === mag.uid ? { ...i, loadedRounds: loadedRoundsOf(mag) - transfer } : i,
    );
    return {
      equipment: { ...equipment, firearm: nextGun },
      items: nextItems,
      roundsLoaded: transfer,
      log: [`Reloaded ${transfer} rounds from ${itemDef(mag.defId).name}.`],
    };
  }

  const ammoInst = firstShotgunAmmoInPack(items);
  if (!ammoInst) {
    return { equipment, items, roundsLoaded: 0, log: ['No shells in your pack.'] };
  }
  const ammoDef = itemDef(normalizeAmmoDefId(ammoInst.defId));
  const perBox = ammoDef.effect.kind === 'ammo' ? ammoDef.effect.rounds : 4;
  const transfer = Math.min(free, perBox, ammoInst.stack);
  if (transfer <= 0) {
    return { equipment, items, roundsLoaded: 0, log: ['No shells in your pack.'] };
  }
  const nextGun: ItemInstance = { ...gunInst, loadedRounds: current + transfer };
  let nextItems = items;
  if (ammoInst.stack <= transfer) {
    nextItems = items.filter((i) => i.uid !== ammoInst.uid);
  } else {
    nextItems = items.map((i) =>
      i.uid === ammoInst.uid ? { ...i, stack: i.stack - transfer } : i,
    );
  }
  return {
    equipment: { ...equipment, firearm: nextGun },
    items: nextItems,
    roundsLoaded: transfer,
    log: [`Reloaded ${transfer} shell${transfer === 1 ? '' : 's'}.`],
  };
}

export interface RefillMagazineResult {
  items: ItemInstance[];
  roundsAdded: number;
  log: string;
  ok: boolean;
}

export function refillMagazineFromAmmo(
  items: ItemInstance[],
  magUid: string,
  ammoUid: string,
): RefillMagazineResult {
  const mag = items.find((i) => i.uid === magUid);
  const ammo = items.find((i) => i.uid === ammoUid);
  if (!mag || !ammo) return { items, roundsAdded: 0, log: 'Item not found.', ok: false };
  const magDef = itemDef(mag.defId);
  const ammoDefId = normalizeAmmoDefId(ammo.defId);
  const ammoDef = itemDef(ammoDefId);
  if (magDef.effect.kind !== 'magazine') {
    return { items, roundsAdded: 0, log: 'That is not a magazine.', ok: false };
  }
  if (ammoDef.effect.kind !== 'ammo') {
    return { items, roundsAdded: 0, log: 'That is not ammunition.', ok: false };
  }
  if (magDef.effect.caliber !== ammoDef.effect.caliber) {
    return { items, roundsAdded: 0, log: 'Wrong ammunition for this magazine.', ok: false };
  }
  const cap = magDef.effect.capacity;
  const have = loadedRoundsOf(mag);
  const space = cap - have;
  if (space <= 0) {
    return { items, roundsAdded: 0, log: 'Magazine is full.', ok: false };
  }
  const add = Math.min(space, ammoDef.effect.rounds);
  const nextMag: ItemInstance = { ...mag, loadedRounds: have + add };
  const nextItemsBase = items.map((i) => (i.uid === magUid ? nextMag : i));
  const withoutAmmo = nextItemsBase.filter((i) => i.uid !== ammoUid);
  return {
    items: withoutAmmo,
    roundsAdded: add,
    log: `Loaded ${add} rounds into ${magDef.name}.`,
    ok: true,
  };
}

export interface LoadGunFromMagazineResult {
  equipment: Equipment;
  items: ItemInstance[];
  log: string;
  ok: boolean;
}

export function loadGunFromMagazine(
  equipment: Equipment,
  items: ItemInstance[],
  magUid: string,
): LoadGunFromMagazineResult {
  const gun = holsteredFirearm(equipment);
  if (!gun) {
    return { equipment, items, log: 'Holster a firearm first.', ok: false };
  }
  const gunDef = itemDef(gun.defId);
  if (!usesMagazine(gunDef)) {
    return { equipment, items, log: 'This gun loads shells directly — use Refill on the gun.', ok: false };
  }
  const mag = items.find((i) => i.uid === magUid);
  if (!mag) return { equipment, items, log: 'Magazine not found.', ok: false };
  const magDef = itemDef(mag.defId);
  if (magDef.effect.kind !== 'magazine') {
    return { equipment, items, log: 'That is not a magazine.', ok: false };
  }
  const w = firearmProfile(gunDef);
  if (w?.caliber !== magDef.effect.caliber) {
    return { equipment, items, log: 'Wrong magazine for this gun.', ok: false };
  }
  const cap = magazineSizeFor(gunDef);
  const inGun = loadedRoundsOf(gun);
  const free = cap - inGun;
  if (free <= 0) {
    return { equipment, items, log: 'Gun is full.', ok: false };
  }
  const inMag = loadedRoundsOf(mag);
  if (inMag <= 0) {
    return { equipment, items, log: 'Magazine is empty — refill it first.', ok: false };
  }
  const transfer = Math.min(free, inMag);
  const nextGun: ItemInstance = { ...gun, loadedRounds: inGun + transfer };
  const nextMag: ItemInstance = { ...mag, loadedRounds: inMag - transfer };
  const nextItems = items.map((i) => (i.uid === magUid ? nextMag : i));
  return {
    equipment: { ...equipment, firearm: nextGun },
    items: nextItems,
    log: `${gunDef.name}: ${inGun + transfer}/${cap} rounds.`,
    ok: true,
  };
}

export interface RefillFirearmResult {
  equipment: Equipment;
  items: ItemInstance[];
  log: string;
  ok: boolean;
}

export function refillHolsteredFirearm(
  equipment: Equipment,
  items: ItemInstance[],
  ammoUid: string,
): RefillFirearmResult {
  const gun = holsteredFirearm(equipment);
  if (!gun) {
    return { equipment, items, log: 'Holster a firearm first.', ok: false };
  }
  const gunDef = itemDef(gun.defId);
  if (usesMagazine(gunDef)) {
    return { equipment, items, log: 'Load a magazine into this gun instead.', ok: false };
  }
  const ammo = items.find((i) => i.uid === ammoUid);
  if (!ammo) return { equipment, items, log: 'Ammunition not found.', ok: false };
  const ammoDef = itemDef(normalizeAmmoDefId(ammo.defId));
  const w = firearmProfile(gunDef);
  if (ammoDef.effect.kind !== 'ammo' || w?.caliber !== ammoDef.effect.caliber) {
    return { equipment, items, log: 'Wrong ammunition.', ok: false };
  }
  const cap = magazineSizeFor(gunDef);
  const inGun = loadedRoundsOf(gun);
  const free = cap - inGun;
  if (free <= 0) {
    return { equipment, items, log: 'Gun is full.', ok: false };
  }
  const add = Math.min(free, ammoDef.effect.rounds);
  const nextGun: ItemInstance = { ...gun, loadedRounds: inGun + add };
  const nextItems = items.filter((i) => i.uid !== ammoUid);
  return {
    equipment: { ...equipment, firearm: nextGun },
    items: nextItems,
    log: `${gunDef.name}: ${inGun + add}/${cap} rounds.`,
    ok: true,
  };
}

/** Gun + mag pairing after a firearm loot roll. */
export function companionLootForGun(rng: { chance: (p: number) => boolean }, defId: string): string | null {
  if (defId === 'pistol' && rng.chance(GUN_DROP_MAG_CHANCE)) return 'mag_pistol';
  if (defId === 'shotgun' && rng.chance(GUN_DROP_MAG_CHANCE)) return 'ammo_12g_box';
  return null;
}

/** Initial loadedRounds when spawning a magazine or gun from loot. */
export function initialMagazineRounds(rng: { int: (a: number, b: number) => number }, capacity: number): number {
  if (capacity <= 0) return 0;
  const min = Math.max(1, Math.floor(capacity * 0.4));
  return rng.int(min, capacity);
}

/** Stamp partial loads on firearms / magazines that arrive without loadedRounds. */
export function stampFirearmLoot(
  items: ItemInstance[],
  rng: { int: (a: number, b: number) => number },
): ItemInstance[] {
  return items.map((inst) => {
    if (inst.loadedRounds !== undefined) return inst;
    const def = itemDef(inst.defId);
    if (def.effect.kind === 'magazine') {
      return { ...inst, loadedRounds: initialMagazineRounds(rng, def.effect.capacity) };
    }
    if (def.effect.kind === 'weapon' && def.effect.ranged) {
      return { ...inst, loadedRounds: initialMagazineRounds(rng, magazineSizeFor(def)) };
    }
    return inst;
  });
}

export function gunshotDangerApplies(context: CombatContext, terrainId: TerrainId): boolean {
  if (context.tunnel) return false;
  if (terrainId === 'tunnel_bore' || terrainId === 'mrt_concourse') return false;
  return true;
}

export function gunshotNoiseIntensity(defId: string): number {
  return defId === 'shotgun' ? 1.3 : 1.0;
}

export function gunFireDamage(gun: ItemInstance): number {
  return effectiveDamage(gun);
}

export function gunshotNoiseRadius(intensity: number): number {
  return 250 * intensity;
}

/** Same gun instance cannot sit in firearm and mainHand. */
export function clearFirearmSlotConflict(
  equipment: Equipment,
  slot: 'firearm' | 'mainHand',
  incomingUid: string,
): Equipment {
  const other = slot === 'firearm' ? equipment.mainHand : equipment.firearm;
  if (other?.uid === incomingUid) {
    return { ...equipment, [slot === 'firearm' ? 'mainHand' : 'firearm']: null };
  }
  return equipment;
}
