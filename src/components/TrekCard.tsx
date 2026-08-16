import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { formatDuration } from '../game/travel';
import { HAZARD_CONFIG, riskLabel, type TrekRisk } from '../game/wilds';
import type { IconName } from '../icons/keys';

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
 * Sized for TargetDock (~268px): labels stay on one line, values wrap cleanly
 * on the right. Cancel lives on the dock chrome, not here.
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
  const label = riskLabel(risk.encounterChance);
  const blocked = energyLow || outOfRange || tooClose || noDryRoute;
  const energyHit = risk.energyCost + vegetationEnergy;

  return (
    <>
      <div className="flex items-start gap-2">
        <Icon name="action.travel" size={22} className="mt-0.5 shrink-0 opacity-60" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white/70">Open ground</div>
          <div className="text-xs leading-snug text-white/40">
            No building, no stash, nothing to search. Just a way through.
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1 rounded bg-black/30 p-2 text-xs text-white/55">
        <StatRow
          icon="action.travel"
          label="Cross"
          value={
            <>
              {distanceM} m · {formatDuration(travelMin)}
              {vegetationSlowed && <span className="text-white/45"> · forest</span>}
            </>
          }
        />
        <StatRow
          icon="meter.energy"
          label="Exposure"
          value={<>−{energyHit} energy</>}
        />
        <div className="border-t border-white/10 pt-1">
          <StatRow
            icon="combat.encounter"
            label="Route"
            value={<span style={{ color: label.color }}>{label.text}</span>}
          />
        </div>
      </div>

      {risk.hazards.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {risk.hazards.map((z) => {
            const cfg = HAZARD_CONFIG[z.kind];
            return (
              <div
                key={z.id}
                className="rounded border bg-black/30 px-2 py-1 text-xs"
                style={{ color: cfg.color, borderColor: `${cfg.color}66` }}
              >
                <div className="font-semibold">
                  {cfg.label} {'●'.repeat(z.severity)}
                </div>
                <div className="text-white/45">{cfg.blurb}</div>
              </div>
            );
          })}
        </div>
      )}

      {blind && (
        <div className="mt-2 text-xs text-white/35">
          You can't see far enough to read that ground. Anything could be sitting on it.
        </div>
      )}
      {arrivalAtNight && (
        <div className="mt-1 text-xs text-hiss">
          🌙 You'd be caught out there after dark, with no door to close.
        </div>
      )}
      {outOfRange && (
        <div className="mt-1 text-xs text-hiss">
          ⛔ Further than you can push in one go — pick somewhere nearer.
        </div>
      )}
      {noDryRoute && (
        <div className="mt-1 text-xs text-hiss">
          ⛔ No dry route — water or sealed ground blocks the way.
        </div>
      )}

      <button
        disabled={blocked}
        onClick={onTrek}
        className="mt-3 w-full rounded bg-signal/80 py-2 text-sm font-bold text-black transition hover:bg-signal disabled:opacity-30"
      >
        {energyLow
          ? 'Too exhausted — sleep first'
          : noDryRoute
            ? 'No dry route'
            : tooClose
              ? 'Too close to bother'
              : outOfRange
                ? 'Too far to reach'
                : `Cross on foot · ${formatDuration(travelMin)}`}
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
