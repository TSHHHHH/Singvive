import { HAZARD_CONFIG, type HazardZone } from '../game/wilds';
import { Dots } from './placeCard';
import { tip } from './tips';
import { useT } from '../i18n';
import { hazardBlurb, hazardLabel, hazardPlaceName } from './hazardName';

/**
 * Named pockets on a quoted route — used by TrekCard and LocationCard. Sits in
 * the card's note stack, so it carries no outer margin of its own.
 */
export function HazardOnRoute({ hazards, concise = false }: { hazards: HazardZone[]; concise?: boolean }) {
  const { t } = useT();
  if (hazards.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {hazards.map((z) => {
        const cfg = HAZARD_CONFIG[z.kind];
        const blurb = hazardBlurb(z, t);
        const place = hazardPlaceName(z);
        return (
          <div
            key={z.id}
            className="rounded border bg-black/30 px-2 py-1.5 text-body"
            style={{ borderColor: `${cfg.color}66` }}
            {...tip(concise ? blurb : undefined)}
          >
            <div className="flex items-center justify-between gap-3 font-semibold" style={{ color: cfg.color }}>
              <span className="min-w-0">
                {hazardLabel(z, t)}
                {place && <span className="font-normal text-concrete-400"> · {place}</span>}
              </span>
              <Dots filled={z.severity} of={3} />
            </div>
            {!concise && <div className="text-concrete-400">{blurb}</div>}
          </div>
        );
      })}
    </div>
  );
}
