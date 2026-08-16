import { itemDef } from '../../game/loot';
import { effectiveDamage, equipDefenseBonus } from '../../game/inventory';
import type { Equipment, ItemInstance } from '../../game/types';
import type { IconName } from '../../icons/keys';

export function itemKind(def: ReturnType<typeof itemDef>): string {
  if (def.slot) return def.effect.kind === 'weapon' ? 'Weapon' : 'Armour';
  switch (def.effect.kind) {
    case 'food':
      return 'Food';
    case 'water':
      return 'Drink';
    case 'heal':
      return 'Medical';
    case 'cure':
      return 'Medical';
    case 'energy':
      return 'Stimulant';
    case 'fuel':
      return 'Fuel';
    default:
      return 'Misc';
  }
}

/** Icon for each inspect-row resource / combat affix. */
export const STAT_LINE_ICONS: Record<string, IconName> = {
  dmg: 'item.weaponMelee',
  def: 'slot.offHand',
  soak: 'slot.body',
  status: 'status.bleeding',
  atk: 'choice.fight',
  acc: 'attr.perception',
  spd: 'attr.dexterity',
  dodge: 'attr.dexterity',
  travel: 'action.travel',
  enc: 'combat.encounter',
  carry: 'slot.bag',
  bag: 'slot.bag',
  aw: 'attr.perception',
  food: 'meter.hunger',
  thirst: 'meter.thirst',
  en: 'meter.energy',
  hp: 'meter.health',
  inf: 'meter.infection',
  fuel: 'item.fuel',
  val: 'stat.value',
};

export type StatLine = {
  key: string;
  label: string;
  value: string;
  icon: IconName;
  delta?: 'up' | 'down' | 'new';
};

function line(
  key: string,
  label: string,
  value: string,
  delta?: 'up' | 'down' | 'new',
): StatLine {
  return {
    key,
    label,
    value,
    icon: STAT_LINE_ICONS[key] ?? 'item.misc',
    delta,
  };
}

/**
 * Inspect rows with optional compare vs the piece currently in the same slot.
 * ▲ better · ＋ new affix · ▼ worse.
 */
