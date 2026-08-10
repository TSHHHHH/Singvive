import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../game/store';
import { GameMap } from '../components/GameMap';
import { StatusPanel } from '../components/StatusPanel';
import { LogPanel } from '../components/LogPanel';
import { CombatPanel } from '../components/CombatPanel';
import { Icon } from '../icons/Icon';
import { LocationCard } from '../components/LocationCard';
import { TrekCard } from '../components/TrekCard';
import { InventoryPanel } from '../components/Inventory/InventoryPanel';
import { StashLogbook } from '../components/StashLogbook';
import { SettingsModal } from '../components/SettingsModal';
import { DigitalClock } from '../components/DigitalClock';
import { WeatherBadge } from '../components/WeatherBadge';
import { ObjectivesModal } from '../components/ObjectivesModal';
import { HdbDungeonModal } from '../components/HdbDungeonModal';
import { itemDef } from '../game/loot';
import { estimateExpedition } from '../game/travel';
import { legTravelFactor } from '../game/survival';
import { isEncumbered } from '../game/inventory';
import { haversine } from '../game/overpass';
import { rollWeather, timeOfDay, weatherEncounterMod } from '../game/weather';
import { awareness, blipMargin, travelableRange } from '../game/fog';
import { equipAwarenessMod, sumTraitMod, traitAwarenessMod } from '../game/character';
import { evacChecklist, hasEvacKit, hordeIntensity, hordeLabel } from '../game/goal';
import { Rng } from '../game/rng';
import { POI_CONFIG } from '../game/poi';
import {
  hazardZonesNear,
  hazardsOnPath,
  trekRisk,
  TREK_MIN_DISTANCE_M,
} from '../game/wilds';
import type { LocationState } from '../game/types';

type MobileView = 'map' | 'hub' | 'log';

