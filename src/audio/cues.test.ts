import { describe, expect, it } from 'vitest';
import { CUE_CATEGORIES, CUES, cueIdFromFile, isCueId } from './cues';

describe('cue catalog', () => {
  it('has unique ids that are safe as file names', () => {
    const ids = CUES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);
  });

  it('puts every cue in a listed category, and every category has cues', () => {
    const cats = new Set(CUE_CATEGORIES.map((c) => c.id));
    for (const c of CUES) expect(cats.has(c.category), c.id).toBe(true);
    for (const c of CUE_CATEGORIES) expect(CUES.some((x) => x.category === c.id), c.id).toBe(true);
  });

  it('never starts an id with ui. (the i18n key scanner reads those as message keys)', () => {
    expect(CUES.filter((c) => c.id.startsWith('ui.'))).toEqual([]);
  });

  it('maps dropped-in file names back to cue ids', () => {
    expect(cueIdFromFile('hud.click.ogg')).toBe('hud.click');
    expect(cueIdFromFile('combat.hurt.crit.MP3')).toBe('combat.hurt.crit');
    expect(cueIdFromFile('manifest.json')).toBeNull();
    expect(cueIdFromFile('README.md')).toBeNull();
    expect(isCueId('combat.hit')).toBe(true);
    expect(isCueId('combat.nope')).toBe(false);
  });
});
