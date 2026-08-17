import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { GameMap } from '../components/GameMap';
import { TargetDock } from '../components/TargetDock';
import { useMrtNetwork } from '../components/MrtOverlay';
import {
  displayLine,
  mrtRouteBetween,
  tunnelSegmentBetween,
  type MrtNetwork,
} from '../game/mrt';
import { ConditionPanel } from '../components/ConditionPanel';
import { StatsPanel } from '../components/StatsPanel';
import { LogPanel } from '../components/LogPanel';
import { CombatPanel } from '../components/CombatPanel';
import { PhoneStatusBar } from '../components/PhoneStatusBar';
import { MapHereChrome } from '../components/MapHereChrome';
import { MapInterruptCard } from '../components/MapInterruptCard';
import { PendingEventCardBody } from '../components/PendingEventChoices';
import { EncounterPrompt } from '../components/EncounterPrompt';
import { SearchSessionNode } from '../components/SearchSessionNode';
import { Icon } from '../icons/Icon';
import { LocationCard } from '../components/LocationCard';
import { TrekCard } from '../components/TrekCard';
import { InventoryPanel } from '../components/Inventory/InventoryPanel';
import { InventoryInteractionProvider } from '../components/Inventory/InventoryInteractionContext';
import { CraftingPanel } from '../components/CraftingPanel';
import { StashLogbook } from '../components/StashLogbook';
import { SettingsModal } from '../components/SettingsModal';
import { DigitalClock } from '../components/DigitalClock';
import { WeatherBadge } from '../components/WeatherBadge';
import { SleepQualityIndicator } from '../components/SleepQualityIndicator';
import { ObjectiveBar } from '../components/ObjectiveBar';
import { ObjectivesPanel } from '../components/ObjectivesPanel';
import { DayLogsModal } from '../components/DayLogsModal';
import { GuideModal } from '../components/GuideModal';
import { HowToPlayModal } from '../components/HowToPlayModal';
import { HdbDungeonModal } from '../components/HdbDungeonModal';
import { HdbContextPanel } from '../components/HdbContextPanel';
import { TraderModal } from '../components/TraderModal';
import { MrtRoutePlanner } from '../components/MrtRoutePlanner';
import { TunnelRunView } from '../components/TunnelRunView';
import type { GuideTopic } from '../content/guideContent';
import { useSetting } from '../game/settings';
import { itemDef } from '../game/loot';
import { estimateExpedition, withVegetationTravel } from '../game/travel';
import { unplayableMessage, walkabilityOf } from '../game/playable';
import { routeLandPath } from '../game/route';
import { vegetationCost } from '../game/vegetation';
import {
  bleedEncounterMod,
  computeEvacBonus,
  computeScore,
  legTravelFactor,
  scoreDayMult,
} from '../game/survival';
import {
  equipEncounterChanceMod,
  equipTravelSpeedFactor,
  isEncumbered,
  totalLootValue,
} from '../game/inventory';
import { haversine } from '../game/overpass';
import { rollWeather, timeOfDay, weatherEncounterMod } from '../game/weather';
import { awareness, blipMargin, travelableRange } from '../game/fog';
import { equipAwarenessMod, sumTraitMod, traitAwarenessMod } from '../game/character';
import {
  EVAC_SCORE_BONUS,
  evacReadiness,
  hordeIntensity,
  hordeLabel,
} from '../game/goal';
import { Rng } from '../game/rng';
import {
  hazardsOnPath,
  hazardsAtPoint,
  sensedHazardField,
  trekRisk,
  HAZARD_CONFIG,
  TREK_MIN_DISTANCE_M,
} from '../game/wilds';
import type { LocationState } from '../game/types';
import type { IconName } from '../icons/keys';

type MobileView = 'map' | 'hub' | 'log';
type PhoneTab = MobileView | 'inventory' | 'craft';

const PHONE_MQ = '(max-width: 1023px)';

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_MQ).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
    const update = () => setPhone(mq.matches || window.innerWidth < 1024);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}

function HereHazardLine({
  seed,
  lat,
  lng,
  spawn,
  pressure,
  band,
  day,
}: {
  seed: string;
  lat: number;
  lng: number;
  spawn: { lat: number; lng: number } | undefined;
  pressure: number;
  band: ReturnType<typeof timeOfDay>;
  day: number;
}) {
  const underfoot = hazardsAtPoint(seed, lat, lng, spawn, pressure, { band, day });
  if (underfoot.length === 0) return null;
  const worst = underfoot.reduce((a, z) => (z.severity > a.severity ? z : a));
  const cfg = HAZARD_CONFIG[worst.kind];
  return (
    <div className="mt-2 text-xs" style={{ color: cfg.color }}>
      {cfg.blurb} Do not sleep here.
    </div>
  );
}

/**
 * Which body the slide-out panel is showing. null = closed. Everything that
 * wants more room than the rail can give lands here, objectives included —
 * there is exactly one place detail opens.
 */
type SidePanel = 'inventory' | 'craft' | 'logbook' | 'stats' | 'objective';

const SIDE_PANELS: Record<SidePanel, { label: string; icon: IconName }> = {
  inventory: { label: 'Stash', icon: 'action.inventory' },
  craft: { label: 'Craft', icon: 'action.craft' },
  logbook: { label: 'Logbook', icon: 'action.logbook' },
  stats: { label: 'Stats', icon: 'action.stats' },
  objective: { label: 'Objectives', icon: 'action.objectives' },
};

/** Rail switchers — objectives opens from its own bar. */
const PANEL_BUTTONS: SidePanel[] = ['inventory', 'craft', 'logbook', 'stats'];

/**
 * Orientation when a visible station isn't adjacent: how far it is, and that
 * the planner can still route around collapsed bores.
 */
function tunnelDirections(
  net: MrtNetwork,
  here: LocationState,
  sel: LocationState,
  destroyed: string[],
): string {
  const route = mrtRouteBetween(here, sel, destroyed);
  if (!route) {
    return `${sel.name} has no intact tunnel path from here — collapsed bores block every route. Plan travel to try another way, or walk the surface.`;
  }
  const where = `${route.stops} stops via the ${displayLine(net, route.legs[0].line).name}`;
  return `${sel.name} is ${where}. Open tunnel planning to crawl the whole route in one run.`;
}

