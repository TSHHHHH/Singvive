import { describe, expect, it } from 'vitest';
import { labelRect, placeLabels, placementClashes, type PlacementInput } from './tunnelLabels';

const trunk = [
  { x: 0, y: 200 },
  { x: 600, y: 200 },
];

describe('placeLabels', () => {
  it('keeps the preferred side when nothing is in the way', () => {
    const input: PlacementInput = {
      labels: [{ id: 'a', at: { x: 200, y: 200 }, w: 60, h: 40, priority: 0, prefer: ['below', 'above'] }],
      boxes: [],
      stops: [{ x: 200, y: 200 }],
      tracks: [trunk],
    };
    expect(placeLabels(input).sides.a).toBe('below');
  });

  it('moves a label off a branch that peels away under it', () => {
    // A service line leaving the stop at 45° straight through the "below" slot.
    const branch = [
      { x: 200, y: 200 },
      { x: 220, y: 200 },
      { x: 312, y: 292 },
    ];
    const input: PlacementInput = {
      labels: [{ id: 'a', at: { x: 200, y: 200 }, w: 110, h: 40, priority: 0, prefer: ['below', 'above'] }],
      boxes: [],
      stops: [{ x: 200, y: 200 }],
      tracks: [trunk, branch],
    };
    const out = placeLabels(input);
    expect(out.sides.a).not.toBe('below');
    expect(placementClashes(input, out).track).toBe(0);
  });

  it('never stacks two wide labels on neighbouring stops', () => {
    const input: PlacementInput = {
      labels: [
        { id: 'a', at: { x: 200, y: 200 }, w: 130, h: 40, priority: 0, prefer: ['below', 'above'] },
        { id: 'b', at: { x: 300, y: 200 }, w: 130, h: 40, priority: 1, prefer: ['below', 'above'] },
      ],
      boxes: [],
      stops: [
        { x: 200, y: 200 },
        { x: 300, y: 200 },
      ],
      tracks: [trunk],
    };
    const out = placeLabels(input);
    expect(out.sides.a).toBe('below');
    expect(placementClashes(input, out).labels).toBe(0);
  });

  it('lets the stop you stand on choose first', () => {
    const input: PlacementInput = {
      labels: [
        { id: 'far', at: { x: 300, y: 200 }, w: 130, h: 40, priority: 3000, prefer: ['below', 'above'] },
        { id: 'here', at: { x: 200, y: 200 }, w: 130, h: 40, priority: 0, prefer: ['below', 'above'] },
      ],
      boxes: [],
      stops: [
        { x: 200, y: 200 },
        { x: 300, y: 200 },
      ],
      tracks: [trunk],
    };
    expect(placeLabels(input).sides.here).toBe('below');
  });

  it('hangs a roundel on the free side of its platform box', () => {
    const input: PlacementInput = {
      labels: [],
      // The trip leaves the box up and to the right; above is crossed, left is not.
      boxes: [{ id: 'p', at: { x: 120, y: 200 }, w: 160, h: 50, roundel: ['above', 'left'] }],
      stops: [],
      tracks: [
        [
          { x: 120, y: 200 },
          { x: 120, y: 60 },
        ],
      ],
    };
    const pt = placeLabels(input).roundels.p;
    expect(pt.x).toBeLessThan(120 - 80);
  });

  it('keeps labels off platform boxes', () => {
    const input: PlacementInput = {
      labels: [{ id: 'a', at: { x: 200, y: 200 }, w: 100, h: 40, priority: 0, prefer: ['below', 'above'] }],
      boxes: [{ id: 'p', at: { x: 160, y: 255 }, w: 160, h: 50, roundel: [] }],
      stops: [{ x: 200, y: 200 }],
      tracks: [trunk],
    };
    const out = placeLabels(input);
    const r = out.rects.a;
    expect(r.y + r.h <= 230 || r.y >= 280 || r.x >= 240).toBe(true);
    expect(out.rects.a).toEqual(labelRect({ x: 200, y: 200 }, 100, 40, out.sides.a));
  });
});
