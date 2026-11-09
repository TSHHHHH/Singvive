import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useClockFormat } from '../../game/settings';
import { useGame } from '../../game/store';
import { countBleeding, formatClock, totalHp, totalMaxHp } from '../../game/survival';
import type { TimeOfDay } from '../../game/types';
import { useT } from '../../i18n';
import { DigitalClock } from '../DigitalClock';
import { MiniMeter } from '../PhoneStatusBar';
import { tip } from '../tips';

/** Lock-screen wallpaper tint per band: a faint glow of the clock's colour. */
const WALL_GLOW: Record<TimeOfDay, string> = {
  day: 'rgba(232,229,221,0.10)',
  dusk: 'rgba(224,160,74,0.16)',
  night: 'rgba(43,196,217,0.14)',
};

/**
 * Desktop top-left: the survivor's own phone, held up over the map. A status
 * bar with no service, a lock-screen clock, and the readouts as widgets —
 * weather and rest, the survival meters (click: Condition window), and the
 * objective as a pinned notification. Everything else lives behind the dock.
 *
 * Folded (the home bar toggles it, `vitalsFolded` remembers it) the phone is a
 * status strip: status bar, meters, and one line of objective beside Rest.
 */
export function VitalsHud({
  day,
  hour,
  band,
  weatherRow,
  objective,
  onOpenCondition,
  conditionOpen,
  conditionLabel,
  folded,
  onToggleFold,
  objectiveCompact,
  restButton,
}: {
  day: number;
  hour: number;
  band: TimeOfDay;
  weatherRow: ReactNode;
  objective: ReactNode;
  onOpenCondition: () => void;
  conditionOpen: boolean;
  conditionLabel: string;
  folded: boolean;
  onToggleFold: () => void;
  /** The objective as one line, shown while folded. */
  objectiveCompact: ReactNode;
  /** Rest, shown beside the objective while folded. */
  restButton: ReactNode;
}) {
  const { t } = useT();
  const clockFmt = useClockFormat();
  const { meters, bodyParts } = useGame(
    useShallow((s) => ({ meters: s.meters, bodyParts: s.bodyParts })),
  );
  const hp = totalHp(bodyParts);
  const hpMax = totalMaxHp(bodyParts);
  const bleeding = countBleeding(bodyParts, 'major') + countBleeding(bodyParts, 'minor');

  const conditionWidget = (
    <button
      type="button"
      onClick={onOpenCondition}
      aria-pressed={conditionOpen}
      {...tip(conditionLabel, { label: true })}
      className={`block w-full rounded border px-2.5 py-1.5 text-left backdrop-blur-sm transition ${
        conditionOpen
          ? 'border-signal/50 bg-signal/10'
          : 'border-white/10 bg-white/[0.05] hover:border-white/25 hover:bg-white/[0.08]'
      }`}
    >
      {!folded && (
        <span className="mb-1 flex items-center justify-between text-label uppercase text-white/35">
          {conditionLabel}
          {bleeding > 0 && <span className="text-hiss">{t('ui.phone.bleed')}</span>}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <MiniMeter icon="meter.health" value={hp} max={hpMax || 1} color="#d92d2d" />
        <MiniMeter icon="meter.hunger" value={meters.hunger} max={100} color="#b7b3a9" dynamic />
        <MiniMeter icon="meter.thirst" value={meters.thirst} max={100} color="#2bc4d9" dynamic />
        <MiniMeter icon="meter.energy" value={meters.energy} max={100} color="#e8e5dd" dynamic />
        {meters.infection > 0 && (
          <MiniMeter
            icon="meter.infection"
            value={meters.infection}
            max={100}
            color="#2bc4d9"
            danger
          />
        )}
        {folded && bleeding > 0 && (
          <span className="shrink-0 text-label uppercase text-hiss">{t('ui.phone.bleed')}</span>
        )}
      </span>
    </button>
  );

  return (
    // Bezel: dark handset with a thin lit edge; side keys hang off it.
    <div className="pointer-events-auto relative w-[20rem] rounded-[2.4rem] border border-white/20 bg-black p-[5px] shadow-signage ring-1 ring-black/70">
      {!folded && (
        <>
          <span className="absolute -left-[3px] top-24 h-7 w-[3px] rounded-l bg-white/20" aria-hidden />
          <span className="absolute -left-[3px] top-36 h-12 w-[3px] rounded-l bg-white/20" aria-hidden />
          <span className="absolute -right-[3px] top-28 h-16 w-[3px] rounded-r bg-white/20" aria-hidden />
        </>
      )}

      {/* Screen */}
      <div
        className="relative overflow-hidden rounded-[2.05rem] border border-white/5"
        style={{
          background: `radial-gradient(120% 70% at 50% 0%, ${WALL_GLOW[band]}, transparent 65%), linear-gradient(180deg, rgba(28,28,30,0.92), rgba(8,8,10,0.94))`,
        }}
      >
        {/* Status bar: time · camera island · no service + battery */}
        <div className="relative flex h-7 items-center justify-between px-6 pt-1 text-micro tabular-nums text-white/70">
          <span>{formatClock(hour, clockFmt)}</span>
          <span
            className="absolute left-1/2 top-1.5 h-[18px] w-20 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/5"
            aria-hidden
          />
          <span className="flex items-center gap-1.5" {...tip(t('ui.hud.noService'))}>
            <SignalBars />
            <span className="text-hiss/80">{t('ui.hud.sos')}</span>
            <Battery />
          </span>
        </div>

        {folded ? (
          <div className="space-y-1.5 px-2.5 pb-0.5 pt-1">
            {conditionWidget}
            <div className="flex items-stretch gap-1.5">
              <div className="min-w-0 flex-1">{objectiveCompact}</div>
              {restButton}
            </div>
          </div>
        ) : (
          <>
          {/* Lock-screen clock */}
          <div className="px-3 pb-3 pt-2">
            <DigitalClock day={day} hour={hour} band={band} variant="lock" />
          </div>

          {/* Widgets: the game's own square panels, sitting on the screen. */}
          <div className="space-y-2 px-2.5 pb-2">
            <div className="rounded border border-white/10 bg-white/[0.05] px-2.5 py-2 backdrop-blur-sm">
              {weatherRow}
            </div>
            {conditionWidget}
            {/* Pinned notification */}
            {objective}
          </div>
          </>
        )}

        {/* Home indicator: swipe the phone shut / open. */}
        <button
          type="button"
          onClick={onToggleFold}
          aria-expanded={!folded}
          {...tip(folded ? t('ui.hud.unfoldPhone') : t('ui.hud.foldPhone'), { label: true })}
          className="group flex w-full justify-center pb-2 pt-1.5"
        >
          <span className="h-1 w-24 rounded-full bg-white/30 transition-colors group-hover:bg-white/60" />
          <span className="sr-only">{folded ? t('ui.hud.unfoldPhone') : t('ui.hud.foldPhone')}</span>
        </button>
      </div>
    </div>
  );
}

/** Four bars, all dead but a stub: the network went down with the city. */
function SignalBars() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 3.5}
          y={10 - (i + 1) * 2.5}
          width="2.5"
          height={(i + 1) * 2.5}
          rx="0.5"
          fill={i === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'}
        />
      ))}
    </svg>
  );
}

/** Battery glyph. Cosmetic: the phone is a frame, not a meter. */
function Battery() {
  return (
    <svg width="22" height="11" viewBox="0 0 22 11" aria-hidden>
      <rect x="0.5" y="0.5" width="18" height="10" rx="2.5" fill="none" stroke="rgba(255,255,255,0.45)" />
      <rect x="19.5" y="3.5" width="1.8" height="4" rx="0.8" fill="rgba(255,255,255,0.45)" />
      <rect x="2" y="2" width="7" height="7" rx="1.2" fill="rgba(255,255,255,0.75)" />
    </svg>
  );
}
