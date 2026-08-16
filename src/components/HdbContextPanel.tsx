import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { ATTRIBUTE_ICONS, ATTRIBUTE_LABELS } from '../game/character';
import { useGame } from '../game/store';
import {
  adjacentBreakableBlocks,
  adjacentEdgeBlocks,
  BLOCK_META,
  breachOutcome,
  currentFloor,
  ENTRY_META,
  heatBand,
  heatEncounterBase,
  isHunting,
  isVoidDeckFloor,
  retreatDc,
  senseChance,
  SERVICE_ICON,
  SERVICE_LABEL,
  type HdbDungeon,
  type HdbUnitNode,
} from '../game/hdbDungeon';
import { useIsPhoneLayout } from './HdbZoomViewport';

const UNIT_ICON: Record<HdbUnitNode['type'], IconName> = {
  residential: 'hdb.unit',
  corner_unit: 'hdb.cornerUnit',
  shelter_service: 'hdb.service',
  hazard: 'hdb.hazard',
};

const UNIT_TYPE_LABEL: Record<HdbUnitNode['type'], string> = {
  residential: 'Flat',
  corner_unit: 'Corner',
  shelter_service: 'Service',
  hazard: 'Hazard',
};

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
      className={`flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded border px-1 py-1.5 text-center ${
        unread
          ? 'border-concrete-700/80 bg-concrete-950/40 text-concrete-500'
          : 'border-white/15 bg-concrete-900/60 text-concrete-100'
      }`}
    >
      <div className="flex min-h-[1.25rem] items-center justify-center text-xs font-semibold leading-tight">
        {children}
      </div>
      <span className="text-2xs uppercase tracking-wider text-concrete-500">{label}</span>
    </div>
  );
}

