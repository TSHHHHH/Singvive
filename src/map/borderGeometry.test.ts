import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { BREACH, along, buildBorder, deckSlab, lengthM, outlineAxis, secondLinkBase, slice, type BorderData } from './borderGeometry';
import { pointInRing } from './geo';

const data = JSON.parse(readFileSync(resolve(__dirname, '../../public/border.json'), 'utf8')) as BorderData;
const scene = buildBorder(data);
const solids = scene.solids.features;
const M_LAT = 111_320;
const M_LNG = M_LAT * Math.cos((1.4 * Math.PI) / 180);
const ll = ([x, y]: [number, number]): [number, number] => [x / M_LNG, y / M_LAT];

const covers = (kind: string, p: [number, number]) =>
  solids.some((f) => f.properties?.kind === kind && pointInRing(p[0], p[1], (f.geometry as Polygon).coordinates[0]));

describe('border bake', () => {
  it('spans the strait at both crossings', () => {
    // The open-water span of the Causeway is a few hundred metres; the Second Link ~1.9 km.
    expect(lengthM(data.causeway.span)).toBeGreaterThan(250);
    expect(lengthM(data.causeway.span)).toBeLessThan(500);
    expect(lengthM(outlineAxis(data.secondLink.outline))).toBeGreaterThan(1700);
    expect(lengthM(outlineAxis(data.secondLink.outline))).toBeLessThan(2100);
  });

  it('puts Johor north of the strait and Singapore checkpoints south of it', () => {
    expect(data.checkpoints.johorBahru.lat).toBeGreaterThan(data.checkpoints.woodlands.lat);
    const ring = data.johorShore;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const jb = data.checkpoints.johorBahru;
    expect(pointInRing(jb.lng, jb.lat, ring)).toBe(true);
    const wl = data.checkpoints.woodlands;
    expect(pointInRing(wl.lng, wl.lat, ring)).toBe(false);
  });
});

describe('buildBorder', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(buildBorder(data))).toBe(JSON.stringify(scene));
  });

  it('leaves a hole in the Causeway deck where it was blown', () => {
    const span = data.causeway.span[0][1] <= data.causeway.span.at(-1)![1] ? data.causeway.span : [...data.causeway.span].reverse();
    const m = lengthM(span);
    const mid = ll(along(span, (m * (BREACH.from + BREACH.to)) / 2).at);
    const stub = ll(along(span, m * BREACH.from * 0.5).at);
    expect(covers('deck', mid)).toBe(false);
    expect(covers('deck', stub)).toBe(true);
    expect(pointInRing(mid[0], mid[1], (scene.breach.features[0].geometry as Polygon).coordinates[0])).toBe(true);
  });

  it('keeps the water mains across the breach', () => {
    const pipes = solids.filter((f) => f.properties?.kind === 'pipe');
    expect(pipes.length).toBeGreaterThan(30);
    expect(scene.lines.features.filter((f) => f.properties?.kind === 'pipe')).toHaveLength(3);
  });

  it('builds every solid as a closed ring standing above its base', () => {
    for (const f of solids) {
      const ring = (f.geometry as Polygon).coordinates[0];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(f.properties!.top).toBeGreaterThan(f.properties!.base);
    }
    const kinds = new Set(solids.map((f) => f.properties!.kind));
    expect([...kinds].sort()).toEqual(['barrier', 'car', 'debris', 'deck', 'pier', 'pipe', 'rail']);
  });

  it('only draws ground footprints in 2D, never piers or pipes', () => {
    const kinds = new Set(scene.flat.features.map((f) => f.properties!.kind));
    expect(kinds.has('pier')).toBe(false);
    expect(kinds.has('pipe')).toBe(false);
  });

  it('names all four places and lights the Johor side', () => {
    expect(scene.labels.map((l) => l.id).sort()).toEqual(['causeway', 'johor', 'rts', 'secondLink']);
    for (const l of scene.lights) expect(l.lat).toBeGreaterThan(1.34);
    expect(scene.lights).toHaveLength(3);
  });
});

describe('geometry helpers', () => {
  const line: [number, number][] = [
    [103.7, 1.4],
    [103.7, 1.401],
    [103.701, 1.401],
  ];

  it('measures and walks a line', () => {
    expect(lengthM(line)).toBeCloseTo(111.32 + 111.27, 0);
    const half = along(line, 50).at;
    expect(ll(half)[0]).toBeCloseTo(103.7, 6);
    expect(lengthM(slice(line, 20, 150))).toBeCloseTo(130, 0);
  });

  it('tears a ragged slab end', () => {
    const clean = deckSlab(line, 0, 100, 10);
    const torn = deckSlab(line, 0, 100, 10, { end: true });
    expect(torn.length).toBeGreaterThan(clean.length);
    expect(torn[0]).toEqual(torn[torn.length - 1]);
  });

  it('lifts the Second Link to its navigation span mid-strait', () => {
    expect(secondLinkBase(0)).toBeCloseTo(4);
    expect(secondLinkBase(1)).toBeCloseTo(4);
    expect(secondLinkBase(0.5)).toBeCloseTo(25);
  });
});
