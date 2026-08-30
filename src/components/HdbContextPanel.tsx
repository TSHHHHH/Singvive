import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { sumTraitMod } from '../game/character';
import { useGame } from '../game/store';
import {
  adjacentBreakableBlocks,
  adjacentEdgeBlocks,
  BLOCK_META,
  breachOutcome,
  currentFloor,
  descentIsChecked,
  ENTRY_META,
  encounterChanceKnown,
  encounterChanceReadout,
  FOB_MINUTES,
  hasFob,
  heatBandAfter,
  isVoidDeckFloor,
  LOCKPICK_ID,
  PICK_MINUTES,
  retreatFailChance,
  scaleDoorCost,
  SERVICE_ICON,
  SERVICE_LABEL,
  SHELTER_HEAT_DROP,
  SHELTER_HOURS,
  UNIT_META,
  type HdbDungeon,
  type HdbUnitNode,
} from '../game/hdbDungeon';
import { msgOr, useT } from '../i18n';
import { useIsPhoneLayout } from './HdbZoomViewport';
import { tip } from './tips';

const CONTAINER_ICON: Record<string, IconName> = {
  Medical: 'meter.infection',
  Food: 'meter.hunger',
  Tool: 'action.craft',
  Valuables: 'stat.value',
  Fob: 'item.lockpick',
};

/** Unit under the player on the current floor, if any. */
export function unitUnderfoot(hdb: HdbDungeon): HdbUnitNode | null {
  const floor = currentFloor(hdb);
  return (
    floor.units.find((u) => u.column === hdb.pos.column && u.available) ?? null
  );
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
      <div className="flex min-h-[1.25rem] max-w-full items-center justify-center text-xs font-semibold leading-tight">
        {children}
      </div>
      <span className="text-2xs uppercase tracking-wider text-concrete-500">{label}</span>
    </div>
  );
}

