// ---------------------------------------------------------------------------
// Combat outcome lines.
//
// Punchy, varied follow-ups for hits/misses/dodges/flee — not diary voice.
// Roll math stays in combat.ts; this only picks narrative text. Cosmetic
// Math.random is fine (does not touch game RNG).
// ---------------------------------------------------------------------------

export interface CombatFlavorCtx {
  weapon?: string;
  enemy?: string;
  zone?: string;
  place?: string;
  dmg?: number | string;
  soak?: number | string;
  soakNote?: string;
  inf?: number | string;
  stance?: string;
}

export type CombatFlavorKey =
  | 'playerHitMelee'
  | 'playerHitRanged'
  | 'playerCritMelee'
  | 'playerCritRanged'
  | 'playerMissMelee'
  | 'playerMissRanged'
  | 'playerPierce'
  | 'playerKill'
  | 'gunshotEcho'
  | 'enemyRollZombie'
  | 'enemyRollHuman'
  | 'enemyRollAnimal'
  | 'enemyHitZombie'
  | 'enemyHitHuman'
  | 'enemyHitAnimal'
  | 'enemyCritZombie'
  | 'enemyCritHuman'
  | 'enemyCritAnimal'
  | 'enemyMissZombie'
  | 'enemyMissHuman'
  | 'enemyMissAnimal'
  | 'enemyDodge'
  | 'enemyBlocked'
  | 'enemyBite'
  | 'playerOffHandHit'
  | 'playerOffHandMiss'
  | 'oppHit'
  | 'oppMiss'
  | 'fleeOk'
  | 'fleeFail';

