import { describe, expect, it } from 'vitest';
import { blockFraming } from './blockFraming';

const site = {
  lat: 1.3, lng: 103.8,
  // Deliberately put the POI away from the centre of the footprint.
  outline: [[1.3, 103.8], [1.3002, 103.8], [1.3002, 103.801], [1.3, 103.801]] as const,
};

describe('building camera framing', () => {
  it('orbits the footprint centre at half the roof height', () => {
    const camera = blockFraming(site, 80, 700, 900, 0, 60);
    expect(camera.center[0]).toBeCloseTo(103.8005);
    expect(camera.center[1]).toBeCloseTo(1.3001);
    expect(camera.elevation).toBe(40);
  });

  it('backs away from wide blocks when the timeline leaves a narrow viewport', () => {
    const wide = blockFraming(site, 80, 900, 900, 0, 60);
    const narrow = blockFraming(site, 80, 240, 900, 0, 60);
    expect(narrow.zoom).toBeLessThan(wide.zoom - 1);
  });

  it('backs away from tall towers and short windows', () => {
    const normal = blockFraming(site, 80, 700, 900, 0, 60);
    expect(blockFraming(site, 160, 700, 900, 0, 60).zoom).toBeLessThan(normal.zoom);
    expect(blockFraming(site, 80, 700, 300, 0, 60).zoom).toBeLessThan(normal.zoom);
  });

  it('keeps a finite visible view when footprint or measurements are missing', () => {
    const camera = blockFraming({ lat: 1.3, lng: 103.8 }, 0, 0, 0, 90, 25);
    expect(camera.center).toEqual([103.8, 1.3]);
    expect(camera.elevation).toBeGreaterThan(0);
    expect(camera.zoom).toBeGreaterThanOrEqual(15);
    expect(camera.zoom).toBeLessThanOrEqual(19);
  });
});