/**
 * Consolidated HDB attention surface: unit/breach, scout tiles.
 * `full` for desktop rail + phone cutaway dock; `compact` for phone timeline foot.
 * Leave lives on the status dock in {@link HdbDungeonModal}; compact keeps a Leave
 * for when the Log tab hides the cutaway. Sense odds / symbol key expand from that dock.
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
  const hdbWalk = useGame((s) => s.hdbWalk);
  const hdbBreach = useGame((s) => s.hdbBreach);
  const hdbPick = useGame((s) => s.hdbPick);
  const hdbUseService = useGame((s) => s.hdbUseService);
  const hdbUseShelter = useGame((s) => s.hdbUseShelter);
  const hdbReadNotice = useGame((s) => s.hdbReadNotice);
  const hdbForceBlock = useGame((s) => s.hdbForceBlock);
  const hdbUnlockGate = useGame((s) => s.hdbUnlockGate);
  const hdbLeave = useGame((s) => s.hdbLeave);
  const isPhone = useIsPhoneLayout();

  if (!hdb || !character) return null;

  const walking = !!hdbWalk;
  const floor = currentFloor(hdb);
  const clearable = adjacentBreakableBlocks(hdb);
  const impassable = adjacentEdgeBlocks(hdb).filter((e) => !e.block.breakable);
  const sel =
    floor.units.find((u) => u.column === hdb.pos.column && u.available) ?? null;
  const doorStatus = sel
    ? sel.state === 'cleared'
      ? t('ui.hdb.doorCleared')
      : msgOr(`ui.hdb.entry.${sel.entry}.label`, ENTRY_META[sel.entry].label, undefined, locale)
    : null;

  if (variant === 'compact') {
    const canLeave = hdb.currentLevel === 1 && !pendingSearch && !walking;
    const leaveTitle = pendingSearch
      ? t('ui.hdb.leaveNeedSearch')
      : walking
        ? t('ui.hdb.leaveNeedWalk')
        : hdb.currentLevel !== 1
          ? t('ui.hdb.leaveNeedVoidDeck')
          : undefined;
    return (
      <div className="space-y-2 text-xs">
        <p className="text-concrete-300">{t('ui.hdb.compactHint')}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => hdbLeave()}
            disabled={!canLeave}
            {...tip(leaveTitle)}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-concrete-300 hover:bg-white/5 disabled:opacity-40"
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
    const band = heatBandAfter(hdb.blockHeat, add);
    if (!band) return '';
    const note = msgOr(`ui.hdb.heatBand.${band.label}.note`, band.note, undefined, locale);
    return t('ui.hdb.heatCross', { note });
  };

  const blockActions = (
    <>
      {clearable.map((c) => {
        const blockLabel = msgOr(
          `ui.hdb.blockKind.${c.block.kind}.label`,
          BLOCK_META[c.block.kind].label,
          undefined,
          locale,
        );
        const scaled = scaleDoorCost(c.block.minutes, c.block.heat, forceOpts);
        const mins = Math.round(scaled.minutes);
        const warn = heatWarn(scaled.heat);
        const fobReady =
          c.block.kind === 'stair_gate' && hasFob(hdb, c.block.keyId);
        return (
          <div key={c.key} className="flex flex-col gap-1">
            {fobReady && (
              <button
                type="button"
                onClick={() => hdbUnlockGate(c.key)}
                disabled={walking}
                className="min-h-[44px] w-full rounded border border-signal/60 bg-signal/15 px-3 py-2 text-xs text-signal hover:bg-signal/25 disabled:opacity-40 lg:min-h-0 lg:py-1.5"
              >
                {t('ui.hdb.fobAction', { min: FOB_MINUTES })}
              </button>
            )}
            <button
              type="button"
              onClick={() => hdbForceBlock(c.key)}
              disabled={walking}
              className="min-h-[44px] w-full rounded border border-hiss/60 bg-hiss/15 px-3 py-2 text-xs text-hiss hover:bg-hiss/25 disabled:opacity-40 lg:min-h-0 lg:py-1.5"
            >
              {t('ui.hdb.clearAction', {
                label: blockLabel,
                min: mins,
                heat: scaled.heat,
              })}
              {warn}
            </button>
          </div>
        );
      })}
      {impassable.map((c) => {
        const blockLabel = msgOr(
          `ui.hdb.blockKind.${c.block.kind}.label`,
          BLOCK_META[c.block.kind].label,
          undefined,
          locale,
        );
        const blockBlurb = msgOr(
          `ui.hdb.blockKind.${c.block.kind}.blurb`,
          BLOCK_META[c.block.kind].blurb,
          undefined,
          locale,
        );
        return (
          <span
            key={c.key}
            {...tip(blockBlurb)}
            className="min-h-[44px] w-full rounded border border-concrete-600 bg-concrete-900/80 px-3 py-2 text-xs text-concrete-300 lg:min-h-0 lg:py-1.5"
          >
            {t('ui.hdb.noWayThrough', { label: blockLabel })}
          </span>
        );
      })}
    </>
  );

  const stair = hdb.stairs.find((s) => s.column === hdb.pos.column) ?? null;
  const boarded = !sel
    ? (floor.units.find((u) => u.column === hdb.pos.column) ?? null)
    : null;
  const placeTitle = sel
    ? sel.label
    : stair
      ? stair.kind === 'side'
        ? t('ui.hdb.sideStair', { id: stair.id })
        : t('ui.hdb.stairwell', { id: stair.id })
      : boarded
        ? boarded.label
        : isVoidDeckFloor(floor) && floor.units.length === 0
          ? t('ui.hdb.voidDeck')
          : t('ui.hdb.level', { nn: String(hdb.currentLevel).padStart(2, '0') });
  const placeStatus = sel
    ? doorStatus
    : stair
      ? clearable[0]
        ? msgOr(
            `ui.hdb.blockKind.${clearable[0].block.kind}.label`,
            BLOCK_META[clearable[0].block.kind].label,
            undefined,
            locale,
          )
        : impassable[0]
          ? msgOr(
              `ui.hdb.blockKind.${impassable[0].block.kind}.label`,
              BLOCK_META[impassable[0].block.kind].label,
              undefined,
              locale,
            )
          : t('ui.hdb.doorOpen')
      : boarded
        ? t('ui.hdb.doorBoarded')
        : clearable[0]
          ? msgOr(
              `ui.hdb.blockKind.${clearable[0].block.kind}.label`,
              BLOCK_META[clearable[0].block.kind].label,
              undefined,
              locale,
            )
          : impassable[0]
            ? msgOr(
                `ui.hdb.blockKind.${impassable[0].block.kind}.label`,
                BLOCK_META[impassable[0].block.kind].label,
                undefined,
                locale,
              )
            : null;

  const placeHeader = (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="truncate text-xs font-semibold tabular-nums tracking-wide text-concrete-50">
        {placeTitle}
      </span>
      {placeStatus && (
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-concrete-400">
          {placeStatus}
        </span>
      )}
    </div>
  );

  const descentChecked = descentIsChecked(hdb);
  const descentFailPct = descentChecked
    ? Math.round(retreatFailChance(character.attributes, hdb) * 100)
    : 0;

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
        <span className="inline-flex max-w-full items-center gap-0.5 text-xs text-concrete-200">
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
            <span className="truncate text-xs">
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
  ) : stair ? (
    <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-start gap-1.5 self-stretch sm:w-[8.5rem]">
      <ScoutTile
        label={t('ui.hdb.scoutDescent')}
        tip={t('ui.hdb.scoutDescentWatched', { n: descentFailPct })}
      >
        <span className={descentChecked && descentFailPct >= 50 ? 'text-hiss' : 'text-signal'}>
          {descentChecked ? `${descentFailPct}%` : t('ui.hdb.scoutClear')}
        </span>
      </ScoutTile>

      <ScoutTile
        label={t('ui.hdb.scoutLanding')}
        tip={t('ui.hdb.storey', { nn: String(hdb.currentLevel).padStart(2, '0') })}
      >
        <span className="tabular-nums text-concrete-100">
          #{String(hdb.currentLevel).padStart(2, '0')}
        </span>
      </ScoutTile>

      <ScoutTile
        label={t('ui.hdb.scoutShaft')}
        tip={
          stair.kind === 'side' ? t('ui.hdb.sideStairTitle') : t('ui.hdb.internalWell')
        }
      >
        <span className="inline-flex items-center gap-0.5 text-xs text-concrete-200">
          <Icon name="hdb.stairwell" size={12} />
          {stair.kind === 'side' ? t('ui.hdb.sideShort') : t('ui.hdb.wellShort')}
        </span>
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
  const busy = walking || !!pendingSearch;

  const doorButtons = sel ? (
    sel.state === 'cleared' ? (
      <span className="text-xs leading-snug text-concrete-400">
        {t('ui.hdb.unitClearedBlurb')}
      </span>
    ) : selVerb === 'service' && sel.service ? (
      <button
        type="button"
        onClick={() => hdbUseService(sel.id)}
        disabled={busy}
        className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
      >
        <Icon name={SERVICE_ICON[sel.service]} />{' '}
        {msgOr(`ui.hdb.service.${sel.service}`, SERVICE_LABEL[sel.service], undefined, locale)}
      </button>
    ) : selVerb === 'intel' ? (
      <button
        type="button"
        onClick={() => hdbReadNotice(sel.id)}
        disabled={busy}
        className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
      >
        <Icon name="hdb.notice" /> {t('ui.hdb.readNotice', { min: 15 })}
      </button>
    ) : selVerb === 'rest' && sel.state === 'breached' ? (
      <button
        type="button"
        onClick={() => hdbUseShelter(sel.id)}
        disabled={busy}
        className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
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
            className="min-h-[44px] w-full rounded border border-signal/50 bg-signal/10 px-3 py-2 text-xs font-bold text-signal hover:bg-signal/20 disabled:opacity-30 lg:min-h-0 lg:py-1.5"
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
            className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <div className="space-y-2 px-3 pb-2 pt-1 lg:px-0 lg:pt-0">
        <div className="flex items-stretch gap-2">
          {scoutColumn}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {placeHeader}
            {blockActions}
            {sel ? (
              doorButtons
            ) : !stair && !boarded && clearable.length === 0 && impassable.length === 0 ? (
              <p className="text-xs text-concrete-400">
                {isVoidDeckFloor(floor) && floor.units.length === 0
                  ? t('ui.hdb.voidHint')
                  : isPhone
                    ? t('ui.hdb.pathHintPhone')
                    : t('ui.hdb.pathHintDesktop')}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
