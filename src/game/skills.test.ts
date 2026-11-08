import { describe, expect, it } from 'vitest';
import {
  applySkillBook,
  emptySkillDayXp,
  emptySkills,
  gainSkillXp,
  PRACTICE_DAILY_CAP,
  previewStartingSkills,
  skillMods,
  skillsFromTraits,
  SKILL_MAX_LEVEL,
  xpToNext,
} from './skills';

describe('skills', () => {
  it('empty skills contribute no mods', () => {
    const m = skillMods(emptySkills());
    expect(m.attackMod).toBe(0);
    expect(m.lootMod).toBe(0);
    expect(m.craftCostMod).toBe(0);
  });

  it('fighting levels stack attack packages', () => {
    const s = emptySkills();
    s.fighting = { level: 2, xp: 0 };
    const m = skillMods(s);
    expect(m.attackMod).toBe(2);
    expect(m.defenseMod).toBe(1);
  });

  it('xp curve levels up and clears overflow into next bar', () => {
    const s = emptySkills();
    const need = xpToNext(0)!;
    const r = gainSkillXp(s, emptySkillDayXp(1), 1, 'fighting', need + 5);
    expect(r.leveled).toBe(true);
    expect(r.skills.fighting.level).toBe(1);
    expect(r.skills.fighting.xp).toBe(5);
    expect(r.applied).toBe(need + 5);
  });

  it('practice XP respects daily soft cap', () => {
    let skills = emptySkills();
    let dayXp = emptySkillDayXp(1);
    const first = gainSkillXp(skills, dayXp, 1, 'scavenging', PRACTICE_DAILY_CAP);
    skills = first.skills;
    dayXp = first.dayXp;
    expect(first.applied).toBe(PRACTICE_DAILY_CAP);
    const second = gainSkillXp(skills, dayXp, 1, 'scavenging', 10);
    expect(second.applied).toBe(0);
    expect(second.capped).toBe(true);
  });

  it('books ignore daily cap and grant a gated level under tier', () => {
    const s = emptySkills();
    s.fighting = { level: 0, xp: 5 };
    const r = applySkillBook(s, 'fighting', 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gainedLevel).toBe(true);
    expect(r.skills.fighting.level).toBe(1);
    expect(r.skills.fighting.xp).toBe(0);
    expect(r.hours).toBe(2);
  });

  it('rejects books that are too advanced', () => {
    const s = emptySkills();
    const r = applySkillBook(s, 'medicine', 3);
    expect(r).toEqual({ ok: false, reason: 'too_advanced' });
  });

  it('combat veteran seeds fighting at +2', () => {
    const skills = skillsFromTraits(['combat_veteran']);
    expect(skills.fighting.level).toBe(2);
  });

  it('previewStartingSkills matches skillsFromTraits', () => {
    const ids = ['ns_combat', 'clumsy'];
    expect(previewStartingSkills(ids)).toEqual(skillsFromTraits(ids));
  });

  it('cannot exceed max level via practice', () => {
    const s = emptySkills();
    s.trades = { level: SKILL_MAX_LEVEL, xp: 0 };
    const r = gainSkillXp(s, emptySkillDayXp(1), 1, 'trades', 999, {
      ignoreDailyCap: true,
    });
    expect(r.skills.trades.level).toBe(SKILL_MAX_LEVEL);
    expect(r.applied).toBe(0);
  });
});
