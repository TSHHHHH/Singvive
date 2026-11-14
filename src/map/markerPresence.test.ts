import { describe, expect, it } from 'vitest';
import { reconcileMarkers } from './markerPresence';

describe('marker fade presence', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };

  it('retains a departing marker only until its fade finishes', () => {
    const shown = reconcileMarkers([], [a], 0, 600, 450);
    const leaving = reconcileMarkers(shown, [], 100, 600, 450);
    expect(leaving).toEqual([{ item: a, removeAt: 700 }]);
    // Unrelated updates must not restart the exit clock.
    expect(reconcileMarkers(leaving, [], 400, 600, 450)).toEqual(leaving);
    expect(reconcileMarkers(leaving, [], 700, 600, 450)).toEqual([]);
  });

  it('cancels removal if range recovers during the fade', () => {
    const leaving = reconcileMarkers(reconcileMarkers([], [a], 0, 600, 450), [], 100, 600, 450);
    const returned = reconcileMarkers(leaving, [a], 300, 600, 450);
    expect(returned).toEqual([{ item: a, removeAt: null }]);
    expect(reconcileMarkers(returned, [a], 800, 600, 450)).toEqual(returned);
  });

  it('prioritizes current markers over exits to enforce the viewport cap', () => {
    const shown = reconcileMarkers([], [a], 0, 600, 1);
    expect(reconcileMarkers(shown, [b], 100, 600, 1)).toEqual([{ item: b, removeAt: null }]);
  });

  it('removes departing markers immediately for reduced motion', () => {
    const shown = reconcileMarkers([], [a], 0, 600, 450);
    expect(reconcileMarkers(shown, [], 100, 0, 450)).toEqual([]);
  });
});
