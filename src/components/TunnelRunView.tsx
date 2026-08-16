import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { itemDef } from '../game/loot';
import {
  HAZARD_META,
  PRESSURE_BANDS,
  PRESSURE_MAX,
  TUNNEL_NODE_META,
  canExitHere,
  currentNode,
  hazardDc,
  isArrival,
  isRevealed,
  nodeThreat,
  pressureBand,
  stationProgress,
  type TunnelNode,
  type TunnelRun,
} from '../game/tunnelRun';

/**
 * The tunnel between two adjacent stations, as a map you walk left to right.
 * Pick a lane, take what's on it, move up a column — and you can only ever see
 * one column ahead, because the bore curves and the torch doesn't carry.
 *
 * Replaces the map for the length of the walk (it is a view, not a modal).
 */

const LANES = 3;
const BAND_FILL = ['bg-concrete-500', 'bg-signal/70', 'bg-signal', 'bg-hiss/80', 'bg-hiss'];

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

  if (!run) return null;

  const here = currentNode(run);
  const ahead = here.next.map((id) => run.nodes[id]);
  const selected = (selectedId && run.nodes[selectedId]) || ahead[0] || here;
  const canWalk = ahead.some((n) => n.id === selected.id);
  const mayExit = canExitHere(run, here);

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-concrete-950">
      {/* ---- signage header ---- */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-concrete-600 bg-concrete-800 px-3 py-2.5 lg:px-4">
        <div className="min-w-0">
          <div className="signage truncate text-xs text-signal">
            {run.fromName} → {run.toName}
          </div>
          <div className="truncate text-xs text-concrete-400">
            {run.lineName} · {stationProgress(run)} · {run.meters} m · no weather down here
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="h-1 w-16 rounded-full" style={{ background: run.lineColor }} />
          <div className="mt-1 text-2xs tabular-nums text-concrete-400">
            {here.col} / {run.cols - 1}
          </div>
        </div>
      </div>

      <PressureGauge pressure={run.pressure} />

      {/* ---- the map ---- */}
      <div className="min-h-0 flex-1 overflow-auto p-3 lg:p-4">
        <TunnelMap run={run} selectedId={selected.id} onSelect={setSelectedId} />
      </div>

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

interface Edge {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** live = leaving where you stand; walked = the way you came. */
  kind: 'latent' | 'walked' | 'live';
}

/**
 * Columns as a grid, connectors as an SVG underlay. The lines are *measured*
 * from the laid-out buttons rather than computed: lane occupancy varies per
 * column, so anything precomputed would drift the moment a column has two
 * nodes instead of three.
 */
function TunnelMap({
  run,
  selectedId,
  onSelect,
}: {
  run: TunnelRun;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [edges, setEdges] = useState<Edge[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const here = currentNode(run);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const base = wrap.getBoundingClientRect();
    setSize({ w: base.width, h: base.height });

    const centre = (id: string) => {
      const el = nodeRefs.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 };
    };

    const out: Edge[] = [];
    for (const node of Object.values(run.nodes)) {
      const a = centre(node.id);
      if (!a) continue;
      for (const nextId of node.next) {
        const b = centre(nextId);
        if (!b) continue;
        const target = run.nodes[nextId];
        const kind: Edge['kind'] =
          node.id === here.id
            ? 'live'
            : node.state === 'done' && (target.state === 'done' || target.id === here.id)
              ? 'walked'
              : 'latent';
        out.push({ key: `${node.id}>${nextId}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind });
      }
    }
    setEdges(out);
  }, [run, here.id]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={wrapRef} className="relative inline-block min-w-full">
      <svg
        className="pointer-events-none absolute inset-0"
        width={size.w}
        height={size.h}
        aria-hidden
      >
        {edges.map((e) => (
          <line
            key={e.key}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            strokeWidth={e.kind === 'live' ? 2 : 1}
            className={
              e.kind === 'live'
                ? 'stroke-signal'
                : e.kind === 'walked'
                  ? 'stroke-astral/60'
                  : 'stroke-concrete-600'
            }
            strokeDasharray={e.kind === 'live' ? '5 4' : undefined}
          />
        ))}
      </svg>

      <div
        className="relative grid grid-flow-col items-center gap-x-6 gap-y-4 lg:gap-x-12 lg:gap-y-5"
        style={{ gridTemplateRows: `repeat(${LANES}, minmax(0, 1fr))` }}
      >
        {run.columns.map((ids, col) => {
          const byLane = new Map(ids.map((id) => [run.nodes[id].lane, run.nodes[id]]));
          return Array.from({ length: LANES }, (_, lane) => {
            const node = byLane.get(lane);
            if (!node) return <div key={`${col}-${lane}`} className="h-11 w-16 lg:w-24" />;
            return (
              <NodePip
                key={node.id}
                run={run}
                node={node}
                selected={node.id === selectedId}
                onSelect={onSelect}
                register={(el) => {
                  if (el) nodeRefs.current.set(node.id, el);
                  else nodeRefs.current.delete(node.id);
                }}
              />
            );
          });
        })}
      </div>
    </div>
  );
}

function NodePip({
  run,
  node,
  selected,
  onSelect,
  register,
}: {
  run: TunnelRun;
  node: TunnelNode;
  selected: boolean;
  onSelect: (id: string) => void;
  register: (el: HTMLElement | null) => void;
}) {
  const here = currentNode(run);
  const isHere = node.id === here.id;
  const isNext = here.next.includes(node.id);
  const revealed = isRevealed(run, node);
  const meta = TUNNEL_NODE_META[node.kind];

  const shape = node.kind === 'platform' ? 'rounded-md' : 'rounded-full';
  const tone = isHere
    ? 'border-astral bg-astral/15 text-astral ring-2 ring-astral/60'
    : isNext
      ? 'border-signal/60 bg-signal/10 text-signal hover:bg-signal/20'
      : node.state === 'done'
        ? 'border-concrete-600/50 bg-concrete-900 text-concrete-400'
        : 'border-concrete-600 bg-concrete-800 text-concrete-400 opacity-60';

  return (
    <div className="flex w-16 flex-col items-center gap-1 lg:w-24">
      <button
        ref={register}
        onClick={() => onSelect(node.id)}
        disabled={!revealed && !isNext}
        title={revealed ? `${meta.label} — ${node.name}` : 'You cannot see that far ahead'}
        className={`flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center border text-base transition ${shape} ${tone} ${
          selected ? 'outline outline-1 outline-offset-2 outline-concrete-200/50' : ''
        }`}
      >
        <Icon name={revealed ? meta.icon : 'tunnel.unknown'} size={18} />
      </button>
      <span className="max-w-full truncate text-center text-2xs leading-tight text-concrete-400">
        {isHere ? 'you' : revealed ? node.name : '???'}
      </span>
      {revealed && isNext && node.kind !== 'platform' && (
        <span className="text-2xs tabular-nums text-hiss">▲{nodeThreat(run, node)}</span>
      )}
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