/**
 * Consolidated HDB attention surface: status, unit/breach, senses, leave.
 * `full` for desktop rail + phone cutaway dock; `compact` for phone timeline foot.
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

  const searchingUnit = pendingSearch?.hdbUnit ?? null;
  const floor = currentFloor(hdb);
  const band = heatBand(hdb.blockHeat);
  const hunting = isHunting(hdb);
  const dc = retreatDc(hdb);
  const clearable = adjacentBreakableBlocks(hdb);
  const impassable = adjacentEdgeBlocks(hdb).filter((e) => !e.block.breakable);
  const sel =
    floor.units.find((u) => u.column === hdb.pos.column && u.available) ?? null;
  const encounterPct = sel
    ? Math.round(breachOutcome(hdb, sel, hdb.currentLevel).encounterChance * 100)
    : Math.round(heatEncounterBase(hdb) * 100);
  const canLeave = hdb.currentLevel === 1 && !pendingSearch;
  const leaveTitle = pendingSearch
    ? 'Finish the unit search in the timeline first'
    : hdb.currentLevel !== 1
      ? 'Climb down to level 01 (void deck) to leave'
      : undefined;

  const attrs = character.attributes;
  const senses = [
    { key: 'perception' as const, value: attrs.perception, gives: 'threat count' },
    { key: 'wits' as const, value: attrs.wits, gives: 'room traits' },
    { key: 'dexterity' as const, value: attrs.dexterity, gives: 'container type' },
  ];

  const leaveBtn = (
    <button
      type="button"
      onClick={() => hdbLeave()}
      disabled={!canLeave}
      title={leaveTitle}
      className="rounded border border-white/15 px-2.5 py-1 text-xs text-concrete-300 hover:bg-white/5 disabled:opacity-40"
    >
      Leave the block
    </button>
  );

  const statusAlerts = (
    <>
      {searchingUnit && (
        <p className="rounded border border-signal/40 bg-signal/10 px-2 py-1.5 text-2xs leading-snug text-signal">
          Searching {searchingUnit.label} — watch the timeline. Movement is locked until you finish
          or leave the search.
        </p>
      )}
      {band.dcStep > 0 && (
        <p className="rounded border border-hiss/40 bg-hiss/10 px-2 py-1.5 text-2xs leading-snug text-hiss">
          Going down is a check now — Dex+End vs DC {dc}.
          {hunting ? ' The stairs are hunted in both directions.' : ' Climbing is still free.'}
        </p>
      )}
    </>
  );

  if (variant === 'compact') {
    return (
      <div className="space-y-2 text-xs">
        {statusAlerts}
        {!searchingUnit && band.dcStep === 0 && (
          <p className="text-concrete-300">
            Actions stay on the cutaway. Clear units floor by floor, then leave from the void deck.
          </p>
        )}
        <div className="flex justify-end">{leaveBtn}</div>
      </div>
    );
  }

  const roomUnread = !sel?.scoutedInfo?.readRoom && !sel?.scoutedInfo?.hazardType;
  const containerUnread = !sel?.scoutedInfo?.containerCategory;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="space-y-2 px-3 pb-1.5 pt-1 lg:px-0 lg:pt-0">
        {statusAlerts}

        {(clearable.length > 0 || impassable.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {clearable.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => hdbForceBlock(c.key)}
                className="min-h-[44px] rounded border border-hiss/60 bg-hiss/15 px-3 py-2 text-xs text-hiss hover:bg-hiss/25 lg:min-h-0 lg:px-2 lg:py-1"
              >
                Clear {BLOCK_META[c.block.kind].label} · {c.block.minutes} min · +{c.block.heat} heat
              </button>
            ))}
            {impassable.map((c) => (
              <span
                key={c.key}
                title={BLOCK_META[c.block.kind].blurb}
                className="min-h-[44px] rounded border border-concrete-600 bg-concrete-900/80 px-3 py-2 text-xs text-concrete-300 lg:min-h-0 lg:px-2 lg:py-1"
              >
                {BLOCK_META[c.block.kind].label} — no way through
              </span>
            ))}
          </div>
        )}

        {!sel ? (
          <>
            <p className="text-xs text-concrete-400">
              {isVoidDeckFloor(floor) && floor.units.length === 0
                ? 'Void deck — walk the pillars to a stair, then climb into the fog.'
                : isPhone
                  ? 'Tap a reachable cell or door to auto-path. Pinch to zoom. Breach only when you stand at the door.'
                  : 'Click a reachable cell or door to auto-path. Unvisited floors stay fogged. Breach only when you stand at the door.'}
            </p>
            <p
              className="text-2xs text-concrete-500"
              title="Typical door encounter chance at current heat"
            >
              Door encounter at heat{' '}
              <span className={encounterPct >= 50 ? 'text-hiss' : 'text-signal'}>
                {encounterPct}%
              </span>
            </p>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Icon name={UNIT_ICON[sel.type]} size={16} />
                  <span className="truncate text-sm font-bold tabular-nums tracking-tight text-concrete-50">
                    {sel.label}
                  </span>
                </div>
              </div>
              <span className="shrink-0 pt-0.5 text-2xs uppercase tracking-wider text-concrete-400">
                {sel.state === 'cleared' ? 'cleared' : ENTRY_META[sel.entry].label}
              </span>
            </div>

            <div className="flex gap-1.5">
              <ScoutTile
                label="Threats"
                title="Chance a fight starts when you breach (heat + door type)"
              >
                <span className={encounterPct >= 50 ? 'text-hiss' : 'text-signal'}>
                  {encounterPct}%
                </span>
              </ScoutTile>

              <ScoutTile
                label="Room"
                title={
                  sel.scoutedInfo?.hazardType
                    ? sel.scoutedInfo.hazardType
                    : sel.scoutedInfo?.readRoom
                      ? 'Reads clean'
                      : 'Room unread — raise Wits to scout from the corridor'
                }
                unread={roomUnread}
              >
                {sel.scoutedInfo?.hazardType ? (
                  <span className="inline-flex items-center gap-0.5 text-hiss">
                    <Icon name="hdb.hazard" size={12} />
                    <span className="max-w-[4.5rem] truncate text-xs">
                      {sel.scoutedInfo.hazardType}
                    </span>
                  </span>
                ) : sel.scoutedInfo?.readRoom ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-concrete-200">
                    <Icon name={UNIT_ICON[sel.type]} size={12} />
                    {UNIT_TYPE_LABEL[sel.type]}
                  </span>
                ) : (
                  <span className="text-concrete-500">?</span>
                )}
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
                  <span className="inline-flex items-center gap-0.5 text-astral">
                    <Icon
                      name={CONTAINER_ICON[sel.scoutedInfo.containerCategory] ?? 'action.inventory'}
                      size={12}
                    />
                    <span className="text-xs">{sel.scoutedInfo.containerCategory}</span>
                  </span>
                ) : (
                  <span className="text-concrete-500">?</span>
                )}
              </ScoutTile>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {sel.type === 'shelter_service' && sel.service ? (
                <button
                  type="button"
                  onClick={() => hdbUseService(sel.id)}
                  disabled={sel.state === 'cleared'}
                  className="min-h-[44px] rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
                >
                  <Icon name={SERVICE_ICON[sel.service]} /> {SERVICE_LABEL[sel.service]}
                </button>
              ) : sel.state === 'cleared' ? (
                <span className="text-xs text-concrete-400">
                  You&apos;ve already been through this one. Nothing left in it.
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => hdbBreach(sel.id)}
                  disabled={!!pendingSearch}
                  className="min-h-[44px] rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
                >
                  <Icon name={ENTRY_META[sel.entry].heat > 0 ? 'hdb.breach' : 'hdb.unit'} />{' '}
                  {ENTRY_META[sel.entry].verb} · {ENTRY_META[sel.entry].minutes} min ·{' '}
                  {ENTRY_META[sel.entry].heat > 0
                    ? `+${ENTRY_META[sel.entry].heat} heat`
                    : 'quiet'}
                </button>
              )}
              {leaveBtn}
            </div>
          </>
        )}

        {!sel && <div className="flex justify-end">{leaveBtn}</div>}
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-concrete-700/40 px-3 py-1.5 text-2xs text-concrete-500 lg:px-0">
        {senses.map((s) => (
          <span
            key={s.key}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${
              senseChance(s.value) >= 0.6
                ? 'border-astral/30 text-astral/80'
                : 'border-concrete-700/80 text-concrete-500'
            }`}
          >
            <Icon name={ATTRIBUTE_ICONS[s.key]} size={11} title={ATTRIBUTE_LABELS[s.key]} />
            {s.value} → {s.gives} {Math.round(senseChance(s.value) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
