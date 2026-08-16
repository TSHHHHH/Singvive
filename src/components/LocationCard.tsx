import type { ReactNode } from 'react';
import { POI_CONFIG } from '../game/poi';
import { Icon } from '../icons/Icon';
import {
  FACTION_CONFIG,
  STANDING_BAD,
  STANDING_HATED,
  STANDING_KIN,
  STANDING_KNOWN,
  STANDING_TRUSTED,
  factionOffersAid,
  factionSharesIntel,
  factionShelters,
  factionTrades,
  hasFactionClearance,
  isOutpostSite,
  locationServices,
  standingLabel,
} from '../game/factions';
import { useGame } from '../game/store';
import { dangerColor } from './mapIcons';
import { formatDuration, type estimateExpedition } from '../game/travel';
import { remainingSearchMinutes } from '../game/searchSession';
import { displayLine, getMrtNetwork, linesAt, type MrtSegment } from '../game/mrt';
import type { FactionService, LocationState } from '../game/types';
import type { IconName } from '../icons/keys';

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
  /** No land path around water/restricted under the routing budget. */
  noDryRoute?: boolean;
  /** True when this is an adjacent station with an intact tunnel segment. */
  canTunnel: boolean;
  /** That segment — the line it runs on and how long the walk is. */
  tunnelSeg?: MrtSegment | null;
  /** Why a station further down the line isn't a one-click hop. */
  tunnelHint?: string | null;
  /**
   * Open the tunnel route planner from the platform you're standing on.
   * Only set on the "you are here" card.
   */
  onPlanTunnels?: () => void;
  /** @deprecated neighbour list — planner replaced this; kept for rare callers */
  departures?: Departure[];
  onDepart?: (locationId: string) => void;
  onTravel: () => void;
  /** Step through the door of the site you're already standing at. */
  onEnter: () => void;
  /** Open the planner with this station as destination (target card). */
  onTunnel: () => void;
  onOpenStash: () => void;
  /** HDB blocks are entered floor by floor instead of searched. */
  onEnterBlock?: () => void;
  /** Stack actions above info — used in the narrow map bubble. */
  compact?: boolean;
}

/** The pinned "what am I looking at" card — drives the core travel/search action. */
export function LocationCard(props: Props) {
  return props.sel.discovered ? <KnownCard {...props} /> : <UnknownCard {...props} />;
}

/**
 * The card's shape: actions pinned to a narrow left rail, everything you're
 * reading about the place on the right. Keeps the button in the same spot no
 * matter how much intel the site happens to carry.
 */
