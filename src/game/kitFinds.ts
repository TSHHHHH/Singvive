// Kit shapes and the shared find pools. Kept apart from startingKit.ts so
// occupations.ts can use them without an import cycle.

export interface KitEntry {
  id: string;
  count?: number;
}

export interface TraitKit {
  items?: KitEntry[];
  /** Seeded random finds: `pick` distinct entries from `from`. */
  pool?: { pick: number; from: KitEntry[] };
  /** Role items this trait starts without. */
  drop?: string[];
}

/** A role's kit. `standard` = the `startingItem` items in items.json. */
export interface RoleKit extends Omit<TraitKit, 'drop'> {
  standard?: boolean;
}

/** Things a scavenger tends to have in a pocket. */
export const SCAVENGER_FINDS: KitEntry[] = [
  { id: 'powerbank' },
  { id: 'batteries', count: 2 },
  { id: 'spare_parts' },
  { id: 'duct_tape', count: 2 },
  { id: 'whetstone' },
  { id: 'lighter' },
];

/** Whatever was free, on offer, or not nailed down. */
export const OPPORTUNIST_FINDS: KitEntry[] = [
  { id: 'bak_kwa' },
  { id: 'powerbank' },
  { id: 'canned_luncheon_meat', count: 2 },
  { id: 'red_packet', count: 3 },
  { id: 'painkillers', count: 2 },
];
