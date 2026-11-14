import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { hasTraitFlag, sumTraitMod } from '../game/character';
import { Icon } from '../icons/Icon';
import { tip } from './tips';
import { TipHint } from './TipHint';
import { LOAD_TIP_CLASS, LoadTipBody } from './loadTip';
import {
  FACTION_CONFIG,
  STANDING_BAD,
  STANDING_HATED,
  STANDING_KIN,
  STANDING_KNOWN,
  STANDING_TRUSTED,
  canKinSearch88Deck,
  escortCandidates,
  factionEscorts,
  factionFeeds,
  factionOffersAid,
  factionSharesIntel,
  factionShelters,
  factionTrades,
  hasFactionClearance,
  isOutpostSite,
  locationServices,
} from '../game/factions';
import { isStreetLootPoi } from '../game/loot';
import { hdbScar, storeysFromRoof } from '../game/hdbDungeon';
import { loadEffectsFor } from '../game/inventory';
import { useGame } from '../game/store';
import { dangerColor } from './mapIcons';
import { formatDuration, type estimateExpedition } from '../game/travel';
import { remainingSearchMinutes } from '../game/searchSession';
import { haversine } from '../game/overpass';
import { displayLine, getMrtNetwork, linesAt, type MrtSegment } from '../game/mrt';
import type { FactionService, LocationState } from '../game/types';
import type { IconName } from '../icons/keys';
import { riskLabel, type TrekRisk } from '../game/wilds';
import { HazardOnRoute } from './HazardOnRoute';
import { BtnSub, Dots, Ledger, LedgerRow, LedgerRule, Note, PlaceStack } from './placeCard';
import { LocationIdentity } from './LocationIdentity';
import { SiteFacilitiesPanel } from './SiteFacilitiesPanel';
import { BTN, tint } from './placeCardStyle';
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
  /** Stack actions above info — used by the phone target card. */
  compact?: boolean;
  /** Desktop edge inspector: disclose supporting detail on demand. */
  inspector?: boolean;
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
  // Phone: actions first, stacked. Desktop (the current-location card): the
  // place reads first and the buttons sit in a row under it; anything that is
  // not a button (faction services) takes a full row.
  return (
    <div className={`flex gap-3 ${compact ? 'flex-col' : 'flex-col lg:flex-col-reverse'}`}>
      <div
        className={`flex flex-col gap-2 ${
          compact
            ? 'w-full'
            : 'w-full lg:grid lg:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] lg:[&>:not(button)]:col-span-full'
        }`}
      >
        {actions}
      </div>
      <div className="min-w-0 flex-1">{info}</div>
    </div>
  );
}

/** The route's read, as one ledger row. */
function RouteRow({ routeRisk }: { routeRisk?: TrekRisk | null }) {
  const { t } = useT();
  if (!routeRisk) return null;
  const label = riskLabel(routeRisk.encounterChance);
  return (
    <LedgerRow icon="combat.encounter" label={t('ui.location.route')}>
      <span style={{ color: label.color }}>{label.text}</span>
    </LedgerRow>
  );
}

/**
 * Everything under the ledger: named pockets, then the lines that bite. Renders
 * nothing when there is nothing to say, so the stack keeps its rhythm.
 */
