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
import {
  codeOnLine,
  displayLine,
  journeyStrip,
  type JourneyStrip,
  type MrtNetwork,
} from '../game/mrt';
import { FACTION_CONFIG } from '../game/factions';
import { priceList } from '../game/events';
import {
  CARRIAGE_INVERT_ENERGY,
  CARRIAGE_INVERT_MINUTES,
  CARRIAGE_SMASH_MINUTES,
  TUNNEL_HAZARD,
  SERVICE_KINDS,
  TUNNEL_NODE_META,
  canExitHere,
  crawlPlace,
  currentNode,
  hazardDc,
  isArrival,
  isRevealed,
  nodeNeedsChoice,
  nodePreviewMinutes,
  nodeThreat,
  type TunnelNode,
  type TunnelRun,
} from '../game/tunnelRun';
import { useMrtNetwork } from './useMrtNetwork';
import { CrawlPids } from './StationStrip';
import { itemName, msgOr, useT } from '../i18n';
import { tip } from './tips';

/**
 * One planned crawl. The header is an in-train station strip — next stop,
 * livery, transfers — then the crawl drawn as a metro map: the running line
 * in each hop's real livery, platforms as interchange boxes carrying every
 * real code, and the side passages as their own coded service lines that
 * peel off at 45° and rejoin a few stops on.
 *
 * Replaces the map for the length of the walk (it is a view, not a modal).
 */

/** Old saves have no service lines; their side passages draw in this. */
const BRANCH_COLOR = '#c45b8c';
const MAP_VOID = '#0c0c0e';
const STOP_FILL = '#f4f1ea';
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.7;

