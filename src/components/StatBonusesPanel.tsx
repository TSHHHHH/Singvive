import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ATTRIBUTE_ICONS } from '../game/character';
import { Rng } from '../game/rng';
import {
  buildStatSheet,
  sheetRow,
  type SheetRow,
  type StatSheet,
} from '../game/statSheet';
import { useGame } from '../game/store';
import type { MeterModifier } from '../game/survival';
import { rollWeather, timeOfDay } from '../game/weather';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { itemName, traitName, useT } from '../i18n';
import type { LocaleId, TVars } from '../i18n';
import { STAT_LINE_ICONS } from './Inventory/itemStatLines';
import { StatCard, useStatFold } from './statFold';

const ROW_ICONS: Record<string, IconName> = {
  strength: ATTRIBUTE_ICONS.strength,
  dexterity: ATTRIBUTE_ICONS.dexterity,
  endurance: ATTRIBUTE_ICONS.endurance,
  perception: ATTRIBUTE_ICONS.perception,
  wits: ATTRIBUTE_ICONS.wits,
  attack: STAT_LINE_ICONS.atk,
  defence: STAT_LINE_ICONS.def,
  dodge: STAT_LINE_ICONS.dodge,
  damage: STAT_LINE_ICONS.dmg,
  maxHp: STAT_LINE_ICONS.hp,
  infectionResist: STAT_LINE_ICONS.inf,
  soak: STAT_LINE_ICONS.soak,
  statusResist: STAT_LINE_ICONS.status,
  block: STAT_LINE_ICONS.block,
  combatSpeed: STAT_LINE_ICONS.spd,
  travel: STAT_LINE_ICONS.travel,
  carry: STAT_LINE_ICONS.carry,
  encounters: STAT_LINE_ICONS.enc,
  hungerDrain: STAT_LINE_ICONS.food,
  thirstDrain: STAT_LINE_ICONS.thirst,
  energyDrain: STAT_LINE_ICONS.en,
  awareness: STAT_LINE_ICONS.aw,
};

const FLAG_ROWS = new Set(['nightVision', 'cannotDrop', 'bleedNoClot', 'showSearches']);

type TFn = (key: string, vars?: TVars) => string;

function signed(n: number, digits = 0): string {
  const v = digits ? Number(n.toFixed(digits)) : Math.round(n);
  if (v > 0) return `+${v}`;
  return `${v}`;
}

function formatPct(n: number): string {
  return `${signed(n * 100)}%`;
}

export function formatSheetTotal(row: SheetRow): string {
  if (FLAG_ROWS.has(row.id)) return '';
  switch (row.format) {
    case 'pct':
      return `${Math.round(row.total * 100)}%`;
    case 'mult':
      return `×${row.total.toFixed(2)}`;
    case 'kg':
      return `${row.total} kg`;
    default:
      return Number.isInteger(row.total) ? String(row.total) : row.total.toFixed(1);
  }
}

function formatSourceAmount(row: SheetRow, amount: number): string {
  if (FLAG_ROWS.has(row.id)) return '';
  if (row.format === 'pct' || row.format === 'mult') return formatPct(amount);
  if (row.format === 'kg') return `${signed(amount, 1)} kg`;
  return signed(amount, Number.isInteger(amount) ? 0 : 1);
}

export function useLiveStatSheet(): StatSheet | null {
  const snap = useGame(
    useShallow((s) => ({
      character: s.character,
      equipment: s.equipment,
      items: s.items,
      meters: s.meters,
      bodyParts: s.bodyParts,
      rounds: s.rounds,
      hour: s.hour,
      day: s.day,
      seed: s.seed,
    })),
  );
  return useMemo(() => {
    const { character, equipment, items, meters, bodyParts, rounds, hour, day, seed } = snap;
    if (!character) return null;
    return buildStatSheet({
      character,
      equipment,
      items,
      meters,
      bodyParts,
      rounds,
      weather: { kind: rollWeather(new Rng(seed), day), time: timeOfDay(hour) },
    });
  }, [snap]);
}

export interface SheetLine {
  label: string;
  amount: string;
  good: boolean;
}

export function sheetSourceLines(row: SheetRow, t: TFn, locale: LocaleId): SheetLine[] {
  return row.sources.map((src) => {
    let label: string;
    if (src.kind === 'trait') label = traitName(src.id, locale);
    else if (src.kind === 'item') label = itemName(src.defId, locale);
    else if (src.kind === 'attr') label = t(`ui.attributes.${src.attr}`);
    else label = t(`ui.sheet.source.${src.key}`);
    const amount = formatSourceAmount(row, src.amount);
    const good = src.amount === 0 ? true : row.good === false ? src.amount < 0 : src.amount > 0;
    return { label, amount, good };
  });
}

export function sheetLinesAsModifiers(lines: SheetLine[]): MeterModifier[] {
  return lines.map((l) => ({
    text: l.amount ? `${l.label} ${l.amount}` : l.label,
    good: l.good,
  }));
}

/** Value + chevron columns stay the same width on every line so totals line up with breakdowns. */
const VALUE_COL = 'w-[4.75rem] shrink-0 text-right tabular-nums whitespace-nowrap';
const CHEVRON_COL = 'w-3 shrink-0 text-center text-xs text-white/30';

function SheetStatRow({ row }: { row: SheetRow }) {
  const { locale, t } = useT();
  const fold = useStatFold();
  const icon = ROW_ICONS[row.id];
  const total = formatSheetTotal(row);
  const totalClass =
    row.good === true ? 'text-signal' : row.good === false ? 'text-hiss' : 'text-concrete-50';
  const lines = sheetSourceLines(row, t, locale);
  const foldable = lines.length > 0;
  const foldId = `row:${row.id}`;
  const open = foldable ? fold.isOpen(foldId) : false;

  const head = (
    <>
      <span className="w-6 shrink-0 text-center text-white/40">
        {icon ? <Icon name={icon} size={16} /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-white/55">
        {t(`ui.sheet.row.${row.id}`)}
      </span>
      <span className={`${VALUE_COL} text-sm font-bold ${totalClass}`}>{total}</span>
      <span className={CHEVRON_COL} aria-hidden>
        {foldable ? (open ? '▴' : '▾') : ''}
      </span>
    </>
  );

  return (
    <li>
      {foldable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => fold.toggle(foldId)}
          className="flex w-full items-center gap-2 rounded py-0.5 text-left hover:bg-white/5"
        >
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-2">{head}</div>
      )}
      {open && (
        <ul className="mt-0.5 flex flex-col gap-px">
          {lines.map((line) => (
            <li
              key={`${line.label}-${line.amount}`}
              className={`flex items-center gap-2 text-xs ${
                line.good ? 'text-signal/80' : 'text-hiss/90'
              }`}
            >
              <span className="w-6 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{line.label}</span>
              <span className={VALUE_COL}>{line.amount}</span>
              <span className={CHEVRON_COL} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Live bonuses and penalties on the Stats tab: each derived number and the
 * traits, gear, load, injuries, meters, and weather currently moving it.
 */
export function StatBonusesPanel() {
  const { t } = useT();
  const sheet = useLiveStatSheet();
  if (!sheet) return null;

  return (
    <>
      {sheet.groups.map((group) => (
        <StatCard key={group.id} title={t(`ui.sheet.group.${group.id}`)} foldable>
          <ul className="flex flex-col gap-2">
            {group.rows.map((r) => (
              <SheetStatRow key={r.id} row={r} />
            ))}
          </ul>
        </StatCard>
      ))}
    </>
  );
}

export { sheetRow };
