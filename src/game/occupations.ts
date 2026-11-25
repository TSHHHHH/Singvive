import type { Occupation } from './types';
import { SCAVENGER_FINDS } from './kitFinds';

// ---------- Roles (occupations) ----------
// Who you are now, months after the outbreak: a name, a story and what you
// still carry. A role gives no traits and no stats; the trait build is picked
// by hand on its own step. Kits fit the setting: no fresh food, worn gear, and
// every role keeps its legs covered.

export const DEFAULT_OCCUPATION_ID = 'survivor';

export const OCCUPATIONS: Occupation[] = [
  {
    id: 'survivor',
    name: 'Classic Survivor',
    tagline: 'A knife, a jacket, a bag. The same kit as everyone still walking.',
    blurb:
      'Whatever you were before, it stopped mattering around the third month. You kept what works: a blade that holds an edge, a jacket that turns a scratch, and a bag you never put down.',
    kit: { standard: true },
  },
  {
    id: 'drifter',
    name: 'Drifter',
    tagline: 'Rags on your hands, a tote on your shoulder. Everything else went somewhere.',
    blurb:
      'You lost the knife in the second month and the bag in the third, and stopped counting after that. What you have now is wrapped knuckles, a shopping tote and the habit of walking until you find something.',
    kit: {
      items: [{ id: 'cloth_wraps' }, { id: 'jeans' }, { id: 'flip_flops' }, { id: 'grocery_tote' }],
    },
  },
  {
    id: 'student',
    name: 'College Student',
    tagline: 'Campus legs and a school bag. The lectures ended months ago.',
    blurb:
      'The hall emptied in the first week and you never went back for your notes. A box cutter from the art room, a water bottle you refill wherever you can, and legs that still walk all day.',
    kit: {
      items: [
        { id: 'school_bag' },
        { id: 'jeans' },
        { id: 'sneakers' },
        { id: 'water_bottle' },
        { id: 'box_cutter' },
      ],
    },
  },
  {
    id: 'trainer',
    name: 'Personal Trainer',
    tagline: 'The gym is dark. The engine is not.',
    blurb:
      'The condo gym went dark in the first month, so you train on stairwells now. Grip gloves, a hammer from the maintenance room, and a gel you save for the long days.',
    kit: {
      items: [
        { id: 'cargo_shorts' },
        { id: 'grip_gloves' },
        { id: 'sneakers' },
        { id: 'sling_bag' },
        { id: 'water_bottle' },
        { id: 'energy_gel' },
        { id: 'hammer' },
      ],
    },
  },
  {
    id: 'soldier',
    name: 'Soldier',
    tagline: 'Your unit stopped reporting in. You did not stop.',
    blurb:
      'The last order came months ago. You still wear the uniform, because it still works: boots that hold up, a parang from the field kit, and one ration you are saving.',
    kit: {
      items: [
        { id: 'army_uniform' },
        { id: 'camo_pants' },
        { id: 'combat_boots' },
        { id: 'daypack' },
        { id: 'parang' },
        { id: 'army_ration' },
      ],
    },
  },
  {
    id: 'nurse',
    name: 'Nurse',
    tagline: 'The ward closed. Your hands still know the work.',
    blurb:
      'The hospital stopped taking people in the second month. You kept the gloves, a mask, one clean bandage, and the box cutter you used to open supply crates.',
    kit: {
      items: [
        { id: 'rubber_gloves' },
        { id: 'n95_mask' },
        { id: 'work_trousers' },
        { id: 'sneakers' },
        { id: 'sling_bag' },
        { id: 'bandage' },
        { id: 'box_cutter' },
      ],
    },
  },
  {
    id: 'hawker',
    name: 'Food Vendor',
    tagline: 'No stall, no customers. Still the cleaver, still the pot.',
    blurb:
      'The hawker centre went quiet months ago. You took what a cook cannot work without: the cleaver, the pot, a lighter, and boots that do not slip on a wet floor.',
    kit: {
      items: [
        { id: 'meat_cleaver' },
        { id: 'cargo_shorts' },
        { id: 'rubber_boots' },
        { id: 'cooking_pot' },
        { id: 'lighter' },
        { id: 'daypack' },
      ],
    },
  },
  {
    id: 'karung_guni',
    name: 'Scavenger',
    tagline: 'Rag-and-bone before. Rag-and-bone now. Business is better.',
    blurb:
      'You collected what other people threw out for thirty years. Now nobody throws anything out, but the empty flats are full. A duffel bag, a pipe wrench, work gloves, and always something odd in a pocket.',
    kit: {
      items: [
        { id: 'work_gloves' },
        { id: 'work_trousers' },
        { id: 'duffel_bag' },
        { id: 'pipe_wrench' },
        { id: 'cloth_rags', count: 2 },
      ],
      pool: { pick: 1, from: SCAVENGER_FINDS },
    },
  },
  {
    id: 'office',
    name: 'Office Worker',
    tagline: 'The office emptied. You kept the golf club and the powerbank.',
    blurb:
      'The last email went out in the first week. The golf bag in your car boot had one club that swings well, and a powerbank you keep charged by any means.',
    kit: {
      items: [
        { id: 'work_trousers' },
        { id: 'sneakers' },
        { id: 'sling_bag' },
        { id: 'golf_club' },
        { id: 'powerbank' },
      ],
    },
  },
  {
    id: 'contractor',
    name: 'Contractor',
    tagline: 'You built these blocks. Now you take them apart for parts.',
    blurb:
      'No renovation jobs since the first month. The hard hat, vest and safety boots stay on, because the concrete has not stopped falling. A hammer and a roll of duct tape fix most things.',
    kit: {
      items: [
        { id: 'hard_hat' },
        { id: 'work_vest' },
        { id: 'work_trousers' },
        { id: 'safety_boots' },
        { id: 'daypack' },
        { id: 'hammer' },
        { id: 'duct_tape' },
      ],
    },
  },
  {
    id: 'runner',
    name: 'Fixer',
    tagline: 'Collections, before. Now you open the doors other people cannot.',
    blurb:
      'You did work nobody put on a résumé. Months on, the work is the same: a bat for arguments, a pick for locks, and a jacket that says you are not worth the trouble.',
    kit: {
      items: [
        { id: 'leather_jacket' },
        { id: 'jeans' },
        { id: 'sneakers' },
        { id: 'sling_bag' },
        { id: 'baseball_bat' },
        { id: 'lockpick' },
      ],
    },
  },
];

export function getOccupation(id: string): Occupation | null {
  return OCCUPATIONS.find((o) => o.id === id) ?? null;
}
