import { afterEach, describe, expect, it } from 'vitest';
import { placeKeyFor, showMap, showPlace, togglePlaceView, usePlaceView } from './placeView';

const site = { id: 'osm:1', factionId: 'syndicate_88' as const, discovered: true };

afterEach(() => showPlace());

describe('placeKeyFor', () => {
  it('a block owns the screen, even standing on a faction site', () => {
    expect(placeKeyFor({ hdb: { locationId: 'b1' }, travelAnim: null, here: site })).toBe('block:b1');
  });

  it('a discovered faction site does; open ground and plain sites do not', () => {
    expect(placeKeyFor({ hdb: null, travelAnim: null, here: site })).toBe('site:osm:1');
    expect(placeKeyFor({ hdb: null, travelAnim: null, here: null })).toBeNull();
    expect(
      placeKeyFor({ hdb: null, travelAnim: null, here: { ...site, factionId: null } }),
    ).toBeNull();
    expect(
      placeKeyFor({ hdb: null, travelAnim: null, here: { ...site, discovered: false } }),
    ).toBeNull();
  });

  it('nobody owns the screen mid-glide', () => {
    expect(placeKeyFor({ hdb: null, travelAnim: { path: [] }, here: site })).toBeNull();
  });
});

describe('map toggle', () => {
  it('remembers the map choice only for the place it was made in', () => {
    showMap('site:a');
    expect(usePlaceView.getState().mapAt).toBe('site:a');
    togglePlaceView('site:a');
    expect(usePlaceView.getState().mapAt).toBeNull();
    togglePlaceView('site:a');
    expect(usePlaceView.getState().mapAt).toBe('site:a');
    // A different place starts in its own view.
    togglePlaceView('block:b');
    expect(usePlaceView.getState().mapAt).toBe('block:b');
  });

  it('does nothing on the open map', () => {
    showMap(null);
    togglePlaceView(null);
    expect(usePlaceView.getState().mapAt).toBeNull();
  });
});
