import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import {
  PRACTICE_DAILY_CAP,
  SKILL_BLURBS,
  SKILL_IDS,
  SKILL_LABELS,
  SKILL_MAX_LEVEL,
  skillMods,
  xpToNext,
} from '../game/skills';
import { tip } from './tips';
import { useT } from '../i18n';

/**
 * Dedicated Skills tab — levels, XP bars, and a short blurb per skill.
 * Practice XP soft-caps daily; books ignore the cap.
 */
export function SkillsPanel() {
  const { t } = useT();
  const { skills, skillDayXp, day } = useGame(
    useShallow((s) => ({
      skills: s.skills,
      skillDayXp: s.skillDayXp,
      day: s.day,
    })),
  );
  const mods = skillMods(skills);
  const dayGained = skillDayXp.day === day ? skillDayXp.gained : {};

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
        <h4 className="mb-1 text-plate uppercase text-white/30">
          {t('ui.skills.title')}
        </h4>
        <p className="text-body text-white/50">{t('ui.skills.blurb')}</p>
      </section>

      <div className="flex flex-col gap-2">
        {SKILL_IDS.map((id) => {
          const prog = skills[id];
          const need = xpToNext(prog.level);
          const pct =
            need == null || need <= 0 ? 100 : Math.min(100, (prog.xp / need) * 100);
          const practiced = dayGained[id] ?? 0;
          const capLeft = Math.max(0, PRACTICE_DAILY_CAP - practiced);
          return (
            <div
              key={id}
              className="rounded-lg border border-white/10 bg-concrete-900/60 px-3 py-2"
              {...tip(SKILL_BLURBS[id])}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-read font-semibold text-concrete-50">
                  {SKILL_LABELS[id]}
                </span>
                <span className="text-body tabular-nums text-signal">
                  {t('ui.skills.level', { level: prog.level })}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-signal/80"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-micro text-white/40">
                <span>
                  {prog.level >= SKILL_MAX_LEVEL
                    ? t('ui.skills.maxed')
                    : t('ui.skills.xp', { xp: prog.xp, need: need ?? 0 })}
                </span>
                <span>{t('ui.skills.practiceLeft', { left: capLeft })}</span>
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-lg border border-white/10 bg-black/20 p-3">
        <h4 className="mb-2 text-plate uppercase text-white/30">
          {t('ui.skills.fromSkills')}
        </h4>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-body text-white/60">
          {mods.attackMod !== 0 && (
            <>
              <dt>{t('ui.skills.mod.attack')}</dt>
              <dd className="text-right tabular-nums text-concrete-50">
                {fmt(mods.attackMod)}
              </dd>
            </>
          )}
          {mods.defenseMod !== 0 && (
            <>
              <dt>{t('ui.skills.mod.defense')}</dt>
              <dd className="text-right tabular-nums text-concrete-50">
                {fmt(mods.defenseMod)}
              </dd>
            </>
          )}
          {mods.travelSpeedMod !== 0 && (
            <>
              <dt>{t('ui.skills.mod.travel')}</dt>
              <dd className="text-right tabular-nums text-concrete-50">
                {fmtPct(mods.travelSpeedMod)}
              </dd>
            </>
          )}
          {mods.lootMod !== 0 && (
            <>
              <dt>{t('ui.skills.mod.loot')}</dt>
              <dd className="text-right tabular-nums text-concrete-50">
                {fmt(mods.lootMod)}
              </dd>
            </>
          )}
          {mods.healBonus !== 0 && (
            <>
              <dt>{t('ui.skills.mod.heal')}</dt>
              <dd className="text-right tabular-nums text-concrete-50">
                {fmt(mods.healBonus)}
              </dd>
            </>
          )}
          {mods.craftCostMod !== 0 && (
            <>
              <dt>{t('ui.skills.mod.craft')}</dt>
              <dd className="text-right tabular-nums text-concrete-50">
                {fmt(mods.craftCostMod)}
              </dd>
            </>
          )}
          {mods.encounterChanceMod !== 0 && (
            <>
              <dt>{t('ui.skills.mod.encounter')}</dt>
              <dd className="text-right tabular-nums text-concrete-50">
                {fmtPct(mods.encounterChanceMod)}
              </dd>
            </>
          )}
        </dl>
      </section>
    </div>
  );
}

function fmt(n: number): string {
  return (n >= 0 ? '+' : '') + n;
}

function fmtPct(n: number): string {
  return (n >= 0 ? '+' : '') + Math.round(n * 100) + '%';
}
