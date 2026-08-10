import { POI_CONFIG } from '../game/poi';
import { Icon } from '../icons/Icon';
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
  /** Step through the door of the site you're already standing at. */
  onEnter: () => void;
  onMrt: () => void;
  onOpenStash: () => void;
  /** HDB blocks are entered floor by floor instead of searched. */
  onEnterBlock?: () => void;
}

/** The pinned "what am I looking at" card — drives the core travel/search action. */
export function LocationCard(props: Props) {
  return props.sel.discovered ? <KnownCard {...props} /> : <UnknownCard {...props} />;
}

function UnknownCard({ est, energyLow, outOfRange, onTravel }: Props) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Icon name="poi.unknown" size={22} className="opacity-60" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white/70">Unknown location</div>
          <div className="text-xs text-white/40">
            Something's out there. You won't know what until you go.
          </div>
        </div>
      </div>
      {est && (
        <div className="mt-2 flex justify-between rounded bg-black/30 p-2 text-xs text-white/55">
          <span><Icon name="action.travel" /> Travel there</span>
          <span className="text-white/80">{formatDuration(est.travelMin)}</span>
        </div>
      )}
      {est?.arrivalAtNight && (
        <div className="mt-1 text-xs text-hiss">
          🌙 You'd arrive after dark — far more dangerous.
        </div>
      )}
      {outOfRange && (
        <div className="mt-1 text-xs text-hiss">
          ⛔ Beyond your range — hop closer, rest, or ride the MRT.
        </div>
      )}
      <button
        disabled={energyLow || outOfRange}
        onClick={onTravel}
        className="mt-3 w-full rounded bg-signal/80 py-2 text-sm font-bold text-black hover:bg-signal disabled:opacity-30"
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

function KnownCard({
  sel,
  here,
  est,
  energyLow,
  outOfRange,
  canMrt,
  onTravel,
  onEnter,
  onMrt,
  onOpenStash,
  onEnterBlock,
}: Props) {
  const cfg = POI_CONFIG[sel.category];
  const isBlock = sel.category === 'residential';
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
        <Icon name={cfg.icon} size={22} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{sel.name}</div>
          <div className="text-xs text-white/40">
            {cfg.label} · {sel.size}
          </div>
        </div>
        {here ? (
          <span className="rounded bg-signal/20 px-2 py-0.5 text-[11px] text-signal">HERE</span>
        ) : (
          <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/50">last seen</span>
        )}
      </div>

      {faction && (
        <div
          className="mt-2 rounded border bg-black/30 px-2 py-1 text-xs"
          style={{ color: faction.color, borderColor: `${faction.color}66` }}
        >
          <Icon name={faction.icon} /> {faction.shortName} territory
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
        {isBlock
          ? '12 floors — cleared unit by unit, not searched.'
          : exhausted
            ? 'Picked clean — exhausted.'
            : `${searches} search${searches === 1 ? '' : 'es'} left`}
        {useMem && <span className="text-concrete-400"> · intel may be stale</span>}
      </div>

      {est && !here && (
        <div className="mt-2 rounded bg-black/30 p-2 text-xs text-white/55">
          <div className="flex justify-between">
            <span><Icon name="action.travel" /> Travel here</span>
            <span className="text-white/80">
              {formatDuration(est.travelMin)}
              {est.weatherSlowed && <span className="text-astral"> · rain</span>}
              {est.encumbered && <span className="text-hiss"> · heavy</span>}
            </span>
          </div>
          <div className="flex justify-between">
            <span><Icon name="action.search" /> Search, once inside</span>
            <span className="text-white/80">{formatDuration(est.searchMin)}</span>
          </div>
          {(est.arrivalAtNight || est.doneAtNight) && (
            <div className="mt-1 text-hiss">🌙 You'll be out after dark — far more dangerous.</div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {here ? (
          <>
            {isBlock ? (
              <button
                onClick={onEnterBlock ?? onEnter}
                className="w-full rounded bg-signal/90 py-2 text-sm font-bold text-black hover:bg-signal"
              >
                <Icon name="hdb.enterBlock" /> Enter the block
              </button>
            ) : (
              <button
                disabled={sel.exhausted}
                onClick={onEnter}
                className="w-full rounded bg-signal/80 py-2 text-sm font-bold text-black hover:bg-signal disabled:opacity-30"
              >
                {sel.exhausted
                  ? 'Nothing left to search'
                  : sel.cleared
                    ? 'Go back in and search'
                    : 'Go inside and search'}
              </button>
            )}
            <button
              onClick={onOpenStash}
              className="w-full rounded border border-white/15 py-2 text-sm hover:bg-white/5"
            >
              <Icon name="action.stash" /> Open stash here
            </button>
          </>
        ) : (
          <>
            {outOfRange && !canMrt && (
              <div className="text-xs text-hiss">
                ⛔ Beyond your range — hop closer, rest, or ride the MRT.
              </div>
            )}
            <button
              disabled={energyLow || outOfRange}
              onClick={onTravel}
              className="w-full rounded bg-signal/80 py-2 text-sm font-bold text-black hover:bg-signal disabled:opacity-30"
            >
              {energyLow
                ? 'Too exhausted — sleep first'
                : outOfRange
                  ? 'Too far to reach'
                  : `Travel here · ${est ? formatDuration(est.travelMin) : ''}`}
            </button>
            {canMrt && (
              <button
                onClick={onMrt}
                className="w-full rounded border border-astral/40 bg-astral/10 text-astral py-2 text-sm font-semibold hover:bg-astral/20"
              >
                <Icon name="action.mrt" /> Ride MRT here (fast · toll)
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
