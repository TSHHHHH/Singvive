import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { itemDef } from '../game/loot';
import { codeOnLine, journeyStrip } from '../game/mrt';
import {
  HAZARD_META,
  PRESSURE_BANDS,
  PRESSURE_MAX,
  TUNNEL_NODE_META,
  canExitHere,
  crawlPlace,
  currentNode,
  hazardDc,
  isArrival,
  isRevealed,
  nodeThreat,
  pressureBand,
  type TunnelNode,
  type TunnelRun,
} from '../game/tunnelRun';
import { useMrtNetwork } from './MrtOverlay';
import { CrawlPids } from './StationStrip';

/**
 * One planned crawl. The header is an in-train station strip — next stop,
 * livery, transfers — then a 2.5D bore: a main running tunnel with side
 * branches that follow the node graph, nearer discs larger.
 *
 * Replaces the map for the length of the walk (it is a view, not a modal).
 */

const BAND_FILL = ['bg-concrete-500', 'bg-signal/70', 'bg-signal', 'bg-hiss/80', 'bg-hiss'];

/** Tilt of the floor plane, degrees. Matches a receding bore. */
const TILT = 58;
/** Half-width of the spine running tunnel, in lane-offset units. */
const MAIN_HALF = 0.36;
/** Side branches — clearly thinner than the through running tunnel. */
const BRANCH_HALF = 0.16;
/** Station box at a platform, where branches merge. */
const PLATFORM_HALF = 0.48;