export function GameScreen() {
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
    callEvac,
    travel,
    trek,
    mrtTravel,
    rest,
    meters,
    character,
    hour,
    day,
    seed,
    kills,
    items,
    equipment,
    bodyParts,
    exploredArea,
  } = useGame();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A spot on bare map the player is considering walking to. Mutually exclusive
  // with a selected POI — you're deciding about one thing at a time.
  const [trekTarget, setTrekTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [logbookOpen, setLogbookOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [objectivesOpen, setObjectivesOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  // An event now lives in the timeline (right column) rather than a blocking
  // modal. On mobile the log is a separate tab, so pull the player to it.
  // A fight takes the same column, so pull mobile there too.
  useEffect(() => {
    if (pendingEvent || combat) setMobileView('log');
  }, [pendingEvent, combat]);

  const locationList = useMemo(() => Object.values(locations), [locations]);
  if (!spawn) return null;

  const sel = selectedId ? locations[selectedId] ?? null : null;
  const weather = rollWeather(new Rng(seed), day);
  const time = timeOfDay(hour);
  const encumbered = character ? isEncumbered(items, character.attributes, equipment) : false;

  const travelRange = character
    ? travelableRange(character.attributes, meters.energy, legTravelFactor(bodyParts), weather, encumbered)
    : 400;
  const awarenessValue = character
    ? awareness(character.attributes.perception, equipAwarenessMod(equipment), traitAwarenessMod(character.traitIds))
    : 0;
  const blipRange = travelRange + blipMargin(awarenessValue);
  const selHere = sel ? sel.id === currentPositionId : false;

  const here = currentPositionId ? locations[currentPositionId] : null;
  const canMrt = !!(
    sel &&
    sel.isMrtStation &&
    sel.cleared &&
    sel.id !== currentPositionId &&
    here?.isMrtStation &&
    here.cleared
  );

  const est =
    sel && character
      ? estimateExpedition(
          Math.round(haversine(currentPos.lat, currentPos.lng, sel.lat, sel.lng)),
          sel.category,
          character.attributes,
          meters.energy,
          hour,
          weather,
          encumbered,
          legTravelFactor(bodyParts),
        )
      : null;

  const openStash = () => {
    setInventoryOpen(true);
  };

  const selDist = sel
    ? Math.round(haversine(currentPos.lat, currentPos.lng, sel.lat, sel.lng))
    : 0;
  const selOutOfRange = !!sel && !selHere && selDist > travelRange;

  // --- open ground -------------------------------------------------------
  // Hazards are sensed the same way blips are: out to the awareness ring, never
  // beyond. Everything drawn and everything quoted on the trek card comes from
  // this set — the store rolls against the real field, which may be worse.
  const sensedHazards = hazardZonesNear(seed, currentPos.lat, currentPos.lng, blipRange);

  const trekDist = trekTarget
    ? Math.round(haversine(currentPos.lat, currentPos.lng, trekTarget.lat, trekTarget.lng))
    : 0;
  const trekEst =
    trekTarget && character
      ? estimateExpedition(
          trekDist,
          'fuel', // only the travel leg is used — there's nothing out there to search
          character.attributes,
          meters.energy,
          hour,
          weather,
          encumbered,
          legTravelFactor(bodyParts),
        )
      : null;
  const trekInfo =
    trekTarget && character
      ? (() => {
          const sensedIds = new Set(sensedHazards.map((z) => z.id));
          const onPath = hazardsOnPath(seed, currentPos, trekTarget);
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
                traitEncounterMod: sumTraitMod(character.traitIds, 'encounterChanceMod'),
              },
              known,
            ),
            // The route leaves the sensed bubble entirely — the quote is a guess.
            blind: trekDist > blipRange,
          };
        })()
      : null;

  const pickGround = (lat: number, lng: number) => {
    setSelectedId(null);
    setTrekTarget({ lat, lng });
  };

  const cardProps = sel && {
    sel,
    here: selHere,
    est,
    energyLow: meters.energy < 5,
    outOfRange: selOutOfRange,
    canMrt,
    onTravel: () => travel(sel.id),
    onMrt: () => mrtTravel(sel.id),
    onOpenStash: openStash,
  };

  // Persistent "you are here" card — always available once you've reached a
  // location, independent of whatever you're inspecting/planning to travel to.
  const hereProps = here && {
    sel: here,
    here: true,
    est: null,
    energyLow: meters.energy < 5,
    canMrt: false,
    onTravel: () => travel(here.id),
    onMrt: () => {},
    onOpenStash: openStash,
    onEnterBlock: hdbEnter,
  };

  // extraction goal + doom clock
  const evacZone = evacZoneId ? locations[evacZoneId] : null;
  const atEvac = !!evacZoneId && currentPositionId === evacZoneId;
  const evacReady = hasEvacKit(items);
  const checklist = evacChecklist(items);
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

  const show = (mobile: boolean) => (mobile ? 'flex flex-1 min-h-0' : 'hidden');

  return (
    <div className="relative flex h-full flex-col md:flex-row">
      {/* ============ LEFT: interaction hub (brought up; bottom-left corner is
           given to the location dock below) ============ */}
      <aside
        className={`flex-col border-white/10 bg-concrete-900/70 md:flex md:h-[calc(100%-21rem)] md:w-[400px] md:shrink-0 md:self-start md:border-r ${
          mobileView === 'hub' ? show(true) : 'hidden'
        } md:flex`}
      >
        {/* header */}
        <div className="shrink-0 space-y-2 border-b border-white/10 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate font-bold text-signal">{character?.name}</span>
            <span className="text-white/50"><Icon name="action.kills" /> {kills}</span>
          </div>

          <DigitalClock day={day} hour={hour} band={time} />

          <div className="flex items-center justify-between text-xs text-white/50">
            <WeatherBadge weather={weather} />
          </div>

          <button
            onClick={() => setObjectivesOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-left text-sm transition hover:bg-signal/15"
          >
            <span className="font-semibold text-signal"><Icon name="action.objectives" /> Objectives</span>
            {evacZone ? (
              <span
                className={`text-xs ${
                  evacUrgent ? 'animate-pulse text-hiss' : 'text-concrete-200'
                }`}
              >
                {atEvac ? '🚁 at evac' : windowText ? `⏳ ${windowText}` : `${evacDist} m`}
              </span>
            ) : (
              <span className="text-xs text-white/40">view</span>
            )}
          </button>
        </div>

        {/* status — always on screen so item use gives live feedback */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <StatusPanel />
        </div>

        {/* global actions */}
        <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-white/10 p-3">
          <button
            onClick={rest}
            className="rounded border border-white/15 py-2 text-xs hover:bg-white/5"
          >
            <Icon name="action.sleep" /> Sleep
          </button>
          <button
            onClick={() => setInventoryOpen((v) => !v)}
            className={`rounded border py-2 text-xs transition ${
              inventoryOpen
                ? 'border-signal bg-signal/15 text-signal'
                : 'border-white/15 hover:bg-white/5'
            }`}
          >
            <Icon name="action.inventory" /> Inventory
          </button>
          <button
            onClick={() => setLogbookOpen(true)}
            className="rounded border border-white/15 py-2 text-xs hover:bg-white/5"
          >
            <Icon name="action.logbook" /> Logbook
          </button>
        </div>
      </aside>

      {/* ============ Inventory slide-out — beside the status panel so using an
           item shows real-time meter feedback ============ */}
      <div
        className={`absolute inset-y-0 left-0 z-[700] w-full transition-all duration-200 md:left-[400px] md:w-[380px] ${
          inventoryOpen
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none -translate-x-full opacity-0'
        }`}
      >
        <div className="flex h-full flex-col border-r border-white/10 bg-concrete-900 shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-3">
            <h3 className="text-sm font-bold text-signal"><Icon name="action.inventory" /> Inventory</h3>
            <button
              onClick={() => setInventoryOpen(false)}
              className="text-xs text-white/40 hover:text-white/70"
            >
              ✕ close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <InventoryPanel />
          </div>
        </div>
      </div>

      {/* ============ CENTER: map — or the HDB block, which takes the whole
           view for the duration of the delve ============ */}
      <div
        className={`relative md:flex md:flex-1 ${
          mobileView === 'map' || hdb ? show(true) : 'hidden'
        } md:flex`}
      >
        {hdb ? (
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
          vitals={{
            bleeding: Object.values(bodyParts).some((p) => p.bleeding),
            exhausted: meters.energy < 25,
            infected: meters.infection >= 35,
          }}
          hazards={sensedHazards}
          trekTarget={trekTarget}
          onSelect={(loc: LocationState) => {
            setTrekTarget(null);
            setSelectedId(loc.id);
          }}
          onPickGround={pickGround}
        />
        {worldLoading && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/70">
            <p className="animate-pulse text-white/70">Loading the neighbourhood…</p>
          </div>
        )}
        {worldError && (
          <div className="absolute bottom-2 left-2 z-[500] max-w-xs rounded bg-black/85 px-3 py-1.5 text-[11px] text-concrete-50">
            {worldError}
          </div>
        )}
          </>
        )}
      </div>

      {/* ============ RIGHT: game log — or the encounter panel, which takes the
           column over for the duration of a fight ============ */}
      <aside
        className={`min-w-0 overflow-hidden border-white/10 bg-concrete-900/70 p-3 md:flex md:w-[20vw] md:min-w-[220px] md:max-w-[340px] md:shrink-0 md:border-l md:p-2.5 ${
          mobileView === 'log' ? show(true) : 'hidden'
        } md:flex md:flex-col ${combat ? 'ring-1 ring-inset ring-hiss/50' : ''}`}
      >
        {combat ? <CombatPanel /> : <LogPanel onOpenSettings={() => setSettingsOpen(true)} />}
      </aside>

      {/* ============ LOCATION DOCK — the bottom-left corner is theirs ============
           Target sits on top (what you're deciding about), "here" below it — and
           on desktop the stack is the same width as the left hub (400px). On
           mobile, when a target is also up, "here" collapses to a slim action
           bar instead of a second full card, so the map stays visible. */}
      <div
        className={`pointer-events-none absolute bottom-0 left-0 z-[650] max-w-full flex-col gap-2 p-3 pb-16 md:pb-3 ${
          hdb ? 'hidden' : 'flex'
        }`}
      >
        {/* A fight owns the moment — nothing to decide about crossing until it's over. */}
        {trekTarget && trekInfo && trekEst && !combat && (
          <div className="pointer-events-auto flex w-80 max-w-[88vw] flex-col overflow-y-auto rounded-lg border border-white/15 bg-concrete-900/95 p-3 shadow-2xl max-h-[60vh] md:w-[400px] md:max-h-[19rem]">
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/40">
              {travelAnim ? <><Icon name="action.travel" /> En route</> : <><Icon name="action.target" /> Open ground</>}
            </div>
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
          </div>
        )}
        {cardProps && !selHere && (
          <div className="pointer-events-auto flex w-80 max-w-[88vw] flex-col overflow-y-auto rounded-lg border border-white/15 bg-concrete-900/95 p-3 shadow-2xl max-h-[60vh] md:w-[400px] md:max-h-[19rem]">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
                {travelAnim ? <><Icon name="action.travel" /> En route</> : <><Icon name="action.target" /> Target</>}
              </span>
              <button
                onClick={() => setSelectedId(null)}
                className="text-xs text-white/40 hover:text-white/70"
              >
                ✕
              </button>
            </div>
            <LocationCard {...cardProps} />
          </div>
        )}
        {hereProps && (
          <div
            className={`pointer-events-auto ${
              cardProps && !selHere ? 'hidden md:flex' : 'flex'
            } w-80 max-w-[88vw] flex-col overflow-y-auto rounded-lg border border-signal/40 bg-concrete-900/95 p-3 shadow-2xl max-h-[60vh] md:w-[400px] md:max-h-[19rem]`}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-signal/70">
              <Icon name="action.here" /> You are here
            </div>
            <LocationCard {...hereProps} />
            {atEvac && (
              <button
                onClick={callEvac}
                disabled={!evacReady}
                className="mt-2 w-full rounded-lg bg-signal/80 py-2 text-sm font-bold text-black transition hover:bg-signal disabled:opacity-30"
              >
                {evacReady ? <><Icon name="action.evac" /> Call for evac — escape!</> : 'Evac kit incomplete'}
              </button>
            )}
          </div>
        )}
        {/* Standing on bare ground — no site card to show, so say so plainly and
            point at the only two things you can do from here. */}
        {!here && !worldLoading && (
          <div
            className={`pointer-events-auto ${
              trekTarget ? 'hidden md:flex' : 'flex'
            } w-80 max-w-[88vw] flex-col rounded-lg border border-white/15 bg-concrete-900/95 p-3 shadow-2xl md:w-[400px]`}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/40">
              <Icon name="action.here" /> In the open
            </div>
            <div className="text-sm text-white/70">Nowhere in particular.</div>
            <div className="mt-1 text-xs text-white/40">
              No shelter, no stash, nothing to search. Tap a building to head for it, or tap
              bare ground to keep moving. Sleeping out here barely counts as sleep.
            </div>
          </div>
        )}
        {hereProps && cardProps && !selHere && (
          <HereCompactBar
            sel={hereProps.sel}
            atEvac={atEvac}
            evacReady={evacReady}
            onSearch={() => travel(hereProps.sel.id)}
            onOpenStash={openStash}
            onEvac={callEvac}
          />
        )}
      </div>

      {/* ============ MOBILE bottom nav ============ */}
      <nav className="flex shrink-0 border-t border-white/10 bg-concrete-900 text-xs md:hidden">
        <NavBtn label={<><Icon name="action.map" /> Map</>} active={mobileView === 'map'} onClick={() => setMobileView('map')} />
        <NavBtn
          label={<><Icon name="action.status" /> Status</>}
          active={mobileView === 'hub'}
          onClick={() => setMobileView('hub')}
        />
        <NavBtn
          label={<><Icon name="action.inventory" /> Inventory</>}
          active={inventoryOpen}
          onClick={() => setInventoryOpen((v) => !v)}
        />
        <NavBtn
          label={combat ? <><Icon name="combat.hostiles" /> Fight</> : <><Icon name="action.log" /> Log</>}
          active={mobileView === 'log'}
          pulse={!!(pendingEvent || combat) && mobileView !== 'log'}
          onClick={() => setMobileView('log')}
        />
      </nav>

      {/* ============ overlays ============ */}
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
      {logbookOpen && <StashLogbook onClose={() => setLogbookOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {objectivesOpen && (
        <ObjectivesModal
          evacZoneName={evacZone?.name ?? null}
          evacDist={evacDist}
          atEvac={atEvac}
          checklist={checklist}
          windowText={windowText}
          urgent={evacUrgent}
          doom={doom}
          doomColor={doomColor}
          doomLabel={hordeLabel(doom)}
          evacReady={evacReady}
          onEvac={callEvac}
          onClose={() => setObjectivesOpen(false)}
        />
      )}

    </div>
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
      className={`relative flex-1 py-2.5 font-semibold transition ${
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

/** Mobile-only: collapses the "here" card to a slim action bar when a target
 *  card is also showing, so the two don't stack up and hide the whole map. */
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
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-signal/40 bg-concrete-900/95 px-3 py-2 shadow-2xl md:hidden">
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
            disabled={sel.exhausted}
            className="shrink-0 rounded bg-signal/80 px-2.5 py-1.5 text-xs font-bold text-black disabled:opacity-30"
          >
            {sel.exhausted ? 'Empty' : 'Search'}
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