function RouteNotes({
  routeRisk,
  routeBlind,
  night,
  outOfRange,
  noDryRoute,
  concise,
}: {
  routeRisk?: TrekRisk | null;
  routeBlind?: boolean;
  /** Message key for the after-dark line, when there is one. */
  night?: string | null;
  outOfRange?: boolean;
  noDryRoute?: boolean;
  concise?: boolean;
}) {
  const { t } = useT();
  const hazards = routeRisk?.hazards ?? [];
  if (!hazards.length && !routeBlind && !night && !outOfRange && !noDryRoute) return null;
  return (
    <div className="flex flex-col gap-1">
      <HazardOnRoute hazards={hazards} concise={concise} />
      {routeBlind && <Note>{t('ui.trek.blind')}</Note>}
      {night && <Note tone="warn" icon="time.night">{t(night)}</Note>}
      {outOfRange && <Note tone="warn" icon="status.blocked">{t('ui.location.beyondRange')}</Note>}
      {noDryRoute && <Note tone="warn" icon="status.blocked">{t('ui.trek.noDry')}</Note>}
    </div>
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
  inspector,
}: Props) {
  const { t } = useT();
  return (
    <PlaceStack>
      <LocationIdentity
        title={t('ui.location.unknownLocation')}
        meta={t('ui.location.commitBlind')}
      />
      {(est || routeRisk) && (
        <Ledger>
          {est && (
            <LedgerRow icon="action.travel" label={t('ui.location.travelThere')}>
              {formatDuration(est.travelMin)}
              {est.vegetationSlowed && (
                <span className="text-concrete-400"> · {t('ui.location.forest')}</span>
              )}
            </LedgerRow>
          )}
          <RouteRow routeRisk={routeRisk} />
        </Ledger>
      )}
      <RouteNotes
        routeRisk={routeRisk}
        routeBlind={routeBlind}
        night={est?.arrivalAtNight ? 'ui.location.arriveDark' : null}
        outOfRange={outOfRange}
        noDryRoute={noDryRoute}
        concise={inspector}
      />
      <button
        disabled={energyLow || outOfRange || !!noDryRoute}
        onClick={onTravel}
        className={BTN.primary}
      >
        {energyLow
          ? t('ui.location.tooExhausted')
          : noDryRoute
            ? t('ui.location.noDryRoute')
            : outOfRange
              ? t('ui.location.tooFar')
              : t('ui.location.headUnknown')}
      </button>
    </PlaceStack>
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
    <div className="flex flex-wrap items-center gap-1 text-body">
      {station.codes.map((code) => (
        <span
          key={code}
          className="rounded px-1.5 py-0.5 font-bold tabular-nums text-black"
          style={{ background: net.lineByCode.get(code.slice(0, 2))?.color ?? '#9c9890' }}
        >
          {code}
        </span>
      ))}
      <span className="ml-1 truncate text-concrete-400">
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
    <button type="button" onClick={onPlan} className={BTN.tinted} style={tint('#2bc4d9')}>
      <Icon name="action.mrt" /> {t('ui.location.route')}
      <BtnSub>{t('ui.location.pickStation')}</BtnSub>
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
    <button onClick={onTunnel} className={BTN.tinted} style={tint(line?.color ?? '#2bc4d9')}>
      <Icon name="action.mrt" /> {t('ui.location.planTunnels')}
      <BtnSub>
        {seg?.collapsed
          ? t('ui.location.collapsedBore')
          : seg
            ? t('ui.location.tunnelMeta', {
                line: line ? `${line.name} · ` : '',
                meters: seg.meters,
              })
            : t('ui.location.tunnelMetaRoute')}
      </BtnSub>
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
      {...tip(`${label} (${score})`)}
      aria-label={t('ui.location.standingAria', { label })}
    >
      {STANDING_RUNGS.map((rung, idx) => {
        const filled = idx <= current;
        return (
          <span
            key={rung.key}
            // Glyph geometry, not type — a standing rung mark.
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
        className="flex items-start justify-between gap-3 rounded border px-2 py-1.5 text-body"
        style={tint(faction.color)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon name={faction.icon} className="shrink-0" />
          <span className="min-w-0">
            {faction.shortName} {place}
          </span>
        </span>
        <span className="shrink-0 tabular-nums opacity-80">
          {standLabel} {score}
        </span>
      </div>
    );
  }

  // Same height as the head's icon box plus its two text lines, so the claim
  // sits beside the name instead of pushing the ledger down.
  return (
    <div
      className="flex w-28 shrink-0 flex-col items-center gap-1 rounded border px-2 py-1.5"
      style={tint(faction.color)}
    >
      <Icon name={faction.icon} size={20} />
      <div className="w-full text-center">
        <div className="truncate text-body font-semibold">{faction.shortName}</div>
        <div className="truncate text-micro opacity-75">{place}</div>
      </div>
      <ReputationLadder standing={standing} color={faction.color} />
      <div className="text-micro tabular-nums opacity-80">
        {standLabel} {score}
      </div>
    </div>
  );
}

const SERVICE_META: Record<
  FactionService,
  { icon: IconName; labelKey: string; hintKey: string; lockedKey: string }
> = {
  trade: {
    icon: 'action.search',
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
  feed: {
    icon: 'poi.foodcourt',
    labelKey: 'ui.location.canteen',
    hintKey: 'ui.location.canteenHint',
    lockedKey: 'ui.location.canteenLocked',
  },
  escort: {
    icon: 'poi.waypoint',
    labelKey: 'ui.location.escort',
    hintKey: 'ui.location.escortHint',
    lockedKey: 'ui.location.escortLocked',
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
  const factionFeed = useGame((s) => s.factionFeed);
  const factionEscort = useGame((s) => s.factionEscort);
  const searchKinDeck = useGame((s) => s.searchKinDeck);
  const escort = useGame((s) => s.escort);
  const locations = useGame((s) => s.locations);
  if (!sel.factionId) return null;
  if (raidMode?.locationId === sel.id) return null;

  const cfg = FACTION_CONFIG[sel.factionId];
  const services = locationServices(sel, outposts);
  const cleared = hasFactionClearance(sel, standing, day);
  if (!services.length && !(canKinSearch88Deck(sel, standing) && cleared)) return null;

  const canTrade = factionTrades(sel.factionId, standing);
  const canRest = factionShelters(sel.factionId, standing);
  const canAid = factionOffersAid(sel.factionId, standing);
  const canIntel = factionSharesIntel(sel.factionId, standing);
  const canFeed = factionFeeds(sel.factionId, standing);
  const canEscort = factionEscorts(sel.factionId, standing);
  const kinDeck = canKinSearch88Deck(sel, standing);
  const escortDests = services.includes('escort') ? escortCandidates(sel, locations).slice(0, 5) : [];
  const escortDest = escort?.toId ? locations[escort.toId] : null;

  return (
    <>
      <div className="mt-1 border-t border-white/10 pt-2">
        <div className="mb-1.5 text-label uppercase text-concrete-400">
          {t('ui.location.services')}
        </div>
        <div className="flex flex-col gap-2">
          {!cleared && (
            <Note>{t('ui.location.approachGateFirst')}</Note>
          )}
          {services.includes('trade') && (
            <button
              disabled={!cleared || !canTrade}
              onClick={() => openTrader(sel.id)}
              className={BTN.tinted}
              style={tint(cfg.color)}
            >
              <Icon name={cfg.icon} />{' '}
              {sel.factionId === 'syndicate_88'
                ? t('ui.location.fence')
                : t(SERVICE_META.trade.labelKey)}
              <BtnSub>
                {!cleared
                  ? t('ui.location.gateFirst')
                  : canTrade
                    ? sel.factionId === 'syndicate_88'
                      ? t('ui.location.fenceHint')
                      : t(SERVICE_META.trade.hintKey)
                    : t(SERVICE_META.trade.lockedKey)}
              </BtnSub>
            </button>
          )}
          {services.includes('rest') && (
            <button
              disabled={!cleared || !canRest}
              onClick={outpostRest}
              className={BTN.secondary}
            >
              <Icon name={SERVICE_META.rest.icon} /> {t(SERVICE_META.rest.labelKey)}
              <BtnSub>
                {!cleared
                  ? t('ui.location.gateFirst')
                  : canRest
                    ? t(SERVICE_META.rest.hintKey)
                    : t(SERVICE_META.rest.lockedKey)}
              </BtnSub>
            </button>
          )}
          {services.includes('aid') && (
            <button
              disabled={!cleared || !canAid || (sel.aidUsedDay ?? -1) >= day}
              onClick={factionAid}
              className={BTN.secondary}
            >
              <Icon name={SERVICE_META.aid.icon} /> {t(SERVICE_META.aid.labelKey)}
              <BtnSub>
                {!cleared
                  ? t('ui.location.gateFirst')
                  : (sel.aidUsedDay ?? -1) >= day
                    ? t('ui.location.alreadyUsedToday')
                    : canAid
                      ? t(SERVICE_META.aid.hintKey)
                      : t(SERVICE_META.aid.lockedKey)}
              </BtnSub>
            </button>
          )}
          {services.includes('intel') && (
            <button
              disabled={!cleared || !canIntel || (sel.intelUsedDay ?? -1) >= day}
              onClick={factionIntel}
              className={BTN.secondary}
            >
              <Icon name={SERVICE_META.intel.icon} /> {t(SERVICE_META.intel.labelKey)}
              <BtnSub>
                {!cleared
                  ? t('ui.location.gateFirst')
                  : (sel.intelUsedDay ?? -1) >= day
                    ? t('ui.location.alreadyUsedToday')
                    : canIntel
                      ? t(SERVICE_META.intel.hintKey)
                      : t(SERVICE_META.intel.lockedKey)}
              </BtnSub>
            </button>
          )}
          {services.includes('feed') && (
            <button
              disabled={!cleared || !canFeed || (sel.feedUsedDay ?? -1) >= day}
              onClick={factionFeed}
              className={BTN.tinted}
              style={tint(cfg.color)}
            >
              <Icon name={SERVICE_META.feed.icon} /> {t(SERVICE_META.feed.labelKey)}
              <BtnSub>
                {!cleared
                  ? t('ui.location.gateFirst')
                  : (sel.feedUsedDay ?? -1) >= day
                    ? t('ui.location.alreadyUsedToday')
                    : canFeed
                      ? t(SERVICE_META.feed.hintKey)
                      : t(SERVICE_META.feed.lockedKey)}
              </BtnSub>
            </button>
          )}
          {services.includes('escort') && (
            <div className="rounded border border-white/15 px-3 py-1.5 text-body">
              <div className="text-concrete-50">
                <Icon name={SERVICE_META.escort.icon} /> {t(SERVICE_META.escort.labelKey)}
              </div>
              <p className="mt-0.5 text-concrete-400">
                {!cleared
                  ? t('ui.location.gateFirst')
                  : !canEscort
                    ? t(SERVICE_META.escort.lockedKey)
                    : escortDest
                      ? t('ui.location.escortBooked', { name: escortDest.name })
                      : t(SERVICE_META.escort.hintKey)}
              </p>
              {cleared && canEscort && !escortDest && (
                <div className="mt-1.5 flex flex-col gap-1">
                  {escortDests.length === 0 ? (
                    <Note>{t('ui.location.escortNoDest')}</Note>
                  ) : (
                    escortDests.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => factionEscort(d.id)}
                        className="w-full rounded border border-white/10 px-2 py-1 text-left text-body hover:bg-white/5"
                      >
                        {d.name}
                        <span className="ml-1 tabular-nums text-concrete-400">
                          {Math.round(haversine(sel.lat, sel.lng, d.lat, d.lng))} m
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {kinDeck && (
            <button
              disabled={!cleared}
              onClick={searchKinDeck}
              className={BTN.secondary}
            >
              <Icon name="hdb.enterBlock" /> {t('ui.location.walkTheDecks')}
              <BtnSub>
                {!cleared
                  ? t('ui.location.gateFirst')
                  : sel.kinDeckUsed
                    ? t('ui.location.walkTheDecksAgain')
                    : t('ui.location.walkTheDecksHint')}
              </BtnSub>
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
  inspector,
  routeRisk,
  routeBlind,
}: Props) {
  const { locale, t } = useT();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const showDetails = !inspector || detailsOpen;
  const poiLabel = poiCategoryLabel(sel.category, locale);
  const isBlock = sel.category === 'residential';
  // A block remembers what you did to it; its real height comes from the 3D map.
  const workedBlock = useGame((s) => (isBlock ? s.hdbBlocks[sel.id] : undefined));
  const blockRoof = useGame((s) => (isBlock ? s.siteRoofs[sel.id] : undefined));
  const scar = workedBlock ? hdbScar(workedBlock) : null;
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
  const items = useGame((s) => s.items);
  const character = useGame((s) => s.character);
  const equipment = useGame((s) => s.equipment);
  const raidMode = useGame((s) => s.raidMode);
  const pendingSearch = useGame((s) => s.pendingSearch);
  const abortSearch = useGame((s) => s.abortSearch);
  const sneakEnter = useGame((s) => s.sneakEnter);
  const forceEnter = useGame((s) => s.forceEnter);
  const raidSearch = useGame((s) => s.raidSearch);
  const ensureSiteRuin = useGame((s) => s.ensureSiteRuin);
  const seesSearches = useGame((s) =>
    hasTraitFlag(s.character?.traitIds ?? [], 'showSearchesRemaining'),
  );
  const gateCleared = occupied && hasFactionClearance(sel, standing, day);
  const loadFx = character
    ? loadEffectsFor(
        items,
        character.attributes,
        equipment,
        sumTraitMod(character.traitIds, 'carryCapacityMod'),
      )
    : null;
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
      ? scar
        ? [
            t('ui.location.blockWorked', { cleared: scar.cleared, doors: scar.doors }),
            scar.sealedStoreys > 0 ? t('ui.location.blockSealed', { n: scar.sealedStoreys }) : '',
            scar.hunting ? t('ui.location.blockHunting') : '',
          ]
            .filter(Boolean)
            .join(' · ')
        : storeysFromRoof(blockRoof) !== null
          ? t('ui.location.blockStoreys', { n: storeysFromRoof(blockRoof) ?? 0 })
          : t('ui.location.twelveFloors')
      : exhausted
        ? t('ui.location.pickedClean')
        : !seesSearches
          ? t('ui.location.stillHasLoot')
          : Math.abs(searches - 1) < 0.05
            ? t('ui.location.searchesLeft', { n: searchesLabel })
            : t('ui.location.searchesLeftPlural', { n: searchesLabel });

  const dangerRow = (
    <LedgerRow
      icon="combat.encounter"
      label={t('ui.location.danger')}
      tip={`${t('ui.location.danger')} ${dngr} of 5`}
    >
      <Dots filled={dngr} of={5} color={dangerColor(dngr)} />
    </LedgerRow>
  );

  const siteRows = (
    <>
      {scar && scar.doors > 0 && (
        <LedgerRow
          icon="hdb.unit"
          label={t('ui.location.blockWorkedShort')}
          tip={t('ui.location.blockWorked', { cleared: scar.cleared, doors: scar.doors })}
        >
          <span className="inline-flex items-center gap-2">
            {scar.cleared}/{scar.doors}
            <span className="relative h-1 w-14 overflow-hidden rounded-full bg-white/10">
              <span
                className={`absolute inset-y-0 left-0 ${scar.hunting ? 'bg-hiss' : 'bg-signal'}`}
                style={{ width: `${Math.round(scar.clearedFrac * 100)}%` }}
              />
            </span>
          </span>
        </LedgerRow>
      )}
      {!isBlock && destruction !== undefined && (
        <LedgerRow icon="hdb.collapse" label={t('ui.location.ruin')}>
          <span className="text-concrete-200">{destructionDisplayLabel(destruction, locale)}</span>{' '}
          <Dots filled={destruction + 1} of={4} />
        </LedgerRow>
      )}
    </>
  );

  const detailToggle = inspector && (
    <button
      type="button"
      onClick={() => setDetailsOpen((open) => !open)}
      aria-expanded={detailsOpen}
      aria-controls={detailsId}
      className="self-start text-body text-concrete-400 underline decoration-white/20 underline-offset-4 hover:text-concrete-50"
    >
      {t(detailsOpen ? 'ui.location.lessDetails' : 'ui.location.details')}
    </button>
  );

  const actions = (
    <>
      {here && sel.facilities && <SiteFacilitiesPanel />}
      {searchingHere ? (
        <button onClick={() => abortSearch()} className={BTN.secondary}>
          <Icon name="action.search" /> {t('ui.location.searching')}
          <BtnSub>
            {t('ui.location.searchRemaining', { time: formatDuration(searchEtaMin) })} — {t('ui.location.leaveStopEarly')}
          </BtnSub>
        </button>
      ) : occupied ? (
        raidingHere ? (
          <button disabled={sel.exhausted} onClick={raidSearch} className={BTN.primary}>
            <Icon name="action.search" />{' '}
            {sel.exhausted
              ? t('ui.location.nothingLeft')
              : raidMode!.mode === 'sneak'
                ? t('ui.location.searchWhileUnseen')
                : t('ui.location.tearThrough')}
            {!sel.exhausted && (
              <BtnSub>
                {!seesSearches
                  ? t('ui.location.stillHasLoot')
                  : Math.abs(searches - 1) < 0.05
                    ? t('ui.location.searchesLeft', { n: searchesLabel })
                    : t('ui.location.searchesLeftPlural', { n: searchesLabel })}
              </BtnSub>
            )}
          </button>
        ) : gateCleared ? null : (
          <>
            <button onClick={onEnter} className={BTN.primary}>
              <Icon name="action.search" /> {t('ui.location.approachGate')}
            </button>
            <button onClick={sneakEnter} className={BTN.secondary}>
              <Icon name="action.search" /> {t('ui.location.sneakIn')}
              <BtnSub>{t('ui.location.sneakHint')}</BtnSub>
            </button>
            <button onClick={forceEnter} className={BTN.danger}>
              <Icon name="combat.hostiles" /> {t('ui.location.forceEnter')}
              <BtnSub>{t('ui.location.forceHint')}</BtnSub>
            </button>
          </>
        )
      ) : isBlock ? (
        <button onClick={onEnterBlock ?? onEnter} className={BTN.primary}>
          <Icon name="hdb.enterBlock" /> {t('ui.location.enterBlock')}
        </button>
      ) : (
        <button disabled={sel.exhausted} onClick={onEnter} className={BTN.primary}>
          {sel.exhausted
            ? t('ui.location.nothingLeftToSearch')
            : sel.cleared
              ? t('ui.location.keepSearching')
              : t('ui.location.goInsideSearch')}
        </button>
      )}
      <button onClick={onOpenStash} className={BTN.secondary}>
        <Icon name="action.stash" /> {t('ui.location.openStashHere')}
      </button>
      {here && occupied && <FactionHubActions sel={sel} />}
    </>
  );

  // Target / last-seen card: the travel estimate is the decision, so the
  // ledger leads with what the trip costs.
  if (!here) {
    const travelValue = est ? (
      <span>
        {formatDuration(est.travelMin)}
        {est.weatherSlowed && <span className="text-astral"> · {t('ui.location.rain')}</span>}
        {est.vegetationSlowed && (
          <span className="text-concrete-400"> · {t('ui.location.forest')}</span>
        )}
      </span>
    ) : null;
    const territory = occupied
      ? sel.isFactionOutpost
        ? t('ui.location.factionOutpost')
        : t('ui.location.factionTerritory')
      : siteStatus;
    return (
      <PlaceStack>
        <LocationIdentity
          category={sel.category}
          title={sel.name}
          showFinds={!faction}
          meta={
            <>
              <div>
                {territory}
                {!useMem && <> · {t('ui.location.lastSeen')}</>}
                {useMem && (
                  <>
                    {' '}
                    · {t('ui.location.lastSeenDanger', { n: dngr })}
                    {mem && mem.currentDanger !== sel.currentDanger
                      ? t('ui.location.mayBeStale')
                      : t('ui.location.intelTag')}
                  </>
                )}
              </div>
            </>
          }
        />

        {(sel.isMrtStation || faction) && (
          <div className="flex flex-col gap-2">
            <StationCodes sel={sel} />
            {faction && <FactionClaim sel={sel} faction={faction} compact />}
          </div>
        )}

        <Ledger>
          {dangerRow}
          {est && travelValue && (
            <>
              <LedgerRule />
              <LedgerRow icon="action.travel" label={t('ui.location.travelHere')}>
                {est.travelMult > 1 && loadFx ? (
                  <TipHint
                    placement="top"
                    tipClassName={LOAD_TIP_CLASS}
                    tip={<LoadTipBody fx={loadFx} t={t} title={t('ui.location.travelHere')} />}
                  >
                    {travelValue}
                  </TipHint>
                ) : (
                  travelValue
                )}
              </LedgerRow>
              {showDetails && (
                <LedgerRow icon="action.search" label={t('ui.location.searchOnceInside')}>
                  {formatDuration(est.searchMin)}
                </LedgerRow>
              )}
            </>
          )}
          <RouteRow routeRisk={routeRisk} />
        </Ledger>

        <RouteNotes
          routeRisk={routeRisk}
          routeBlind={routeBlind}
          night={est && (est.arrivalAtNight || est.doneAtNight) ? 'ui.location.outAfterDark' : null}
          outOfRange={!!outOfRange && !canTunnel}
          noDryRoute={!!noDryRoute}
          concise={inspector && !detailsOpen}
        />

        <div id={detailsId} hidden={!showDetails} className="text-body text-concrete-400">
          <p>{poiLabel} · {t(`ui.location.size.${sel.size}`)} · {t('ui.location.metersFromSpawn', { m: Math.round(sel.distanceFromSpawn) })}</p>
          <p className="mt-1">{t(`ui.location.blurb.${sel.category}`)}</p>
        </div>
        {detailToggle}

        <div className="flex flex-col gap-2">
          <button
            disabled={energyLow || outOfRange || !!noDryRoute}
            onClick={onTravel}
            className={BTN.primary}
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
          {tunnelHint && <Note>{tunnelHint}</Note>}
        </div>
      </PlaceStack>
    );
  }

  return (
    <PlaceStack>
      <CardSplit
        compact={compact}
        actions={actions}
        info={
          <PlaceStack>
            <LocationIdentity
              category={sel.category}
              title={sel.name}
              showFinds={!faction || raidingHere}
              meta={
                <>
                  {siteStatus && <div>{siteStatus}</div>}
                </>
              }
            />
            {(sel.isMrtStation || faction) && (
              <div className="flex flex-col gap-2">
                <StationCodes sel={sel} />
                {faction && <FactionClaim sel={sel} faction={faction} compact={compact || inspector} />}
              </div>
            )}
            <Ledger>
              {dangerRow}
              {siteRows}
            </Ledger>
            <div id={detailsId} hidden={!showDetails} className="text-body text-concrete-400">
              <p>{poiLabel} · {t(`ui.location.size.${sel.size}`)}</p>
              <p className="mt-1">{t(`ui.location.blurb.${sel.category}`)}</p>
            </div>
            {detailToggle}
          </PlaceStack>
        }
      />
      {/* Route planner is the primary way into long-range tunnel travel. */}
      {onPlanTunnels && sel.isMrtStation && <PlanTunnelsButton onPlan={onPlanTunnels} />}
    </PlaceStack>
  );
}
