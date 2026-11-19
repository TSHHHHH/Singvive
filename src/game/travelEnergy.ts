import type { Attributes, BodyParts, Character, Equipment, ItemInstance, Meters, SkillsState } from './types';
import { sumTraitMod } from './character';
import { equipTravelSpeedFactor, loadEffectsFor } from './inventory';
import { skillMods } from './skills';
import { activeEnergyDrainMultiplier, legTravelFactor, torsoCarryMult, torsoEnergyDrainMult } from './survival';
import { walkSpeed } from './travel';

// Average healthy survivor: 100 energy covers 1 km, close to the old rested ring.
const BASE_ENERGY_PER_METRE = 0.1;
const ENERGY_EPSILON = 1e-9;

/** Distance efficiency is independent of current energy, terrain and weather. */
export function travelEnergyPerMetre(attrs: Attributes, legFactor = 1, energyMult = 1): number {
  const mobility = walkSpeed(attrs, 50, legFactor) / 72;
  return BASE_ENERGY_PER_METRE * Math.max(0.1, energyMult) / Math.max(0.1, mobility);
}

/** Exact straight-line reach. Do not round up: the perimeter must be affordable. */
export function travelableRange(attrs: Attributes, energy: number, legFactor = 1, energyMult = 1): number {
  return Math.max(0, energy) / travelEnergyPerMetre(attrs, legFactor, energyMult);
}

/** Shared by cards and actions. Keep fractions so splitting a walk cannot make it free. */
export function quoteTravelEnergy(distanceM: number, energy: number, energyPerMetre: number, canTravel = true) {
  const energyCost = Math.max(0, distanceM) * energyPerMetre;
  const delta = energy - energyCost;
  const affordable = canTravel && delta >= -ENERGY_EPSILON && (distanceM <= 0 || energy > 0);
  const remainingEnergy = Math.abs(delta) <= ENERGY_EPSILON ? 0 : Math.max(0, delta);
  return { energyCost, remainingEnergy, affordable, arrivesExhausted: affordable && remainingEnergy < 0.05 };
}

export type TravelEnergyQuote = ReturnType<typeof quoteTravelEnergy>;

/** One profile for the map, quotes and store, including fitness and carrying bonuses. */
export function surfaceTravelProfile(s: {
  character: Character;
  bodyParts: BodyParts;
  equipment: Equipment;
  items: ItemInstance[];
  skills: SkillsState;
  meters: Meters;
}) {
  const mods = skillMods(s.skills);
  const traits = s.character.traitIds;
  const load = loadEffectsFor(s.items, s.character.attributes, s.equipment,
    sumTraitMod(traits, 'carryCapacityMod') + mods.carryCapacityMod, torsoCarryMult(s.bodyParts));
  const legFactor = legTravelFactor(s.bodyParts) * equipTravelSpeedFactor(s.equipment) *
    (1 + sumTraitMod(traits, 'travelSpeedMod') + mods.travelSpeedMod);
  const energyMult = load.energyMult * torsoEnergyDrainMult(s.bodyParts) *
    activeEnergyDrainMultiplier(s.meters.thirst) *
    Math.max(0.1, 1 + sumTraitMod(traits, 'energyDrainMod') + mods.energyDrainMod) *
    Math.max(0.1, 1 + sumTraitMod(traits, 'outdoorEnergyDrainMod'));
  const energyPerMetre = travelEnergyPerMetre(s.character.attributes, legFactor, energyMult);
  const range = load.canTravel ? travelableRange(s.character.attributes, s.meters.energy, legFactor, energyMult) : 0;
  return { load, legFactor, energyPerMetre, range };
}
