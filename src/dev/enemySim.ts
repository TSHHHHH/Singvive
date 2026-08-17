import type { Enemy } from '../game/types';
import type { EnemiesCatalog, EliteId, FactionKey, LonerKind, AnimalHabitat } from '../game/enemies';
import {
  rollElite,
  rollHuman,
  rollLoner,
  rollZombie,
  rollAnimal,
} from '../game/enemies';
import { Rng } from '../game/rng';

export type PreviewKind =
  | { t: 'zombie' }
  | { t: 'elite'; id: EliteId }
  | { t: 'human'; faction: FactionKey }
  | { t: 'loner'; kind: LonerKind }
  | { t: 'animal'; habitat: AnimalHabitat };

/** Seeded danger 1..5 preview for the encounter editor Spawn tab. */
export function previewEncounter(
  catalog: EnemiesCatalog,
  kind: PreviewKind,
  danger: number,
  seed: string,
): Enemy {
  const rng = new Rng(seed);
  switch (kind.t) {
    case 'zombie':
      return rollZombie(catalog, rng, danger);
    case 'elite':
      return rollElite(catalog, rng, kind.id, danger, kind.id);
    case 'human':
      return rollHuman(catalog, rng, kind.faction, danger);
    case 'loner':
      return rollLoner(catalog, rng, kind.kind, danger);
    case 'animal':
      return rollAnimal(catalog, rng, kind.habitat, danger);
  }
}
