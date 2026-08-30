import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { ATTRIBUTE_ICONS, ATTRIBUTE_LABELS } from '../game/character';
import { useGame, type HdbWalk } from '../game/store';
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
  findPathToward,
  GROUND_LABEL,
  heatBand,
  HEAT_BANDS,
  HEAT_MAX,
  horizKey,
  HUNT_ELITE_CHANCE,
  isHunting,
  isLevelRevealed,
  isRoofFloor,
  isVoidDeckFloor,
  pathMinutes,
  pathStoreysDropped,
  posKey,
  attemptableCells,
  reachableCells,
  retreatDc,
  retreatFailChance,
  descentIsChecked,
  pathUsesStairs,
  pathDescends,
  SEAL_META,
  samePos,
  senseChance,
  UNIT_META,
  type HdbBlock,
  type HdbDungeon,
  type HdbPos,
  type HdbUnitNode,
  type HdbUnitType,
  type SealKind,
} from '../game/hdbDungeon';
import type { AttributeKey, Attributes } from '../game/types';
import { msgOr, useT, type LocaleId, type TVars } from '../i18n';
import { tip } from './tips';

type PathLinkDirs = {
  left?: boolean;
  right?: boolean;
  up?: boolean;
  down?: boolean;
};

/** Edge directions from each path cell to its prev/next hop. */
function buildPathLinks(path: HdbPos[]): Map<string, PathLinkDirs> {
  const links = new Map<string, PathLinkDirs>();
  const touch = (key: string, dir: keyof PathLinkDirs) => {
    const cur = links.get(key) ?? {};
    cur[dir] = true;
    links.set(key, cur);
  };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const ak = posKey(a);
    const bk = posKey(b);
    if (a.level === b.level) {
      if (b.column > a.column) {
        touch(ak, 'right');
        touch(bk, 'left');
      } else {
        touch(ak, 'left');
        touch(bk, 'right');
      }
    } else if (a.column === b.column) {
      // Higher storey number sits above in the cutaway.
      if (b.level > a.level) {
        touch(ak, 'up');
        touch(bk, 'down');
      } else {
        touch(ak, 'down');
        touch(bk, 'up');
      }
    }
  }
  return links;
}

