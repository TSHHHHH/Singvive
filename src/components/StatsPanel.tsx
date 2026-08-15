import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { STAT_GROUPS } from '../game/stats';
import { getTraits } from '../game/character';

/**
 * Who they are (traits) above what they've done (counters that only ever go
 * up). Attributes live on the Condition rail — no need to repeat them here.
 */
export function StatsPanel() {
  const { character, stats, day } = useGame(
    useShallow((s) => ({ character: s.character, stats: s.stats, day: s.day })),
  );
  const traits = character ? getTraits(character.traitIds) : [];

  return (
    <div className="flex flex-col gap-3">
      {character && (
        <section className="rounded-lg border border-white/10 bg-black/30 p-3">
          <h4 className="mb-2 text-xs uppercase tracking-widest text-white/30">Survivor</h4>
          <div className="flex items-baseline justify-between">
            <span className="truncate text-sm font-bold text-signal">{character.name}</span>
            <span className="shrink-0 text-xs text-white/40">day {day}</span>
          </div>
          {traits.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {(['positive', 'negative'] as const).map((cat) => {
                const list = traits.filter((t) => t.category === cat);
                if (list.length === 0) return null;
                return (
                  <div key={cat} className="flex flex-wrap gap-1">
                    {list.map((t) => (
                      <span
                        key={t.id}
                        title={t.description}
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          cat === 'positive' ? 'bg-signal/15 text-signal' : 'bg-hiss/15 text-hiss'
                        }`}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {STAT_GROUPS.map((group) => (
        <section key={group.title} className="rounded-lg border border-white/10 bg-black/30 p-3">
          <h4 className="mb-2 text-xs uppercase tracking-widest text-white/30">
            {group.title}
          </h4>
          <dl className="flex flex-col gap-1">
            {group.rows.map((row) => {
              const raw = stats[row.key];
              return (
                <div key={row.key} className="flex items-center gap-2 text-xs">
                  <span className="w-5 shrink-0 text-center text-white/40">
                    <Icon name={row.icon} />
                  </span>
                  <dt className="min-w-0 flex-1 truncate text-white/50">{row.label}</dt>
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
