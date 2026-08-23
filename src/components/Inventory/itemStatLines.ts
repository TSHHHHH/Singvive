import { itemDef } from '../../game/loot';
import { effectiveDamage, equipDefenseBonus, scaledRestore } from '../../game/inventory';
import { weaponSpeedFactor } from '../../game/combat';
import { packGridUsableCount, resolveItemPackGrid } from '../../game/packGrid';
import type { Equipment, ItemInstance } from '../../game/types';
import type { IconName } from '../../icons/keys';
import type { TVars } from '../../i18n';

export type TranslateFn = (key: string, vars?: TVars) => string;

export function itemKind(def: ReturnType<typeof itemDef>, t: TranslateFn): string {
  if (def.slot) return def.effect.kind === 'weapon' ? t('ui.itemKind.weapon') : t('ui.itemKind.armour');
  switch (def.effect.kind) {
    case 'food':
      return t('ui.itemKind.food');
    case 'water':
      return t('ui.itemKind.drink');
    case 'heal':
      return t('ui.itemKind.medical');
    case 'cure':
      return t('ui.itemKind.medical');
    case 'energy':
      return t('ui.itemKind.stimulant');
    case 'fuel':
      return t('ui.itemKind.fuel');
    default:
      return t('ui.itemKind.misc');
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
  block: 'slot.offHand',
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
  t: TranslateFn,
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
        t('ui.stats.damage'),
        dmg === e.damage
          ? `${dmg}`
          : t('ui.stats.damageOf', { dmg, base: e.damage }),
        theirs !== undefined ? numDelta(dmg, theirs) : undefined,
      ),
    );
    const mySpd = weaponSpeedFactor(e, !!def.twoHanded);
    const theirSpd =
      cmpDef?.effect.kind === 'weapon'
        ? weaponSpeedFactor(cmpDef.effect, !!cmpDef.twoHanded)
        : undefined;
    lines.push(
      line(
        'spd',
        t('ui.stats.speed'),
        `×${mySpd.toFixed(2)}`,
        theirSpd !== undefined ? numDelta(mySpd, theirSpd) : undefined,
      ),
    );
  }
  if (m.defenseBonus) {
    const v = equipDefenseBonus(inst);
    lines.push(
      line(
        'def',
        t('ui.stats.defence'),
        `+${v}`,
        numDelta(v, compare ? equipDefenseBonus(compare) : undefined),
      ),
    );
  }
  if (m.limbArmor) {
    lines.push(
      line('soak', t('ui.stats.soak'), `${m.limbArmor}`, numDelta(m.limbArmor, cmpM.limbArmor)),
    );
  }
  if (m.statusResist) {
    lines.push(
      line(
        'status',
        t('ui.stats.statusResist'),
        `${Math.round(m.statusResist * 100)}%`,
        numDelta(m.statusResist, cmpM.statusResist),
      ),
    );
  }
  if (m.attackBonus) {
    lines.push(
      line(
        'atk',
        t('ui.stats.attack'),
        `${m.attackBonus > 0 ? '+' : ''}${m.attackBonus}`,
        numDelta(m.attackBonus, cmpM.attackBonus),
      ),
    );
  }
  if (m.accuracyBonus) {
    lines.push(
      line(
        'acc',
        t('ui.stats.accuracy'),
        `+${m.accuracyBonus}`,
        numDelta(m.accuracyBonus, cmpM.accuracyBonus),
      ),
    );
  }
  if (m.speedBonus) {
    lines.push(
      line(
        'spd',
        t('ui.stats.speed'),
        `${m.speedBonus > 0 ? '+' : ''}${m.speedBonus.toFixed(1)}`,
        numDelta(m.speedBonus, cmpM.speedBonus),
      ),
    );
  }
  if (m.blockChance) {
    lines.push(
      line(
        'block',
        t('ui.stats.block'),
        `${Math.round(m.blockChance * 100)}%`,
        numDelta(m.blockChance, cmpM.blockChance),
      ),
    );
  }
  if (m.dodgeBonus) {
    lines.push(
      line(
        'dodge',
        t('ui.stats.dodge'),
        `${m.dodgeBonus > 0 ? '+' : ''}${Math.round(m.dodgeBonus * 100)}%`,
        numDelta(m.dodgeBonus, cmpM.dodgeBonus),
      ),
    );
  }
  if (m.travelSpeedBonus) {
    lines.push(
      line(
        'travel',
        t('ui.stats.travel'),
        `${m.travelSpeedBonus > 0 ? '+' : ''}${Math.round(m.travelSpeedBonus * 100)}%`,
        numDelta(m.travelSpeedBonus, cmpM.travelSpeedBonus),
      ),
    );
  }
  if (m.encounterChanceMod) {
    lines.push(
      line(
        'enc',
        t('ui.stats.encounters'),
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
        t('ui.stats.carry'),
        `+${m.weightCapacityBonus} kg`,
        numDelta(m.weightCapacityBonus, cmpM.weightCapacityBonus),
      ),
    );
  }
  if (def.slot === 'bag') {
    const grid = resolveItemPackGrid(def);
    if (grid) {
      const n = packGridUsableCount(grid);
      const cmpGrid = cmpDef?.slot === 'bag' ? resolveItemPackGrid(cmpDef) : undefined;
      const cmpN = cmpGrid ? packGridUsableCount(cmpGrid) : undefined;
      lines.push(
        line(
          'bag',
          t('ui.stats.pack'),
          t('ui.stats.packCells', { n, w: grid.w, h: grid.h }),
          cmpN !== undefined ? numDelta(n, cmpN) : undefined,
        ),
      );
    }
  }
  if (m.awarenessMod) {
    lines.push(
      line(
        'aw',
        t('ui.stats.awareness'),
        `+${m.awarenessMod}`,
        numDelta(m.awarenessMod, cmpM.awarenessMod),
      ),
    );
  }

  if (lines.length === 0) {
    // Consumables print what this instance actually gives, with the pristine
    // figure in brackets when freshness has eaten into it — same shape as a
    // worn weapon's damage row.
    const restore = (base: number): string => {
      const v = scaledRestore(inst, base);
      return v === base ? `+${v}` : t('ui.stats.restoreOf', { n: `+${v}`, base });
    };
    switch (e.kind) {
      case 'food':
        lines.push(line('food', t('ui.stats.hunger'), restore(e.hunger)));
        if (e.thirst != null) lines.push(line('thirst', t('ui.stats.thirst'), restore(e.thirst)));
        if (e.energy != null) lines.push(line('en', t('ui.stats.energy'), restore(e.energy)));
        break;
      case 'water':
        lines.push(line('thirst', t('ui.stats.thirst'), restore(e.thirst)));
        if (e.hunger != null) lines.push(line('food', t('ui.stats.hunger'), restore(e.hunger)));
        if (e.energy != null) lines.push(line('en', t('ui.stats.energy'), restore(e.energy)));
        break;
      case 'heal':
        lines.push(
          line('hp', t('ui.stats.heal'), t('ui.stats.healHp', { n: scaledRestore(inst, e.health) })),
        );
        break;
      case 'cure':
        lines.push(line('inf', t('ui.stats.cure'), `−${scaledRestore(inst, e.infection)}`));
        break;
      case 'energy':
        lines.push(line('en', t('ui.stats.energy'), restore(e.energy)));
        if (e.hunger != null) lines.push(line('food', t('ui.stats.hunger'), restore(e.hunger)));
        if (e.thirst != null) lines.push(line('thirst', t('ui.stats.thirst'), restore(e.thirst)));
        break;
      case 'fuel':
        lines.push(line('fuel', t('ui.stats.fuel'), t('ui.stats.fuelEvac')));
        break;
      default:
        lines.push(line('val', t('ui.stats.curiosity'), t('ui.stats.curiosityScrap')));
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
