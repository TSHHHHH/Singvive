import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { GameMap } from '../components/GameMap';
import { HudCard, TargetDock } from '../components/TargetDock';
import { useMrtNetwork } from '../components/useMrtNetwork';
import {
  displayLine,
  mrtRouteBetween,
  tunnelSegmentBetween,
  type MrtNetwork,
} from '../game/mrt';
import { ConditionPanel } from '../components/ConditionPanel';
import { StatsPanel } from '../components/StatsPanel';
import { SkillsPanel } from '../components/SkillsPanel';
import { LogPanel } from '../components/LogPanel';
import { CombatPanel } from '../components/CombatPanel';
import { PhoneStatusBar } from '../components/PhoneStatusBar';
import { MapHereChrome } from '../components/MapHereChrome';
import { MapInterruptCard } from '../components/MapInterruptCard';
import { PendingEventCardBody } from '../components/PendingEventChoices';
import { EncounterPrompt } from '../components/EncounterPrompt';
import { SearchSessionNode } from '../components/SearchSessionNode';
import { Icon } from '../icons/Icon';
import { useT } from '../i18n';
import { LocationCard } from '../components/LocationCard';
import { TrekCard } from '../components/TrekCard';
import { InventoryPanel } from '../components/Inventory/InventoryPanel';
import { InventoryInteractionProvider } from '../components/Inventory/InventoryInteractionContext';
import { CraftingPanel } from '../components/CraftingPanel';
import { StashLogbook } from '../components/StashLogbook';
import { SettingsModal } from '../components/settings';
import { DigitalClock } from '../components/DigitalClock';
import { WeatherBadge } from '../components/WeatherBadge';
import { SleepQualityIndicator } from '../components/SleepQualityIndicator';
import { ObjectiveBar } from '../components/ObjectiveBar';
import { ObjectivesPanel } from '../components/ObjectivesPanel';
import { tip } from '../components/tips';
import { DayLogsModal } from '../components/DayLogsModal';
import { GuideModal } from '../components/GuideModal';
import { HowToPlayModal } from '../components/HowToPlayModal';
import { LimbCoachModal } from '../components/LimbCoachModal';
import { HdbDungeonModal } from '../components/HdbDungeonModal';
import { HdbContextPanel } from '../components/HdbContextPanel';
import { TraderModal } from '../components/TraderModal';
import { MrtRoutePlanner } from '../components/MrtRoutePlanner';
import { TunnelRunView } from '../components/TunnelRunView';
import type { GuideTopic } from '../content/guideContent';
import { useSetting, useSettings } from '../game/settings';
import { LogTicker } from '../components/LogTicker';
import { isModalOpen } from '../components/modalStack';
import { itemDef } from '../game/loot';
import { estimateExpedition, withVegetationTravel } from '../game/travel';
import { unplayableMessage, walkabilityOf } from '../game/playable';
import { routeLandPath } from '../game/route';
import { vegetationCost } from '../game/vegetation';
import {
  bleedEncounterMod,
  computeEvacBonus,
  computeScore,
  headAwarenessPenalty,
  legTravelFactor,
  scoreDayMult,
  torsoCarryMult,
  totalHp,
  totalMaxHp,
} from '../game/survival';
import { useAmbience } from '../audio/useAmbience';
import {
  equipEncounterChanceMod,
  equipTravelSpeedFactor,
  loadEffectsFor,
  totalLootValue,
} from '../game/inventory';
import { haversine } from '../game/overpass';
import { rollWeather, timeOfDay, weatherEncounterMod } from '../game/weather';
import { awareness, blipMargin, maxTravelRange, travelableRange } from '../game/fog';
import {
  equipAwarenessMod,
  equipLightPower,
  sumTraitMod,
  traitAwarenessMod,
  traitDetectRadiusMult,
} from '../game/character';
import {
  EVAC_SCORE_BONUS,
  evacReadiness,
  hordeIntensity,
  hordeTier,
} from '../game/goal';
import { Rng } from '../game/rng';
import { makePressureAt, nearestTown, townTierAt } from '../game/townField';
import {
  hazardsOnPath,
  hazardsAtPoint,
  sensedHazardField,
  trekRisk,
  HAZARD_CONFIG,
  NIGHT_SWARM_SENSE_M,
  TREK_MIN_DISTANCE_M,
} from '../game/wilds';
import { sightFactor, sightLimitedRange, swarmSenseRange, veilAlpha } from '../game/nightSight';
import type { LocationState } from '../game/types';
import type { IconName } from '../icons/keys';
import { BTN } from '../components/placeCardStyle';

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
    <div className="mt-2 text-body" style={{ color: cfg.color }}>
      {cfg.blurb} Do not sleep here.
    </div>
  );
}

/**
 * Which body the slide-out panel is showing. null = closed. Everything that
 * wants more room than the rail can give lands here, objectives included —
 * there is exactly one place detail opens.
 */
type SidePanel = 'inventory' | 'craft' | 'logbook' | 'stats' | 'skills' | 'objective';

const SIDE_PANEL_ICONS: Record<SidePanel, IconName> = {
  inventory: 'action.inventory',
  craft: 'action.craft',
  logbook: 'action.logbook',
  stats: 'action.stats',
  skills: 'attr.wits',
  objective: 'action.objectives',
};

/** Rail switchers — objectives opens from its own bar. */
const PANEL_BUTTONS: SidePanel[] = ['inventory', 'craft', 'logbook', 'stats', 'skills'];

