import { Icon } from '../icons/Icon';
import { formatDuration } from '../game/travel';
import { HAZARD_CONFIG, riskLabel, type TrekRisk } from '../game/wilds';

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
  arrivalAtNight: boolean;
  onTrek: () => void;
  onCancel: () => void;
}

/**
 * The card for crossing open ground. Deliberately plainer than a LocationCard —
 * there's nothing there. It sells the one thing the player is buying: a way out
 * of wherever they're standing, at a price.
 */
export function TrekCard({
  distanceM,
  travelMin,
  risk,
  blind,
  energyLow,
  outOfRange,
  tooClose,
  arrivalAtNight,
  onTrek,
  onCancel,
}: Props) {
  const label = riskLabel(risk.encounterChance);
  const blocked = energyLow || outOfRange || tooClose;

  return (
    <>
      <div className="flex items-center gap-2">
        <Icon name="action.travel" size={22} className="opacity-60" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white/70">Open ground</div>
          <div className="text-xs text-white/40">
            No building, no stash, nothing to search. Just a way through.
          </div>
        </div>
        <button
          onClick={onCancel}
          className="rounded px-2 py-0.5 text-xs text-white/40 hover:bg-white/10 hover:text-white/70"
        >
          clear
        </button>
      </div>

      <div className="mt-2 rounded bg-black/30 p-2 text-xs text-white/55">
        <div className="flex justify-between">
          <span><Icon name="action.travel" /> Cross</span>
          <span className="text-white/80">
            {distanceM} m · {formatDuration(travelMin)}
          </span>
        </div>
        <div className="flex justify-between">
          <span><Icon name="meter.energy" /> Exposure</span>
          <span className="text-white/80">−{risk.energyCost} energy</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-white/10 pt-1">
          <span><Icon name="combat.encounter" /> Route</span>
          <span style={{ color: label.color }}>{label.text}</span>
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

      <button
        disabled={blocked}
        onClick={onTrek}
        className="mt-3 w-full rounded bg-signal/80 py-2 text-sm font-bold text-black transition hover:bg-signal disabled:opacity-30"
      >
        {energyLow
          ? 'Too exhausted — sleep first'
          : tooClose
            ? 'Too close to bother'
            : outOfRange
              ? 'Too far to reach'
              : `Cross on foot · ${formatDuration(travelMin)}`}
      </button>
    </>
  );
}
