import type { LocationState } from './types';
import type { Rng } from './rng';
import type { IconName } from '../icons/keys';
import { effectiveDanger } from './noise';
import { hordeIntensity } from './goal';
import { timeOfDay } from './weather';

/**
 * One walk through the tunnels along a planned route (one or many stations).
 * Generation lays a through running tunnel first (platforms + corridor nodes),
 * then hangs optional side adits: prev spine → branch node → next spine, so
 * the extra node sits in the middle of a two-hop curve. Everything here is
 * pure — the store owns the live run and applies the deltas.
 *
 * The trains stopped a long time ago. What's down there now is standing water,
 * the dead, and the people who decided a bore with two exits was safer than a
 * flat with one.
 */

export type TunnelNodeKind = 'platform' | 'pack' | 'scavenge' | 'settlement' | 'hazard';

/** What the player knows about a node. Reveal runs one column ahead. */
export type TunnelNodeState = 'unknown' | 'revealed' | 'done';

export type TunnelHazard = 'collapse' | 'floodwater';

export interface TunnelTrade {
  wantDefId: string;
  giveDefId: string;
}

export interface TunnelNode {
  id: string; // `c${col}l${lane}`
  col: number;
  lane: number;
  kind: TunnelNodeKind;
  state: TunnelNodeState;
  /** Flavour name — what this stretch of tunnel actually is. */
  name: string;
  /** Forward edges only. A tunnel doesn't let you take a step back. */
  next: string[];
  /** 0..5 before the live pressure band is added at resolution. */
  danger: number;
  hazard?: TunnelHazard;
  /** Scavenge nodes: extra loot rolls for a place nobody has reached yet. */
  lootMod?: number;
  offer?: TunnelTrade;
  /** Settlement: rest/treat already taken — one-time camp services. */
  servicesUsed?: boolean;
  /** Platform nodes only — which station this column is. */
  stationId?: string;
  /** Platform nodes only — world location id once resolved. */
  locationId?: string;
  /** Index into TunnelRun.stationIds (0 = origin). */
  stationIndex?: number;
}

export interface TunnelRun {
  /** Folded into every rng key. Includes the day and the run sequence. */
  id: string;
  fromLocationId: string;
  toLocationId: string;
  fromStation: string;
  toStation: string;
  fromName: string;
  toName: string;
  /** Ordered station ids including origin and destination. */
  stationIds: string[];
  /** Parallel names for HUD progress. */
  stationNames: string[];
  /** Parallel location ids (may be empty until ensure resolves). */
  stationLocationIds: string[];
  lineCode: string;
  lineName: string;
  lineColor: string;
  /** Distance along the tunnel between the two platforms. */
  meters: number;
  cols: number;
  nodes: Record<string, TunnelNode>;
  /** Column index -> node ids, top lane first. */
  columns: string[][];
  currentId: string;
  /** How loud this run has been. @see PRESSURE_BANDS */
  pressure: number;
  baseDanger: number;
  /**
   * Monotonic, bumped on every resolved node and folded into every rng key —
   * so a re-roll after a fight that a failed roll caused isn't the same roll.
   */
  seq: number;
  /** Walking minutes charged for each hop between columns. */
  minutesPerHop: number;
}

// -------------------------------------------------------------- pressure --

/**
 * Pressure is a charge, not a clock: nothing but the noise you make moves it.
 * Walk quietly past the fights and you can cross a whole segment without
 * waking the bore. @see hdbDungeon HEAT_BANDS, which this deliberately mirrors.
 */
export const PRESSURE_MAX = 100;

export const FIGHT_PRESSURE = 18;
export const HAZARD_PRESSURE = 12;
export const SCAVENGE_PRESSURE = 6;
export const REST_PRESSURE_RELIEF = 25;

export interface PressureBand {
  at: number;
  label: string;
  note: string;
  /** Added to every node's threat while the gauge reads this band. */
  threatBonus: number;
}

