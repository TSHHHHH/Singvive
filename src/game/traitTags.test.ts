import { describe, expect, it } from 'vitest';
import { TRAITS } from './character';
import { TRAIT_TAGS, traitTags } from './traitTags';

describe('trait tags', () => {
  it('tags every trait at least once', () => {
    const untagged = TRAITS.filter((t) => traitTags(t.id).length === 0).map((t) => t.id);
    expect(untagged).toEqual([]);
  });

  it('has no tags for traits that no longer exist', () => {
    const ids = new Set(TRAITS.map((t) => t.id));
    expect(Object.keys(TRAIT_TAGS).filter((id) => !ids.has(id))).toEqual([]);
  });
});
