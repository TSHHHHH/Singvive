import type { LocationState } from './types';
import type { Rng } from './rng';
import type { IconName } from '../icons/keys';
import { effectiveDanger } from './noise';
import { hordeIntensity } from './goal';
import { timeOfDay } from './weather';

/**
 * One walk through the tunnel between two adjacent stations, laid out as a
 * branching left-to-right map: pick a lane, take what's on it, move up a
 * column. Everything here is pure — the store owns the live run and applies
 * the deltas, exactly as hdbDungeon.ts does for a block.
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
  { wantDefId: 'ez_link_card', giveDefId: 'isotonic' },
  { wantDefId: 'duct_tape', giveDefId: 'medkit' },
];

// ------------------------------------------------------------ generation --

const MIN_COLS = 3;
const MAX_COLS = 6;
const LANES = 3; // three is legible on a phone; four is not

const clamp = (lo: number, hi: number, n: number) => Math.max(lo, Math.min(hi, n));

/** Everything the generator needs that isn't already on the two locations. */
export interface TunnelCtx {
  from: LocationState;
  to: LocationState;
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

/** Which lanes a column of `count` nodes occupies, always centred and sorted. */
function lanesFor(rng: Rng, count: number): number[] {
  if (count >= LANES) return [0, 1, 2];
  if (count === 1) return [1];
  return rng.pick([
    [0, 2],
    [0, 1],
    [1, 2],
  ]);
}

const nodeId = (col: number, lane: number) => `c${col}l${lane}`;

/**
 * Pick each node's kind, with three rules applied after the roll: one camp per
 * column at most, never a camp in the last column before the exit (a free heal
 * on the doorstep is not a decision), and never a whole column of fights —
 * a column where every lane is a fight isn't a choice, it's a corridor.
 */
function pickKinds(rng: Rng, count: number, col: number, lastMiddle: number): TunnelNodeKind[] {
  const full: [TunnelNodeKind, number][] = [
    ['pack', 34],
    ['scavenge', 30],
    ['hazard', 22],
    ['settlement', 14],
  ];
  const noCamp = full.filter(([k]) => k !== 'settlement');
  const noFight = full.filter(([k]) => k !== 'pack');

  const out: TunnelNodeKind[] = [];
  for (let i = 0; i < count; i++) {
    const r = rng.fork(`kind:${col}:${i}`);
    const campAllowed = col !== lastMiddle && !out.includes('settlement');
    let kind = r.weighted(campAllowed ? full : noCamp);
    if (kind === 'pack' && count > 1 && out.every((k) => k === 'pack') && out.length === count - 1) {
      kind = r.weighted(campAllowed ? noFight : noFight.filter(([k]) => k !== 'settlement'));
    }
    out.push(kind);
  }
  return out;
}

/**
 * Wire each column to the next. Candidates are limited to within one lane and
 * taken as a contiguous slice, which is what keeps edges from crossing; two
 * fix-up passes then guarantee every node has a way in and a way out.
 */
function linkColumns(rng: Rng, columns: string[][], nodes: Record<string, TunnelNode>): void {
  for (let c = 0; c < columns.length - 1; c++) {
    const here = columns[c].map((id) => nodes[id]);
    const next = columns[c + 1].map((id) => nodes[id]);

    for (const node of here) {
      const near = next.filter((n) => Math.abs(n.lane - node.lane) <= 1);
      const pool = near.length ? near : next;
      const r = rng.fork(`link:${node.id}`);
      const width = pool.length > 1 && r.chance(0.45) ? 2 : 1;
      const start = r.int(0, Math.max(0, pool.length - width));
      node.next = pool.slice(start, start + width).map((n) => n.id);
    }

    // Anything in the next column nobody reaches gets the closest parent...
    for (const n of next) {
      if (here.some((h) => h.next.includes(n.id))) continue;
      const parent = here.reduce((best, h) =>
        Math.abs(h.lane - n.lane) < Math.abs(best.lane - n.lane) ? h : best,
      );
      parent.next.push(n.id);
    }
    // ...and anything here that leads nowhere gets the closest child.
    for (const h of here) {
      if (h.next.length) continue;
      const child = next.reduce((best, n) =>
        Math.abs(n.lane - h.lane) < Math.abs(best.lane - h.lane) ? n : best,
      );
      h.next = [child.id];
    }
  }
}

export function generateTunnelRun(rng: Rng, ctx: TunnelCtx): TunnelRun {
  const id = `${ctx.from.mrtStationId}>${ctx.to.mrtStationId}:${ctx.day}:${ctx.seq}`;
  const shape = rng.fork('shape');

  // Adjacent stations sit ~0.8-2km apart, which this spreads across 3-6
  // columns: a short hop is two decisions, the long ones under the reservoir
  // are five.
  const span = clamp(MIN_COLS, MAX_COLS, 2 + Math.round(ctx.meters / 550));
  const cols = ctx.mode === 'lrt' ? Math.max(MIN_COLS, span - 1) : span;
  const baseDanger = baseDangerFor(ctx);
  const lastMiddle = cols - 2;

  const nodes: Record<string, TunnelNode> = {};
  const columns: string[][] = [];

  for (let col = 0; col < cols; col++) {
    const edge = col === 0 || col === cols - 1;
    // Never one node in a middle column: a column *is* the choice, and a
    // single-lane column is just a corridor with a monster in it.
    const count = edge ? 1 : shape.fork(`count:${col}`).weighted([[2, 6] as const, [3, 4] as const]);
    const lanes = edge ? [1] : lanesFor(shape.fork(`lanes:${col}`), count);
    const kinds = edge ? (['platform'] as TunnelNodeKind[]) : pickKinds(shape, lanes.length, col, lastMiddle);

    const ids: string[] = [];
    lanes.forEach((lane, i) => {
      const kind = kinds[i];
      const r = rng.fork(`node:${col}:${lane}`);
      const node: TunnelNode = {
        id: nodeId(col, lane),
        col,
        lane,
        kind,
        state: col === 0 ? 'done' : 'unknown',
        name: kind === 'platform' ? (col === 0 ? ctx.from.name : ctx.to.name) : r.pick(NAMES[kind]),
        next: [],
        danger: clamp(0, 5, baseDanger + (col > cols / 2 ? 1 : 0)),
      };
      if (kind === 'hazard') node.hazard = r.pick(['floodwater', 'collapse'] as const);
      if (kind === 'scavenge') node.lootMod = r.weighted([[0, 5] as const, [1, 3] as const, [2, 1] as const]);
      if (kind === 'settlement') node.offer = r.pick(TUNNEL_TRADES);
      nodes[node.id] = node;
      ids.push(node.id);
    });
    columns.push(ids);
  }

  linkColumns(rng.fork('edges'), columns, nodes);

  return {
    id,
    fromLocationId: ctx.from.id,
    toLocationId: ctx.to.id,
    fromStation: ctx.from.mrtStationId ?? '',
    toStation: ctx.to.mrtStationId ?? '',
    fromName: ctx.from.name,
    toName: ctx.to.name,
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
    minutesPerHop: Math.max(2, Math.round(ctx.travelMin / (cols - 1))),
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

export const isArrival = (run: TunnelRun, node: TunnelNode): boolean => node.col === run.cols - 1;

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