/** The one table the model and the HUD both read. */
export const PRESSURE_BANDS: PressureBand[] = [
  { at: 0, label: 'Still', note: 'Dripping water, and your own footsteps.', threatBonus: 0 },
  { at: 25, label: 'Stirring', note: 'Something further down has heard you.', threatBonus: 0 },
  { at: 50, label: 'Awake', note: 'Movement in the dark, keeping pace.', threatBonus: 1 },
  { at: 75, label: 'Hunting', note: 'They know which way you are walking.', threatBonus: 2 },
  { at: 100, label: 'Swarm', note: 'The bore is coming for you.', threatBonus: 3 },
];

export function pressureBand(pressure: number): PressureBand {
  let band = PRESSURE_BANDS[0];
  for (const b of PRESSURE_BANDS) if (pressure >= b.at) band = b;
  return band;
}

// ------------------------------------------------------------ node table --

export interface TunnelNodeMeta {
  label: string;
  blurb: string;
  icon: IconName;
  verb: string;
  /** Minutes the node itself costs, on top of the walk between columns. */
  minutes: number;
}

export const TUNNEL_NODE_META: Record<TunnelNodeKind, TunnelNodeMeta> = {
  platform: {
    label: 'Platform',
    blurb: 'Tiled walls, a dead escalator, and stairs up to the street.',
    icon: 'tunnel.platform',
    verb: 'Climb out',
    minutes: 0,
  },
  pack: {
    label: 'Contact',
    blurb: 'They are in the bore with you, and the bore is one way wide.',
    icon: 'tunnel.pack',
    verb: 'Push through',
    minutes: 0, // the fight bills its own rounds
  },
  scavenge: {
    label: 'Salvage',
    blurb: 'Nobody has been through here since it stopped. That cuts both ways.',
    icon: 'tunnel.scavenge',
    verb: 'Pick it over',
    minutes: 12,
  },
  settlement: {
    label: 'Camp',
    blurb: 'Lamplight on the tiles. People live down here, and they saw you first.',
    icon: 'tunnel.settlement',
    verb: 'Walk in',
    minutes: 5,
  },
  hazard: {
    label: 'Obstruction',
    blurb: 'The tunnel does not want to be walked here.',
    icon: 'tunnel.hazard',
    verb: 'Get past it',
    minutes: 15,
  },
};

export const HAZARD_META: Record<TunnelHazard, { label: string; blurb: string; attr: 'endurance' | 'dexterity' }> = {
  floodwater: {
    label: 'Floodwater',
    blurb: 'Black water, chest deep and moving. The pumps died with the grid.',
    attr: 'endurance',
  },
  collapse: {
    label: 'Collapse',
    blurb: 'The crown came down. A gap at the top, and a long crawl over rubble.',
    attr: 'dexterity',
  },
};

const NAMES: Record<TunnelNodeKind, readonly string[]> = {
  platform: ['Platform'],
  pack: ['Cross Passage', 'Service Walkway', 'Signal Room', 'Ventilation Adit', 'Sump Chamber'],
  scavenge: [
    'Stalled Train',
    'Maintenance Bay',
    'Cable Store',
    'Abandoned Kit',
    'Baggage Spill',
    'Engineer\'s Cache',
  ],
  settlement: ['Lamp Camp', 'The Ticket Hall', 'Crossover Market', 'Tunnel Kampong'],
  hazard: ['Flooded Reach', 'Fallen Crown', 'Broken Invert', 'Silt Bank'],
};

/** What the people down here will part with, and for what. */
const TUNNEL_TRADES: readonly TunnelTrade[] = [
  { wantDefId: 'canned_food', giveDefId: 'bandage' },
  { wantDefId: 'water_bottle', giveDefId: 'painkillers' },
  { wantDefId: 'batteries', giveDefId: 'canned_food' },
  { wantDefId: 'four_d_ticket', giveDefId: 'torch' },
  { wantDefId: 'batteries', giveDefId: 'isotonic' },
  { wantDefId: 'duct_tape', giveDefId: 'medkit' },
];

