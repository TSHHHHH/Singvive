import type { ReactNode } from 'react';
import { useEffect } from 'react';
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
} from '../game/factions';
import { isStreetLootPoi } from '../game/loot';
import { useGame } from '../game/store';
import { dangerColor } from './mapIcons';
import { formatDuration, type estimateExpedition } from '../game/travel';
import { remainingSearchMinutes } from '../game/searchSession';
import { displayLine, getMrtNetwork, linesAt, type MrtSegment } from '../game/mrt';
import type { FactionService, LocationState } from '../game/types';
import type { IconName } from '../icons/keys';
import { riskLabel, type TrekRisk } from '../game/wilds';
import { HazardOnRoute } from './HazardOnRoute';
import {
  destructionDisplayLabel,
  poiCategoryLabel,
  standingDisplayLabel,
  standingKey,
  useT,
} from '../i18n';

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
  /** True when this is an adjacent station with a tunnel segment. */
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
  /** Sensed pockets on the walk here (target card only). */
  routeRisk?: TrekRisk | null;
  /** Route leaves the sense bubble — quote is a guess. */
  routeBlind?: boolean;
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

function RouteHazardBlock({
  routeRisk,
  routeBlind,
}: {
  routeRisk?: TrekRisk | null;
  routeBlind?: boolean;
}) {
  const { t } = useT();
  if (!routeRisk && !routeBlind) return null;
  const label = routeRisk ? riskLabel(routeRisk.encounterChance) : null;
  return (
    <>
      {routeRisk && (
        <div className="mt-1 flex justify-between text-xs text-white/55">
          <span>{t('ui.location.route')}</span>
          <span style={{ color: label?.color }}>{label?.text}</span>
        </div>
      )}
      {routeRisk && <HazardOnRoute hazards={routeRisk.hazards} />}
      {routeBlind && (
        <div className="mt-2 text-xs text-white/35">
          You can't see far enough to read that ground. Anything could be sitting on it.
        </div>
      )}
    </>
  );
}

function UnknownCard({
  est,
  energyLow,
  outOfRange,
  noDryRoute,
  onTravel,
  routeRisk,
  routeBlind,
}: Props) {
  const { t } = useT();
  return (
    <>
      <div className="flex items-center gap-2">
        <Icon name="poi.unknown" size={22} className="opacity-60" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white/70">{t('ui.location.unknownLocation')}</div>
          <div className="text-xs text-white/40">
            Commit blind — no danger intel until you arrive.
          </div>
        </div>
      </div>
      {est && (
        <div className="mt-2 flex justify-between rounded bg-black/30 p-2 text-xs text-white/55">
          <span><Icon name="action.travel" /> {t('ui.location.travelThere')}</span>
          <span className="text-white/80">
            {formatDuration(est.travelMin)}
            {est.vegetationSlowed && <span className="text-white/45"> · forest</span>}
          </span>
        </div>
      )}
      <RouteHazardBlock routeRisk={routeRisk} routeBlind={routeBlind} />
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
          ? t('ui.location.tooExhausted')
          : noDryRoute
            ? t('ui.location.noDryRoute')
            : outOfRange
              ? t('ui.location.tooFar')
              : t('ui.location.headUnknown')}
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
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onPlan}
      className="w-full rounded border border-astral/40 bg-astral/10 py-2 text-sm font-semibold text-astral hover:bg-astral/20"
    >
      <Icon name="action.mrt" /> {t('ui.location.route')}
      <span className="block text-xs font-normal opacity-75">
        {t('ui.location.pickStation')}
      </span>
    </button>
  );
}

/**
 * The one segment you can walk from this platform. No trains run, so the sell
 * is what the tunnel spares you: the range cap, the weather, the streets.
 */
function TunnelButton({ seg, onTunnel }: { seg: MrtSegment | null; onTunnel: () => void }) {
  const { t } = useT();
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
      <Icon name="action.mrt" /> {t('ui.location.planTunnels')}
      <span className="block text-xs font-normal opacity-75">
        {seg?.collapsed
          ? t('ui.location.collapsedBore')
          : seg
            ? t('ui.location.tunnelMeta', {
                line: line ? `${line.name} · ` : '',
                meters: seg.meters,
              })
            : t('ui.location.tunnelMetaRoute')}
      </span>
    </button>
  );
}

