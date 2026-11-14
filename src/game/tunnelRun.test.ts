import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  generateTunnelRun,
  MAX_MID_COLS,
  MIN_MID_COLS,
  SERVICE_KINDS, type TunnelCtx, type TunnelRun } from './tunnelRun';
import type { LocationState } from './types';

const loc = (id: string, danger: number) =>
  ({
    id,
    name: id,
    category: 'mrt',
    lat: 1.3,
    lng: 103.85,
    size: 'medium',
    baseDanger: danger,
    currentDanger: danger,
  }) as unknown as LocationState;

const ctx = (stops: number, seq = 1): TunnelCtx => {
  const stations = Array.from({ length: stops }, (_, i) => ({
    stationId: `EW${13 + i}`,
    locationId: `loc-${i}`,
    name: `Stop ${i}`,
  }));
  const hopMeters = stations.slice(1).map((_, i) => 900 + ((i * 377) % 1300));
  return {
    from: loc('loc-0', 2),
    to: loc(`loc-${stops - 1}`, 3),
    stations,
    hopMeters,
    lineCode: 'EW',
    lineName: 'East West Line',
    lineColor: '#009645',
    mode: 'mrt',
    meters: hopMeters.reduce((a, b) => a + b, 0),
    travelMin: 90,
    day: 2,
    hour: 10,
    hordeLevel: 0,
    seq,
  };
};

const gen = (seed: string, stops: number, seq = 1): TunnelRun =>
  generateTunnelRun(new Rng(seed).fork('tunnel'), ctx(stops, seq));

const SEEDS = Array.from({ length: 60 }, (_, i) => `seed-${i}`);

describe('tunnel crawl generation', () => {
  it('is seed-deterministic', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      expect(gen(seed, 5)).toEqual(gen(seed, 5));
    }
  });

  it('puts every side passage on a named service line with its own stop codes', () => {
    for (const seed of SEEDS) {
      const run = gen(seed, 2 + (seed.length % 5));
      const services = run.services ?? [];
      const byId = new Map(services.map((s) => [s.id, s]));
      const codes = new Set<string>();
      for (const node of Object.values(run.nodes)) {
        if (node.lane === 1) {
          expect(node.service).toBeUndefined();
          continue;
        }
        const svc = byId.get(node.service ?? '');
        expect(svc, `${seed} ${node.id}`).toBeDefined();
        expect(svc!.nodes).toContain(node.id);
        expect(node.code?.startsWith(svc!.code)).toBe(true);
        expect(codes.has(node.code!)).toBe(false);
        codes.add(node.code!);
      }
      for (const svc of services) {
        expect(svc.color).toBe(SERVICE_KINDS[svc.kind].color);
        // A service line is one unbroken run on one lane.
        const cols = svc.nodes.map((id) => run.nodes[id].col);
        cols.forEach((c, i) => i > 0 && expect(c).toBe(cols[i - 1] + 1));
        expect(svc.nodes.every((id) => run.nodes[id].lane === svc.lane)).toBe(true);
      }
      for (let i = 1; i < services.length; i++) {
        expect(services[i].kind).not.toBe(services[i - 1].kind);
      }
    }
  });

  it('peels service lines off the running line and rejoins it', () => {
    for (const seed of SEEDS) {
      const run = gen(seed, 4);
      for (const svc of run.services ?? []) {
        const first = run.nodes[svc.nodes[0]];
        const last = run.nodes[svc.nodes[svc.nodes.length - 1]];
        const feeders = Object.values(run.nodes).filter((n) => n.next.includes(first.id));
        expect(feeders.some((n) => n.lane === 1)).toBe(true);
        expect(last.next.some((id) => run.nodes[id].lane === 1)).toBe(true);
      }
    }
  });

  it('makes every hop between platforms an expedition of 5–10 encounters', () => {
    for (const seed of SEEDS) {
      const run = gen(seed, 6);
      const platforms = run.columns
        .map((ids, col) => ({ col, node: run.nodes[ids[0]] }))
        .filter((c) => c.node.kind === 'platform')
        .map((c) => c.col);
      expect(platforms).toHaveLength(6);
      for (let i = 1; i < platforms.length; i++) {
        const mids = platforms[i] - platforms[i - 1] - 1;
        expect(mids).toBeGreaterThanOrEqual(MIN_MID_COLS);
        expect(mids).toBeLessThanOrEqual(MAX_MID_COLS);
      }
    }
  });

  it('offers a fork on every hop between platforms', () => {
    for (const seed of SEEDS) {
      const run = gen(seed, 5);
      const platforms = run.columns
        .map((ids, col) => ({ col, node: run.nodes[ids[0]] }))
        .filter((c) => c.node.kind === 'platform')
        .map((c) => c.col);
      for (let i = 1; i < platforms.length; i++) {
        const [a, b] = [platforms[i - 1], platforms[i]];
        if (b - a < 2) continue;
        const forked = run.columns.slice(a + 1, b).some((ids) => ids.length > 1);
        expect(forked, `${seed} hop ${i}`).toBe(true);
      }
    }
  });

  it('every route through the crawl reaches the destination platform', () => {
    for (const seed of SEEDS) {
      const run = gen(seed, 4);
      const end = run.columns[run.columns.length - 1][0];
      const stack = [run.currentId];
      const seen = new Set<string>();
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const node = run.nodes[id];
        if (id !== end) expect(node.next.length, `${seed} ${id}`).toBeGreaterThan(0);
        stack.push(...node.next);
      }
      expect(seen.has(end)).toBe(true);
    }
  });
});