// ------------------------------------------------------------ generation --

const MIN_MID_COLS = 1;
const MAX_MID_COLS = 4;
/** Soft cap so a 20-stop ride stays playable on a phone. */
const MAX_TOTAL_COLS = 22;

const clamp = (lo: number, hi: number, n: number) => Math.max(lo, Math.min(hi, n));

export interface TunnelStationStop {
  stationId: string;
  locationId: string;
  name: string;
}

/** Everything the generator needs that isn't already on the two locations. */
export interface TunnelCtx {
  from: LocationState;
  to: LocationState;
  /** Ordered stations including origin and destination (length >= 2). */
  stations: TunnelStationStop[];
  /** Meters between consecutive stations (length = stations.length - 1). */
  hopMeters: number[];
  lineCode: string;
  lineName: string;
  lineColor: string;
  /** LRT bores are short and half of them are viaduct — an easier walk. */
  mode: 'mrt' | 'lrt';
  meters: number;
  /** Total walking minutes for the segment, split across the hops. */
  travelMin: number;
  day: number;
  hour: number;
  hordeLevel: number;
  /** Bumped per run by the store so the same trip twice isn't a replay. */
  seq: number;
}

/**
 * How bad this stretch is before anything the player does. The two platforms
 * bracket it — a quiet station on both ends means a quiet bore — and the hour
 * and the horde push it up.
 */
function baseDangerFor(ctx: TunnelCtx): number {
  const ends = (effectiveDanger(ctx.from) + ctx.to.baseDanger) / 2;
  const night = timeOfDay(ctx.hour) !== 'day' ? 1 : 0;
  const horde = hordeIntensity(ctx.hordeLevel) > 0.5 ? 1 : 0;
  const lrt = ctx.mode === 'lrt' ? -1 : 0;
  return clamp(1, 5, Math.round(ends) + night + horde + lrt);
}

const nodeId = (col: number, lane: number) => `c${col}l${lane}`;

const CORRIDOR_KINDS: [TunnelNodeKind, number][] = [
  ['scavenge', 42],
  ['hazard', 26],
  ['pack', 24],
  ['settlement', 8],
];

const ADIT_KINDS: [TunnelNodeKind, number][] = [
  ['pack', 32],
  ['scavenge', 26],
  ['hazard', 20],
  ['settlement', 22],
];

function rollKind(
  rng: Rng,
  campAllowed: boolean,
  table: readonly [TunnelNodeKind, number][],
): TunnelNodeKind {
  const pool = campAllowed ? table : table.filter(([k]) => k !== 'settlement');
  return rng.weighted(pool);
}

function fillContent(
  rng: Rng,
  kind: TunnelNodeKind,
  col: number,
  lane: number,
  danger: number,
): TunnelNode {
  const node: TunnelNode = {
    id: nodeId(col, lane),
    col,
    lane,
    kind,
    state: 'unknown',
    name: rng.pick(NAMES[kind]),
    next: [],
    danger,
  };
  if (kind === 'hazard') node.hazard = rng.pick(['floodwater', 'collapse'] as const);
  if (kind === 'scavenge') node.lootMod = rng.weighted([[0, 5] as const, [1, 3] as const, [2, 1] as const]);
  if (kind === 'settlement') node.offer = rng.pick(TUNNEL_TRADES);
  return node;
}

function spineOf(columns: string[][], nodes: Record<string, TunnelNode>, col: number): TunnelNode {
  const row = columns[col].map((id) => nodes[id]);
  return row.find((n) => n.lane === 1) ?? row[0];
}

/**
 * Through-line first: every column's lane-1 node points at the next.
 * Then each adit is prev-spine → branch → next-spine, so the extra node
 * sits at the apex of a two-hop curve and never shares a hop with the
 * corridor node beside it.
 */
