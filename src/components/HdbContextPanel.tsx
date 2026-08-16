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
      ? 'cleared'
      : ENTRY_META[sel.entry].label
    : null;

  if (variant === 'compact') {
    const canLeave = hdb.currentLevel === 1 && !pendingSearch;
    const leaveTitle = pendingSearch
      ? 'Finish the unit search in the timeline first'
      : hdb.currentLevel !== 1
        ? 'Climb down to level 01 (void deck) to leave'
        : undefined;
    return (
      <div className="space-y-2 text-xs">
        <p className="text-concrete-300">
          Actions stay on the cutaway. Clear units floor by floor, then leave from the void deck.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => hdbLeave()}
            disabled={!canLeave}
            title={leaveTitle}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-concrete-300 hover:bg-white/5 disabled:opacity-40"
          >
            Leave the block
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
      {clearable.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => hdbForceBlock(c.key)}
          className="min-h-[44px] w-full rounded border border-hiss/60 bg-hiss/15 px-3 py-2 text-xs text-hiss hover:bg-hiss/25 lg:min-h-0 lg:py-1.5"
        >
          Clear {BLOCK_META[c.block.kind].label} · {c.block.minutes} min · +{c.block.heat} heat
        </button>
      ))}
      {impassable.map((c) => (
        <span
          key={c.key}
          title={BLOCK_META[c.block.kind].blurb}
          className="min-h-[44px] w-full rounded border border-concrete-600 bg-concrete-900/80 px-3 py-2 text-xs text-concrete-300 lg:min-h-0 lg:py-1.5"
        >
          {BLOCK_META[c.block.kind].label} — no way through
        </span>
      ))}
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
        ? `Side stair ${stair.id}`
        : `Stairwell ${stair.id}`
      : boarded
        ? boarded.label
        : isVoidDeckFloor(floor) && floor.units.length === 0
          ? 'Void deck'
          : `Level ${String(hdb.currentLevel).padStart(2, '0')}`;
  const placeStatus = sel
    ? doorStatus
    : stair
      ? clearable[0]
        ? BLOCK_META[clearable[0].block.kind].label
        : impassable[0]
          ? BLOCK_META[impassable[0].block.kind].label
          : 'open'
      : boarded
        ? 'boarded'
        : clearable[0]
          ? BLOCK_META[clearable[0].block.kind].label
          : impassable[0]
            ? BLOCK_META[impassable[0].block.kind].label
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

  const scoutColumn = sel ? (
    <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center gap-1.5 self-stretch sm:w-[8.5rem]">
      {encounter && (
        <ScoutTile
          label="Encounter"
          title={
            encounter.exact
              ? 'Perception read — exact chance a fight starts when you breach'
              : 'Estimate from heat + door type — raise Perception to pin the exact %'
          }
        >
          <span className={encounter.pct >= 50 ? 'text-hiss' : 'text-signal'}>
            {encounter.label}
          </span>
        </ScoutTile>
      )}

      <ScoutTile label="Room" title={UNIT_META[sel.type].blurb}>
        <span className="inline-flex max-w-full items-center gap-0.5 text-xs text-concrete-200">
          <Icon name={UNIT_META[sel.type].icon} size={12} />
          <span className="truncate">{UNIT_META[sel.type].label}</span>
        </span>
      </ScoutTile>

      <ScoutTile
        label="Containers"
        title={
          sel.scoutedInfo?.containerCategory
            ? `${sel.scoutedInfo.containerCategory} · ${sel.scoutedInfo.lootQuality}`
            : 'Containers unread — raise Dexterity to scout from the corridor'
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
            <span className="truncate text-xs">{sel.scoutedInfo.containerCategory}</span>
          </span>
        ) : (
          <span className="text-concrete-500">?</span>
        )}
      </ScoutTile>
    </div>
  ) : stair ? (
    <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center gap-1.5 self-stretch sm:w-[8.5rem]">
      <ScoutTile
        label="Descent"
          title={
            descentChecked
              ? `Going down is watched — about ${descentFailPct}% chance to fail`
              : 'Stairs are clear — no check at this heat'
          }
      >
        <span className={descentChecked && descentFailPct >= 50 ? 'text-hiss' : 'text-signal'}>
          {descentChecked ? `${descentFailPct}%` : 'Clear'}
        </span>
      </ScoutTile>

      <ScoutTile
        label="Landing"
        title={`Storey ${String(hdb.currentLevel).padStart(2, '0')}`}
      >
        <span className="tabular-nums text-concrete-100">
          #{String(hdb.currentLevel).padStart(2, '0')}
        </span>
      </ScoutTile>

      <ScoutTile
        label="Shaft"
        title={stair.kind === 'side' ? 'Side stair at the end of the strip' : 'Internal stairwell'}
      >
        <span className="inline-flex items-center gap-0.5 text-xs text-concrete-200">
          <Icon name="hdb.stairwell" size={12} />
          {stair.kind === 'side' ? 'Side' : 'Well'}
        </span>
      </ScoutTile>
    </div>
  ) : null;

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
                  <Icon name={SERVICE_ICON[sel.service]} /> {SERVICE_LABEL[sel.service]}
                </button>
              ) : sel.state === 'cleared' ? (
                <span className="text-xs leading-snug text-concrete-400">
                  You&apos;ve already been through this one. Nothing left in it.
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => hdbBreach(sel.id)}
                  disabled={!!pendingSearch}
                  className="min-h-[44px] w-full rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
                >
                  <Icon name={ENTRY_META[sel.entry].heat > 0 ? 'hdb.breach' : 'hdb.unit'} />{' '}
                  {ENTRY_META[sel.entry].verb} · {ENTRY_META[sel.entry].minutes} min ·{' '}
                  {ENTRY_META[sel.entry].heat > 0
                    ? `+${ENTRY_META[sel.entry].heat} heat`
                    : 'quiet'}
                </button>
              )
            ) : !stair && !boarded && clearable.length === 0 && impassable.length === 0 ? (
              <p className="text-xs text-concrete-400">
                {isVoidDeckFloor(floor) && floor.units.length === 0
                  ? 'Walk the pillars to a stair, then climb into the fog.'
                  : isPhone
                    ? 'Tap a reachable cell or door to auto-path. Pinch to zoom. Breach only when you stand at the door.'
                    : 'Click a reachable cell or door to auto-path. Unvisited floors stay fogged. Breach only when you stand at the door.'}
              </p>
            ) : null}
          </div>
          {scoutColumn}
        </div>
      </div>
    </div>
  );
}