function unitFaceClass(type: HdbUnitType): string {
  if (type === 'trapped' || type === 'den') return 'text-hiss';
  if (type === 'burning' || type === 'nest') return 'text-amber-400';
  if (type === 'holdout' || type === 'shelter') return 'text-astral';
  if (type === 'notice') return 'text-signal';
  return 'text-concrete-100';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolated pin while a hop is in flight; drives hdbWalkStep when the hop clock elapses. */
function HdbWalkOverlay({
  root,
  walk,
}: {
  root: HTMLElement | null;
  walk: HdbWalk | null;
}) {
  const pinRef = useRef<HTMLDivElement>(null);
  const hdbWalkStep = useGame((s) => s.hdbWalkStep);

  useEffect(() => {
    if (!walk || !root) return;
    const from = walk.path[walk.index];
    const to = walk.path[walk.index + 1];
    if (!from || !to) return;
    let raf = 0;
    let fired = false;
    const tick = () => {
      const elapsed = Date.now() - walk.startedAt;
      const t = Math.min(1, elapsed / Math.max(1, walk.stepMs));
      const a = root.querySelector(`[data-hdb-cell="${posKey(from)}"]`);
      const b = root.querySelector(`[data-hdb-cell="${posKey(to)}"]`);
      const pin = pinRef.current;
      if (a instanceof HTMLElement && b instanceof HTMLElement && pin) {
        const rootRect = root.getBoundingClientRect();
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const scale = root.offsetWidth > 0 ? rootRect.width / root.offsetWidth : 1;
        const x =
          (lerp(ar.left + ar.width / 2, br.left + br.width / 2, t) - rootRect.left) / scale;
        const y = (lerp(ar.bottom, br.bottom, t) - rootRect.top) / scale;
        pin.style.left = `${x}px`;
        pin.style.top = `${y}px`;
      }
      if (elapsed >= walk.stepMs) {
        if (!fired) {
          fired = true;
          hdbWalkStep();
        }
      } else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [walk, root, hdbWalkStep]);

  if (!walk) return null;
  return (
    <div
      ref={pinRef}
      data-hdb-player
      className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-full"
      style={{ left: 0, top: 0 }}
    >
      <PlayerPin size="sm" />
    </div>
  );
}
function RouteSeg({
  className,
  blocked,
  dashed,
  vertical,
}: {
  className: string;
  blocked: boolean;
  dashed?: boolean;
  vertical?: boolean;
}) {
  const core = blocked ? '#d92d2d' : '#2bc4d9';
  const halo = blocked ? 'bg-hiss/30' : 'bg-astral/30';
  const dashAngle = vertical ? 180 : 90;
  return (
    <span className={`absolute ${className}`} aria-hidden>
      <span className={`absolute -inset-[2.5px] rounded-full ${halo}`} />
      <span
        className="absolute inset-0 rounded-full"
        style={
          dashed
            ? {
                backgroundImage: `repeating-linear-gradient(${dashAngle}deg, ${core} 0 3px, transparent 3px 7px)`,
              }
            : { backgroundColor: core }
        }
      />
    </span>
  );
}

/**
 * Continuous route ribbon along corridor floors and stair shafts.
 * Dual stroke + elbow junction so turns read as one path, not stacked bars.
 */
function RouteTrail({
  dirs,
  blocked,
  isDest,
  isStart,
}: {
  dirs: PathLinkDirs;
  blocked: boolean;
  isDest: boolean;
  isStart: boolean;
}) {
  const horiz = !!(dirs.left || dirs.right);
  const vert = !!(dirs.up || dirs.down);
  const corner = horiz && vert;
  const shaftOnly = vert && !horiz;
  const core = blocked ? 'bg-hiss' : 'bg-astral';

  // Horizontal ribbon: full width, or half toward the neighbour; corners
  // always reach the centre so they meet the shaft.
  let horizCls = '';
  if (horiz) {
    if (dirs.left && dirs.right) horizCls = 'inset-x-0';
    else if (dirs.left) horizCls = 'left-0 right-1/2';
    else horizCls = 'left-1/2 right-0';
  }

  // Vertical ribbon. Corridor elbows meet the floor line; pure shaft hops
  // meet at cell centre so start/dest markers don't sit on the grid seam
  // with a stub past the stair icon.
  let vertCls = '';
  if (vert) {
    if (dirs.up && dirs.down) {
      vertCls = 'inset-y-0';
    } else if (dirs.up && corner) {
      vertCls = 'top-0 bottom-[5px]';
    } else if (dirs.down && corner) {
      // Arrive from below into a floor turn — tiny join only.
      vertCls = 'bottom-0 h-[5px]';
    } else if (dirs.up) {
      // Toward centre from the cell above (or from centre up to the top edge).
      vertCls = 'top-0 bottom-1/2';
    } else {
      vertCls = 'top-1/2 bottom-0';
    }
  }

  // Elbows + corridor endpoints only. Shaft start uses the player pin;
  // shaft dest uses the centre ring — floor nubs on seams looked redundant.
  const showNub = corner || (horiz && (isDest || isStart));
  const destOnFloor = isDest && !shaftOnly;
  const destOnShaft = isDest && shaftOnly;

  return (
    <>
      <span className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
        <span
          className={`absolute inset-0 ${
            isDest
              ? blocked
                ? 'bg-hiss/28 ring-1 ring-inset ring-hiss/45'
                : 'bg-astral/22 ring-1 ring-inset ring-astral/40'
              : blocked
                ? 'bg-hiss/8'
                : 'bg-astral/6'
          }`}
        />
      </span>

      <span
        className={`pointer-events-none absolute inset-0 z-[8] hdb-route-ribbon ${
          blocked ? 'hdb-route-ribbon--blocked' : ''
        }`}
        aria-hidden
      >
        {horiz && (
          <RouteSeg
            blocked={blocked}
            dashed={blocked}
            className={`bottom-[5px] h-[3px] ${horizCls}`}
          />
        )}
        {vert && (
          <RouteSeg
            blocked={blocked}
            dashed={blocked}
            vertical
            className={`left-1/2 w-[3px] -translate-x-1/2 ${vertCls}`}
          />
        )}
        {showNub && (
          <span
            className={`absolute bottom-[4px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${core}`}
          />
        )}
        {destOnFloor && (
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2">
            <span
              className={`block h-3.5 w-3.5 rounded-full border-2 hdb-route-dest ${
                blocked ? 'border-hiss' : 'border-astral'
              }`}
            />
          </span>
        )}
        {destOnShaft && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span
              className={`block h-3.5 w-3.5 rounded-full border-2 hdb-route-dest ${
                blocked ? 'border-hiss' : 'border-astral'
              }`}
            />
          </span>
        )}
      </span>
    </>
  );
}
const SEAL_ICON: Record<SealKind, IconName> = {
  collapsed: 'hdb.sealedCollapsed',
  flooded: 'hdb.sealedFlooded',
  welded: 'hdb.sealedWelded',
  burnt: 'hdb.sealedBurnt',
};

/**
 * Vertical corridor blockade on the left cell edge.
 * Clearable = hiss stripe + BLOCK; permanent collapse = muted hatch + GONE.
 * Single vertical label (no companion glyph) so short rows still read cleanly.
 */
function BlockadeStripe({ block }: { block: HdbBlock }) {
  const { locale, t } = useT();
  const meta = BLOCK_META[block.kind];
  const label = msgOr(`ui.hdb.blockKind.${block.kind}.label`, meta.label, undefined, locale);
  const clearable = block.breakable;
  return (
    <span
      className={`pointer-events-none absolute inset-y-0 left-0 z-10 flex w-3 flex-col items-center justify-center overflow-hidden ${
        clearable
          ? 'bg-hiss shadow-[0_0_10px_rgba(217,45,45,0.65)]'
          : 'bg-concrete-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]'
      }`}
      {...tip(
        clearable
          ? t('ui.hdb.clearToPass', { label })
          : t('ui.hdb.permanent', { label }),
      )}
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
        <span className="max-h-full rotate-180 text-[9px] font-black leading-none tracking-wide text-black [writing-mode:vertical-rl]">
          {t('ui.hdb.blockStripe')}
        </span>
      ) : (
        <Icon name="hdb.collapse" size={11} className="text-concrete-300" title={t('ui.hdb.gone')} />
      )}
    </span>
  );
}

