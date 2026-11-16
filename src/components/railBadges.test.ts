import { describe, expect, it } from 'vitest';
import { absorbSeen, hasUnseen } from './railBadges';

describe('rail badges', () => {
  it('treats ids present on mount as seen', () => {
    const seen = absorbSeen({}, { craft: ['a', 'b'] }, {});
    expect(hasUnseen(['a', 'b'], seen.craft)).toBe(false);
  });

  it('lights on a new id while the panel is closed', () => {
    const seen = absorbSeen({}, { craft: ['a'] }, {});
    const after = absorbSeen(seen, { craft: ['a', 'b'] }, { craft: false });
    expect(after).toBe(seen);
    expect(hasUnseen(['a', 'b'], after.craft)).toBe(true);
  });

  it('stays dark when an id only disappears', () => {
    const seen = absorbSeen({}, { craft: ['a', 'b'] }, {});
    expect(hasUnseen(['a'], absorbSeen(seen, { craft: ['a'] }, {}).craft)).toBe(false);
  });

  it('clears once the panel is open, and does not relight when the id comes back', () => {
    let seen = absorbSeen({}, { craft: ['a'] }, {});
    seen = absorbSeen(seen, { craft: ['a', 'b'] }, { craft: true });
    expect(hasUnseen(['a', 'b'], seen.craft)).toBe(false);
    seen = absorbSeen(seen, { craft: ['a'] }, {});
    expect(hasUnseen(['a', 'b'], absorbSeen(seen, { craft: ['a', 'b'] }, {}).craft)).toBe(false);
  });

  it('returns the same object when nothing changes', () => {
    const seen = absorbSeen({}, { craft: ['a'], skills: ['x:1'] }, {});
    expect(absorbSeen(seen, { craft: ['a'], skills: ['x:1'] }, { craft: true })).toBe(seen);
  });
});
