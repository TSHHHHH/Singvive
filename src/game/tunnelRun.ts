import type { AttributeKey, LocationState } from './types';
import type { Rng } from './rng';
import type { IconName } from '../icons/keys';
import { effectiveDanger } from './noise';
import { hordeIntensity } from './goal';
import { timeOfDay } from './weather';

/**
 * One walk through the tunnels along a planned route (one or many stations).
 * Generation lays a through running tunnel first (platforms + corridor nodes),
 * then hangs service lines off it — maintenance walkways, cable galleries,
 * drainage culverts — that peel away from the running line, run for a few
 * stops on their own, and rejoin. Each one is a named, coloured line with its
 * own stop codes, so the crawl reads like a metro map and a fork is a real
 * route choice. Everything here is pure — the store owns the live run and
 * applies the deltas.
 *
 * The trains stopped a long time ago. What's down there now is standing water,
 * the dead, and the people who decided a bore with two exits was safer than a
 * flat with one.
 */

export type TunnelNodeKind =
  | 'platform'
  | 'pack'
  | 'scavenge'
  | 'settlement'
  | 'hazard'
  | 'carriage'
  | 'signal'
  | 'checkpoint';

/** What the player knows about a node. Reveal runs one column ahead. */
export type TunnelNodeState = 'unknown' | 'revealed' | 'done';

export type TunnelHazard = 'collapse' | 'floodwater' | 'live_rail' | 'blackout' | 'pinch';

export type CarriageChoice = 'invert' | 'smash';
export type CheckpointChoice = 'pay' | 'sneak';

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
  /** 0..5, baked at generation. */
  danger: number;
  hazard?: TunnelHazard;
  /** Side-passage nodes: the id of the service line they sit on. */
  service?: string;
  /** Side-passage nodes: stop code on that service line, e.g. "CB2". */
  code?: string;
  /** Scavenge / carriage smash: extra loot rolls for a place nobody has reached yet. */
  lootMod?: number;
  offer?: TunnelTrade;
  /** Settlement: rest/treat already taken — one-time camp services. */
  servicesUsed?: boolean;
  /** Contact: a Stalker has been keeping pace. */
  elite?: boolean;
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
  baseDanger: number;
  /**
   * Extra columns of torch-light from a working signal board. 0 or 1.
   * Older saves omit this — treat missing as 0.
   */
  sightBonus?: number;
  /**
   * Monotonic, bumped on every resolved node and folded into every rng key —
   * so a re-roll after a fight that a failed roll caused isn't the same roll.
   */
  seq: number;
  /** Walking minutes charged for each hop between columns. */
  minutesPerHop: number;
  /** Service lines (side passages) — absent on older saves. */
  services?: ServiceLine[];
}

/** A side passage drawn as its own line on the crawl map. */
export interface ServiceLine {
  id: string;
  /** Code prefix shown on its stops, e.g. "CB". */
  code: string;
  /** Key into SERVICE_KINDS — the display name is looked up from it. */
  kind: ServiceKind;
  color: string;
  lane: number;
  /** Node ids in running order. */
  nodes: string[];
}

export type ServiceKind = 'walkway' | 'cable' | 'drain' | 'vent' | 'evac' | 'oldbore';

/**
 * The service-line table. Codes deliberately avoid every real SG prefix
 * (NS EW CG NE CC CE DT TE BP SE SW PE PW), and colours stay clear of the
 * official liveries so a side passage never reads as a real line.
 */
export const SERVICE_KINDS: Record<ServiceKind, { code: string; name: string }> = {
  walkway: { code: 'MW', name: 'Maintenance Walkway' },
  cable: { code: 'CB', name: 'Cable Gallery' },
  drain: { code: 'DR', name: 'Drainage Culvert' },
  vent: { code: 'VA', name: 'Ventilation Adit' },
  evac: { code: 'EV', name: 'Evacuation Passage' },
  oldbore: { code: 'OB', name: 'Old Bore' },
};

