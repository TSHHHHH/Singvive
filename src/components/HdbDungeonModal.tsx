import { type ReactElement } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { useGame } from '../game/store';
import type { GuideTopic } from '../content/guideContent';
import { PlayerPin } from './PlayerPin';
import { GuideInfoButton } from './GuideInfoButton';
import { HdbContextPanel, unitUnderfoot } from './HdbContextPanel';
import { HdbZoomViewport, useIsPhoneLayout } from './HdbZoomViewport';
import {
  adjacentEdgeBlocks,
  BLOCK_META,
  canTargetCell,
  currentFloor,
  ENTRY_META,
  findPathToward,
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
  attemptableCells,
  reachableCells,
  retreatDc,
  SEAL_META,
  samePos,
  stairTravelHint,
  type HdbBlock,
  type HdbDungeon,
  type HdbPos,
  type HdbUnitNode,
  type SealKind,
} from '../game/hdbDungeon';
import type { Attributes } from '../game/types';

const UNIT_ICON: Record<HdbUnitNode['type'], IconName> = {
  residential: 'hdb.unit',
  corner_unit: 'hdb.cornerUnit',
  shelter_service: 'hdb.service',
  hazard: 'hdb.hazard',
};

const SEAL_ICON: Record<SealKind, IconName> = {
  collapsed: 'hdb.sealedCollapsed',
  flooded: 'hdb.sealedFlooded',
  welded: 'hdb.sealedWelded',
  burnt: 'hdb.sealedBurnt',
};

/**
 * Vertical corridor blockade on the left cell edge.
 * Clearable = hiss stripe + BLOCK; permanent collapse = muted hatch + GONE.
 * Compact glyph so short desktop rows still read (vertical label alone clips).
 */
function BlockadeStripe({ block }: { block: HdbBlock }) {
  const meta = BLOCK_META[block.kind];
  const clearable = block.breakable;
  return (
    <span
      className={`pointer-events-none absolute inset-y-0 left-0 z-10 flex w-3 flex-col items-center justify-center ${
        clearable
          ? 'bg-hiss shadow-[0_0_10px_rgba(217,45,45,0.65)]'
          : 'bg-concrete-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]'
      }`}
      title={
        clearable
          ? `${meta.label} — clear to pass`
          : `${meta.label} — permanent, no way through`
      }
      style={
        clearable
          ? undefined
          : {
              backgroundImage:
                'repeating-linear-gradient(135deg, transparent 0 3px, rgba(0,0,0,0.55) 3px 4px)',
            }
      }
    >
      {clearable ? (
        <>
          <span className="text-[10px] font-black leading-none text-black">‖</span>
          <span className="mt-0.5 max-h-[70%] overflow-hidden rotate-180 text-2xs font-black leading-none tracking-wide text-black [writing-mode:vertical-rl]">
            BLOCK
          </span>
        </>
      ) : (
        <Icon name="hdb.collapse" size={11} className="text-concrete-300" title="Gone" />
      )}
    </span>
  );
}