/** Named rungs on the −5…+5 standing ladder, low → high. */
const STANDING_RUNGS: { min: number; key: ReturnType<typeof standingKey> }[] = [
  { min: STANDING_HATED, key: 'terrible' },
  { min: STANDING_BAD, key: 'bad' },
  { min: -1, key: 'wary' },
  { min: 0, key: 'stranger' },
  { min: STANDING_KNOWN, key: 'known' },
  { min: STANDING_TRUSTED, key: 'welcome' },
  { min: STANDING_KIN, key: 'kin' },
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
  const { locale, t } = useT();
  const current = rungIndex(standing);
  const score = standing > 0 ? `+${standing}` : `${standing}`;
  const label = standingDisplayLabel(standing, locale);
  return (
    <div
      className="flex items-center justify-center gap-0.5"
      title={`${label} (${score})`}
      aria-label={t('ui.location.standingAria', { label })}
    >
      {STANDING_RUNGS.map((rung, idx) => {
        const filled = idx <= current;
        return (
          <span
            key={rung.key}
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
  const { locale, t } = useT();
  const standing = useGame((s) => s.factionStanding[faction.id]);
  const isOutpost = useGame(
    (s) => sel.isFactionOutpost || isOutpostSite(s.outposts, faction.id, sel.id),
  );
  const place = isOutpost ? faction.outpostName : t('ui.location.territory');
  const score = standing > 0 ? `+${standing}` : `${standing}`;
  const standLabel = standingDisplayLabel(standing, locale);

  if (compact) {
    return (
      <div
        className="mt-2 rounded border px-2 py-1.5 text-xs"
        style={{
          color: faction.color,
          borderColor: `${faction.color}66`,
          background: `${faction.color}14`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 leading-snug">
            <Icon name={faction.icon} /> {faction.shortName} {place}
          </span>
          <span className="shrink-0 pt-px opacity-80">
            {standLabel} {score}
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
          {standLabel} {score}
        </div>
      </div>
    </div>
  );
}

const SERVICE_META: Record<
  FactionService,
  { icon: IconName; labelKey: string; hintKey: string; lockedKey: string }
> = {
  trade: {
    icon: 'faction.idtf',
    labelKey: 'ui.location.trade',
    hintKey: 'ui.location.tradeHint',
    lockedKey: 'ui.location.noDealStrangers',
  },
  rest: {
    icon: 'action.sleep',
    labelKey: 'ui.location.sleepInside',
    hintKey: 'ui.location.restHint',
    lockedKey: 'ui.location.bedsTrusted',
  },
  aid: {
    icon: 'action.search',
    labelKey: 'ui.location.fieldAid',
    hintKey: 'ui.location.aidHint',
    lockedKey: 'ui.location.medicsTrusted',
  },
  intel: {
    icon: 'action.map',
    labelKey: 'ui.location.askIntel',
    hintKey: 'ui.location.intelHint',
    lockedKey: 'ui.location.noBriefStrangers',
  },
};

/** NPC services on occupied ground — never scavenging. Hidden while raiding. */
function FactionHubActions({ sel }: { sel: LocationState }) {
  const { t } = useT();
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
          {t('ui.location.services')}
        </div>
        <div className="flex flex-col gap-2">
          {!cleared && (
            <p className="text-xs text-white/50">{t('ui.location.approachGateFirst')}</p>
          )}
          {services.includes('trade') && (
            <button
              disabled={!cleared || !canTrade}
              onClick={() => openTrader(sel.id)}
              className="w-full rounded border px-2 py-2 text-sm leading-tight hover:brightness-125 disabled:opacity-30"
              style={{ borderColor: `${cfg.color}66`, background: `${cfg.color}1a`, color: cfg.color }}
            >
              <Icon name={cfg.icon} /> {t(SERVICE_META.trade.labelKey)}
              <span className="block text-xs font-normal opacity-75">
                {!cleared
                  ? t('ui.location.gateFirst')
                  : canTrade
                    ? t(SERVICE_META.trade.hintKey)
                    : t(SERVICE_META.trade.lockedKey)}
              </span>
            </button>
          )}
          {services.includes('rest') && (
            <button
              disabled={!cleared || !canRest}
              onClick={outpostRest}
              className="w-full rounded border border-white/15 px-2 py-2 text-sm leading-tight hover:bg-white/5 disabled:opacity-30"
            >
              <Icon name={SERVICE_META.rest.icon} /> {t(SERVICE_META.rest.labelKey)}
              <span className="block text-xs font-normal opacity-60">
                {!cleared
                  ? t('ui.location.gateFirst')
                  : canRest
                    ? t(SERVICE_META.rest.hintKey)
                    : t(SERVICE_META.rest.lockedKey)}
              </span>
            </button>
          )}
          {services.includes('aid') && (
            <button
              disabled={!cleared || !canAid || (sel.aidUsedDay ?? -1) >= day}
              onClick={factionAid}
              className="w-full rounded border border-white/15 px-2 py-2 text-sm leading-tight hover:bg-white/5 disabled:opacity-30"
            >
              <Icon name={SERVICE_META.aid.icon} /> {t(SERVICE_META.aid.labelKey)}
              <span className="block text-xs font-normal opacity-60">
                {!cleared
                  ? t('ui.location.gateFirst')
                  : (sel.aidUsedDay ?? -1) >= day
                    ? t('ui.location.alreadyUsedToday')
                    : canAid
                      ? t(SERVICE_META.aid.hintKey)
                      : t(SERVICE_META.aid.lockedKey)}
              </span>
            </button>
          )}
          {services.includes('intel') && (
            <button
              disabled={!cleared || !canIntel || (sel.intelUsedDay ?? -1) >= day}
              onClick={factionIntel}
              className="w-full rounded border border-white/15 px-2 py-2 text-sm leading-tight hover:bg-white/5 disabled:opacity-30"
            >
              <Icon name={SERVICE_META.intel.icon} /> {t(SERVICE_META.intel.labelKey)}
              <span className="block text-xs font-normal opacity-60">
                {!cleared
                  ? t('ui.location.gateFirst')
                  : (sel.intelUsedDay ?? -1) >= day
                    ? t('ui.location.alreadyUsedToday')
                    : canIntel
                      ? t(SERVICE_META.intel.hintKey)
                      : t(SERVICE_META.intel.lockedKey)}
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
  routeRisk,
  routeBlind,
}: Props) {
  const { locale, t } = useT();
  const cfg = POI_CONFIG[sel.category];
  const poiLabel = poiCategoryLabel(sel.category, locale);
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
  const ensureSiteRuin = useGame((s) => s.ensureSiteRuin);
  const gateCleared = occupied && hasFactionClearance(sel, standing, day);
  const raidingHere = raidMode?.locationId === sel.id;
  const searchingHere =
    !!pendingSearch && pendingSearch.locationId === sel.id && here;
  const searchEtaMin = searchingHere ? remainingSearchMinutes(pendingSearch!) : 0;

  useEffect(() => {
    if (!sel.discovered || isBlock || !isStreetLootPoi(sel.category)) return;
    if (sel.destruction !== undefined) return;
    ensureSiteRuin(sel.id);
  }, [sel.id, sel.discovered, sel.category, sel.destruction, isBlock, ensureSiteRuin]);

  const destruction = useMem ? mem!.destruction : sel.destruction;

  const siteStatus = searchingHere
    ? t('ui.location.searchingLeft', { eta: formatDuration(searchEtaMin) })
    : occupied
    ? raidingHere
      ? raidMode!.mode === 'sneak'
        ? t('ui.location.insideUnseen')
        : t('ui.location.forcedEntry')
      : null
    : isBlock
      ? t('ui.location.twelveFloors')
      : exhausted
        ? t('ui.location.pickedClean')
        : Math.abs(searches - 1) < 0.05
          ? t('ui.location.searchesLeft', { n: searchesLabel })
          : t('ui.location.searchesLeftPlural', { n: searchesLabel });

  const metaLine = (
    <div className="mt-1 text-xs text-white/45">
      <div>
        {poiLabel} · {sel.size}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span
          style={{ color: dangerColor(dngr) }}
          title={`${t('ui.location.danger')} ${dngr} of 5`}
        >
          {t('ui.location.danger')} {'●'.repeat(dngr)}
          <span className="text-white/15">{'●'.repeat(5 - dngr)}</span>
        </span>
        {!isBlock && destruction !== undefined && (
          <span
            title={`${t('ui.location.ruin')} — ${destructionDisplayLabel(destruction, locale)}`}
          >
            {t('ui.location.ruin')} {destructionDisplayLabel(destruction, locale)}{' '}
            {'●'.repeat(destruction + 1)}
            <span className="text-white/15">{'●'.repeat(3 - destruction)}</span>
          </span>
        )}
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
          <Icon name="action.search" /> {t('ui.location.searching')}
          <span className="block text-xs font-normal opacity-75">
            ~{formatDuration(searchEtaMin)} left — {t('ui.location.leaveStopEarly')}
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
              ? t('ui.location.nothingLeft')
              : raidMode!.mode === 'sneak'
                ? t('ui.location.searchWhileUnseen')
                : t('ui.location.tearThrough')}
            {!sel.exhausted && (
              <span className="block text-xs font-normal opacity-75">
                {Math.abs(searches - 1) < 0.05
                  ? t('ui.location.searchesLeft', { n: searchesLabel })
                  : t('ui.location.searchesLeftPlural', { n: searchesLabel })}
              </span>
            )}
          </button>
        ) : gateCleared ? null : (
          <>
            <button
              onClick={onEnter}
              className="w-full rounded bg-signal/90 px-2 py-2 text-sm font-bold leading-tight text-black hover:bg-signal"
            >
              <Icon name="action.search" /> {t('ui.location.approachGate')}
            </button>
            <button
              onClick={sneakEnter}
              className="w-full rounded border border-white/20 px-2 py-2 text-sm leading-tight hover:bg-white/5"
            >
              <Icon name="action.search" /> {t('ui.location.sneakIn')}
              <span className="block text-xs font-normal opacity-60">{t('ui.location.sneakHint')}</span>
            </button>
            <button
              onClick={forceEnter}
              className="w-full rounded border border-hiss/50 px-2 py-2 text-sm leading-tight text-hiss hover:bg-hiss/10"
            >
              <Icon name="combat.hostiles" /> {t('ui.location.forceEnter')}
              <span className="block text-xs font-normal opacity-60">{t('ui.location.forceHint')}</span>
            </button>
          </>
        )
      ) : isBlock ? (
        <button
          onClick={onEnterBlock ?? onEnter}
          className="w-full rounded bg-signal/90 px-2 py-2 text-sm font-bold leading-tight text-black hover:bg-signal"
        >
          <Icon name="hdb.enterBlock" /> {t('ui.location.enterBlock')}
        </button>
      ) : (
        <button
          disabled={sel.exhausted}
          onClick={onEnter}
          className="w-full rounded bg-signal/80 px-2 py-2 text-sm font-bold leading-tight text-black hover:bg-signal disabled:opacity-30"
        >
          {sel.exhausted
            ? t('ui.location.nothingLeftToSearch')
            : sel.cleared
              ? t('ui.location.keepSearching')
              : t('ui.location.goInsideSearch')}
        </button>
      )}
      <button
        onClick={onOpenStash}
        className="w-full rounded border border-white/15 px-2 py-2 text-sm leading-tight hover:bg-white/5"
      >
        <Icon name="action.stash" /> {t('ui.location.openStashHere')}
      </button>
      {here && occupied && <FactionHubActions sel={sel} />}
    </>
  );

  // Target / last-seen card keeps a compact single column — travel estimate
  // is the decision, not territory hierarchy.
  if (!here) {
    return (
      <>
        <div className="flex items-start gap-2">
          <Icon name={cfg.icon} size={22} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-bold leading-snug">{sel.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/40">
              <span>
                {poiLabel} · {sel.size}
              </span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/50">
                {t('ui.location.lastSeen')}
              </span>
            </div>
          </div>
        </div>

        <StationCodes sel={sel} />

        {faction && <FactionClaim sel={sel} faction={faction} compact />}

        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-white/50">
            {t('ui.location.metersFromSpawn', { m: Math.round(sel.distanceFromSpawn) })}
          </span>
          <span style={{ color: dangerColor(dngr) }} title={`${t('ui.location.danger')} ${dngr} of 5`}>
            {t('ui.location.danger')} {'●'.repeat(dngr)}
            <span className="text-white/15">{'●'.repeat(5 - dngr)}</span>
          </span>
        </div>
        <div className="mt-1 text-xs text-white/40">
          {occupied
            ? sel.isFactionOutpost
              ? t('ui.location.factionOutpost')
              : t('ui.location.factionTerritory')
            : siteStatus}
          {useMem && (
            <span className="text-concrete-400">
              {' '}
              · {t('ui.location.lastSeenDanger', { n: dngr })}
              {mem && mem.currentDanger !== sel.currentDanger
                ? t('ui.location.mayBeStale')
                : t('ui.location.intelTag')}
            </span>
          )}
        </div>

        {est && (
          <div className="mt-2 rounded bg-black/30 p-2 text-xs text-white/55">
            <div className="flex justify-between">
              <span><Icon name="action.travel" /> {t('ui.location.travelHere')}</span>
              <span className="text-white/80">
                {formatDuration(est.travelMin)}
                {est.weatherSlowed && (
                  <span className="text-astral"> · {t('ui.location.rain')}</span>
                )}
                {est.encumbered && (
                  <span className="text-hiss"> · {t('ui.location.heavy')}</span>
                )}
                {est.vegetationSlowed && (
                  <span className="text-white/45"> · {t('ui.location.forest')}</span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span><Icon name="action.search" /> {t('ui.location.searchOnceInside')}</span>
              <span className="text-white/80">{formatDuration(est.searchMin)}</span>
            </div>
            {(est.arrivalAtNight || est.doneAtNight) && (
              <div className="mt-1 text-hiss">
                🌙 You'll be out after dark — far more dangerous.
              </div>
            )}
          </div>
        )}
        <RouteHazardBlock routeRisk={routeRisk} routeBlind={routeBlind} />
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
              ? t('ui.location.tooExhausted')
              : noDryRoute
                ? t('ui.location.noDryRoute')
                : outOfRange
                  ? t('ui.location.tooFar')
                  : `${t('ui.location.travelHere')} · ${est ? formatDuration(est.travelMin) : ''}`}
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