const SERVICE_COLORS = ['#e2629b', '#20b2a6', '#62b6e8', '#a9c94a', '#b39ddb', '#e8c547'] as const;

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
  carriage: {
    label: 'Carriage',
    blurb: 'A consist that never made the next station. Under it, or through it.',
    icon: 'tunnel.carriage',
    verb: 'Climb through',
    minutes: 0, // billed on the choice
  },
  signal: {
    label: 'Signal',
    blurb: 'A cabinet of dead lights. If anything still works, you will see further down the bore.',
    icon: 'tunnel.signal',
    verb: 'Read the board',
    minutes: 8,
  },
  checkpoint: {
    label: 'Checkpoint',
    blurb: 'STA still claims this stretch, and they saw you first.',
    icon: 'tunnel.checkpoint',
    verb: 'Approach',
    minutes: 5,
  },
};

export interface TunnelHazardDef {
  label: string;
  blurb: string;
  attr: AttributeKey;
  energyCost: number;
  /** Minutes on a successful crossing (on top of the walk between columns). */
  minutes: number;
  /** Minutes when the check fails. Defaults to `minutes`. */
  failMinutes?: number;
  failEnergyMult: number;
  wound?: { min: number; max: number };
}

/** Tunnel-local obstruction table — not the surface trek hazards. */
export const TUNNEL_HAZARD: Record<TunnelHazard, TunnelHazardDef> = {
  floodwater: {
    label: 'Floodwater',
    blurb: 'Black water, chest deep and moving. The pumps died with the grid.',
    attr: 'endurance',
    energyCost: 6,
    minutes: 15,
    failEnergyMult: 2,
  },
  collapse: {
    label: 'Falling path',
    blurb: 'Tiles, hangers, a loose crown — anything may come down. Keep moving.',
    attr: 'dexterity',
    energyCost: 7,
    minutes: 15,
    failEnergyMult: 2,
    wound: { min: 12, max: 24 },
  },
  live_rail: {
    label: 'Live rail',
    blurb: 'The third rail still bites. Isolate it, or jump it, or cook.',
    attr: 'wits',
    energyCost: 5,
    minutes: 15,
    failEnergyMult: 2,
    wound: { min: 8, max: 18 },
  },
  blackout: {
    label: 'Blackout',
    blurb: 'The lights died and the bore swallowed the rest. This will take a while.',
    attr: 'perception',
    energyCost: 4,
    minutes: 50,
    failMinutes: 75,
    failEnergyMult: 2,
  },
  pinch: {
    label: 'Pinch',
    blurb: 'The bore squeezed shut. You force a body-width through, or you do not.',
    attr: 'strength',
    energyCost: 8,
    minutes: 15,
    failEnergyMult: 2,
    wound: { min: 6, max: 16 },
  },
};

/** HUD alias — label, blurb, and the attribute the check uses. */
export const HAZARD_META: Record<TunnelHazard, { label: string; blurb: string; attr: AttributeKey }> =
  Object.fromEntries(
    (Object.keys(TUNNEL_HAZARD) as TunnelHazard[]).map((k) => {
      const h = TUNNEL_HAZARD[k];
      return [k, { label: h.label, blurb: h.blurb, attr: h.attr }];
    }),
  ) as Record<TunnelHazard, { label: string; blurb: string; attr: AttributeKey }>;

export const ATTR_SHORT: Record<AttributeKey, string> = {
  strength: 'Str',
  dexterity: 'Dex',
  endurance: 'End',
  perception: 'Per',
  wits: 'Wits',
};

/** Carriage: drop under the consist. */
export const CARRIAGE_INVERT_MINUTES = 20;
export const CARRIAGE_INVERT_ENERGY = 8;
/** Carriage: smash through the cars. */
export const CARRIAGE_SMASH_MINUTES = 12;
export const CARRIAGE_BAIT_CHANCE = 0.25;

