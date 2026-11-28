# SINGVIVE — Tech Stack & Architecture

> How **SINGVIVE** is built, run, and deployed. What the game *is* — the vision, loop, and
> system rules — lives in [GAME_DESIGN.md](GAME_DESIGN.md); the short overview is
> [README.md](README.md).

---

## 1. Architecture

### Experimental online co-op prototype

Open **Online co-op prototype** from the menu, or `/?coop=1` on the Workers build. Create
a room and share its invite link with up to three others. Each tab stores its own reconnect
credentials in `sessionStorage`; refreshing restores the seat, but closing the tab may lose
the credential. Invite links contain only the room code. New rooms use the committed Singapore
map; existing schematic rooms retain their original rules. The static itch build has no co-op backend.

The prototype UI and current event logs support English and Simplified Chinese. Raw
client/server diagnostic errors and unrecognized future log messages remain in English.

`src/coop/model.ts` defines the versioned room protocol; `simulation.ts` is the pure deterministic
simulation and `protocol.ts` validates inbound commands. `client.ts` maintains one outstanding
sequenced command and reconnects with authoritative snapshots. The co-op entry is loaded
separately from App and the solo single-instance lock; it never writes `singvive.run.v7`.

The optional `world.version: 1` extension preserves saved schematic rooms. `islandWorld.ts`
indexes immutable POIs by spatial cell and validates land routes on the server. `islandActions.ts`
integrates independent survivors using the pure solo inventory, survival, wound-care, crafting
and skill modules. `worker/islandAssets.ts` loads the versioned POI index, walkability zones
and MRT network through `ASSETS`; no map bake or external Overpass request runs at room creation.
Only discovered metadata belongs in room snapshots. Live site caches/enemies are filtered to
the viewer's current sight. IslandMap uses the existing MapLibre style and fog geometry with
viewport-culling and a 450-site marker cap.

`islandSystems.ts` validates MRT adjacency from the baked network. `islandBuildings.ts`
reuses generated HDB floors but stores each survivor in a distinct landing/unit site ID;
the solo dungeon cursor is never shared. The generated layout lives on its parent location,
while depletion and enemies live in separate site records. Interior child sites are omitted
from map markers and only the current room's live interior state is sent to each player.

`worker/coop.ts` routes `/api/coop`, room joins and WebSocket upgrades to one SQLite-backed
`CoopRoom` Durable Object per code. This is an explicit co-op exception to the browser-only
solo architecture. The server checks same-origin requests, hashes random seat tokens, caps
messages, limits command frequency and replaces old connections to the same seat. Room state
and per-player sequence receipts are written together before acknowledgements. Socket
attachments identify connections across hibernation. Active rooms advance on two-second
alarms; paused/lobby/ended rooms schedule only resume or expiry. Downtime longer than 30
seconds pauses the room rather than resolving an unattended catch-up. All-disconnected rooms
pause, including after a server restart. Ended/abandoned state expires after 24 hours without
client activity.

Island location and site records are normalized into `island_objects(kind,id,value)`.
Persistence compares serialized records and writes only changed rows, atomically with the
core room and command receipt. Startup hydrates those records before accepting commands.
The pure simulation remains separate from Worker I/O. Full snapshots and active alarms still
have a usage cost; this expansion has no large-scale concurrency benchmark yet.

The `COOP_ROOMS` binding and `coop-v1` SQLite migration in `wrangler.jsonc` work with Workers
Free. D1 remains the solo honor board; prototype results stay in the room. No D1 schema change
is needed. Regenerate binding declarations after configuration changes:

```bash
npx wrangler types worker/bindings.d.ts --include-runtime false
```

Local checks (dev server must be running for the socket smoke test):

```bash
npm test -- src/coop/simulation.test.ts src/coop/protocol.test.ts
node scripts/smoke-coop.mjs
```

For restart coverage, run the smoke test with `COOP_RESTART_CHECK=1`, restart the local dev
server, then run `node scripts/smoke-coop-restart.mjs`. It compares exploration, live caches,
individual survivor state and command receipts against a temporary local checkpoint.

`COOP_TEST_ORIGIN` can select another localhost port. The socket test refuses non-local hosts
and creates disposable rooms. Multiple browser tabs on `/?coop=1` can join the same room.
Use `npm run dev -- --host 0.0.0.0` only when intentionally testing from other devices on
your LAN; otherwise the local-only server is sufficient.

Free-plan budgeting: begin with one private room, persist outcomes rather than animation
frames, and monitor duration plus SQL rows written. Hibernation does not make active simulation
free. Free-plan quota exhaustion interrupts operations. The multiplayer branch is connected
to automatic deployment; pushing it updates the test Worker. Broader rollout needs measured
usage, room-admission controls and more device/network testing.

### Wound care

`src/game/woundCare.ts` owns independent treatment eligibility, targeting and stabilization; `canCareWithItem` prevents wasting supplies such as an improvised dressing on a stable wound. `survival.ts` creates injuries, ages dressings and advances tissue/fracture recovery, splitting at care expiry transitions. `tickInjuries` accepts a recovery multiplier shared by `store.advanceTime` and `restPlan`, including hydration, shelter sleep and medical skill/trait effects. Protected service-bed sleep also receives recovery support. Treatment never directly adds HP.

`applyItem(uid, partId?)` supports explicit Body-panel targets and automatic eligible targets for inventory callers. It validates accessibility and eligibility before consuming supplies, spends game minutes, then schedules the normal debounced save. First-aid kits preserve three uses through `ItemInstance.careUses`. `lastCare` is transient presentation feedback; wound fields and kit uses persist in the existing `singvive.run.v7` format. `migrateBodyParts` supplies care defaults for old saves.

The existing `ConditionPanel` hosts compact care rows and the medical silhouette; only affected parts need controls. Wound state is visible without inspection. There are no new map-parent subscriptions or real-time recovery timers: recovery advances with the game clock.

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript 6 + Vite 8 |
| Map | **MapLibre GL JS** v5 (WebGL, plain — no React wrapper; `src/map/`), **CARTO "Dark Matter" vector style** (keyless; OpenFreeMap Dark as fallback), GeoJSON overlays in ordered slots, polygon fog (`polygon-clipping`), 3D building extrusions |
| Real data | OpenStreetMap → `public/pois.json` (`bake:pois`), `public/mrt.json` (`bake:mrt`), `public/zones.json` (`bake:zones`), `public/hazard-sites.json` (`bake:hazard-sites`, derived from the POI bake); URA planning areas → `public/towns.json` (`bake:towns`); live Overpass as POI runtime fallback |
| State | Zustand 5 (single store); `window.__game` in DEV |
| Inventory DnD | Custom pointer-drag over a cell grid (backpack ↔ stash ↔ equipment) |
| Determinism | `seedrandom`, wrapped in a forkable `Rng` (cosmetic flavour text may use `Math.random`) |
| Styling | Tailwind CSS 3 |
| Lint | oxlint + type-scale + zh-Hans glossary guards |
| Backend | Cloudflare Worker + D1 honor board (`/api/scores`); run state is localStorage |
| Node | pinned by `.nvmrc` (22) |

```
src/
  game/        pure, seed-driven logic — rng, world, poi, loot, inventory, packGrid, survival,
               travel, weather, fog, combat, factions, events, character, occupations, crafting,
               trade, sleep, nightSight, goal, searchSession, hdbDungeon, tunnelRun, mrtDamage, wilds,
               wildsEncounter, travelEnergy, vegetation, playable, route, noise, activity, ghostSurvivor,
               itemTileColor, settings, storage, types, Zustand store
               (+ data/ JSON catalogs: items, lootTables, recipes, enemies, itemTileColors)
  api/         same-origin worldwide score client (no fetch under game/)
  audio/       procedural Web Audio ambience (engine singleton + `useAmbience` hook fed scalars
               from GameScreen); cosmetic only, may use Math.random
  i18n/        locale catalogs (`messages/en.json` source of truth, `zh-Hans.json` overlay)
               and `t` / `useT`; player primer is `guide.*` keys; zh voice/glossary in
               docs/i18n-zh-hans.md
  content/     guide topic routing (`guideContent.ts`) — copy lives in i18n
  hooks/       shared React hooks (e.g. useReducedMotion)
  icons/       icon registry + keys (emoji fallbacks → drop-in PNGs)
  dev/         DEV-only editors + Dev menu (loot / enemies / icons / locale) — never imported from game/
  components/  GameMap, FogOverlay, Inventory/*, CraftingPanel, CombatPanel,
               ConditionPanel, StatsPanel, ObjectiveBar, ObjectivesPanel, PhoneStatusBar,
               HdbDungeonModal, HdbLevelStrips, TunnelRunView, StationStrip, TraderModal, GuideModal,
               SettingsModal, TrekCard, LocationCard, …
  screens/     Menu, CharacterCreate, SpawnSelect, GameScreen, DeathScreen
               (combat is a panel inside GameScreen — no combat phase)
worker/        Cloudflare Worker — GET/POST /api/scores → D1
```

**Design rule:** everything under `game/` is **pure and seed-driven** — deterministic for a given
seed, forked per-system (`rng.fork('loot'|'faction'|'event'|'human'|'wound'…)`), and testable without
the DOM. Exceptions: cosmetic flavour helpers may use `Math.random` (non-gameplay), and `rng.ts`
itself uses it only to mint a fresh seed string.