function linkSpineAndAdits(columns: string[][], nodes: Record<string, TunnelNode>): void {
  for (let c = 0; c < columns.length - 1; c++) {
    spineOf(columns, nodes, c).next = [spineOf(columns, nodes, c + 1).id];
  }
  for (let c = 1; c < columns.length - 1; c++) {
    const prev = spineOf(columns, nodes, c - 1);
    const next = spineOf(columns, nodes, c + 1);
    for (const id of columns[c]) {
      const node = nodes[id];
      if (node.lane === 1) continue;
      prev.next.push(node.id);
      node.next = [next.id];
    }
  }
}

/** Middle columns between two platforms for one hop, before global thinning. */
function midColsForHop(meters: number, mode: 'mrt' | 'lrt'): number {
  const span = clamp(MIN_MID_COLS, MAX_MID_COLS, Math.round(meters / 550));
  return mode === 'lrt' ? Math.max(MIN_MID_COLS, span - 1) : span;
}

/**
 * Thin middle-column budgets so platform + middles stay under MAX_TOTAL_COLS.
 * Platforms are never removed.
 */
function thinMiddles(mids: number[], stationCount: number): number[] {
  const platformCols = stationCount;
  let total = platformCols + mids.reduce((a, b) => a + b, 0);
  if (total <= MAX_TOTAL_COLS) return mids;
  const out = [...mids];
  while (total > MAX_TOTAL_COLS) {
    let best = -1;
    let bestVal = 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i] > bestVal) {
        bestVal = out[i];
        best = i;
      }
    }
    if (best < 0 || bestVal <= 0) break;
    out[best]--;
    total--;
  }
  return out;
}

