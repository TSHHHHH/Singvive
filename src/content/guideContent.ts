/** Player-facing tutorial copy shared by HowToPlayModal and contextual GuideModal. */

export type GuideTopic = 'survive' | 'loot' | 'evac' | 'score' | 'hdb' | 'tunnels';

export interface GuideSection {
  id: GuideTopic;
  title: string;
  bullets: string[];
}

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: 'survive',
    title: 'Survive',
    bullets: [
      'Hunger, thirst, energy, and infection tick with every hour. Keep them up — empty hunger or thirst below 20 starts eating limb HP.',
      'Health is the sum of your six limbs. Bleeding blocks regen; infection at 100 ends the run.',
      'Night (after dusk) is more dangerous. Get inside before dark — the streets fill with a night swarm. Rest shows recovery and ambush chance; sleep still drains hunger and thirst (reduced).',
      'Hazard pockets sit between pins (horde, patrols, collapse, flood). Sense them inside your ring, route around when you can — each kind bites differently if you cross.',
      'Infected animals share the combat loop and can infect on a hit. Otters and monitors claim inland water, macaques and boars the catchment, dogs/cats/rats the streets.',
    ],
  },
  {
    id: 'loot',
    title: 'Loot',
    bullets: [
      'At a place, start a search: a fogged grid reveals finds one by one in real time.',
      'Click a fogged cell to search it next. Click found items (or Take all) into your pack; overflow goes to the on-site stash.',
      'Each site has limited searches. Leaving early still spends a partial charge. Take what you want — Done or Leave abandons the rest.',
    ],
  },
  {
    id: 'hdb',
    title: 'Inside the block',
    bullets: [
      'Void decks open a side-elevation cutaway. Stairs stay visible even on sealed storeys; hover a reachable stair or door to preview the auto-path, then click to walk it. Unvisited open floors stay fogged until you climb in.',
      'Sealed landings are gone for good. Corridor debris, barricades, and stair gates can be cleared (heat + time). Collapses are permanent — find another route.',
      'Higher storeys pay better loot. Cutaway doors show room type (Flat, Stocked, Trapped, Storeroom, Pantry, Holdout) — hover the Room tile on the door card for what each means. Encounter chance tracks heat + how the door stands (Perception pins the exact %; otherwise a range). Entry and encounter live on that card, not on the door face. Heat on the bottom dock shows stair difficulty; expand it for the symbol key and sense-check odds. Going down can need Dexterity + Endurance (hover a stair to preview). Leave only from level 01.',
    ],
  },
  {
    id: 'tunnels',
    title: 'The tunnels',
    bullets: [
      'From an MRT platform, Plan tunnel travel opens the rail map. Pick a destination — default route is fewest stations. Some segments collapse each run and cannot be crossed.',
      'Confirming a route starts one crawl for the whole path. A station strip tracks the planned line, next stop, and transfers. You can exit at intermediate stations or keep walking to the far end. No surface range, weather, or encumbrance underground.',
      'Between stations the running tunnel can split. Stay on the through line or peel into a side passage — it may run a few hops before it rejoins. Pick the node you can afford; the other way is gone once you step.',
      'Pressure builds from noise in the bore. Camps can rest it down; a pinned gauge draws worse things. STA may toll the stairs down at stations they still hold.',
    ],
  },
  {
    id: 'evac',
    title: 'Evac',
    bullets: [
      'A map beacon marks the staging zone. Reach it during the timed window with a haul in your backpack (not stash or equipped), then pop the flare.',
      'Fuel counts most, then meds and ammo; sealed water a little; food and scrap barely; weapons barely count as cargo. The bird never names a quota — each window has its own appetite, and only the flare tells you if it was enough. Boiling water burns fuel.',
      'Miss the window and a new site opens after a cooldown — the horde keeps rising either way. Collapsed tunnels often force detours toward the first beacon.',
    ],
  },
  {
    id: 'score',
    title: 'Score',
    bullets: [
      'Score = (kills × 25 + carried loot value + days × 50) × day multiplier. Day 1 is ×1.0; each further day adds ×0.1.',
      'A successful extract adds 2000 × the same day multiplier. Linger to climb the mult, then lift out late for the best board score.',
      'Death still posts a score on this device, and to the worldwide board when you are online. When the horde hits 100%, the city is overrun and the run ends.',
    ],
  },
] as const;

export const GUIDE_BY_ID: Record<GuideTopic, GuideSection> = Object.fromEntries(
  GUIDE_SECTIONS.map((s) => [s.id, s]),
) as Record<GuideTopic, GuideSection>;

/** Sections shown when opening help from a given entry point. */
export function guideTopicsFor(topic: GuideTopic): GuideTopic[] {
  if (topic === 'evac') return ['evac', 'score'];
  if (topic === 'hdb') return ['hdb', 'loot'];
  if (topic === 'tunnels') return ['tunnels', 'evac'];
  return [topic];
}
