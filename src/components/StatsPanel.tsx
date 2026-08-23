import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { STAT_GROUPS } from '../game/stats';
import { getTraits } from '../game/character';
import { getOccupation } from '../game/occupations';
import { SurvivorStatsGrid } from './SurvivorStatsGrid';
import { useIsPhoneLayout } from './HdbZoomViewport';
import { traitHoverText, traitName, useT } from '../i18n';
import { tip } from './tips';

function sameTraits(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * Who they are (traits) above what they've done (counters that only ever go
 * up). Attributes live on the Condition rail — no need to repeat them here.
 * Desktop also hosts live combat/mobility stats (phone keeps those on Condition).
 */
export function StatsPanel() {
  const { locale, t } = useT();
  const isPhone = useIsPhoneLayout();
  const { character, stats, day } = useGame(
    useShallow((s) => ({ character: s.character, stats: s.stats, day: s.day })),
  );
  const traits = character ? getTraits(character.traitIds) : [];
  const occupation = character?.occupationId
    ? getOccupation(character.occupationId)
    : null;
  const occupationMatches =
    occupation != null && sameTraits(character!.traitIds, occupation.traitIds);

  return (
    <div className="flex flex-col gap-3">
      {character && (
        <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
          <h4 className="mb-2 text-xs uppercase tracking-widest text-white/30">
            {t('ui.stats.survivor')}
          </h4>
          <div className="flex items-baseline justify-between">
            <span className="truncate text-sm font-bold text-signal">{character.name}</span>
            <span className="shrink-0 text-xs text-white/40">{t('ui.stats.day', { day })}</span>
          </div>
          {occupationMatches && occupation && (
            <div className="mt-0.5 text-2xs uppercase tracking-wide text-white/40">
              {occupation.name}
            </div>
          )}
          {traits.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {(['positive', 'negative'] as const).map((cat) => {
                const list = traits.filter((tr) => tr.category === cat);
                if (list.length === 0) return null;
                return (
                  <div key={cat} className="flex flex-wrap gap-1">
                    {list.map((tr) => (
                      <span
                        key={tr.id}
                        {...tip(traitHoverText(tr.id, locale))}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                          cat === 'positive' ? 'bg-signal/15 text-signal' : 'bg-hiss/15 text-hiss'
                        }`}
                      >
                        <Icon name={tr.icon} size={12} />
                        {traitName(tr.id, locale)}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!isPhone && (
        <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
          <SurvivorStatsGrid />
        </section>
      )}

      {STAT_GROUPS.map((group) => (
        <section
          key={group.titleKey}
          className="rounded-lg border border-white/15 bg-concrete-900/80 p-3"
        >
          <h4 className="mb-2 text-xs uppercase tracking-widest text-white/30">
            {t(group.titleKey)}
          </h4>
          <dl className="flex flex-col gap-1">
            {group.rows.map((row) => {
              const raw = stats[row.key];
              return (
                <div key={row.key} className="flex items-center gap-2 text-xs">
                  <span className="w-5 shrink-0 text-center text-white/40">
                    <Icon name={row.icon} />
                  </span>
                  <dt className="min-w-0 flex-1 truncate text-white/50">{t(row.labelKey)}</dt>
                  <dd className="shrink-0 tabular-nums text-concrete-50">
                    {row.format ? row.format(raw) : Math.round(raw)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