function StairGateBadge({ block }: { block: HdbBlock }) {
  const meta = BLOCK_META[block.kind];
  const clearable = block.breakable;
  return (
    <span
      className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex h-2.5 items-center justify-center whitespace-nowrap px-0.5 text-2xs font-bold uppercase leading-none tracking-wider shadow-[0_0_6px_rgba(217,45,45,0.7)] ${
        clearable
          ? 'bg-hiss/90 text-black'
          : 'bg-concrete-700 text-concrete-200'
      }`}
      title={
        clearable
          ? `${meta.label} — clear to pass`
          : `${meta.label} — permanent, no way through`
      }
    >
      ✕ {clearable ? meta.label.slice(0, 6) : (
        <Icon name="hdb.collapse" size={10} className="inline-block align-[-0.1em]" />
      )}
    </span>
  );
}

/**
 * Side-elevation HDB crawl: maze movement with auto-path, fog of war on
 * unvisited storeys, doors only when you're on the cell.
 */
export function HdbDungeonModal({
  onOpenGuide,
}: {
  onOpenGuide?: (topic: GuideTopic) => void;
} = {}) {
  const hdb = useGame((s) => s.hdb);
  const character = useGame((s) => s.character);
  const hdbGoTo = useGame((s) => s.hdbGoTo);
  const hdbLeave = useGame((s) => s.hdbLeave);
  const pendingSearch = useGame((s) => s.pendingSearch);
  const isPhone = useIsPhoneLayout();

  if (!hdb || !character) return null;

  const floor = currentFloor(hdb);
  const heat = Math.round(hdb.blockHeat);
  const band = heatBand(hdb.blockHeat);
  const hunting = isHunting(hdb);
  const dc = retreatDc(hdb);
  const reach = new Set(reachableCells(hdb).map(posKey));
  const attempt = new Set(attemptableCells(hdb).map(posKey));
  const unitHere = unitUnderfoot(hdb);
  const hasEdgeBlock = adjacentEdgeBlocks(hdb).length > 0;
  const dockExpanded = !isPhone || !!unitHere || hasEdgeBlock;
  const canLeave = hdb.currentLevel === 1 && !pendingSearch;
  const leaveTitle = pendingSearch
    ? 'Finish the unit search in the timeline first'
    : hdb.currentLevel !== 1
      ? 'Climb down to level 01 (void deck) to leave'
      : undefined;

  const go = (target: HdbPos) => {
    if (pendingSearch) return;
    if (samePos(hdb.pos, target)) return;
    if (!canTargetCell(hdb, target)) return;
    if (!attempt.has(posKey(target))) return;
    const toward = findPathToward(hdb, hdb.pos, target);
    if (!toward) return;
    hdbGoTo(target);
  };

  const cutaway = (
    <BuildingCutaway
      hdb={hdb}
      attrs={character.attributes}
      reach={reach}
      attempt={attempt}
      phone={isPhone}
      onGo={go}
    />
  );

  return (
    <div className="flex h-full w-full flex-col bg-concrete-950">
      <div className="flex shrink-0 items-center justify-between border-b border-concrete-600 bg-concrete-800 px-3 py-2 lg:px-4 lg:py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="signage truncate text-xs text-signal">{hdb.name}</div>
            {onOpenGuide && (
              <GuideInfoButton topic="hdb" onOpen={onOpenGuide} label="Inside the block" />
            )}
          </div>
          <div className="truncate text-2xs text-concrete-400">
            {hdb.archetype === 'shelter' ? 'Barricaded shelter' : 'Residential block'} ·{' '}
            {floor.layoutType === 'slab' ? 'slab' : 'point'} · {GROUND_LABEL[hdb.groundKind]} ·{' '}
            {hdb.height} storeys
          </div>
        </div>
        <button
          onClick={hdbLeave}
          disabled={!canLeave}
          title={leaveTitle}
          className="shrink-0 rounded border border-concrete-600 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-40"
        >
          ✕ Leave
        </button>
      </div>

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
              ? 'max-h-[46%] overflow-hidden'
              : 'overflow-hidden'
            : ''
        }`}
      >
        <HeatGauge heat={heat} band={band} dc={dc} hunting={hunting} compact={isPhone} />
        {isPhone && dockExpanded && <HdbContextPanel variant="full" />}
        {isPhone && !dockExpanded && (
          <p className="px-3 pb-2 text-2xs text-concrete-400">
            Pinch to zoom · tap a door at your cell to breach
          </p>
        )}
      </div>
    </div>
  );
}

function cellTravelTitle(
  hdb: HdbDungeon,
  attrs: Attributes,
  target: HdbPos,
  base: string,
): string {
  if (samePos(hdb.pos, target)) return base;
  const toward = findPathToward(hdb, hdb.pos, target);
  if (!toward) return base;
  const bits = [base];
  const mins = pathMinutes(toward.path);
  if (mins > 0) bits.push(`~${mins} min`);
  const risk = stairTravelHint(hdb, toward.path, attrs);
  if (risk) bits.push(risk);
  if (!toward.reached && toward.blockedBy) {
    const label = BLOCK_META[toward.blockedBy.kind].label.toLowerCase();
    bits.push(
      toward.blockedBy.breakable
        ? `stops at ${label} — clear to pass`
        : `stops at ${label} — no way through`,
    );
  }
  return bits.join(' · ');
}

