import { WEATHER_ICON, WEATHER_LABEL, weatherEffects } from '../game/weather';
import { Icon } from '../icons/Icon';
import type { WeatherKind } from '../game/types';
import { TipHint } from './TipHint';

/** Weather readout that reveals its buffs/debuffs on hover (or tap on touch). */
export function WeatherBadge({ weather }: { weather: WeatherKind }) {
  const effects = weatherEffects(weather);
  return (
    <TipHint
      className="inline-flex"
      tipClassName="absolute left-0 top-full mt-1 w-max min-w-[9rem] rounded-lg border border-white/15 bg-concrete-900 p-2 shadow-signage"
      tip={
        <>
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/40">
            {WEATHER_LABEL[weather]} — effects
          </div>
          <ul className="flex flex-col gap-0.5">
            {effects.map((e, i) => (
              <li key={i} className={`text-xs ${e.good ? 'text-signal' : 'text-hiss'}`}>
                {e.good ? '▲' : '▼'} {e.label}
              </li>
            ))}
          </ul>
        </>
      }
    >
      <span className="flex cursor-help items-center gap-1 border-b border-dashed border-white/20">
        <Icon name={WEATHER_ICON[weather]} /> {WEATHER_LABEL[weather]}
      </span>
    </TipHint>
  );
}
