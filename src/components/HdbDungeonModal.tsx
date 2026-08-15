import { useState, type ReactElement } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { ATTRIBUTE_ICONS, ATTRIBUTE_LABELS } from '../game/character';
import { useGame } from '../game/store';
import { PlayerPin } from './PlayerPin';
import { HdbZoomViewport, useIsPhoneLayout } from './HdbZoomViewport';
import {
  adjacentBreakableBlocks,
  BLOCK_META,
  canTargetCell,
  currentFloor,
  ENTRY_META,
  findPath,
  floorThreat,
  forceableLevels,
  GROUND_LABEL,
  heatBand,
  HEAT_BANDS,
  HEAT_MAX,
  horizKey,
  HUNT_ELITE_CHANCE,
  isHunting,
  isLevelRevealed,
  isVoidDeckFloor,
  pathMinutes,
  posKey,
  reachableCells,
  retreatDc,
  SEAL_META,
  senseChance,
  SERVICE_ICON,
  SERVICE_LABEL,
  samePos,
  threatBreakdown,
  type HdbBlock,
  type HdbDungeon,
  type HdbPos,
  type HdbUnitNode,
} from '../game/hdbDungeon';

const UNIT_ICON: Record<HdbUnitNode['type'], IconName> = {
  residential: 'hdb.unit',
  corner_unit: 'hdb.cornerUnit',
  shelter_service: 'hdb.service',
  hazard: 'hdb.hazard',
};

/**
 * Side-elevation HDB crawl: maze movement with auto-path, fog of war on
 * unvisited storeys, doors only when you're on the cell.
 */
