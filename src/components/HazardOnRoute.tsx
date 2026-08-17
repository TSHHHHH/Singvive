import { HAZARD_CONFIG, type HazardZone } from '../game/wilds';

/** Named pockets on a quoted route — used by TrekCard and LocationCard. */
export function HazardOnRoute({ hazards }: { hazards: HazardZone[] }) {
  if (hazards.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      {hazards.map((z) => {
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
  );
}
