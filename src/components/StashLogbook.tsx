import { useGame } from '../game/store';
import { itemDef } from '../game/loot';
import { POI_CONFIG } from '../game/poi';
import { Icon } from '../icons/Icon';
import type { ItemInstance } from '../game/types';

interface Props {
  /** Pan the map camera to a stash without auto-traveling. */
  onFocusLocation?: (lat: number, lng: number) => void;
}

/**
 * Read-only index of every cache you've left behind. Rendered as the body of the
 * side panel — the panel owns the header and the close control.
 */
export function StashLogbook({ onFocusLocation }: Props) {
  const items = useGame((s) => s.items);
  const locations = useGame((s) => s.locations);
  const currentPositionId = useGame((s) => s.currentPositionId);

  // group stashed items by their location container (exclude backpack + equipment)
  const byLocation = new Map<string, ItemInstance[]>();
  for (const inst of items) {
    if (inst.container === 'backpack' || inst.container.startsWith('equip:')) continue;
    if (!locations[inst.container]) continue;
    const arr = byLocation.get(inst.container) ?? [];
    arr.push(inst);
    byLocation.set(inst.container, arr);
  }

  const entries = [...byLocation.entries()].filter(([, arr]) => arr.length > 0);

  return (
    <>
      {entries.length === 0 ? (
        <p className="text-sm text-white/40">
          No caches yet. Travel to a location and deposit loot into its stash.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map(([locId, arr]) => {
            const loc = locations[locId];
            const counts = new Map<string, number>();
            for (const i of arr) counts.set(i.defId, (counts.get(i.defId) ?? 0) + i.stack);
            const here = currentPositionId === locId;
            return (
              <li key={locId} className="rounded-lg border border-white/10 bg-black/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 font-semibold">
                    <Icon name={POI_CONFIG[loc.category].icon} /> {loc.name}
                    {here && <span className="ml-2 text-xs text-signal">(here)</span>}
                  </span>
                  {onFocusLocation && (
                    <button
                      type="button"
                      onClick={() => onFocusLocation(loc.lat, loc.lng)}
                      className="shrink-0 rounded border border-white/15 px-2 py-0.5 text-2xs text-white/70 transition hover:bg-white/10 hover:text-signal"
                    >
                      Show on map
                    </button>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/60">
                  {[...counts.entries()].map(([defId, n]) => (
                    <span key={defId}>
                      {itemDef(defId).name} ×{n}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-white/30">
        Caches are read-only from here — travel to a location to withdraw from its stash.
      </p>
    </>
  );
}
