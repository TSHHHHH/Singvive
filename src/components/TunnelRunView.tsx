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
 * livery, transfers — then a perspective schematic of the node tree: a
 * main running line with octilinear turnouts, like a subway diagram.
 *
 * Replaces the map for the length of the walk (it is a view, not a modal).
 */

const BAND_FILL = ['bg-concrete-500', 'bg-signal/70', 'bg-signal', 'bg-hiss/80', 'bg-hiss'];

/** Tilt of the schematic plane. Milder than a bore so the network reads as a map. */
const TILT = 50;
/** Side adits — a second "line" off the through running track. */
const BRANCH_COLOR = '#c45b8c';
const MAP_VOID = '#0c0c0e';
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.7;

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
        lineColor={run.lineColor || '#9c9890'}
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

interface Edge {
  key: string;
  d: string;
  main: boolean;
  kind: 'latent' | 'walked' | 'live';
  order: number;
}

function fmtPt(p: FloorPt): string {
  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
}

function seedPhase(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h >>> 0) / 4294967296;
}

/**
 * Integer track offset per column. Several subway-map personalities so
 * crawls don't all share the same gentle zigzag.
 */
function buildShifts(cols: number, phase: number, maxShift: number): number[] {
  const seed = Math.floor(phase * 10000);
  const out = new Array<number>(cols).fill(0);
  if (cols <= 1) return out;
  const style = Math.floor(hash01(seed) * 5);
  const clampS = (s: number) => Math.max(-maxShift, Math.min(maxShift, s));

  if (style === 0) {
    const dir = hash01(seed + 1) < 0.5 ? -1 : 1;
    let s = 0;
    for (let c = 1; c < cols; c++) {
      const h = hash01(seed + c * 3);
      if (h < 0.58) s = clampS(s + dir);
      else if (h > 0.9) s = clampS(s - dir);
      out[c] = s;
    }
  } else if (style === 1) {
    let s = 0;
    let hold = 2 + Math.floor(hash01(seed + 9) * 3);
    for (let c = 1; c < cols; c++) {
      if (hold > 0) {
        out[c] = s;
        hold--;
        continue;
      }
      const dir = hash01(seed + c * 11) < 0.5 ? -1 : 1;
      s = clampS(s + dir);
      hold = 2 + Math.floor(hash01(seed + c * 13) * 3);
      out[c] = s;
    }
  } else if (style === 2) {
    const sign = hash01(seed + 6) < 0.5 ? 1 : -1;
    const cycles = hash01(seed + 4) < 0.45 ? 1 : 1.35;
    for (let c = 1; c < cols; c++) {
      const t = c / (cols - 1);
      let s = Math.round(Math.sin(t * Math.PI * cycles) * maxShift * sign);
      if (Math.abs(s - out[c - 1]) > 1) s = out[c - 1] + Math.sign(s - out[c - 1]);
      out[c] = clampS(s);
    }
  } else if (style === 3) {
    const dir = hash01(seed + 7) < 0.5 ? -1 : 1;
    const a = Math.max(1, Math.floor(cols * (0.2 + hash01(seed + 8) * 0.2)));
    const extra = maxShift > 1 && hash01(seed + 10) > 0.4 ? 1 : 0;
    const b = Math.min(cols - 1, a + 1 + extra);
    let s = 0;
    for (let c = 1; c < cols; c++) {
      if (c === a || c === b) s = clampS(s + dir);
      out[c] = s;
    }
  } else {
    let s = 0;
    for (let c = 1; c < cols; c++) {
      const h = hash01(seed + c * 19);
      if (h < 0.16) s = clampS(s - 1);
      else if (h > 0.84) s = clampS(s + 1);
      out[c] = s;
    }
  }
  return out;
}

function laneOffset(lane: number, phase: number): number {
  if (lane === 1) return 0;
  const wide = hash01(Math.floor(phase * 10000) + lane * 19) > 0.72;
  return (lane - 1) * (wide ? 2 : 1);
}