function BuildingCutaway({
  hdb,
  attrs,
  reach,
  attempt,
  phone,
  onGo,
}: {
  hdb: HdbDungeon;
  attrs: Attributes;
  reach: Set<string>;
  attempt: Set<string>;
  phone: boolean;
  onGo: (pos: HdbPos) => void;
}) {
  const stairAt = new Map(hdb.stairs.map((s) => [s.column, s]));
  const levels = Array.from({ length: hdb.height }, (_, i) => hdb.height - i);
  const goneLabelCol =
    hdb.unitColumns[Math.floor(hdb.unitColumns.length / 2)] ??
    Math.floor(hdb.stripWidth / 2);

  // Phone: fixed tracks so the elevation has a real width to pan across.
  // Desktop: flexible unit columns fill the map column.
  const colTrack = Array.from({ length: hdb.stripWidth }, (_, col) => {
    // Wide enough for the ✕ STAIR gate badge; still narrower than unit bays.
    if (stairAt.has(col)) return phone ? '3.25rem' : '2.4rem';
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
      <div className="mb-1 flex shrink-0 items-baseline justify-between gap-3 text-2xs text-concrete-400">
        <span className="signage text-xs text-concrete-200">Block elevation</span>
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
              <div
                title={
                  seal
                    ? `${SEAL_META[seal.kind].label} — inaccessible`
                    : revealed
                      ? `Level ${label}`
                      : `Level ${label} — unexplored`
                }
                className={`flex items-center justify-center border-r border-concrete-700 text-xs font-bold tabular-nums ${
                  hereLevel
                    ? 'bg-signal/20 text-signal'
                    : seal
                      ? 'text-concrete-600'
                      : revealed
                        ? 'text-concrete-100'
                        : 'text-concrete-600'
                }`}
              >
                <span className="flex flex-col items-center leading-none">
                  {revealed || hereLevel ? label : '·'}
                </span>
              </div>

              {Array.from({ length: hdb.stripWidth }, (_, col) => {
                const cell: HdbPos = { level, column: col };
                const atPlayer = samePos(hdb.pos, cell);
                const reachable = reach.has(posKey(cell));
                const canAttempt = attempt.has(posKey(cell));
                const stair = stairAt.get(col);
                // Show maze gates on every revealed open floor — hiding them made
                // collapses read as “invisible walls” when pathing across the cutaway.
                const showBlocks = revealed && !seal;

                // Sealed storey: stairs stay visible as landmarks; hatch on the rest.
                if (seal) {
                  if (stair) {
                    return (
                      <div
                        key={`seal-s-${col}`}
                        className="relative flex min-h-[44px] items-center justify-center border-x border-concrete-700/40 bg-concrete-900/50 text-concrete-500 lg:min-h-0"
                        title={`${stair.kind === 'side' ? 'Side stair' : 'Stairwell'} ${stair.id} · ${SEAL_META[seal.kind].label} — inaccessible`}
                      >
                        <span
                          className="pointer-events-none absolute inset-0 opacity-35"
                          style={{
                            backgroundImage:
                              'repeating-linear-gradient(135deg, transparent 0 5px, rgba(255,255,255,0.14) 5px 6px)',
                          }}
                        />
                        <Icon name="hdb.stairwell" size={13} />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`seal-${col}`}
                      className="relative"
                      title={`${SEAL_META[seal.kind].label} — inaccessible`}
                    >
                      <span
                        className="absolute inset-0 opacity-55"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(135deg, transparent 0 4px, rgba(0,0,0,0.45) 4px 5px, rgba(255,255,255,0.08) 5px 6px)',
                        }}
                      />
                      {col === goneLabelCol && (
                        <span className="relative z-10 flex h-full items-center justify-center text-concrete-400">
                          <Icon
                            name={SEAL_ICON[seal.kind]}
                            size={phone ? 16 : 14}
                            title={SEAL_META[seal.kind].label}
                          />
                        </span>
                      )}
                    </div>
                  );
                }

                // Fogged storey: blank band, stairs faintly visible / clickable.
                if (!revealed) {
                  if (stair) {
                    return (
                      <button
                        key={`fog-s-${col}`}
                        type="button"
                        disabled={!canAttempt}
                        onClick={() => onGo(cell)}
                        title={cellTravelTitle(
                          hdb,
                          attrs,
                          cell,
                          `Stair ${stair.id} — climb into the unknown`,
                        )}
                        className={`relative flex min-h-[44px] items-center justify-center border-x border-concrete-700/40 bg-concrete-900/30 disabled:cursor-default lg:min-h-0 ${
                          reachable
                            ? 'bg-signal/10 text-concrete-300 ring-1 ring-inset ring-signal/25 hover:bg-signal/15'
                            : canAttempt
                              ? 'text-concrete-400 hover:bg-white/5'
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
                  const gate = showBlocks ? stairGateTouching(hdb, col, level) : null;
                  const stairBase =
                    stair.kind === 'side' ? `Side stair ${stair.id}` : `Stairwell ${stair.id}`;
                  return (
                    <button
                      key={`s-${col}`}
                      type="button"
                      disabled={!canAttempt && !atPlayer}
                      onClick={() => onGo(cell)}
                      title={cellTravelTitle(hdb, attrs, cell, stairBase)}
                      className={`relative flex min-h-[44px] items-center justify-center border-x disabled:cursor-default lg:min-h-0 ${
                        atPlayer
                          ? 'border-concrete-700/40 bg-concrete-900/40 text-concrete-300'
                          : reachable
                            ? 'border-concrete-500/50 bg-signal/10 text-concrete-200 ring-1 ring-inset ring-signal/25 hover:bg-signal/15'
                            : canAttempt
                              ? 'border-concrete-700/40 bg-concrete-900/40 text-concrete-300 hover:bg-white/5'
                              : 'border-concrete-700/40 bg-concrete-900/40 text-concrete-600'
                      }`}
                    >
                      {level === Math.ceil(hdb.height / 2) ? (
                        <span className="text-2xs font-bold">{stair.id}</span>
                      ) : (
                        <Icon name="hdb.stairwell" size={13} />
                      )}
                      {gate && <StairGateBadge block={gate} />}
                      {atPlayer && <HdbPlayerMarker />}
                    </button>
                  );
                }

                // Horizontal block marker between this cell and the next
                const blockLeft =
                  showBlocks && col > 0 ? hdb.blocks[horizKey(level, col - 1, col)] : null;

                const unit = unitByCol.get(col);

                if (!unit && voidDeck) {
                  return (
                    <button
                      key={`p-${col}`}
                      type="button"
                      disabled={!canAttempt && !atPlayer}
                      onClick={() => onGo(cell)}
                      title={cellTravelTitle(hdb, attrs, cell, 'Void deck')}
                      className={`relative flex min-h-[44px] items-center justify-center disabled:cursor-default lg:min-h-0 ${
                        reachable
                          ? 'bg-signal/10 ring-1 ring-inset ring-signal/20 hover:bg-white/5'
                          : canAttempt
                            ? 'hover:bg-white/5'
                            : ''
                      }`}
                    >
                      {blockLeft && <BlockadeStripe block={blockLeft} />}
                      <span
                        className="relative flex h-[78%] w-3 items-stretch justify-center"
                        aria-hidden
                      >
                        <span className="w-full rounded-[2px] border border-concrete-400/35 bg-gradient-to-b from-concrete-300/45 via-concrete-500/35 to-concrete-700/55 shadow-[inset_1px_0_0_rgba(255,255,255,0.12),inset_-1px_0_0_rgba(0,0,0,0.35)]" />
                      </span>
                      {atPlayer && <HdbPlayerMarker />}
                    </button>
                  );
                }

                if (!unit) {
                  return (
                    <button
                      key={`e-${col}`}
                      type="button"
                      disabled={!canAttempt && !atPlayer}
                      onClick={() => onGo(cell)}
                      title={cellTravelTitle(hdb, attrs, cell, 'Corridor')}
                      className={`relative min-h-[44px] disabled:cursor-default lg:min-h-0 ${
                        reachable
                          ? 'bg-signal/10 ring-1 ring-inset ring-signal/20 hover:bg-white/5'
                          : canAttempt
                            ? 'hover:bg-white/5'
                            : ''
                      }`}
                    >
                      {blockLeft && <BlockadeStripe block={blockLeft} />}
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
                    {blockLeft && <BlockadeStripe block={blockLeft} />}
                    <CorridorDoor
                      unit={unit}
                      interactive={canAttempt || atPlayer}
                      phone={phone}
                      travelTitle={
                        canAttempt && !atPlayer
                          ? cellTravelTitle(hdb, attrs, cell, `${unit.label} · ${
                              unit.state === 'cleared'
                                ? 'cleared'
                                : ENTRY_META[unit.entry].label
                            }`)
                          : undefined
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

      <div className="mt-1 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-none text-concrete-400">
        <span className="inline-flex items-center gap-1.5">
          <PlayerPin size="xs" />
          you
        </span>
        <span className="inline-flex items-center">? unread</span>
        <span className="inline-flex items-center">✕ boarded</span>
        <span className="inline-flex items-center">fog = unvisited</span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="hdb.sealedCollapsed" size={12} className="text-concrete-400" />
          hatch = sealed (gone)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-1 shrink-0 bg-hiss shadow-[0_0_4px_rgba(217,45,45,0.5)]" />
          BLOCK = clear to pass
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="hdb.collapse" size={12} className="text-concrete-400" />
          GONE = permanent collapse
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
  interactive,
  phone,
  travelTitle,
  onClick,
}: {
  unit: HdbUnitNode;
  interactive: boolean;
  phone: boolean;
  travelTitle?: string;
  onClick: () => void;
}) {
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
   * Player position is the pin, not a cell ring.
   * Unit number sits above the door frame.
   */
  let face: ReactElement | null = null;
  if (!unit.available) {
    face = (
      <span className="text-xs font-bold leading-none text-concrete-500" title="Boarded">
        ✕
      </span>
    );
  } else if (unit.state === 'unexplored') {
    face = (
      <span className="text-xs font-bold leading-none text-concrete-300" title="Unread">
        ?
      </span>
    );
  } else if (unit.type !== 'residential') {
    face = <Icon name={UNIT_ICON[unit.type]} size={12} />;
  }

  const unitNum = unit.label.replace(/^#/, '');

  const door = (
    <span className="flex max-w-full flex-col items-center justify-end">
      <span
        className="mb-0.5 max-w-[2.75rem] truncate text-center text-2xs font-bold leading-none tabular-nums text-concrete-200"
        title={unit.label}
      >
        {unitNum}
      </span>
      <span
        className={`relative flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-t-[1px] border border-b-0 sm:h-8 sm:w-8 ${panel}`}
      >
        <span className="flex items-center justify-center leading-none">{face}</span>
        <span
          className={`absolute right-[2px] top-1/2 h-2.5 w-1 -translate-y-1/2 rounded-sm ${
            unit.available ? 'bg-concrete-200/80' : 'bg-concrete-600'
          }`}
        />
      </span>
    </span>
  );

  const sizeCls = phone
    ? 'flex h-full min-h-[40px] w-full items-end justify-center'
    : 'flex h-full max-h-12 w-full items-end justify-center';

  if (!unit.available) {
    return (
      <div title={`${unit.label} — ${meta}`} className={sizeCls}>
        {door}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      title={travelTitle ?? `${unit.label} · ${meta}`}
      className={`${sizeCls} transition disabled:cursor-default ${
        interactive ? 'hover:brightness-110' : 'opacity-55'
      }`}
    >
      {door}
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
        <span className="signage text-xs text-concrete-400">
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
        <span className="text-xs tabular-nums text-concrete-400">
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
        <div className="mt-1 text-xs leading-snug text-concrete-400">
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
