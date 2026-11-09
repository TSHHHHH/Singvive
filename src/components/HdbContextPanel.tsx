import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { sumTraitMod } from '../game/character';
import { useGame } from '../game/store';
import {
  breachOutcome,
  currentFloor,
  ENTRY_META,
  encounterChanceKnown,
  encounterChanceReadout,
  FOB_MINUTES,
  hasFob,
  heatBandAfter,
  isVoidDeckFloor,
  levelBand,
  levelHeat,
  LOCKPICK_ID,
  PICK_MINUTES,
  ROOF_FOB,
  ROOF_HATCH_HEAT,
  ROOF_HATCH_MINUTES,
  roofHatchLevel,
  scaleDoorCost,
  SERVICE_ICON,
  SERVICE_LABEL,
  SHELTER_HEAT_DROP,
  SHELTER_HOURS,
  storeyLabel,
  THEME_META,
  UNIT_META,
  type HdbDungeon,
} from '../game/hdbDungeon';
import { msgOr, useT, type LocaleId, type TVars } from '../i18n';
import { HeatMeter } from './HdbLevelStrips';
import { useIsPhoneLayout } from './useIsPhoneLayout';
import { tip } from './tips';

const CONTAINER_ICON: Record<string, IconName> = {
  Medical: 'meter.infection',
  Food: 'meter.hunger',
  Tool: 'action.craft',
  Valuables: 'stat.value',
  Fob: 'item.lockpick',
};

/** Storey tooltip for the landing you stand on, with its theme if it has one. */
function landingTip(
  hdb: HdbDungeon,
  t: (key: string, vars?: TVars) => string,
  locale: LocaleId,
): string {
  const base = t('ui.hdb.storey', { nn: storeyLabel(hdb, hdb.currentLevel) });
  const theme = currentFloor(hdb).theme;
  if (!theme || theme === 'ordinary') return base;
  const label = msgOr(`ui.hdb.theme.${theme}.label`, THEME_META[theme].label, undefined, locale);
  const blurb = msgOr(`ui.hdb.theme.${theme}.blurb`, THEME_META[theme].blurb, undefined, locale);
  return `${base} · ${label}: ${blurb}`;
}

function ScoutTile({
  label,
  tip: tipText,
  unread,
  children,
}: {
  label: string;
  tip: string;
  unread?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      {...tip(tipText)}
      className={`flex w-full min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded border px-2 py-1.5 text-center ${
        unread
          ? 'border-concrete-700/80 bg-concrete-950/40 text-concrete-500'
          : 'border-white/15 bg-concrete-900/60 text-concrete-100'
      }`}
    >
      <div className="flex min-h-[1.25rem] max-w-full items-center justify-center text-body font-semibold leading-tight">
        {children}
      </div>
      <span className="text-label uppercase text-concrete-500">{label}</span>
    </div>
  );
}

/**
 * The HDB action card: the room picked on your landing strip (scout tiles plus
 * Force / Pick / search / rest / read / service), else a landing summary and,
 * below the roof, the hatch. `full` for the desktop here card and the phone
 * strips dock; `compact` for the phone timeline foot. Leave lives on the status
 * dock in {@link HdbDungeonModal}; compact keeps one for when the Log tab hides it.
 */