const STALKER_CHANCE = 0.1;

const NAMES: Record<TunnelNodeKind, readonly string[]> = {
  platform: ['Platform'],
  pack: ['Cross Passage', 'Service Walkway', 'Ventilation Adit', 'Sump Chamber'],
  scavenge: ['Maintenance Bay', 'Cable Store', 'Abandoned Kit', 'Baggage Spill', "Engineer's Cache"],
  settlement: ['Lamp Camp', 'The Ticket Hall', 'Crossover Market', 'Tunnel Kampong'],
  hazard: ['Obstruction'],
  carriage: ['Stalled Train', 'Dead Consist', 'Last Car'],
  signal: ['Signal Room', 'Control Cabinet', 'Relay Niche'],
  checkpoint: ['STA Gate', 'Marshals', 'Fare Barrier', 'Chained Turnstile'],
};

const STALKER_NAMES = ['Keeping Pace', 'Something in the Dark', 'Pacing the Bore'] as const;

const HAZARD_NAMES: Record<TunnelHazard, readonly string[]> = {
  floodwater: ['Flooded Reach', 'Broken Invert', 'Silt Bank'],
  collapse: ['Loose Crown', 'Hanging Span', 'Falling Fittings'],
  live_rail: ['Live Rail', 'Third Rail', 'Sparked Invert'],
  blackout: ['Blackout', 'Dead Lights', 'Dark Stretch'],
  pinch: ['Slab Pinch', 'Choked Invert', 'Squeeze'],
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
const MAX_MID_COLS = 5;
/** Soft cap so a 20-stop ride stays playable on a phone. */
const MAX_TOTAL_COLS = 22;

const clamp = (lo: number, hi: number, n: number) => Math.max(lo, Math.min(hi, n));

const NPC_KINDS: ReadonlySet<TunnelNodeKind> = new Set(['settlement', 'checkpoint']);

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
  ['scavenge', 28],
  ['hazard', 20],
  ['pack', 18],
  ['carriage', 14],
  ['signal', 10],
  ['settlement', 6],
  ['checkpoint', 4],
];

const ADIT_KINDS: [TunnelNodeKind, number][] = [
  ['pack', 24],
  ['scavenge', 16],
  ['settlement', 16],
  ['hazard', 14],
  ['carriage', 12],
  ['signal', 10],
  ['checkpoint', 8],
];

const CONTRAST_KINDS: Record<TunnelNodeKind, readonly TunnelNodeKind[]> = {
  platform: ['scavenge', 'pack', 'hazard', 'carriage'],
  pack: ['scavenge', 'hazard', 'settlement', 'signal', 'carriage'],
  scavenge: ['pack', 'hazard', 'settlement', 'carriage', 'checkpoint'],
  settlement: ['scavenge', 'pack', 'hazard', 'signal'],
  hazard: ['scavenge', 'pack', 'settlement', 'carriage'],
  carriage: ['pack', 'hazard', 'scavenge', 'signal'],
  signal: ['pack', 'scavenge', 'hazard', 'carriage'],
  checkpoint: ['pack', 'hazard', 'scavenge', 'carriage'],
};

function withoutNpc(
  table: readonly [TunnelNodeKind, number][],
): [TunnelNodeKind, number][] {
  return table.filter(([k]) => !NPC_KINDS.has(k));
}

function rollKind(
  rng: Rng,
  npcAllowed: boolean,
  table: readonly [TunnelNodeKind, number][],
): TunnelNodeKind {
  const pool = npcAllowed ? table : withoutNpc(table);
  return rng.weighted(pool);
}

