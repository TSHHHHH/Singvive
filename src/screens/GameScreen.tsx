import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { GameMap, type MapPoint } from '../components/GameMap';
import { MapBubble } from '../components/MapBubble';
import { useMrtNetwork } from '../components/MrtOverlay';
import {
  displayLine,
  mrtRouteBetween,
  neighbours,
  tunnelSegmentBetween,
  type MrtNetwork,
} from '../game/mrt';
import { ConditionPanel } from '../components/ConditionPanel';
import { StatsPanel } from '../components/StatsPanel';
import { LogPanel } from '../components/LogPanel';
import { CombatPanel } from '../components/CombatPanel';
import { PhoneStatusBar } from '../components/PhoneStatusBar';
import { MapMiniLog } from '../components/MapMiniLog';
import { Icon } from '../icons/Icon';
import { LocationCard, type Departure } from '../components/LocationCard';
import { TrekCard } from '../components/TrekCard';
import { InventoryPanel } from '../components/Inventory/InventoryPanel';
import { CraftingPanel } from '../components/CraftingPanel';
import { StashLogbook } from '../components/StashLogbook';
import { SettingsModal } from '../components/SettingsModal';
import { DigitalClock } from '../components/DigitalClock';
import { WeatherBadge } from '../components/WeatherBadge';
import { ObjectiveBar } from '../components/ObjectiveBar';
import { ObjectivesPanel } from '../components/ObjectivesPanel';
import { DayLogsModal } from '../components/DayLogsModal';
import { HdbDungeonModal } from '../components/HdbDungeonModal';
import { TraderModal } from '../components/TraderModal';
import { TunnelRunView } from '../components/TunnelRunView';
import { itemDef } from '../game/loot';
import { estimateExpedition } from '../game/travel';
import { unplayableMessage, walkabilityOf } from '../game/playable';
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
import { POI_CONFIG } from '../game/poi';
import {
  hazardZonesNear,
  hazardsOnPath,
  trekRisk,
  TREK_MIN_DISTANCE_M,
} from '../game/wilds';
import type { LocationState } from '../game/types';
import type { IconName } from '../icons/keys';

type MobileView = 'map' | 'hub' | 'log';

/**
 * Which body the slide-out panel is showing. null = closed. Everything that
 * wants more room than the rail can give lands here, objectives included —
 * there is exactly one place detail opens.
 */
type SidePanel = 'inventory' | 'craft' | 'logbook' | 'stats' | 'objective';

const SIDE_PANELS: Record<SidePanel, { label: string; icon: IconName }> = {
  inventory: { label: 'Inventory', icon: 'action.inventory' },
  craft: { label: 'Craft', icon: 'action.craft' },
  logbook: { label: 'Logbook', icon: 'action.logbook' },
  stats: { label: 'Stats', icon: 'action.stats' },
  objective: { label: 'Objectives', icon: 'action.objectives' },
};

/** Rail switchers — objectives opens from its own bar. */
const PANEL_BUTTONS: SidePanel[] = ['inventory', 'craft', 'logbook', 'stats'];

const listOf = (names: string[]): string =>
  names.length <= 1 ? names[0] ?? 'nowhere' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * Why a station you can see on the overlay isn't somewhere you can head for:
 * how far down the line it is, and which platforms this tunnel actually joins.
 */