export function TunnelRunView() {
  const { run, offer, step, rest, treat, accept, decline, exitHere } = useGame(
    useShallow((s) => ({
      run: s.tunnel,
      offer: s.tunnelOffer,
      step: s.tunnelStep,
      rest: s.tunnelRest,
      treat: s.tunnelTreat,
      accept: s.tunnelAcceptOffer,
      decline: s.tunnelDeclineOffer,
      exitHere: s.tunnelExitHere,
    })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const net = useMrtNetwork(true);

  const strip = useMemo(() => {
    if (!run) return null;
    const ids = run.stationIds?.length ? run.stationIds : [run.fromStation, run.toStation];
    const names = run.stationNames?.length ? run.stationNames : [run.fromName, run.toName];
    return journeyStrip(net, ids, {
      names,
      fallback: { code: run.lineCode, name: run.lineName, color: run.lineColor },
    });
  }, [run, net]);

  if (!run || !strip) return null;

  const here = currentNode(run);
  const ahead = here.next.map((id) => run.nodes[id]);
  const selected = (selectedId && run.nodes[selectedId]) || ahead[0] || here;
  const canWalk = ahead.some((n) => n.id === selected.id);
  const mayExit = canExitHere(run, here);
  const place = crawlPlace(run);
  const platformCodes: Record<string, string> = {};
  for (let i = 0; i < strip.stops.length; i++) {
    const stop = strip.stops[i];
    const hop = strip.hops[i - 1] ?? strip.hops[i];
    platformCodes[stop.id] = codeOnLine(stop, hop?.lineCode ?? '');
  }

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-concrete-950">
      <CrawlPids strip={strip} place={place} meters={run.meters} />

      <PressureGauge pressure={run.pressure} />

      {/* ---- the map ---- */}
      <TunnelMap
        run={run}
        selectedId={selected.id}
        platformCodes={platformCodes}
        onSelect={setSelectedId}
      />

      {/* ---- the camp you're standing in, if any ---- */}
      {here.kind === 'settlement' && (
        <CampPanel
          name={here.name}
          offer={offer}
          servicesUsed={!!here.servicesUsed}
          onRest={rest}
          onTreat={treat}
          onAccept={accept}
          onDecline={decline}
        />
      )}

      {/* ---- what you're looking at ---- */}
      <NodeDetail
        run={run}
        node={selected}
        canWalk={canWalk}
        mayExit={mayExit}
        onWalk={() => step(selected.id)}
        onExit={exitHere}
      />
    </div>
  );
}

/** How loud this walk has been. Nothing but your own noise moves it. */
function PressureGauge({ pressure }: { pressure: number }) {
  const band = pressureBand(pressure);
  const idx = PRESSURE_BANDS.indexOf(band);
  const next = PRESSURE_BANDS[idx + 1];

  return (
    <div className="shrink-0 border-b border-concrete-600 bg-concrete-900/60 px-4 py-2">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="signage text-2xs text-concrete-400">
          Tunnel pressure ·{' '}
          <span className={idx >= 3 ? 'text-hiss' : idx >= 2 ? 'text-signal' : 'text-concrete-200'}>
            {band.label}
          </span>{' '}
          <span className="tabular-nums text-concrete-400">
            {pressure}/{PRESSURE_MAX}
          </span>
        </span>
        <span className="text-2xs tabular-nums text-concrete-400">
          {band.threatBonus > 0 ? `+${band.threatBonus} threat` : 'no bonus threat'}
        </span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-sm bg-concrete-800">
        <div
          className={`h-full transition-all duration-300 ${BAND_FILL[idx]} ${
            idx >= 4 ? 'pulse-danger' : ''
          }`}
          style={{ width: `${Math.min(100, (pressure / PRESSURE_MAX) * 100)}%` }}
        />
        {PRESSURE_BANDS.slice(1).map((b) => (
          <span
            key={b.at}
            className="absolute top-0 h-full w-px bg-concrete-950/70"
            style={{ left: `${(b.at / PRESSURE_MAX) * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-1 text-2xs leading-snug text-concrete-400">
        {band.note}
        {next && (
          <span className="text-concrete-400/70"> · {next.at - pressure} more noise to {next.label}</span>
        )}
      </div>
    </div>
  );
}

interface FloorPt {
  x: number;
  y: number;
}

interface Tube {
  key: string;
  d: string;
  width: number;
  kind: 'latent' | 'walked' | 'live';
  main: boolean;
  /** Smaller = farther; paint far tubes first. */
  order: number;
}

function seedPhase(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}

/** Slow S-curve of the whole bore, plus a little per-lane drift so sides aren't mirrors. */
function laneX(col: number, lane: number, phase: number): number {
  const spread = 1.22;
  const meander =
    Math.sin(col * 0.34 + phase) * 0.62 + Math.sin(col * 0.13 + phase * 1.5) * 0.24;
  const drift = Math.sin(col * 0.47 + phase + lane * 1.1) * 0.1;
  return (lane - 1) * spread + meander + drift;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function floorPos(
  col: number,
  lane: number,
  camCol: number,
  viewW: number,
  viewH: number,
  phase: number,
  lanePx: number,
  colGap: number,
): FloorPt {
  const rel = col - camCol;
  return {
    x: viewW / 2 + laneX(col, lane, phase) * lanePx,
    y: viewH * 0.86 - rel * colGap,
  };
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function halfFor(node: TunnelNode, main: boolean): number {
  if (node.kind === 'platform') return PLATFORM_HALF;
  return main ? MAIN_HALF : BRANCH_HALF;
}

/** Prefer lane 1 (and platforms) so the spine is the through running tunnel. */
function mainSpine(run: TunnelRun): Set<string> {
  const ids = new Set<string>();
  let cur = run.columns[0]?.[0];
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    ids.add(cur);
    const node = run.nodes[cur];
    if (!node?.next.length) break;
    const kids = node.next.map((id) => run.nodes[id]).filter(Boolean);
    kids.sort(
      (a, b) => Math.abs(a.lane - 1) - Math.abs(b.lane - 1) || a.lane - b.lane,
    );
    cur = kids[0]?.id;
  }
  return ids;
}

function samplePath(
  from: TunnelNode,
  to: TunnelNode,
  camCol: number,
  viewW: number,
  viewH: number,
  phase: number,
  lanePx: number,
  colGap: number,
  main: boolean,
): { d: string; width: number; order: number } | null {
  const steps = 12;
  const pts: FloorPt[] = [];
  const branch = !main || from.lane !== to.lane;
  const side =
    Math.sign((from.lane + to.lane) / 2 - 1) || (from.lane <= 1 ? -1 : 1);
  const swing = branch ? 0.38 + 0.22 * Math.sin(from.col * 1.8 + phase + from.lane) : 0;
  const peel = branch ? 0.1 : 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const col = from.col + (to.col - from.col) * t;
    const u = smoothstep(clamp((t - peel) / (1 - peel), 0, 1));
    let lane = from.lane + (to.lane - from.lane) * u;
    if (branch) lane += side * swing * Math.sin(Math.PI * t);
    pts.push(floorPos(col, lane, camCol, viewW, viewH, phase, lanePx, colGap));
  }
  const width =
    ((halfFor(from, main) + halfFor(to, main)) / 2) * 2 * lanePx;
  return {
    d: `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`,
    width,
    order: from.col + to.col,
  };
}

/**
 * Graph laid out on a tilted floor. CSS perspective tapers the tubes and
 * turns circular pads into discs. Drag / wheel looks further down the bore.
 */
function TunnelMap({
  run,
  selectedId,
  platformCodes,
  onSelect,
}: {
  run: TunnelRun;
  selectedId: string;
  platformCodes: Record<string, string>;
  onSelect: (id: string) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{
    pointerId: number;
    y: number;
    dolly: number;
    moved: boolean;
  } | null>(null);
  const panned = useRef(false);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [dolly, setDolly] = useState(0);
  const [dragging, setDragging] = useState(false);

  const here = currentNode(run);
  const phase = useMemo(() => seedPhase(run.id), [run.id]);
  const maxDolly = Math.max(0, run.columns.length - 1 - here.col - 0.15);
  const dollyRef = useRef(dolly);
  dollyRef.current = dolly;

  useLayoutEffect(() => {
    setDolly(0);
  }, [here.id]);

  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => setView({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const camCol = here.col + dolly;

  const layout = useMemo(() => {
    if (view.w < 8 || view.h < 8) return null;
    const lanePx = clamp(view.w * 0.23, 108, 180);
    const colGap = clamp(view.h * 0.66, 230, 400);
    const at = new Map<string, FloorPt>();
    for (const node of Object.values(run.nodes)) {
      at.set(
        node.id,
        floorPos(node.col, node.lane, camCol, view.w, view.h, phase, lanePx, colGap),
      );
    }
    const spine = mainSpine(run);
    const tubes: Tube[] = [];
    for (const node of Object.values(run.nodes)) {
      for (const nextId of node.next) {
        const target = run.nodes[nextId];
        if (!target) continue;
        const main = spine.has(node.id) && spine.has(target.id);
        const path = samplePath(
          node,
          target,
          camCol,
          view.w,
          view.h,
          phase,
          lanePx,
          colGap,
          main,
        );
        if (!path) continue;
        const kind: Tube['kind'] =
          node.id === here.id
            ? 'live'
            : node.state === 'done' && (target.state === 'done' || target.id === here.id)
              ? 'walked'
              : 'latent';
        tubes.push({
          key: `${node.id}>${nextId}`,
          ...path,
          kind,
          main,
        });
      }
    }
    tubes.sort((a, b) => a.order - b.order);

    return { at, tubes };
  }, [run, here.id, camCol, view.w, view.h, phase]);

  const applyDolly = useCallback(
    (next: number) => setDolly(clamp(next, -0.12, maxDolly)),
    [maxDolly],
  );

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyDolly(dollyRef.current + e.deltaY / 420);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyDolly]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    panned.current = false;
    pan.current = { pointerId: e.pointerId, y: e.clientY, dolly, moved: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = pan.current;
    const el = surfaceRef.current;
    if (!d || d.pointerId !== e.pointerId || !el) return;
    const dy = e.clientY - d.y;
    if (!d.moved && dy * dy < 36) return;
    if (!d.moved) {
      d.moved = true;
      panned.current = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    applyDolly(d.dolly - dy / (el.clientHeight * 0.38));
  };

  const endPan = (e: PointerEvent<HTMLDivElement>) => {
    const d = pan.current;
    if (!d || d.pointerId !== e.pointerId) return;
    pan.current = null;
    setDragging(false);
  };

  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (!panned.current) return;
    e.preventDefault();
    e.stopPropagation();
    panned.current = false;
  };

  const move = dragging ? '' : 'motion-safe:transition-[left,top] motion-safe:duration-300';

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={surfaceRef}
        role="img"
        aria-label="Tunnel bore. Drag or scroll to look further down."
        className="relative min-h-0 min-w-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        style={{ perspective: '1100px', perspectiveOrigin: '50% 8%' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onClickCapture={onClickCapture}
      >
        {layout && (
          <div
            className="absolute inset-0 origin-bottom"
            style={{
              transform: `rotateX(${TILT}deg)`,
              transformStyle: 'preserve-3d',
            }}
          >
            <svg
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={view.w}
              height={view.h}
              aria-hidden
            >
              {layout.tubes.map((t) => (
                <path
                  key={`lip-${t.key}`}
                  d={t.d}
                  fill="none"
                  strokeWidth={t.width + (t.main ? 10 : 6)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={
                    t.kind === 'live'
                      ? 'stroke-signal/35'
                      : t.kind === 'walked'
                        ? 'stroke-astral/30'
                        : 'stroke-concrete-600/70'
                  }
                />
              ))}
              {layout.tubes.map((t) => (
                <path
                  key={`floor-${t.key}`}
                  d={t.d}
                  fill="none"
                  strokeWidth={t.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  stroke={t.main ? '#1e1e20' : '#161618'}
                />
              ))}
              {layout.tubes
                .filter((t) => t.kind !== 'latent')
                .map((t) => (
                  <path
                    key={`rail-${t.key}`}
                    d={t.d}
                    fill="none"
                    strokeWidth={t.kind === 'live' ? 3 : 2}
                    strokeLinecap="round"
                    strokeDasharray={t.kind === 'live' ? '10 8' : undefined}
                    className={t.kind === 'live' ? 'stroke-signal' : 'stroke-astral/45'}
                  />
                ))}
            </svg>

            {run.columns.flatMap((ids) =>
              ids.map((id) => {
                const node = run.nodes[id];
                const pt = layout.at.get(id);
                if (!node || !pt) return null;
                return (
                  <NodePip
                    key={node.id}
                    run={run}
                    node={node}
                    x={pt.x}
                    y={pt.y}
                    selected={node.id === selectedId}
                    platformCode={
                      node.kind === 'platform' && node.stationId
                        ? platformCodes[node.stationId]
                        : undefined
                    }
                    moveClass={move}
                    onSelect={onSelect}
                  />
                );
              }),
            )}
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-concrete-950 via-concrete-950/70 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-concrete-950/80 to-transparent"
          aria-hidden
        />
      </div>
    </div>
  );
}

function NodePip({
  run,
  node,
  x,
  y,
  selected,
  platformCode,
  moveClass,
  onSelect,
}: {
  run: TunnelRun;
  node: TunnelNode;
  x: number;
  y: number;
  selected: boolean;
  platformCode?: string;
  moveClass: string;
  onSelect: (id: string) => void;
}) {
  const here = currentNode(run);
  const isHere = node.id === here.id;
  const isNext = here.next.includes(node.id);
  const revealed = isRevealed(run, node);
  const meta = TUNNEL_NODE_META[node.kind];
  const showLabel = isHere || isNext || node.col <= here.col + 2;

  const discTone = isHere
    ? 'border-astral bg-astral/30 shadow-[0_0_18px_rgba(110,180,220,0.4)]'
    : isNext
      ? 'border-signal/70 bg-signal/15'
      : node.state === 'done'
        ? 'border-concrete-600/40 bg-concrete-900/80'
        : 'border-concrete-600 bg-concrete-800/80';

  const iconTone = isHere
    ? 'text-astral'
    : isNext
      ? 'text-signal'
      : node.state === 'done'
        ? 'text-concrete-400'
        : 'text-concrete-400';

  const label = isHere
    ? 'you'
    : revealed
      ? (platformCode ?? node.name)
      : '???';

  const pad = node.kind === 'platform' ? 'h-16 w-16' : 'h-14 w-14';

  return (
    <div
      className={`absolute ${moveClass}`}
      style={{
        left: x,
        top: y,
        zIndex: 400 - node.col,
        transform: 'translate(-50%, -50%)',
        transformStyle: 'preserve-3d',
        opacity: isHere || isNext || revealed ? 1 : 0.5,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        disabled={!revealed && !isNext}
        title={revealed ? `${meta.label} — ${node.name}` : 'You cannot see that far ahead'}
        className={`relative block ${pad} ${selected ? 'outline outline-1 outline-offset-2 outline-concrete-200/40' : ''}`}
      >
        <span
          className={`absolute inset-0 rounded-full border-2 ${discTone} ${
            isNext ? 'hover:bg-signal/25' : ''
          }`}
        />
      </button>
      <div
        className="pointer-events-none absolute bottom-1/2 left-1/2 flex flex-col items-center"
        style={{
          transform: `translate(-50%, -100%) rotateX(-${TILT}deg)`,
          transformOrigin: 'center bottom',
        }}
      >
        <span className={iconTone}>
          <Icon name={revealed ? meta.icon : 'tunnel.unknown'} size={isHere ? 28 : 24} />
        </span>
        {showLabel && (
          <span className="mt-0.5 max-w-[9.5rem] truncate text-center text-xs font-medium leading-tight text-concrete-200">
            {label}
            {revealed && isNext && node.kind !== 'platform' ? (
              <span className="text-hiss"> ▲{nodeThreat(run, node)}</span>
            ) : null}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * People live down here. What they offer is a mat, a pair of steady hands, and
 * one swap they've already decided the terms of — the same shape as the ghost
 * survivor's trade, because a camp isn't a shop.
 */
function CampPanel({
  name,
  offer,
  servicesUsed,
  onRest,
  onTreat,
  onAccept,
  onDecline,
}: {
  name: string;
  offer: { wantDefId: string; giveDefId: string } | null;
  servicesUsed: boolean;
  onRest: () => void;
  onTreat: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-astral/30 bg-astral/5 px-3 py-2">
      <div className="signage mb-1.5 text-2xs text-astral">{name} · they let you in</div>
      {servicesUsed ? (
        <p className="mb-2 text-xs text-concrete-400">
          Camp services already used — one favour is all they&apos;ll spare.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onRest}
            className="flex-1 rounded border border-astral/40 px-2 py-1.5 text-xs text-astral hover:bg-astral/10"
          >
            <Icon name="action.sleep" size={12} /> Sleep 5h
            <span className="block text-2xs opacity-70">quiets the tunnel · once</span>
          </button>
          <button
            onClick={onTreat}
            className="flex-1 rounded border border-astral/40 px-2 py-1.5 text-xs text-astral hover:bg-astral/10"
          >
            <Icon name="hdb.doctor" size={12} /> Patch up
            <span className="block text-2xs opacity-70">1× canned food · once</span>
          </button>
        </div>
      )}

      {offer && (
        <div className="mt-2 rounded border border-concrete-600 bg-concrete-950/60 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>
              <span className="text-hiss">− {itemDef(offer.wantDefId).name}</span>
              <span className="text-concrete-400"> for </span>
              <span className="text-signal">+ {itemDef(offer.giveDefId).name}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                onClick={onAccept}
                className="rounded bg-signal/90 px-2 py-1 text-xs font-bold text-black hover:bg-signal"
              >
                Trade
              </button>
              <button
                onClick={onDecline}
                className="rounded border border-concrete-600 px-2 py-1 text-xs hover:bg-white/5"
              >
                Pass
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The commit pane: what it is, what it costs, and the one button that does it. */
function NodeDetail({
  run,
  node,
  canWalk,
  mayExit,
  onWalk,
  onExit,
}: {
  run: TunnelRun;
  node: TunnelNode;
  canWalk: boolean;
  mayExit: boolean;
  onWalk: () => void;
  onExit: () => void;
}) {
  const meta = TUNNEL_NODE_META[node.kind];
  const revealed = isRevealed(run, node);
  const arrival = isArrival(run, node);
  const hazard = node.hazard ? HAZARD_META[node.hazard] : null;
  const standingHere = node.id === run.currentId;

  return (
    <div className="shrink-0 border-t border-concrete-600 bg-concrete-900/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="signage text-xs text-concrete-50">
            {revealed ? `${node.name} · ${meta.label}` : 'Further down the bore'}
          </div>
          <p className="mt-1 text-xs leading-snug text-concrete-400">
            {!revealed
              ? 'Too far ahead to make out. You will find out by walking into it.'
              : hazard
                ? hazard.blurb
                : meta.blurb}
          </p>
        </div>
        <div className="shrink-0 text-right text-2xs tabular-nums text-concrete-400">
          <div>~{run.minutesPerHop + meta.minutes} min</div>
          {revealed && hazard && (
            <div className="text-hiss">
              {hazard.attr === 'endurance' ? 'End' : 'Dex'} vs DC {hazardDc(node)}
            </div>
          )}
          {revealed && node.kind === 'pack' && (
            <div className="text-hiss">threat {nodeThreat(run, node)}</div>
          )}
        </div>
      </div>

      {mayExit && standingHere && (
        <button
          type="button"
          onClick={onExit}
          className="mt-2 w-full rounded border border-astral/50 bg-astral/15 py-2 text-sm font-bold text-astral transition hover:bg-astral/25"
        >
          Exit here · {node.name}
        </button>
      )}

      <button
        disabled={!canWalk}
        onClick={onWalk}
        className="mt-2 w-full rounded bg-signal/90 py-2 text-sm font-bold text-black transition hover:bg-signal disabled:opacity-30"
      >
        {canWalk
          ? arrival
            ? `${meta.verb} at ${run.toName}`
            : `${meta.verb} · ${node.name}`
          : mayExit && standingHere
            ? 'Or keep walking the bore'
            : 'Pick a way forward'}
      </button>
      <p className="mt-1 text-center text-2xs text-concrete-400/70">
        {mayExit
          ? 'Stairs up at every station — or keep walking toward the far end.'
          : 'There is no way back up until the next station — the tunnel only runs one way now.'}
      </p>
    </div>
  );
}
