import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { STAT_GROUPS } from '../game/stats';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, getTraits } from '../game/character';

/**
 * The survivor's sheet and the run's tally, side by side: who they are (fixed
 * attributes and traits) above what they've done (counters that only ever go up).
 */
export function StatsPanel() {
  const { character, stats, day } = useGame();
  const traits = character ? getTraits(character.traitIds) : [];

  return (
    <div className="flex flex-col gap-3">
      {character && (
        <section className="rounded-lg border border-white/10 bg-black/30 p-3">
          <h4 className="mb-2 text-[11px] uppercase tracking-widest text-white/30">Survivor</h4>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="truncate text-sm font-bold text-signal">{character.name}</span>
            <span className="shrink-0 text-[11px] text-white/40">day {day}</span>
          </div>
          <div className="grid grid-cols-5 gap-1 text-center">
            {ATTRIBUTE_KEYS.map((k) => (
              <div key={k} className="rounded bg-black/30 py-1" title={ATTRIBUTE_LABELS[k]}>
                <div className="text-sm font-bold tabular-nums text-signal">
                  {character.attributes[k]}
                </div>
                <div className="text-[10px] uppercase text-white/40">
                  {ATTRIBUTE_LABELS[k].slice(0, 3)}
                </div>
              </div>
            ))}
          </div>
          {traits.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {traits.map((t) => (
                <span
                  key={t.id}
                  title={t.description}
                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                    t.category === 'positive' ? 'bg-signal/15 text-signal' : 'bg-hiss/15 text-hiss'
                  }`}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {STAT_GROUPS.map((group) => (
        <section key={group.title} className="rounded-lg border border-white/10 bg-black/30 p-3">
          <h4 className="mb-2 text-[11px] uppercase tracking-widest text-white/30">
            {group.title}
          </h4>
          <dl className="flex flex-col gap-1">
            {group.rows.map((row) => {
              const raw = stats[row.key];
              return (
                <div key={row.key} className="flex items-center gap-2 text-[12px]">
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