export function GameScreen() {
  // Subscribing to the whole store meant every write re-rendered this screen —
  // including the log, which grows on almost every action and which nothing
  // here reads. Naming the slice keeps re-renders to changes that matter.
  const {
    spawn,
    locations,
    currentPos,
    currentPositionId,
    worldLoading,
    worldError,
    travelAnim,
    pendingEvent,
    combat,
    pendingSearch,
    hdb,
    hdbEnter,
    ghostOffer,
    acceptGhostTrade,
    declineGhostTrade,
    noisePulses,
    hordeLevel,
    evacZoneId,
    evacDeadline,
    evacCooldownUntil,
    evacDemand,
    evacDemandBias,
    callEvac,
    travel,
    enter,
    trek,
    tunnelEnterRoute,
    tunnel,
    destroyedTunnelEdges,
    rest,
    peekRestPreview,
    notify,
    meters,
    character,
    hour,
    day,
    seed,
    items,
    equipment,
    bodyParts,
    exploredArea,
    kills,
  } = useGame(
    useShallow((s) => ({
      spawn: s.spawn,
      locations: s.locations,
      currentPos: s.currentPos,
      currentPositionId: s.currentPositionId,
      worldLoading: s.worldLoading,
      worldError: s.worldError,
      travelAnim: s.travelAnim,
      pendingEvent: s.pendingEvent,
      combat: s.combat,
      pendingSearch: s.pendingSearch,
      hdb: s.hdb,
      hdbEnter: s.hdbEnter,
      ghostOffer: s.ghostOffer,
      acceptGhostTrade: s.acceptGhostTrade,
      declineGhostTrade: s.declineGhostTrade,
      noisePulses: s.noisePulses,
      hordeLevel: s.hordeLevel,
      evacZoneId: s.evacZoneId,
      evacDeadline: s.evacDeadline,
      evacCooldownUntil: s.evacCooldownUntil,
      evacDemand: s.evacDemand,
      evacDemandBias: s.evacDemandBias,
      callEvac: s.callEvac,
      travel: s.travel,
      enter: s.enter,
      trek: s.trek,
      tunnelEnterRoute: s.tunnelEnterRoute,
      tunnel: s.tunnel,
      destroyedTunnelEdges: s.destroyedTunnelEdges,
      rest: s.rest,
      peekRestPreview: s.peekRestPreview,
      notify: s.notify,
      meters: s.meters,
      character: s.character,
      hour: s.hour,
      day: s.day,
      seed: s.seed,
      items: s.items,
      equipment: s.equipment,
      bodyParts: s.bodyParts,
      exploredArea: s.exploredArea,
      kills: s.kills,
    })),
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A spot on bare map the player is considering walking to. Mutually exclusive
  // with a selected POI — you're deciding about one thing at a time.
  const [trekTarget, setTrekTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [hereSheetOpen, setHereSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dayLogsOpen, setDayLogsOpen] = useState(false);
  const [guideTopic, setGuideTopic] = useState<GuideTopic | null>(null);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const showGuideOnStart = useSetting('showGuideOnStart');

  useEffect(() => {
    if (showGuideOnStart !== 'on') return;
    setHowToPlayOpen(true);
    // Only auto-open once per GameScreen mount (entering / continuing a run).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-once
  }, []);
  const [mrtPlanner, setMrtPlanner] = useState<{
    fromStationId: string;
    toStationId?: string | null;
  } | null>(null);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number; token: number } | null>(
    null,
  );

  const inventoryOpenToken = useGame((s) => s.inventoryOpenToken);
  const traderOpen = useGame((s) => !!s.trader);

  const sleepPreview = useMemo(
    () => peekRestPreview(),
    // Recompute when site, clock, horde, or pack contents that affect sleep gear change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- peek reads live store
    [peekRestPreview, currentPositionId, hdb, items, hour, day, hordeLevel, currentPos.lat, currentPos.lng],
  );

  const goToPhoneTab = useCallback((tab: PhoneTab) => {
    setHereSheetOpen(false);
    if (tab === 'inventory' || tab === 'craft') {
      setSidePanel(tab);
      return;
    }
    setSidePanel(null);
    setMobileView(tab);
  }, []);

  const focusStashOnMap = useCallback((lat: number, lng: number) => {
    setMapFocus((prev) => ({ lat, lng, token: (prev?.token ?? 0) + 1 }));
    goToPhoneTab('map');
  }, [goToPhoneTab]);

  useEffect(() => {
    if (inventoryOpenToken > 0) setSidePanel('inventory');
  }, [inventoryOpenToken]);

  const isPhone = useIsPhone();

  // Escape closes the slide-out unless a higher modal owns the screen.
  useEffect(() => {
    if (!sidePanel) return;
    if (
      settingsOpen ||
      dayLogsOpen ||
      guideTopic ||
      howToPlayOpen ||
      traderOpen ||
      ghostOffer ||
      hereSheetOpen
    )
      return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setSidePanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    sidePanel,
    settingsOpen,
    dayLogsOpen,
    guideTopic,
    howToPlayOpen,
    traderOpen,
    ghostOffer,
    hereSheetOpen,
  ]);

  // A new interruption opens on Map once. After that the player can leave —
  // CombatPanel / search stay mounted (CSS-hidden) so ticks keep running.
  const phoneInterruptId =
    !isPhone || hdb || tunnel
      ? null
      : pendingEvent
        ? `event:${pendingEvent.locationId}`
        : pendingSearch
          ? `search:${pendingSearch.nonce}`
          : combat
            ? `combat:${combat.awaitingStance ? 'contact' : 'fight'}`
            : null;
  const seenInterruptId = useRef<string | null>(null);
  useEffect(() => {
    if (phoneInterruptId === seenInterruptId.current) return;
    seenInterruptId.current = phoneInterruptId;
    if (!phoneInterruptId) return;
    goToPhoneTab('map');
  }, [phoneInterruptId, goToPhoneTab]);

  // Entering a block / tunnel / planner lands on Map; the player can tab away.
  // Depend on presence, not the run object — each crawl step replaces `tunnel`
  // and must not yank the Log tab closed.
  const inBlock = !!hdb;
  const inTunnel = !!tunnel;
  useEffect(() => {
    if (!(inBlock || inTunnel || mrtPlanner)) return;
    setMobileView('map');
    setSidePanel(null);
  }, [inBlock, inTunnel, mrtPlanner]);

  // Close the here sheet when you leave the site or enter a block / tunnel.
  useEffect(() => {
    setHereSheetOpen(false);
  }, [currentPositionId, hdb, tunnel]);

  // The map is memoised, so everything handed to it has to hold its identity
  // across renders it doesn't care about — otherwise it rebuilds every marker.
  const pickGround = useCallback((lat: number, lng: number) => {
    const reason = walkabilityOf(lat, lng);
    if (reason !== 'ok') {
      notify(unplayableMessage(reason, 'trek'), 'bad');
      return;
    }
    setSelectedId(null);
    setTrekTarget({ lat, lng });
  }, [notify]);

  const selectPoi = useCallback((loc: LocationState) => {
    setTrekTarget(null);
    setSelectedId(loc.id);
  }, []);

  const exhausted = meters.energy < 25;
  const infected = meters.infection >= 35;
  const mapVitals = useMemo(() => ({ exhausted, infected }), [exhausted, infected]);

  const locationList = useMemo(() => Object.values(locations), [locations]);

  // ---- derived state -----------------------------------------------------
  // Everything below is recomputed from the store, not stored, and some of it
  // isn't cheap. It's memoised so that a purely local change — opening a panel,
  // switching mobile tabs — doesn't re-derive the weather, the walkable range
  // and the whole hazard field for nothing.
  const sel = selectedId ? locations[selectedId] ?? null : null;

  // Whatever the target card is about — a POI you're considering, or a patch of
  // open ground. Standing somewhere doesn't count: that's the "here" card, and
  // it has its own home at the foot of the timeline. Split into plain numbers so
  // the memo below keeps its identity across the store churn `locations` sees,
  // which the memoised map depends on.
  const anchorLat = trekTarget ? trekTarget.lat : sel && sel.id !== currentPositionId ? sel.lat : null;
  const anchorLng = trekTarget ? trekTarget.lng : sel && sel.id !== currentPositionId ? sel.lng : null;
  const bubbleAnchor = useMemo(
    () => (anchorLat === null || anchorLng === null ? null : { lat: anchorLat, lng: anchorLng }),
    [anchorLat, anchorLng],
  );

  // Land-aware walk path for the selected target (or the active glide). Computed
  // only when endpoints change — never per frame. Null route ⇒ no dry path.
  const previewRoute = useMemo(() => {
    if (travelAnim && travelAnim.path.length >= 2) {
      return {
        points: travelAnim.path,
        lengthM: Math.round(
          travelAnim.path.reduce(
            (sum, p, i) =>
              i === 0
                ? 0
                : sum +
                  haversine(
                    travelAnim.path[i - 1].lat,
                    travelAnim.path[i - 1].lng,
                    p.lat,
                    p.lng,
                  ),
            0,
          ),
        ),
        blocked: false,
      };
    }
    if (!bubbleAnchor) return null;
    const from = { lat: currentPos.lat, lng: currentPos.lng };
    const routed = routeLandPath(from, bubbleAnchor);
    if (routed) return { points: routed.points, lengthM: routed.lengthM, blocked: false };
    return {
      points: [from, bubbleAnchor],
      lengthM: Math.round(
        haversine(from.lat, from.lng, bubbleAnchor.lat, bubbleAnchor.lng),
      ),
      blocked: true,
    };
  }, [travelAnim, bubbleAnchor, currentPos.lat, currentPos.lng]);

  const travelPath = previewRoute?.points ?? null;
  const travelPathBlocked = previewRoute?.blocked ?? false;

  const weather = useMemo(() => rollWeather(new Rng(seed), day), [seed, day]);
  const time = timeOfDay(hour);
  const encumbered = useMemo(
    () => (character ? isEncumbered(items, character.attributes, equipment) : false),
    [character, items, equipment],
  );

  const legFactor =
    legTravelFactor(bodyParts) *
    equipTravelSpeedFactor(equipment) *
    (1 + sumTraitMod(character?.traitIds ?? [], 'travelSpeedMod'));
  const travelRange = useMemo(
    () =>
      character
        ? travelableRange(character.attributes, meters.energy, legFactor, weather, encumbered)
        : 400,
    [character, meters.energy, legFactor, weather, encumbered],
  );
  // Fog + planning ring: hold setout range for the whole glide, then ease to
  // the post-trip range on arrival (energy already spent at departure).
  const mapRangeTarget = travelAnim ? travelAnim.departRange : travelRange;
  const mapTravelRange = useAnimatedNumber(mapRangeTarget, 600);

  const awarenessValue = character
    ? awareness(
        character.attributes.perception,
        equipAwarenessMod(equipment),
        traitAwarenessMod(character.traitIds),
      )
    : 0;
  const blipRange = travelRange + blipMargin(awarenessValue);
  const mapBlipRange = mapTravelRange + blipMargin(awarenessValue);

  // Hazards densify as the horde climbs — early map is sparse, late map contested.
  const hazardPressure = hordeIntensity(hordeLevel);
  const sensedHazards = useMemo(
    () =>
      sensedHazardField(
        seed,
        currentPos.lat,
        currentPos.lng,
        blipRange,
        spawn ?? undefined,
        hazardPressure,
        time,
        day,
      ),
    [seed, currentPos.lat, currentPos.lng, blipRange, spawn, hazardPressure, time, day],
  );

  const trekDist = trekTarget
    ? previewRoute && !previewRoute.blocked
      ? previewRoute.lengthM
      : Math.round(haversine(currentPos.lat, currentPos.lng, trekTarget.lat, trekTarget.lng))
    : 0;

  const est = useMemo(
    () => {
      if (!sel || !character) return null;
      const via =
        previewRoute && !previewRoute.blocked && sel.id !== currentPositionId
          ? previewRoute.points
          : undefined;
      const dist =
        via && via.length >= 2
          ? previewRoute!.lengthM
          : Math.round(haversine(currentPos.lat, currentPos.lng, sel.lat, sel.lng));
      const base = estimateExpedition(
        dist,
        sel.category,
        character.attributes,
        meters.energy,
        hour,
        weather,
        encumbered,
        legFactor,
      );
      const veg = vegetationCost(currentPos, { lat: sel.lat, lng: sel.lng }, via);
      return withVegetationTravel(base, veg.travelMult, hour);
    },
    [
      sel,
      character,
      currentPos,
      currentPositionId,
      previewRoute,
      meters.energy,
      hour,
      weather,
      encumbered,
      legFactor,
    ],
  );

  const trekEst = useMemo(
    () => {
      if (!trekTarget || !character) return null;
      const via =
        previewRoute && !previewRoute.blocked && previewRoute.points.length >= 2
          ? previewRoute.points
          : undefined;
      const base = estimateExpedition(
        trekDist,
        'fuel', // only the travel leg is used — there's nothing out there to search
        character.attributes,
        meters.energy,
        hour,
        weather,
        encumbered,
        legFactor,
      );
      const veg = vegetationCost(currentPos, trekTarget, via);
      return {
        ...withVegetationTravel(base, veg.travelMult, hour),
        vegetationEnergy: veg.energyCost,
      };
    },
    [
      trekTarget,
      character,
      trekDist,
      meters.energy,
      hour,
      weather,
      encumbered,
      legFactor,
      currentPos,
      previewRoute,
    ],
  );

  const trekInfo = useMemo(() => {
    if (!trekTarget || !character) return null;
    const via =
      previewRoute && !previewRoute.blocked && previewRoute.points.length >= 2
        ? previewRoute.points
        : undefined;
    const sensedIds = new Set(sensedHazards.map((z) => z.id));
    const onPath = hazardsOnPath(
      seed,
      currentPos,
      trekTarget,
      spawn ?? undefined,
      hazardPressure,
      via,
      { band: time, day },
    );
    const known = onPath.filter((z) => sensedIds.has(z.id));
    return {
      risk: trekRisk(
        seed,
        currentPos,
        trekTarget,
        {
          band: time,
          hordeIntensity: hordeIntensity(hordeLevel),
          weatherEncounterMod: weatherEncounterMod(weather),
          traitEncounterMod:
            sumTraitMod(character.traitIds, 'encounterChanceMod') +
            equipEncounterChanceMod(equipment) +
            bleedEncounterMod(bodyParts),
          safe: spawn ?? undefined,
          day,
        },
        known,
        via,
      ),
      blind: trekDist > blipRange,
    };
  }, [
    trekTarget,
    character,
    sensedHazards,
    seed,
    currentPos,
    spawn,
    time,
    hordeLevel,
    weather,
    trekDist,
    blipRange,
    bodyParts,
    equipment,
    hazardPressure,
    previewRoute,
    day,
  ]);

  const poiRouteInfo = useMemo(() => {
    if (!sel || sel.id === currentPositionId || !character) return null;
    const via =
      previewRoute && !previewRoute.blocked && previewRoute.points.length >= 2
        ? previewRoute.points
        : undefined;
    const sensedIds = new Set(sensedHazards.map((z) => z.id));
    const onPath = hazardsOnPath(
      seed,
      currentPos,
      { lat: sel.lat, lng: sel.lng },
      spawn ?? undefined,
      hazardPressure,
      via,
      { band: time, day },
    );
    const known = onPath.filter((z) => sensedIds.has(z.id));
    const dist =
      via && previewRoute && !previewRoute.blocked
        ? previewRoute.lengthM
        : Math.round(haversine(currentPos.lat, currentPos.lng, sel.lat, sel.lng));
    return {
      risk: trekRisk(
        seed,
        currentPos,
        { lat: sel.lat, lng: sel.lng },
        {
          band: time,
          hordeIntensity: hordeIntensity(hordeLevel),
          weatherEncounterMod: weatherEncounterMod(weather),
          traitEncounterMod:
            sumTraitMod(character.traitIds, 'encounterChanceMod') +
            equipEncounterChanceMod(equipment) +
            bleedEncounterMod(bodyParts),
          safe: spawn ?? undefined,
          day,
        },
        known,
        via,
      ),
      blind: dist > blipRange,
    };
  }, [
    sel,
    character,
    sensedHazards,
    seed,
    currentPos,
    spawn,
    hazardPressure,
    previewRoute,
    time,
    day,
    hordeLevel,
    weather,
    equipment,
    bodyParts,
    blipRange,
    currentPositionId,
  ]);

  // Held only so the ride card re-renders once the network arrives; the routing
  // itself reads the same cached copy through mrtRouteBetween.
  const mrtNet = useMrtNetwork();

  if (!spawn) return null;

  const selHere = sel ? sel.id === currentPositionId : false;

  const here = currentPositionId ? locations[currentPositionId] : null;
  // Adjacent intact segment still deep-links the planner with a destination.
  const bothStations = !!(
    sel &&
    sel.isMrtStation &&
    sel.id !== currentPositionId &&
    here?.isMrtStation
  );
  const tunnelSeg =
    bothStations && here && sel
      ? tunnelSegmentBetween(here, sel, destroyedTunnelEdges)
      : null;

  const tunnelHint =
    bothStations && !tunnelSeg && mrtNet && here?.mrtStationId && sel
      ? tunnelDirections(mrtNet, here, sel, destroyedTunnelEdges)
      : null;

  const openStash = () => goToPhoneTab('inventory');

  const openPlanner = (toStationId?: string | null) => {
    if (!here?.mrtStationId) return;
    goToPhoneTab('map');
    setMrtPlanner({ fromStationId: here.mrtStationId, toStationId: toStationId ?? null });
  };

  const selDist =
    sel && previewRoute && !previewRoute.blocked && sel.id !== currentPositionId
      ? previewRoute.lengthM
      : sel
        ? Math.round(haversine(currentPos.lat, currentPos.lng, sel.lat, sel.lng))
        : 0;
  const selOutOfRange = !!sel && !selHere && selDist > travelRange;
  const selNoDryRoute = !!sel && !selHere && !!previewRoute?.blocked;

  const cardProps = sel && {
    sel,
    here: selHere,
    est,
    energyLow: meters.energy < 5,
    outOfRange: selOutOfRange,
    noDryRoute: selNoDryRoute,
    canTunnel: !!tunnelSeg,
    tunnelSeg,
    tunnelHint,
    onTravel: () => travel(sel.id),
    onEnter: enter,
    onTunnel: () => sel.mrtStationId && openPlanner(sel.mrtStationId),
    onOpenStash: openStash,
    routeRisk: poiRouteInfo?.risk ?? null,
    routeBlind: poiRouteInfo?.blind,
  };

  // Persistent "you are here" card — always available once you've reached a
  // location, independent of whatever you're inspecting/planning to travel to.
  const hereProps = here && {
    sel: here,
    here: true,
    est: null,
    energyLow: meters.energy < 5,
    canTunnel: false,
    onPlanTunnels: here.isMrtStation ? () => openPlanner() : undefined,
    onTravel: () => travel(here.id),
    onEnter: enter,
    onTunnel: () => {},
    onOpenStash: openStash,
    onEnterBlock: hdbEnter,
  };

  // extraction goal + doom clock + dual-path score
  const evacZone = evacZoneId ? locations[evacZoneId] : null;
  const atEvac = !!evacZoneId && currentPositionId === evacZoneId;
  const readiness = evacReadiness(
    items,
    day,
    evacDemand,
    evacDemandBias ?? 'balanced',
    `${seed}::evac-vibe:${day}`,
  );
  const dayMult = scoreDayMult(day);
  const projectedScore = computeScore(day, kills, Math.round(totalLootValue(items)));
  const projectedEvacBonus = computeEvacBonus(day, EVAC_SCORE_BONUS);
  const evacDist = evacZone
    ? Math.round(haversine(currentPos.lat, currentPos.lng, evacZone.lat, evacZone.lng))
    : 0;
  const doom = hordeLevel;
  const doomColor = doom >= 75 ? '#d92d2d' : doom >= 50 ? '#d9683d' : '#e8e5dd';

  // evac window countdown (in-game hours remaining)
  const nowHours = (day - 1) * 24 + hour;
  const evacHoursLeft = evacDeadline != null ? Math.max(0, evacDeadline - nowHours) : null;
  const fmtWindow = (h: number) => {
    if (h <= 0) return 'departing…';
    const d = Math.floor(h / 24);
    const hr = Math.ceil(h % 24);
    return d > 0 ? `${d}d ${hr}h` : `${hr}h`;
  };
  const evacUrgent = evacHoursLeft != null && evacHoursLeft <= 8;
  const windowText = evacHoursLeft != null ? fmtWindow(evacHoursLeft) : null;
  const evacCooldownHours =
    evacCooldownUntil != null ? Math.max(0, Math.ceil(evacCooldownUntil - nowHours)) : null;

  // ---- the two location slots, shared between the desktop rail and the
  // mobile floating dock so the markup only exists once -------------------
  // A fight owns the moment — nothing to decide about crossing until it's over.
  const targetSlot: { title: ReactNode; body: ReactNode; onClose?: () => void } | null =
    trekTarget && trekInfo && trekEst && !combat
      ? {
          title: travelAnim ? (
            <><Icon name="action.travel" /> En route</>
          ) : (
            <><Icon name="action.target" /> Open ground</>
          ),
          body: (
            <TrekCard
              distanceM={trekDist}
              travelMin={trekEst.travelMin}
              risk={trekInfo.risk}
              blind={trekInfo.blind}
              energyLow={meters.energy < 5}
              outOfRange={trekDist > travelRange}
              tooClose={trekDist < TREK_MIN_DISTANCE_M}
              noDryRoute={!!previewRoute?.blocked}
              arrivalAtNight={trekEst.arrivalAtNight}
              vegetationSlowed={trekEst.vegetationSlowed}
              vegetationEnergy={trekEst.vegetationEnergy}
              onTrek={() => {
                trek(trekTarget.lat, trekTarget.lng);
                setTrekTarget(null);
              }}
            />
          ),
          onClose: () => setTrekTarget(null),
        }
      : cardProps && !selHere
        ? {
            title: travelAnim ? (
              <><Icon name="action.travel" /> En route</>
            ) : (
              <><Icon name="action.target" /> Target</>
            ),
            body: <LocationCard {...cardProps} compact />,
            onClose: () => setSelectedId(null),
          }
        : null;

  const hereSlot: ReactNode = hdb ? (
    <>
      <div className="lg:hidden">
        <HdbContextPanel variant="compact" />
      </div>
      <div className="hidden lg:block">
        <HdbContextPanel variant="full" />
      </div>
    </>
  ) : hereProps ? (
    <>
      <LocationCard {...hereProps} />
      {atEvac && (
        <button
          onClick={callEvac}
          className="mt-2 w-full rounded-lg bg-signal/80 py-2 text-sm font-bold text-black transition hover:bg-signal"
        >
          <Icon name="action.evac" /> Call for evac — pop the flare
        </button>
      )}
    </>
  ) : !worldLoading ? (
    <>
      <div className="text-sm text-white/70">Nowhere in particular.</div>
      <div className="mt-1 text-xs text-white/40">
        No shelter, no stash, nothing to search. Tap a building to head for it, or tap bare ground
        to keep moving. Sleeping out here barely counts as sleep.
      </div>
      <HereHazardLine
        seed={seed}
        lat={currentPos.lat}
        lng={currentPos.lng}
        spawn={spawn ?? undefined}
        pressure={hazardPressure}
        band={time}
        day={day}
      />
    </>
  ) : null;

  const hereTitle: ReactNode = hdb ? (
    <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
      <Icon name="hdb.enterBlock" />
      Inside the block
    </span>
  ) : hereProps ? (
    <><Icon name="action.here" /> You are here</>
  ) : (
    <><Icon name="action.here" /> In the open</>
  );

  // The active mobile tab fills the screen — but only on mobile. Left
  // unprefixed, its `flex-1` also landed on desktop and let whichever column
  // held the active tab grow past its fixed width, which an event did silently
  // by pulling the player to the Timeline. `max-lg:` scopes it to the one
  // breakpoint that wants it, so desktop and mobile can't fight over it at all;
  // countering it at `lg` instead would just be a bet on CSS source order.
  // Desktop three-column layout starts at lg (1024) so tablets keep the tab shell.
  const show = (mobile: boolean) => (mobile ? 'flex max-lg:flex-1 min-h-0' : 'hidden');

  /**
   * Something is standing in front of you and you have not decided what to do
   * about it yet. The store already refuses travel, searching and the rest
   * while a fight is open, but silently — the map still looked live, so the
   * demand read as "a panel appeared" instead of "deal with this now".
   *
   * Everything except the timeline column drops back and stops taking clicks
   * until Fight or Flee is chosen. The moment it is, the world comes back up —
   * Fight hands the column to CombatPanel; Flee resolves the break-away.
   */
  const contactGate = !!combat?.awaitingStance;
  const phoneFight = isPhone && !!combat && !contactGate;
  const phoneOwnsLive =
    isPhone && (!!combat || !!pendingEvent || !!pendingSearch);
  const phoneInterruptKind: 'contact' | 'event' | 'search' | null = contactGate
    ? 'contact'
    : pendingEvent
      ? 'event'
      : pendingSearch
        ? 'search'
        : null;
  /** Idle here/log chrome only while Map tab is showing the world surface. */
  const phoneOnMap = isPhone && mobileView === 'map' && !sidePanel;
  // Desktop contact gate dims the world until Fight/Flee. Phone tabs stay live;
  // the interrupt card is the prompt, and the player can still open Stash/Craft.
  const backgrounded = `transition-all duration-300 ${
    contactGate && !isPhone ? 'pointer-events-none select-none opacity-25 saturate-50' : ''
  }`;

  const shellClass = [
    'relative flex h-full min-h-0 min-w-0 flex-col lg:flex-row',
    phoneFight ? 'phone-fight-open' : '',
    phoneInterruptKind && !phoneFight ? 'phone-interrupt-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <InventoryInteractionProvider>
    <div className={shellClass}>
      <PhoneStatusBar onOpenStatus={() => goToPhoneTab('hub')} />

      {/* Click map / timeline to dismiss any slide-out. Phone: leave the status
          bar and bottom nav clear so vitals stay readable and tabs stay usable. */}
      {sidePanel && (
        <div
          className="absolute inset-x-0 z-[690] max-lg:bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom,0px))] max-lg:top-[var(--mobile-status-bar-h)] lg:inset-0"
          aria-hidden
          onClick={() => setSidePanel(null)}
        />
      )}

      {/* ================= COLUMN 1: the survivor rail =================
           Everything about *you* and the two places that matter right now,
           read top to bottom: the clock, the goal, your body, then the ground
           under your feet.
           On desktop it also stacks above the slide-out so that panel tucks in
           behind it — opaque, so nothing shows through mid-slide. On mobile the
           slide-out covers the whole screen, so the rail stays below it. */}
      <aside
        className={`relative flex-col border-white/10 bg-concrete-900/70 lg:z-[750] lg:flex lg:h-full lg:w-[340px] lg:shrink-0 lg:border-r lg:bg-concrete-900 ${
          mobileView === 'hub' ? show(true) : 'hidden'
        } lg:flex ${backgrounded}`}
      >
        {/* --- time, day, weather, rest --- */}
        <div className="shrink-0 space-y-2 border-b border-white/10 p-2.5">
          <DigitalClock day={day} hour={hour} band={time} />
          <div className="flex items-center justify-between gap-2">
            <WeatherBadge weather={weather} />
            <div className="flex shrink-0 items-center gap-2">
              <SleepQualityIndicator preview={sleepPreview} />
              <button
                onClick={rest}
                className="rounded border border-white/15 px-2.5 py-1 text-xs transition hover:bg-white/5"
                title={sleepPreview.conditions.summary}
              >
                <Icon name="action.sleep" /> Rest
              </button>
            </div>
          </div>
        </div>

        {/* --- who you are and what you're for: scrolls if the rail is short --- */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          <div className="space-y-2.5">
            <ObjectiveBar
              evacZoneName={evacZone?.name ?? null}
              evacDist={evacDist}
              atEvac={atEvac}
              windowText={windowText}
              evacCooldownHours={evacCooldownHours}
              urgent={evacUrgent}
              doom={doom}
              doomColor={doomColor}
              doomLabel={hordeLabel(doom)}
              dayMult={dayMult}
              vibe={readiness.vibe}
              vibeLine={readiness.vibeLine}
              onOpen={() => setSidePanel((p) => (p === 'objective' ? null : 'objective'))}
            />

            <ConditionPanel
              onOpenGuide={setGuideTopic}
              showSurvivorStats={isPhone}
            />

            {/* Desktop: backpack stays on the rail so the pack is always visible. */}
            {!isPhone && <InventoryPanel layout="backpack" />}

            {/* --- the panel switchers --- */}
            <div className="grid grid-cols-2 gap-1.5">
              {(isPhone
                ? PANEL_BUTTONS.filter((id) => id === 'logbook' || id === 'stats')
                : PANEL_BUTTONS
              ).map((id) => {
                const active = sidePanel === id;
                return (
                  <button
                    key={id}
                    onClick={() => setSidePanel(active ? null : id)}
                    className={`rounded border py-1.5 text-xs transition ${
                      active
                        ? 'border-signal bg-signal/15 text-signal'
                        : 'border-white/15 text-white/70 hover:bg-white/5'
                    }`}
                  >
                    <Icon name={SIDE_PANELS[id].icon} /> {SIDE_PANELS[id].label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* The two location slots used to be pinned here. They've moved to where
            they're actually about: the target floats over the marker it
            describes, and "here" sits at the foot of the timeline. */}
      </aside>

      {/* ================= COLUMN 2: the slide-out =================
           Toggled from the rail's panel buttons, closable from its own header.
           It overlays the map rather than squeezing it, so the map never
           reflows when you check your pack.
           Phone: sits between the status bar and bottom nav so meters stay
           visible while you eat/drink from inventory. */}
      {/* Closed, it parks fully off the left edge — on lg that means clearing its
          own 360px plus the 340px rail it is offset by, so it slides out from
          behind the rail instead of fading in on top of it. */}
      <div
        className={`absolute left-0 z-[700] w-full transition-transform duration-200 ease-out max-lg:bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom,0px))] max-lg:top-[var(--mobile-status-bar-h)] lg:inset-y-0 lg:left-[340px] lg:w-[360px] ${
          sidePanel
            ? 'translate-x-0'
            : 'pointer-events-none -translate-x-full lg:-translate-x-[700px]'
        } ${backgrounded}`}
      >
        <div className="flex h-full flex-col border-r border-white/15 bg-concrete-900 shadow-signage">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-3">
            <h3 className="text-sm font-bold text-signal">
              {sidePanel && (
                <>
                  <Icon name={SIDE_PANELS[sidePanel].icon} /> {SIDE_PANELS[sidePanel].label}
                </>
              )}
            </h3>
            <button
              onClick={() => setSidePanel(null)}
              className="text-xs text-white/40 hover:text-white/70"
            >
              ✕ close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {sidePanel === 'inventory' && (
              <InventoryPanel layout={isPhone ? 'full' : 'equipStash'} />
            )}
            {sidePanel === 'craft' && <CraftingPanel />}
            {sidePanel === 'logbook' && <StashLogbook onFocusLocation={focusStashOnMap} />}
            {sidePanel === 'stats' && <StatsPanel />}
            {sidePanel === 'objective' && (
              <ObjectivesPanel
                evacZoneName={evacZone?.name ?? null}
                evacDist={evacDist}
                atEvac={atEvac}
                vibe={readiness.vibe}
                vibeLine={readiness.vibeLine}
                dayMult={dayMult}
                projectedScore={projectedScore}
                projectedEvacBonus={projectedEvacBonus}
                windowText={windowText}
                urgent={evacUrgent}
                doom={doom}
                doomColor={doomColor}
                doomLabel={hordeLabel(doom)}
                onEvac={callEvac}
                onOpenGuide={setGuideTopic}
              />
            )}
          </div>
        </div>
      </div>

      {/* ================= COLUMN 3: map — or the HDB block / the tunnel, each
           of which takes the whole view for the duration =================
           Phone: only while Map is the active tab. Status / Log fully replace
           this column — do not keep HDB/tunnel mounted beside them. */}
      <div
        className={`relative min-h-0 min-w-0 overflow-hidden lg:flex lg:flex-1 ${
          mobileView === 'map' ? show(true) : 'hidden'
        } lg:flex ${phoneFight ? '' : backgrounded}`}
      >
        {/* Phone active fight: CombatPanel owns the Map tab (no map peek). */}
        {phoneFight && (
          <div className="flex h-full min-h-0 flex-1 flex-col p-2 lg:hidden">
            <CombatPanel />
          </div>
        )}
        <div
          className={
            phoneFight
              ? 'relative hidden h-full min-h-0 min-w-0 flex-1 lg:flex'
              : 'relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden'
          }
        >
          {tunnel ? (
            <TunnelRunView />
          ) : hdb ? (
            <HdbDungeonModal onOpenGuide={setGuideTopic} />
          ) : mrtPlanner ? (
            <MrtRoutePlanner
              fromStationId={mrtPlanner.fromStationId}
              initialToStationId={mrtPlanner.toStationId}
              onClose={() => setMrtPlanner(null)}
              onConfirm={(stationIds) => {
                setMrtPlanner(null);
                tunnelEnterRoute(stationIds);
              }}
            />
          ) : (
            <>
              <GameMap
                home={currentPos}
                pois={locationList}
                selectedId={sel?.id ?? null}
                hereId={currentPositionId}
                travelRange={mapTravelRange}
                blipRange={mapBlipRange}
                exploredArea={exploredArea}
                travelAnim={travelAnim}
                evacZoneId={evacZoneId}
                noisePulses={noisePulses}
                vitals={mapVitals}
                hazards={sensedHazards}
                pathHazardIds={
                  (trekInfo?.risk.hazards ?? poiRouteInfo?.risk.hazards ?? []).map((z) => z.id)
                }
                weather={weather}
                time={time}
                trekTarget={trekTarget}
                travelPath={travelPath}
                travelPathBlocked={travelPathBlocked}
                focusTarget={mapFocus}
                onSelect={selectPoi}
                onPickGround={pickGround}
              />
              {/* Docked bottom-right so the travel line into the target stays visible. */}
              {targetSlot && (
                <TargetDock title={targetSlot.title} onClose={targetSlot.onClose}>
                  {targetSlot.body}
                </TargetDock>
              )}
              {worldLoading && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/70">
                  <p className="animate-pulse text-white/70">Loading the neighbourhood…</p>
                </div>
              )}
              {worldError && (
                <div className="absolute bottom-2 left-2 z-[500] max-w-xs rounded bg-black/85 px-3 py-1.5 text-xs text-concrete-50">
                  {worldError}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ================= COLUMN 4: timeline — or the encounter panel, which
           takes the column over for the duration of a fight ================= */}
      <aside
        className={`min-w-0 overflow-hidden border-white/10 bg-concrete-900/70 p-3 max-lg:flex-col lg:flex lg:w-[35vw] lg:min-w-[320px] lg:shrink-0 lg:border-l lg:p-2.5 ${
          mobileView === 'log' ? show(true) : 'hidden'
        } lg:flex lg:flex-col transition-all duration-300 ${
          contactGate && !isPhone
            ? // Desktop: the one lit thing on the screen while the decision is open.
              'relative z-[760] ring-2 ring-inset ring-hiss shadow-[0_0_60px_-5px_rgba(217,45,45,0.55)]'
            : combat && !isPhone
              ? 'ring-1 ring-inset ring-hiss/50'
              : ''
        }`}
      >
        {/* Desktop: fight replaces the timeline once Fight is chosen.
             Phone: Map owns CombatPanel — Log stays history + settings. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {combat && !contactGate && !isPhone ? (
            <CombatPanel />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <LogPanel
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenDayLogs={() => setDayLogsOpen(true)}
                onFocusMap={focusStashOnMap}
                onOpenGuide={setGuideTopic}
                liveNodes={phoneOwnsLive ? 'map' : 'timeline'}
              />
            </div>
          )}
        </div>

        {/* --- the ground under your feet: pinned to the bottom of the column,
             always in the same place however long the timeline gets. Capped at
             two fifths with its own scroll — a fat location card can't eat the
             timeline. --- */}
        {/* This sits in the same column as the encounter card, so the dimming
             applied to the other columns never reached it — leaving searching,
             stashing and departing live with something standing in front of
             you. It is the one surface the lockout has to cover by hand. */}
        <div
          className={`mt-2.5 max-h-[40%] shrink-0 overflow-y-auto border-t border-white/10 pt-2.5 transition-opacity duration-300 ${
            contactGate && !isPhone ? 'pointer-events-none select-none opacity-25' : ''
          }`}
        >
          <RailSection title={hereTitle} accent={!!hereProps}>
            {hereSlot}
          </RailSection>
        </div>
      </aside>

      {/* Phone map chrome — interrupt cards stay mounted off-Map (CSS hidden)
          so search keeps ticking; they only cover the Map tab. */}
      {isPhone && !phoneFight && phoneInterruptKind === 'contact' && (
        <MapInterruptCard accent="hiss" className={phoneOnMap ? '' : 'hidden'}>
          <EncounterPrompt variant="card" />
        </MapInterruptCard>
      )}
      {isPhone && !phoneFight && phoneInterruptKind === 'event' && pendingEvent && (
        <MapInterruptCard className={phoneOnMap ? '' : 'hidden'}>
          <PendingEventCardBody event={pendingEvent.event} />
        </MapInterruptCard>
      )}
      {isPhone && !phoneFight && phoneInterruptKind === 'search' && (
        <MapInterruptCard className={phoneOnMap ? '' : 'hidden'}>
          <SearchSessionNode variant="card" onOpenGuide={setGuideTopic} />
        </MapInterruptCard>
      )}
      {phoneOnMap &&
        !phoneFight &&
        !phoneInterruptKind &&
        !hdb &&
        !tunnel && (
          <MapHereChrome
            sel={hereProps?.sel}
            atEvac={atEvac}
            onOpenLog={() => goToPhoneTab('log')}
            onOpenHere={() => setHereSheetOpen(true)}
            onSearch={enter}
            onOpenStash={openStash}
            onEvac={callEvac}
          />
        )}

      {/* Phone: full LocationCard sheet from the here row. */}
      {hereSheetOpen && hereProps && (
        <div
          className="absolute inset-x-0 top-0 z-[1200] flex items-end justify-center bg-black/80 p-3 max-lg:bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom,0px))] lg:hidden"
          onClick={() => setHereSheetOpen(false)}
        >
          <div
            className="max-h-[min(75vh,36rem)] w-full max-w-md overflow-y-auto rounded-xl border border-white/15 bg-concrete-900 p-3 shadow-signage"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-2xs font-semibold uppercase tracking-widest text-signal/70">
                You are here
              </span>
              <button
                type="button"
                onClick={() => setHereSheetOpen(false)}
                className="text-xs text-white/40 hover:text-white/70"
              >
                ✕ close
              </button>
            </div>
            {hereSlot}
          </div>
        </div>
      )}

      {/* ================= MOBILE bottom nav ================= */}
      <nav
        className="relative z-[710] flex shrink-0 border-t border-white/10 bg-concrete-900 pb-[env(safe-area-inset-bottom,0px)] text-2xs lg:hidden"
        style={{ minHeight: 'calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px))' }}
      >
        <NavBtn
          label={<><Icon name="action.map" /> Map</>}
          active={phoneOnMap}
          onClick={() => goToPhoneTab('map')}
          pulse={
            !!(pendingEvent || pendingSearch || combat) &&
            !phoneOnMap &&
            !hdb &&
            !tunnel
          }
        />
        <NavBtn
          label={<><Icon name="action.status" /> Status</>}
          active={!sidePanel && mobileView === 'hub'}
          onClick={() => goToPhoneTab('hub')}
        />
        <NavBtn
          label={<><Icon name="action.inventory" /> Stash</>}
          active={sidePanel === 'inventory'}
          onClick={() => goToPhoneTab('inventory')}
        />
        <NavBtn
          label={<><Icon name="action.craft" /> Craft</>}
          active={sidePanel === 'craft'}
          onClick={() => goToPhoneTab('craft')}
        />
        <NavBtn
          label={<><Icon name="action.log" /> Log</>}
          active={!sidePanel && mobileView === 'log'}
          onClick={() => goToPhoneTab('log')}
        />
      </nav>

      {/* ================= overlays ================= */}
      {ghostOffer && (
        <div className="absolute inset-0 z-[1150] flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-sm rounded-lg border border-signal/40 bg-concrete-900 p-5 shadow-signage">
            <h3 className="signage text-xs text-signal">A survivor, still standing</h3>
            <p className="mt-3 text-sm text-concrete-200">
              They lived where your predecessor did not. One trade, then they're gone:
            </p>
            <div className="mt-3 flex items-center justify-between rounded border border-concrete-600 bg-black/40 px-3 py-2 text-sm">
              <span className="text-hiss">− {itemDef(ghostOffer.wantDefId).name}</span>
              <span className="text-concrete-400">→</span>
              <span className="text-signal">+ {itemDef(ghostOffer.giveDefId).name}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={acceptGhostTrade}
                className="flex-1 rounded bg-signal/80 py-2 text-sm font-bold text-black hover:bg-signal"
              >
                Trade
              </button>
              <button
                onClick={declineGhostTrade}
                className="flex-1 rounded border border-concrete-600 py-2 text-sm hover:bg-white/5"
              >
                Walk on
              </button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onReviewGuide={() => setHowToPlayOpen(true)}
        />
      )}
      {dayLogsOpen && <DayLogsModal onClose={() => setDayLogsOpen(false)} />}
      {guideTopic && <GuideModal topic={guideTopic} onClose={() => setGuideTopic(null)} />}
      {howToPlayOpen && <HowToPlayModal onClose={() => setHowToPlayOpen(false)} />}
      {/* Gated on store state rather than local state: the counter belongs to
          the place you're standing in, not to a button in this screen. */}
      <TraderModal />
    </div>
    </InventoryInteractionProvider>
  );
}

/** A titled block in the left rail — the frame the location cards sit in. */
function RailSection({
  title,
  children,
  onClose,
  accent,
  className = '',
}: {
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  accent?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`flex-col rounded-lg border p-2.5 ${
        accent ? 'border-signal/40 bg-signal/[0.04]' : 'border-white/15 bg-concrete-900/80'
      } ${className || 'flex'}`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`text-2xs font-semibold uppercase tracking-widest ${
            accent ? 'text-signal/70' : 'text-white/40'
          }`}
        >
          {title}
        </span>
        {onClose && (
          <button onClick={onClose} className="text-xs text-white/40 hover:text-white/70">
            ✕
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function NavBtn({
  label,
  active,
  pulse,
  onClick,
}: {
  label: ReactNode;
  active: boolean;
  pulse?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap px-0.5 py-2.5 font-semibold transition ${
        active ? 'bg-white/5 text-signal' : pulse ? 'text-concrete-50' : 'text-white/50'
      }`}
    >
      {label}
      {pulse && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
      )}
    </button>
  );
}
