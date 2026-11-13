import { describe, expect, it } from 'vitest';
import { CALLOUT_APART, CALLOUT_GAP, placeCallouts, type CalloutFrame, type CalloutPoint } from './callouts';

const frame: CalloutFrame = { w: 1200, h: 800, top: 16, right: 16, bottom: 32, left: 16 };
const card = (x: number, y: number, over: Partial<CalloutPoint> = {}): CalloutPoint => ({
  x,
  y,
  lift: 0,
  gap: 16,
  w: 352,
  h: 240,
  ...over,
});

describe('placeCallouts', () => {
  it('centres a lone card above its marker, tail on the marker', () => {
    const { here, target } = placeCallouts(card(600, 500), null, frame);
    expect(target).toBeNull();
    expect(here).toMatchObject({ side: 'centre', below: false, adrift: false, left: 600 - 176, tail: 176 });
    expect(here!.top + 240).toBe(500 - 16 - CALLOUT_GAP);
  });

  it('clears the roof or beacon the badge rides', () => {
    const flat = placeCallouts(card(600, 500), null, frame).here!;
    const tall = placeCallouts(card(600, 500, { lift: 90 }), null, frame).here!;
    expect(flat.top - tall.top).toBe(90);
  });

  it('slides along the marker at a map edge instead of leaving the map', () => {
    const b = placeCallouts(card(40, 500), null, frame).here!;
    expect(b.left).toBe(frame.left);
    expect(b.tail).toBe(24);
    expect(b.adrift).toBe(false);
    const r = placeCallouts(card(1190, 500), null, frame).here!;
    expect(r.left).toBe(1200 - 16 - 352);
  });

  it('hangs below the marker when there is no room above', () => {
    const b = placeCallouts(card(600, 120), null, frame).here!;
    expect(b.below).toBe(true);
    expect(b.top).toBe(120 + CALLOUT_GAP);
  });

  it('drops the tail once the marker is off screen', () => {
    expect(placeCallouts(card(-400, 500), null, frame).here!.adrift).toBe(true);
    expect(placeCallouts(card(600, -300), null, frame).here!.adrift).toBe(true);
  });

  it('leans two cards away from each other', () => {
    const { here, target } = placeCallouts(card(500, 500), card(800, 520), frame);
    expect(here!.side).toBe('left');
    expect(target!.side).toBe('right');
    expect(here!.left + 352).toBeLessThanOrEqual(target!.left);
    const swapped = placeCallouts(card(800, 500), card(500, 520), frame);
    expect(swapped.here!.side).toBe('right');
    expect(swapped.target!.side).toBe('left');
  });

  it('pushes apart cards whose markers are nearly on top of each other', () => {
    const { here, target } = placeCallouts(card(600, 500), card(610, 505), frame);
    expect(target!.left - (here!.left + 352)).toBeGreaterThanOrEqual(CALLOUT_APART - 1);
  });

  it('lets one card take the whole push when the other is against an edge', () => {
    const { here, target } = placeCallouts(card(60, 500), card(30, 505), frame);
    expect(target!.left).toBe(frame.left);
    expect(here!.left - (target!.left + 352)).toBeGreaterThanOrEqual(CALLOUT_APART - 1);
  });

  it('leaves cards alone when they are at different heights', () => {
    const { here, target } = placeCallouts(card(600, 760), card(610, 300), frame);
    expect(here!.left).toBe(600 - 352 + 28);
    expect(target!.left).toBe(610 - 28);
  });
});