export function HdbContextPanel({
  variant = 'full',
}: {
  variant?: 'full' | 'compact';
}) {
  const { locale, t } = useT();
  const hdb = useGame((s) => s.hdb);
  const character = useGame((s) => s.character);
  const items = useGame((s) => s.items);
  const pendingSearch = useGame((s) => s.pendingSearch);
  const selUnit = useGame((s) => s.hdbSelUnit);
  const hdbBreach = useGame((s) => s.hdbBreach);
  const hdbPick = useGame((s) => s.hdbPick);
  const hdbUseService = useGame((s) => s.hdbUseService);
  const hdbUseShelter = useGame((s) => s.hdbUseShelter);
  const hdbReadNotice = useGame((s) => s.hdbReadNotice);
  const hdbOpenRoof = useGame((s) => s.hdbOpenRoof);
  const hdbLeave = useGame((s) => s.hdbLeave);
  const isPhone = useIsPhoneLayout();

  if (!hdb || !character) return null;

  const floor = currentFloor(hdb);
  const sel = (selUnit && floor.units.find((u) => u.id === selUnit && u.available)) || null;
  const doorStatus = sel
    ? sel.state === 'cleared'
      ? t('ui.hdb.doorCleared')
      : msgOr(`ui.hdb.entry.${sel.entry}.label`, ENTRY_META[sel.entry].label, undefined, locale)
    : null;

  if (variant === 'compact') {
    const canLeave = hdb.currentLevel === 1 && !pendingSearch;
    const leaveTitle = pendingSearch
      ? t('ui.hdb.leaveNeedSearch')
      : hdb.currentLevel !== 1
          ? t('ui.hdb.leaveNeedVoidDeck')
          : undefined;
    return (
      <div className="space-y-2 text-body">
        <p className="text-concrete-300">{t('ui.hdb.compactHint')}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => hdbLeave()}
            disabled={!canLeave}
            {...tip(leaveTitle)}
            className="rounded border border-white/15 px-2.5 py-1 text-body text-concrete-300 hover:bg-white/5 disabled:opacity-40"
          >
            {t('ui.hdb.leaveBlock')}
          </button>
        </div>
      </div>
    );
  }

  const containerUnread = !sel?.scoutedInfo?.containerCategory;
  const selVerb = sel ? UNIT_META[sel.type].verb : null;
  const showEncounter =
    selVerb === 'search' || selVerb === 'hazard' || selVerb === 'burn';
  const encounter =
    sel && showEncounter
      ? encounterChanceReadout(
          breachOutcome(hdb, sel, hdb.currentLevel).encounterChance,
          encounterChanceKnown(sel),
        )
      : null;

  const forceOpts = {
    heatMult: sumTraitMod(character.traitIds, 'hdbDoorHeatMult'),
    minutesMult: sumTraitMod(character.traitIds, 'hdbBreachMinutesMult'),
    crowbar: items.some((i) => i.container === 'backpack' && i.defId === 'crowbar'),
  };
  const lockpickCount = items
    .filter((i) => i.container === 'backpack' && i.defId === LOCKPICK_ID)
    .reduce((n, i) => n + i.stack, 0);

  const heatWarn = (add: number) => {
    const band = heatBandAfter(levelHeat(hdb, hdb.currentLevel), add);
    if (!band) return '';
    const note = msgOr(`ui.hdb.heatBand.${band.label}.note`, band.note, undefined, locale);
    return t('ui.hdb.heatCross', { note });
  };

  const busy = !!pendingSearch;
  const hatchHere = !hdb.roofOpen && roofHatchLevel(hdb) === hdb.currentLevel;
  const hatchCost = scaleDoorCost(ROOF_HATCH_MINUTES, ROOF_HATCH_HEAT, forceOpts);
  const hatchActions = hatchHere ? (
    <div className="flex flex-col gap-1">
      <p className="text-body text-concrete-400">{t('ui.hdb.hatchBlurb')}</p>
      {hasFob(hdb, ROOF_FOB) && (
        <button
          type="button"
          onClick={() => hdbOpenRoof('fob')}
          disabled={busy}
          className="min-h-[44px] w-full rounded border border-signal/60 bg-signal/15 px-3 py-2 text-body text-signal hover:bg-signal/25 disabled:opacity-40 lg:min-h-0 lg:py-1.5"
        >
          {t('ui.hdb.hatchFob', { min: FOB_MINUTES })}
        </button>
      )}
      <button
        type="button"
        onClick={() => hdbOpenRoof('force')}
        disabled={busy}
        className="min-h-[44px] w-full rounded border border-hiss/60 bg-hiss/15 px-3 py-2 text-body text-hiss hover:bg-hiss/25 disabled:opacity-40 lg:min-h-0 lg:py-1.5"
      >
        {t('ui.hdb.hatchForce', {
          min: Math.round(hatchCost.minutes),
          heat: hatchCost.heat,
        })}
        {heatWarn(hatchCost.heat)}
      </button>
    </div>
  ) : null;

  const levelNn = storeyLabel(hdb, hdb.currentLevel);
  const placeTitle = sel
    ? sel.label
    : isVoidDeckFloor(floor) && floor.units.length === 0
      ? t('ui.hdb.voidDeck')
      : t('ui.hdb.level', { nn: levelNn });
  const placeStatus = sel ? doorStatus : null;

  const placeHeader = (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="truncate text-body font-semibold tabular-nums tracking-wide text-concrete-50">
        {placeTitle}
      </span>
      {placeStatus && (
        <span className="shrink-0 text-plate uppercase text-concrete-400">
          {placeStatus}
        </span>
      )}
    </div>
  );

  const unitLabel = sel
    ? msgOr(`ui.hdb.unit.${sel.type}.label`, UNIT_META[sel.type].label, undefined, locale)
    : '';
  const unitBlurb = sel
    ? msgOr(`ui.hdb.unit.${sel.type}.blurb`, UNIT_META[sel.type].blurb, undefined, locale)
    : '';

  const scoutColumn = sel ? (
    <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-start gap-1.5 self-stretch sm:w-[8.5rem]">
      {selVerb === 'fight' && (
        <ScoutTile
          label={t('ui.hdb.scoutEncounter')}
          tip={
            sel?.type === 'den'
              ? t('ui.hdb.scoutDenFight')
              : t('ui.hdb.scoutNestFight')
          }
        >
          <span className="text-hiss">{t('ui.hdb.scoutFight')}</span>
        </ScoutTile>
      )}
      {encounter && (
        <ScoutTile
          label={t('ui.hdb.scoutEncounter')}
          tip={
            encounter.exact
              ? t('ui.hdb.scoutEncounterExact')
              : t('ui.hdb.scoutEncounterEstimate')
          }
        >
          <span className={encounter.pct >= 50 ? 'text-hiss' : 'text-signal'}>
            {encounter.label}
          </span>
        </ScoutTile>
      )}

      <ScoutTile label={t('ui.hdb.scoutRoom')} tip={unitBlurb}>
        <span className="inline-flex max-w-full items-center gap-0.5 text-body text-concrete-200">
          <Icon name={UNIT_META[sel.type].icon} size={12} />
          <span className="truncate">{unitLabel}</span>
        </span>
      </ScoutTile>

      <ScoutTile
        label={t('ui.hdb.scoutContainers')}
        tip={
          sel.scoutedInfo?.containerCategory
            ? `${msgOr(
                `ui.hdb.container.${sel.scoutedInfo.containerCategory}`,
                sel.scoutedInfo.containerCategory,
                undefined,
                locale,
              )} · ${sel.scoutedInfo.lootQuality}`
            : t('ui.hdb.scoutContainersUnread')
        }
        unread={containerUnread}
      >
        {sel.scoutedInfo?.containerCategory ? (
          <span className="inline-flex max-w-full items-center gap-0.5 text-astral">
            <Icon
              name={
                CONTAINER_ICON[sel.scoutedInfo.containerCategory] ?? 'action.inventory'
              }
              size={12}
            />
            <span className="truncate text-body">
              {msgOr(
                `ui.hdb.container.${sel.scoutedInfo.containerCategory}`,
                sel.scoutedInfo.containerCategory,
                undefined,
                locale,
              )}
            </span>
          </span>
        ) : (
          <span className="text-concrete-500">?</span>
        )}
      </ScoutTile>
    </div>
    ) : null;

  const entryVerb = sel
    ? msgOr(`ui.hdb.entry.${sel.entry}.verb`, ENTRY_META[sel.entry].verb, undefined, locale)
    : '';
  const outcome = sel ? breachOutcome(hdb, sel, hdb.currentLevel) : null;
  const smash = sel ? sel.entry === 'locked' || sel.entry === 'barricaded' : false;
  const scaledDoor =
    sel && outcome && smash
      ? scaleDoorCost(outcome.minutes, outcome.heat, forceOpts)
      : outcome
        ? { minutes: outcome.minutes, heat: selVerb === 'fight' ? 0 : outcome.heat }
        : null;
  const doorMins = scaledDoor ? Math.round(scaledDoor.minutes) : 0;
  const doorHeat = scaledDoor
    ? selVerb === 'fight'
      ? 0
      : scaledDoor.heat
    : 0;
  const heatBit =
    doorHeat > 0 ? t('ui.hdb.heatPlus', { n: doorHeat }) : t('ui.hdb.quiet');
  const doorWarn = doorHeat > 0 ? heatWarn(doorHeat) : '';

  const doorButtons = sel ? (
    sel.state === 'cleared' ? (
      <span className="text-body text-concrete-400">
        {t('ui.hdb.unitClearedBlurb')}
      </span>
    ) : selVerb === 'service' && sel.service ? (
      <button
        type="button"
        onClick={() => hdbUseService(sel.id)}
        disabled={busy}
        className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-body font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
      >
        <Icon name={SERVICE_ICON[sel.service]} />{' '}
        {msgOr(`ui.hdb.service.${sel.service}`, SERVICE_LABEL[sel.service], undefined, locale)}
      </button>
    ) : selVerb === 'intel' ? (
      <button
        type="button"
        onClick={() => hdbReadNotice(sel.id)}
        disabled={busy}
        className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-body font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
      >
        <Icon name="hdb.notice" /> {t('ui.hdb.readNotice', { min: 15 })}
      </button>
    ) : selVerb === 'rest' && sel.state === 'breached' ? (
      <button
        type="button"
        onClick={() => hdbUseShelter(sel.id)}
        disabled={busy}
        className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-body font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
      >
        <Icon name="hdb.shelter" />{' '}
        {t('ui.hdb.restShelter', { h: SHELTER_HOURS, heat: SHELTER_HEAT_DROP })}
      </button>
    ) : (
      <div className="flex flex-col gap-1">
        {sel.entry === 'locked' && sel.state !== 'breached' && (
          <button
            type="button"
            onClick={() => hdbPick(sel.id)}
            disabled={busy || lockpickCount < 1}
            className="min-h-[44px] w-full rounded border border-signal/50 bg-signal/10 px-3 py-2 text-body font-bold text-signal hover:bg-signal/20 disabled:opacity-30 lg:min-h-0 lg:py-1.5"
          >
            <Icon name="item.lockpick" />{' '}
            {lockpickCount < 1
              ? t('ui.hdb.pickNeed')
              : t('ui.hdb.pickLine', { min: PICK_MINUTES })}
          </button>
        )}
        {sel.state !== 'breached' && (
          <button
            type="button"
            onClick={() => hdbBreach(sel.id)}
            disabled={busy}
            className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-body font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
          >
            <Icon name={doorHeat > 0 ? 'hdb.breach' : 'hdb.unit'} />{' '}
            {t('ui.hdb.breachLine', {
              verb: entryVerb,
              min: doorMins,
              heat: heatBit,
            })}
            {doorWarn}
          </button>
        )}
      </div>
    )
  ) : null;

  const here = hdb.currentLevel;
  const hereHeat = levelHeat(hdb, here);
  const hereBand = levelBand(hdb, here);
  const roomsLeft = floor.units.filter((u) => u.available && u.state !== 'cleared').length;
  const levelSummary = (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-micro uppercase text-concrete-400">
        <span>
          {msgOr(`ui.hdb.heatBand.${hereBand.label}.label`, hereBand.label, undefined, locale)}{' '}
          <span className="tabular-nums">{Math.round(hereHeat)}</span>
        </span>
        <HeatMeter heat={hereHeat} className="w-16" />
        {floor.units.length > 0 && (
          <span className="tabular-nums">{t('ui.hdb.roomsLeft', { n: roomsLeft })}</span>
        )}
      </div>
      <p className="text-body text-concrete-400" {...tip(landingTip(hdb, t, locale))}>
        {floor.units.length === 0
          ? isVoidDeckFloor(floor)
            ? t('ui.hdb.voidHint')
            : t('ui.hdb.noDoorsHint')
          : isPhone
            ? t('ui.hdb.levelHintPhone')
            : t('ui.hdb.levelHint')}
      </p>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <div className="space-y-2 px-3 pb-2 pt-1 lg:px-0 lg:pt-0">
        <div className="flex items-stretch gap-2">
          {scoutColumn}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {placeHeader}
            {sel ? doorButtons : levelSummary}
            {!sel && hatchActions}
          </div>
        </div>
      </div>
    </div>
  );
}
