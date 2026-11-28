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
    tagline: 'Someone keeps setting your table for two.',
    blurb:
      'For months you ate alone at the same plastic table downstairs. Yesterday there were two bowls. You sat with your knife on your knee until the soup went cold. This morning you brought something to share.',
    kit: { standard: true },
  },
  {
    id: 'drifter',
    name: 'Drifter',
    tagline: 'You sleep where the mynahs do.',
    blurb:
      'At the bus interchange, the mynahs always woke a minute before the dead came through. You got months of sleep that way. Last night the whole flock left. You slipped on your flip-flops and followed.',
    kit: {
      items: [{ id: 'cloth_wraps' }, { id: 'jeans' }, { id: 'flip_flops' }, { id: 'grocery_tote' }],
    },
  },
  {
    id: 'student',
    name: 'College Student',
    tagline: 'Your project group still takes attendance.',
    blurb:
      'Four of you agreed to mark the campus bus map whenever you passed. For months there were three sets of initials. This morning the fourth appeared beside a stop you had all crossed out. You recognised the little heart she always put over the i.',
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
    tagline: 'Uncle Lim finally beat you up the stairs.',
    blurb:
      'When the lifts failed, you taught Uncle Lim to take one landing at a time. He complained all the way to twelve. Months later, carrying water up those same stairs, you stopped for breath on nine. From above came his best impression of you. “Rest when you get here.”',
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
    tagline: 'The last entry in the duty book is a breakfast order.',
    blurb:
      'You drew the dawn shift at the checkpoint. Your relief pencilled his usual order beside your name and left to get kopi. Months later you can barely picture his face, but you still catch yourself ordering two cups, one with extra milk.',
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
    tagline: 'Bed six wants her slippers back.',
    blurb:
      'When the ward moved downstairs, the woman in bed six made you promise to fetch her red slippers. By the time you got back, the beds were gone. Months later, someone at a void deck clinic asked for you by name. Apparently you still owe her a pair.',
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
    tagline: 'Three knocks on the shutter means one more for dinner.',
    blurb:
      'You used to bang the pot against the shutter when the last porridge was going cheap. After the centre emptied, you did it once out of habit. A spoon tapped back from the drinks stall. These days you always scrape the bottom for two.',
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
    tagline: 'The auntie on seven still owes you a radio.',
    blurb:
      'For thirty years she saved her newspapers for you and swore the broken radio would be next. Yesterday a basket came down from her seventh-floor window. Inside was the radio, polished clean, with a note in her square handwriting. “Can fix?”',
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
    tagline: 'Your mother saves her messages for office hours.',
    blurb:
      'The powerbank gives your phone just long enough to play one old voice note. You keep picking the same one. Mum spends half of it trying to turn the recorder off. In the last second you can hear Dad laughing.',
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
    tagline: 'You know who left a thumbprint in the concrete.',
    blurb:
      'Your daughter was six when you let her press a thumb into the wet landing. The block is boarded up now. On your last visit you found a much bigger thumbprint traced around the first one in chalk. You stood there with your hard hat in your hands.',
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
    tagline: 'For once, somebody is glad to hear your knock.',
    blurb:
      'You used to collect debts three doors down from the provision shop. After the shutters went up for good, you brought the old shopkeeper his first tin of peaches in months. He still made you sign the ledger. Under your name he wrote “delivery”.',
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