function unit(from: FloorPt, to: FloorPt): FloorPt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * One rule: 45° until an axis is exhausted, then ortho. Equal |dx| and |dy|
 * is a pure diagonal — no elbow. Never a 90° hook.
 */
function octilinear(a: FloorPt, b: FloorPt): FloorPt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < 2 || ady < 2 || Math.abs(adx - ady) < 2) return [a, b];
  const d = Math.min(adx, ady);
  return [a, { x: a.x + Math.sign(dx) * d, y: a.y + Math.sign(dy) * d }, b];
}

/** Circular fillets, same radius on every 45° heading change. */
function roundedPath(pts: FloorPt[], radius: number): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M ${fmtPt(pts[0])} L ${fmtPt(pts[1])}`;
  let d = `M ${fmtPt(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const u = unit(p0, p1);
    const v = unit(p1, p2);
    const inLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const outLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const dot = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
    const phi = Math.acos(dot);
    if (phi < 0.05 || inLen < 4 || outLen < 4) {
      d += ` L ${fmtPt(p1)}`;
      continue;
    }
    const maxL = Math.min(inLen, outLen) * 0.48;
    let L = radius * Math.tan(phi / 2);
    L = Math.min(L, maxL);
    const r = L / Math.tan(phi / 2);
    const into: FloorPt = { x: p1.x - u.x * L, y: p1.y - u.y * L };
    const out: FloorPt = { x: p1.x + v.x * L, y: p1.y + v.y * L };
    const sweep = u.x * v.y - u.y * v.x > 0 ? 1 : 0;
    d += ` L ${fmtPt(into)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${sweep} ${fmtPt(out)}`;
  }
  d += ` L ${fmtPt(pts[pts.length - 1])}`;
  return d;
}

/** Prefer lane 1 (and platforms) so the spine is the through running line. */
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

/**
 * Graph laid out as a tilted schematic. Edges are octilinear; CSS perspective
 * recedes the network without turning strokes into a 3D bore.
 */