**Note on the map:** the basemap is CARTO's **Dark Matter vector style** (`src/map/mapStyle.ts`).
Vector tiles need no API key and are never watermarked. They are built to z15 and overzoomed past
it, and their buildings carry `height` / `min_height`. `OPENFREEMAP_DARK` (OpenMapTiles schema,
`render_height`) is the drop-in fallback. A replacement must carry building heights or the 3D view
goes flat. MapLibre zoom is the old Leaflet zoom − 1 (the saved zoom key moved to
`singvive.mapZoom.gl`).

- **`src/map/MapView.tsx`** creates the one map per screen, installs the overlay **slots**
  (`terrain, labels, fog, wash, hazard, ring, poi, trail, noise, veil, mrt, buildings, top`) and
  only then renders children. Overlays call `installOverlay(map, slot, …)`; the basemap's labels
  are moved under the fog.
- **Fog** (`fogGeometry.ts`) is the world minus the union of explored discs, in three soft bands.
  The union is cached; only the live sight disc is subtracted per update. Its radius matches the
  single current travel-range ring; fog and building updates are throttled to 80 ms during its tween.
  During a glide the
  sight disc follows the pin (`useSightCenter` in `GameMap.tsx`, every 100 ms), so fog and
  buildings and location markers reveal along the walk. Marker presentation uses that
  same centre and holds departure sensing range until arrival, then eases to the
  post-trip range. Gameplay position and location recognition still commit on arrival.