function sidePanelLabelKey(id: SidePanel): string {
  if (id === 'inventory') return 'ui.phone.stash';
  if (id === 'craft') return 'ui.phone.craft';
  if (id === 'logbook') return 'ui.phone.logbook';
  if (id === 'stats') return 'ui.phone.stats';
  if (id === 'skills') return 'ui.phone.skills';
  return 'ui.phone.objectives';
}

/**
 * Desktop rail shortcuts, in 1–9 hotkey order: the slide-out panels, then the
 * timeline pin, day logs and settings.
 */
const RAIL_KEYS = [
  'objective',
  'inventory',
  'craft',
  'logbook',
  'stats',
  'skills',
  'timeline',
  'dayLogs',
  'settings',
] as const;
type RailKey = (typeof RAIL_KEYS)[number];
const RAIL_HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const railHotkey = (id: RailKey): string => RAIL_HOTKEYS[RAIL_KEYS.indexOf(id)];

/** Gap between HUD pieces, and between them and the screen edge, px. */
const HUD_GAP = 12;
const HUD_EDGE = 16;
/** Desktop survivor rail width, px (matches `lg:w-[408px]`). */
const RAIL_W = 408;
/** Bottom-anchored desktop HUD clears MapLibre's ~24px attribution bar, px. */
const HUD_BOTTOM = 32;
/** The collapsed ticker's width, px (22rem). */
const TICKER_W = 352;
/** The ticker's header button (text-label + py-1 + hairline). */
const TICKER_HEAD_H = 24;
/** Narrowest the HDB view may get before it gives up the ticker reserve, px. */
const HDB_MIN_W = 440;
/** Narrowest map strip worth keeping beside the landing strips to show the block in 3D. */
const BLOCK_STRIP_MIN_W = 180;
/** Desktop 3D: widest the landing strips get beside the block. */
const HDB_STRIPS_W = 460;

function timelineWidth(vw: number): number {
  return Math.round(Math.max(320, Math.min(480, vw * 0.32)));
}

function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

/**
 * Orientation when a visible station isn't adjacent: how far it is, and that
 * the planner can still route — collapsed bores are a brutal crawl, not a wall.
 */
function tunnelDirections(
  net: MrtNetwork,
  here: LocationState,
  sel: LocationState,
  destroyed: string[],
): string {
  const route = mrtRouteBetween(here, sel, destroyed);
  if (!route) {
    return `${sel.name} has no tunnel path from here. Plan travel to try another way, or walk the surface.`;
  }
  const where = `${route.stops} stops via the ${displayLine(net, route.legs[0].line).name}`;
  if (route.collapsedHops > 0) {
    return `${sel.name} is ${where}, but the only underground path crawls a collapsed bore. Plan travel — or walk the surface.`;
  }
  return `${sel.name} is ${where}. Open tunnel planning to crawl the whole route in one run.`;
}

