import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeSource, activeGovernmentRecord, sourceProperties, sameVenue, simplifyFootprint, verifiedFootprint, zoneContains } from './location-expansion.mjs';

test('excludes construction and restricted records', () => {
  for (const tags of [{ construction: 'apartments' }, { building: 'construction' }, { demolished: 'yes' }, { access: 'military' }]) assert.equal(activeSource(tags), false);
  assert.equal(activeSource({ building: 'house' }), true);
});
test('reads official HTML attributes rather than kml identifiers', () => {
  assert.equal(sourceProperties({ Name: 'kml_1', Description: '<th>NAME</th><td>Arts &amp; Community Club</td>' }).NAME, 'Arts & Community Club');
});
test('rejects government construction records in both status columns and embedded names', () => {
  assert.equal(activeGovernmentRecord({ NAME: 'Tengah CC (U/C)' }), false);
  assert.equal(activeGovernmentRecord({ NAME: 'New Centre', STATUS: 'Under Construction' }), false);
  assert.equal(activeGovernmentRecord({ NAME: 'Market', STATUS: 'Existing (new)' }), true);
});
test('deduplicates official venue aliases without merging different categories', () => {
  const a = { name: 'Bedok Community Club', category: 'community', lat: 1.3, lng: 103.9 };
  assert.equal(sameVenue(a, { ...a, name: 'Bedok CC', lat: 1.301 }, true), true);
  assert.equal(sameVenue(a, { ...a, name: 'Bedok CC', lat: 1.31 }, true), false);
  assert.equal(sameVenue(a, { ...a, category: 'housing' }, true), false);
});
test('official longitude/latitude footprints become valid game latitude/longitude rings', () => {
  const ring = simplifyFootprint([[103.8,1.3],[103.801,1.3],[103.801,1.301],[103.8,1.301],[103.8,1.3]]);
  assert.equal(ring.length, 5);
  assert.equal(zoneContains([ring])(1.3005,103.8005), true);
  assert.equal(zoneContains([ring])(1.302,103.8005), false);
});
test('retains exact government geometry when rounding would exclude a verified pin', () => {
  const ring = [[103.809999,1.3],[103.810001,1.3],[103.810001,1.301],[103.809999,1.301],[103.809999,1.3]];
  assert.equal(zoneContains([verifiedFootprint(ring,1.3005,103.81)])(1.3005,103.81),true);
});
