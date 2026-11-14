/**
 * Theme tags for the character-create trait filter. UI-only: nothing in the
 * simulation reads these. Every trait carries at least one tag (pinned by
 * `traitTags.test.ts`), so a filter never hides a trait from every chip.
 */
import { hasTraitKit } from './startingKit';

export type TraitTag =
  | 'combat'
  | 'body'
  | 'medical'
  | 'stealth'
  | 'scavenge'
  | 'needs'
  | 'people'
  /** Derived: any trait that adds to the starting kit (see startingKit.ts). */
  | 'gear';

export const TRAIT_TAG_ORDER: TraitTag[] = [
  'combat',
  'body',
  'medical',
  'stealth',
  'scavenge',
  'needs',
  'people',
  'gear',
];

export const TRAIT_TAG_LABELS: Record<TraitTag, string> = {
  combat: 'Combat',
  body: 'Body',
  medical: 'Medical',
  stealth: 'Stealth',
  scavenge: 'Scavenge',
  needs: 'Needs',
  people: 'People',
  gear: 'Gear',
};

export const TRAIT_TAGS: Record<string, TraitTag[]> = {
  // positive
  ns_combat: ['combat', 'people'],
  medic: ['medical'],
  hawker_cook: ['needs'],
  marathoner: ['body'],
  karang_guni: ['scavenge'],
  tekong_legs: ['body'],
  night_owl: ['combat', 'stealth'],
  thick_skin: ['combat', 'medical'],
  kiasuism: ['scavenge'],
  kampong_spirit: ['people'],
  local_contacts: ['people'],
  ah_long_debt: ['people'],
  water_baby: ['needs'],
  handyman: ['scavenge'],
  sixth_sense: ['stealth'],
  pack_rat: ['scavenge'],
  mule: ['scavenge', 'body'],
  deep_sleeper: ['needs'],
  quiet_step: ['stealth'],
  strong_back: ['scavenge', 'body'],
  iron_stomach: ['needs'],
  heat_hardened: ['body', 'needs'],
  silver_tongue: ['people'],
  field_dressing: ['medical'],
  calm_hands: ['combat'],
  frugal: ['needs'],
  shadow_habit: ['stealth'],
  umbrella_city: ['body', 'needs'],
  haze_mask: ['body', 'medical'],
  void_deck_chat: ['people'],
  train_memory: ['body', 'scavenge'],
  sharp_eye: ['stealth'],
  combat_veteran: ['combat', 'people'],
  trauma_medic: ['medical'],
  hyrox_champion: ['body'],
  young_blood: ['body', 'combat'],
  estate_kitchen: ['needs', 'people', 'scavenge'],
  estate_memory: ['scavenge'],
  operator: ['scavenge', 'people'],
  site_foreman: ['scavenge'],
  made_man: ['people'],
  go_bag: ['needs'],
  prepper: ['needs', 'scavenge'],
  medicine_cabinet: ['medical'],
  heirloom_blade: ['combat'],
  weekend_cyclist: ['combat', 'body'],
  supper_run: ['needs'],
  // negative
  light_pockets: ['scavenge'],
  aircon_addict: ['body', 'needs'],
  picky_eater: ['needs'],
  glass_jaw: ['body', 'combat'],
  clumsy: ['combat'],
  hoarder: ['scavenge'],
  noisy: ['stealth'],
  bad_knees: ['body'],
  hemophilia: ['medical'],
  poor_sleep: ['needs'],
  squeamish: ['combat'],
  out_of_shape: ['body'],
  weak_stomach: ['needs'],
  dehydrated: ['needs'],
  afraid_of_dark: ['stealth', 'combat'],
  thin_blood: ['medical'],
  short_fuse: ['people'],
  heavy_sleeper: ['stealth'],
  hypervigilant: ['needs', 'stealth'],
  shift_burnout: ['needs', 'body'],
  restlessness: ['needs', 'stealth'],
  never_outdoors: ['body', 'combat'],
  stall_voice: ['stealth'],
  ruined_knees: ['body'],
  desk_body: ['body', 'combat'],
  heavy_hands: ['stealth'],
  warrant: ['people'],
  mall_rat: ['body', 'needs'],
  tone_deaf: ['people'],
  loud_soles: ['stealth'],
  lost_without_maps: ['body', 'stealth'],
  just_popped_out: ['body'],
};

export function traitTags(id: string): TraitTag[] {
  const tags = TRAIT_TAGS[id] ?? [];
  return hasTraitKit(id) ? [...tags, 'gear'] : tags;
}
