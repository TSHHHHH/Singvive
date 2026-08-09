import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { GameMap } from '../components/GameMap';
import { StatusPanel } from '../components/StatusPanel';
import { LogPanel } from '../components/LogPanel';
import { LocationCard } from '../components/LocationCard';
import { InventoryPanel } from '../components/Inventory/InventoryPanel';
import { StashLogbook } from '../components/StashLogbook';
import { SettingsModal } from '../components/SettingsModal';
import { DigitalClock } from '../components/DigitalClock';
import { WeatherBadge } from '../components/WeatherBadge';
import { ObjectivesModal } from '../components/ObjectivesModal';
import { itemDef } from '../game/loot';
import { estimateExpedition } from '../game/travel';
import { legTravelFactor } from '../game/survival';
import { isEncumbered } from '../game/inventory';
import { haversine } from '../game/overpass';
import { rollWeather, timeOfDay } from '../game/weather';
import { awareness, blipMargin, travelableRange } from '../game/fog';
import { equipAwarenessMod, traitAwarenessMod } from '../game/character';
import { evacChecklist, hasEvacKit, hordeLabel } from '../game/goal';
import { Rng } from '../game/rng';
import { POI_CONFIG } from '../game/poi';
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
    hordeLevel,
    evacZoneId,
    evacDeadline,
    callEvac,
    travel,
    mrtTravel,
    rest,
    meters,
    scavengeResult,
    clearScavengeResult,
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
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [logbookOpen, setLogbookOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [objectivesOpen, setObjectivesOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  // An event now lives in the timeline (right column) rather than a blocking
  // modal. On mobile the log is a separate tab, so pull the player to it.
  useEffect(() => {
    if (pendingEvent) setMobileView('log');
  }, [pendingEvent]);

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
  const doomColor = doom >= 75 ? '#e0342b' : doom >= 50 ? '#e0a458' : '#7bd88f';

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
        className={`flex-col border-white/10 bg-rot-900/70 md:flex md:h-[calc(100%-21rem)] md:w-[400px] md:shrink-0 md:self-start md:border-r ${
          mobileView === 'hub' ? show(true) : 'hidden'
        } md:flex`}
      >
        {/* header */}
        <div className="shrink-0 space-y-2 border-b border-white/10 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate font-bold text-toxic">{character?.name}</span>
            <span className="text-white/50">💀 {kills}</span>
          </div>

          <DigitalClock day={day} hour={hour} band={time} />

          <div className="flex items-center justify-between text-xs text-white/50">
            <WeatherBadge weather={weather} />
          </div>

          <button
            onClick={() => setObjectivesOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border border-toxic/30 bg-toxic/10 px-3 py-2 text-left text-sm transition hover:bg-toxic/15"
          >
            <span className="font-semibold text-toxic">🎯 Objectives</span>
            {evacZone ? (
              <span
                className={`text-xs ${
                  evacUrgent ? 'animate-pulse text-red-400' : 'text-amber-300/90'
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
            😴 Sleep
          </button>
          <button
            onClick={() => setInventoryOpen((v) => !v)}
            className={`rounded border py-2 text-xs transition ${
              inventoryOpen
                ? 'border-toxic bg-toxic/15 text-toxic'
                : 'border-white/15 hover:bg-white/5'
            }`}
          >
            🎒 Inventory
          </button>
          <button
            onClick={() => setLogbookOpen(true)}
            className="rounded border border-white/15 py-2 text-xs hover:bg-white/5"
          >
            📓 Logbook
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
        <div className="flex h-full flex-col border-r border-white/10 bg-rot-900 shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-3">
            <h3 className="text-sm font-bold text-toxic">🎒 Inventory</h3>
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

      {/* ============ CENTER: map ============ */}
      <div
        className={`relative md:flex md:flex-1 ${mobileView === 'map' ? show(true) : 'hidden'} md:flex`}
      >
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
          onSelect={(loc: LocationState) => setSelectedId(loc.id)}
        />
        {worldLoading && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/70">
            <p className="animate-pulse text-white/70">Loading the neighbourhood…</p>
          </div>
        )}
        {worldError && (
          <div className="absolute bottom-2 left-2 z-[500] max-w-xs rounded bg-amber-900/80 px-3 py-1.5 text-[11px] text-amber-100">
            {worldError}
          </div>
        )}

      </div>

      {/* ============ RIGHT: pure game log ============ */}
      <aside
        className={`min-w-0 overflow-hidden border-white/10 bg-rot-900/70 p-3 md:flex md:w-[300px] md:shrink-0 md:border-l ${
          mobileView === 'log' ? show(true) : 'hidden'
        } md:flex md:flex-col`}
      >
        <LogPanel onOpenSettings={() => setSettingsOpen(true)} />
      </aside>

      {/* ============ LOCATION DOCK — the bottom-left corner is theirs ============
           Target sits on top (what you're deciding about), "here" below it — and
           on desktop the stack is the same width as the left hub (400px). On
           mobile, when a target is also up, "here" collapses to a slim action
           bar instead of a second full card, so the map stays visible. */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-[650] flex max-w-full flex-col gap-2 p-3 pb-16 md:pb-3">
        {cardProps && !selHere && (
          <div className="pointer-events-auto flex w-80 max-w-[88vw] flex-col overflow-y-auto rounded-lg border border-white/15 bg-rot-900/95 p-3 shadow-2xl max-h-[60vh] md:w-[400px] md:max-h-[19rem]">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
                {travelAnim ? '🚶 En route' : '🎯 Target'}
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
            } w-80 max-w-[88vw] flex-col overflow-y-auto rounded-lg border border-toxic/40 bg-rot-900/95 p-3 shadow-2xl max-h-[60vh] md:w-[400px] md:max-h-[19rem]`}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-toxic/70">
              📍 You are here
            </div>
            <LocationCard {...hereProps} />
            {atEvac && (
              <button
                onClick={callEvac}
                disabled={!evacReady}
                className="mt-2 w-full rounded-lg bg-toxic/80 py-2 text-sm font-bold text-black transition hover:bg-toxic disabled:opacity-30"
              >
                {evacReady ? '🚁 Call for evac — escape!' : 'Evac kit incomplete'}
              </button>
            )}
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
      <nav className="flex shrink-0 border-t border-white/10 bg-rot-900 text-xs md:hidden">
        <NavBtn label="🗺️ Map" active={mobileView === 'map'} onClick={() => setMobileView('map')} />
        <NavBtn
          label="❤️ Status"
          active={mobileView === 'hub'}
          onClick={() => setMobileView('hub')}
        />
        <NavBtn
          label="🎒 Inventory"
          active={inventoryOpen}
          onClick={() => setInventoryOpen((v) => !v)}
        />
        <NavBtn
          label="📜 Log"
          active={mobileView === 'log'}
          pulse={!!pendingEvent && mobileView !== 'log'}
          onClick={() => setMobileView('log')}
        />
      </nav>

      {/* ============ overlays ============ */}
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

      {scavengeResult && (
        <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-rot-900 p-5 text-center">
            <h3 className="text-lg font-bold text-toxic">
              {scavengeResult.fled ? 'Grabbed what you could' : `Searched ${scavengeResult.poiName}`}
            </h3>
            {scavengeResult.loot.length === 0 ? (
              <p className="mt-3 text-sm text-white/50">Nothing useful left here.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {scavengeResult.loot.map((s, i) => (
                  <li key={i} className="flex justify-between rounded bg-white/5 px-3 py-1">
                    <span>{itemDef(s.defId).name}</span>
                    <span className="text-toxic">×{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
            {scavengeResult.leftover.length > 0 && (
              <p className="mt-3 text-[11px] text-amber-300/80">
                Backpack full — left behind{' '}
                {scavengeResult.leftover.map((s) => `${itemDef(s.defId).name} ×${s.count}`).join(', ')}
              </p>
            )}
            <button
              onClick={clearScavengeResult}
              className="mt-4 w-full rounded bg-toxic/80 py-2 font-bold text-black hover:bg-toxic"
            >
              Continue
            </button>
          </div>
        </div>
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
  label: string;
  active: boolean;
  pulse?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-1 py-2.5 font-semibold transition ${
        active ? 'bg-white/5 text-toxic' : pulse ? 'text-amber-300' : 'text-white/50'
      }`}
    >
      {label}
      {pulse && (
        <span className="absolute right-3 top-1.5 h-2 w-2 animate-pulse rounded-full bg-amber-400" />
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
    <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-toxic/40 bg-rot-900/95 px-3 py-2 shadow-2xl md:hidden">
      <span className="text-lg leading-none">{cfg.glyph}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{sel.name}</div>
        <div className="text-xs text-toxic/70">📍 here</div>
      </div>
      {atEvac ? (
        <button
          onClick={onEvac}
          disabled={!evacReady}
          className="shrink-0 rounded bg-toxic/80 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-30"
        >
          🚁 Evac
        </button>
      ) : (
        <>
          <button
            onClick={onSearch}
            disabled={sel.exhausted}
            className="shrink-0 rounded bg-toxic/80 px-2.5 py-1.5 text-xs font-bold text-black disabled:opacity-30"
          >
            {sel.exhausted ? 'Empty' : 'Search'}
          </button>
          <button
            onClick={onOpenStash}
            className="shrink-0 rounded border border-white/15 px-2.5 py-1.5 text-xs"
          >
            📦
          </button>
        </>
      )}
    </div>
  );
}
