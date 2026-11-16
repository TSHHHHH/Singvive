import { describe, expect, it } from 'vitest';
import { SETTING_DEF, defaultFor, migrateStored } from './settings';

describe('settings defaults', () => {
  it('reduce motion defaults to off', () => {
    expect(SETTING_DEF.get('reduceMotion')!.default).toBe('off');
  });

  it('weather effects are full on desktop and off on touch devices', () => {
    const def = SETTING_DEF.get('weatherFx')!;
    const g = globalThis as { window?: unknown };
    const prev = g.window;
    try {
      g.window = { matchMedia: () => ({ matches: false }) };
      expect(defaultFor(def)).toBe('full');
      g.window = { matchMedia: () => ({ matches: true }) };
      expect(defaultFor(def)).toBe('off');
      delete g.window;
      expect(defaultFor(def)).toBe('off');
    } finally {
      g.window = prev;
    }
  });
});

describe('migrateStored', () => {
  it('moves a stored reduceMotion auto to off once', () => {
    expect(migrateStored({ reduceMotion: 'auto' }, 0).reduceMotion).toBe('off');
    expect(migrateStored({ reduceMotion: 'auto' }, 1).reduceMotion).toBe('auto');
  });

  it('keeps explicit choices', () => {
    expect(migrateStored({ reduceMotion: 'on', weatherFx: 'off' }, 0)).toEqual({
      reduceMotion: 'on',
      weatherFx: 'off',
    });
  });
});