function tunnelDirections(net: MrtNetwork, here: LocationState, sel: LocationState): string {
  const route = mrtRouteBetween(here, sel);
  const exits = neighbours(net, here.mrtStationId!).map((n) => n.station.name);
  const where = route
    ? `${route.stops} stops down the ${displayLine(net, route.legs[0].line).name}`
    : 'not on a line that runs from here';
  return `${sel.name} is ${where}. From this platform the tunnel only reaches ${listOf(exits)}.`;
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
    callEvac,
    travel,
    enter,
    trek,
    tunnelEnter,
    tunnel,
    rest,
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
      callEvac: s.callEvac,
      travel: s.travel,
      enter: s.enter,
      trek: s.trek,
      tunnelEnter: s.tunnelEnter,
      tunnel: s.tunnel,
      rest: s.rest,
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
  // Where the target card's tail should point, in map-container pixels. The map
  // owns this — it's the only thing that can project a lat/lng — and hands it
  // back so the card can be rendered here, over the map but outside Leaflet.
  const [bubblePoint, setBubblePoint] = useState<MapPoint | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dayLogsOpen, setDayLogsOpen] = useState(false);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number; token: number } | null>(
    null,
  );

  const focusStashOnMap = useCallback((lat: number, lng: number) => {
    setMapFocus((prev) => ({ lat, lng, token: (prev?.token ?? 0) + 1 }));
    setMobileView('map');
    setSidePanel(null);
  }, []);

  // An event now lives in the timeline (right column) rather than a blocking
  // modal. On mobile the log is a separate tab, so pull the player to it.
  // A fight takes the same column, so pull mobile there too.
  useEffect(() => {
    if (pendingEvent || combat) setMobileView('log');
  }, [pendingEvent, combat]);

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
  const blipRange = useMemo(() => {
    const awarenessValue = character
      ? awareness(
          character.attributes.perception,
          equipAwarenessMod(equipment),
          traitAwarenessMod(character.traitIds),
        )
      : 0;
    return travelRange + blipMargin(awarenessValue);
  }, [character, equipment, travelRange]);

  // Hazards densify as the horde climbs — early map is sparse, late map contested.
  const hazardPressure = hordeIntensity(hordeLevel);
  const sensedHazards = useMemo(
    () =>
      hazardZonesNear(
        seed,
        currentPos.lat,
        currentPos.lng,
        blipRange,
        spawn ?? undefined,
        hazardPressure,
      ),
    [seed, currentPos.lat, currentPos.lng, blipRange, spawn, hazardPressure],
  );

  const trekDist = trekTarget
    ? Math.round(haversine(currentPos.lat, currentPos.lng, trekTarget.lat, trekTarget.lng))
    : 0;

  const est = useMemo(
    () =>
      sel && character
        ? estimateExpedition(
            Math.round(haversine(currentPos.lat, currentPos.lng, sel.lat, sel.lng)),
            sel.category,
            character.attributes,
            meters.energy,
            hour,
            weather,
            encumbered,
            legFactor,
          )
        : null,
    [sel, character, currentPos.lat, currentPos.lng, meters.energy, hour, weather, encumbered, legFactor],
  );

  const trekEst = useMemo(
    () =>
      trekTarget && character
        ? estimateExpedition(
            trekDist,
            'fuel', // only the travel leg is used — there's nothing out there to search
            character.attributes,
            meters.energy,
            hour,
            weather,
            encumbered,
            legFactor,
          )
        : null,
    [trekTarget, character, trekDist, meters.energy, hour, weather, encumbered, legFactor],
  );

  const trekInfo = useMemo(() => {
    if (!trekTarget || !character) return null;
    const sensedIds = new Set(sensedHazards.map((z) => z.id));
    const onPath = hazardsOnPath(
      seed,
      currentPos,
      trekTarget,
      spawn ?? undefined,
      hazardPressure,
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
          // Bleeding shows up in the quoted risk too, so the player can weigh
          // "patch up first" against "chance it" before committing to a route.
          traitEncounterMod:
            sumTraitMod(character.traitIds, 'encounterChanceMod') +
            equipEncounterChanceMod(equipment) +
            bleedEncounterMod(bodyParts),
          safe: spawn ?? undefined,
        },
        known,
      ),
      // The route leaves the sensed bubble entirely — the quote is a guess.
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
  ]);

  // Held only so the ride card re-renders once the network arrives; the routing
  // itself reads the same cached copy through mrtRouteBetween.
  const mrtNet = useMrtNetwork();

  if (!spawn) return null;

  const selHere = sel ? sel.id === currentPositionId : false;

  const here = currentPositionId ? locations[currentPositionId] : null;
  // Nothing runs any more, so a trip is one segment on foot: you can only head
  // for the next station down the line. Neither end has to be cleared — the
  // stairs down are open, and what's at the far end is the point of going.
  const bothStations = !!(
    sel &&
    sel.isMrtStation &&
    sel.id !== currentPositionId &&
    here?.isMrtStation
  );
  const tunnelSeg = bothStations && here && sel ? tunnelSegmentBetween(here, sel) : null;

  // A station further down the line isn't a target — but silence there reads as
  // a bug, so say how far it is and what this platform actually reaches.
  const tunnelHint =
    bothStations && !tunnelSeg && mrtNet && here?.mrtStationId && sel
      ? tunnelDirections(mrtNet, here, sel)
      : null;

  // The platform's own line map. This is how a run actually starts: the station
  // at the far end is usually undiscovered, and fog gives it no marker to click.
  const departures: Departure[] =
    mrtNet && here?.mrtStationId
      ? neighbours(mrtNet, here.mrtStationId).map((seg) => ({
          seg,
          known: locationList.some((l) => l.mrtStationId === seg.station.id),
        }))
      : [];

  const openStash = () => setSidePanel('inventory');

  const selDist = sel
    ? Math.round(haversine(currentPos.lat, currentPos.lng, sel.lat, sel.lng))
    : 0;
  const selOutOfRange = !!sel && !selHere && selDist > travelRange;

  const cardProps = sel && {
    sel,
    here: selHere,
    est,
    energyLow: meters.energy < 5,
    outOfRange: selOutOfRange,
    canTunnel: !!tunnelSeg,
    tunnelSeg,
    tunnelHint,
    onTravel: () => travel(sel.id),
    onEnter: enter,
    onTunnel: () => sel.mrtStationId && tunnelEnter(sel.mrtStationId),
    onOpenStash: openStash,
  };

  // Persistent "you are here" card — always available once you've reached a
  // location, independent of whatever you're inspecting/planning to travel to.
  const hereProps = here && {
    sel: here,
    here: true,
    est: null,
    energyLow: meters.energy < 5,
    canTunnel: false,
    departures,
    onDepart: tunnelEnter,
    onTravel: () => travel(here.id),
    onEnter: enter,
    onTunnel: () => {},
    onOpenStash: openStash,
    onEnterBlock: hdbEnter,
  };

  // extraction goal + doom clock + dual-path score
  const evacZone = evacZoneId ? locations[evacZoneId] : null;
  const atEvac = !!evacZoneId && currentPositionId === evacZoneId;
  const readiness = evacReadiness(items, day);
  const evacReady = readiness.ready;
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
              arrivalAtNight={trekEst.arrivalAtNight}
              onTrek={() => {
                trek(trekTarget.lat, trekTarget.lng);
                setTrekTarget(null);
              }}
              onCancel={() => setTrekTarget(null)}
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

  const hereSlot: ReactNode = hereProps ? (
    <>
      <LocationCard {...hereProps} />
      {atEvac && (
        <button
          onClick={callEvac}
          disabled={!evacReady}
          className="mt-2 w-full rounded-lg bg-signal/80 py-2 text-sm font-bold text-black transition hover:bg-signal disabled:opacity-30"
        >
          {evacReady ? <><Icon name="action.evac" /> Call for evac — escape!</> : 'Not ready to extract'}
        </button>
      )}
    </>
  ) : !worldLoading ? (
    // Standing on bare ground — no site card to show, so say so plainly and
    // point at the only two things you can do from here.
    <>
      <div className="text-sm text-white/70">Nowhere in particular.</div>
      <div className="mt-1 text-xs text-white/40">
        No shelter, no stash, nothing to search. Tap a building to head for it, or tap bare ground
        to keep moving. Sleeping out here barely counts as sleep.
      </div>
    </>
  ) : null;

  const hereTitle: ReactNode = hereProps ? (
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
   * until a stance is committed. The moment it is, the world comes back up and
   * the fight resolves itself.
   */
  const stanceGate = !!combat?.awaitingStance;
  const backgrounded = `transition-all duration-300 ${
    stanceGate ? 'pointer-events-none select-none opacity-25 saturate-50' : ''
  }`;

  return (
    <div className="relative flex h-full flex-col lg:flex-row">
      <PhoneStatusBar onOpenStatus={() => setMobileView('hub')} />

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
            <button
              onClick={rest}
              className="shrink-0 rounded border border-white/15 px-2.5 py-1 text-xs transition hover:bg-white/5"
            >
              <Icon name="action.sleep" /> Rest
            </button>
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
              readinessRatio={readiness.ratio}
              onOpen={() => setSidePanel((p) => (p === 'objective' ? null : 'objective'))}
            />

            <ConditionPanel />

            {/* --- the panel switchers --- */}
            <div className="grid grid-cols-2 gap-1.5">
              {PANEL_BUTTONS.map((id) => {
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
           reflows when you check your pack. */}
      {/* Closed, it parks fully off the left edge — on lg that means clearing its
          own 360px plus the 340px rail it is offset by, so it slides out from
          behind the rail instead of fading in on top of it. */}
      <div
        className={`absolute inset-y-0 left-0 z-[700] w-full transition-transform duration-200 ease-out lg:left-[340px] lg:w-[360px] ${
          sidePanel
            ? 'translate-x-0'
            : 'pointer-events-none -translate-x-full lg:-translate-x-[700px]'
        } ${backgrounded}`}
      >
        <div className="flex h-full flex-col border-r border-white/10 bg-concrete-900 shadow-2xl">
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
            {sidePanel === 'inventory' && <InventoryPanel />}
            {sidePanel === 'craft' && <CraftingPanel />}
            {sidePanel === 'logbook' && <StashLogbook onFocusLocation={focusStashOnMap} />}
            {sidePanel === 'stats' && <StatsPanel />}
            {sidePanel === 'objective' && (
              <ObjectivesPanel
                evacZoneName={evacZone?.name ?? null}
                evacDist={evacDist}
                atEvac={atEvac}
                readinessCurrent={readiness.current}
                readinessRequired={readiness.required}
                readinessRatio={readiness.ratio}
                dayMult={dayMult}
                projectedScore={projectedScore}
                projectedEvacBonus={projectedEvacBonus}
                windowText={windowText}
                urgent={evacUrgent}
                doom={doom}
                doomColor={doomColor}
                doomLabel={hordeLabel(doom)}
                evacReady={evacReady}
                onEvac={callEvac}
              />
            )}
          </div>
        </div>
      </div>

      {/* ================= COLUMN 3: map — or the HDB block / the tunnel, each
           of which takes the whole view for the duration ================= */}
      <div
        className={`relative lg:flex lg:flex-1 ${
          mobileView === 'map' || hdb || tunnel ? show(true) : 'hidden'
        } lg:flex ${backgrounded}`}
      >
        {tunnel ? (
          <TunnelRunView />
        ) : hdb ? (
          <HdbDungeonModal />
        ) : (
          <>
            <GameMap
              home={currentPos}
              pois={locationList}
              selectedId={sel?.id ?? null}
              hereId={currentPositionId}
              travelRange={travelRange}
              blipRange={blipRange}
              exploredArea={exploredArea}
              travelAnim={travelAnim}
              evacZoneId={evacZoneId}
              noisePulses={noisePulses}
              vitals={mapVitals}
              hazards={sensedHazards}
              weather={weather}
              time={time}
              trekTarget={trekTarget}
              bubbleAnchor={bubbleAnchor}
              onBubblePoint={setBubblePoint}
              focusTarget={mapFocus}
              onSelect={selectPoi}
              onPickGround={pickGround}
            />
            {/* The target card, floated over the thing it describes. A fight
                owns the moment, so it stands down for the duration. */}
            {targetSlot && bubblePoint && (
              <MapBubble
                point={bubblePoint}
                title={targetSlot.title}
                onClose={targetSlot.onClose}
              >
                {targetSlot.body}
              </MapBubble>
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

      {/* Fight / event live in the Timeline tab on phones — keep a way back
          from Map, HDB, or Tunnel without hunting for the nav pulse. Sits
          outside the stance-gated columns so it stays tappable. Below the
          phone status bar so both stay readable. */}
      {(combat || pendingEvent) &&
        mobileView !== 'log' &&
        (mobileView === 'map' || !!hdb || !!tunnel) && (
          <button
            type="button"
            onClick={() => setMobileView('log')}
            className="absolute inset-x-0 z-[760] p-2 lg:hidden"
            style={{ top: 'var(--mobile-status-bar-h)' }}
          >
            <div className="rounded border border-hiss/50 bg-hiss/20 px-2 py-1.5 text-center text-xs font-semibold text-hiss shadow-lg backdrop-blur">
              {combat ? 'Contact — tap for Fight' : 'Someone wants a word — tap for Log'}
            </div>
          </button>
        )}

      {/* ================= COLUMN 4: timeline — or the encounter panel, which
           takes the column over for the duration of a fight ================= */}
      <aside
        className={`min-w-0 overflow-hidden border-white/10 bg-concrete-900/70 p-3 max-lg:flex-col lg:flex lg:w-[35vw] lg:min-w-[320px] lg:shrink-0 lg:border-l lg:p-2.5 ${
          mobileView === 'log' ? show(true) : 'hidden'
        } lg:flex lg:flex-col transition-all duration-300 ${
          stanceGate
            ? // The one lit thing on the screen while the decision is open.
              'relative z-[760] ring-2 ring-inset ring-hiss shadow-[0_0_60px_-5px_rgba(217,45,45,0.55)]'
            : combat
              ? 'ring-1 ring-inset ring-hiss/50'
              : ''
        }`}
      >
        {/* The timeline takes what's left after the location block below it.
             A pending encounter does *not* take the column over — it lands as
             the newest node *inside* the still-visible log (see
             EncounterPrompt), and the fight proper only replaces the timeline
             once a stance is committed. The log therefore stays fully live
             during the gate: it now holds the only decision on the screen. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {combat && !stanceGate ? (
            <CombatPanel />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <LogPanel
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenDayLogs={() => setDayLogsOpen(true)}
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
            stanceGate ? 'pointer-events-none select-none opacity-25' : ''
          }`}
        >
          <RailSection title={hereTitle} accent={!!hereProps}>
            {hereSlot}
          </RailSection>
        </div>
      </aside>

      {/* Slim "you are here" bar on the map tab — enough to search or stash
          without leaving the map. */}
      {hereProps && !hdb && !tunnel && mobileView === 'map' && (
        <HereCompactBar
          sel={hereProps.sel}
          atEvac={atEvac}
          evacReady={evacReady}
          onSearch={enter}
          onOpenStash={openStash}
          onEvac={callEvac}
        />
      )}

      {/* Two newest log lines on the phone map — above the here bar / nav. */}
      {!hdb && !tunnel && mobileView === 'map' && (
        <MapMiniLog
          onOpenLog={() => setMobileView('log')}
          aboveHereBar={!!hereProps}
        />
      )}

      {/* ================= MOBILE bottom nav ================= */}
      <nav
        className={`flex shrink-0 border-t border-white/10 bg-concrete-900 pb-[env(safe-area-inset-bottom,0px)] text-xs lg:hidden ${backgrounded}`}
        style={{ minHeight: 'calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px))' }}
      >
        <NavBtn label={<><Icon name="action.map" /> Map</>} active={mobileView === 'map'} onClick={() => setMobileView('map')} />
        <NavBtn
          label={<><Icon name="action.status" /> Status</>}
          active={mobileView === 'hub'}
          onClick={() => setMobileView('hub')}
        />
        <NavBtn
          label={<><Icon name="action.inventory" /> Inventory</>}
          active={sidePanel === 'inventory'}
          onClick={() => setSidePanel((v) => (v === 'inventory' ? null : 'inventory'))}
        />
        <NavBtn
          label={combat ? <><Icon name="combat.hostiles" /> Fight</> : <><Icon name="action.log" /> Log</>}
          active={mobileView === 'log'}
          pulse={!!(pendingEvent || combat) && mobileView !== 'log'}
          onClick={() => setMobileView('log')}
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
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {dayLogsOpen && <DayLogsModal onClose={() => setDayLogsOpen(false)} />}
      {/* Gated on store state rather than local state: the counter belongs to
          the place you're standing in, not to a button in this screen. */}
      <TraderModal />
    </div>
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
        accent ? 'border-signal/40 bg-signal/[0.04]' : 'border-white/10 bg-black/30'
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
      onClick={onClick}
      className={`relative flex min-h-[44px] flex-1 items-center justify-center py-2.5 font-semibold transition ${
        active ? 'bg-white/5 text-signal' : pulse ? 'text-concrete-50' : 'text-white/50'
      }`}
    >
      {label}
      {pulse && (
        <span className="absolute right-3 top-1.5 h-2 w-2 animate-pulse rounded-full bg-signal" />
      )}
    </button>
  );
}

/** Mobile-only: the "here" card boiled down to a bar, so the map stays visible. */
function HereCompactBar({
  sel,
  atEvac,
  evacReady,
  onSearch,
  onOpenStash,
  onEvac,
}: {
  sel: LocationState;
  atEvac: boolean;
  evacReady: boolean;
  onSearch: () => void;
  onOpenStash: () => void;
  onEvac: () => void;
}) {
  const cfg = POI_CONFIG[sel.category];
  const occupied = !!sel.factionId;
  return (
    <div
      className="pointer-events-auto absolute left-3 right-3 z-[640] flex items-center gap-2 rounded-lg border border-signal/40 bg-concrete-900/95 px-3 py-2 shadow-2xl lg:hidden"
      style={{
        bottom:
          'calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px) + 0.5rem)',
      }}
    >
      <Icon name={cfg.icon} size={18} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{sel.name}</div>
        <div className="text-xs text-signal/70"><Icon name="action.here" /> here</div>
      </div>
      {atEvac ? (
        <button
          onClick={onEvac}
          disabled={!evacReady}
          className="shrink-0 rounded bg-signal/80 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-30"
        >
          <Icon name="action.evac" /> Evac
        </button>
      ) : (
        <>
          <button
            onClick={onSearch}
            disabled={!occupied && sel.exhausted}
            className="shrink-0 rounded bg-signal/80 px-2.5 py-1.5 text-xs font-bold text-black disabled:opacity-30"
          >
            {occupied ? 'Gate' : sel.exhausted ? 'Empty' : 'Go in'}
          </button>
          <button
            onClick={onOpenStash}
            className="shrink-0 rounded border border-white/15 px-2.5 py-1.5 text-xs"
          >
            <Icon name="action.stash" />
          </button>
        </>
      )}
    </div>
  );
}