export function HdbDungeonModal() {
  const hdb = useGame((s) => s.hdb);
  const character = useGame((s) => s.character);
  const hdbBreach = useGame((s) => s.hdbBreach);
  const hdbGoTo = useGame((s) => s.hdbGoTo);
  const hdbUseService = useGame((s) => s.hdbUseService);
  const hdbForceSeal = useGame((s) => s.hdbForceSeal);
  const hdbForceBlock = useGame((s) => s.hdbForceBlock);
  const hdbLeave = useGame((s) => s.hdbLeave);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const isPhone = useIsPhoneLayout();

  if (!hdb || !character) return null;

  const floor = currentFloor(hdb);
  const threat = floorThreat(hdb, hdb.currentLevel);
  const forceable = forceableLevels(hdb);
  const heat = Math.round(hdb.blockHeat);
  const band = heatBand(hdb.blockHeat);
  const hunting = isHunting(hdb);
  const dc = retreatDc(hdb);
  const parts = threatBreakdown(hdb, hdb.currentLevel);
  const reach = new Set(reachableCells(hdb).map(posKey));
  const clearable = adjacentBreakableBlocks(hdb);
  const sel =
    floor.units.find(
      (u) =>
        u.column === selectedCol &&
        u.available &&
        u.column === hdb.pos.column &&
        hdb.pos.level === floor.level,
    ) ?? null;

  const attrs = character.attributes;
  const senses = [
    { key: 'perception' as const, value: attrs.perception, gives: 'threat count' },
    { key: 'wits' as const, value: attrs.wits, gives: 'room traits' },
    { key: 'dexterity' as const, value: attrs.dexterity, gives: 'container type' },
  ];

  const go = (target: HdbPos) => {
    if (samePos(hdb.pos, target)) {
      setSelectedCol(target.column);
      return;
    }
    if (!canTargetCell(hdb, target)) return;
    if (!reach.has(posKey(target))) return;
    const path = findPath(hdb, hdb.pos, target);
    if (!path) return;
    setSelectedCol(target.column);
    hdbGoTo(target);
  };

  const dockExpanded = !isPhone || !!sel || clearable.length > 0;

  const cutaway = (
    <BuildingCutaway
      hdb={hdb}
      reach={reach}
      forceable={forceable}
      selectedCol={selectedCol}
      phone={isPhone}
      onGo={go}
      onForce={hdbForceSeal}
    />
  );

  return (
    <div className="flex h-full w-full flex-col bg-concrete-950">
      <div className="flex shrink-0 items-center justify-between border-b border-concrete-600 bg-concrete-800 px-3 py-2 lg:px-4 lg:py-2.5">
        <div className="min-w-0">
          <div className="signage truncate text-xs text-signal">{hdb.name}</div>
          <div className="truncate text-xs text-concrete-400">
            {hdb.archetype === 'shelter' ? 'Barricaded shelter' : 'Residential block'} ·{' '}
            {floor.layoutType === 'slab' ? 'slab' : 'point'} · {GROUND_LABEL[hdb.groundKind]} ·{' '}
            {hdb.height} storeys
          </div>
        </div>
        <button
          onClick={hdbLeave}
          className="shrink-0 rounded border border-concrete-600 px-3 py-1.5 text-xs hover:bg-white/5"
        >
          ✕ Leave
        </button>
      </div>

      {band.dcStep > 0 && (
        <div className="shrink-0 border-b border-hiss/40 bg-hiss/10 px-3 py-1.5 text-2xs leading-snug text-hiss lg:px-4">
          Going down is a check now — Dex+End vs DC {dc}.
          {hunting ? ' The stairs are hunted in both directions.' : ' Climbing is still free.'}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {isPhone ? (
          <HdbZoomViewport followKey={posKey(hdb.pos)}>
            <div className="p-1.5">{cutaway}</div>
          </HdbZoomViewport>
        ) : (
          <div className="h-full p-1.5 sm:p-2">{cutaway}</div>
        )}
      </div>

      <div
        className={`flex shrink-0 flex-col border-t border-concrete-600 bg-concrete-900/80 ${
          isPhone
            ? dockExpanded
              ? 'max-h-[42%] overflow-hidden'
              : 'overflow-hidden'
            : 'h-[13.5rem] overflow-hidden'
        }`}
      >
        <HeatGauge heat={heat} band={band} dc={dc} hunting={hunting} compact={isPhone} />

        <div className="flex flex-wrap items-baseline justify-between gap-1 px-3 py-1">
          <h3 className="signage text-xs text-concrete-50">
            Level {String(hdb.currentLevel).padStart(2, '0')} · col {hdb.pos.column}
          </h3>
          <span className="text-xs text-concrete-400">
            Floor threat{' '}
            <span className={threat >= 5 ? 'text-hiss' : 'text-signal'}>{threat}</span>{' '}
            <span className="text-2xs text-concrete-400/70">
              ({parts.base} block
              {parts.heat > 0 && <span className="text-hiss"> +{parts.heat} heat</span>}
              {parts.height < 0 && ` ${parts.height} height`})
            </span>
          </span>
        </div>

        {dockExpanded && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="px-3 pb-1.5">
              {clearable.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {clearable.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => hdbForceBlock(c.key)}
                      className="min-h-[44px] rounded border border-hiss/60 bg-hiss/15 px-3 py-2 text-xs text-hiss hover:bg-hiss/25 lg:min-h-0 lg:px-2 lg:py-1"
                    >
                      Clear {BLOCK_META[c.block.kind].label} · {c.block.minutes} min · +
                      {c.block.heat} heat
                    </button>
                  ))}
                </div>
              )}
              {!sel ? (
                <p className="text-xs text-concrete-400">
                  {isVoidDeckFloor(floor) && floor.units.length === 0
                    ? 'Void deck — walk the pillars to a stair, then climb into the fog.'
                    : isPhone
                      ? 'Tap a reachable cell or door to auto-path. Pinch to zoom. Breach only when you stand at the door.'
                      : 'Click a reachable cell or door to auto-path. Unvisited floors stay fogged. Breach only when you stand at the door.'}
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">
                      <Icon name={UNIT_ICON[sel.type]} /> {sel.label}
                    </span>
                    <span className="text-xs uppercase tracking-widest text-concrete-400">
                      {sel.state === 'cleared' ? 'cleared' : ENTRY_META[sel.entry].label}
                    </span>
                  </div>

                  <ul className="mt-2 space-y-0.5 text-xs text-concrete-200">
                    <li>
                      Threats:{' '}
                      {sel.scoutedInfo && sel.scoutedInfo.threatCount >= 0 ? (
                        sel.scoutedInfo.threatCount
                      ) : (
                        <span className="text-concrete-400">couldn't count</span>
                      )}
                    </li>
                    <li>
                      Room:{' '}
                      {sel.scoutedInfo?.hazardType ? (
                        <span className="text-hiss">{sel.scoutedInfo.hazardType}</span>
                      ) : sel.scoutedInfo?.readRoom ? (
                        'reads clean'
                      ) : (
                        <span className="text-concrete-400">unread</span>
                      )}
                    </li>
                    <li>
                      Containers:{' '}
                      {sel.scoutedInfo?.containerCategory ? (
                        <span className="text-astral">
                          {sel.scoutedInfo.containerCategory} · {sel.scoutedInfo.lootQuality}
                        </span>
                      ) : (
                        <span className="text-concrete-400">unread</span>
                      )}
                    </li>
                  </ul>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {sel.type === 'shelter_service' && sel.service ? (
                      <button
                        onClick={() => hdbUseService(sel.id)}
                        disabled={sel.state === 'cleared'}
                        className="min-h-[44px] rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal disabled:opacity-30 lg:min-h-0 lg:py-1.5"
                      >
                        <Icon name={SERVICE_ICON[sel.service]} /> {SERVICE_LABEL[sel.service]}
                      </button>
                    ) : sel.state === 'cleared' ? (
                      <span className="text-xs text-concrete-400">
                        You've already been through this one. Nothing left in it.
                      </span>
                    ) : (
                      <button
                        onClick={() => hdbBreach(sel.id)}
                        className="min-h-[44px] rounded bg-signal/80 px-3 py-2 text-xs font-bold text-black hover:bg-signal lg:min-h-0 lg:py-1.5"
                      >
                        <Icon name={ENTRY_META[sel.entry].heat > 0 ? 'hdb.breach' : 'hdb.unit'} />{' '}
                        {ENTRY_META[sel.entry].verb} · {ENTRY_META[sel.entry].minutes} min ·{' '}
                        {ENTRY_META[sel.entry].heat > 0
                          ? `+${ENTRY_META[sel.entry].heat} heat`
                          : 'quiet'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="mt-auto flex flex-wrap gap-2 border-t border-concrete-700/60 px-3 py-1.5 text-2xs text-concrete-400">
              {senses.map((s) => (
                <span
                  key={s.key}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${
                    senseChance(s.value) >= 0.6
                      ? 'border-astral/40 text-astral'
                      : 'border-concrete-600'
                  }`}
                >
                  <Icon name={ATTRIBUTE_ICONS[s.key]} size={11} title={ATTRIBUTE_LABELS[s.key]} />
                  {s.value} → {s.gives} {Math.round(senseChance(s.value) * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}

        {isPhone && !dockExpanded && (
          <p className="px-3 pb-2 text-2xs text-concrete-400">
            Pinch to zoom · tap a door at your cell to breach
          </p>
        )}
      </div>
    </div>
  );
}

function BuildingCutaway({
  hdb,
  reach,
  forceable,
  selectedCol,
  phone,
  onGo,
  onForce,
}: {
  hdb: HdbDungeon;
  reach: Set<string>;
  forceable: number[];
  selectedCol: number | null;
  phone: boolean;
  onGo: (pos: HdbPos) => void;
  onForce: (level: number) => void;
}) {
  const stairAt = new Map(hdb.stairs.map((s) => [s.column, s]));
  const levels = Array.from({ length: hdb.height }, (_, i) => hdb.height - i);
  const forceLabelCol =
    hdb.unitColumns[Math.floor(hdb.unitColumns.length / 2)] ??
    Math.floor(hdb.stripWidth / 2);

  // Phone: fixed tracks so the elevation has a real width to pan across.
  // Desktop: flexible unit columns fill the map column.
  const colTrack = Array.from({ length: hdb.stripWidth }, (_, col) => {
    if (stairAt.has(col)) return phone ? '2.75rem' : '1.75rem';
    return phone ? '3.25rem' : 'minmax(2.5rem, 1fr)';
  }).join(' ');

  const labelCol = phone ? '2.75rem' : '2.75rem';
  const rowCls = phone
    ? 'grid h-11 min-h-[44px] shrink-0'
    : 'grid min-h-0 flex-1';

  return (
    <div
      className={
        phone
          ? 'flex w-max min-w-full flex-col'
          : 'flex h-full min-h-0 w-full flex-col'
      }
    >
      <div className="mb-1 flex shrink-0 items-baseline justify-between gap-3 text-xs text-concrete-400">
        <span className="signage">Block elevation</span>
        <span>
          {hdb.revealedLevels.length}/{hdb.height} revealed · maze
        </span>
      </div>

      <div
        className={
          phone
            ? 'flex w-max min-w-full flex-col rounded-sm border border-concrete-600 bg-concrete-950'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-concrete-600 bg-concrete-950'
        }
      >
        {levels.map((level, rowIdx) => {
          const f = hdb.floors[level - 1];
          const hereLevel = level === hdb.pos.level;
          const revealed = isLevelRevealed(hdb, level);
          const seal = f.sealed;
          const canForce = forceable.includes(level);
          const label = String(level).padStart(2, '0');
          const unitByCol = new Map(f.units.map((u) => [u.column, u]));
          const voidDeck = isVoidDeckFloor(f);
          const last = rowIdx === levels.length - 1;

          return (
            <div
              key={level}
              className={`${rowCls} ${last ? '' : 'border-b border-concrete-700/80'} ${
                hereLevel
                  ? 'bg-signal/10'
                  : revealed
                    ? 'bg-concrete-900/40'
                    : 'bg-concrete-950'
              }`}
              style={{ gridTemplateColumns: `${labelCol} ${colTrack}` }}
            >
              <button
                type="button"
                disabled={!!seal && !canForce}
                onClick={() => {
                  if (seal && canForce) onForce(level);
                }}
                title={
                  seal
                    ? `${SEAL_META[seal.kind].label}${canForce ? ' · force' : ''}`
                    : revealed
                      ? `Level ${label}`
                      : `Level ${label} — unexplored`
                }
                className={`flex items-center justify-center border-r border-concrete-700 text-xs font-bold tabular-nums disabled:cursor-default sm:text-sm ${
                  hereLevel
                    ? 'bg-signal/20 text-signal'
                    : seal && canForce
                      ? 'text-hiss hover:bg-hiss/15'
                      : revealed
                        ? 'text-concrete-100'
                        : 'text-concrete-600'
                }`}
              >
                <span className="flex flex-col items-center leading-none">
                  {revealed || hereLevel ? label : '·'}
                </span>
              </button>

              {Array.from({ length: hdb.stripWidth }, (_, col) => {
                const cell: HdbPos = { level, column: col };
                const atPlayer = samePos(hdb.pos, cell);
                const reachable = reach.has(posKey(cell));
                const stair = stairAt.get(col);

                if (seal) {
                  return (
                    <button
                      key={`seal-${col}`}
                      type="button"
                      disabled={!canForce}
                      onClick={() => onForce(level)}
                      className="relative disabled:cursor-default"
                      title={`${SEAL_META[seal.kind].label}${canForce ? ' · force' : ''}`}
                    >
                      <span
                        className="absolute inset-0 opacity-55"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(135deg, transparent 0 5px, rgba(255,255,255,0.16) 5px 6px)',
                        }}
                      />
                      {canForce && col === forceLabelCol && (
                        <span className="relative z-10 text-[10px] font-bold uppercase tracking-wider text-hiss sm:text-xs">
                          force
                        </span>
                      )}
                    </button>
                  );
                }

                // Fogged storey: blank band, stairs faintly visible / clickable.
                if (!revealed) {
                  if (stair) {
                    return (
                      <button
                        key={`fog-s-${col}`}
                        type="button"
                        disabled={!reachable}
                        onClick={() => onGo(cell)}
                        title={`Stair ${stair.id} — climb into the unknown`}
                        className={`relative flex min-h-[44px] items-center justify-center border-x border-concrete-700/40 bg-concrete-900/30 disabled:cursor-default lg:min-h-0 ${
                          reachable
                            ? 'bg-signal/10 text-concrete-300 ring-1 ring-inset ring-signal/25 hover:bg-signal/15'
                            : 'text-concrete-700'
                        }`}
                      >
                        <Icon name="hdb.stairwell" size={12} />
                        {atPlayer && <HdbPlayerMarker />}
                      </button>
                    );
                  }
                  return <div key={`fog-${col}`} className="bg-concrete-950/80" />;
                }

                if (stair) {
                  const gate = stairGateTouching(hdb, col, level);
                  return (
                    <button
                      key={`s-${col}`}
                      type="button"
                      disabled={!reachable && !atPlayer}
                      onClick={() => onGo(cell)}
                      title={
                        stair.kind === 'side'
                          ? `Side stair ${stair.id}`
                          : `Stairwell ${stair.id}`
                      }
                      className={`relative flex min-h-[44px] items-center justify-center border-x disabled:cursor-default lg:min-h-0 ${
                        atPlayer
                          ? 'border-signal/40 bg-signal/10 text-concrete-300'
                          : reachable
                            ? 'border-concrete-500/50 bg-signal/10 text-concrete-200 ring-1 ring-inset ring-signal/25 hover:bg-signal/15'
                            : 'border-concrete-700/40 bg-concrete-900/40 text-concrete-600'
                      }`}
                    >
                      {level === Math.ceil(hdb.height / 2) ? (
                        <span className="text-[10px] font-bold">{stair.id}</span>
                      ) : (
                        <Icon name="hdb.stairwell" size={13} />
                      )}
                      {gate && (
                        <span
                          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-hiss/70"
                          title={BLOCK_META[gate.kind].label}
                        />
                      )}
                      {atPlayer && <HdbPlayerMarker />}
                    </button>
                  );
                }

                // Horizontal block marker between this cell and the next
                const blockLeft =
                  col > 0 ? hdb.blocks[horizKey(level, col - 1, col)] : null;

                const unit = unitByCol.get(col);

                if (!unit && voidDeck) {
                  return (
                    <button
                      key={`p-${col}`}
                      type="button"
                      disabled={!reachable && !atPlayer}
                      onClick={() => onGo(cell)}
                      title="Void deck"
                      className={`relative flex min-h-[44px] items-center justify-center disabled:cursor-default lg:min-h-0 ${
                        reachable
                          ? 'bg-signal/10 ring-1 ring-inset ring-signal/20 hover:bg-white/5'
                          : ''
                      }`}
                    >
                      {blockLeft && (
                        <span className="absolute left-0 top-[15%] bottom-0 w-0.5 bg-hiss/80" />
                      )}
                      <span className="h-[65%] w-1.5 rounded-sm bg-concrete-400/40" />
                      {atPlayer && <HdbPlayerMarker />}
                    </button>
                  );
                }

                if (!unit) {
                  return (
                    <button
                      key={`e-${col}`}
                      type="button"
                      disabled={!reachable && !atPlayer}
                      onClick={() => onGo(cell)}
                      className={`relative min-h-[44px] disabled:cursor-default lg:min-h-0 ${
                        reachable
                          ? 'bg-signal/10 ring-1 ring-inset ring-signal/20 hover:bg-white/5'
                          : ''
                      }`}
                    >
                      {blockLeft && (
                        <span className="absolute left-0 top-[15%] bottom-0 w-0.5 bg-hiss/80" />
                      )}
                      {atPlayer && <HdbPlayerMarker />}
                    </button>
                  );
                }

                return (
                  <div
                    key={unit.id}
                    className={`relative flex min-h-[44px] items-end justify-center px-0.5 pb-0 lg:min-h-0 ${
                      reachable && !atPlayer
                        ? 'bg-signal/10 ring-1 ring-inset ring-signal/20'
                        : ''
                    }`}
                  >
                    {blockLeft && (
                      <span className="absolute left-0 top-[15%] bottom-0 z-10 w-0.5 bg-hiss/80" />
                    )}
                    <CorridorDoor
                      unit={unit}
                      selected={selectedCol === unit.column && atPlayer}
                      atPlayer={atPlayer}
                      interactive={reachable || atPlayer}
                      phone={phone}
                      pathHint={
                        reachable && !atPlayer
                          ? pathMinutes(findPath(hdb, hdb.pos, cell) ?? [])
                          : 0
                      }
                      onClick={() => onGo(cell)}
                    />
                    {atPlayer && <HdbPlayerMarker />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-concrete-400">
        <span className="inline-flex items-center gap-1">
          <PlayerPin size="sm" /> you
        </span>
        <span>? unread</span>
        <span>✕ boarded</span>
        <span>fog = unvisited floor</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-hiss/80" /> block
        </span>
      </div>
    </div>
  );
}

/** Map teardrop pin, tip on the cell's floor line. */
function HdbPlayerMarker() {
  return (
    <div
      data-hdb-player
      className="pointer-events-none absolute bottom-0 left-1/2 z-30 -translate-x-1/2"
    >
      <PlayerPin size="sm" />
    </div>
  );
}

function unitPlate(label: string): string {
  return label.replace(/^#/, '');
}

function stairGateTouching(
  dungeon: HdbDungeon,
  col: number,
  level: number,
): HdbBlock | null {
  for (const [k, b] of Object.entries(dungeon.blocks)) {
    if (!k.startsWith(`v:${col}:`)) continue;
    const m = /^v:\d+:(\d+)-(\d+)$/.exec(k);
    if (!m) continue;
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (level === lo || level === hi) return b;
  }
  return null;
}

function CorridorDoor({
  unit,
  selected,
  atPlayer,
  interactive,
  phone,
  pathHint,
  onClick,
}: {
  unit: HdbUnitNode;
  selected: boolean;
  atPlayer: boolean;
  interactive: boolean;
  phone: boolean;
  pathHint: number;
  onClick: () => void;
}) {
  const plate = unitPlate(unit.label);
  const meta = unit.available
    ? unit.state === 'cleared'
      ? 'cleared'
      : ENTRY_META[unit.entry].label
    : 'boarded shut';

  const panel =
    !unit.available
      ? 'bg-[#2a2a2c] border-concrete-600'
      : unit.state === 'cleared'
        ? 'bg-[#1c1c1e] border-concrete-700 opacity-70'
        : unit.state === 'breached'
          ? 'bg-[#3a2a1a] border-signal/70'
          : unit.state === 'scouted'
            ? 'bg-[#2a3038] border-astral/50'
            : 'bg-[#323028] border-concrete-500';

  /**
   * One job per glyph:
   * - boarded  → ✕ (never enterable)
   * - unread   → ? (enterable, type unknown until scouted)
   * - known    → type cue (skip plain residential — the door is enough)
   * Player position is the border/glow, not a replacement icon.
   */
  let face: ReactElement | null = null;
  if (!unit.available) {
    face = (
      <span className="text-sm font-bold leading-none text-concrete-500" title="Boarded">
        ✕
      </span>
    );
  } else if (unit.state === 'unexplored') {
    face = (
      <span className="text-sm font-bold leading-none text-concrete-300" title="Unread">
        ?
      </span>
    );
  } else if (unit.type !== 'residential') {
    face = <Icon name={UNIT_ICON[unit.type]} size={14} />;
  }

  const shell = (
    <span className="flex h-full min-h-0 items-stretch gap-0.5">
      <span
        className={`relative flex h-full w-5 shrink-0 flex-col items-center rounded-t-[1px] border border-b-0 pt-0.5 sm:w-6 ${panel}`}
      >
        <span className="mt-0.5 flex min-h-[1rem] items-center justify-center leading-none">
          {face}
        </span>
        <span
          className={`absolute right-[2px] top-1/2 h-2.5 w-1 -translate-y-1/2 rounded-sm ${
            unit.available ? 'bg-concrete-200/80' : 'bg-concrete-600'
          }`}
        />
      </span>

      {/* Unit number — top-right of the door */}
      <span
        className={`min-w-0 flex-1 self-start truncate pt-0.5 text-left text-[10px] font-bold leading-tight tracking-tight sm:text-[11px] ${
          !unit.available
            ? 'text-concrete-500'
            : selected || atPlayer
              ? 'text-signal'
              : 'text-concrete-100'
        }`}
      >
        {plate}
      </span>
    </span>
  );

  const sizeCls = phone
    ? 'flex h-full min-h-[40px] w-full max-w-[4.5rem] items-end'
    : 'flex h-full max-h-12 w-full max-w-[4.5rem] items-end';

  if (!unit.available) {
    return (
      <div title={`${unit.label} — ${meta}`} className={sizeCls}>
        {shell}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      title={
        pathHint > 0
          ? `${unit.label} · ${meta} · ~${pathHint} min`
          : `${unit.label} · ${meta}`
      }
      className={`${sizeCls} transition disabled:cursor-default ${
        selected ? 'z-10 ring-1 ring-signal/60' : ''
      } ${interactive ? 'hover:brightness-110' : 'opacity-55'}`}
    >
      {shell}
    </button>
  );
}

const BAND_FILL = ['bg-concrete-400', 'bg-signal', 'bg-signal', 'bg-hiss', 'bg-hiss'];

function HeatGauge({
  heat,
  band,
  dc,
  hunting,
  compact = false,
}: {
  heat: number;
  band: (typeof HEAT_BANDS)[number];
  dc: number;
  hunting: boolean;
  compact?: boolean;
}) {
  const pct = Math.min(100, (heat / HEAT_MAX) * 100);
  const idx = HEAT_BANDS.indexOf(band);
  const next = HEAT_BANDS[idx + 1];

  return (
    <div
      className={`shrink-0 border-b border-concrete-600 bg-concrete-900/60 px-3 ${
        compact ? 'py-1' : 'py-1.5'
      }`}
    >
      <div className="mb-0.5 flex items-baseline justify-between gap-3">
        <span className="signage text-2xs text-concrete-400">
          Block heat ·{' '}
          <span
            className={
              hunting
                ? 'text-hiss'
                : idx >= 3
                  ? 'text-hiss'
                  : idx >= 1
                    ? 'text-signal'
                    : 'text-concrete-200'
            }
          >
            {band.label}
          </span>{' '}
          <span className="tabular-nums text-concrete-400">
            {heat}/{HEAT_MAX}
          </span>
        </span>
        <span className="text-2xs tabular-nums text-concrete-400">
          {band.dcStep > 0 ? `descent DC ${dc}` : 'descent free'}
        </span>
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-sm bg-concrete-800">
        <div
          className={`h-full transition-all duration-300 ${BAND_FILL[idx]} ${
            hunting ? 'pulse-danger' : ''
          }`}
          style={{ width: `${pct}%` }}
        />
        {HEAT_BANDS.slice(1).map((b) => (
          <span
            key={b.at}
            className="absolute top-0 h-full w-px bg-concrete-950/70"
            style={{ left: `${(b.at / HEAT_MAX) * 100}%` }}
          />
        ))}
      </div>

      {!compact && (
        <div className="mt-0.5 text-2xs leading-snug text-concrete-400">
          {band.note}
          {hunting && (
            <span className="text-hiss">
              {' '}
              {Math.round(HUNT_ELITE_CHANCE * 100)}% chance of a hunt on every door and stair.
            </span>
          )}
          {!hunting && next && (
            <span>
              {' '}
              Next: {next.label} at {next.at}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
