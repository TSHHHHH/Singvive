import { describe, expect, it } from 'vitest';
import { landmarkBaseHeight } from './landmarkGeometry';

describe('OSM landmark height correction', () => {
  const skyPark = 35184488889830;
  it('keeps the SkyPark above its towers when CARTO omits the base', () => {
    expect(landmarkBaseHeight('protomaps', skyPark, { height: 207 })).toBe(193);
  });
  it('leaves other buildings, sources and repaired upstream data alone', () => {
    expect(landmarkBaseHeight('protomaps', skyPark + 1, { height: 207 })).toBeUndefined();
    expect(landmarkBaseHeight('openmaptiles', skyPark, { height: 207 })).toBeUndefined();
    expect(landmarkBaseHeight('protomaps', skyPark, { height: 207, min_height: 194 })).toBeUndefined();
    expect(landmarkBaseHeight('protomaps', skyPark, { height: 207, render_min_height: 193 })).toBeUndefined();
    expect(landmarkBaseHeight('protomaps', skyPark, { height: 8 })).toBeUndefined();
  });
});