export function generateTunnelRun(rng: Rng, ctx: TunnelCtx): TunnelRun {
  const stations = ctx.stations.length >= 2
    ? ctx.stations
    : [
        {
          stationId: ctx.from.mrtStationId ?? '',
          locationId: ctx.from.id,
          name: ctx.from.name,
        },
        {
          stationId: ctx.to.mrtStationId ?? '',
          locationId: ctx.to.id,
          name: ctx.to.name,
        },
      ];
  const hopMeters =
    ctx.hopMeters.length === stations.length - 1
      ? ctx.hopMeters
      : stations.slice(1).map(() => Math.round(ctx.meters / Math.max(1, stations.length - 1)));

  const id = `${stations[0].stationId}>${stations[stations.length - 1].stationId}:${ctx.day}:${ctx.seq}`;
  const shape = rng.fork('shape');
  const baseDanger = baseDangerFor(ctx);

  let mids = hopMeters.map((m) => midColsForHop(m, ctx.mode));
  mids = thinMiddles(mids, stations.length);

  const nodes: Record<string, TunnelNode> = {};
  const columns: string[][] = [];
  let col = 0;

  const addPlatform = (stop: TunnelStationStop, stationIndex: number, first: boolean) => {
    const idn = nodeId(col, 1);
    const node: TunnelNode = {
      id: idn,
      col,
      lane: 1,
      kind: 'platform',
      state: first ? 'done' : 'unknown',
      name: stop.name,
      next: [],
      danger: clamp(0, 5, baseDanger),
      stationId: stop.stationId,
      locationId: stop.locationId,
      stationIndex,
    };
    nodes[idn] = node;
    columns.push([idn]);
    col++;
  };

  const addMain = (lastMiddle: boolean) => {
    const campAllowed = !lastMiddle;
    const kind = rollKind(shape.fork(`main:${col}`), campAllowed, CORRIDOR_KINDS);
    const node = fillContent(
      rng.fork(`node:${col}:1`),
      kind,
      col,
      1,
      clamp(0, 5, baseDanger + (col > 4 ? 1 : 0)),
    );
    nodes[node.id] = node;
    columns.push([node.id]);
    col++;
  };

  for (let s = 0; s < stations.length; s++) {
    addPlatform(stations[s], s, s === 0);
    if (s < stations.length - 1) {
      const midCount = mids[s];
      for (let i = 0; i < midCount; i++) {
        addMain(i === midCount - 1);
      }
    }
  }

  // Phase 2: hang adits off the spine. A branch is only legal where both
  // neighbours exist, so the extra node can sit in the middle of prev → next.
  for (let c = 1; c < columns.length - 1; c++) {
    const here = spineOf(columns, nodes, c);
    if (here.kind === 'platform') continue;
    const r = shape.fork(`adit:${c}`);
    const next = spineOf(columns, nodes, c + 1);
    const lastMiddle = next.kind === 'platform';
    const campAllowed = !lastMiddle && here.kind !== 'settlement';
    const prevLanes = new Set(columns[c - 1].map((id) => nodes[id].lane));
    const sides: number[] = [];
    if (r.chance(0.56) && (r.chance(0.38) || !prevLanes.has(0))) sides.push(0);
    if (r.chance(0.56) && (r.chance(0.38) || !prevLanes.has(2))) sides.push(2);
    if (sides.length === 2 && r.chance(0.28)) sides.splice(r.int(0, 1), 1);
    for (const lane of sides) {
      let kind = rollKind(shape.fork(`aditkind:${c}:${lane}`), campAllowed, ADIT_KINDS);
      if (kind === 'pack' && here.kind === 'pack') {
        kind = rollKind(
          shape.fork(`aditkind:${c}:${lane}:nofight`),
          campAllowed,
          ADIT_KINDS.filter(([k]) => k !== 'pack'),
        );
      }
      if (kind === 'settlement' && columns[c].some((id) => nodes[id].kind === 'settlement')) {
        kind = rollKind(
          shape.fork(`aditkind:${c}:${lane}:nocamp`),
          false,
          ADIT_KINDS.filter(([k]) => k !== 'settlement'),
        );
      }
      const node = fillContent(
        rng.fork(`node:${c}:${lane}`),
        kind,
        c,
        lane,
        clamp(0, 5, baseDanger + (c > 4 ? 1 : 0)),
      );
      nodes[node.id] = node;
      columns[c].push(node.id);
    }
    columns[c].sort((a, b) => nodes[a].lane - nodes[b].lane);
  }

  const cols = columns.length;
  linkSpineAndAdits(columns, nodes);

  return {
    id,
    fromLocationId: stations[0].locationId || ctx.from.id,
    toLocationId: stations[stations.length - 1].locationId || ctx.to.id,
    fromStation: stations[0].stationId,
    toStation: stations[stations.length - 1].stationId,
    fromName: stations[0].name,
    toName: stations[stations.length - 1].name,
    stationIds: stations.map((s) => s.stationId),
    stationNames: stations.map((s) => s.name),
    stationLocationIds: stations.map((s) => s.locationId),
    lineCode: ctx.lineCode,
    lineName: ctx.lineName,
    lineColor: ctx.lineColor,
    meters: ctx.meters,
    cols,
    nodes,
    columns,
    currentId: columns[0][0],
    pressure: 0,
    baseDanger,
    seq: ctx.seq,
    minutesPerHop: Math.max(2, Math.round(ctx.travelMin / Math.max(1, cols - 1))),
  };
}

// --------------------------------------------------------------- queries --

/** The one rng key builder. Every roll a run makes goes through it. */
export const tunnelKey = (run: TunnelRun, what: string): string =>
  `tun:${run.id}:${run.seq}:${what}`;

export const currentNode = (run: TunnelRun): TunnelNode => run.nodes[run.currentId];

/** The nodes you can step onto from where you stand. */
export function reachable(run: TunnelRun): TunnelNode[] {
  return currentNode(run).next.map((id) => run.nodes[id]);
}

