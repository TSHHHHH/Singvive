import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Rng } from '../game/rng';
import {
  buildStatSheet,
  type SheetRow,
  type StatSheet,
} from '../game/statSheet';
import { useGame } from '../game/store';
import type { MeterModifier } from '../game/survival';
import { rollWeather, timeOfDay } from '../game/weather';
import { itemName, traitName } from '../i18n';
import type { LocaleId, TVars } from '../i18n';

export const FLAG_ROWS: ReadonlySet<string> = new Set(['nightVision', 'cannotDrop', 'bleedNoClot', 'showSearches']);

type TFn = (key: string, vars?: TVars) => string;

function signed(n: number, digits = 0): string {
  const v = digits ? Number(n.toFixed(digits)) : Math.round(n);
  if (v > 0) return `+${v}`;
  return `${v}`;
}

function formatPct(n: number): string {
  return `${signed(n * 100)}%`;
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
      hour: s.hour,
      day: s.day,
      seed: s.seed,
    })),
  );
  return useMemo(() => {
    const { character, equipment, items, meters, bodyParts, hour, day, seed } = snap;
    if (!character) return null;
    return buildStatSheet({
      character,
      equipment,
      items,
      meters,
      bodyParts,
      weather: { kind: rollWeather(new Rng(seed), day), time: timeOfDay(hour) },
    });
  }, [snap]);
}

interface SheetLine {
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
