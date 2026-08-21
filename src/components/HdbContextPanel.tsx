import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
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
  isVoidDeckFloor,
  retreatFailChance,
  SERVICE_ICON,
  SERVICE_LABEL,
  UNIT_META,
  type HdbDungeon,
  type HdbUnitNode,
} from '../game/hdbDungeon';
import { msgOr, useT } from '../i18n';
import { useIsPhoneLayout } from './HdbZoomViewport';

const CONTAINER_ICON: Record<string, IconName> = {
  Medical: 'meter.infection',
  Food: 'meter.hunger',
  Tool: 'action.craft',
  Valuables: 'stat.value',
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
  title,
  unread,
  children,
}: {
  label: string;
  title: string;
  unread?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      title={title}
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
  const pendingSearch = useGame((s) => s.pendingSearch);
  const hdbBreach = useGame((s) => s.hdbBreach);
  const hdbUseService = useGame((s) => s.hdbUseService);
  const hdbForceBlock = useGame((s) => s.hdbForceBlock);
  const hdbLeave = useGame((s) => s.hdbLeave);
  const isPhone = useIsPhoneLayout();

  if (!hdb || !character) return null;

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
    const canLeave = hdb.currentLevel === 1 && !pendingSearch;
    const leaveTitle = pendingSearch
      ? t('ui.hdb.leaveNeedSearch')
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
            title={leaveTitle}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-concrete-300 hover:bg-white/5 disabled:opacity-40"
          >
            {t('ui.hdb.leaveBlock')}
          </button>
        </div>
      </div>
    );
  }

  const containerUnread = !sel?.scoutedInfo?.containerCategory;
  const encounter = sel
    ? encounterChanceReadout(
        breachOutcome(hdb, sel, hdb.currentLevel).encounterChance,
        encounterChanceKnown(sel),
      )
    : null;

  const blockActions = (
    <>
      {clearable.map((c) => {
        const blockLabel = msgOr(
          `ui.hdb.blockKind.${c.block.kind}.label`,
          BLOCK_META[c.block.kind].label,
          undefined,
          locale,
        );
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => hdbForceBlock(c.key)}
            className="min-h-[44px] w-full rounded border border-hiss/60 bg-hiss/15 px-3 py-2 text-xs text-hiss hover:bg-hiss/25 lg:min-h-0 lg:py-1.5"
          >
            {t('ui.hdb.clearAction', {
              label: blockLabel,
              min: c.block.minutes,
              heat: c.block.heat,
            })}
          </button>
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
            title={blockBlurb}
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
    <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center gap-1.5 self-stretch sm:w-[8.5rem]">
      {encounter && (
        <ScoutTile
          label={t('ui.hdb.scoutEncounter')}
          title={
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

      <ScoutTile label={t('ui.hdb.scoutRoom')} title={unitBlurb}>
        <span className="inline-flex max-w-full items-center gap-0.5 text-xs text-concrete-200">
          <Icon name={UNIT_META[sel.type].icon} size={12} />
          <span className="truncate">{unitLabel}</span>
        </span>
      </ScoutTile>

      <ScoutTile
        label={t('ui.hdb.scoutContainers')}
        title={
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
    <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center gap-1.5 self-stretch sm:w-[8.5rem]">
      <ScoutTile
        label={t('ui.hdb.scoutDescent')}
        title={
          descentChecked
            ? t('ui.hdb.scoutDescentWatched', { n: descentFailPct })
            : t('ui.hdb.scoutDescentClear')
        }
      >
        <span className={descentChecked && descentFailPct >= 50 ? 'text-hiss' : 'text-signal'}>
          {descentChecked ? `${descentFailPct}%` : t('ui.hdb.scoutClear')}
        </span>
      </ScoutTile>

      <ScoutTile
        label={t('ui.hdb.scoutLanding')}
        title={t('ui.hdb.storey', { nn: String(hdb.currentLevel).padStart(2, '0') })}
      >
        <span className="tabular-nums text-concrete-100">
          #{String(hdb.currentLevel).padStart(2, '0')}
        </span>
      </ScoutTile>

      <ScoutTile
        label={t('ui.hdb.scoutShaft')}
        title={
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
  const heatBit =
    sel && ENTRY_META[sel.entry].heat > 0
      ? t('ui.hdb.heatPlus', { n: ENTRY_META[sel.entry].heat })
      : t('ui.hdb.quiet');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <div className="space-y-2 px-3 pb-2 pt-1 lg:px-0 lg:pt-0">
        <div className="flex items-stretch gap-2">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            {placeHeader}
            {blockActions}
            {sel ? (
              sel.type === 'holdout' && sel.service ? (
                <button
                  type="button"
                  onClick={() => hdbUseService(sel.id)}
                  disabled={sel.state === 'cleared'}
                  className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
                >
                  <Icon name={SERVICE_ICON[sel.service]} />{' '}
                  {msgOr(
                    `ui.hdb.service.${sel.service}`,
                    SERVICE_LABEL[sel.service],
                    undefined,
                    locale,
                  )}
                </button>
              ) : sel.state === 'cleared' ? (
                <span className="text-xs leading-snug text-concrete-400">
                  {t('ui.hdb.unitClearedBlurb')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => hdbBreach(sel.id)}
                  disabled={!!pendingSearch}
                  className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
                >
                  <Icon name={ENTRY_META[sel.entry].heat > 0 ? 'hdb.breach' : 'hdb.unit'} />{' '}
                  {t('ui.hdb.breachLine', {
                    verb: entryVerb,
                    min: ENTRY_META[sel.entry].minutes,
                    heat: heatBit,
                  })}
                </button>
              )
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
          {scoutColumn}
        </div>
      </div>
    </div>
  );
}
