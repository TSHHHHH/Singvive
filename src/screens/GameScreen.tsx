import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../game/store';
import { GameMap } from '../components/GameMap';
import { ConditionPanel } from '../components/ConditionPanel';
import { StatsPanel } from '../components/StatsPanel';
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
import { ObjectiveBar } from '../components/ObjectiveBar';
import { ObjectivesPanel } from '../components/ObjectivesPanel';
import { AttributeRow } from '../components/AttributeRow';
import { DayLogsModal } from '../components/DayLogsModal';
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
import type { IconName } from '../icons/keys';

type MobileView = 'map' | 'hub' | 'log';

/**
 * Which body the slide-out panel is showing. null = closed. Everything that
 * wants more room than the rail can give lands here, objectives included —
 * there is exactly one place detail opens.
 */
type SidePanel = 'inventory' | 'logbook' | 'stats' | 'objective';

const SIDE_PANELS: Record<SidePanel, { label: string; icon: IconName }> = {
  inventory: { label: 'Inventory', icon: 'action.inventory' },
  logbook: { label: 'Logbook', icon: 'action.logbook' },
  stats: { label: 'Stats', icon: 'action.stats' },
  objective: { label: 'Objectives', icon: 'action.objectives' },
};

/** The three the rail exposes as buttons — objectives opens from its own bar. */
const PANEL_BUTTONS: SidePanel[] = ['inventory', 'logbook', 'stats'];

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
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dayLogsOpen, setDayLogsOpen] = useState(false);

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

  const openStash = () => setSidePanel('inventory');

  const selDist = sel
    ? Math.round(haversine(currentPos.lat, currentPos.lng, sel.lat, sel.lng))
    : 0;
  const selOutOfRange = !!sel && !selHere && selDist > travelRange;

  // --- open ground -------------------------------------------------------
  // Hazards are sensed the same way blips are: out to the awareness ring, never
  // beyond. Everything drawn and everything quoted on the trek card comes from
  // this set — the store rolls against the real field, which may be worse.
  const sensedHazards = hazardZonesNear(seed, currentPos.lat, currentPos.lng, blipRange, spawn);

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
          const onPath = hazardsOnPath(seed, currentPos, trekTarget, spawn);
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
                safe: spawn,
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
            body: <LocationCard {...cardProps} />,
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
          {evacReady ? <><Icon name="action.evac" /> Call for evac — escape!</> : 'Evac kit incomplete'}
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

  const show = (mobile: boolean) => (mobile ? 'flex flex-1 min-h-0' : 'hidden');

  return (
    <div className="relative flex h-full flex-col md:flex-row">
      {/* ================= COLUMN 1: the survivor rail =================
           Everything about *you* and the two places that matter right now,
           read top to bottom: the clock, the goal, your body, then the ground
           under your feet. */}
      <aside
        className={`flex-col border-white/10 bg-concrete-900/70 md:flex md:h-full md:w-[340px] md:shrink-0 md:border-r ${
          mobileView === 'hub' ? show(true) : 'hidden'
        } md:flex`}
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
              urgent={evacUrgent}
              doom={doom}
              doomColor={doomColor}
              doomLabel={hordeLabel(doom)}
              onOpen={() => setSidePanel((p) => (p === 'objective' ? null : 'objective'))}
            />

            <ConditionPanel />
            <AttributeRow />

            {/* --- the panel switchers --- */}
            <div className="grid grid-cols-3 gap-1.5">
              {PANEL_BUTTONS.map((id) => {
                const active = sidePanel === id;
                return (
                  <button
                    key={id}
                    onClick={() => setSidePanel(active ? null : id)}
                    className={`rounded border py-1.5 text-[11px] transition ${
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

        {/* --- where you are: pinned to the bottom-left corner, outside the
             scroller above, so the two location panels are always in the same
             place no matter how tall the block above them gets. Capped at half
             the rail with its own scroll — a fat location card can't eat it. --- */}
        <div className="hidden max-h-[52%] shrink-0 flex-col gap-2.5 overflow-y-auto border-t border-white/10 p-2.5 md:flex">
          <RailSection
            title={targetSlot?.title ?? <><Icon name="action.target" /> Target</>}
            onClose={targetSlot?.onClose}
            accent={false}
          >
            {targetSlot?.body ?? (
              <p className="text-xs text-white/30">
                Nothing selected. Tap a building or a patch of open ground on the map.
              </p>
            )}
          </RailSection>

          <RailSection title={hereTitle} accent={!!hereProps}>
            {hereSlot}
          </RailSection>
        </div>
      </aside>

      {/* ================= COLUMN 2: the slide-out =================
           Toggled from the rail's three buttons, closable from its own header.
           It overlays the map rather than squeezing it, so the map never
           reflows when you check your pack. */}
      <div
        className={`absolute inset-y-0 left-0 z-[700] w-full transition-all duration-200 md:left-[340px] md:w-[360px] ${
          sidePanel
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none -translate-x-full opacity-0'
        }`}
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
            {sidePanel === 'logbook' && <StashLogbook />}
            {sidePanel === 'stats' && <StatsPanel />}
            {sidePanel === 'objective' && (
              <ObjectivesPanel
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
              />
            )}
          </div>
        </div>
      </div>

      {/* ================= COLUMN 3: map — or the HDB block, which takes the
           whole view for the duration of the delve ================= */}
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

      {/* ================= COLUMN 4: timeline — or the encounter panel, which
           takes the column over for the duration of a fight ================= */}
      <aside
        className={`min-w-0 overflow-hidden border-white/10 bg-concrete-900/70 p-3 md:flex md:w-[30vw] md:min-w-[280px] md:max-w-[520px] md:shrink-0 md:border-l md:p-2.5 ${
          mobileView === 'log' ? show(true) : 'hidden'
        } md:flex md:flex-col ${combat ? 'ring-1 ring-inset ring-hiss/50' : ''}`}
      >
        {combat ? (
          <CombatPanel />
        ) : (
          <LogPanel
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenDayLogs={() => setDayLogsOpen(true)}
          />
        )}
      </aside>

      {/* ================= MOBILE location dock =================
           The rail's two location slots live in the "Status" tab on mobile,
           which would mean tapping a POI on the map shows you nothing. So the
           target (and only the target) also floats over the map here. */}
      {targetSlot && !hdb && mobileView === 'map' && (
        <div className="pointer-events-none absolute bottom-0 left-0 z-[650] max-w-full p-3 pb-16 md:hidden">
          <div className="pointer-events-auto flex max-h-[55vh] w-80 max-w-[88vw] flex-col overflow-y-auto rounded-lg border border-white/15 bg-concrete-900/95 p-3 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
                {targetSlot.title}
              </span>
              {targetSlot.onClose && (
                <button
                  onClick={targetSlot.onClose}
                  className="text-xs text-white/40 hover:text-white/70"
                >
                  ✕
                </button>
              )}
            </div>
            {targetSlot.body}
          </div>
        </div>
      )}

      {/* Slim "you are here" bar on the map tab — enough to search or stash
          without leaving the map. */}
      {hereProps && !hdb && mobileView === 'map' && (
        <HereCompactBar
          sel={hereProps.sel}
          atEvac={atEvac}
          evacReady={evacReady}
          onSearch={() => travel(hereProps.sel.id)}
          onOpenStash={openStash}
          onEvac={callEvac}
        />
      )}

      {/* ================= MOBILE bottom nav ================= */}
      <nav className="flex shrink-0 border-t border-white/10 bg-concrete-900 text-xs md:hidden">
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
          className={`text-[10px] font-semibold uppercase tracking-widest ${
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
  return (
    <div className="pointer-events-auto absolute bottom-11 left-3 right-3 z-[640] flex items-center gap-2 rounded-lg border border-signal/40 bg-concrete-900/95 px-3 py-2 shadow-2xl md:hidden">
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