export function itemStatLines(
  def: ReturnType<typeof itemDef>,
  inst: ItemInstance,
  equipment: Equipment,
): StatLine[] {
  const lines: StatLine[] = [];
  const e = def.effect;
  const compare =
    def.slot && equipment[def.slot]?.uid !== inst.uid ? equipment[def.slot] : null;
  const cmpDef = compare ? itemDef(compare.defId) : null;
  const cmpM = cmpDef?.modifiers ?? {};
  const m = def.modifiers ?? {};

  const numDelta = (mine: number, theirs: number | undefined): 'up' | 'down' | 'new' | undefined => {
    // No compare target (e.g. hovering the worn piece itself) → never show ▲/▼/＋.
    if (!compare) return undefined;
    if (theirs === undefined || theirs === 0) return mine !== 0 ? 'new' : undefined;
    if (mine > theirs) return 'up';
    if (mine < theirs) return 'down';
    return undefined;
  };

  if (e.kind === 'weapon') {
    const dmg = effectiveDamage(inst);
    const theirs = compare ? effectiveDamage(compare) : undefined;
    lines.push(
      line(
        'dmg',
        'Damage',
        dmg === e.damage ? `${dmg}` : `${dmg} (of ${e.damage})`,
        theirs !== undefined ? numDelta(dmg, theirs) : undefined,
      ),
    );
  }
  if (m.defenseBonus) {
    const v = equipDefenseBonus(inst);
    lines.push(
      line('def', 'Defence', `+${v}`, numDelta(v, compare ? equipDefenseBonus(compare) : undefined)),
    );
  }
  if (m.limbArmor) {
    lines.push(line('soak', 'Soak', `${m.limbArmor}`, numDelta(m.limbArmor, cmpM.limbArmor)));
  }
  if (m.statusResist) {
    lines.push(
      line(
        'status',
        'Status resist',
        `${Math.round(m.statusResist * 100)}%`,
        numDelta(m.statusResist, cmpM.statusResist),
      ),
    );
  }
  if (m.attackBonus) {
    lines.push(
      line(
        'atk',
        'Attack',
        `${m.attackBonus > 0 ? '+' : ''}${m.attackBonus}`,
        numDelta(m.attackBonus, cmpM.attackBonus),
      ),
    );
  }
  if (m.accuracyBonus) {
    lines.push(
      line('acc', 'Accuracy', `+${m.accuracyBonus}`, numDelta(m.accuracyBonus, cmpM.accuracyBonus)),
    );
  }
  if (m.speedBonus) {
    lines.push(
      line(
        'spd',
        'Speed',
        `+${m.speedBonus.toFixed(1)}`,
        numDelta(m.speedBonus, cmpM.speedBonus),
      ),
    );
  }
  if (m.dodgeBonus) {
    lines.push(
      line(
        'dodge',
        'Dodge',
        `${m.dodgeBonus > 0 ? '+' : ''}${Math.round(m.dodgeBonus * 100)}%`,
        numDelta(m.dodgeBonus, cmpM.dodgeBonus),
      ),
    );
  }
  if (m.travelSpeedBonus) {
    lines.push(
      line(
        'travel',
        'Travel',
        `${m.travelSpeedBonus > 0 ? '+' : ''}${Math.round(m.travelSpeedBonus * 100)}%`,
        numDelta(m.travelSpeedBonus, cmpM.travelSpeedBonus),
      ),
    );
  }
  if (m.encounterChanceMod) {
    lines.push(
      line(
        'enc',
        'Encounters',
        `${m.encounterChanceMod > 0 ? '+' : ''}${Math.round(m.encounterChanceMod * 100)}%`,
        numDelta(
          -m.encounterChanceMod,
          cmpM.encounterChanceMod ? -cmpM.encounterChanceMod : undefined,
        ),
      ),
    );
  }
  if (m.weightCapacityBonus) {
    lines.push(
      line(
        'carry',
        'Carry',
        `+${m.weightCapacityBonus} kg`,
        numDelta(m.weightCapacityBonus, cmpM.weightCapacityBonus),
      ),
    );
  }
  if (m.bagWidthBonus || m.bagHeightBonus) {
    lines.push(
      line(
        'bag',
        'Pack size',
        `+${m.bagWidthBonus ?? 0} col${m.bagHeightBonus ? ` +${m.bagHeightBonus} row` : ''}`,
        numDelta(
          (m.bagWidthBonus ?? 0) + (m.bagHeightBonus ?? 0) * 10,
          (cmpM.bagWidthBonus ?? 0) + (cmpM.bagHeightBonus ?? 0) * 10,
        ),
      ),
    );
  }
  if (m.awarenessMod) {
    lines.push(
      line('aw', 'Awareness', `+${m.awarenessMod}`, numDelta(m.awarenessMod, cmpM.awarenessMod)),
    );
  }

  if (lines.length === 0) {
    switch (e.kind) {
      case 'food':
        lines.push(line('food', 'Hunger', `+${e.hunger}`));
        if (e.thirst != null) lines.push(line('thirst', 'Thirst', `+${e.thirst}`));
        if (e.energy != null) lines.push(line('en', 'Energy', `+${e.energy}`));
        break;
      case 'water':
        lines.push(line('thirst', 'Thirst', `+${e.thirst}`));
        if (e.hunger != null) lines.push(line('food', 'Hunger', `+${e.hunger}`));
        if (e.energy != null) lines.push(line('en', 'Energy', `+${e.energy}`));
        break;
      case 'heal':
        lines.push(line('hp', 'Heal', `+${e.health} HP`));
        break;
      case 'cure':
        lines.push(line('inf', 'Cure', `−${e.infection}`));
        break;
      case 'energy':
        lines.push(line('en', 'Energy', `+${e.energy}`));
        if (e.hunger != null) lines.push(line('food', 'Hunger', `+${e.hunger}`));
        if (e.thirst != null) lines.push(line('thirst', 'Thirst', `+${e.thirst}`));
        break;
      case 'fuel':
        lines.push(line('fuel', 'Fuel', 'Evac weight'));
        break;
      default:
        lines.push(line('val', 'Curiosity', 'scrap / trade'));
    }
  }
  return lines;
}

export function isConsumableUsable(def: ReturnType<typeof itemDef>): boolean {
  return (
    def.effect.kind !== 'misc' &&
    def.effect.kind !== 'weapon' &&
    def.effect.kind !== 'fuel'
  );
}