/**
 * You can see the column you're in and the one after it. Beyond that the bore
 * curves and the torch doesn't carry.
 */
export function isRevealed(run: TunnelRun, node: TunnelNode): boolean {
  return node.state === 'done' || node.col <= currentNode(run).col + 1;
}

/** Threat a node actually presents right now, band included. */
export function nodeThreat(run: TunnelRun, node: TunnelNode): number {
  return clamp(0, 5, node.danger + pressureBand(run.pressure).threatBonus);
}

/** DC for a hazard's crossing check. */
export const hazardDc = (node: TunnelNode): number => 10 + node.danger;

export const isArrival = (run: TunnelRun, node: TunnelNode): boolean => {
  if (node.kind !== 'platform') return false;
  // New multi-stop runs tag platforms; older single-segment saves use last column.
  if (run.stationIds?.length) {
    return node.stationIndex === run.stationIds.length - 1;
  }
  return node.col === run.cols - 1;
};

/** Intermediate (or origin) platform where the player may choose to surface. */
export function canExitHere(run: TunnelRun, node: TunnelNode): boolean {
  if (node.kind !== 'platform') return false;
  if (node.id !== run.currentId) return false;
  if (isArrival(run, node)) return false;
  // Origin: you just entered — exit would be pointless, but allow after leaving?
  // Only offer exit once you've reached a later platform.
  return (node.stationIndex ?? 0) > 0;
}

/** Nearest platform column strictly ahead of `afterCol`. */
function nextPlatform(run: TunnelRun, afterCol: number): TunnelNode | undefined {
  let best: TunnelNode | undefined;
  for (const n of Object.values(run.nodes)) {
    if (n.kind !== 'platform' || n.col <= afterCol) continue;
    if (!best || n.col < best.col) best = n;
  }
  return best;
}

/**
 * Where you stand on the planned station list: on a platform, or in the bore
 * walking toward the next one. `nextIndex` is null at the destination.
 */
export interface CrawlPlace {
  index: number;
  atPlatform: boolean;
  nextIndex: number | null;
}

export function crawlPlace(run: TunnelRun): CrawlPlace {
  const here = currentNode(run);
  const total = run.stationIds?.length ?? 2;
  if (here.kind === 'platform') {
    const index = here.stationIndex ?? 0;
    return {
      index,
      atPlatform: true,
      nextIndex: index < total - 1 ? index + 1 : null,
    };
  }
  const next = nextPlatform(run, here.col);
  const nextIndex = next?.stationIndex ?? 1;
  return {
    index: Math.max(0, nextIndex - 1),
    atPlatform: false,
    nextIndex,
  };
}

/** Progress label: "Station 3 / 9". */
export function stationProgress(run: TunnelRun): string {
  const place = crawlPlace(run);
  const total = run.stationIds?.length ?? 2;
  if (place.atPlatform) return `Station ${place.index + 1} / ${total}`;
  return `Toward station ${(place.nextIndex ?? place.index + 1) + 1} / ${total}`;
}

// -------------------------------------------------------------- mutators --

/** Immutable, like the HDB module: the store swaps the whole run in. */
export function stepTo(run: TunnelRun, nodeId: string): TunnelRun {
  const node = run.nodes[nodeId];
  if (!node) return run;
  return {
    ...run,
    currentId: nodeId,
    seq: run.seq + 1,
    nodes: { ...run.nodes, [nodeId]: { ...node, state: 'revealed' } },
  };
}

export function markDone(run: TunnelRun, nodeId: string): TunnelRun {
  const node = run.nodes[nodeId];
  if (!node) return run;
  return { ...run, nodes: { ...run.nodes, [nodeId]: { ...node, state: 'done' } } };
}

export function addPressure(run: TunnelRun, delta: number): TunnelRun {
  return { ...run, pressure: clamp(0, PRESSURE_MAX, run.pressure + delta) };
}