export function GameScreen() {
  const { t } = useT();
  // Subscribing to the whole store meant every write re-rendered this screen —
  // including the log, which grows on almost every action and which nothing
  // here reads. Naming the slice keeps re-renders to changes that matter.
  //
  // Do not add `combat`, `log`, or per-frame search progress to this slice.
  // Gauge ticks rewrite `combat` at 20 Hz — select booleans below; CombatPanel
  // owns the combat object.
  // Action identities are created once in the store factory and never replaced
  // by `set()`, so they do not belong in the reactive selector — keeping them
  // there rebuilt an 11-key object and ran 11 comparisons on every one of the
  // store's ~187 writes, for values that cannot change.
  const {
    hdbEnter,
    acceptGhostTrade,
    declineGhostTrade,
    callEvac,
    travel,
    enter,
    trek,
    tunnelEnterRoute,
    rest,
    peekRestPreview,
    notify,
  } = useGame.getState();

  const {
    spawn,
    locations,
    currentPos,
    currentPositionId,
    worldLoading,
    worldError,
    travelAnim,
    pendingEvent,
    pendingSearch,
    hdb,
    ghostOffer,
    noisePulses,
    hordeLevel,
    groundZeroId,
    evacZoneId,
    evacDeadline,
    evacCooldownUntil,
    evacDemand,
    evacDemandBias,
    evacManifestRevealed,
    tunnel,
    destroyedTunnelEdges,
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
      pendingSearch: s.pendingSearch,
      hdb: s.hdb,
      ghostOffer: s.ghostOffer,
      noisePulses: s.noisePulses,
      hordeLevel: s.hordeLevel,
      groundZeroId: s.groundZeroId,
      evacZoneId: s.evacZoneId,
      evacDeadline: s.evacDeadline,
      evacCooldownUntil: s.evacCooldownUntil,
      evacDemand: s.evacDemand,
      evacDemandBias: s.evacDemandBias,
      evacManifestRevealed: s.evacManifestRevealed,
      tunnel: s.tunnel,
      destroyedTunnelEdges: s.destroyedTunnelEdges,
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
  const inCombat = useGame((s) => s.combat !== null);
  const awaitingStance = useGame((s) => s.combat?.awaitingStance ?? false);
  const mapAnnotations = useGame((s) => s.mapAnnotations);
  const intelNoteCount = useMemo(
    () => items.filter((i) => itemDef(i.defId).effect.kind === 'intel').length,
    [items],
  );
  const rumourCount = mapAnnotations.length;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A spot on bare map the player is considering walking to. Mutually exclusive
  // with a selected POI — you're deciding about one thing at a time.
  const [trekTarget, setTrekTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const isPhone = useIsPhone();
  // Craft takes the map's width; the others keep the 360px column. Remembering
  // the last panel keeps that width stable through the 200 ms close, so the
  // workbench does not snap narrow while it is still sliding out.
  const lastSidePanel = useRef<SidePanel | null>(null);
  if (sidePanel) lastSidePanel.current = sidePanel;
  const wideSlideOut = (sidePanel ?? lastSidePanel.current) === 'craft';
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
      if (isModalOpen()) return;
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
          : inCombat
            ? `combat:${awaitingStance ? 'contact' : 'fight'}`
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
  const load = useMemo(
    () =>
      character
        ? loadEffectsFor(
            items,
            character.attributes,
            equipment,
            sumTraitMod(character.traitIds, 'carryCapacityMod'),
            torsoCarryMult(bodyParts),
          )
        : null,
    [character, items, equipment, bodyParts],
  );

  const legFactor =
    legTravelFactor(bodyParts) *
    equipTravelSpeedFactor(equipment) *
    (1 + sumTraitMod(character?.traitIds ?? [], 'travelSpeedMod'));
  const travelRange = useMemo(
    () =>
      character
        ? travelableRange(
            character.attributes,
            meters.energy,
            legFactor,
            weather,
            load?.travelMult ?? 1,
          )
        : 400,
    [character, meters.energy, legFactor, weather, load],
  );
  // Outer ring, fog and 3D building rise: the rested range of this build and
  // gear. Energy, injuries, load and weather never move it.
  const gearSpeed =
    equipTravelSpeedFactor(equipment) * (1 + sumTraitMod(character?.traitIds ?? [], 'travelSpeedMod'));
  const maxRange = useMemo(
    () => (character ? maxTravelRange(character.attributes, gearSpeed) : 400),
    [character, gearSpeed],
  );
  // Fog + planning ring: hold setout range for the whole glide, then ease to
  // the post-trip range on arrival (energy already spent at departure).
  const mapRangeTarget = travelAnim ? travelAnim.departRange : travelRange;

  const awarenessValue = character
    ? awareness(
        character.attributes.perception,
        equipAwarenessMod(equipment),
        traitAwarenessMod(character.traitIds),
      ) - headAwarenessPenalty(bodyParts)
    : 0;
  const detectMult = character ? traitDetectRadiusMult(character.traitIds) : 1;
  // After dark you sense only what your light reaches: fewer blips, fewer
  // pockets previewed. Hidden pockets still fire on the walk.
  const lightPower = equipLightPower(equipment);
  const sight = sightFactor(
    time,
    weather,
    lightPower,
    character ? sumTraitMod(character.traitIds, 'nightSightMod') : 0,
  );
  const blipRange = sightLimitedRange(
    travelRange + blipMargin(awarenessValue) * detectMult,
    sight,
  );
  // Quantised so energy ticks don't rewrite the veil's style every hour.
  const nightVeilAlpha = Math.round(veilAlpha(time, sight) * 20) / 20;

  // Hazards densify with local neighbourhood pressure — a Lost town is not a Stirring one.
  const hazardPressure = hordeIntensity(hordeLevel);
  const pressureAt = useMemo(
    () => makePressureAt(seed, groundZeroId, hordeLevel),
    [seed, groundZeroId, hordeLevel],
  );
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
        pressureAt,
        swarmSenseRange(NIGHT_SWARM_SENSE_M, sight),
      ),
    [seed, currentPos.lat, currentPos.lng, blipRange, spawn, hazardPressure, time, day, pressureAt, sight],
  );

  // Ambience: quantised scalars so hourly ticks don't churn audio params.
  const maxHp = totalMaxHp(bodyParts);
  useAmbience({
    band: time,
    weather,
    dread: Math.round(pressureAt(currentPos.lat, currentPos.lng) * 20) / 20,
    sight: Math.round(sight * 20) / 20,
    hpFrac: maxHp > 0 ? Math.round((totalHp(bodyParts) / maxHp) * 20) / 20 : 1,
    inCombat,
    underground: tunnel !== null,
  });

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
        load?.travelMult ?? 1,
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
      load,
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
        load?.travelMult ?? 1,
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
      load,
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
      { band: time, day, pressureAt },
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
          pressureAt,
          weatherEncounterMod: weatherEncounterMod(weather),
          traitEncounterMod:
            sumTraitMod(character.traitIds, 'encounterChanceMod') +
            equipEncounterChanceMod(equipment) +
            bleedEncounterMod(bodyParts),
          safe: spawn ?? undefined,
          day,
          sight,
          lightPower,
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
    pressureAt,
    sight,
    lightPower,
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
      { band: time, day, pressureAt },
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
          pressureAt,
          weatherEncounterMod: weatherEncounterMod(weather),
          traitEncounterMod:
            sumTraitMod(character.traitIds, 'encounterChanceMod') +
            equipEncounterChanceMod(equipment) +
            bleedEncounterMod(bodyParts),
          safe: spawn ?? undefined,
          day,
          sight,
          lightPower,
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
    pressureAt,
    sight,
    lightPower,
  ]);

  // Held only so the ride card re-renders once the network arrives; the routing
  // itself reads the same cached copy through mrtRouteBetween.
  const mrtNet = useMrtNetwork();

  // ---- desktop HUD: rail shortcuts, timeline / ticker ---------------------
  const vw = useViewportWidth();
  const setSetting = useSettings((s) => s.setSetting);
  const timelinePinned = useSetting('timelinePinned') === 'on';
  // Anything that wants an answer opens the timeline by itself.
  const timelineFull =
    timelinePinned || inCombat || awaitingStance || !!pendingEvent || !!pendingSearch;
  const tlW = timelineWidth(vw);

  const activateRail = useCallback(
    (id: RailKey) => {
      if (id === 'timeline') setSetting('timelinePinned', timelinePinned ? 'off' : 'on');
      else if (id === 'dayLogs') setDayLogsOpen(true);
      else if (id === 'settings') setSettingsOpen(true);
      else setSidePanel((p) => (p === id ? null : id));
    },
    [setSetting, timelinePinned],
  );

  // 1–9 toggle the rail's panels and shortcuts in order (Esc closing the
  // slide-out lives with the slide-out). They stand down for modals, text
  // fields and the contact gate. Camera keys are letters, arrows and +/-, so
  // nothing here overlaps them.
  const overlayOpen =
    settingsOpen ||
    dayLogsOpen ||
    !!guideTopic ||
    howToPlayOpen ||
    traderOpen ||
    !!ghostOffer;
  useEffect(() => {
    if (isPhone || overlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isModalOpen()) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      )
        return;
      if (awaitingStance) return;
      const i = RAIL_HOTKEYS.indexOf(e.key);
      if (i < 0) return;
      e.preventDefault();
      activateRail(RAIL_KEYS[i]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPhone, overlayOpen, awaitingStance, activateRail]);

  // The here card shrinks to its title on request, and opens again wherever
  // you arrive next.
  const [hereCollapsed, setHereCollapsed] = useState(false);
  const [hereCollapsedAt, setHereCollapsedAt] = useState(currentPositionId);
  if (hereCollapsedAt !== currentPositionId) {
    setHereCollapsedAt(currentPositionId);
    setHereCollapsed(false);
  }

  // Desktop: the here card's height, so the map centres the pin in the ground
  // above the bottom-centre pair instead of under it.
  const [pairH, setPairH] = useState(0);
  const pairObs = useRef<ResizeObserver | null>(null);
  const pairRef = useCallback((el: HTMLDivElement | null) => {
    pairObs.current?.disconnect();
    pairObs.current = null;
    if (!el) {
      setPairH(0);
      return;
    }
    const ro = new ResizeObserver(() => setPairH(Math.round(el.offsetHeight)));
    ro.observe(el);
    pairObs.current = ro;
  }, []);

  const view3d = useSetting('mapView3d') === 'on';
  const showRail = useSetting('railOverlay') === 'on';
  const [islandView, setIslandView] = useState(false);
  // The map unmounts under a block, tunnel or planner; the island view ends with it.
  if (islandView && (tunnel || hdb || mrtPlanner)) setIslandView(false);
  if (!spawn) return null;

  const selHere = sel ? sel.id === currentPositionId : false;

  const here = currentPositionId ? locations[currentPositionId] : null;
  // Adjacent segment still deep-links the planner with a destination.
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
    if (h <= 0) return t('ui.game.departing');
    const d = Math.floor(h / 24);
    const hr = Math.ceil(h % 24);
    return d > 0 ? t('ui.game.windowDh', { d, h: hr }) : t('ui.game.windowH', { h: hr });
  };
  const doomLabel = t(`ui.horde.${hordeTier(doom)}`);
  const hereTown = groundZeroId
    ? nearestTown(currentPos.lat, currentPos.lng)
    : null;
  const hereTownTier = groundZeroId
    ? townTierAt(seed, groundZeroId, hordeLevel, currentPos.lat, currentPos.lng)
    : null;
  const evacUrgent = evacHoursLeft != null && evacHoursLeft <= 8;
  const windowText = evacHoursLeft != null ? fmtWindow(evacHoursLeft) : null;
  const evacCooldownHours =
    evacCooldownUntil != null ? Math.max(0, Math.ceil(evacCooldownUntil - nowHours)) : null;

  // ---- the two location slots, shared between the desktop rail and the
  // mobile floating dock so the markup only exists once -------------------
  // A fight owns the moment — nothing to decide about crossing until it's over.
  const targetSlot: { title: ReactNode; body: ReactNode; onClose?: () => void } | null =
    trekTarget && trekInfo && trekEst && !inCombat
      ? {
          title: travelAnim ? (
            <><Icon name="action.travel" /> {t('ui.game.enRoute')}</>
          ) : (
            <><Icon name="action.target" /> {t('ui.game.openGround')}</>
          ),
          body: (
            <TrekCard
              distanceM={trekDist}
              travelMin={trekEst.travelMin}
              risk={trekInfo.risk}
              blind={trekInfo.blind}
              dark={time !== 'day' && sight < 0.6}
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
              <><Icon name="action.travel" /> {t('ui.game.enRoute')}</>
            ) : (
              <><Icon name="action.target" /> {t('ui.game.target')}</>
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
          className={`${BTN.primary} mt-2`}
        >
          <Icon name="action.evac" />{' '}
          {t(evacManifestRevealed ? 'ui.game.callEvac' : 'ui.game.raiseChannel')}
        </button>
      )}
    </>
  ) : !worldLoading ? (
    <>
      <div className="text-read text-white/70">{t('ui.game.nowhereTitle')}</div>
      <div className="mt-1 text-body text-white/40">{t('ui.game.nowhereBlurb')}</div>
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

  /** Desktop: the target card only pairs with "here" while the open map shows. */
  const desktopTarget = !tunnel && !hdb && !mrtPlanner;

  /**
   * Desktop: the HDB landing strips are drawn in the space the HUD leaves inside the
   * map column (the rail sits left of it): left of the timeline (or ticker),
   * above the here card. When that is too narrow the ticker reserve goes (it is
   * see-through and fades).
   */
  const hdbInset = (() => {
    let top = HUD_EDGE;
    const bottom = (pairH > 0 ? pairH + HUD_GAP : 0) + HUD_BOTTOM;
    const left = HUD_EDGE;
    let right = HUD_EDGE + (timelineFull ? tlW : TICKER_W) + HUD_GAP;
    if (vw - RAIL_W - left - right < HDB_MIN_W && !timelineFull) {
      // The ticker now floats over the strips' column: start the dock below
      // its header button so Leave is never under it.
      right = HUD_EDGE;
      top = HUD_EDGE + TICKER_HEAD_H + HUD_GAP;
    }
    return { top, right, bottom, left };
  })();

  /**
   * Desktop, 3D: the map stays up behind the landing strips and the space left
   * of them shows the block itself (camera eased onto it, the hovered storey
   * lit). The strips keep a fixed width; the tower takes what is left. Only
   * when that is worth having; otherwise the strips take the view.
   */
  const mapW = vw - RAIL_W;
  const blockStripW = (() => {
    if (isPhone || !view3d) return 0;
    const avail = mapW - hdbInset.left - hdbInset.right;
    const strips = Math.min(HDB_STRIPS_W, Math.max(HDB_MIN_W - 80, Math.round(avail * 0.55)));
    const w = avail - strips - HUD_GAP;
    return w >= BLOCK_STRIP_MIN_W ? w : 0;
  })();
  const hdbOverMap = !!hdb && blockStripW > 0;
  const hdbPanelInset = hdbOverMap
    ? { ...hdbInset, left: hdbInset.left + blockStripW + HUD_GAP }
    : hdbInset;

  const hereTitle: ReactNode = hdb ? (
    <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
      <Icon name="hdb.enterBlock" />
      {t('ui.game.insideBlock')}
    </span>
  ) : hereProps ? (
    <><Icon name="action.here" /> {t('ui.game.youAreHere')}</>
  ) : (
    <><Icon name="action.here" /> {t('ui.game.inTheOpen')}</>
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
  const contactGate = awaitingStance;
  const phoneFight = isPhone && inCombat && !contactGate;
  const phoneOwnsLive =
    isPhone && (inCombat || !!pendingEvent || !!pendingSearch);
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

  /** Desktop contact gate: everything but the timeline stops taking input. */
  const deskGate = contactGate && !isPhone;

  // ---- desktop HUD -----------------------------------------------------------
  const railTip = (label: string, id: RailKey) =>
    tip(t('ui.hud.hotkey', { label, key: railHotkey(id) }), { label: true });

  const desktopHud = (
    <>
      {/* Timeline: the full panel when pinned or when something needs an
          answer; otherwise a fading ticker. During the contact gate it is the
          one lit thing on the screen. */}
      {timelineFull ? (
        <aside
          className={`absolute z-[760] flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/15 bg-concrete-900/90 p-2.5 shadow-signage backdrop-blur-sm transition-shadow duration-300 ${
            contactGate
              ? 'ring-2 ring-inset ring-hiss shadow-[0_0_60px_-5px_rgba(217,45,45,0.55)]'
              : inCombat
                ? 'ring-1 ring-inset ring-hiss/50'
                : ''
          }`}
          style={{ right: HUD_EDGE, top: HUD_EDGE, bottom: HUD_BOTTOM, width: tlW }}
        >
          {inCombat && !contactGate ? (
            <CombatPanel onOpenGuide={setGuideTopic} />
          ) : (
            <LogPanel
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenDayLogs={() => setDayLogsOpen(true)}
              onFocusMap={focusStashOnMap}
              onOpenGuide={setGuideTopic}
              liveNodes="timeline"
              pinned={timelinePinned}
              onTogglePin={() => setSetting('timelinePinned', timelinePinned ? 'off' : 'on')}
            />
          )}
        </aside>
      ) : (
        <div
          className="pointer-events-none absolute z-[740]"
          style={{ right: HUD_EDGE, top: HUD_EDGE, width: TICKER_W }}
        >
          <LogTicker
            onExpand={() => setSetting('timelinePinned', 'on')}
            onFocusMap={focusStashOnMap}
          />
        </div>
      )}

    </>
  );

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
        className={`relative flex-col border-white/10 bg-concrete-900/70 lg:z-[750] lg:flex lg:h-full lg:w-[408px] lg:shrink-0 lg:border-r lg:bg-concrete-900 ${
          mobileView === 'hub' ? show(true) : 'hidden'
        } lg:flex ${backgrounded}`}
      >
        {/* --- time, day, weather, rest --- */}
        <div className="relative z-20 shrink-0 space-y-2 border-b border-white/10 p-2.5">
          <DigitalClock day={day} hour={hour} band={time} />
          <div className="flex items-center justify-between gap-2">
            <WeatherBadge weather={weather} />
            <div className="flex shrink-0 items-center gap-2">
              <SleepQualityIndicator preview={sleepPreview} />
              <button
                onClick={rest}
                className="rounded border border-white/15 px-2.5 py-1 text-body transition hover:bg-white/5"
                {...tip(sleepPreview.conditions.summary)}
              >
                <Icon name="action.sleep" /> {t('ui.game.rest')}
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
              doomLabel={doomLabel}
              showDoom={isPhone}
              townName={hereTown?.name ?? null}
              townTier={hereTownTier}
              dayMult={dayMult}
              vibe={readiness.vibe}
              vibeLine={readiness.vibeLine}
              manifestRevealed={evacManifestRevealed}
              evacRatio={readiness.ratio}
              evacReady={readiness.ready}
              evacCurrent={readiness.current}
              evacRequired={readiness.required}
              onOpen={() => setSidePanel((p) => (p === 'objective' ? null : 'objective'))}
              intelNoteCount={intelNoteCount}
              rumourCount={rumourCount}
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
                ? PANEL_BUTTONS.filter((id) => id === 'logbook' || id === 'stats' || id === 'skills')
                : PANEL_BUTTONS
              ).map((id) => {
                const active = sidePanel === id;
                const label = t(sidePanelLabelKey(id));
                return (
                  <button
                    key={id}
                    onClick={() => setSidePanel(active ? null : id)}
                    className={`rounded border py-1.5 text-body transition ${
                      active
                        ? 'border-signal bg-signal/15 text-signal'
                        : 'border-white/15 text-white/70 hover:bg-white/5'
                    }`}
                    {...(isPhone ? {} : railTip(label, id))}
                  >
                    <Icon name={SIDE_PANEL_ICONS[id]} /> {label}
                  </button>
                );
              })}
            </div>

            {/* Desktop: the timeline folds to a ticker, so its pin, day logs and
                settings keep a home here. */}
            {!isPhone && (
              <div className="grid grid-cols-3 gap-1.5">
                {(['timeline', 'dayLogs', 'settings'] as const).map((id) => {
                  const active =
                    id === 'timeline' ? timelinePinned : id === 'dayLogs' ? dayLogsOpen : settingsOpen;
                  const label = t(`ui.hud.${id}`);
                  const icon: IconName =
                    id === 'timeline' ? 'action.log' : id === 'dayLogs' ? 'action.dayLogs' : 'action.settings';
                  return (
                    <button
                      key={id}
                      onClick={() => activateRail(id)}
                      aria-pressed={active}
                      className={`truncate rounded border px-1 py-1.5 text-body transition ${
                        active
                          ? 'border-signal bg-signal/15 text-signal'
                          : 'border-white/15 text-white/70 hover:bg-white/5'
                      }`}
                      {...railTip(label, id)}
                    >
                      <Icon name={icon} /> {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Desktop: how the map is drawn, at the foot of the rail. The island
            front pulls the camera back over the whole island. */}
        {!isPhone && (
          <div className="flex shrink-0 gap-1.5 border-t border-white/10 p-2.5">
            <button
              onClick={() => setIslandView((v) => !v)}
              aria-pressed={islandView}
              disabled={!!(tunnel || hdb || mrtPlanner)}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors disabled:opacity-40 ${
                islandView ? 'border-signal bg-signal/15' : 'border-white/15 hover:bg-white/5 disabled:hover:bg-transparent'
              }`}
              {...tip(t(islandView ? 'ui.hud.islandBackTip' : 'ui.hud.islandTip'), { label: true })}
            >
              <Icon name="action.map" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-baseline justify-between gap-2 text-body">
                  <span className={`truncate ${islandView ? 'text-signal' : 'text-white/70'}`}>
                    {t('ui.town.legendTitle')}
                  </span>
                  <span className="shrink-0 tabular-nums" style={{ color: doomColor }}>
                    {doomLabel} · {Math.round(doom)}%
                  </span>
                </span>
                <span className="block h-1 overflow-hidden rounded bg-black/50">
                  <span
                    className="block h-full transition-[width] duration-500"
                    style={{ width: `${Math.min(100, doom)}%`, background: doomColor }}
                  />
                </span>
              </span>
            </button>
            <button
              onClick={() => setSetting('mapView3d', view3d ? 'off' : 'on')}
              aria-pressed={view3d}
              className={`rounded border px-2.5 text-body transition-colors ${
                view3d ? 'border-signal bg-signal/15 text-signal' : 'border-white/15 text-white/70 hover:bg-white/5'
              }`}
              {...tip(t('ui.hud.view3dTip'), { label: true })}
            >
              3D
            </button>
            <button
              onClick={() => setSetting('railOverlay', showRail ? 'off' : 'on')}
              aria-pressed={showRail}
              className={`flex items-center gap-1.5 rounded border px-2.5 text-body transition-colors ${
                showRail ? 'border-signal bg-signal/15 text-signal' : 'border-white/15 text-white/70 hover:bg-white/5'
              }`}
              {...tip(t('ui.hud.railTip'), { label: true })}
            >
              <Icon name="action.mrt" /> {t('ui.hud.railMap')}
            </button>
          </div>
        )}

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
      {/* Craft is the one panel with a grid to lay out, so on desktop it spans
          the whole map instead of the 360px column — pinned to the timeline's
          edge, never narrower than the column it replaces (at 1024px the map
          strip is thinner than 360px, so the min-width is what wins there).
          Closed, it parks its own width plus the 408px rail off the left edge,
          so it slides out from behind the rail instead of fading in on top. */}
      <div
        className={`absolute left-0 z-[700] w-full transition-[transform,width,right] duration-200 ease-out max-lg:bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom,0px))] max-lg:top-[var(--mobile-status-bar-h)] lg:inset-y-0 lg:left-[408px] ${
          wideSlideOut ? 'lg:w-auto lg:min-w-[360px]' : 'lg:w-[360px]'
        } ${
          sidePanel
            ? 'translate-x-0'
            : 'pointer-events-none -translate-x-full lg:-translate-x-[calc(100%+408px)]'
        } ${backgrounded}`}
        // Wide craft runs to the timeline (or the ticker, so its close button
        // never ends up under it).
        style={
          !isPhone && wideSlideOut
            ? { right: HUD_EDGE + (timelineFull ? tlW : TICKER_W) + HUD_GAP }
            : undefined
        }
      >
        <div className="flex h-full flex-col border-r border-white/15 bg-concrete-900 shadow-signage">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-3">
            <h3 className="text-read font-bold text-signal">
              {sidePanel && (
                <>
                  <Icon name={SIDE_PANEL_ICONS[sidePanel]} /> {t(sidePanelLabelKey(sidePanel))}
                </>
              )}
            </h3>
            <button
              onClick={() => setSidePanel(null)}
              className="text-body text-white/40 hover:text-white/70"
            >
              {t('ui.common.close')}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {sidePanel === 'inventory' && (
              <InventoryPanel layout={isPhone ? 'full' : 'equipStash'} />
            )}
            {sidePanel === 'craft' && <CraftingPanel />}
            {sidePanel === 'logbook' && <StashLogbook onFocusLocation={focusStashOnMap} />}
            {sidePanel === 'stats' && <StatsPanel />}
            {sidePanel === 'skills' && <SkillsPanel />}
            {sidePanel === 'objective' && (
              <ObjectivesPanel
                evacZoneName={evacZone?.name ?? null}
                evacDist={evacDist}
                atEvac={atEvac}
                vibe={readiness.vibe}
                vibeLine={readiness.vibeLine}
                manifestRevealed={evacManifestRevealed}
                evacCurrent={readiness.current}
                evacRequired={readiness.required}
                evacRatio={readiness.ratio}
                evacBias={evacDemandBias ?? 'balanced'}
                dayMult={dayMult}
                projectedScore={projectedScore}
                projectedEvacBonus={projectedEvacBonus}
                windowText={windowText}
                urgent={evacUrgent}
                doom={doom}
                doomColor={doomColor}
                doomLabel={doomLabel}
                townName={hereTown?.name ?? null}
                townTier={hereTownTier}
                onEvac={callEvac}
                onOpenGuide={setGuideTopic}
                intelNoteCount={intelNoteCount}
                rumourCount={rumourCount}
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
        // lg:isolate — the map's own z-indexes (player pin 1000, marker
        // stacks) stay inside the map, under the desktop HUD's 720–760.
        className={`relative min-h-0 min-w-0 overflow-hidden lg:isolate lg:flex lg:flex-1 ${
          mobileView === 'map' ? show(true) : 'hidden'
        } lg:flex ${phoneFight ? '' : backgrounded}`}
        inert={deskGate}
      >
        {/* Phone active fight: CombatPanel owns the Map tab (no map peek). */}
        {phoneFight && (
          <div className="flex h-full min-h-0 flex-1 flex-col p-2 lg:hidden">
            <CombatPanel onOpenGuide={setGuideTopic} />
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
          ) : hdb && !hdbOverMap ? (
            <HdbDungeonModal onOpenGuide={setGuideTopic} inset={hdbInset} />
          ) : mrtPlanner && !hdb ? (
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
                travelRange={mapRangeTarget}
                maxTravelRange={maxRange}
                blipRange={blipRange}
                veilRadiusM={blipRange}
                veilAlpha={nightVeilAlpha}
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
                mapAnnotations={mapAnnotations}
                padRight={
                  hdbOverMap
                    ? Math.max(0, mapW - hdbInset.left - blockStripW)
                    : isPhone || !timelineFull
                      ? 0
                      : tlW + HUD_EDGE
                }
                padBottom={isPhone ? 0 : pairH > 0 ? pairH + HUD_BOTTOM : HUD_BOTTOM}
                chromeRight={
                  isPhone ? 0 : HUD_EDGE + (timelineFull ? tlW : TICKER_W) + HUD_GAP / 2
                }
                islandView={islandView}
                onIslandViewExit={() => setIslandView(false)}
                showModeToggles={isPhone}
                onSelect={selectPoi}
                onPickGround={pickGround}
              />
              {/* Desktop 3D, inside a block: the landing strips over the map, the
                  block itself showing in the strip left of it. The layer
                  takes every click, so the map strip is a view, not a board. */}
              {hdbOverMap && (
                <div className="absolute inset-0 z-[550]">
                  <HdbDungeonModal onOpenGuide={setGuideTopic} inset={hdbPanelInset} overMap />
                </div>
              )}
              {/* Phone: docked bottom-right so the travel line into the target
                  stays visible. Desktop pairs it with the here card below. */}
              {isPhone && targetSlot && (
                <TargetDock title={targetSlot.title} onClose={targetSlot.onClose}>
                  {targetSlot.body}
                </TargetDock>
              )}
              {worldLoading && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/70">
                  <p className="animate-pulse text-white/70">{t('ui.game.loadingNeighbourhood')}</p>
                </div>
              )}
              {worldError && (
                <div className="absolute bottom-2 left-2 z-[500] max-w-xs rounded bg-black/85 px-3 py-1.5 text-body text-concrete-50">
                  {worldError}
                </div>
              )}
            </>
          )}
          {/* Desktop: where you stand and where you are going, side by side at
              bottom centre of the free map (right of the dock, left of the
              open timeline), so the two read as one from → to decision. The
              here card covers whatever fills the view (map, block or tunnel);
              the target only exists on the open map. */}
          {!isPhone && (hereSlot || (desktopTarget && targetSlot)) && (
            <div
              className="pointer-events-none absolute z-[600] flex items-end justify-center gap-2"
              style={{
                // Inside a block the card sits under the building, not the map.
                left: hdb ? hdbPanelInset.left : HUD_EDGE,
                right: hdb ? hdbPanelInset.right : HUD_EDGE + (timelineFull ? tlW + HUD_GAP : 0),
                bottom: HUD_BOTTOM,
              }}
            >
              {hereSlot && (
                // Measured for the camera inset. Only the here card counts: it
                // changes when you arrive (the camera moves anyway), while
                // picking a target must not shove the map out from under the
                // cursor.
                <div ref={pairRef} className="flex min-w-0 max-w-[28rem] flex-1 flex-col">
                  <HudCard
                    title={hereTitle}
                    collapsed={hereCollapsed}
                    onToggleCollapse={() => setHereCollapsed((c) => !c)}
                  >
                    {hereSlot}
                  </HudCard>
                </div>
              )}
              {hereSlot && desktopTarget && targetSlot && (
                <span
                  className="shrink-0 self-center text-title text-signal/70 [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]"
                  aria-hidden
                >
                  →
                </span>
              )}
              {desktopTarget && targetSlot && (
                <HudCard
                  title={targetSlot.title}
                  onClose={targetSlot.onClose}
                  className="min-w-0 max-w-[28rem] flex-1"
                >
                  {targetSlot.body}
                </HudCard>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================= COLUMN 4: timeline — or the encounter panel, which
           takes the column over for the duration of a fight ================= */}
      {isPhone && (
      <aside
        className={`min-w-0 overflow-hidden border-white/10 bg-concrete-900/70 p-3 max-lg:flex-col lg:flex lg:w-[35vw] lg:min-w-[320px] lg:shrink-0 lg:border-l lg:p-2.5 ${
          mobileView === 'log' ? show(true) : 'hidden'
        } lg:flex lg:flex-col transition-all duration-300 ${
          contactGate && !isPhone
            ? // Desktop: the one lit thing on the screen while the decision is open.
              'relative z-[760] ring-2 ring-inset ring-hiss shadow-[0_0_60px_-5px_rgba(217,45,45,0.55)]'
            : inCombat && !isPhone
              ? 'ring-1 ring-inset ring-hiss/50'
              : ''
        }`}
      >
        {/* Desktop: fight replaces the timeline once Fight is chosen.
             Phone: Map owns CombatPanel — Log stays history + settings. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {inCombat && !contactGate && !isPhone ? (
            <CombatPanel onOpenGuide={setGuideTopic} />
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
      )}

      {!isPhone && desktopHud}

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
              <span className="text-label uppercase text-signal/70">
                {t('ui.game.youAreHere')}
              </span>
              <button
                type="button"
                onClick={() => setHereSheetOpen(false)}
                className="text-body text-white/40 hover:text-white/70"
              >
                {t('ui.common.close')}
              </button>
            </div>
            {hereSlot}
          </div>
        </div>
      )}

      {/* ================= MOBILE bottom nav ================= */}
      <nav
        className="relative z-[710] flex shrink-0 border-t border-white/10 bg-concrete-900 pb-[env(safe-area-inset-bottom,0px)] text-micro lg:hidden"
        style={{ minHeight: 'calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px))' }}
      >
        <NavBtn
          label={<><Icon name="action.map" /> {t('ui.phone.map')}</>}
          active={phoneOnMap}
          onClick={() => goToPhoneTab('map')}
          pulse={
            !!(pendingEvent || pendingSearch || inCombat) &&
            !phoneOnMap &&
            !hdb &&
            !tunnel
          }
        />
        <NavBtn
          label={<><Icon name="action.status" /> {t('ui.phone.status')}</>}
          active={!sidePanel && mobileView === 'hub'}
          onClick={() => goToPhoneTab('hub')}
        />
        <NavBtn
          label={<><Icon name="action.inventory" /> {t('ui.phone.stash')}</>}
          active={sidePanel === 'inventory'}
          onClick={() => goToPhoneTab('inventory')}
        />
        <NavBtn
          label={<><Icon name="action.craft" /> {t('ui.phone.craft')}</>}
          active={sidePanel === 'craft'}
          onClick={() => goToPhoneTab('craft')}
        />
        <NavBtn
          label={<><Icon name="action.log" /> {t('ui.phone.log')}</>}
          active={!sidePanel && mobileView === 'log'}
          onClick={() => goToPhoneTab('log')}
        />
      </nav>

      {/* ================= overlays ================= */}
      {ghostOffer && (
        <div className="absolute inset-0 z-[1150] flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-sm rounded-lg border border-signal/40 bg-concrete-900 p-5 shadow-signage">
            <h3 className="text-plate uppercase text-signal">A survivor, still standing</h3>
            <p className="mt-3 text-read text-concrete-200">
              They lived where your predecessor did not. One trade, then they're gone:
            </p>
            <div className="mt-3 flex items-center justify-between rounded border border-concrete-600 bg-black/40 px-3 py-2 text-read">
              <span className="text-hiss">− {itemDef(ghostOffer.wantDefId).name}</span>
              <span className="text-concrete-400">→</span>
              <span className="text-signal">+ {itemDef(ghostOffer.giveDefId).name}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={acceptGhostTrade}
                className="flex-1 rounded bg-signal/80 py-2 text-read font-bold text-black hover:bg-signal"
              >
                Trade
              </button>
              <button
                onClick={declineGhostTrade}
                className="flex-1 rounded border border-concrete-600 py-2 text-read hover:bg-white/5"
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
      <LimbCoachModal bodyParts={bodyParts} onOpenGuide={setGuideTopic} />
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
  const { t } = useT();
  return (
    <section
      className={`flex-col rounded-lg border p-2.5 ${
        accent ? 'border-signal/40 bg-signal/[0.04]' : 'border-white/15 bg-concrete-900/80'
      } ${className || 'flex'}`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`text-label uppercase ${
            accent ? 'text-signal/70' : 'text-white/40'
          }`}
        >
          {title}
        </span>
        {onClose && (
          <button onClick={onClose} className="text-body text-white/40 hover:text-white/70">
            {t('ui.common.close')}
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