function rollContrast(
  rng: Rng,
  mainKind: TunnelNodeKind,
  npcAllowed: boolean,
  table: readonly [TunnelNodeKind, number][],
): TunnelNodeKind {
  const prefer = new Set(
    CONTRAST_KINDS[mainKind].filter((k) => npcAllowed || !NPC_KINDS.has(k)),
  );
  const pool = table.filter(([k]) => prefer.has(k) && (npcAllowed || !NPC_KINDS.has(k)));
  if (!pool.length) return rollKind(rng, npcAllowed, table);
  return rng.weighted(pool);
}

function rollHazard(rng: Rng): TunnelHazard {
  return rng.weighted([
    ['floodwater', 22],
    ['collapse', 22],
    ['live_rail', 18],
    ['blackout', 20],
    ['pinch', 18],
  ] as const);
}

function fillContent(
  rng: Rng,
  kind: TunnelNodeKind,
  col: number,
  lane: number,
  danger: number,
): TunnelNode {
  const names = NAMES[kind];
  const node: TunnelNode = {
    id: nodeId(col, lane),
    col,
    lane,
    kind,
    state: 'unknown',
    name: rng.pick(names),
    next: [],
    danger,
  };
  if (kind === 'hazard') {
    node.hazard = rollHazard(rng);
    node.name = rng.pick(HAZARD_NAMES[node.hazard]);
  }
  if (kind === 'scavenge' || kind === 'carriage') {
    node.lootMod = rng.weighted([[0, 5] as const, [1, 3] as const, [2, 1] as const]);
  }
  if (kind === 'settlement') node.offer = rng.pick(TUNNEL_TRADES);
  if (kind === 'pack') {
    if (rng.chance(STALKER_CHANCE)) {
      node.elite = true;
      node.name = rng.pick(STALKER_NAMES);
    }
  }
  return node;
}

function spineOf(columns: string[][], nodes: Record<string, TunnelNode>, col: number): TunnelNode {
  const row = columns[col].map((id) => nodes[id]);
  return row.find((n) => n.lane === 1) ?? row[0];
}

function nodeOnLane(
  columns: string[][],
  nodes: Record<string, TunnelNode>,
  col: number,
  lane: number,
): TunnelNode | undefined {
  if (col < 0 || col >= columns.length) return undefined;
  return columns[col].map((id) => nodes[id]).find((n) => n.lane === lane);
}

function orderExits(node: TunnelNode, nodes: Record<string, TunnelNode>): void {
  node.next.sort((a, b) => {
    const la = nodes[a]?.lane ?? 1;
    const lb = nodes[b]?.lane ?? 1;
    return Math.abs(la - 1) - Math.abs(lb - 1) || la - lb;
  });
}

/**
 * Spine always runs through. A side node peels off the previous spine node.
 * If the next column has a same-lane adit, the side bore continues (a parallel
 * track); otherwise it rejoins. Sometimes a crossover offers both.
 */
function linkSpineAndAdits(
  rng: Rng,
  columns: string[][],
  nodes: Record<string, TunnelNode>,
): void {
  for (let c = 0; c < columns.length - 1; c++) {
    spineOf(columns, nodes, c).next = [spineOf(columns, nodes, c + 1).id];
  }
  for (let c = 1; c < columns.length - 1; c++) {
    const prev = spineOf(columns, nodes, c - 1);
    const join = spineOf(columns, nodes, c + 1);
    for (const id of columns[c]) {
      const node = nodes[id];
      if (node.lane === 1) continue;
      if (!prev.next.includes(node.id)) prev.next.push(node.id);
      const cont = nodeOnLane(columns, nodes, c + 1, node.lane);
      const r = rng.fork(`xo:${node.id}`);
      if (cont && r.chance(0.34)) node.next = [join.id, cont.id];
      else if (cont) node.next = [cont.id];
      else node.next = [join.id];
    }
  }
  for (const node of Object.values(nodes)) orderExits(node, nodes);
}

/** Middle columns between two platforms for one hop, before global thinning. */
function midColsForHop(meters: number, mode: 'mrt' | 'lrt'): number {
  const span = clamp(MIN_MID_COLS, MAX_MID_COLS, Math.round(meters / 480));
  return mode === 'lrt' ? Math.max(MIN_MID_COLS, span - 1) : span;
}

