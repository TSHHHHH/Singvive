import type { Occupation } from './types';
import { TRAITS, TRAIT_BUDGET, canPickTrait, getTrait, isCurse, isSignature, traitBudgetUsed } from './character';

// ---------- Occupations (curated presets) ----------
// Who you were on the Friday before it fell. One-click starting builds that
// spend the trait budget *exactly* (net 0 under the 0-start pool), so picking
// one is never the weaker choice against another or against a hand-rolled build.
// Anything here can be opened in Advanced Mode and edited.

export const OCCUPATIONS: Occupation[] = [
  {
    id: 'student',
    name: 'College Student',
    tagline: 'Campus legs. Mall aircon. A body that has not learned to quit.',
    blurb:
      'Two years of lectures you slept through and 3am suppers you did not. You can walk all day and talk a door open — you have just never spent one without aircon.',
    traitIds: ['young_blood', 'never_outdoors'],
    goodAt: ['Travel', 'Night work', 'Talking through doors'],
    strugglesWith: ['Heat', 'The undead', 'Thirst'],
  },
  {
    id: 'trainer',
    name: 'Personal Trainer',
    tagline: 'Hyrox heats. Sandbag lunges. An engine that will not idle.',
    blurb:
      'Stadium races, condo gyms, the whole circus. The engine is still there. Sitting still was never the job — and sleep has not been either.',
    traitIds: ['hyrox_champion', 'restlessness'],
    goodAt: ['Endurance', 'Travel', 'Health'],
    strugglesWith: ['Rest', 'Staying quiet'],
  },
  {
    id: 'soldier',
    name: 'Soldier',
    tagline: 'NS, then the real thing. The first blow never lands clean.',
    blurb:
      'You were on duty when the order stopped coming. The training holds. The sleep does not — every hour of it is one ear open, and it shows by day three.',
    traitIds: ['combat_veteran', 'hypervigilant'],
    goodAt: ['Fighting', 'Soaking the first hit'],
    strugglesWith: ['Sleep', 'Night travel'],
  },
  {
    id: 'nurse',
    name: 'Nurse',
    tagline: 'A&E nights. You close holes other people bleed out of.',
    blurb:
      'Twelve-hour shifts taught you triage, and taught your hands to stop bleeding that would kill anyone else. The tank never fills. You stopped expecting it to.',
    traitIds: ['trauma_medic', 'shift_burnout'],
    goodAt: ['Healing', 'Infection', 'Clotting'],
    strugglesWith: ['Rest', 'Energy'],
  },
  {
    id: 'hawker',
    name: 'Food Vendor',
    tagline: 'Thirty years of service. Extra rice. A voice the whole block knows.',
    blurb:
      'You fed half the estate and knew all of it by name. Food goes further in your hands, and the co-op still counts you as one of theirs. So does everything that hunts by sound.',
    traitIds: ['estate_kitchen', 'stall_voice'],
    goodAt: ['Food', 'PP Co-op', 'Hawker-centre loot'],
    strugglesWith: ['Stealth', 'Ambushes'],
  },
  {
    id: 'karung_guni',
    name: 'Scavenger',
    tagline: 'You already knew which blocks had the good stuff.',
    blurb:
      'Rag-and-bone, floor by floor, for longer than most of these buildings have stood. The looting is not new. The knees gave out somewhere around the fourteenth storey.',
    traitIds: ['estate_memory', 'ruined_knees'],
    goodAt: ['Looting', 'Searches', 'Reading a site'],
    strugglesWith: ['Travel', 'Stairs', 'Leg injuries'],
  },
  {
    id: 'office',
    name: 'Office Worker',
    tagline: 'Soft hands, sharp elbows, and a bag with one more pocket.',
    blurb:
      'Four reorgs and a return-to-office mandate. You know how to work a room and how to take more than your share. You have not run for a bus since 2019.',
    traitIds: ['operator', 'desk_body'],
    goodAt: ['Loot value', 'Pack space', 'Talking through doors'],
    strugglesWith: ['Anything physical', 'Heat'],
  },
  {
    id: 'contractor',
    name: 'Contractor',
    tagline: 'You built these blocks. Quiet was never the job.',
    blurb:
      'Twenty years of renovation across every estate on the island. You know what a building is made of — which means you know how to take one apart, loudly.',
    traitIds: ['site_foreman', 'heavy_hands'],
    goodAt: ['Crafting', 'Hardware loot', 'Reading HDB corridors'],
    strugglesWith: ['Stealth', 'Ambushes'],
  },
  {
    id: 'runner',
    name: 'Fixer',
    tagline: 'They know your face. The void decks are open. The checkpoints are not.',
    blurb:
      'Collections, mostly. Nothing you would put on a resume. The 88 Syndicate still counts you as one of theirs. The IDTF has a file, and it is not flattering.',
    traitIds: ['made_man', 'warrant'],
    goodAt: ['88 Syndicate territory', 'Void-deck access'],
    strugglesWith: ['The IDTF', 'Checkpoints'],
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
  const sigs = o.traitIds.filter((id) => isSignature(getTrait(id)));
  const curses = o.traitIds.filter((id) => isCurse(getTrait(id)));
  if (sigs.length !== 1) issues.push(`expected 1 signature, got ${sigs.length}`);
  if (curses.length !== 1) issues.push(`expected 1 curse, got ${curses.length}`);
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
