import type { Occupation } from './types';
import { TRAITS, TRAIT_BUDGET, canPickTrait, getTrait, traitBudgetUsed } from './character';

// ---------- Occupations (curated presets) ----------
// Who you were on the Friday before it fell. One-click starting builds that
// spend the trait budget *exactly* (net 0 under the 0-start pool), so picking
// one is never the weaker choice against another or against a hand-rolled build.
// Anything here can be opened in Advanced Mode and edited.

export const OCCUPATIONS: Occupation[] = [
  {
    id: 'student',
    name: 'College Student',
    tagline: 'Young legs, group-project diplomacy, allergic to the outdoors.',
    blurb:
      'Two years of early lectures you slept through and midnight suppers you did not. You can walk all day and talk your way into most things — you have just never spent one without aircon.',
    traitIds: [
      'marathoner',
      'kampong_spirit',
      'karang_guni',
      'night_owl',
      'aircon_addict',
      'picky_eater',
      'clumsy',
      'squeamish',
      'dehydrated',
      'short_fuse',
      'heavy_sleeper',
    ],
    goodAt: ['Walking far', 'Getting along with people', 'Staying up', 'Scavenging'],
    strugglesWith: ['The heat outdoors', 'Combat nerves', 'Keeping hydrated'],
  },
  {
    id: 'trainer',
    name: 'Personal Trainer',
    tagline: 'The body works. Everything else you will have to learn.',
    blurb:
      'Six sessions a day at a condo gym, plus your own. Nothing about this apocalypse is harder on you than leg day was — but nothing about it is about legs, either.',
    traitIds: [
      'marathoner',
      'tekong_legs',
      'thick_skin',
      'water_baby',
      'poor_sleep',
      'noisy',
      'picky_eater',
      'short_fuse',
      'clumsy',
      'squeamish',
    ],
    goodAt: ['Endurance', 'Travel speed', 'Shrugging off infection'],
    strugglesWith: ['Actually resting', 'Staying quiet', 'Combat nerves'],
  },
  {
    id: 'soldier',
    name: 'Soldier',
    tagline: 'Trained to fight, trained to march, trained to notice.',
    blurb:
      'You were on duty when the order stopped coming. The training holds. The sleep does not — every hour of it is one ear open, and it shows by day three.',
    traitIds: [
      'ns_combat',
      'marathoner',
      'sixth_sense',
      'poor_sleep',
      'aircon_addict',
      'picky_eater',
      'squeamish',
      'dehydrated',
      'short_fuse',
      'thin_blood',
    ],
    goodAt: ['Fighting', 'Spotting trouble first', 'Endurance'],
    strugglesWith: ['Actually resting', 'Infection', 'The heat outdoors'],
  },
  {
    id: 'nurse',
    name: 'Nurse',
    tagline: 'Everyone else lives. You are the one keeping score.',
    blurb:
      'Twelve-hour shifts taught you triage, and taught your immune system a great deal more. You carry more than you should and you know exactly what all of it is for.',
    traitIds: [
      'medic',
      'thick_skin',
      'kiasuism',
      'pack_rat',
      'poor_sleep',
      'aircon_addict',
      'picky_eater',
      'clumsy',
      'dehydrated',
      'noisy',
      'heavy_sleeper',
    ],
    goodAt: ['Healing', 'Infection resistance', 'Carrying capacity'],
    strugglesWith: ['Actually resting', 'Moving quietly', 'The heat outdoors'],
  },
  {
    id: 'hawker',
    name: 'Food Vendor',
    tagline: 'Thirty years behind a wok. Nothing here smells worse than that did.',
    blurb:
      'You fed half the estate and knew all of it by name. Food goes further in your hands, doors open that would not for a stranger — and you have been awake at 4am since before most of these buildings were painted.',
    traitIds: [
      'hawker_cook',
      'kampong_spirit',
      'thick_skin',
      'pack_rat',
      'poor_sleep',
      'aircon_addict',
      'clumsy',
      'squeamish',
      'dehydrated',
      'noisy',
      'short_fuse',
    ],
    goodAt: ['Making food count', 'Faction relations', 'Carrying capacity'],
    strugglesWith: ['Actually resting', 'Combat nerves', 'Travelling unnoticed'],
  },
  {
    id: 'karung_guni',
    name: 'Scavenger',
    tagline: 'You already knew which blocks had the good stuff.',
    blurb:
      'Rag-and-bone, floor by floor, for longer than most of these buildings have stood. The looting is not new to you. The knees gave out somewhere around the fourteenth storey.',
    traitIds: [
      'karang_guni',
      'sixth_sense',
      'handyman',
      'pack_rat',
      'bad_knees',
      'aircon_addict',
      'picky_eater',
      'clumsy',
      'squeamish',
      'dehydrated',
      'poor_sleep',
    ],
    goodAt: ['Looting', 'Awareness', 'Repairing things', 'Carrying capacity'],
    strugglesWith: ['Moving quickly', 'Leg injuries', 'The heat outdoors'],
  },
  {
    id: 'office',
    name: 'Office Worker',
    tagline: 'Soft hands, sharp elbows, and a very large laptop bag.',
    blurb:
      'You survived four reorgs and a return-to-office mandate. You know how to work a room and how to take more than your share of the free buffet. You have not run for a bus since 2019.',
    traitIds: [
      'kiasuism',
      'kampong_spirit',
      'pack_rat',
      'karang_guni',
      'clumsy',
      'aircon_addict',
      'picky_eater',
      'dehydrated',
      'noisy',
      'poor_sleep',
      'heavy_sleeper',
    ],
    goodAt: ['Looting value', 'Faction relations', 'Carrying capacity'],
    strugglesWith: ['Anything physical', 'Being ambushed', 'The heat outdoors'],
  },
  {
    id: 'contractor',
    name: 'Contractor',
    tagline: 'You can fix it, carry it, or hit it with something heavier.',
    blurb:
      'Twenty years of renovation work across every estate on the island. You know what a building is made of, which means you know how to take one apart — loudly.',
    traitIds: [
      'handyman',
      'ns_combat',
      'marathoner',
      'karang_guni',
      'noisy',
      'aircon_addict',
      'picky_eater',
      'squeamish',
      'dehydrated',
      'short_fuse',
      'poor_sleep',
    ],
    goodAt: ['Crafting & repair', 'Fighting', 'Looting', 'Endurance'],
    strugglesWith: ['Travelling unnoticed', 'The heat outdoors', 'Actually resting'],
  },
  {
    id: 'runner',
    name: 'Fixer',
    tagline: 'You ran errands for people it is better not to name.',
    blurb:
      'Collections, mostly. Nothing you would put on a resume, and nothing anybody wrote down. The 88 Syndicate still knows your face and still counts it as one of theirs — which means the void decks are open ground to you and the checkpoints are not. The IDTF has a file, and it is not flattering.',
    traitIds: [
      'ah_long_debt',
      'karang_guni',
      'thick_skin',
      'kiasuism',
      'noisy',
      'aircon_addict',
      'picky_eater',
      'clumsy',
      'dehydrated',
      'poor_sleep',
      'heavy_sleeper',
    ],
    goodAt: ['88 Syndicate territory', 'Looting', 'Shrugging off infection'],
    strugglesWith: ['The IDTF', 'Travelling unnoticed', 'Being ambushed'],
  },
];

