import { beforeAll, describe, expect, it } from 'vitest';
import { ensureLocale } from '../i18n/t';
import {
  TRAITS,
  canPickTrait,
  getTrait,
  isLegalTraitBuild,
  pickBlockReason,
  traitBudgetRemaining,
} from './character';

describe('uncapped trait builds', () => {
  beforeAll(async () => {
    await ensureLocale('zh-Hans');
  });

  it('allows two high-refund flaws and spends their combined points', () => {
    const flaws = ['hypervigilant', 'warrant'];
    expect(canPickTrait(flaws[1], [flaws[0]])).toBe(true);
    expect(canPickTrait(flaws[0], [flaws[1]])).toBe(true);
    expect(traitBudgetRemaining(flaws)).toBe(10);
    const build = [...flaws, 'combat_veteran', 'medic', 'pack_rat', 'strong_back'];
    expect(traitBudgetRemaining(build)).toBe(0);
    expect(isLegalTraitBuild(build)).toBe(true);
  });

  it.each([
    ['hypervigilant', 'warrant'],
    ['hypervigilant', 'picky_eater'],
    ['picky_eater', 'dehydrated'],
  ])('allows another flaw after %s + %s regardless of point values', (first, second) => {
    const flaws = [first, second];
    expect(canPickTrait(second, [first])).toBe(true);
    expect(isLegalTraitBuild(flaws)).toBe(true);
    expect(canPickTrait('hoarder', flaws)).toBe(true);
    expect(pickBlockReason('hoarder', flaws)).toBeNull();
    expect(isLegalTraitBuild([...flaws, 'hoarder'])).toBe(true);
  });

  it('accepts a six-flaw build and multiple expensive positives', () => {
    const build: string[] = [];
    const traits = [
      'hypervigilant', 'warrant', 'picky_eater', 'dehydrated', 'hoarder', 'glass_jaw',
      'combat_veteran', 'trauma_medic', 'operator', 'strong_back',
    ];
    for (const id of traits) {
      expect(canPickTrait(id, build), id).toBe(true);
      build.push(id);
      expect(isLegalTraitBuild(build), id).toBe(true);
    }
    expect(traitBudgetRemaining(build)).toBe(0);
    expect(canPickTrait('calm_hands', build)).toBe(false);
    expect(pickBlockReason('calm_hands', build)).toBe('not enough points');
    expect(pickBlockReason('calm_hands', build, 'zh-Hans')).toBe('点数不足');
    expect(isLegalTraitBuild(build.filter((id) => id !== 'hoarder'))).toBe(false);
  });

  it('keeps conflicts in both pick directions', () => {
    expect(canPickTrait('night_owl', ['hypervigilant'])).toBe(false);
    expect(canPickTrait('hypervigilant', ['night_owl'])).toBe(false);
    expect(isLegalTraitBuild(['hypervigilant', 'night_owl'])).toBe(false);
  });

  it('allows two expensive positives when flaws fund both', () => {
    const build = ['hypervigilant', 'warrant', 'combat_veteran'];
    expect(traitBudgetRemaining(build)).toBe(5);
    expect(canPickTrait('trauma_medic', build)).toBe(true);
    expect(isLegalTraitBuild([...build, 'trauma_medic'])).toBe(true);
  });

  it('still rejects overspending and duplicate traits', () => {
    expect(canPickTrait('combat_veteran', ['picky_eater'])).toBe(false);
    expect(isLegalTraitBuild(['picky_eater', 'combat_veteran'])).toBe(false);
    expect(canPickTrait('warrant', ['warrant'])).toBe(false);
    expect(isLegalTraitBuild(['warrant', 'warrant'])).toBe(false);
  });
});

describe('gear trait costs', () => {
  it('go_bag and prepper cost 1', () => {
    expect(getTrait('go_bag').cost).toBe(1);
    expect(getTrait('prepper').cost).toBe(1);
  });

  it('old presets with go_bag and prepper stay legal', () => {
    // The old costs (2 + 3) needed 5 points of flaws; that build must still load.
    const flaws: string[] = [];
    let sum = 0;
    for (const t of TRAITS) {
      if (t.category !== 'negative' || sum <= -5) continue;
      if (!isLegalTraitBuild([...flaws, t.id])) continue;
      flaws.push(t.id);
      sum += t.cost;
    }
    expect(sum).toBeLessThanOrEqual(-5);
    expect(isLegalTraitBuild(['go_bag', 'prepper', ...flaws])).toBe(true);
  });
});
