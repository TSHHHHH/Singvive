import { describe, expect, it } from 'vitest';
import { dockWidth } from './dockWidth';

describe('desktop dock sizing', () => {
  it('defaults to a readable width while preserving the smaller desktop map', () => {
    expect(dockWidth(1920, '').width).toBe(384);
    expect(dockWidth(1280, '').width).toBe(360);
  });

  it('honours a saved player width within the available space', () => {
    expect(dockWidth(1920, '480').width).toBe(480);
    expect(dockWidth(1920, '200').width).toBe(320);
    expect(dockWidth(1920, '900').width).toBe(560);
  });

  it('temporarily clamps a wide preference on a smaller screen', () => {
    expect(dockWidth(1024, '520').width).toBe(409);
    expect(dockWidth(1920, '520').width).toBe(520);
  });

  it('recovers from invalid or non-finite stored preferences', () => {
    for (const saved of ['bad', 'Infinity', 'NaN', '0', '-1']) {
      expect(dockWidth(1920, saved).width).toBe(384);
    }
  });
});