export function getOccupation(id: string): Occupation | null {
  return OCCUPATIONS.find((o) => o.id === id) ?? null;
}

/**
 * Whether a trait set is one an occupation could legally have been built by
 * hand — spends the whole budget and breaks no conflict or per-side rules.
 *
 * Traits are added cheapest-first because `canPickTrait` enforces the budget at
 * every step, so a build that nets exactly 0 has to bank its negatives before
 * it can afford its last positive.
 */
export function occupationIssues(o: Occupation): string[] {
  const issues: string[] = [];
  const picked: string[] = [];
  const inPickOrder = [...o.traitIds].sort((a, b) => getTrait(a).cost - getTrait(b).cost);
  for (const id of inPickOrder) {
    if (!TRAIT_IDS.has(id)) {
      issues.push(`unknown trait "${id}"`);
      continue;
    }
    if (!canPickTrait(id, picked)) {
      issues.push(`"${getTrait(id).name}" is not legal on top of the earlier picks`);
      continue;
    }
    picked.push(id);
  }
  const used = traitBudgetUsed(o.traitIds);
  if (used !== TRAIT_BUDGET) {
    issues.push(`nets ${used} (expected ${TRAIT_BUDGET}) — presets must spend the budget exactly`);
  }
  return issues;
}

const TRAIT_IDS = new Set(TRAITS.map((t) => t.id));

if (import.meta.env.DEV) {
  for (const o of OCCUPATIONS) {
    const issues = occupationIssues(o);
    if (issues.length > 0) {
      console.error(`[occupations] "${o.name}" is not a legal build:`, issues.join('; '));
    }
  }
}