function TunnelMap({
  run,
  selectedId,
  platformCodes,
  lineColor,
  onSelect,
}: {
  run: TunnelRun;
  selectedId: string;
  platformCodes: Record<string, string>;
  lineColor: string;
  onSelect: (id: string) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: 'pan'; x: number; y: number; camX: number; camY: number; moved: boolean }
    | {
        kind: 'pinch';
        dist: number;
        midX: number;
        midY: number;
        z: number;
        camX: number;
        camY: number;
      }
    | null
  >(null);
  const panned = useRef(false);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<{ x: number; y: number; z: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const here = currentNode(run);
  const phase = useMemo(() => seedPhase(run.id), [run.id]);
  const camRef = useRef({ x: 0, y: 0, z: 1 });

  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => setView({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const maxCol = Object.values(run.nodes).reduce((m, n) => Math.max(m, n.col), 0);
    const cols = Math.max(2, run.columns.length, maxCol + 1);
    const cell = 112;
    const pad = 96;
    const maxShift = 3;
    const shifts = buildShifts(cols, phase, maxShift);
    const yAt: number[] = new Array(cols);
    yAt[cols - 1] = pad;
    for (let c = cols - 2; c >= 0; c--) {
      yAt[c] = (yAt[c + 1] ?? pad) + cell;
    }
    const at = new Map<string, FloorPt>();
    for (const node of Object.values(run.nodes)) {
      const shift = shifts[node.col] ?? 0;
      at.set(node.id, {
        x: pad + (shift + laneOffset(node.lane, phase) + maxShift) * cell,
        y: yAt[node.col] ?? pad + (cols - 1 - node.col) * cell,
      });
    }
    let maxX = pad;
    let maxY = pad;
    for (const pt of at.values()) {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
    const worldW = Math.max(maxX + pad, 320);
    const worldH = Math.max(maxY + pad, 320);
    const spine = mainSpine(run);
    const edges: Edge[] = [];
    const cornerR = cell * 0.42;
    for (const node of Object.values(run.nodes)) {
      for (const nextId of node.next) {
        const target = run.nodes[nextId];
        const a = at.get(node.id);
        const b = at.get(nextId);
        if (!target || !a || !b) continue;
        const main = spine.has(node.id) && spine.has(target.id);
        const kind: Edge['kind'] =
          node.id === here.id
            ? 'live'
            : node.state === 'done' && (target.state === 'done' || target.id === here.id)
              ? 'walked'
              : 'latent';
        edges.push({
          key: `${node.id}>${nextId}`,
          d: roundedPath(octilinear(a, b), cornerR),
          main,
          kind,
          order: node.col + target.col,
        });
      }
    }
    edges.sort((a, b) => Number(a.main) - Number(b.main) || b.order - a.order);

    const hubs = Object.values(run.nodes)
      .filter((n) => n.kind === 'platform')
      .map((n) => ({ id: n.id, pt: at.get(n.id)! }))
      .filter((h) => h.pt);

    const dots = Object.values(run.nodes)
      .map((n) => {
        const pt = at.get(n.id);
        if (!pt) return null;
        return {
          id: n.id,
          pt,
          hub: n.kind === 'platform',
          main: spine.has(n.id),
        };
      })
      .filter((d): d is NonNullable<typeof d> => !!d);

    return { at, edges, hubs, dots, cell, worldW, worldH };
  }, [run, here.id, phase]);

  const homeCam = useMemo(() => {
    const pt = layout.at.get(here.id);
    const vw = view.w || 720;
    const vh = view.h || 480;
    const z = clamp(vh / (layout.cell * 5.4), 0.55, 1.2);
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      return { z, x: vw / 2, y: vh * 0.72 };
    }
    return { z, x: vw / 2 - pt.x * z, y: vh * 0.72 - pt.y * z };
  }, [layout, here.id, view.w, view.h]);

  const applied = cam ?? homeCam;
  camRef.current = applied;

  useLayoutEffect(() => {
    setCam(null);
  }, [run.id]);

  const zoomAt = useCallback((cx: number, cy: number, nextZ: number) => {
    const cur = camRef.current;
    const z = clamp(nextZ, ZOOM_MIN, ZOOM_MAX);
    const lx = (cx - cur.x) / cur.z;
    const ly = (cy - cur.y) / cur.z;
    setCam({ z, x: cx - lx * z, y: cy - ly * z });
  }, []);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0018);
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, camRef.current.z * factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    panned.current = false;
    if (pointers.current.size >= 2) {
      const el = surfaceRef.current;
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const rect = el?.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0);
      const midY = (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0);
      gesture.current = {
        kind: 'pinch',
        dist,
        midX,
        midY,
        z: camRef.current.z,
        camX: camRef.current.x,
        camY: camRef.current.y,
      };
      setDragging(true);
      return;
    }
    gesture.current = {
      kind: 'pan',
      x: e.clientX,
      y: e.clientY,
      camX: camRef.current.x,
      camY: camRef.current.y,
      moved: false,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const el = surfaceRef.current;
    if (!g || !el) return;
    if (g.kind === 'pinch') {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const rect = el.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
      panned.current = true;
      zoomAt(midX, midY, g.z * (dist / g.dist));
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && dx * dx + dy * dy < 36) return;
    if (!g.moved) {
      g.moved = true;
      panned.current = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    setCam({ z: camRef.current.z, x: g.camX + dx, y: g.camY + dy });
  };

  const endPan = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setDragging(false);
      return;
    }
    if (pointers.current.size === 1) {
      const pt = [...pointers.current.values()][0];
      gesture.current = {
        kind: 'pan',
        x: pt.x,
        y: pt.y,
        camX: camRef.current.x,
        camY: camRef.current.y,
        moved: true,
      };
    }
  };

  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (!panned.current) return;
    e.preventDefault();
    e.stopPropagation();
    panned.current = false;
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={surfaceRef}
        role="img"
        aria-label="Tunnel schematic. Scroll to zoom, drag to pan."
        className={`relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ perspective: '1600px', perspectiveOrigin: '50% 30%' }}
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
            <div
              className="absolute left-0 top-0"
              style={{
                width: layout.worldW,
                height: layout.worldH,
                transform: `translate(${applied.x}px, ${applied.y}px) scale(${applied.z})`,
                transformOrigin: '0 0',
              }}
            >
            <svg
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={layout.worldW}
              height={layout.worldH}
              aria-hidden
            >
              <defs>
                <filter id="sv-line-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="2.2" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {layout.hubs.map((h) => (
                <g key={`hub-${h.id}`} opacity={0.85}>
                  <circle
                    cx={h.pt.x}
                    cy={h.pt.y}
                    r={layout.cell * 0.42}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth={1.4}
                    opacity={0.45}
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={h.pt.x}
                    cy={h.pt.y}
                    r={layout.cell * 0.58}
                    fill="none"
                    stroke={BRANCH_COLOR}
                    strokeWidth={1.2}
                    opacity={0.32}
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={h.pt.x}
                    cy={h.pt.y}
                    r={layout.cell * 0.74}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth={1}
                    opacity={0.16}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ))}
              {layout.edges.map((e) => (
                <path
                  key={`case-${e.key}`}
                  d={e.d}
                  fill="none"
                  stroke={MAP_VOID}
                  strokeWidth={e.main ? 14 : 8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={e.kind === 'walked' ? 0.55 : 0.95}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {layout.edges.map((e) => (
                <path
                  key={`line-${e.key}`}
                  d={e.d}
                  fill="none"
                  stroke={e.main ? lineColor : BRANCH_COLOR}
                  strokeWidth={e.main ? 8 : 3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={e.kind === 'walked' ? 0.45 : e.kind === 'live' ? 1 : 0.82}
                  filter={e.kind === 'live' ? 'url(#sv-line-glow)' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {layout.edges
                .filter((e) => e.main)
                .map((e) => (
                  <path
                    key={`gap-${e.key}`}
                    d={e.d}
                    fill="none"
                    stroke={MAP_VOID}
                    strokeWidth={3.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={e.kind === 'walked' ? 0.5 : 0.95}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              {layout.edges
                .filter((e) => e.kind === 'live')
                .map((e) => (
                  <path
                    key={`live-${e.key}`}
                    d={e.d}
                    fill="none"
                    stroke="#f4f1ea"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeDasharray="7 11"
                    opacity={0.7}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              {layout.dots.map((d) => (
                <circle
                  key={`dot-${d.id}`}
                  cx={d.pt.x}
                  cy={d.pt.y}
                  r={d.hub ? 7.5 : 5}
                  fill={d.hub ? lineColor : d.main ? '#e8e6e1' : BRANCH_COLOR}
                  stroke={MAP_VOID}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
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
                    onSelect={onSelect}
                  />
                );
              }),
            )}
            </div>
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
  onSelect,
}: {
  run: TunnelRun;
  node: TunnelNode;
  x: number;
  y: number;
  selected: boolean;
  platformCode?: string;
  onSelect: (id: string) => void;
}) {
  const here = currentNode(run);
  const isHere = node.id === here.id;
  const isNext = here.next.includes(node.id);
  const revealed = isRevealed(run, node);
  const meta = TUNNEL_NODE_META[node.kind];
  const showLabel = isHere || isNext || node.col <= here.col + 2;

  const discTone = isHere
    ? 'border-astral bg-astral/25 shadow-[0_0_16px_rgba(110,180,220,0.45)]'
    : isNext
      ? 'border-signal/80 bg-signal/10'
      : 'border-transparent bg-transparent';

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

  const pad = node.kind === 'platform' ? 'h-11 w-11' : 'h-9 w-9';

  return (
    <div
      className="absolute"
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
          className={`absolute inset-[18%] rounded-full border ${discTone} ${
            isNext ? 'hover:bg-signal/20' : ''
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
