import { POI_CONFIG } from '../game/poi';
import { FACTION_CONFIG } from '../game/factions';
import { dangerColor } from './mapIcons';
import { formatDuration, type estimateExpedition } from '../game/travel';
import type { LocationState } from '../game/types';

type Estimate = ReturnType<typeof estimateExpedition> | null;

interface Props {
  sel: LocationState;
  here: boolean;
  est: Estimate;
  energyLow: boolean;
  /** target is beyond the survivor's current one-push travel range */
  outOfRange?: boolean;
  canMrt: boolean;
  onTravel: () => void;
  onMrt: () => void;
  onOpenStash: () => void;
}

/** The pinned "what am I looking at" card — drives the core travel/search action. */
export function LocationCard(props: Props) {
  return props.sel.discovered ? <KnownCard {...props} /> : <UnknownCard {...props} />;
}

function UnknownCard({ est, energyLow, outOfRange, onTravel }: Props) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-2xl opacity-60">❓</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white/70">Unknown location</div>
          <div className="text-xs text-white/40">
            Something's out there. You won't know what until you go.
          </div>
        </div>
      </div>
      {est && (
        <div className="mt-2 flex justify-between rounded bg-black/30 p-2 text-xs text-white/55">
          <span>🚶 Travel there</span>
          <span className="text-white/80">{formatDuration(est.travelMin)}</span>
        </div>
      )}
      {est?.arrivalAtNight && (
        <div className="mt-1 text-xs text-red-400">
          🌙 You'd arrive after dark — far more dangerous.
        </div>
      )}
      {outOfRange && (
        <div className="mt-1 text-xs text-red-400">
          ⛔ Beyond your range — hop closer, rest, or ride the MRT.
        </div>
      )}
      <button
        disabled={energyLow || outOfRange}
        onClick={onTravel}
        className="mt-3 w-full rounded bg-toxic/80 py-2 text-sm font-bold text-black hover:bg-toxic disabled:opacity-30"
      >
        {energyLow
          ? 'Too exhausted — sleep first'
          : outOfRange
            ? 'Too far to reach'
            : 'Head into the unknown'}
      </button>
    </>
  );
}

function KnownCard({ sel, here, est, energyLow, outOfRange, canMrt, onTravel, onMrt, onOpenStash }: Props) {
  const cfg = POI_CONFIG[sel.category];
  const inSight = here;
  const mem = sel.lastSeen;
  const useMem = !inSight && !!mem;
  const danger = useMem ? mem!.currentDanger : sel.currentDanger;
  const factionRevealed = useMem ? mem!.isFactionRevealed : sel.isFactionRevealed;
  const exhausted = useMem ? mem!.exhausted : sel.exhausted;
  const searches = useMem ? mem!.remainingSearches : sel.remainingSearches;
  const faction = factionRevealed && sel.factionId ? FACTION_CONFIG[sel.factionId] : null;
  const dngr = Math.max(1, Math.round(danger));

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{cfg.glyph}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{sel.name}</div>
          <div className="text-xs text-white/40">
            {cfg.label} · {sel.size}
          </div>
        </div>
        {here ? (
          <span className="rounded bg-toxic/20 px-2 py-0.5 text-[11px] text-toxic">HERE</span>
        ) : (
          <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/50">last seen</span>
        )}
      </div>

      {faction && (
        <div
          className="mt-2 rounded bg-black/30 px-2 py-1 text-xs"
          style={{ color: faction.color }}
        >
          {faction.glyph} {faction.name} territory
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-xs">
        {/* distance-from-spawn is noise once you're standing here */}
        <span className="text-white/50">
          {here ? '' : `${Math.round(sel.distanceFromSpawn)} m from spawn`}
        </span>
        <span style={{ color: dangerColor(dngr) }}>
          Danger {'●'.repeat(dngr)}
          <span className="text-white/15">{'●'.repeat(5 - dngr)}</span>
        </span>
      </div>
      <div className="mt-1 text-xs text-white/40">
        {exhausted ? 'Picked clean — exhausted.' : `${searches} search${searches === 1 ? '' : 'es'} left`}
        {useMem && <span className="text-amber-300/70"> · intel may be stale</span>}
      </div>

      {est && !here && (
        <div className="mt-2 rounded bg-black/30 p-2 text-xs text-white/55">
          <div className="flex justify-between">
            <span>🚶 Travel here</span>
            <span className="text-white/80">
              {formatDuration(est.travelMin)}
              {est.weatherSlowed && <span className="text-sky-300"> · rain</span>}
              {est.encumbered && <span className="text-red-300"> · heavy</span>}
            </span>
          </div>
          <div className="flex justify-between">
            <span>🔦 Search</span>
            <span className="text-white/80">{formatDuration(est.searchMin)}</span>
          </div>
          {(est.arrivalAtNight || est.doneAtNight) && (
            <div className="mt-1 text-red-400">🌙 You'll be out after dark — far more dangerous.</div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {here ? (
          <>
            <button
              disabled={sel.exhausted}
              onClick={onTravel}
              className="w-full rounded bg-toxic/80 py-2 text-sm font-bold text-black hover:bg-toxic disabled:opacity-30"
            >
              {sel.exhausted ? 'Nothing left to search' : 'Search again'}
            </button>
            <button
              onClick={onOpenStash}
              className="w-full rounded border border-white/15 py-2 text-sm hover:bg-white/5"
            >
              📦 Open stash here
            </button>
          </>
        ) : (
          <>
            {outOfRange && !canMrt && (
              <div className="text-xs text-red-400">
                ⛔ Beyond your range — hop closer, rest, or ride the MRT.
              </div>
            )}
            <button
              disabled={energyLow || outOfRange}
              onClick={onTravel}
              className="w-full rounded bg-toxic/80 py-2 text-sm font-bold text-black hover:bg-toxic disabled:opacity-30"
            >
              {energyLow
                ? 'Too exhausted — sleep first'
                : outOfRange
                  ? 'Too far to reach'
                  : `Travel & search · ${est ? formatDuration(est.totalMin) : ''}`}
            </button>
            {canMrt && (
              <button
                onClick={onMrt}
                className="w-full rounded bg-sky-700/70 py-2 text-sm font-semibold hover:bg-sky-600"
              >
                🚆 Ride MRT here (fast · toll)
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