function StairGateBadge({
  block,
  edge,
}: {
  block: HdbBlock;
  /** Which cell edge the blocked shaft hop sits on. */
  edge: 'above' | 'below';
}) {
  const { locale, t } = useT();
  const meta = BLOCK_META[block.kind];
  const label = msgOr(`ui.hdb.blockKind.${block.kind}.label`, meta.label, undefined, locale);
  const clearable = block.breakable;
  return (
    <span
      className={`pointer-events-none absolute inset-x-0 z-10 flex h-2.5 items-center justify-center whitespace-nowrap px-0.5 text-2xs font-bold uppercase leading-none tracking-wider shadow-[0_0_6px_rgba(217,45,45,0.7)] ${
        edge === 'above' ? 'top-0' : 'bottom-0'
      } ${
        clearable
          ? 'bg-hiss/90 text-black'
          : 'bg-concrete-700 text-concrete-200'
      }`}
      {...tip(
        clearable
          ? t('ui.hdb.clearToPass', { label })
          : t('ui.hdb.permanent', { label }),
      )}
    >
      ✕ {clearable ? label.slice(0, 6) : (
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
  const { locale, t } = useT();
  const hdb = useGame((s) => s.hdb);
  const character = useGame((s) => s.character);
  const hdbGoTo = useGame((s) => s.hdbGoTo);
  const hdbLeave = useGame((s) => s.hdbLeave);
  const pendingSearch = useGame((s) => s.pendingSearch);
  const hdbWalk = useGame((s) => s.hdbWalk);
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
  const canLeave = hdb.currentLevel === 1 && !pendingSearch && !hdbWalk;
  const leaveTitle = pendingSearch
    ? t('ui.hdb.leaveNeedSearch')
    : hdbWalk
      ? t('ui.hdb.leaveNeedWalk')
      : hdb.currentLevel !== 1
        ? t('ui.hdb.leaveNeedVoidDeck')
        : undefined;
  const placeMeta = `${
    hdb.archetype === 'shelter' ? t('ui.hdb.shelter') : t('ui.hdb.residential')
  } · ${floor.layoutType === 'slab' ? t('ui.hdb.slab') : t('ui.hdb.point')} · ${msgOr(
    `ui.hdb.ground.${hdb.groundKind}`,
    GROUND_LABEL[hdb.groundKind],
    undefined,
    locale,
  )} · ${t('ui.hdb.storeys', { n: hdb.height })}`;

  const go = (target: HdbPos) => {
    if (pendingSearch || hdbWalk) return;
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
      walk={hdbWalk}
      onGo={go}
    />
  );

  return (
    <div className="flex h-full w-full flex-col bg-concrete-950">
      <div className="min-h-0 flex-1 overflow-hidden">
        {isPhone ? (
          <HdbZoomViewport
            followKey={hdbWalk ? `walk:${hdbWalk.index}:${hdbWalk.startedAt}` : posKey(hdb.pos)}
            layoutKey={dockExpanded ? 'dock' : 'map'}
          >
            <div className="p-1.5">{cutaway}</div>
          </HdbZoomViewport>
        ) : (
          <div className="h-full p-1.5 sm:p-2">{cutaway}</div>
        )}
      </div>

      <div
        className={`flex min-h-0 shrink-0 flex-col border-t border-concrete-600 bg-concrete-900/80 ${
          isPhone
            ? dockExpanded
              ? 'max-h-[min(46%,22rem)] overflow-hidden'
              : ''
            : ''
        }`}
      >
        <HdbStatusDock
          name={hdb.name}
          placeMeta={placeMeta}
          heat={heat}
          band={band}
          dc={dc}
          hunting={hunting}
          revealed={hdb.revealedLevels.length}
          height={hdb.height}
          canLeave={canLeave}
          leaveTitle={leaveTitle}
          onLeave={hdbLeave}
          onOpenGuide={onOpenGuide}
          senses={[
            {
              key: 'perception',
              value: character.attributes.perception,
              gives: t('ui.hdb.senseEncounterPct'),
            },
            {
              key: 'dexterity',
              value: character.attributes.dexterity,
              gives: t('ui.hdb.senseContainerType'),
            },
          ]}
        />
        {isPhone && dockExpanded && <HdbContextPanel variant="full" />}
      </div>
    </div>
  );
}

function cellTravelTitle(
  hdb: HdbDungeon,
  attrs: Attributes,
  target: HdbPos,
  base: string,
  t: (key: string, vars?: TVars) => string,
  locale: LocaleId,
): string {
  if (samePos(hdb.pos, target)) return base;
  const toward = findPathToward(hdb, hdb.pos, target);
  if (!toward) return base;
  const bits = [base];
  const mins = pathMinutes(toward.path);
  if (mins > 0) {
    const shown =
      mins < 1
        ? t('ui.hdb.secondsApprox', { n: Math.max(1, Math.round(mins * 60)) })
        : t('ui.hdb.minutesApprox', { n: Math.round(mins) });
    bits.push(shown);
  }
  const riskBits: string[] = [];
    if (pathUsesStairs(toward.path)) {
    if (isHunting(hdb)) {
      riskBits.push(t('ui.hdb.huntOnStairs', { n: Math.round(HUNT_ELITE_CHANCE * 100) }));
    }
    const dropped = pathStoreysDropped(toward.path);
    if (dropped > 0 && descentIsChecked(hdb)) {
      const failPct = Math.round(retreatFailChance(attrs, hdb) * 100);
      riskBits.push(
        t('ui.hdb.descentPerStorey', {
          n: dropped,
          dc: retreatDc(hdb),
          pct: failPct,
        }),
      );
    } else if (!isHunting(hdb) && !pathDescends(toward.path)) {
      riskBits.push(t('ui.hdb.climbFree'));
    }
  }
  if (riskBits.length) bits.push(riskBits.join(' · '));
  if (!toward.reached && toward.blockedBy) {
    const label = msgOr(
      `ui.hdb.blockKind.${toward.blockedBy.kind}.label`,
      BLOCK_META[toward.blockedBy.kind].label,
      undefined,
      locale,
    ).toLowerCase();
    bits.push(
      toward.blockedBy.breakable
        ? t('ui.hdb.stopsClear', { label })
        : t('ui.hdb.stopsBlocked', { label }),
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
  walk,
  onGo,
}: {
  hdb: HdbDungeon;
  attrs: Attributes;
  reach: Set<string>;
  attempt: Set<string>;
  phone: boolean;
  walk: HdbWalk | null;
  onGo: (pos: HdbPos) => void;
}) {
  const { locale, t } = useT();
  const [hoverTarget, setHoverTarget] = useState<HdbPos | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const stairAt = new Map(hdb.stairs.map((s) => [s.column, s]));
  const levels = Array.from({ length: hdb.height }, (_, i) => hdb.height - i);
  const goneLabelCol =
    hdb.unitColumns[Math.floor(hdb.unitColumns.length / 2)] ??
    Math.floor(hdb.stripWidth / 2);

  // Drop stale hover after a move or if the cell is no longer attemptable.
  const activeHover =
    hoverTarget &&
    !samePos(hdb.pos, hoverTarget) &&
    attempt.has(posKey(hoverTarget))
      ? hoverTarget
      : null;
  const preview = activeHover
    ? findPathToward(hdb, hdb.pos, activeHover)
    : null;
  const path = preview?.path ?? [];
  const pathKeys = new Set(path.map(posKey));
  const pathLinks = buildPathLinks(path);
  const pathBlocked = !!preview && !preview.reached;
  const hoverKey = activeHover ? posKey(activeHover) : null;
  const previewing = pathKeys.size > 0 || hoverKey !== null;
  const startKey = posKey(hdb.pos);

  const routeOverlay = (cellKey: string) => {
    const onPath = pathKeys.has(cellKey);
    const isDest = cellKey === hoverKey;
    if (!onPath && !isDest) return null;
    return (
      <RouteTrail
        dirs={pathLinks.get(cellKey) ?? {}}
        blocked={pathBlocked}
        isDest={isDest}
        isStart={cellKey === startKey}
      />
    );
  };

  const offRouteCls = (cellKey: string) => {
    if (!previewing) return '';
    const onRoute = pathKeys.has(cellKey) || cellKey === hoverKey;
    return onRoute ? '' : 'opacity-35';
  };

  const hoverProps = (cell: HdbPos, enabled: boolean) => {
    if (!enabled) return {};
    return {
      onMouseEnter: () => setHoverTarget(cell),
      onMouseLeave: () =>
        setHoverTarget((cur) => (cur && samePos(cur, cell) ? null : cur)),
      onFocus: () => setHoverTarget(cell),
      onBlur: () =>
        setHoverTarget((cur) => (cur && samePos(cur, cell) ? null : cur)),
    };
  };

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
      <div
        ref={setRoot}
        className={
          phone
            ? 'relative flex w-max min-w-full flex-col rounded-sm border border-concrete-600 bg-concrete-950'
            : 'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-concrete-600 bg-concrete-950'
        }
        onMouseLeave={() => setHoverTarget(null)}
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
                  : isRoofFloor(f)
                    ? 'bg-[#1a2836]'
                    : revealed
                      ? 'bg-concrete-900/40'
                      : 'bg-concrete-950'
              }`}
              style={{ gridTemplateColumns: `${labelCol} ${colTrack}` }}
            >
              <div
                {...tip(
                  seal
                    ? t('ui.hdb.inaccessible', {
                        label: msgOr(
                          `ui.hdb.sealKind.${seal.kind}.label`,
                          SEAL_META[seal.kind].label,
                          undefined,
                          locale,
                        ),
                      })
                      : isRoofFloor(f)
                        ? t('ui.hdb.roofDeck')
                        : revealed
                          ? t('ui.hdb.level', { nn: label })
                          : t('ui.hdb.levelUnexplored', { nn: label }),
                )}
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
                  {isRoofFloor(f)
                    ? t('ui.hdb.roofShort')
                    : revealed || hereLevel
                      ? label
                      : '·'}
                </span>
              </div>

              {Array.from({ length: hdb.stripWidth }, (_, col) => {
                const cell: HdbPos = { level, column: col };
                const cellKey = posKey(cell);
                const atPlayer = samePos(hdb.pos, cell);
                const reachable = reach.has(cellKey);
                const canAttempt = attempt.has(cellKey);
                const trail = routeOverlay(cellKey);
                const dim = offRouteCls(cellKey);
                const stair = stairAt.get(col);
                // Show maze gates on every revealed open floor — hiding them made
                // collapses read as “invisible walls” when pathing across the cutaway.
                const showBlocks = revealed && !seal;
                // Drawn on the higher column’s left edge (includes stair mouths).
                const blockLeft =
                  showBlocks && col > 0 ? hdb.blocks[horizKey(level, col - 1, col)] : null;

                // Sealed storey: stairs stay visible as landmarks; hatch on the rest.
                if (seal) {
                  if (stair) {
                    return (
                      <div
                        key={`seal-s-${col}`}
                        data-hdb-cell={cellKey}
                        className={`relative flex min-h-[44px] items-center justify-center border-x border-concrete-700/40 bg-concrete-900/50 text-concrete-500 lg:min-h-0 ${dim}`}
                        {...tip(`${stair.kind === 'side' ? t('ui.hdb.sideStair', { id: stair.id }) : t('ui.hdb.stairwell', { id: stair.id })} · ${t('ui.hdb.inaccessible', {
                          label: msgOr(
                            `ui.hdb.sealKind.${seal.kind}.label`,
                            SEAL_META[seal.kind].label,
                            undefined,
                            locale,
                          ),
                        })}`, { follow: true })}
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
                      data-hdb-cell={cellKey}
                      className={`relative h-full min-h-0 overflow-hidden [container-type:size] ${dim}`}
                      {...tip(t('ui.hdb.inaccessible', {
                        label: msgOr(
                          `ui.hdb.sealKind.${seal.kind}.label`,
                          SEAL_META[seal.kind].label,
                          undefined,
                          locale,
                        ),
                      }), { follow: true })}
                    >
                      <span
                        className="absolute inset-0 opacity-55"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(135deg, transparent 0 4px, rgba(0,0,0,0.45) 4px 5px, rgba(255,255,255,0.08) 5px 6px)',
                        }}
                      />
                      {col === goneLabelCol && (
                        <span
                          className="relative z-10 flex h-full w-full items-center justify-center text-concrete-200"
                          style={{ fontSize: 'min(86cqmin, 2.5rem)' }}
                        >
                          <Icon
                            name={SEAL_ICON[seal.kind]}
                            className="drop-shadow-[0_0_1px_currentColor]"
                            title={msgOr(
                              `ui.hdb.sealKind.${seal.kind}.label`,
                              SEAL_META[seal.kind].label,
                              undefined,
                              locale,
                            )}
                          />
                        </span>
                      )}
                    </div>
                  );
                }

                // Fogged storey: blank band, stairs faintly visible / clickable.
                // Path can still thread fog corridor cells — paint the trail there.
                if (!revealed) {
                  if (stair) {
                    return (
                      <button
                        key={`fog-s-${col}`}
                        data-hdb-cell={cellKey}
                        type="button"
                        disabled={!canAttempt}
                        onClick={() => onGo(cell)}
                        {...hoverProps(cell, canAttempt)}
                        {...tip(cellTravelTitle(
                          hdb,
                          attrs,
                          cell,
                          t('ui.hdb.fogClimb', { id: stair.id }),
                          t,
                          locale,
                        ), { follow: true })}
                        className={`relative flex min-h-[44px] items-center justify-center border-x border-concrete-700/40 bg-concrete-900/30 disabled:cursor-default lg:min-h-0 ${dim} ${
                          trail
                            ? 'text-concrete-200'
                            : reachable
                              ? 'bg-signal/10 text-concrete-300 ring-1 ring-inset ring-signal/25 hover:bg-signal/15'
                              : canAttempt
                                ? 'text-concrete-400 hover:bg-white/5'
                                : 'text-concrete-700'
                        }`}
                      >
                        {trail}
                        <Icon name="hdb.stairwell" size={12} className="relative z-[6]" />
                        {atPlayer && !walk && <HdbPlayerMarker />}
                      </button>
                    );
                  }
                  return (
                    <div
                      key={`fog-${col}`}
                      data-hdb-cell={cellKey}
                      className={`relative bg-concrete-950/80 ${dim}`}
                    >
                      {trail}
                    </div>
                  );
                }

                if (stair) {
                  const gates = showBlocks ? stairGatesTouching(hdb, col, level) : [];
                  const stairBase =
                    stair.kind === 'side'
                      ? t('ui.hdb.sideStair', { id: stair.id })
                      : t('ui.hdb.stairwell', { id: stair.id });
                  return (
                    <button
                      key={`s-${col}`}
                      data-hdb-cell={cellKey}
                      type="button"
                      disabled={!canAttempt && !atPlayer}
                      onClick={() => onGo(cell)}
                      {...hoverProps(cell, canAttempt && !atPlayer)}
                      {...tip(cellTravelTitle(hdb, attrs, cell, stairBase, t, locale), { follow: true })}
                      className={`relative flex min-h-[44px] items-center justify-center border-x disabled:cursor-default lg:min-h-0 ${dim} ${
                        atPlayer
                          ? 'border-concrete-700/40 bg-concrete-900/40 text-concrete-300'
                          : reachable
                            ? 'border-concrete-500/50 bg-signal/10 text-concrete-200 ring-1 ring-inset ring-signal/25 hover:bg-signal/15'
                            : canAttempt
                              ? 'border-concrete-700/40 bg-concrete-900/40 text-concrete-300 hover:bg-white/5'
                              : 'border-concrete-700/40 bg-concrete-900/40 text-concrete-600'
                      }`}
                    >
                      {trail}
                      {blockLeft && <BlockadeStripe block={blockLeft} />}
                      <span className="relative z-[6]">
                        {level === Math.ceil(hdb.height / 2) ? (
                          <span className="text-2xs font-bold">{stair.id}</span>
                        ) : (
                          <Icon name="hdb.stairwell" size={13} />
                        )}
                      </span>
                      {gates.map((g) => (
                        <StairGateBadge
                          key={`${g.edge}-${g.block.kind}`}
                          block={g.block}
                          edge={g.edge}
                        />
                      ))}
                      {atPlayer && !walk && <HdbPlayerMarker />}
                    </button>
                  );
                }

                const unit = unitByCol.get(col);

                if (!unit && voidDeck) {
                  return (
                    <button
                      key={`p-${col}`}
                      type="button"
                      disabled={!canAttempt && !atPlayer}
                      onClick={() => onGo(cell)}
                      {...hoverProps(cell, canAttempt && !atPlayer)}
                      {...tip(cellTravelTitle(hdb, attrs, cell, t('ui.hdb.voidDeck'), t, locale), { follow: true })}
                      className={`relative flex min-h-[44px] items-center justify-center disabled:cursor-default lg:min-h-0 ${dim} ${
                        !trail && reachable
                          ? 'bg-signal/10 ring-1 ring-inset ring-signal/20 hover:bg-white/5'
                          : canAttempt
                            ? 'hover:bg-white/5'
                            : ''
                      }`}
                    >
                      {trail}
                      {blockLeft && <BlockadeStripe block={blockLeft} />}
                      <span
                        className="relative z-[6] flex h-[78%] w-3 items-stretch justify-center"
                        aria-hidden
                      >
                        <span className="w-full rounded-[2px] border border-concrete-400/35 bg-gradient-to-b from-concrete-300/45 via-concrete-500/35 to-concrete-700/55 shadow-[inset_1px_0_0_rgba(255,255,255,0.12),inset_-1px_0_0_rgba(0,0,0,0.35)]" />
                      </span>
                      {atPlayer && !walk && <HdbPlayerMarker />}
                    </button>
                  );
                }

                if (!unit) {
                  return (
                    <button
                      key={`e-${col}`}
                      data-hdb-cell={cellKey}
                      type="button"
                      disabled={!canAttempt && !atPlayer}
                      onClick={() => onGo(cell)}
                      {...hoverProps(cell, canAttempt && !atPlayer)}
                      {...tip(cellTravelTitle(hdb, attrs, cell, t('ui.hdb.corridor'), t, locale), { follow: true })}
                      className={`relative min-h-[44px] disabled:cursor-default lg:min-h-0 ${dim} ${
                        !trail && reachable
                          ? 'bg-signal/10 ring-1 ring-inset ring-signal/20 hover:bg-white/5'
                          : canAttempt
                            ? 'hover:bg-white/5'
                            : ''
                      }`}
                    >
                      {trail}
                      {blockLeft && <BlockadeStripe block={blockLeft} />}
                      {atPlayer && !walk && <HdbPlayerMarker />}
                    </button>
                  );
                }

                return (
                  <div
                    key={unit.id}
                    data-hdb-cell={cellKey}
                    className={`relative flex min-h-[44px] items-end justify-center px-0.5 pb-0 lg:min-h-0 ${dim} ${
                      !trail && reachable && !atPlayer
                        ? 'bg-signal/10 ring-1 ring-inset ring-signal/20'
                        : ''
                    }`}
                  >
                    {trail}
                    {blockLeft && <BlockadeStripe block={blockLeft} />}
                    <CorridorDoor
                      unit={unit}
                      interactive={canAttempt || atPlayer}
                      phone={phone}
                      travelTitle={
                        canAttempt && !atPlayer
                          ? cellTravelTitle(
                              hdb,
                              attrs,
                              cell,
                              `${unit.label} · ${
                                unit.state === 'cleared'
                                  ? t('ui.hdb.doorCleared')
                                  : msgOr(
                                      `ui.hdb.unit.${unit.type}.label`,
                                      UNIT_META[unit.type].label,
                                      undefined,
                                      locale,
                                    )
                              }`,
                              t,
                              locale,
                            )
                          : undefined
                      }
                      onClick={() => onGo(cell)}
                      {...hoverProps(cell, canAttempt && !atPlayer)}
                    />
                    {atPlayer && !walk && <HdbPlayerMarker />}
                  </div>
                );
              })}
            </div>
          );
        })}
        <HdbWalkOverlay root={root} walk={walk} />
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

function stairGatesTouching(
  dungeon: HdbDungeon,
  col: number,
  level: number,
): { block: HdbBlock; edge: 'above' | 'below' }[] {
  const out: { block: HdbBlock; edge: 'above' | 'below' }[] = [];
  for (const [k, b] of Object.entries(dungeon.blocks)) {
    if (!k.startsWith(`v:${col}:`)) continue;
    const m = /^v:\d+:(\d+)-(\d+)$/.exec(k);
    if (!m) continue;
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    // lo is the lower storey — the blocked hop sits on its top edge / hi's bottom.
    if (level === lo) out.push({ block: b, edge: 'above' });
    if (level === hi) out.push({ block: b, edge: 'below' });
  }
  return out;
}

function CorridorDoor({
  unit,
  interactive,
  phone,
  travelTitle,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: {
  unit: HdbUnitNode;
  interactive: boolean;
  phone: boolean;
  travelTitle?: string;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const { locale, t } = useT();
  const meta = unit.available
    ? unit.state === 'cleared'
      ? t('ui.hdb.doorCleared')
      : msgOr(`ui.hdb.unit.${unit.type}.label`, UNIT_META[unit.type].label, undefined, locale)
    : t('ui.hdb.doorBoardedShut');

  /**
   * Door face = room type only. Entry (locked / half-open / …) and encounter odds
   * live on the bottom-right location card.
   */
  const panel =
    !unit.available
      ? 'bg-[#2a2a2c] border-concrete-600'
      : unit.state === 'cleared'
        ? 'bg-[#1c1c1e] border-concrete-700 opacity-55'
        : unit.state === 'breached'
          ? 'bg-[#3a2a1a] border-signal/70'
          : 'bg-[#323028] border-concrete-500';

  let face: ReactElement | null = null;
  if (!unit.available) {
    face = (
      <span
        className="text-xs font-bold leading-none text-concrete-500"
        {...tip(t('ui.hdb.doorBoardedShutTitle'))}
      >
        ✕
      </span>
    );
  } else if (unit.state === 'cleared') {
    face = (
      <span
        className="text-2xs font-bold leading-none text-concrete-600"
        {...tip(t('ui.hdb.doorClearedTitle'))}
      >
        ·
      </span>
    );
  } else {
    const typeMeta = UNIT_META[unit.type];
    const typeLabel = msgOr(
      `ui.hdb.unit.${unit.type}.label`,
      typeMeta.label,
      undefined,
      locale,
    );
    face = (
      <Icon
        name={typeMeta.icon}
        size={phone ? 12 : 13}
        title={typeLabel}
        className={unitFaceClass(unit.type)}
      />
    );
  }

  const unitNum = unit.label.replace(/^#/, '');

  const door = (
    <span className="flex max-w-full flex-col items-center justify-end">
      <span
        className="mb-0.5 max-w-[2.75rem] truncate text-center text-2xs font-bold leading-none tabular-nums text-concrete-200"
        {...tip(unit.label)}
      >
        {unitNum}
      </span>
      <span
        className={`relative flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-t-[1px] border border-b-0 sm:h-8 sm:w-8 ${panel}`}
      >
        <span className="flex items-center justify-center leading-none">{face}</span>
        <span
          className={`absolute right-[2px] top-1/2 h-2.5 w-1 -translate-y-1/2 rounded-sm ${
            !unit.available
              ? 'bg-concrete-600'
              : 'bg-concrete-200/80'
          }`}
        />
      </span>
    </span>
  );

  const sizeCls = phone
    ? 'relative z-[6] flex h-full min-h-[40px] w-full items-end justify-center'
    : 'relative z-[6] flex h-full max-h-12 w-full items-end justify-center';

  if (!unit.available) {
    return (
      <div {...tip(`${unit.label} — ${meta}`, { follow: true })} className={sizeCls}>
        {door}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      {...tip(travelTitle ?? `${unit.label} · ${meta}`, { follow: true })}
      className={`${sizeCls} transition disabled:cursor-default ${
        interactive ? 'hover:brightness-110' : 'opacity-55'
      }`}
    >
      {door}
    </button>
  );
}

const BAND_FILL = ['bg-concrete-400', 'bg-signal', 'bg-signal', 'bg-hiss', 'bg-hiss'];

/** Identity + heat + leave in one bottom dock; legend / senses / notes behind expand. */
function HdbStatusDock({
  name,
  placeMeta,
  heat,
  band,
  dc,
  hunting,
  revealed,
  height,
  canLeave,
  leaveTitle,
  onLeave,
  onOpenGuide,
  senses,
}: {
  name: string;
  placeMeta: string;
  heat: number;
  band: (typeof HEAT_BANDS)[number];
  dc: number;
  hunting: boolean;
  revealed: number;
  height: number;
  canLeave: boolean;
  leaveTitle?: string;
  onLeave: () => void;
  onOpenGuide?: (topic: GuideTopic) => void;
  senses: { key: AttributeKey; value: number; gives: string }[];
}) {
  const { locale, t } = useT();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const pct = Math.min(100, (heat / HEAT_MAX) * 100);
  const idx = HEAT_BANDS.indexOf(band);
  const next = HEAT_BANDS[idx + 1];
  const bandColor = hunting
    ? 'text-hiss'
    : idx >= 3
      ? 'text-hiss'
      : idx >= 1
        ? 'text-signal'
        : 'text-concrete-200';

  const bandLabel = msgOr(
    `ui.hdb.heatBand.${band.label}.label`,
    band.label,
    undefined,
    locale,
  );
  const bandNote = msgOr(`ui.hdb.heatBand.${band.label}.note`, band.note, undefined, locale);
  const descentBit = t('ui.hdb.descentNeedsAttrs', { dc });
  const nextBit =
    !hunting && next
      ? t('ui.hdb.nextBand', {
          label: msgOr(`ui.hdb.heatBand.${next.label}.label`, next.label, undefined, locale),
          at: next.at,
        })
      : '';

  return (
    <div className="shrink-0 border-b border-concrete-600 bg-concrete-900/60 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="signage truncate text-xs text-signal" {...tip(placeMeta)}>
            {name}
          </span>
          <span
            className="shrink-0 text-2xs tabular-nums text-concrete-500"
            {...tip(t('ui.hdb.storeysRevealed', { revealed, height }))}
          >
            {revealed}/{height}
          </span>
          {onOpenGuide && (
            <GuideInfoButton topic="hdb" onOpen={onOpenGuide} label={t('ui.hdb.guide')} />
          )}
        </div>
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-label={detailsOpen ? t('ui.hdb.ariaHideDetails') : t('ui.hdb.ariaShowDetails')}
          {...tip(detailsOpen ? t('ui.hdb.hideDetails') : t('ui.hdb.showDetails'))}
          onClick={() => setDetailsOpen((o) => !o)}
          className="shrink-0 rounded border border-concrete-600 px-1.5 py-1 text-2xs text-concrete-400 hover:bg-white/5"
        >
          {detailsOpen ? '▴' : '▾'}
        </button>
        <button
          type="button"
          onClick={onLeave}
          disabled={!canLeave}
          {...tip(leaveTitle)}
          className="shrink-0 rounded border border-concrete-600 px-2.5 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
        >
          {t('ui.hdb.leave')}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((o) => !o)}
        className="mt-1 w-full text-left"
        {...tip(t('ui.hdb.tapDetails'))}
      >
        <div className="mb-0.5 text-xs leading-snug text-concrete-400">
          <span className="signage text-concrete-500">{t('ui.hdb.heat')}</span>{' '}
          <span className={`signage ${bandColor}`}>{bandLabel}</span>{' '}
          <span className="tabular-nums text-concrete-300">
            {heat}/{HEAT_MAX}
          </span>
          <span className="text-concrete-500"> — </span>
          {bandNote} {descentBit}
          {hunting && (
            <span className="text-hiss">
              {' '}
              {t('ui.hdb.huntChance', { n: Math.round(HUNT_ELITE_CHANCE * 100) })}
            </span>
          )}
          {nextBit}
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
      </button>

      {detailsOpen && (
        <div className="mt-1.5 space-y-1.5 border-t border-concrete-700/80 pt-1.5">
          <HdbSymbolKey />
          <div
            className="flex flex-wrap gap-1.5 text-2xs"
            {...tip(t('ui.hdb.senseCorridor'))}
          >
            {senses.map((s) => (
              <span
                key={s.key}
                className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 ${
                  senseChance(s.value) >= 0.6
                    ? 'border-astral/30 text-astral/80'
                    : 'border-concrete-700/80 text-concrete-500'
                }`}
              >
                <Icon name={ATTRIBUTE_ICONS[s.key]} size={11} title={ATTRIBUTE_LABELS[s.key]} />
                <span className="truncate">
                  {t('ui.hdb.senseArrow', {
                    value: s.value,
                    gives: s.gives,
                    pct: Math.round(senseChance(s.value) * 100),
                  })}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HdbSymbolKey() {
  const { locale, t } = useT();
  const roomTypes = (Object.keys(UNIT_META) as (keyof typeof UNIT_META)[]).map((id) => {
    const m = UNIT_META[id];
    const label = msgOr(`ui.hdb.unit.${id}.label`, m.label, undefined, locale);
    const blurb = msgOr(`ui.hdb.unit.${id}.blurb`, m.blurb, undefined, locale);
    return (
      <span key={id} className="inline-flex items-center gap-1" {...tip(blurb)}>
        <Icon
          name={m.icon}
          size={11}
          className={unitFaceClass(id)}
        />
        {label.toLowerCase()}
      </span>
    );
  });

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs leading-none text-concrete-400">
      <span className="inline-flex items-center gap-1.5">
        <PlayerPin size="xs" />
        {t('ui.hdb.legendYou')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="relative inline-block h-[3px] w-5 shrink-0">
          <span className="absolute -inset-y-[2px] inset-x-0 rounded-full bg-astral/35" />
          <span className="absolute inset-0 rounded-full bg-astral" />
        </span>
        {t('ui.hdb.legendHover')}
      </span>
      {roomTypes}
      <span className="inline-flex items-center gap-1">
        <span className="text-2xs font-bold text-concrete-500">✕</span> {t('ui.hdb.legendBoarded')}
      </span>
      <span className="inline-flex items-center gap-1 text-concrete-500">
        {t('ui.hdb.legendDim')}
      </span>
      <span className="inline-flex items-center">{t('ui.hdb.legendFog')}</span>
      <span className="inline-flex items-center gap-1.5">
        <Icon name="hdb.sealedCollapsed" size={12} className="text-concrete-400" />
        {t('ui.hdb.legendHatch')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-1 shrink-0 bg-hiss shadow-[0_0_4px_rgba(217,45,45,0.5)]" />
        {t('ui.hdb.legendBlock')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icon name="hdb.collapse" size={12} className="text-concrete-400" />
        {t('ui.hdb.legendGone')}
      </span>
    </div>
  );
}
