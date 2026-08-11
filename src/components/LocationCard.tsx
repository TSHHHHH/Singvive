import { POI_CONFIG } from '../game/poi';
import { Icon } from '../icons/Icon';
import { FACTION_CONFIG } from '../game/factions';
import { dangerColor } from './mapIcons';
import { formatDuration, type estimateExpedition } from '../game/travel';
import { displayLine, getMrtNetwork, linesAt, type MrtSegment } from '../game/mrt';
import type { LocationState } from '../game/types';

type Estimate = ReturnType<typeof estimateExpedition> | null;

/**
 * One way out of a platform. `known` is false when the world doesn't hold that
 * station yet — it's still a valid destination, the far end just gets built
 * when you get there.
 */
export interface Departure {
  seg: MrtSegment;
  known: boolean;
}

interface Props {
  sel: LocationState;
  here: boolean;
  est: Estimate;
  energyLow: boolean;
  /** target is beyond the survivor's current one-push travel range */
  outOfRange?: boolean;
  /** True when this is the next station down the line from where you stand. */
  canTunnel: boolean;
  /** That segment — the line it runs on and how long the walk is. */
  tunnelSeg?: MrtSegment | null;
  /** Why a station further down the line isn't somewhere you can head for. */
  tunnelHint?: string | null;
  /**
   * Where the tunnels go from the platform you're standing on. Only set on the
   * "you are here" card: the far end of a segment is usually undiscovered, and
   * fog means there's no marker on the map to click.
   */
  departures?: Departure[];
  onDepart?: (locationId: string) => void;
  onTravel: () => void;
  /** Step through the door of the site you're already standing at. */
  onEnter: () => void;
  /** Descend and walk the tunnel to the next station down the line. */
  onTunnel: () => void;
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
          ⛔ Beyond your range — hop closer, rest, or walk the tunnels.
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

/**
 * A real station wears its codes, in the liveries of the lines that serve it —
 * the shorthand every commuter here already reads at a glance.
 */
function StationCodes({ sel }: { sel: LocationState }) {
  const net = getMrtNetwork();
  const station = net && sel.mrtStationId ? net.byId.get(sel.mrtStationId) : null;
  if (!net || !station) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
      {station.codes.map((code) => (
        <span
          key={code}
          className="rounded px-1.5 py-0.5 font-bold text-black"
          style={{ background: net.lineByCode.get(code.slice(0, 2))?.color ?? '#9c9890' }}
        >
          {code}
        </span>
      ))}
      <span className="truncate text-white/45">
        {linesAt(net, station)
          .map((l) => l.name)
          .join(' · ')}
      </span>
    </div>
  );
}

/**
 * The line map on the platform wall: where the tunnels go from here. This is
 * the primary way into a run — the far end of a segment is usually a station
 * you've never seen, and fog means it has no marker on the map to click.
 */
function Departures({
  list,
  onDepart,
}: {
  list: Departure[];
  onDepart?: (locationId: string) => void;
}) {
  const net = getMrtNetwork();
  return (
    <div className="rounded border border-white/10 bg-black/30 p-2">
      <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/40">
        Tunnels from this platform
      </div>
      <div className="flex flex-col gap-1.5">
        {list.map(({ seg, known }) => {
          const line = net ? displayLine(net, seg.line) : null;
          return (
            <button
              key={seg.station.id}
              onClick={() => onDepart?.(seg.station.id)}
              title={`Walk the ${line?.name ?? 'tunnel'} to ${seg.station.name}`}
              className="flex items-center gap-2 rounded border border-white/10 px-2 py-1.5 text-left text-xs transition hover:bg-white/5"
            >
              <span
                className="h-6 w-1 shrink-0 rounded-full"
                style={{ background: line?.color ?? '#9c9890' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{seg.station.name}</span>
                <span className="block truncate text-[10px] text-white/40">
                  {seg.station.codes.join(' · ')} · {seg.meters} m
                </span>
              </span>
              {/* Past the edge of the map you've built — worth saying, because
                  it's the one direction that takes you somewhere new. */}
              <span className={`shrink-0 text-[10px] ${known ? 'text-white/40' : 'text-astral'}`}>
                {known ? '→' : 'unmapped →'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The one segment you can walk from this platform. No trains run, so the sell
 * is what the tunnel spares you: the range cap, the weather, the streets.
 */
function TunnelButton({ seg, onTunnel }: { seg: MrtSegment | null; onTunnel: () => void }) {
  const net = getMrtNetwork();
  const line = net && seg ? displayLine(net, seg.line) : null;
  return (
    <button
      onClick={onTunnel}
      className="w-full rounded border py-2 text-sm font-semibold hover:brightness-125"
      style={{
        borderColor: `${line?.color ?? '#2bc4d9'}66`,
        background: `${line?.color ?? '#2bc4d9'}1a`,
        color: line?.color ?? '#2bc4d9',
      }}
    >
      <Icon name="action.mrt" /> Walk the tunnel
      <span className="block text-[11px] font-normal opacity-75">
        {line ? `${line.name} · ` : ''}
        {seg ? `${seg.meters} m` : 'one segment'} · no weather, no range
      </span>
    </button>
  );
}

function KnownCard({
  sel,
  here,
  est,
  energyLow,
  outOfRange,
  canTunnel,
  tunnelSeg,
  tunnelHint,
  departures,
  onDepart,
  onTravel,
  onEnter,
  onTunnel,
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

      <StationCodes sel={sel} />

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
            {departures && departures.length > 0 && (
              <Departures list={departures} onDepart={onDepart} />
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
            {outOfRange && !canTunnel && (
              <div className="text-xs text-hiss">
                ⛔ Beyond your range — hop closer, rest, or walk the tunnels.
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
            {canTunnel && <TunnelButton seg={tunnelSeg ?? null} onTunnel={onTunnel} />}
            {tunnelHint && <div className="text-xs text-white/45">{tunnelHint}</div>}
          </>
        )}
      </div>
    </>
  );
}
