import type { Enemy } from './types';
import type { Rng } from './rng';
import {
  ENEMIES,
  rollAnimal,
  rollAnimalDrop,
  rollHuman,
  rollHumanDrop,
  rollZombie,
  type AnimalHabitat,
} from './enemies';
import { inVegetation, inInlandWater, isWalkable, isZonesLoaded } from './playable';
import type { HazardKind } from './wilds';

export type { AnimalHabitat };

export const URBAN_AMBUSH_ANIMAL_CHANCE = 0.3;
export const FLOODWATER_ANIMAL_CHANCE = 0.55;
export const FOREST_TREK_ANIMAL_CHANCE = 0.6;

/** Habitat of a walkable point. Water interiors are not walkable; banks count as urban unless forested. */
export function habitatAt(lat: number, lng: number): AnimalHabitat | null {
  if (!isZonesLoaded()) return null;
  if (inVegetation(lat, lng)) return 'forest';
  if (inInlandWater(lat, lng)) return 'water';
  if (isWalkable(lat, lng)) return 'urban';
  return null;
}

export interface WildsEncounter {
  enemy: Enemy;
  drops?: string[];
}

/**
 * Pick the foe for a trek / road ambush from the nastiest hazard on the route,
 * plus forest/urban ground when no wildlife ring was hit.
 *
 * Dedicated rings (gang / night swarm / wildlife_*) always win. Otherwise a
 * generic fight (horde pocket, empty-street ambush) remaps by habitat so
 * downtown is not wall-to-wall Shamblers and a canal flood can surface a biawak.
 */
export function rollWildsEncounter(
  rng: Rng,
  danger: number,
  opts: {
    hazard: HazardKind | null;
    forest: boolean;
    habitat: AnimalHabitat | null;
    floodwater?: boolean;
  },
): WildsEncounter {
  const gangFaction = ENEMIES.spawn.wildsGangFaction;

  if (opts.hazard === 'gang_patrol') {
    const enemy = rollHuman(ENEMIES, rng, gangFaction, danger);
    const drop = rollHumanDrop(ENEMIES, rng, gangFaction);
    return { enemy, drops: drop ? [drop] : undefined };
  }

  if (opts.hazard === 'night_swarm') {
    return { enemy: rollZombie(ENEMIES, rng, Math.max(danger, 4)) };
  }

  let table: AnimalHabitat | null = null;
  if (opts.hazard === 'wildlife_water') table = 'water';
  else if (opts.hazard === 'wildlife_forest') table = 'forest';
  else if (opts.hazard === 'wildlife_urban') table = 'urban';
  else if (
    (opts.floodwater || opts.hazard === 'floodwater') &&
    rng.chance(FLOODWATER_ANIMAL_CHANCE)
  ) {
    table = 'water';
  } else if (opts.forest && rng.chance(FOREST_TREK_ANIMAL_CHANCE)) {
    table = 'forest';
  } else if (opts.habitat === 'urban' && rng.chance(URBAN_AMBUSH_ANIMAL_CHANCE)) {
    table = 'urban';
  }

  if (table) {
    const enemy = rollAnimal(ENEMIES, rng, table, danger);
    const drop = rollAnimalDrop(ENEMIES, rng, enemy.name);
    return { enemy, drops: drop ? [drop] : undefined };
  }

  return { enemy: rollZombie(ENEMIES, rng, danger) };
}