export function TunnelRunView() {
  const {
    run,
    offer,
    step,
    rest,
    treat,
    accept,
    decline,
    exitHere,
    carriage,
    checkpoint,
  } = useGame(
    useShallow((s) => ({
      run: s.tunnel,
      offer: s.tunnelOffer,
      step: s.tunnelStep,
      rest: s.tunnelRest,
      treat: s.tunnelTreat,
      accept: s.tunnelAcceptOffer,
      decline: s.tunnelDeclineOffer,
      exitHere: s.tunnelExitHere,
      carriage: s.tunnelCarriage,
      checkpoint: s.tunnelCheckpoint,
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
  const blocked = nodeNeedsChoice(here);
  const canWalk = !blocked && ahead.some((n) => n.id === selected.id);
  const mayExit = canExitHere(run, here);
  const place = crawlPlace(run);

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-concrete-950">
      <CrawlPids strip={strip} place={place} meters={run.meters} />

      {/* ---- the map ---- */}
      <TunnelMap
        run={run}
        strip={strip}
        net={net}
        selectedId={selected.id}
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
      {here.kind === 'carriage' && here.state !== 'done' && (
        <CarriagePanel name={here.name} onInvert={() => carriage('invert')} onSmash={() => carriage('smash')} />
      )}
      {here.kind === 'checkpoint' && here.state !== 'done' && (
        <CheckpointPanel
          name={here.name}
          dc={hazardDc(here)}
          onPay={() => checkpoint('pay')}
          onSneak={() => checkpoint('sneak')}
        />
      )}

      {/* ---- what you're looking at ---- */}
      <NodeDetail
        run={run}
        node={selected}
        canWalk={canWalk}
        blocked={blocked}
        mayExit={mayExit}
        onWalk={() => step(selected.id)}
        onExit={exitHere}
      />
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
  color: string;
  main: boolean;
  kind: 'latent' | 'walked' | 'live';
}

/** One line on this crawl's legend: a real line leg or a service line. */
interface LegendEntry {
  key: string;
  code: string;
  name: string;
  color: string;
  service: boolean;
}

interface Roundel {
  key: string;
  code: string;
  color: string;
  pt: FloorPt;
  small: boolean;
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
 * Integer track offset per column, so the running line bends like a real
 * schematic instead of ruling a straight bar. A few personalities, picked by
 * the run id; a step is at most one unit per column, so every bend is 45°.
 */
function buildShifts(cols: number, phase: number, maxShift: number): number[] {
  const seed = Math.floor(phase * 10000);
  const out = new Array<number>(cols).fill(0);
  if (cols <= 1) return out;
  const style = Math.floor(hash01(seed) * 4);
  const clampS = (s: number) => Math.max(-maxShift, Math.min(maxShift, s));

  if (style === 0) {
    // Long straights with the odd dog-leg.
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
  } else if (style === 1) {
    // One gentle S across the whole trip.
    const sign = hash01(seed + 6) < 0.5 ? 1 : -1;
    for (let c = 1; c < cols; c++) {
      const t = c / (cols - 1);
      let s = Math.round(Math.sin(t * Math.PI * 2) * maxShift * sign);
      if (Math.abs(s - out[c - 1]) > 1) s = out[c - 1] + Math.sign(s - out[c - 1]);
      out[c] = clampS(s);
    }
  } else if (style === 2) {
    // Two steps the same way, like a line crossing the river.
    const dir = hash01(seed + 7) < 0.5 ? -1 : 1;
    const a = Math.max(1, Math.floor(cols * (0.2 + hash01(seed + 8) * 0.2)));
    const b = Math.min(cols - 1, a + 2 + Math.floor(hash01(seed + 10) * 3));
    let s = 0;
    for (let c = 1; c < cols; c++) {
      if (c === a || c === b) s = clampS(s + dir);
      out[c] = s;
    }
  } else {
    // Ruler straight.
  }
  return out;
}

function unit(from: FloorPt, to: FloorPt): FloorPt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Metro-map routing between two stops one column apart: run straight along
 * the line, then take the offset as one 45° diagonal centred in the gap.
 * Nothing but 0° and 45° headings ever reaches the page.
 */
function octilinear(a: FloorPt, b: FloorPt, horizontal: boolean): FloorPt[] {
  const along = horizontal ? b.x - a.x : b.y - a.y;
  const across = horizontal ? b.y - a.y : b.x - a.x;
  const aAlong = Math.abs(along);
  const aAcross = Math.abs(across);
  if (aAcross < 2 || aAlong < 2) return [a, b];
  if (aAcross >= aAlong - 1) {
    // Not enough room for a straight — diagonal then square off.
    const d = Math.min(aAlong, aAcross);
    const mid = horizontal
      ? { x: a.x + Math.sign(along) * d, y: a.y + Math.sign(across) * d }
      : { x: a.x + Math.sign(across) * d, y: a.y + Math.sign(along) * d };
    return [a, mid, b];
  }
  const straight = (aAlong - aAcross) / 2;
  const p1 = horizontal
    ? { x: a.x + Math.sign(along) * straight, y: a.y }
    : { x: a.x, y: a.y + Math.sign(along) * straight };
  const p2 = horizontal
    ? { x: b.x - Math.sign(along) * straight, y: b.y }
    : { x: b.x, y: b.y - Math.sign(along) * straight };
  return [a, p1, p2, b];
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

/** Which station hop (0-based) a column sits in. A platform opens the hop after it. */
function hopAt(platformCols: readonly number[], col: number, hopCount: number): number {
  let n = 0;
  for (const pc of platformCols) if (pc <= col) n++;
  return clamp(n - 1, 0, Math.max(0, hopCount - 1));
}

/**
 * Codes for every stop on the running line: platforms keep their real code on
 * the hop's line; the tunnel between EW14 and EW15 counts EW14·1, EW14·2…
 */
function runningCodes(
  run: TunnelRun,
  strip: JourneyStrip,
  platformCols: readonly number[],
): Map<string, string> {
  const out = new Map<string, string>();
  const counter = new Map<number, number>();
  for (const ids of run.columns) {
    for (const id of ids) {
      const node = run.nodes[id];
      if (!node || node.lane !== 1 || node.kind === 'platform') continue;
      const hop = hopAt(platformCols, node.col, strip.hops.length);
      const from = strip.stops[hop];
      const line = strip.hops[hop]?.lineCode ?? '';
      const base = from ? codeOnLine(from, line) : '';
      const k = (counter.get(hop) ?? 0) + 1;
      counter.set(hop, k);
      out.set(id, base ? `${base}·${k}` : `·${k}`);
    }
  }
  return out;
}

/**
 * The crawl as a metro map. Flat, octilinear, and laid along whichever axis
 * the panel is longer in, so a desktop column reads left to right and a phone
 * reads bottom to top.
 */
function TunnelMap({
  run,
  strip,
  net,
  selectedId,
  onSelect,
}: {
  run: TunnelRun;
  strip: JourneyStrip;
  net: MrtNetwork | null;
  selectedId: string;
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
  const { locale, t } = useT();
  const ariaLabel = t('ui.tunnel.ariaSchematic');
  const horizontal = view.w > 0 && view.w >= view.h * 1.15;

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
    // Along the line / across it. Labels sit across in the vertical layout,
    // so lanes need more room there.
    const along = horizontal ? 132 : 104;
    const across = horizontal ? 92 : 132;
    const pad = 120;
    const maxShift = 1;
    const shifts = buildShifts(cols, phase, maxShift);
    const services = new Map((run.services ?? []).map((s) => [s.id, s]));
    const platformCols = Object.values(run.nodes)
      .filter((n) => n.kind === 'platform')
      .map((n) => n.col)
      .sort((a, b) => a - b);

    const at = new Map<string, FloorPt>();
    for (const node of Object.values(run.nodes)) {
      const v = (shifts[node.col] ?? 0) + (node.lane - 1) + maxShift + 1;
      const u = node.col;
      at.set(
        node.id,
        horizontal
          ? { x: pad + u * along, y: pad + v * across }
          : { x: pad + v * across, y: pad + (cols - 1 - u) * along },
      );
    }
    let maxX = pad;
    let maxY = pad;
    for (const pt of at.values()) {
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
    const worldW = Math.max(maxX + pad, 320);
    const worldH = Math.max(maxY + pad, 320);

    const hopColor = (col: number) =>
      strip.hops[hopAt(platformCols, col, strip.hops.length)]?.color || run.lineColor || '#9c9890';
    const serviceOf = (node: TunnelNode) => (node.service ? services.get(node.service) : undefined);

    const edges: Edge[] = [];
    const cornerR = Math.min(along, across) * 0.5;
    for (const node of Object.values(run.nodes)) {
      for (const nextId of node.next) {
        const target = run.nodes[nextId];
        const a = at.get(node.id);
        const b = at.get(nextId);
        if (!target || !a || !b) continue;
        const main = node.lane === 1 && target.lane === 1;
        const svc = serviceOf(node) ?? serviceOf(target);
        const color = main ? hopColor(node.col) : (svc?.color ?? BRANCH_COLOR);
        const kind: Edge['kind'] =
          node.id === here.id
            ? 'live'
            : node.state === 'done' && (target.state === 'done' || target.id === here.id)
              ? 'walked'
              : 'latent';
        edges.push({
          key: `${node.id}>${nextId}`,
          d: roundedPath(octilinear(a, b, horizontal), cornerR),
          color,
          main,
          kind,
        });
      }
    }
    // Service lines under the running line, like a real map's trunk.
    edges.sort((x, y) => Number(x.main) - Number(y.main));

    // A running-line stop where a service line peels off or rejoins is an
    // interchange; so is a service stop with a crossover back to the trunk.
    const interchange = new Set<string>();
    for (const node of Object.values(run.nodes)) {
      for (const nextId of node.next) {
        const target = run.nodes[nextId];
        if (!target || node.lane === target.lane) continue;
        interchange.add(node.id);
        interchange.add(target.id);
      }
    }

    // Roundels: each real line where the trip boards it, each service line
    // where it peels off. Offset outward so they never sit on a stop.
    const roundels: Roundel[] = [];
    const legend: LegendEntry[] = [];
    let lastLine = '';
    for (let h = 0; h < strip.hops.length; h++) {
      const hop = strip.hops[h];
      if (hop.lineCode === lastLine) continue;
      lastLine = hop.lineCode;
      legend.push({
        key: `line-${h}`,
        code: hop.lineCode,
        name: hop.lineName,
        color: hop.color,
        service: false,
      });
      const pc = platformCols[h];
      const anchor = pc !== undefined ? run.columns[pc]?.[0] : undefined;
      const pt = anchor ? at.get(anchor) : undefined;
      if (!pt) continue;
      // Platform columns never carry side passages, so straight across from
      // the box is always clear.
      const off = horizontal ? { x: pt.x, y: pt.y - across * 0.85 } : { x: pt.x - across * 1.05, y: pt.y };
      roundels.push({ key: `r-${h}`, code: hop.lineCode, color: hop.color, pt: off, small: false });
    }
    const listed = new Set<string>();
    for (const svc of run.services ?? []) {
      if (listed.has(svc.kind)) continue;
      listed.add(svc.kind);
      legend.push({
        key: svc.id,
        code: svc.code,
        name: msgOr(`ui.tunnel.service.${svc.kind}`, SERVICE_KINDS[svc.kind]?.name ?? svc.code, undefined, locale),
        color: svc.color,
        service: true,
      });
    }

    const codes = runningCodes(run, strip, platformCols);

    const dots = Object.values(run.nodes)
      .map((n) => {
        const pt = at.get(n.id);
        if (!pt || n.kind === 'platform') return null;
        return { id: n.id, pt, interchange: interchange.has(n.id), color: n.lane === 1 ? hopColor(n.col) : (serviceOf(n)?.color ?? BRANCH_COLOR) };
      })
      .filter((d): d is NonNullable<typeof d> => !!d);

    return {
      at,
      edges,
      dots,
      roundels,
      legend,
      codes,
      services,
      hopColor,
      along,
      across,
      worldW,
      worldH,
    };
  }, [run, strip, here.id, phase, horizontal, locale]);

  const homeCam = useMemo(() => {
    const pt = layout.at.get(here.id);
    const vw = view.w || 720;
    const vh = view.h || 480;
    const span = horizontal ? vw / (layout.along * 5.2) : vh / (layout.along * 5.6);
    const z = clamp(span, 0.55, 1.15);
    const ax = horizontal ? vw * 0.3 : vw / 2;
    const ay = horizontal ? vh / 2 : vh * 0.72;
    if (!pt) return { z, x: ax, y: ay };
    return { z, x: ax - pt.x * z, y: ay - pt.y * z };
  }, [layout, here.id, view.w, view.h, horizontal]);

  const applied = cam ?? homeCam;
  camRef.current = applied;

  useLayoutEffect(() => {
    setCam(null);
  }, [run.id, horizontal]);

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


  const platformBox = (node: TunnelNode) => {
    const stop = node.stationIndex !== undefined ? strip.stops[node.stationIndex] : undefined;
    return { stop, codes: stop?.codes.length ? stop.codes : node.stationId ? [node.stationId] : [] };
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={surfaceRef}
        role="img"
        aria-label={ariaLabel}
        className={`relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundColor: MAP_VOID,
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(232,229,221,0.06) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onClickCapture={onClickCapture}
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
              <filter
                id="sv-line-glow"
                filterUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={layout.worldW}
                height={layout.worldH}
              >
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {layout.edges.map((e) => (
              <path
                key={`case-${e.key}`}
                d={e.d}
                fill="none"
                stroke={MAP_VOID}
                strokeWidth={e.main ? 16 : 12}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {layout.edges.map((e) => (
              <path
                key={`line-${e.key}`}
                d={e.d}
                fill="none"
                stroke={e.color}
                strokeWidth={e.main ? 10 : 6.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={e.kind === 'walked' ? 0.32 : e.kind === 'live' ? 1 : 0.9}
                filter={e.kind === 'live' ? 'url(#sv-line-glow)' : undefined}
              />
            ))}
            {layout.edges
              .filter((e) => e.kind === 'live')
              .map((e) => (
                <path
                  key={`live-${e.key}`}
                  d={e.d}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray="6 10"
                  opacity={0.85}
                >
                  <animate attributeName="stroke-dashoffset" from="32" to="0" dur="1.2s" repeatCount="indefinite" />
                </path>
              ))}
            {layout.dots.map((d) =>
              d.interchange ? (
                <rect
                  key={`dot-${d.id}`}
                  x={d.pt.x - 11}
                  y={d.pt.y - 11}
                  width={22}
                  height={22}
                  rx={7}
                  fill={STOP_FILL}
                  stroke={MAP_VOID}
                  strokeWidth={3.5}
                />
              ) : (
                <circle
                  key={`dot-${d.id}`}
                  cx={d.pt.x}
                  cy={d.pt.y}
                  r={7.5}
                  fill={STOP_FILL}
                  stroke={MAP_VOID}
                  strokeWidth={3.5}
                />
              ),
            )}
            {layout.roundels.map((r) => (
              <g key={r.key}>
                <circle cx={r.pt.x} cy={r.pt.y} r={20} fill={STOP_FILL} stroke={r.color} strokeWidth={6} />
                <text
                  x={r.pt.x}
                  y={r.pt.y + 5}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={800}
                  fill="#111"
                  style={{ fontFamily: 'inherit' }}
                >
                  {r.code}
                </text>
              </g>
            ))}
          </svg>

          {run.columns.flatMap((ids) =>
            ids.map((id) => {
              const node = run.nodes[id];
              const pt = layout.at.get(id);
              if (!node || !pt) return null;
              if (node.kind === 'platform') {
                const { stop, codes } = platformBox(node);
                return (
                  <PlatformBox
                    key={node.id}
                    run={run}
                    node={node}
                    x={pt.x}
                    y={pt.y}
                    name={stop?.name ?? node.name}
                    codes={codes}
                    net={net}
                    fallbackColor={layout.hopColor(node.col)}
                    selected={node.id === selectedId}
                    onSelect={onSelect}
                  />
                );
              }
              const svc = node.service ? layout.services.get(node.service) : undefined;
              const code = node.lane === 1 ? layout.codes.get(id) : node.code;
              const color = node.lane === 1 ? layout.hopColor(node.col) : (svc?.color ?? BRANCH_COLOR);
              return (
                <NodePip
                  key={node.id}
                  run={run}
                  node={node}
                  x={pt.x}
                  y={pt.y}
                  code={code}
                  color={color}
                  side={horizontal ? (node.lane <= 0 ? 'above' : 'below') : node.lane <= 0 ? 'left' : 'right'}
                  selected={node.id === selectedId}
                  onSelect={onSelect}
                />
              );
            }),
          )}
        </div>

        <CrawlLegend entries={layout.legend} compact={view.w > 0 && view.w < 560} />
      </div>
    </div>
  );
}

/** Dark text on the light liveries (gold, lime), white on the rest. */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111' : '#fff';
}

/** A station code chip: line colour block, code in bold, like a platform sign. */
function CodeBadge({ code, color, size = 'sm' }: { code: string; color: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-block rounded-[3px] font-bold leading-none tabular-nums ${
        size === 'md' ? 'px-1.5 py-[3px] text-body' : 'px-1 py-[2px] text-micro'
      }`}
      style={{ background: color, color: inkOn(color) }}
    >
      {code}
    </span>
  );
}

function codeColor(net: MrtNetwork | null, code: string, fallback: string): string {
  const prefix = code.replace(/[0-9].*$/, '');
  const line = net?.lineByCode.get(prefix);
  if (!line || !net) return fallback;
  return displayLine(net, line).color;
}

function stateRing(isHere: boolean, isNext: boolean): string {
  if (isHere) return 'ring-2 ring-astral shadow-[0_0_18px_rgba(43,196,217,0.55)]';
  if (isNext) return 'ring-2 ring-signal/80';
  return '';
}

/** A real station on the trip, drawn as a metro-map interchange box. */
function PlatformBox({
  run,
  node,
  x,
  y,
  name,
  codes,
  net,
  fallbackColor,
  selected,
  onSelect,
}: {
  run: TunnelRun;
  node: TunnelNode;
  x: number;
  y: number;
  name: string;
  codes: string[];
  net: MrtNetwork | null;
  fallbackColor: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useT();
  const here = currentNode(run);
  const isHere = node.id === here.id;
  const isNext = here.next.includes(node.id);
  const revealed = isRevealed(run, node);
  const past = node.state === 'done' && !isHere;
  return (
    <div
      className="absolute"
      style={{ left: x, top: y, zIndex: 300, transform: 'translate(-50%, -50%)', opacity: past ? 0.55 : 1 }}
    >
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        disabled={!revealed && !isNext}
        {...tip(t('ui.tunnel.metaTitle', { label: t('ui.tunnel.meta.platform.label'), name }))}
        className={`flex items-center gap-2 rounded-xl border-[3px] border-[#e8e6e1] bg-[#121214] px-3 py-1.5 text-left ${stateRing(
          isHere,
          isNext,
        )} ${selected ? 'outline outline-1 outline-offset-4 outline-concrete-200/50' : ''}`}
      >
        <span className="flex flex-col">
          <span className="max-w-[9rem] truncate text-read font-bold leading-tight text-white">{name}</span>
          {isHere && <span className="text-micro uppercase tracking-wider text-astral">{t('ui.tunnel.you')}</span>}
        </span>
        <span className="flex flex-col gap-[3px]">
          {codes.map((c) => (
            <CodeBadge key={c} code={c} color={codeColor(net, c, fallbackColor)} />
          ))}
        </span>
      </button>
    </div>
  );
}

function NodePip({
  run,
  node,
  x,
  y,
  code,
  color,
  side,
  selected,
  onSelect,
}: {
  run: TunnelRun;
  node: TunnelNode;
  x: number;
  y: number;
  code?: string;
  color: string;
  side: 'above' | 'below' | 'left' | 'right';
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { locale, t } = useT();
  const here = currentNode(run);
  const isHere = node.id === here.id;
  const isNext = here.next.includes(node.id);
  const revealed = isRevealed(run, node);
  const past = node.state === 'done' && !isHere;
  const meta = TUNNEL_NODE_META[node.kind];
  const metaLabel = msgOr(`ui.tunnel.meta.${node.kind}.label`, meta.label, undefined, locale);
  const name = revealed ? node.name : t('ui.tunnel.unknown');

  const labelPos: Record<typeof side, string> = {
    above: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5 items-center text-center',
    below: 'top-full left-1/2 -translate-x-1/2 mt-1.5 items-center text-center',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5 items-end text-right',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5 items-start text-left',
  };

  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: y,
        zIndex: isHere || isNext ? 250 : 200,
        transform: 'translate(-50%, -50%)',
        opacity: past ? 0.45 : revealed || isNext ? 1 : 0.6,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        disabled={!revealed && !isNext}
        {...tip(revealed ? t('ui.tunnel.metaTitle', { label: metaLabel, name: node.name }) : t('ui.tunnel.farAhead'))}
        className={`relative block h-9 w-9 rounded-full ${selected ? 'outline outline-1 outline-offset-2 outline-concrete-200/50' : ''}`}
      >
        <span
          className={`absolute inset-[22%] rounded-full ${stateRing(isHere, isNext)} ${
            isNext ? 'hover:bg-signal/25' : ''
          }`}
        />
      </button>
      <div
        className={`pointer-events-none absolute flex w-max max-w-[8.5rem] flex-col gap-0.5 rounded bg-[#0c0c0e]/80 px-1 py-0.5 ${labelPos[side]}`}
      >
        <span className="flex items-center gap-1">
          {code && <CodeBadge code={code} color={color} />}
          <span className={isHere ? 'text-astral' : isNext ? 'text-signal' : 'text-concrete-400'}>
            <Icon name={revealed ? meta.icon : 'tunnel.unknown'} size={16} />
          </span>
        </span>
        <span
          className={`max-w-[8.5rem] truncate text-body font-semibold leading-tight ${
            isHere ? 'text-astral' : revealed ? 'text-concrete-100' : 'text-concrete-400'
          }`}
        >
          {isHere ? t('ui.tunnel.you') : name}
          {revealed && isNext ? <span className="text-hiss"> ▲{nodeThreat(node)}</span> : null}
        </span>
      </div>
    </div>
  );
}

/** Lines on this crawl, metro-legend style: real lines first, then service lines. */
function CrawlLegend({ entries, compact }: { entries: LegendEntry[]; compact: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState<boolean | null>(null);
  if (!entries.length) return null;
  const shown = open ?? !compact;
  if (!shown) {
    return (
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen(true)}
        className="absolute right-2 top-2 z-[500] flex items-center gap-1 rounded border border-white/15 bg-concrete-900/90 px-2 py-1 text-micro text-white/75 shadow-signage"
      >
        {entries.map((e) => (
          <span key={e.key} className="inline-block h-2.5 w-1 rounded-sm" style={{ background: e.color }} />
        ))}
        <span className="ml-1">{t('ui.tunnel.lines')}</span>
      </button>
    );
  }
  return (
    <div
      className={`absolute right-2 top-2 z-[500] max-w-[46%] rounded border border-white/15 bg-concrete-900/90 p-2 text-micro text-white/75 shadow-signage ${
        compact ? 'max-w-[70%] cursor-pointer' : 'pointer-events-none'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={compact ? () => setOpen(false) : undefined}
    >
      {entries.map((e, i) => (
        <div key={e.key}>
          {e.service && !entries[i - 1]?.service && (
            <div className="mb-0.5 mt-1 border-t border-white/10 pt-1 uppercase tracking-wider text-white/40">
              {t('ui.tunnel.serviceLines')}
            </div>
          )}
          <div className="flex items-center gap-1.5 py-[1px]">
            <span className="inline-block h-1 w-5 shrink-0 rounded" style={{ background: e.color }} />
            <CodeBadge code={e.code} color={e.color} />
            <span className="truncate">{e.name}</span>
          </div>
        </div>
      ))}
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
  const { locale, t } = useT();
  return (
    <div className="shrink-0 border-t border-astral/30 bg-astral/5 px-3 py-2">
      <div className="mb-1.5 text-label uppercase text-astral">{t('ui.tunnel.campWelcome', { name })}</div>
      {servicesUsed ? (
        <p className="mb-2 text-body text-concrete-400">
          {t('ui.tunnel.campUsed')}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onRest}
            className="flex-1 rounded border border-astral/40 px-2 py-1.5 text-body text-astral hover:bg-astral/10"
          >
            <Icon name="action.sleep" size={12} /> {t('ui.tunnel.sleep')}
            <span className="block text-micro opacity-70">{t('ui.tunnel.sleepHint')}</span>
          </button>
          <button
            onClick={onTreat}
            className="flex-1 rounded border border-astral/40 px-2 py-1.5 text-body text-astral hover:bg-astral/10"
          >
            <Icon name="hdb.doctor" size={12} /> {t('ui.tunnel.patch')}
            <span className="block text-micro opacity-70">{t('ui.tunnel.patchHint')}</span>
          </button>
        </div>
      )}

      {offer && (
        <div className="mt-2 rounded border border-concrete-600 bg-concrete-950/60 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2 text-body">
            <span>
              <span className="text-hiss">− {itemName(offer.wantDefId, locale)}</span>
              <span className="text-concrete-400">{t('ui.tunnel.forConnector')}</span>
              <span className="text-signal">+ {itemName(offer.giveDefId, locale)}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                onClick={onAccept}
                className="rounded bg-signal/90 px-2 py-1 text-body font-bold text-black hover:bg-signal"
              >
                {t('ui.tunnel.trade')}
              </button>
              <button
                onClick={onDecline}
                className="rounded border border-concrete-600 px-2 py-1 text-body hover:bg-white/5"
              >
                {t('ui.tunnel.pass')}
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CarriagePanel({
  name,
  onInvert,
  onSmash,
}: {
  name: string;
  onInvert: () => void;
  onSmash: () => void;
}) {
  const { t } = useT();
  return (
    <div className="shrink-0 border-t border-astral/30 bg-astral/5 px-3 py-2">
      <div className="mb-1.5 text-label uppercase text-astral">{t('ui.tunnel.carriageBlocked', { name })}</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onInvert}
          className="flex-1 rounded border border-astral/40 px-2 py-1.5 text-body text-astral hover:bg-astral/10"
        >
          {t('ui.tunnel.dropInvert')}
          <span className="block text-micro opacity-70">
            {t('ui.tunnel.invertHint', {
              min: CARRIAGE_INVERT_MINUTES,
              energy: CARRIAGE_INVERT_ENERGY,
            })}
          </span>
        </button>
        <button
          type="button"
          onClick={onSmash}
          className="flex-1 rounded border border-astral/40 px-2 py-1.5 text-body text-astral hover:bg-astral/10"
        >
          {t('ui.tunnel.smash')}
          <span className="block text-micro opacity-70">
            {t('ui.tunnel.smashHint', { min: CARRIAGE_SMASH_MINUTES })}
          </span>
        </button>
      </div>
    </div>
  );
}

function CheckpointPanel({
  name,
  dc,
  onPay,
  onSneak,
}: {
  name: string;
  dc: number;
  onPay: () => void;
  onSneak: () => void;
}) {
  const { t } = useT();
  return (
    <div className="shrink-0 border-t border-astral/30 bg-astral/5 px-3 py-2">
      <div className="mb-1.5 text-label uppercase text-astral">{t('ui.tunnel.checkpointHeld', { name })}</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPay}
          className="flex-1 rounded border border-astral/40 px-2 py-1.5 text-body text-astral hover:bg-astral/10"
        >
          {t('ui.tunnel.payFare')}
          <span className="block text-micro opacity-70">{priceList(FACTION_CONFIG.sta.tribute)}</span>
        </button>
        <button
          type="button"
          onClick={onSneak}
          className="flex-1 rounded border border-astral/40 px-2 py-1.5 text-body text-astral hover:bg-astral/10"
        >
          {t('ui.tunnel.slipPast')}
          <span className="block text-micro opacity-70">{t('ui.tunnel.dexVsDc', { dc })}</span>
        </button>
      </div>
    </div>
  );
}

/** The commit pane: what it is, what it costs, and the one button that does it. */
function NodeDetail({
  run,
  node,
  canWalk,
  blocked,
  mayExit,
  onWalk,
  onExit,
}: {
  run: TunnelRun;
  node: TunnelNode;
  canWalk: boolean;
  blocked: boolean;
  mayExit: boolean;
  onWalk: () => void;
  onExit: () => void;
}) {
  const { locale, t } = useT();
  const meta = TUNNEL_NODE_META[node.kind];
  const metaLabel = msgOr(
    `ui.tunnel.meta.${node.kind}.label`,
    meta.label,
    undefined,
    locale,
  );
  const metaVerb = msgOr(
    `ui.tunnel.meta.${node.kind}.verb`,
    meta.verb,
    undefined,
    locale,
  );
  const revealed = isRevealed(run, node);
  const arrival = isArrival(run, node);
  const hazard = node.hazard ? TUNNEL_HAZARD[node.hazard] : null;
  const standingHere = node.id === run.currentId;
  const blurb = !revealed
    ? t('ui.tunnel.unrevealedBlurb')
    : node.elite
      ? t('ui.tunnel.eliteBlurb')
      : hazard
        ? t(`ui.tunnel.hazard.${node.hazard}.blurb`)
        : t(`ui.tunnel.meta.${node.kind}.blurb`);

  return (
    <div className="shrink-0 border-t border-concrete-600 bg-concrete-900/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-plate uppercase text-concrete-50">
            {revealed
              ? t('ui.tunnel.nodeTitle', { name: node.name, label: metaLabel })
              : t('ui.tunnel.furtherDown')}
          </div>
          <p className="mt-1 text-body text-concrete-400">{blurb}</p>
        </div>
        <div className="shrink-0 text-right text-micro tabular-nums text-concrete-400">
          <div>{t('ui.tunnel.minutesApprox', { n: nodePreviewMinutes(run, node) })}</div>
          {revealed && hazard && (
            <div className="text-hiss">
              {t('ui.tunnel.attrVsDc', {
                attr: t(`ui.attributes.short.${hazard.attr}`),
                dc: hazardDc(node),
              })}
            </div>
          )}
          {revealed && node.kind === 'signal' && (
            <div className="text-hiss">
              {t('ui.tunnel.attrVsDc', {
                attr: t('ui.attributes.short.wits'),
                dc: hazardDc(node),
              })}
            </div>
          )}
          {revealed && node.kind === 'pack' && (
            <div className="text-hiss">
              {node.elite ? `${t('ui.tunnel.stalker')} · ` : ''}
              {t('ui.tunnel.threat', { n: nodeThreat(node) })}
            </div>
          )}
        </div>
      </div>

      {mayExit && standingHere && (
        <button
          type="button"
          onClick={onExit}
          className="mt-2 w-full rounded border border-astral/50 bg-astral/15 py-2 text-read font-bold text-astral transition hover:bg-astral/25"
        >
          {t('ui.tunnel.exitHere', { name: node.name })}
        </button>
      )}

      <button
        disabled={!canWalk}
        onClick={onWalk}
        className="mt-2 w-full rounded bg-signal/90 py-2 text-read font-bold text-black transition hover:bg-signal disabled:opacity-30"
      >
        {canWalk
          ? arrival
            ? t('ui.tunnel.verbAt', { verb: metaVerb, name: run.toName })
            : t('ui.tunnel.verbName', { verb: metaVerb, name: node.name })
          : blocked
            ? t('ui.tunnel.pickWayFirst')
            : mayExit && standingHere
              ? t('ui.tunnel.keepWalking')
              : t('ui.tunnel.pickForward')}
      </button>
      <p className="mt-1 text-center text-micro text-concrete-400/70">
        {mayExit
          ? t('ui.tunnel.exitHint')
          : t('ui.tunnel.forwardHint')}
      </p>
    </div>
  );
}