function CardSplit({
  actions,
  info,
  compact,
}: {
  actions: ReactNode;
  info: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${compact ? 'flex-col' : 'flex-col lg:flex-row'}`}>
      <div
        className={`flex flex-col gap-2 ${
          compact ? 'w-full' : 'w-full shrink-0 lg:w-[38%]'
        }`}
      >
        {actions}
      </div>
      <div className="min-w-0 flex-1">{info}</div>
    </div>
  );
}

function UnknownCard({ est, energyLow, outOfRange, noDryRoute, onTravel }: Props) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Icon name="poi.unknown" size={22} className="opacity-60" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white/70">Unknown location</div>
          <div className="text-xs text-white/40">
            Commit blind — no danger intel until you arrive.
          </div>
        </div>
      </div>
      {est && (
        <div className="mt-2 flex justify-between rounded bg-black/30 p-2 text-xs text-white/55">
          <span><Icon name="action.travel" /> Travel there</span>
          <span className="text-white/80">
            {formatDuration(est.travelMin)}
            {est.vegetationSlowed && <span className="text-white/45"> · forest</span>}
          </span>
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
      {noDryRoute && (
        <div className="mt-1 text-xs text-hiss">
          ⛔ No dry route — water or sealed ground blocks the way.
        </div>
      )}
      <button
        disabled={energyLow || outOfRange || !!noDryRoute}
        onClick={onTravel}
        className="mt-3 w-full rounded bg-signal/80 py-2 text-sm font-bold text-black hover:bg-signal disabled:opacity-30"
      >
        {energyLow
          ? 'Too exhausted — sleep first'
          : noDryRoute
            ? 'No dry route'
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
    <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
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
 * Open the island rail map and plan a crawl — far stations are usually
 * undiscovered, so the planner is the primary entrance into the tunnels.
 */
function PlanTunnelsButton({ onPlan }: { onPlan: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlan}
      className="w-full rounded border border-astral/40 bg-astral/10 py-2 text-sm font-semibold text-astral hover:bg-astral/20"
    >
      <Icon name="action.mrt" /> Plan tunnel travel
      <span className="block text-xs font-normal opacity-75">
        Pick any station · collapsed bores block some routes
      </span>
    </button>
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
      <Icon name="action.mrt" /> Plan this tunnel
      <span className="block text-xs font-normal opacity-75">
        {line ? `${line.name} · ` : ''}
        {seg ? `${seg.meters} m` : 'route'} · no weather, no range
      </span>
    </button>
  );
}

/** Named rungs on the −5…+5 standing ladder, low → high. */
const STANDING_RUNGS: { min: number; label: string }[] = [
  { min: STANDING_HATED, label: 'Terrible' },
  { min: STANDING_BAD, label: 'Bad' },
  { min: -1, label: 'Wary' },
  { min: 0, label: 'Stranger' },
  { min: STANDING_KNOWN, label: 'Known' },
  { min: STANDING_TRUSTED, label: 'Welcome' },
  { min: STANDING_KIN, label: 'Kin' },
];

function rungIndex(standing: number): number {
  let idx = 0;
  for (let i = 0; i < STANDING_RUNGS.length; i++) {
    if (standing >= STANDING_RUNGS[i].min) idx = i;
  }
  return idx;
}

/** Horizontal rung meter — same language as danger / loot dots. */
function ReputationLadder({ standing, color }: { standing: number; color: string }) {
  const current = rungIndex(standing);
  const score = standing > 0 ? `+${standing}` : `${standing}`;
  return (
    <div
      className="flex items-center justify-center gap-0.5"
      title={`${standingLabel(standing)} (${score})`}
      aria-label={`Standing: ${standingLabel(standing)}`}
    >
      {STANDING_RUNGS.map((rung, idx) => {
        const filled = idx <= current;
        return (
          <span
            key={rung.label}
            className="text-[0.65rem] leading-none"
            style={{
              color: filled ? color : `${color}44`,
              opacity: filled ? 1 : 0.45,
            }}
          >
            ●
          </span>
        );
      })}
    </div>
  );
}

/**
 * Whose ground this is — logo + standing ladder. The here-card identity row
 * gives this a full column so territory reads as a claim, not a footnote.
 */
function FactionClaim({
  sel,
  faction,
  compact,
}: {
  sel: LocationState;
  faction: (typeof FACTION_CONFIG)[Exclude<LocationState['factionId'], null>];
  /** Narrow inline chip for the target / last-seen card. */
  compact?: boolean;
}) {
  const standing = useGame((s) => s.factionStanding[faction.id]);
  const isOutpost = useGame(
    (s) => sel.isFactionOutpost || isOutpostSite(s.outposts, faction.id, sel.id),
  );
  const place = isOutpost ? faction.outpostName : 'territory';
  const score = standing > 0 ? `+${standing}` : `${standing}`;

  if (compact) {
    return (
      <div
        className="mt-2 rounded border px-2 py-1 text-xs"
        style={{
          color: faction.color,
          borderColor: `${faction.color}66`,
          background: `${faction.color}14`,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            <Icon name={faction.icon} /> {faction.shortName} {place}
          </span>
          <span className="shrink-0 opacity-80">
            {standingLabel(standing)} {score}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex w-[6.5rem] shrink-0 flex-col items-center gap-1 rounded border px-2 py-1.5"
      style={{
        color: faction.color,
        borderColor: `${faction.color}88`,
        background: `linear-gradient(180deg, ${faction.color}28 0%, ${faction.color}0d 100%)`,
      }}
    >
      <Icon name={faction.icon} size={26} />
      <div className="w-full text-center leading-tight">
        <div className="truncate text-xs font-bold tracking-wide">{faction.shortName}</div>
        <div className="truncate text-2xs opacity-75">{place}</div>
      </div>
      <div
        className="mt-0.5 w-full rounded border px-1.5 py-1"
        style={{ borderColor: `${faction.color}44`, background: `${faction.color}12` }}
      >
        <ReputationLadder standing={standing} color={faction.color} />
        <div className="mt-0.5 text-center text-2xs font-semibold tabular-nums opacity-90">
          {standingLabel(standing)} {score}
        </div>
      </div>
    </div>
  );
}

const SERVICE_META: Record<
  FactionService,
  { icon: IconName; label: string; hint: string }
> = {
  trade: { icon: 'faction.idtf', label: 'Trade at the counter', hint: "Today's swaps" },
  rest: { icon: 'action.sleep', label: 'Sleep inside the wire', hint: 'Safe until morning' },
  aid: { icon: 'action.search', label: 'Field aid', hint: 'Once per day' },
  intel: { icon: 'action.map', label: 'Ask for intel', hint: 'Once per day — map tip' },
};

/** NPC services on occupied ground — never scavenging. Hidden while raiding. */
function FactionHubActions({ sel }: { sel: LocationState }) {
  const standing = useGame((s) => s.factionStanding);
  const outposts = useGame((s) => s.outposts);
  const day = useGame((s) => s.day);
  const raidMode = useGame((s) => s.raidMode);
  const openTrader = useGame((s) => s.openTrader);
  const outpostRest = useGame((s) => s.outpostRest);
  const factionAid = useGame((s) => s.factionAid);
  const factionIntel = useGame((s) => s.factionIntel);
  if (!sel.factionId) return null;
  if (raidMode?.locationId === sel.id) return null;

  const cfg = FACTION_CONFIG[sel.factionId];
  const services = locationServices(sel, outposts);
  if (!services.length) return null;
  const cleared = hasFactionClearance(sel, standing, day);

  const canTrade = factionTrades(sel.factionId, standing);
  const canRest = factionShelters(sel.factionId, standing);
  const canAid = factionOffersAid(sel.factionId, standing);
  const canIntel = factionSharesIntel(sel.factionId, standing);

  return (
    <>
      <div className="mt-1 border-t border-white/10 pt-2">
        <div className="mb-1.5 text-2xs font-semibold uppercase tracking-widest text-white/35">
          Services
        </div>
        <div className="flex flex-col gap-2">
          {!cleared && (
            <p className="text-xs text-white/50">
              Approach the gate first — they will not deal with you from the curb.
            </p>
          )}
          {services.includes('trade') && (
            <button
              disabled={!cleared || !canTrade}
              onClick={() => openTrader(sel.id)}
              className="w-full rounded border px-2 py-2 text-sm leading-tight hover:brightness-125 disabled:opacity-30"
              style={{ borderColor: `${cfg.color}66`, background: `${cfg.color}1a`, color: cfg.color }}
            >
              <Icon name={cfg.icon} /> {SERVICE_META.trade.label}
              <span className="block text-xs font-normal opacity-75">
                {!cleared
                  ? 'Gate first'
                  : canTrade
                    ? SERVICE_META.trade.hint
                    : "They don't deal with strangers"}
              </span>
            </button>
          )}
          {services.includes('rest') && (
            <button
              disabled={!cleared || !canRest}
              onClick={outpostRest}
              className="w-full rounded border border-white/15 px-2 py-2 text-sm leading-tight hover:bg-white/5 disabled:opacity-30"
            >
              <Icon name={SERVICE_META.rest.icon} /> {SERVICE_META.rest.label}
              <span className="block text-xs font-normal opacity-60">
                {!cleared
                  ? 'Gate first'
                  : canRest
                    ? SERVICE_META.rest.hint
                    : 'Beds are for people they trust'}
              </span>
            </button>
          )}
          {services.includes('aid') && (
            <button
              disabled={!cleared || !canAid || (sel.aidUsedDay ?? -1) >= day}
              onClick={factionAid}
              className="w-full rounded border border-white/15 px-2 py-2 text-sm leading-tight hover:bg-white/5 disabled:opacity-30"
            >
              <Icon name={SERVICE_META.aid.icon} /> {SERVICE_META.aid.label}
              <span className="block text-xs font-normal opacity-60">
                {!cleared
                  ? 'Gate first'
                  : (sel.aidUsedDay ?? -1) >= day
                    ? 'Already used today'
                    : canAid
                      ? SERVICE_META.aid.hint
                      : 'Medics are for people they trust'}
              </span>
            </button>
          )}
          {services.includes('intel') && (
            <button
              disabled={!cleared || !canIntel || (sel.intelUsedDay ?? -1) >= day}
              onClick={factionIntel}
              className="w-full rounded border border-white/15 px-2 py-2 text-sm leading-tight hover:bg-white/5 disabled:opacity-30"
            >
              <Icon name={SERVICE_META.intel.icon} /> {SERVICE_META.intel.label}
              <span className="block text-xs font-normal opacity-60">
                {!cleared
                  ? 'Gate first'
                  : (sel.intelUsedDay ?? -1) >= day
                    ? 'Already used today'
                    : canIntel
                      ? SERVICE_META.intel.hint
                      : "They don't brief strangers"}
              </span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function KnownCard({
  sel,
  here,
  est,
  energyLow,
  outOfRange,
  noDryRoute,
  canTunnel,
  tunnelSeg,
  tunnelHint,
  onPlanTunnels,
  onTravel,
  onEnter,
  onTunnel,
  onOpenStash,
  onEnterBlock,
  compact,
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
  const searchesLabel =
    Math.abs(searches - Math.round(searches)) < 0.05
      ? `${Math.round(searches)}`
      : searches.toFixed(1);
  const faction = factionRevealed && sel.factionId ? FACTION_CONFIG[sel.factionId] : null;
  const dngr = Math.max(1, Math.round(danger));
  const occupied = !!sel.factionId;

  const standing = useGame((s) => s.factionStanding);
  const day = useGame((s) => s.day);
  const raidMode = useGame((s) => s.raidMode);
  const pendingSearch = useGame((s) => s.pendingSearch);
  const abortSearch = useGame((s) => s.abortSearch);
  const sneakEnter = useGame((s) => s.sneakEnter);
  const forceEnter = useGame((s) => s.forceEnter);
  const raidSearch = useGame((s) => s.raidSearch);
  const gateCleared = occupied && hasFactionClearance(sel, standing, day);
  const raidingHere = raidMode?.locationId === sel.id;
  const searchingHere =
    !!pendingSearch && pendingSearch.locationId === sel.id && here;
  const searchEtaMin = searchingHere ? remainingSearchMinutes(pendingSearch!) : 0;

  const siteStatus = searchingHere
    ? `Searching… ~${formatDuration(searchEtaMin)} left in this haul`
    : occupied
    ? raidingHere
      ? raidMode!.mode === 'sneak'
        ? 'Inside unseen — their stores, if you stay quiet.'
        : 'Forced entry — rich stores, every search draws a fight.'
      : null
    : isBlock
      ? '12 floors — cleared unit by unit, not searched.'
      : exhausted
        ? 'Picked clean — exhausted.'
        : `${searchesLabel} search${Math.abs(searches - 1) < 0.05 ? '' : 'es'} left`;

  const metaLine = (
    <div className="mt-1 text-xs text-white/45">
      <div>
        {cfg.label} · {sel.size}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span style={{ color: dangerColor(dngr) }} title={`Danger ${dngr} of 5`}>
          Danger {'●'.repeat(dngr)}
          <span className="text-white/15">{'●'.repeat(5 - dngr)}</span>
        </span>
        <span title={`Loot ${cfg.richness} of 5`}>
          Loot {'●'.repeat(cfg.richness)}
          <span className="text-white/15">{'●'.repeat(5 - cfg.richness)}</span>
        </span>
      </div>
    </div>
  );

  const actions = (
    <>
      {searchingHere ? (
        <button
          onClick={() => abortSearch()}
          className="w-full rounded border border-white/20 bg-white/5 px-2 py-2 text-sm font-bold leading-tight hover:bg-white/10"
        >
          <Icon name="action.search" /> Searching…
          <span className="block text-xs font-normal opacity-75">
            ~{formatDuration(searchEtaMin)} left — Leave to stop early
          </span>
        </button>
      ) : occupied ? (
        raidingHere ? (
          <button
            disabled={sel.exhausted}
            onClick={raidSearch}
            className="w-full rounded bg-signal/90 px-2 py-2 text-sm font-bold leading-tight text-black hover:bg-signal disabled:opacity-30"
          >
            <Icon name="action.search" />{' '}
            {sel.exhausted
              ? 'Nothing left'
              : raidMode!.mode === 'sneak'
                ? 'Search while unseen'
                : 'Tear through the place'}
            {!sel.exhausted && (
              <span className="block text-xs font-normal opacity-75">
                {searchesLabel} search{Math.abs(searches - 1) < 0.05 ? '' : 'es'} left
              </span>
            )}
          </button>
        ) : gateCleared ? null : (
          <>
            <button
              onClick={onEnter}
              className="w-full rounded bg-signal/90 px-2 py-2 text-sm font-bold leading-tight text-black hover:bg-signal"
            >
              <Icon name="action.search" /> Approach the gate
            </button>
            <button
              onClick={sneakEnter}
              className="w-full rounded border border-white/20 px-2 py-2 text-sm leading-tight hover:bg-white/5"
            >
              <Icon name="action.search" /> Sneak in
              <span className="block text-xs font-normal opacity-60">Dexterity check — rich loot, no services</span>
            </button>
            <button
              onClick={forceEnter}
              className="w-full rounded border border-hiss/50 px-2 py-2 text-sm leading-tight text-hiss hover:bg-hiss/10"
            >
              <Icon name="combat.hostiles" /> Force enter
              <span className="block text-xs font-normal opacity-60">Fight in — every search draws combat</span>
            </button>
          </>
        )
      ) : isBlock ? (
        <button
          onClick={onEnterBlock ?? onEnter}
          className="w-full rounded bg-signal/90 px-2 py-2 text-sm font-bold leading-tight text-black hover:bg-signal"
        >
          <Icon name="hdb.enterBlock" /> Enter the block
        </button>
      ) : (
        <button
          disabled={sel.exhausted}
          onClick={onEnter}
          className="w-full rounded bg-signal/80 px-2 py-2 text-sm font-bold leading-tight text-black hover:bg-signal disabled:opacity-30"
        >
          {sel.exhausted
            ? 'Nothing left to search'
            : sel.cleared
              ? 'Keep searching'
              : 'Go inside and search'}
        </button>
      )}
      <button
        onClick={onOpenStash}
        className="w-full rounded border border-white/15 px-2 py-2 text-sm leading-tight hover:bg-white/5"
      >
        <Icon name="action.stash" /> Open stash here
      </button>
      {here && occupied && <FactionHubActions sel={sel} />}
    </>
  );

  // Target / last-seen card keeps a compact single column — travel estimate
  // is the decision, not territory hierarchy.
  if (!here) {
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
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/50">last seen</span>
        </div>

        <StationCodes sel={sel} />

        {faction && <FactionClaim sel={sel} faction={faction} compact />}

        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-white/50">{`${Math.round(sel.distanceFromSpawn)} m from spawn`}</span>
          <span style={{ color: dangerColor(dngr) }} title={`Danger ${dngr} of 5`}>
            Danger {'●'.repeat(dngr)}
            <span className="text-white/15">{'●'.repeat(5 - dngr)}</span>
          </span>
        </div>
        <div className="mt-1 text-xs text-white/40">
          {occupied
            ? sel.isFactionOutpost
              ? 'Faction outpost — full services, no scavenging.'
              : 'Faction territory — NPC hub, no scavenging.'
            : siteStatus}
          {useMem && (
            <span className="text-concrete-400">
              {' '}
              · last seen danger {dngr}
              {mem && mem.currentDanger !== sel.currentDanger ? ' (may be stale)' : ' (intel)'}
            </span>
          )}
        </div>

        {est && (
          <div className="mt-2 rounded bg-black/30 p-2 text-xs text-white/55">
            <div className="flex justify-between">
              <span><Icon name="action.travel" /> Travel here</span>
              <span className="text-white/80">
                {formatDuration(est.travelMin)}
                {est.weatherSlowed && <span className="text-astral"> · rain</span>}
                {est.encumbered && <span className="text-hiss"> · heavy</span>}
                {est.vegetationSlowed && <span className="text-white/45"> · forest</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span><Icon name="action.search" /> Search, once inside</span>
              <span className="text-white/80">{formatDuration(est.searchMin)}</span>
            </div>
            {(est.arrivalAtNight || est.doneAtNight) && (
              <div className="mt-1 text-hiss">
                🌙 You'll be out after dark — far more dangerous.
              </div>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {outOfRange && !canTunnel && (
            <div className="text-xs text-hiss">
              ⛔ Beyond your range — hop closer, rest, or walk the tunnels.
            </div>
          )}
          {noDryRoute && (
            <div className="text-xs text-hiss">
              ⛔ No dry route — water or sealed ground blocks the way.
            </div>
          )}
          <button
            disabled={energyLow || outOfRange || !!noDryRoute}
            onClick={onTravel}
            className="w-full rounded bg-signal/80 py-2 text-sm font-bold text-black hover:bg-signal disabled:opacity-30"
          >
            {energyLow
              ? 'Too exhausted — sleep first'
              : noDryRoute
                ? 'No dry route'
                : outOfRange
                  ? 'Too far to reach'
                  : `Travel here · ${est ? formatDuration(est.travelMin) : ''}`}
          </button>
          {canTunnel && <TunnelButton seg={tunnelSeg ?? null} onTunnel={onTunnel} />}
          {tunnelHint && <div className="text-xs text-white/45">{tunnelHint}</div>}
        </div>
      </>
    );
  }

  return (
    <>
      <CardSplit
        compact={compact}
        actions={actions}
        info={
          <>
            <div className={`flex gap-2 ${compact ? 'flex-col' : 'items-stretch'}`}>
              <div className="flex min-w-0 flex-1 gap-2">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-white/10 bg-black/30"
                  aria-hidden
                >
                  <Icon name={cfg.icon} size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold leading-tight">{sel.name}</div>
                  {metaLine}
                  <StationCodes sel={sel} />
                  {siteStatus && (
                    <div className="mt-1 text-xs text-white/40">{siteStatus}</div>
                  )}
                </div>
              </div>
              {faction && <FactionClaim sel={sel} faction={faction} />}
            </div>
            <div className="mt-2 text-xs leading-snug text-white/45">{cfg.blurb}</div>
          </>
        }
      />
      {/* Route planner is the primary way into long-range tunnel travel. */}
      {onPlanTunnels && sel.isMrtStation && (
        <div className="mt-3">
          <PlanTunnelsButton onPlan={onPlanTunnels} />
        </div>
      )}
    </>
  );
}