- **Island edge** (`components/EdgeVignette.tsx`, slot `edge`): the run map is a disc around the island; past `EDGE_CLEAR_M` the ground fades to near-black by `EDGE_DARK_M`, and the camera is held to `RUN_BOX` (`mapStyle.ts`), just inside that ring. The fog box reaches past it so there is no straight edge.
- **3D** (`buildings.ts`, setting `mapView3d`) extrudes the basemap's buildings from `LOD_ZOOM` 15.
  A building stands only inside the current travel-range disc, including explored and discovered
  sites. Discovered markers remain at ground level outside the disc. As current range changes,
  buildings rise or fall (feature-state `rise`, animated unless
  reduced motion; never held for the camera — only the 10–20 ms tile index scan waits for it to
  settle). Sites are matched to their building and coloured through feature-state, using known
  faction colours before category colours. Marker fills lighten the faction hue for dark-icon
  contrast; selection is a separate DOM badge ring in 2D and 3D, never a model colour override. Taps on
  a site's building select it, other buildings walk to them. Badges lift to the roof through the
  `--roof` / `--roof-lift` CSS variables. Badge heights update on range membership changes,
  while physical roof heights stay available for block cutaways. Building reveal does not scan
  explored discs. Spawn select and the route planner stay 2D.
  Desktop 3D uses **3D building shadows** by default. Gameplay → Map offers Off, Standard (2K) and High (4K). A lazy-loaded Three.js
  custom layer shares the run map's depth buffer and adds shadow to the native streets, roofs and
  walls. One directional shadow map fits the current travelable range at either resolution, with 2048² as the default. The visible edge follows
  the live range exactly, while the shadow camera resizes in 64 m increments. Loaded footprints
  and visible ruin pieces share a batched mesh. Closed meshes cast from their back faces to avoid
  striping on sunlit walls. New geometry builds in 3 ms slices, and the layer reuses the building
  index's tile query. Changes to reveal height, damage, zoom or sun
  direction refresh the shadow map. The cutaway suspends shadows while it ghosts surrounding blocks.
  With a local dev server running, `node scripts/bench-building-shadows.mjs http://localhost:5190`
  measures a repeatable Orchard glide in desktop Edge. It reports the GPU, range, loaded casters,
  frame-time percentiles with shadows off and on, and CPU time spent in the shadow layer.
  Desktop 3D lighting samples the run clock every half game-hour. Daylight starts in the east at
  06:00, peaks at 48° elevation around 12:30 and fades in the west by 19:00. Sunlit ground is
  brighter so mid-rise shadows read against it. Night uses cool ambient lighting and skips the sun
  shadow pass. Weather modulates the lighting, and the clock drives it even with cast shadows off.
  A matched site's condition drives its silhouette. Damaged buildings keep most of their height.
  Ravaged models have localized upper-floor losses, while Gutted models have larger structural
  breaches. The nearest 30 eligible sites within 900 m get procedural models in `ruins-3d`;
  more distant sites use tier-specific height factors. Ruin bays follow the longest facade, with broken floor plates projecting from exposed
  walls between the surviving wing and the collapsed end. Towers from 60 m retain upper
  bays over a multi-storey breach, with exposed steel and surviving banks of curtain-wall glass.
  Exposed outer walls carry broken
  window bands, and seeded clusters of vines hang from floor plates and roofs. These small
  details share the building's rise and are excluded from shadow geometry. Models build within an 8 ms budget
  per slice and are cached per site.
  Inside an HDB block the engine draws one amber **storey band** (`setFloorBand` /
  `clearFloorBand`, its own `storey-band` fill-extrusion layer, a collar stood 1.2 m off the
  site's ring). `BlockView` in `GameMap.tsx` moves it only when the landing or hovered strip
  changes (`hdbHoverLevel`, set by `HdbLevelStrips`), and eases the camera onto the block and back
  out: `map/blockFraming.ts` fits the roof height and rotated footprint into the available width
  and height, centred on the footprint at half the roof elevation. `BlockView` owns padding while
  inside; `CameraInset` is suspended so its settle handler cannot undo the framing. While inside, `engine.setFocus(siteId)` draws the
  block solid on `focus-3d` (same paint, under `buildings-3d`) and ghosts every other building and
  ruin to 0.18 opacity. The band sits between the two, so ghosts in front tint it instead of
  hiding it behind their depth. One filter + opacity change per focus change, never per tick.
  Orbit: a drag on the over-map backdrop (`[data-block-orbit]`, the HDB shell itself, never its
  children) turns bearing 0.4°/px and pitch 0.2°/px (25° to `MAX_PITCH_3D`) with `jumpTo`, centre
  fixed on the building; the wheel steps zoom ±0.25 in [15, 20.5]. Visible zoom and frame-building
  controls and the C camera key provide a reset. The world camera's elevation and zoom limit are restored on exit. Document listeners in
  `BlockView`, because the over-map layer swallows map input. The chosen bearing survives re-framing.
  `engine.onRoofs` also feeds `siteRoofs` in the store so `hdbEnter` sizes the block from its
  real roof. Worked blocks dim through `hdbScar`, keyed on quarter-steps cached per `hdbBlocks`.
  A stable feature-id hash damages 72% of ordinary buildings. Tower parts share their containing
  building's roll, and the tallest part counts toward its height. Ground-level parts with no
  parent in the loaded tiles get their own roll. For buildings at least 10 m tall, about 47%
  qualify as collapsed. Up to 36 qualifying ordinary buildings, ranked by distance and height,
  within 900 m get detailed wrecks. At neighbourhood zoom the nearest four visible faction-held
  sites in live sight can show neutral tarp shelters and supplies. The nearest two emit a faint
  cooking plume. These visual hints do not disclose faction identity or change discovery state.
- **Keyboard camera** (`components/KeyboardCamera.tsx`, bindings in `map/cameraKeys.ts`, settings
  `mapKeys` / `mapKeyPanSpeed`). MapLibre's own `keyboard` handler stays off; this is a held-key
  velocity loop on `KeyboardEvent.code` (WASD/arrows pan, Shift faster, Q/E rotate in 3D, +/−
  zoom, C recentres). Moves carry the key event as `originalEvent`, so the travel chase yields to
  them like a drag. Stands down under any `ModalShell` (`isModalOpen()`), in text fields, and —
  for arrows only — when a list/tab rail has focus. The Settings key list reads `CAMERA_KEY_HINTS`.
- **Atmosphere** (`atmosphere.ts`, mounted by `Atmosphere3d` in 3D only) owns `setSky` / `setLight`.
  Each weather has a preset (sky, light colour/intensity/angle, distance haze) and dusk/night tint
  it; the `weatherFx` setting scales the weather share (off 0, subtle 0.6, full 1) while time of day
  always applies. Changes tween over ~1.8 s; light is a shader uniform, so no re-tessellation.
  Distance haze is a DOM gradient at the top of the view (`.wx-depth`), faded in with pitch
  (`tiltShare`). Thunderstorms schedule lightning strikes that flash the light and a sky bloom
  (`.wx-bolt`) and cue thunder in `ambience.strike`; reduced motion turns strikes off. In 3D,
  `WeatherFx` drops its flat tint layers and keeps only the moving ones (rain sheet, haze drift,
  heat shimmer); 2D is unchanged. `window.__atmosphere` is the live driver in DEV (`strike()`).

**Local activity.** `src/game/activity.ts` owns the pure, seed-driven spatial source field and
street-event scheduler. Pressure starts at **0.42**, combines nearby sources, and maps to
**Quiet / Stirred / Hunting**. At most **32** sources persist, each fading over **6 game hours**.
Player noise pulses also enter this field; noise animation remains presentation state.
Arrival opportunities require **250 m** of accumulated movement, arrival **250 m** from the
previous attempt's anchor and **2 game hours** between attempts, with at most **3 incidents per
day**. Failed rolls consume cooldown too. Seeded memory prevents reloads from rerolling the same arrival.
The four incidents are car alarm, shutter, gunfire and scavengers; decisions expire after
**1.5 game hours**. Store responses validate surface context, **120 m** proximity, available
supplies and an unresolved live decision before charging time and granting rewards. See
[GAME_DESIGN.md §3.15](GAME_DESIGN.md#315-noise--nearby-activity) for costs and outcomes.
Responding reduces source intensity to **45%**; dismissing only resolves the choice. Source
decay, bounded validation and event scheduling are pure logic; rewards and inventory changes
remain store actions. Sources and event memory persist under **`singvive.run.v7`**, with safe
defaults for existing saves and the existing debounce/flush policy. The global escalation,
automatic overrun ending and geographic front no longer drive gameplay.

**Evacuation and surface crossings.** `goal.ts` validates published evacuation destinations
with a straight-route scan and at most three deterministic A* detours. Interactive map routing
retains its wall-clock budget. `evacContacted` replaces the runtime cargo quota; legacy quota
fields remain readable in v7 but are ignored. Objectives reuses camera focus, not movement.
`crossingEvent.ts` holds the language-neutral timeline metadata for crossings. The store rolls
the slip-past checks (`rollHazardChecks`) and crosses the caught zones at once; there is no
departure decision. Older v7 saves may still carry a `pendingCrossing` field, which load ignores.
The v7 key and five-second debounce are unchanged.

**Desktop HUD (`lg:` and up).** The survivor rail defaults to 384px (360px below a
1440px viewport). Players can drag its right edge or focus the separator and use arrow
keys to resize; Home/End select the limits, and double-click/Enter resets the default.
The range is 320–560px, capped at 40% of the viewport. The committed preference lives
in `survivorRailWidth` in the existing settings blob; shrinking the viewport clamps the
displayed width without overwriting that preference. Escape, blur and pointer cancellation
cancel an unfinished resize. A stable scrollbar gutter prevents content-width changes
when sections expand. Its width and all slide-out/map offsets share
`--survivor-rail-w` and `railW` in `GameScreen`. Clock, weather, Rest and a compact
`ObjectiveBar` sit above `SurvivorDock`. Labelled health, energy, food and water stick to
the top of the scrolling content. Body and Backpack start open together, each with one
compact clickable heading and its own collapse control; Backpack omits cell counts.
The footer groups 2D/3D as a view selector and keeps the rail overlay as an independent
toggle. Body shows limbs and attributes; the compact tool
row opens Stash, Craft or More (Logbook, Stats, Skills, Timeline, Day logs and Settings; Skills is
hidden while `SKILLS_ENABLED` is off).
Stash automatically reveals the backpack beside the equipment/stash slide-out. Closing
Stash or switching to Craft keeps the backpack open; collapsing a section leaves the
slide-out open. Bleeding/infection share one clickable summary, and a heavy-load warning
appears when Backpack is collapsed. Escape dismisses transient details, More or a slide-out;
it does not collapse the two pinned sections. Disclosure state is local to the mounted
desktop dock; the phone retains its full Condition panel and tabs.

Backpack cells adapt to the available width between 48–56px, with horizontal scrolling
for bags wider than the readable minimum; stash/search grids retain their compact sizing.
Drag coordinates scale the grab offset between source and destination cell sizes. Native
image drag is disabled, release recomputes the destination, and cancellation/blur/Escape
abort the gesture without moving or discarding an item. Item hover cards pin after two
seconds on desktop and then allow crafting-detail expansion and item actions. Close with
the close button, outside click or Escape; scrolling the source or starting a drag also
dismisses the card. Touch keeps its hold-to-inspect behavior.
An `ActivityBadge` beside weather shows Quiet / Stirred / Hunting and opens the timeline. Phone chrome repeats the compact weather/activity pair. Optional incidents use `GameLogEntry.activityEvent` snapshots, rendered by `ActivityEventCard`; outcomes survive replacement, expiry and v7 reloads. The Island front
control and neighbourhood status wash are removed. A pinned map footer holds the 3D and Rail map toggles.
The phone keeps those toggles on the map, `showModeToggles`), with panels in the slide-out beside it; the map fills the rest. The rail, slide-out
and phone tabs share the existing shell; the timeline column renders only below `lg`. Hotkeys `1`–`9`
follow `RAIL_KEYS_SHOWN` in `GameScreen.tsx` (objective, stash, craft, logbook, stats, skills, timeline
pin, day logs, settings; skills drops out, and later keys move up one, while `SKILLS_ENABLED` in
`src/game/featureFlags.ts` is off) and stand down under `isModalOpen()`, text focus and the contact gate;
`Esc` closes the slide-out. Location actions shift past an open slide-out and remain
clickable. Craft widens only into spare space (360–640 px); on narrower desktops, pinned
idle history temporarily becomes a ticker to make room, preserving its pin preference.
Live decisions stay above the location card when those columns cannot fit side by side.
Inside a block
`hdbInset` pads the HDB landing strips clear of the timeline and here card. With 3D on and room to
spare, the strips sit **over the map** instead of replacing it (`hdbOverMap`): they take about 54%
of the free width (`HDB_STRIPS_W`, 720 px max) and the map left of them (`blockStripW`, ≥180 px) shows the
tower. The selected room (`hdbSelUnit`, UI-only store state) feeds the action card
(`HdbContextPanel`) in a card spanning the strips' width. Larger door tiles, floor plates and
action text share the existing type scale; the current landing scrolls into view on travel and
layout resize. The HDB timeline stays available at 320–520 px, including automatic loot and
combat expansion. `LogPanel` leaves reading space below the newest entry, follows arrivals only
while the reader is at the bottom, and offers **Latest** after scrolling into history. New live
choices still bring the player back to the active node. The timeline is a fading `LogTicker` top-right until it is
pinned (`timelinePinned` setting) or something needs an answer (event, search, contact, combat),
then the full `LogPanel` / `CombatPanel`. On the open desktop map, a **single location inspector**
sits at the lower-left edge of the map column. It shows the current location by default and the
target when one is selected; its Here / Target controls let the player inspect either without
discarding the route. Nothing floats over the pins themselves; the map's own badges name them.
Picking a pin never moves the inspector or the camera padding.
`LocationIdentity` gives revealed categories a muted resource-family tint, an explicit type
label, a decorative icon watermark and localized typical-loot hints. Unknown sites use a neutral
header with no category or loot hints. Location status, danger and route restrictions stay visible;
the desktop inspector discloses descriptions and supporting estimates under Details. Faction
services, HDB entry, MRT planning and extraction keep their existing actions.
Inside a block, tunnel or route planner, the existing context card remains at bottom centre.
The phone keeps its tabs, here sheet and corner-docked `TargetDock`. Bottom-anchored desktop chrome sits `HUD_BOTTOM`
(32px) up to clear the attribution bar. `GameMap` takes `padRight` / `padBottom` (and `padLeft`, unused on desktop now)
(camera padding via `CameraInset`, so the chase camera and focus pans centre in the open part of
the map; the open map reserves only the bottom HUD margin, while inside views use the measured
context-card height) and `chromeRight` (moves the 3D / Rail buttons clear of
the timeline). During the contact gate the rail, slide-out and map dim and stop taking input (the map goes
`inert`); the timeline stays lit.

### The type scale

Every typographic value in the app comes from **`src/ui/type.ts`** — there is no other place a
font-size, line-height, letter-spacing or weight may be written. Eight named roles, and they are
the whole vocabulary; Tailwind's default `text-xs`/`text-lg`/… scale is **replaced**, not
extended, so the old class names no longer compile to anything.

| role | size | leading | tracking | weight | for |
| --- | --- | --- | --- | --- | --- |
| `text-micro` | 10px | 1.4 | — | — | plain small readouts, meter values, timestamps |
| `text-label` | 10px | 1.2 | 0.12em | 600 | small caps label — pair with `uppercase` |
| `text-body` | 12px | 1.4 | — | — | the workhorse |
| `text-plate` | 12px | 1.25 | 0.12em | 700 | section kicker — pair with `uppercase` |
| `text-read` | 14px | 1.35 | — | — | buttons, inputs, emphasised rows |
| `text-title` | 18px | 1.3 | — | 700 | modal and panel headings, hero numerics |
| `text-marquee` | 30px | 1 | -0.01em | 700 | clock, death stat, SIGNAL LOST |
| `text-banner` | 48px | 0.95 | -0.02em | 700 | the wordmark |

Three consumers, one definition:

- **Tailwind classes** — `tailwind.config.ts` builds `theme.fontSize` from `tailwindFontSize()`.
  A role carries its own leading/tracking/weight, so a call site is usually one class. Tailwind
  emits `font-size` *before* weight/leading/tracking, so a site can still override any of them
  (`text-body leading-relaxed` for prose) when it has a reason to.
- **`src/index.css`** — reaches the scale through the `--type-<role>-{size,leading,tracking,weight}`
  custom properties, emitted by an `addBase` plugin. It must never name a literal size.
- **Imperative label builders** — the marker HTML in `mapIcons.ts` and `MrtOverlay.tsx` call `typeCss(role, { scale })`, which returns a declaration string.
  `scale` is how a dense map zoom shrinks a label without inventing a step off the scale.

Sizes are **rem, never px**. A px value silently opts out of the player's Font size setting
(`src/game/settings.ts` → `src/App.tsx` sets the root px) — which is exactly how a third of the UI
used to ignore that setting while the description claimed it "affects the whole interface".

Weights are limited to **400 / 600 / 700**, the exact set `index.html` loads Noto Sans SC at.
500/800/900 get synthesised into mud on Han glyphs, and loading more weights is expensive:
Google Fonts splits Noto Sans SC into ~100 `unicode-range` slices *per weight*.

CJK overrides live at the top of `src/index.css` and key off `html[lang='zh-Hans']`. They target
the utilities themselves (`.uppercase`, `.text-label`, `.text-micro`) rather than a wrapper class,
so they reach every call site — including a size lift for the 10px roles, which are below the
legibility floor for Han.

`npm run lint` enforces all of this via `scripts/check-type-scale.mjs`. If you need a size the
scale does not have, **add a role to `src/ui/type.ts`** — do not reach for `text-[13px]`. The
guard's allowlist is for icon geometry only: a glyph centred in a hard-coded px box, which must
*not* scale with the font setting.

### DEV tooling stack (reuse this)

In-game editors that must **persist to the repo** (not just mutate a live run) follow the loot
catalog tool. Use the same shape when adding trait, recipe, faction, or loot-table browsers.

**Launcher:** floating **Dev** control (bottom-left) in `npm run dev` only — opens a panel for
**Loot**, **Enemies**, **Icons**, **Locale**, and **Sound**. Overlays are mutually exclusive. `Ctrl+Shift+D`
hides the launcher for clean playtest screenshots (remembered for the tab via `sessionStorage`).
Deep-links still work via `src/dev/devBridge.ts` (`openLootItem`, `openEnemyEditor`,
`openIconBrowser`, `openLocaleEditor`).

| Layer | Role | Where |
|---|---|---|
| Catalog on disk | Machine-writable source of truth | e.g. `src/game/data/items.json`, `lootTables.json`, `recipes.json`, `enemies.json`, `itemTileColors.json`; chrome icons under `src/assets/icons/`; locales under `src/i18n/messages/` |
| Game import | Load catalog into pure logic (clone if you mutate at boot) | e.g. `src/game/loot.ts`, `crafting.ts`, `enemies.ts`, `itemTileColor.ts`; icons via `src/icons/`; copy via `src/i18n/` |
| Shared validation | Same checks for API + UI | `src/dev/validateItems.ts`, `validateLootTables.ts`, `validateRecipes.ts`, `validateEnemies.ts`, `validateItemTileColors.ts` |
| Vite DEV API | `apply: 'serve'` only — never in `vite build` | `vite.loot-dev-api.ts` → wired in `vite.config.ts` |
| Client API helpers | `fetch` / export / import / upload | `src/dev/lootApi.ts`, `enemyApi.ts`, `iconApi.ts`, `localeApi.ts` |
| UI | Full-screen overlays + Dev menu, gated by `import.meta.env.DEV` | `src/dev/DevToolsMenu.tsx`, `LootBrowser.tsx`, `EnemyBrowser.tsx`, `IconBrowser.tsx`, `LocaleEditor.tsx`, mounted from `App.tsx` |

**HTTP surface (localhost, DEV server only):**

- `GET/PUT /__dev/items` — read/write the JSON catalog (PUT validates + pretty-prints; HMR suppressed so the editor stays open)
- `GET/PUT /__dev/loot-tables` — read/write `src/game/data/lootTables.json` (same; hard-refresh to load into live `loot.ts`)
- `GET/PUT /__dev/recipes` — read/write `src/game/data/recipes.json` (same; hard-refresh to load into live `crafting.ts`)
- `GET/PUT /__dev/enemies` — read/write `src/game/data/enemies.json` (zombies, elites, humans, loners, animals, spawn rules; hard-refresh for live combat)
- `GET/PUT /__dev/item-tile-colors` — read/write `src/game/data/itemTileColors.json` (inventory tile tints by category)
- `GET/PUT /__dev/locale?id=en|zh-Hans` — read/write locale catalogs (query form; path `/__dev/locale/zh-Hans` can fall through to SPA HTML)
- `GET /__dev/item-icons` — list on-disk `item-*` assets + max upload size
- `POST /__dev/item-icon` — upload PNG/WebP (64 KB / 256px edge max) → `src/assets/icons/item-<id>.(png|webp)`, and
  register `item.<id>` in `src/icons/keys.ts` when missing
- `GET /__dev/icons` — list on-disk **non-item** chrome icon assets + max upload size/edge
- `POST /__dev/icon` — upload PNG/WebP for an existing non-`item.*` key → `src/assets/icons/<key-with-dashes>.(png|webp)` (does not edit `keys.ts`)
- `DELETE /__dev/icon?key=…` — remove on-disk chrome asset (emoji fallback remains)

**Loot browser UX extras worth copying:**

- Tabs: **Items** | **Tables** | **Recipes** | **Tiles** in the same floating DEV tool
- Per-item dirty prompts when changing selection; catalog-level **diff review** before Save
- Keyboard: `Ctrl/Cmd+S` save, `Esc` dismiss/close, `↑/↓` move the list
- Duplicate item, side-by-side compare, where-used (loot tables / recipes / factions / starting)
- Filters: exotic, starting, missing art; sort + group-by-kind
- `ItemDef.startingItem` (+ optional `startingCount`) defines the Classic Survivor kit; other roles define `kit` in `occupations.ts`. Run start calls `resolveStartingKit(occupationId, traitIds, rng)` (`startingKit.ts`)
- Bags: in-item **bag-grid editor** (`packGrid` silhouette + blocked cells)
- Tables editor: scarcity-aware effective %, sort, badges, weight bars, ± steppers, normalize, duplicate category, drag reorder, craft-only / no-common warnings, only-in-table, diff-before-save, roll simulator + richness, jump-to-item
- Recipes editor: combination builder (search-add ingredients with kind filter + keyboard), output, optional tool, field vs shelter, hours, economy strip (value/weight/evac Δ), source badges, soft warnings, sandbox pack + Handyman, workbench preview + read-only repair, chain/cousin links, overview table, compare, family duplicate (swap one input), reorder, dirty-nav, jump-to-item; drafts stay mounted across Items/Tables tabs; item where-used reads the live recipe draft
- **Item art** is owned here (`item.*` upload / missing-art filter) — not in the Icons browser
- **Tile colors** tab edits `itemTileColors.json` (tints by item category; gameplay tiles ignore per-item `color`)

**Enemies browser:** opened from the Dev menu. Tabs **Overview** | **Zombies** | **Humans** |
**Spawn** — sortable strength table (HP/atk/threat/TTK), tier reorder, shared `humanDefaults` +
faction overrides, elite/loner stats, drop pools (click → Loot), where-used, compare, derived
danger readout, seeded preview.

**Icons browser:** opened from the Dev menu. Browse all non-`item.*` keys by namespace; filter
missing/has art; progress counter; tint preview swatches; drag/drop or upload PNG/WebP; clear
asset; orphan-file list for on-disk files with no matching key. Hard-refresh after uploads to
pick up new asset URLs in the live game.

**Locale editor:** opened from the Dev menu. English is source of truth; zh-Hans is an overlay.
Filter by namespace (`ui` / `settings` / `guide` / `item` / `enemy` / `recipe` / `trait`), missing
only, and search. Mass JSON export/import for translation drafts. Placeholders (`{n}`, `#{vars}`)
must stay intact; do not translate Singapore place names (POI / MRT / zones). Save writes
`src/i18n/messages/zh-Hans.json` (or `en.json`); a live overlay previews unsaved zh-Hans in the
running client.

**Hard rules when cloning the pattern:**

1. **Keep `src/game/` pure** — no React, no `fetch`, no file I/O. Editors live in `src/dev/`; the
   game only *imports* the committed data.
2. **Prefer JSON (or generated TS) over rewriting hand-authored modules** — comments in a giant
   `ITEMS = {…}` block do not survive round-trips; put lore in docs or optional fields if needed.
3. **Gate the UI with `import.meta.env.DEV`** and the plugin with `apply: 'serve'` so production
   bundles and `vite build` never expose write endpoints.
4. **Validate on both sides** — UI disables Save when invalid; the middleware rejects bad PUTs with
   400 + error list (same invariants as any DEV asserts in game code).
5. **Export/Import** — download JSON / file-pick into the *draft*; persist only on Save so imports
   are reviewable.
6. **Asset uploads** — size + mime + magic-byte checks; canonical filenames; optional keys/registry
   patch so the rest of the app resolves the new art after HMR.
7. **Immutable ids after create** when other tables reference them by string (loot tables, recipes,
   factions). Allow id edits only on unsaved drafts.
8. **Register new overlays in `DevToolsMenu`** instead of adding another floating chip; use
   `devBridge` open/close events so tools stay mutually exclusive.

**Minimal checklist for a new similar tool**

1. Extract the catalog to `src/game/data/<name>.json` (or add a sibling file).
2. Point the pure game module at that file.
3. Add `validate…` + `src/dev/<Name>Browser.tsx` + helpers under `src/dev/`.
4. Extend or add a Vite `apply: 'serve'` plugin with `GET/PUT /__dev/<name>`.
5. Mount `{import.meta.env.DEV && <Dev… />}` from `App.tsx` and add a row to `DevToolsMenu`.
6. Confirm `npm run build` — no `/__dev` strings and no editor chrome in `dist/`.

### Sound: cues, engine, console

Two layers share one `AudioContext` (`src/audio/context.ts`):

- **Ambience** (`src/audio/ambience.ts`) — procedural Web Audio beds and one-shots, no files.
- **Cue engine** (`src/audio/sfx.ts`) — plays a file per *cue*. Cues are moments, listed with their
  trigger in `src/audio/cues.ts`; which file plays is `public/audio/manifest.json`. A cue with no
  file is a no-op (two map lookups, nothing allocated). Files load lazily after the first gesture.
  Volume = `sound` setting × `sfx` setting × per-cue volume. Cues marked `synth` (contact,
  nightfall, thunder) keep the ambience synth until a file is assigned, then the file replaces it;
  cues marked `duck` dip the ambience.

`src/game/` stays pure: the store never calls audio. `src/audio/director.ts` watches the store
(state diffs) and wraps a few actions from outside (craft vs refused, stash vs bag) to fire cues.
UI clicks/hovers go through one delegated listener in `useSfx` (`data-sfx="<cue>"` picks a cue,
`data-sfx="none"` mutes a button). Dice, pin and panel cues fire from their components.
To add a cue: add it to `CUES`, fire it with `sfx.play(id)` (or `sfx.loop(id, on)`) from a
component or the director — never from `src/game/`.

**Dev → Sound** (`src/dev/SoundConsole.tsx`, `vite.sound-dev-api.ts`) lists every cue with play,
upload (drop on a row, or drop files named `<cue id>.<ext>` anywhere), volume / pitch spread /
loop, and a live dot when the game fires the cue. Files are written to `public/audio/`.
`npm run audio:manifest` rebuilds the manifest from the folder without the dev server.

---

## 2. Running it

```bash
npm install
npm run dev       # http://localhost:5190  (PORT env overrides; see vite.config.ts)
npm run build     # typecheck (tsc -b) + production build
npm run build:itch  # static zip for itch.io → release/singvive-itch.zip
npm run lint      # oxlint with a warning cap + type-scale + zh-Hans glossary guards
npm run preview   # serve the production build locally (Worker + assets)
npm run db:migrate:local  # apply D1 migrations to the local honor board (first time)
```

### itch.io upload

`npm run build:itch` is a static build (`vite build --mode itch`, `base: './'`, no Cloudflare plugin) packed so `index.html` is at the root of `release/singvive-itch.zip`. Upload that zip as an HTML project. The worldwide honor board stays on the Worker — `/api/scores` is absent inside the itch player, and the client treats that as offline. Runs still save in the player's `localStorage`.

### Refreshing map data

```bash
npm run bake:pois
```

Rewrites `public/pois.json` from a fresh Overpass pull. It is **not** part of
`npm run build` — a flaky Overpass should never break a deploy. Run it manually for
fresher OSM data, then commit the result.

The bake:

- Classifies via `src/game/poi.ts` (hospitals vs clinics are separate)
- Verifies residential pins against official [HDB Existing Building](https://data.gov.sg/datasets/d_16b157c52ed637edd6ba1232e026258d/view)
  polygons plus OSM housing tags. It refuses to write unchecked housing if the reference fails.
  Use `npm run bake:pois -- --hdb path/to/HDB.geojson` with a downloaded reference.
  Commit `src/game/data/verifiedHdb.json` with `public/pois.json`; runtime and live fallback
  accept only HDB IDs/positions in this small registry. New HDBs require an explicit bake.
- Drops anything outside `SG_OUTLINE` (no Johor spill)
- Re-fetches building footprints, matches shop nodes to containing buildings
  (ways, multipolygon relations, and `building:part`), retries failed outline
  chunks, and rejects oversized mall/campus shells for small shops
- Prints category counts and outline coverage when it finishes

`node scripts/audit-pois.mjs` writes the offline planning-area density/gap report to
`reports/location-audit.md`; optional `--before old-pois.json` compares a prior bake.
The [November 2026 audit](reports/location-audit.md) identifies sparse areas and data-source
priorities. Counts precede runtime caps and walkability filters; gap samples include undeveloped
and restricted land, so they are coverage diagnostics rather than a census of missing businesses.

To repair an existing bake without refetching every footprint, run
`node scripts/verify-hdb-pois.mjs --hdb HDB.geojson --osm residential-elements.json`.
The OSM JSON must contain original elements for every residential candidate (including tags);
the repair rejects incomplete evidence. The rule uses point-in-polygon with holes, never a
nearest-building guess. Conservative rejection can omit genuine blocks with bad centroids or
stale data. The original OSM bake timestamp remains intact; HDB verification has a separate date.

No procedural neighbourhood is generated on data failure. Spawn returns `unavailable` and the
localized screen offers a retry. v7 save loading converts unverified HDB/procedural sites to
exhausted open ground, keeps IDs/positions/stashes, and removes their interiors/outpost roles.

The November 2026 expansion adds **11,293 sites** to the corrected 6,991-site baseline
(18,284 total, including 3,940 verified HDBs). It combines OSM housing/amenity/tourism
records with official NEA hawker centres and PA community clubs. Source URLs, timestamps,
SHA-256 hashes and rejection counts are in `reports/location-expansion.json`; planning-area
coverage is in `reports/location-audit.md`. All additions pass the committed land, water and
restricted-area masks. Original source coordinates are retained to five decimal places;
HDB outlines use official geometry, preserving full precision where simplification clips a pin.
Ordinary housing, eateries, community sites and named parks have separate gameplay categories.
Parks never claim building geometry or provide guaranteed indoor shelter.

Manual expansion workflow (never part of build):

```bash
npm run fetch:locations
# Preserve a copy of public/pois.json before expansion when comparing coverage.
npm run expand:pois -- --base path/to/baseline-pois.json
npm run audit:pois -- --before path/to/baseline-pois.json
npm run test:locations
```

The downloader reuses `tmp/location-sources/`; remove individual cache files explicitly to
refresh them. `expand:pois` can also run without `--base` to extend the current bake. A full
`bake:pois` replaces the OSM bake, so reapply `expand:pois` afterwards for government points.
Commit `public/pois.json`, `public/poi-data/`, `verifiedHdb.json`, `poiRevision.json` and the reports together.
`poiRevision.json` hashes the POI content. v7 loads clear only the expansion-cell cache when
this revision changes; continuing discovers additions while preserving existing locations,
loot depletion, stashes and interiors. The save key and debounce remain unchanged.
Source snapshots are evidence, not a live business directory: PA attributes date to 2021,
NEA to 2024, and OSM coverage/centroids vary. Additive imports preserve old sites; closures
and relocations need a separate review. Government points use stable dataset/postal IDs.

### POI loading and map update performance

`public/pois.json` is the canonical bake and audit input. Runtime loads
`public/poi-data/<poiRevision>/index.json`: names, positions, categories, evacuation IDs,
and footprint-cell references. Exact outlines live in ~2.2 km cell files under the same
revision. `npm run pack:pois` regenerates these assets offline; every POI bake/repair/expansion
also packs them automatically. This is separate from build and does not fetch new source data.
The asset regression test reconstructs the canonical bake and compares every coordinate.

Spawn prefetch loads only the index. `bakedPoisNear` awaits nearby outlines before creating
LocationStates, preserving area-based sizes, loot/search counts and HDB geometry. Island-wide
evac selection uses metadata; only the chosen site's geometry is awaited. Continuing a v7 save
requests the cells referenced by saved location IDs before rehydrating their outlines.
Concurrent callers share each cell request; failed/incomplete or mismatched-revision responses
are rejected and retryable. Neither an unavailable outline nor a metadata-only evac candidate
should be used to silently resize a location.

The loader uses a versioned Cache Storage namespace (`singvive-pois-<revision>`). Nearby
requests take priority, then two background requests at a time populate the rest after a
two-second delay. Once populated, POI metadata/geometry work offline across reloads where
Cache Storage is available; shell, basemap and other datasets retain their existing caching
behaviour. Storage denial/quota does not block online play. An interrupted cache pass leaves
uncached regions dependent on connectivity; a later local request retries. Cache Storage needs
a secure context (HTTPS or localhost). It does not add geometry to localStorage saves.

For the expanded 18,284-site bake, the full file is 1.215 MB gzipped. The split index is
0.398 MB; the four footprint cells around the Hougang test spawn add 0.040 MB. These are
offline gzip sizes, not measured network-transfer times or FPS gains. Other spawns and the
chosen evac may request additional cells. Background downloads defer bytes rather than
eliminating them.

`PoiSources` keeps stable GeoJSON feature IDs and submits coordinates only when membership,
position or an outline changes. Selection, colours, opacity, outline width and dot/badge
visibility use feature-state. Culling/fog/caps still apply before creating features; changing
selection at the cap can legitimately replace membership. `GameScreen` subscribes to the
search nonce rather than the session object, so slot/progress-only replacements do not notify
that subscription. Item reveals and other independently subscribed changes still can render it.

### Phone and long-run profiling workflow

Use a production build for decisions; development mode and headless screenshots distort timings.
Keep one seed and export the same v7 save for repeat runs. Test an early urban run, a sparse
Tengah run, and a real long run with many explored cells, HDB interiors and timeline entries.
Record location count, explored-circle count, HDB count and serialized save size with results.

1. Run `npm run build`, then `npm run preview -- --port 5191` on the computer.
   If that port is occupied, use the actual port printed by Vite in the following steps.
2. On a physical Android phone, enable USB debugging, connect it, open Chrome's
   `chrome://inspect/#devices` on the computer, and forward phone port 5191 to computer
   `localhost:5191`. Open `http://localhost:5191` on the phone and inspect that tab.
   This keeps Cache Storage available without exposing the dev server to the LAN.
   See [Chrome's remote debugging guide](https://developer.chrome.com/docs/devtools/remote-debugging).
   An iPhone requires Safari Web Inspector on a Mac; a resized desktop viewport is not a GPU test.
3. Capture separate Performance recordings for cold spawn (clear only this test origin's caches),
   warm continue, 30 seconds of pan/zoom in 2D and 3D, repeated target selection, route planning
   across water/bridges, searching/combat, and save flush after a long run.
4. Record transferred POI bytes, time to playable map, long tasks, frame-time spikes, route latency,
   save serialization/write time and heap growth. Compare at least five identical repetitions;
   report median and worst observed results, not an unstable p95 from five samples. Separate
   CPU throttling experiments from real-device numbers. Keep weather, camera, device temperature
   and background apps comparable.
5. Inspect [Performance traces](https://developer.chrome.com/docs/devtools/performance) before
   choosing the next change. Main-thread route spikes justify a browser Worker investigation;
   GPU/frame spikes justify reducing effects/resolution or draw work; save spikes justify a
   persistence change. Preserve deterministic seeds, stale-result cancellation, offline data,
   unchanged route legality, and a migration plan if save storage changes.

The current browser smoke checks cover desktop 1440×1000 and phone layout 390×844, zero
POI `setData` calls across two selections, and offline discovery after the cache pass. They
do not establish physical-phone frame rates or long-run memory behaviour.

### Refreshing walkability zones

```bash
npm run bake:zones
```

Rewrites `public/zones.json` — land mask, inland water, coarse restricted
(military) perimeters, and known forest / nature-reserve polygons. Water and
restricted hard-block spawn/trek; vegetation stays walkable but adds a soft
time cost when a route cuts through it. Surface walking energy uses direct distance via
`travelEnergy.ts`; `surfaceTravelProfile` and `quoteTravelEnergy` are shared by the map,
cards and store. Walking advances the clock with passive energy drain disabled; encounter
energy remains separate. Same rules as the other bakes:
manual, committed, never part of `npm run build`. Pass `--local` to skip
Overpass and write committed fallbacks only (useful when the public Overpass
mirrors are rate-limiting).

Bridge decks live in the same file as `crossings`, written by a second manual step:

```bash
npm run bake:crossings   # run after bake:zones; bake:zones keeps the committed list
```

It fetches every OSM `highway` + `bridge` way (tiled Overpass), stitches ways that meet end to end,
keeps only decks that cross masked water (sea or a `water` ring), pushes wet ends along their
heading until they reach dry ground (≤ 80 m), and stores each as `{ id, halfWidthM, points }`
(half-width from the highway class, 5–12 m). Decks with no dry vertex (Johor, offshore piers) are
dropped; the current bake keeps ~1,200 decks (~127 KB). Overpass tiles are cached in the OS temp dir
(`--fresh` refetches), so a 502 midway only costs the failed tile. `src/game/crossings.ts` merges them with the hand-placed
`MANUAL_CROSSINGS` (Sentosa Gateway footpath) when `installZones` runs, in a ~220 m grid index.
Deck corridors override water in `playable.ts`; country bounds and restricted zones still win (the
Causeway and Second Link stay closed). `route.ts` adds the deck vertices in the A* corridor and
exact trek endpoints to the existing 100 m A* grid under the same 8 ms / 8,000-expansion budget.
No deck link is validated up front: deck segments, deck-end ↔ grid links and joins are tested
lazily when the search reaches them, and deck ends within 30 m join each other (T-junctions). Grid
edges use the fine 10 m chord step only where they actually meet a deck capsule. A trek that
starts or ends mid-span links to that segment's two vertices. This avoids missing a bridge between
grid cells. Route simplification preserves crossing vertices, and memo keys retain exact endpoints
so a nearby sea click cannot reuse a deck route. No runtime map request or save migration is needed.

The water tint clears decks in `src/map/crossingGeometry.ts`. polygon-clipping throws on an
island-wide union of every deck, so each deck is unioned on its own, each water polygon is clipped
only by the decks over its bounding box, and a clip that throws is bisected (a single failing deck
stays tinted, never a crash). The ~300 ms cut runs in `requestIdleCallback` from
`UnplayableOverlay`; the plain tint shows first.
Regression tests use the committed `public/zones.json` for both directions and mid-crossing treks.
The spawn terrain wash subtracts those same deck corridors from sea and inland-water tint through
`src/map/crossingGeometry.ts`, so the map does not paint a traversable bridge as blocked water.
Restricted-area tint stays intact; the cutout geometry is cached with the terrain, not rebuilt per frame.

### Refreshing hazard sites

```bash
npm run bake:hazard-sites
```

Rewrites `public/hazard-sites.json` — the footprints the wilds field can turn into themed hazard
zones (school campuses, hawker centres, MRT stations, police posts, stores, industrial units, HDB
blocks), as delta-encoded convex hulls. Derived offline from the committed POI bake (`pois.json` +
`poi-data/`), so no network; re-run after `bake:pois` / `pack:pois` changes the POI revision.
`ensureZonesLoaded()` fetches it with `zones.json`; if it is missing the field falls back to disc
pockets everywhere. Manual, committed, never part of `npm run build`.

### Refreshing hazard areas

```bash
npm run bake:hazard-areas
npm run bake:hazard-areas -- --from tmp/hazard-areas/osm-areas.json   # reuse a download
```

Rewrites `public/hazard-areas.json` — block-sized OpenStreetMap outlines (residential estates,
parks, school grounds, campuses, hospitals, commercial/retail and industrial blocks, filtered to
roughly 120–500 m across) that the wilds field seals off whole. Fetches from Overpass and caches
the raw response in `tmp/hazard-areas/`. overpass-api.de answers a bare client with HTTP 406, so
the script sends a User-Agent and `Accept: application/json`. Manual, committed, never part of
`npm run build`.

### Refreshing district lines

```bash
npm run bake:subzones
npm run bake:subzones -- --from tmp/hazard-areas/subzones.geojson
```

Rewrites `public/subzones.json` — URA Master Plan 2019 subzone borders (332 subzones) as
deduplicated, simplified polylines (each shared border once). `DistrictLines` draws them as thin
pale lines over the run map from z11.7 up, above the fog, set once (no idle renders). Same rules:
manual, committed, never part of `npm run build`.

### Refreshing planning areas

```bash
npm run bake:towns
```

Rewrites `public/towns.json` — simplified URA Master Plan 2019 planning-area polygons (no sea),
each assigned to one of the 20 gameplay towns. The run map paints these as the island status
overlay. Same rules: manual, committed, never part of `npm run build`. Pass `--from file.geojson`
to skip the data.gov.sg download.

### Refreshing the rail network

```bash
npm run bake:mrt
```

Rewrites `public/mrt.json` — 186 stations and 12 lines, ~63 KB, in well under a minute. Same rules as
the POI bake: manual, committed, never part of `npm run build`.

Topology comes from the **station codes**, not from stitching OSM route relations into a path: NS1..NS28
is an ordered line by construction. The relations are used for exactly two things — the track polylines
the overlay draws, and deciding which lines are actually *open* (a `construction=*` route relation means
its stations stay off the map, which is what keeps the unbuilt Jurong Region and Cross Island lines out).
Branches and the LRT loops are declared in the `CHAINS` table at the top of the script.

Three traps, all already paid for:

- `out geom tags` on a relation silently returns **zero members**. The `tags` modifier switches Overpass
  to a tags-only print. It must be `out geom`.
- **OSM maps each direction of travel as its own way**, so a line arrives as two parallel rails ~15 m
  apart and draws as a double line. `dedupeWays` keeps one centreline by dropping any way whose length
  is ≥75% covered (within 40 m) by an already-accepted, *longer* way on the same line — short ≤3-point
  stubs drop at ≥50% cover. It must be a **cover fraction**, not a nearest-point test: the Changi
  branch shares the East West alignment for a few hundred metres out of Tanah Merah, and a "reject
  anything that comes close" rule eats every branch at its junction. Longest-first ordering is what
  stops two twins deleting each other. After dedupe, `stitchWays` chains leftover fragments whose
  endpoints lie within 200 m into continuous polylines so the overlay does not draw dashed track.
- MRT/LRT interchanges (Choa Chu Kang, Sengkang, Punggol) are two OSM stations sharing a name and a
  building but *no* station code, so code-merging alone leaves the LRT loops unreachable. Same-named
  stations within 400 m are folded together.

Two things keep the POI bake fast, and both are load-bearing:

- **Two whole-island queries, not per-cell tiling.** Overpass costs scale with *statement count*, not
  area. An earlier version tiled the island into 40 cells with one `nwr` per tag — 640 index scans —
  and got a steady stream of 429s and 504s. Collapsing tags into regex alternations (`shop~"^(a|b)$"`)
  made it two queries totalling ~20s. Don't re-expand the statements.
- **Category thinning.** Broad OSM housing queries include private homes and nearby Johor.
  HDBs are independently verified and sampled in ~122m cells; ordinary housing and industrial
  sites use ~200m cells; eateries use ~72m cells. Runtime neighbourhoods retain the 220-site
  cap, with at most 100 HDBs, 50 ordinary residences and 50 eateries before waypoint bridges.

The bake runs four passes. The last two exist because OSM maps most shops as point *nodes* inside a
building rather than as the building — straight from Overpass only ~10% of locations have any shape:

1. Shops & amenities (`out geom`).
2. Housing candidates (`out center`); verified HDBs become void decks; other mapped homes become ordinary residences.
3. Re-fetch the kept void decks **by way id** to get their real footprints (they were always
   buildings; pass 2 only asked for centroids). Batches of 100.
4. Buildings within 15m of the remaining point POIs (ways, building multipolygons, and
   `building:part`), matched by **point-in-polygon**. Prefer tagged amenity matches and unit-sized
   parts; smallest rank wins. Failed grid chunks are retried. Small shops skip shells larger than
   ~8,000 m² so a 7‑Eleven does not inherit the whole mall.

Two rules in pass 4 are load-bearing:

- **One outline per building.** A mall is one OSM building holding many POI nodes. Giving every tenant
  the mall polygon stacks a dozen identical giant shapes in different colours — visually worse than no
  outline. The building is drawn once for its richest tenant; co-tenants stay as badges, which reads
  correctly as "shops inside this building".
- **Simplify with Douglas-Peucker, never by sampling every Nth vertex.** Sampling discards the corners
  that define a footprint and turns complex buildings (MRT concourses run 65-74 points) into spiky
  arrows.

Pins that fall outside their assigned ring are snapped to the footprint centroid so fog/hover stay
attached to the building.

Void decks keep their category-default `size` even though they now have outlines — see the comment in
`world.ts`, it's a deliberate balance decision, not an oversight.

`scripts/bake-pois.mjs` imports `classifyOsm` straight from `src/game/poi.ts` (Node strips the
`import type`), so classification logic lives in exactly one place — edit `poi.ts`, re-bake.

The three curated OSM landmarks live separately in `src/game/data/landmarks.json`. Refresh just
those footprints with `node scripts/bake-landmarks.mjs` (manual, networked, never part of build).
`bakedPois.ts` merges them once before indexing the island bake; their stable OSM IDs and outlines
therefore use the same save stripping and rehydration as ordinary sites. They add no runtime
request, wider geographic query, model loader or new map layer. Landmark complexes match all buildings
and parts inside their footprint, while ordinary shops retain the single-building matching rule.
The existing CARTO SkyPark feature lacks OSM's `min_height=193`; `map/landmarkGeometry.ts` applies
a source- and feature-specific correction through feature-state, only while that field is missing.
Try them in a fresh run near Marina Bay. Existing saves keep their generated neighbourhoods;
the catalogue does not backfill sites into already-expanded cells.

### Deploying

Cloudflare **Workers + Assets + D1** (live origin `https://singvive.shhhhhdev.workers.dev`). Node
pinned by `.nvmrc`. No `_redirects` — the app is phase-based with no router, so every URL is `/`
except `/api/scores`.

One-time D1 setup (Cloudflare login):

```bash
npx wrangler d1 create singvive-scores
# paste database_id into wrangler.jsonc
npm run db:migrate
```

Local / one-shot: `npm run deploy` (`tsc -b && vite build && wrangler deploy`).

**Workers Builds** (Git-connected CI on the `singvive` Worker) already deploys on push. Preferred
settings under **Workers → singvive → Settings → Builds**:

| Setting | Value | Why |
|---|---|---|
| Build command | *(leave empty)* | Avoid a double `vite build` |
| Deploy command | `npm run deploy` | Matches `package.json` (`build` + `wrangler deploy`) |
| Preview deploy | `npx wrangler versions upload` | Default non-production path |

The worldwide board is an honor list: the client posts the score; the Worker sanitizes names and
rate-limits by IP. Personal top-10 stays in `localStorage` and is not bulk-uploaded.

**Board hardening.** `POST /api/runs` registers a run (random id in D1 `runs`, 30 per address per
hour); `POST /api/scores` needs that id plus `kills`, and is refused unless the run exists, matches
the seed, has not posted, and passes `worker/scoreRules.ts` (kill and loot ceilings, minimum real
time per day, score must equal the formula). Days, kills and score must be finite safe integers;
numeric strings must also parse safely. There is no gameplay-derived day cap or former 16-day
limit: **30 seconds per additional game day** and **60 real days of registration retention**
bound plausible submissions. The Worker keeps its own
copy of the formula; `src/api/scoreRules.test.ts` fails if the game drifts from it. POSTs from
another origin get 403 and bodies are capped at 2 KB.

**Migrations are not part of the deploy.** Workers Builds runs `npm run deploy` only, so apply a new
file in `migrations/` with `npm run db:migrate` *before* merging the code that needs it. Keep
migrations additive so the live Worker survives the gap.

**Security headers** live in `public/_headers` (Workers Assets). The CSP ships as
`Content-Security-Policy-Report-Only`: it blocks nothing and logs violations to the browser
console. Once a full run on the live site logs none, rename the header to
`Content-Security-Policy` to enforce it. New third-party hosts (tiles, fonts, APIs) must be added
there.

---


---

## 3. Testing, linting & CI

| Gate | Command | What it covers |
|---|---|---|
| Types | `npm run build` (`tsc -b` runs first) | All four TS projects. **`strict` is on everywhere** — app, node, vitest, worker. |
| Lint | `npm run lint` | oxlint, `scripts/check-type-scale.mjs`, `scripts/check-zh-hans-glossary.mjs` |
| Tests | `npm run test` | Vitest, `environment: 'node'` |

GitHub CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `lint` → `test` → `build` on
push/PR to `main` (no deploy). Production deploys are **Workers Builds** on the Cloudflare Worker
(`npm run deploy`) plus optional local `npm run deploy`.

### Test coverage — know what is *not* covered

Fourteen suites, 83 tests, ~1.3k lines — mostly under `src/game/`, plus catalog validation and
i18n key guards:

`combat`, `wilds`, `events`, `inventory`, `firearms`, `intel`, `logGroup`, `persistRun`, `rng`,
`crafting`, `survival`, `storage`, `dev/catalogs`, `i18n/messageKeys`.

Vitest runs in the **node** environment. The local activity suite covers the pure spatial field,
event gates and saved-state normalization. `src/api/scoreRules.test.ts` covers long-run score
plausibility and the Worker submission boundary with a D1 test double. Component and hook flows,
map presentation and full playthroughs still require browser checks; targeted store tests do not
replace those checks. The pure `src/game/` modules are the parts that are cheap to test; prefer
putting new logic there. Broad Worker/D1 integration coverage remains limited.

### The lint warning ratchet

The lint script in `package.json` sets the oxlint warning cap. CI fails when the count exceeds
the cap. Lower it when a change removes warnings. Review hook dependency warnings individually
because changing a dependency can change when an effect runs.

When you genuinely remove a warning, **lower the number** so the ratchet keeps its grip.

### Determinism is the real test

`src/game/` is pure and seed-driven, which means any change to it can be verified by replay:
run a seeded scenario before and after and compare the numbers. Note that **log text is
deliberately non-deterministic** — cosmetic flavour helpers may use `Math.random` — so compare
gameplay state (meters, body parts, items, kills, gauges), never the prose.

---

## 4. Known debt & scaling limits

Recorded so it is not rediscovered. None of this is currently breaking; all of it is a ceiling.

### Cross-system changes converge in `store.ts`

One flat `State` interface and one Zustand factory hold state and actions for tunnels, HDBs,
combat, and factions. Field prefixes identify each system, but changes spanning systems still
touch the same factory. Splitting it into slices was deferred because the actions share state.

Note also that `_combatRng`, `_eventRng`, and `_eventClock` are underscore-prefixed but fully
public on the hook, and `window.__game` is assigned in production (harmless, intentional, and
documented for console inspection).

### Content catalog types and validators can drift

`items.json`, `lootTables.json`, `enemies.json`, `recipes.json`, and
`itemTileColors.json` are static ESM imports `structuredClone`d at module init and cast through
`as unknown as` — which erases *all* type checking of the JSON against `ItemDef` and friends.

The DEV editors validate catalogs with hand-written predicates in `src/dev/validate*.ts`.
CI runs those validators against the committed JSON through `src/dev/catalogs.test.ts`.
The validators and the game's TypeScript types describe the same fields independently,
so a schema change requires updating both.

**This has already cost a live crash.** Deleting `rotan_cane` and `bamboo_pole` from the DEV
loot browser removed them from `items.json` but left their entries in the `residential` and
`school` loot tables. `rollLoot` then threw `TypeError: Cannot read properties of undefined` on
~6% of residential and ~8% of school searches — an unknown id reports scarcity 1, so it skipped
the substitution path and dereferenced `undefined`. The DEV validator logged it on every boot;
nothing failed the build, and in production that validation is compiled out entirely.

Fixed on several fronts: the stale entries are gone; `rollLoot` / `commonAlternative` now guard
against a missing definition the way `rollStreetLoot` and the raid pull already did; `itemDef()`
throws a named error instead of returning `undefined` disguised as an `ItemDef`; `loadRun()`
strips items that have left the catalog instead of discarding the save; `handleDelete` in the DEV
loot browser now lists what still references an item before you confirm.

**What is still open:** the delete path *warns* but does not *cascade* — clearing the loot-table,
recipe, and locale entries is still manual, and the warning reflects saved tables rather than an
unsaved Tables-tab draft. And the underlying duplication stands: a shared schema (zod or
equivalent) used by the game, the DEV editors, and the build would replace both the casts and the
hand-written validators outright.

Related: prefer `itemDefOrNull` when a missing id is possible (saves, DEV tools). `itemDef(id)`
throws on unknown ids; the JSON→`ItemDef` cast at catalog load is still the unchecked trust edge.

### Saves are parsed across a trust boundary with no validation

`localStorage` is user-editable. `loadRun()` does `JSON.parse(raw) as SavedRun` and then runs
~10 in-place field-presence migrations; a corrupt or hand-edited save is caught only by the
outer `try/catch` returning `null`. Same pattern for `HighScore[]` and the settings map.

That catch-all is more dangerous than it looks: any throw inside a migration is indistinguishable
from "no save", so the player loses the run rather than seeing an error. One such case (an item
deleted from the catalog while still equipped) is fixed and covered by `src/game/storage.test.ts`,
but the shape of the risk remains — a validating parser that reports *what* is wrong would be
strictly better than a `try/catch` that answers only yes or no.

Versioning is by key name (`singvive.run.v7`): bumping to `v7` silently orphans every existing
save, because there is no read-old-key-and-upgrade path. All intra-v6 evolution is the inline
migration list.

### localStorage quota is a real ceiling

Crafting facilities are optional `LocationState.facilities` fields in the existing v7 save. Fire/stove
expiry and hot-water cooling use absolute game hours. Rain collection catches up lazily for the inspected
site using seeded daily weather; it does not scan or clone the island on each time update. Old saves start
without facilities. `ItemInstance.coldPrepared` preserves room-temperature drink quality; omission means
full preparation. Inventory moves, save reloads and inspect previews preserve that flag and contamination.
Pure rules live in `facilities.ts` and `crafting.ts`; recipe fields `preparation`, `facility`, `family`, and
`fixedInputs` are validated and round-tripped by the DEV editor. `itemUtility.test.ts` rejects catalog items
with no direct, equipment, bedding, crafting or explicitly implemented action use; a price is not enough.

`saveRun` already detects `QuotaExceededError` and surfaces it as a log line, because the ~5 MB
limit is reachable. Writes are debounced 5 s and flushed on hide, and OSM building outlines are
stripped before write and rehydrated from the bake on load. What still grows without bound in a
long run: `locations` (as cells expand), `hdbBlocks` (every block ever entered, with full unit
graphs), and `log` (capped at 4,000 entries).

### i18n keys are stringly typed

`t(key: string)` resolves against a nested catalog by splitting the path per call, with no
flat-map cache and no key type. A typo falls through to `?? key` with no compile-time signal.
`useSetting(key: string)` has the same shape — `useSetting('langauge')` type-checks and
returns `''`.

`src/i18n/messageKeys.test.ts` checks content-driven key families such as items, traits,
recipes, settings and equip slots. `catalogCoverage.test.ts` also checks literal translation
calls and UI keys, catalog shape and interpolation-variable parity, nonempty Chinese entries,
and the dynamic families used by character creation, body, skills, locations, combat and
tunnels. Trait effect lists are checked against the game definitions so newly added skill bonuses
cannot disappear behind a stale translated list. A JSX guard catches untranslated visible text and literal accessibility labels outside
the DEV editors. These run with `npm run test`; computed expressions still need review.

Use simple `{name}` interpolation. The translator does not implement ICU plural/select syntax;
use explicit singular/plural keys or a count-neutral sentence. Keep proper place names and
player-authored names intact. Some legacy diary and combat narrative is still generated directly
in English. Diary text already stored in a run retains its original language; changing the language
setting re-renders the UI, not historical log strings.

### Local exploration and logbook leads

`src/game/exploration.ts` owns seeded local clues, conservative nearby recognition, one-time
facility discovery and saved-lead normalization. Store actions call it at arrivals, completed
street searches and five-minute locality-map/noticeboard reads. Recognition uses loaded POIs
and their available footprints; it neither queries MapLibre tiles nor scans the island bake.
Night sight, awareness and head injury feed its separate 20–60 m base radius.

`LocationState.identified` carries name/category-only knowledge independently of `discovered`
and `lastSeen`. The identified map/card branch must never use live faction, danger, ruin or
stock. `visited` records physical arrival; `localFacilityChecked`, `searchClueChecked` and
`localMapRead` prevent repeated grants. Existing `SiteFacilities` handles the actual water,
shelter and stove benefits. These optional fields and `SavedRun.explorationLeads` remain in
`singvive.run.v7`; old saves normalize to an empty lead list. Save debounce and outline stripping
are unchanged. At most six active and 24 total leads are kept.

### Guidance system (`src/guide/`)

A reusable, data-driven camera guide; the noticeboard reveal tour is its first user and a
tutorial can reuse it unchanged.

- `types.ts`: a `GuideSequence` is `steps` + `lock` (`all` shields the screen and swallows
  hotkeys, `map` shields only `[data-guide-map]`, `none` blocks nothing) + `restoreCamera` +
  `skippable` + `onEnd`. A `GuideStep` has an optional `shot` (centre / `'player'` / `fit`
  points, zoom, pitch, bearing, duration), `highlight` point, `callout` (`reveal` pops, `note`
  fades; anchored over the map or docked in the caption), `pins` (many points marked at once,
  each with a ring and a call-out; cards take the first free side of their pin, avoiding other
  pins, the caption and `[data-guide-avoid="bottom"]` HUD) and an `advance` rule: `timer`, `tap`,
  or `signal` (game code calls `guide.signal(name)`, e.g. "player opened the bag").
- `runner.ts`: framework-free state machine (`play` queues behind a running sequence, `arrived`,
  `next`, `signal`, `skip`, `cancel`). Injected clock, unit-tested. If no camera reports arrival
  it moves on after the shot duration + 1.5 s, so a hidden map never hangs a sequence.
- `guide.ts`: the page singleton + `useGuideState()`; `window.__guide` in DEV.
- `GuideMapAdapter.tsx` (inside `MapView`): one `flyTo` / `jumpTo` per step tagged
  `cameraFocus`, so the travel chase and `CameraChrome` hand over exactly as for a log focus;
  current HUD padding is respected (`cameraForBounds` adds to it). Snapshots and restores the
  view. Anchored call-outs live in a fixed layer above the HUD and follow the point on map
  `move` only. A holding step makes no camera calls: the ring and pop are CSS transform /
  opacity on DOM, so the map goes back to zero renders once the post-move POI refresh settles.
- `GuideOverlay.tsx` (in `GameScreen`): shield, caption with progress, Next / Skip, keyboard
  capture, joins `modalStack` so rail and camera hotkeys stand down.
- `revealTour.ts` builds the tour from the store's UI-only `revealTour` cue (never persisted);
  `useRevealTour` plays it (phone switches to the Map tab) and `useGuideInterrupts` cancels any
  guide on combat, an event, a trek or leaving the run.

`StashLogbook` now lists active/visited leads and remembered facility types alongside caches.
Its existing camera callback closes the panel and switches phones to Map; `CameraChrome` combines
padding and focus in one command, zooming to at least level 16 without a closing panel cancelling
the request. It never invokes travel. `LocalMapAction` uses scalar busy/count selectors.
Tests: `exploration.test.ts`, `explorationIntegration.test.ts` and
`components/explorationPresentation.test.ts` and `components/cameraFocus.test.ts` cover limits, identity privacy, occlusion,
determinism, finite facilities, action guards and v7 persistence.

### Client-side scale pressure

For solo gameplay, the Worker handles the score board, and scale pressure is in the browser — the WebGL
map and its DOM markers, the 3.8 MB `public/pois.json` parse, and localStorage. Land A* and walkability scans are
the CPU hotspots, not combat resolution. The guardrails that keep this working (viewport
culling, cached polygon fog, debounced persist, location identity preservation) are listed in
`AGENTS.md` under "Performance / scale" — read that before touching the map. The separate co-op
prototype uses the server-owned room simulation described above.

Below zoom 14, ordinary POIs use one WebGL circle layer instead of individual DOM
markers and building outlines. Selecting a dot restores its full badge; the current
site and known landmarks retain theirs. Both representations share the same fog
visibility, padded viewport and 450-site cap, with selected/current sites and landmarks
prioritised before distance when the cap is reached. Full badges return at zoom 14.

Anything that follows the map should cache its viewport dimensions through
`ResizeObserver` and follow the map's `render` event once per frame. Keep layout
reads (`clientWidth`, `offsetWidth`, etc.) out of camera callbacks: after marker
transforms are written, those reads force the browser to flush styles and layout
during the frame.