const POOLS: Record<CombatFlavorKey, string[]> = {
  playerHitMelee: [
    'The {weapon} finds a gap — {dmg} damage.{soakNote}',
    'You drive the {weapon} home for {dmg}.{soakNote}',
    'A solid blow with the {weapon}. {dmg} damage.{soakNote}',
    'You connect — {weapon}, {dmg} damage.{soakNote}',
    'The {weapon} lands hard. {dmg} damage.{soakNote}',
  ],
  playerHitRanged: [
    'The shot from the {weapon} hits — {dmg} damage.{soakNote}',
    'You put a round on target for {dmg}.{soakNote}',
    '{weapon}: clean hit, {dmg} damage.{soakNote}',
    'The round finds meat — {dmg} damage.{soakNote}',
    'You squeeze off a hit with the {weapon}. {dmg} damage.{soakNote}',
  ],
  playerCritMelee: [
    'CRITICAL — the {weapon} tears through for {dmg}!{soakNote}',
    'CRITICAL! You bury the {weapon} deep — {dmg} damage.{soakNote}',
    'CRITICAL — a crushing strike with the {weapon}. {dmg}!{soakNote}',
    'CRITICAL! The {weapon} hits something vital for {dmg}.{soakNote}',
  ],
  playerCritRanged: [
    'CRITICAL — the {weapon} shot punches through for {dmg}!{soakNote}',
    'CRITICAL! Perfect shot. {dmg} damage.{soakNote}',
    'CRITICAL — you nail the weak point for {dmg}.{soakNote}',
    'CRITICAL! The round from the {weapon} does {dmg}.{soakNote}',
  ],
  playerMissMelee: [
    'The {weapon} skids off nothing useful.',
    'You swing the {weapon} and cut air.',
    'A miss — the {weapon} finds only space.',
    'You overreach; the {weapon} goes wide.',
    'The {weapon} glances past without biting.',
  ],
  playerMissRanged: [
    'The shot from the {weapon} goes wide.',
    'You miss — the round from the {weapon} sparks off junk.',
    'A wasted shot. The {weapon} finds wall, not body.',
    'The round sails past. {weapon} spent for nothing.',
  ],
  playerPierce: [
    'You slip the blow past its armour.',
    'The strike finds a seam in the armour.',
    'Precision pays off — you ignore the plating.',
  ],
  playerKill: [
    'The {enemy} drops. Fight over.',
    'The {enemy} goes down and stays down.',
    'You finish it. The {enemy} stops moving.',
    'The {enemy} collapses. You\'re still standing.',
  ],
  gunshotEcho: [
    'The gunshot rings down the {place}.',
    'The shot echoes through the {place}.',
    'Noise rolls out across the {place}.',
  ],
  enemyRollZombie: [
    '{enemy} lunges',
    '{enemy} claws in',
    '{enemy} surges forward',
    '{enemy} reaches for you',
  ],
  enemyRollHuman: [
    '{enemy} swings',
    '{enemy} comes in',
    '{enemy} presses the attack',
    '{enemy} closes the gap',
  ],
  enemyRollAnimal: [
    '{enemy} lunges',
    '{enemy} snaps in',
    '{enemy} comes at you',
    '{enemy} closes fast',
  ],
  enemyHitZombie: [
    'Fingers rake your {zone} — {dmg}.{soakNote}',
    'It catches your {zone} for {dmg}.{soakNote}',
    'Cold hands find your {zone}. {dmg} damage.{soakNote}',
    'Teeth and nails scrape your {zone} — {dmg}.{soakNote}',
    'It slams into your {zone} for {dmg}.{soakNote}',
  ],
  enemyHitHuman: [
    'A hard blow lands on your {zone} — {dmg}.{soakNote}',
    'They clip your {zone} for {dmg}.{soakNote}',
    'A strike cracks into your {zone}. {dmg} damage.{soakNote}',
    'You take {dmg} to the {zone}.{soakNote}',
    'Their swing connects — {zone}, {dmg}.{soakNote}',
  ],
  enemyHitAnimal: [
    'Jaws catch your {zone} — {dmg}.{soakNote}',
    'Claws rake your {zone} for {dmg}.{soakNote}',
    'It slams into your {zone}. {dmg} damage.{soakNote}',
    'Teeth scrape your {zone} — {dmg}.{soakNote}',
    'A heavy hit to the {zone} for {dmg}.{soakNote}',
  ],
  enemyCritZombie: [
    'CRITICAL — a blow to the {zone} for {dmg}!{soakNote}',
    'CRITICAL! It hammers your {zone} for {dmg}.{soakNote}',
    'CRITICAL — teeth and force on your {zone}. {dmg}!{soakNote}',
  ],
  enemyCritHuman: [
    'CRITICAL — a brutal hit to the {zone} for {dmg}!{soakNote}',
    'CRITICAL! They smash your {zone} for {dmg}.{soakNote}',
    'CRITICAL — the blow lands square on your {zone}. {dmg}!{soakNote}',
  ],
  enemyCritAnimal: [
    'CRITICAL — jaws on your {zone} for {dmg}!{soakNote}',
    'CRITICAL! It tears into your {zone} for {dmg}.{soakNote}',
    'CRITICAL — a crushing bite on your {zone}. {dmg}!{soakNote}',
  ],
  enemyMissZombie: [
    'You dodge its grasp.',
    'It lunges past — empty air.',
    'Rotting fingers miss by a breath.',
    'You twist clear of the grab.',
  ],
  enemyMissHuman: [
    'Their swing goes wide.',
    'You duck under the blow.',
    'They miss — close, but not close enough.',
    'You step out of the strike\'s path.',
  ],
  enemyMissAnimal: [
    'You twist clear of the jaws.',
    'It snaps past — empty air.',
    'Claws miss by a breath.',
    'You step aside as it overshoots.',
  ],
  enemyDodge: [
    'You slip the blow — reflexes and footing.',
    'You step aside at the last beat.',
    'You roll with it and come away clean.',
    'Footwork saves you — the hit never lands.',
  ],
  enemyBlocked: [
    'You catch it on the {weapon} — the hit never lands.',
    'The {weapon} takes the blow. You stay standing.',
    'Blocked — the {weapon} eats what was meant for you.',
    'You raise the {weapon} and the strike dies on it.',
  ],
  playerOffHandHit: [
    'Off-hand {weapon} follows through for {dmg}.{soakNote}',
    'The {weapon} in your off hand bites for {dmg}.{soakNote}',
    'A follow-up with the {weapon} — {dmg} more.{soakNote}',
    'Your off-hand {weapon} lands. {dmg} damage.{soakNote}',
  ],
  playerOffHandMiss: [
    'The off-hand {weapon} finds only air.',
    'You jab with the {weapon} and miss.',
    'The follow-up with the {weapon} goes wide.',
    'Off-hand {weapon} — nothing doing.',
  ],
  enemyBite: [
    'A bite breaks skin — infection +{inf}.',
    'Teeth punch through — infection +{inf}.',
    'The bite draws blood. Infection +{inf}.',
    'Skin tears under the bite — infection +{inf}.',
  ],
  oppHit: [
    'It catches you on the way out for {dmg}.',
    'A parting blow lands — {dmg} as you turn.',
    'You take {dmg} scrambling clear.',
  ],
  oppMiss: [
    'Its parting swing goes wide.',
    'The follow-up misses as you break.',
    'You slip the grab and keep moving.',
  ],
  fleeOk: [
    'You break away and escape into the streets.',
    'You put distance on it and vanish into cover.',
    'You wrench free and run — gone.',
    'You break contact and leave it behind.',
  ],
  fleeFail: [
    'You stumble — the {enemy} catches you for {dmg}.',
    'You lose your footing. The {enemy} lands {dmg}.',
    'Almost clear — the {enemy} drags you back for {dmg}.',
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(tpl: string, ctx: CombatFlavorCtx): string {
  return tpl
    .replace(/\{weapon\}/g, ctx.weapon ?? 'weapon')
    .replace(/\{enemy\}/g, ctx.enemy ?? 'enemy')
    .replace(/\{zone\}/g, ctx.zone ?? 'body')
    .replace(/\{place\}/g, ctx.place ?? 'the open')
    .replace(/\{dmg\}/g, String(ctx.dmg ?? '?'))
    .replace(/\{soak\}/g, String(ctx.soak ?? '0'))
    .replace(/\{soakNote\}/g, ctx.soakNote ?? '')
    .replace(/\{inf\}/g, String(ctx.inf ?? '?'))
    .replace(/\{stance\}/g, ctx.stance ?? '');
}

/** Pick a combat narrative line and fill tokens. */
export function combatLine(key: CombatFlavorKey, ctx: CombatFlavorCtx = {}): string {
  return fill(pick(POOLS[key]), ctx);
}

/** Player hit / crit / miss key from ranged flag. */
export function playerOutcomeKey(
  outcome: 'hit' | 'crit' | 'miss',
  ranged: boolean,
): CombatFlavorKey {
  if (outcome === 'crit') return ranged ? 'playerCritRanged' : 'playerCritMelee';
  if (outcome === 'miss') return ranged ? 'playerMissRanged' : 'playerMissMelee';
  return ranged ? 'playerHitRanged' : 'playerHitMelee';
}

/** Enemy narrative keys from kind. */
export function enemyKeys(kind: 'zombie' | 'human' | 'animal'): {
  roll: CombatFlavorKey;
  hit: CombatFlavorKey;
  crit: CombatFlavorKey;
  miss: CombatFlavorKey;
} {
  if (kind === 'human') {
    return {
      roll: 'enemyRollHuman',
      hit: 'enemyHitHuman',
      crit: 'enemyCritHuman',
      miss: 'enemyMissHuman',
    };
  }
  if (kind === 'animal') {
    return {
      roll: 'enemyRollAnimal',
      hit: 'enemyHitAnimal',
      crit: 'enemyCritAnimal',
      miss: 'enemyMissAnimal',
    };
  }
  return {
    roll: 'enemyRollZombie',
    hit: 'enemyHitZombie',
    crit: 'enemyCritZombie',
    miss: 'enemyMissZombie',
  };
}

/** Format optional soak suffix for hit lines. */
export function soakNote(soak: number, by: 'armour' | 'gear'): string {
  if (soak <= 0) return '';
  return by === 'armour' ? ` (${soak} soaked by armour)` : ` (${soak} stopped by gear)`;
}