/**
 * Thin middle-column budgets so platform + middles stay under MAX_TOTAL_COLS.
 * Platforms are never removed; the longest hop sheds a column first.
 */
function thinMiddles(mids: number[], stationCount: number): number[] {
  const platformCols = stationCount;
  let total = platformCols + mids.reduce((a, b) => a + b, 0);
  if (total <= MAX_TOTAL_COLS) return mids;
  const out = [...mids];
  const cut = (): boolean => {
    let best = -1;
    let bestVal = 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i] <= 0) continue;
      if (out[i] > bestVal) {
        bestVal = out[i];
        best = i;
      }
    }
    if (best < 0 || bestVal <= 0) return false;
    out[best]--;
    total--;
    return true;
  };
  while (total > MAX_TOTAL_COLS) {
    if (!cut()) break;
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
    const kind = rollKind(shape.fork(`main:${col}`), !lastMiddle, CORRIDOR_KINDS);
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
      for (let i = 0; i < midCount; i++) addMain(i === midCount - 1);
    }
  }

  const columnHasNpc = (c: number) =>
    columns[c].some((nid) => NPC_KINDS.has(nodes[nid].kind));

  const placeAdit = (c: number, lane: number, r: Rng) => {
    if (nodeOnLane(columns, nodes, c, lane)) return;
    const here = spineOf(columns, nodes, c);
    if (here.kind === 'platform') return;
    const next = spineOf(columns, nodes, c + 1);
    const lastMiddle = next.kind === 'platform';
    const npcAllowed = !lastMiddle && here.kind !== 'settlement' && here.kind !== 'checkpoint';
    const table = ADIT_KINDS;
    let kind = rollContrast(r.fork('kind'), here.kind, npcAllowed, table);
    const prevSame = nodeOnLane(columns, nodes, c - 1, lane);
    if (kind === 'pack' && (here.kind === 'pack' || prevSame?.kind === 'pack')) {
      kind = rollKind(
        r.fork('nofight'),
        npcAllowed,
        table.filter(([k]) => k !== 'pack'),
      );
    }
    if (NPC_KINDS.has(kind) && columnHasNpc(c)) {
      kind = rollKind(r.fork('nonpc'), false, withoutNpc(table));
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
    columns[c].sort((a, b) => nodes[a].lane - nodes[b].lane);
  };

  // Service lines: per lane, runs of 1–3 side nodes with at least one column
  // of running line between them, so each run reads as its own line that
  // peels off and rejoins rather than one endless parallel track.
  for (const lane of [0, 2]) {
    const r = shape.fork(`svc:${lane}`);
    let c = 1;
    while (c < columns.length - 1) {
      if (spineOf(columns, nodes, c).kind === 'platform' || !r.chance(0.42)) {
        c++;
        continue;
      }
      const want = r.weighted([[1, 3] as const, [2, 4] as const, [3, 3] as const]);
      let len = 0;
      while (len < want && c + len < columns.length - 1) {
        if (spineOf(columns, nodes, c + len).kind === 'platform') break;
        placeAdit(c + len, lane, r.fork(`place:${c + len}`));
        len++;
      }
      c += len + 1;
    }
  }

  // At least one fork between each pair of platforms, so a hop is never a corridor.
  for (let c = 0; c < columns.length; c++) {
    const here = spineOf(columns, nodes, c);
    if (here.kind !== 'platform') continue;
    let end = columns.length - 1;
    for (let n = c + 1; n < columns.length; n++) {
      if (spineOf(columns, nodes, n).kind === 'platform') {
        end = n;
        break;
      }
    }
    if (end <= c + 1) continue;
    let hasFork = false;
    for (let m = c + 1; m < end; m++) {
      if (columns[m].some((id) => nodes[id].lane !== 1)) {
        hasFork = true;
        break;
      }
    }
    if (hasFork) continue;
    const pick = c + 1 + shape.fork(`needfork:${c}`).int(0, end - c - 2);
    const side = shape.fork(`needside:${c}`).chance(0.5) ? 0 : 2;
    placeAdit(pick, side, shape.fork(`needplace:${c}`));
  }

  // Name the runs: every maximal same-lane chain of side nodes is one line.
  const services: ServiceLine[] = [];
  const codeCount: Record<string, number> = {};
  for (let c = 1; c < columns.length - 1; c++) {
    for (const lane of [0, 2]) {
      const start = nodeOnLane(columns, nodes, c, lane);
      if (!start || start.service) continue;
      const chain: TunnelNode[] = [];
      for (let k = c; ; k++) {
        const n = nodeOnLane(columns, nodes, k, lane);
        if (!n) break;
        chain.push(n);
      }
      const r = shape.fork(`svcname:${start.id}`);
      const kind = r.pick(Object.keys(SERVICE_KINDS) as ServiceKind[]);
      const code = SERVICE_KINDS[kind].code;
      const prev = services[services.length - 1];
      const palette = SERVICE_COLORS.filter((col) => col !== prev?.color);
      const line: ServiceLine = {
        id: `svc${services.length}`,
        code,
        kind,
        color: r.pick(palette),
        lane,
        nodes: chain.map((n) => n.id),
      };
      for (const n of chain) {
        codeCount[code] = (codeCount[code] ?? 0) + 1;
        n.service = line.id;
        n.code = `${code}${codeCount[code]}`;
      }
      services.push(line);
    }
  }

  const cols = columns.length;
  linkSpineAndAdits(shape.fork('edges'), columns, nodes);

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
    baseDanger,
    seq: ctx.seq,
    minutesPerHop: Math.max(2, Math.round(ctx.travelMin / Math.max(1, cols - 1))),
    services,
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
 * Carriage and untrusted STA gates block the bore until you pick an approach.
 * Camps are optional — you can walk on without taking a favour.
 */
export function nodeNeedsChoice(node: TunnelNode): boolean {
  return (node.kind === 'carriage' || node.kind === 'checkpoint') && node.state !== 'done';
}

/**
 * You can see the column you're in and the one after it. A working signal
 * board stretches the torch one column further.
 */
export function isRevealed(run: TunnelRun, node: TunnelNode): boolean {
  const sight = 1 + (run.sightBonus ?? 0);
  return node.state === 'done' || node.col <= currentNode(run).col + sight;
}

/** Threat a node actually presents. */
export function nodeThreat(node: TunnelNode): number {
  return clamp(0, 5, node.danger);
}

/** DC for a bore check. Falling paths hit harder. */
export const hazardDc = (node: TunnelNode): number =>
  10 + node.danger + (node.hazard === 'collapse' ? 2 : 0);

export function hazardMinutes(node: TunnelNode, failed = false): number {
  const kind = node.hazard ?? 'collapse';
  const cfg = TUNNEL_HAZARD[kind];
  return failed && cfg.failMinutes != null ? cfg.failMinutes : cfg.minutes;
}

/** Minutes shown on a pip before you walk onto it (assumes a clean crossing). */
export function nodePreviewMinutes(run: TunnelRun, node: TunnelNode): number {
  if (node.kind === 'hazard') return run.minutesPerHop + hazardMinutes(node);
  if (node.kind === 'carriage') {
    return run.minutesPerHop + Math.min(CARRIAGE_INVERT_MINUTES, CARRIAGE_SMASH_MINUTES);
  }
  return run.minutesPerHop + TUNNEL_NODE_META[node.kind].minutes;
}

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

export function setSightBonus(run: TunnelRun, bonus: number): TunnelRun {
  return { ...run, sightBonus: clamp(0, 1, bonus) };
}
