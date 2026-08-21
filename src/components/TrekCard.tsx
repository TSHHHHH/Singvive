import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { formatDuration } from '../game/travel';
import { riskLabel, type TrekRisk } from '../game/wilds';
import { HazardOnRoute } from './HazardOnRoute';
import type { IconName } from '../icons/keys';
import { useT } from '../i18n';

interface Props {
  distanceM: number;
  travelMin: number;
  /** Priced against the hazards the survivor has actually sensed. */
  risk: TrekRisk;
  /** True when nothing on the route has been sensed — the estimate is a guess. */
  blind: boolean;
  energyLow: boolean;
  outOfRange: boolean;
  tooClose: boolean;
  /** Straight chord crosses water/restricted with no land detour under budget. */
  noDryRoute?: boolean;
  arrivalAtNight: boolean;
  /** Route cuts through baked forest / nature reserve. */
  vegetationSlowed?: boolean;
  /** Extra stamina burned for vegetation (on top of open-ground exposure). */
  vegetationEnergy?: number;
  onTrek: () => void;
}

/**
 * The card for crossing open ground. Deliberately plainer than a LocationCard —
 * there's nothing there. It sells the one thing the player is buying: a way out
 * of wherever they're standing, at a price.
 *
 * Sized for TargetDock (~328–368px): labels stay on one line, values wrap
 * cleanly on the right. Cancel lives on the dock chrome, not here.
 */
export function TrekCard({
  distanceM,
  travelMin,
  risk,
  blind,
  energyLow,
  outOfRange,
  tooClose,
  noDryRoute = false,
  arrivalAtNight,
  vegetationSlowed = false,
  vegetationEnergy = 0,
  onTrek,
}: Props) {
  const { t } = useT();
  const label = riskLabel(risk.encounterChance);
  const blocked = energyLow || outOfRange || tooClose || noDryRoute;
  const energyHit = risk.energyCost + vegetationEnergy;

  return (
    <>
      <div className="flex items-start gap-2">
        <Icon name="action.travel" size={22} className="mt-0.5 shrink-0 opacity-60" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white/70">{t('ui.trek.title')}</div>
          <div className="text-xs leading-snug text-white/40">{t('ui.trek.blurb')}</div>
        </div>
      </div>

      <div className="mt-2 space-y-1 rounded bg-black/30 p-2 text-xs text-white/55">
        <StatRow
          icon="action.travel"
          label={t('ui.trek.cross')}
          value={
            <>
              {distanceM} m · {formatDuration(travelMin)}
              {vegetationSlowed && <span className="text-white/45">{t('ui.trek.forest')}</span>}
            </>
          }
        />
        <StatRow
          icon="meter.energy"
          label={t('ui.trek.exposure')}
          value={<>{t('ui.trek.energyHit', { n: energyHit })}</>}
        />
        <div className="border-t border-white/10 pt-1">
          <StatRow
            icon="combat.encounter"
            label={t('ui.trek.route')}
            value={<span style={{ color: label.color }}>{label.text}</span>}
          />
        </div>
      </div>

      <HazardOnRoute hazards={risk.hazards} />

      {blind && <div className="mt-2 text-xs text-white/35">{t('ui.trek.blind')}</div>}
      {arrivalAtNight && <div className="mt-1 text-xs text-hiss">{t('ui.trek.night')}</div>}
      {outOfRange && <div className="mt-1 text-xs text-hiss">{t('ui.trek.outOfRange')}</div>}
      {noDryRoute && <div className="mt-1 text-xs text-hiss">{t('ui.trek.noDry')}</div>}

      <button
        disabled={blocked}
        onClick={onTrek}
        className="mt-3 w-full rounded bg-signal/80 py-2 text-sm font-bold text-black transition hover:bg-signal disabled:opacity-30"
      >
        {energyLow
          ? t('ui.trek.tooExhausted')
          : noDryRoute
            ? t('ui.trek.noDryRoute')
            : tooClose
              ? t('ui.trek.tooClose')
              : outOfRange
                ? t('ui.trek.tooFar')
                : t('ui.trek.crossCta', { dur: formatDuration(travelMin) })}
      </button>
    </>
  );
}

/** Label stays put; value wraps on the right in the narrow dock. */
function StatRow({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
        <Icon name={icon} /> {label}
      </span>
      <span className="min-w-0 text-right leading-snug text-white/80">{value}</span>
    </div>
  );
}
