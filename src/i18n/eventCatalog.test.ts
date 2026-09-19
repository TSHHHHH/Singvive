import { describe, expect, it } from 'vitest';
import { ensureLocale, t, tList } from './t';

describe('zh-Hans event catalog', () => {
  it('covers every English event leaf', async () => {
    await ensureLocale('zh-Hans');
    const kinds = [
      'locked_door',
      'desperate_survivor',
      'flooded_entry',
      'mrt_toll',
      'field_doctor',
      'faction_checkpoint',
    ] as const;
    for (const kind of kinds) {
      const enTitle = t(`event.${kind}.title`, undefined, 'en');
      const zhTitle = t(`event.${kind}.title`, undefined, 'zh-Hans');
      expect(enTitle).not.toBe(`event.${kind}.title`);
      expect(zhTitle).not.toBe(`event.${kind}.title`);
      expect(zhTitle).not.toBe(enTitle);
    }
    const enTell = tList('event.locked_door.tell', 'en');
    const zhTell = tList('event.locked_door.tell', 'zh-Hans');
    expect(zhTell.length).toBe(enTell.length);
    expect(zhTell[0]).not.toBe(enTell[0]);
  });
});
