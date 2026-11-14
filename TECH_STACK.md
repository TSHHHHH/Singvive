# SINGVIVE — Tech Stack & Architecture

> How **SINGVIVE** is built, run, and deployed. What the game *is* — the vision, loop, and
> system rules — lives in [GAME_DESIGN.md](GAME_DESIGN.md); the short overview is
> [README.md](README.md).

---

## 1. Architecture

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript 6 + Vite 8 |
| Map | **MapLibre GL JS** v5 (WebGL, plain — no React wrapper; `src/map/`), **CARTO "Dark Matter" vector style** (keyless; OpenFreeMap Dark as fallback), GeoJSON overlays in ordered slots, polygon fog (`polygon-clipping`), 3D building extrusions |
| Real data | OpenStreetMap → `public/pois.json` (`bake:pois`), `public/mrt.json` (`bake:mrt`), `public/zones.json` (`bake:zones`); URA planning areas → `public/towns.json` (`bake:towns`); live Overpass as POI runtime fallback |
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
               wildsEncounter, vegetation, playable, route, noise, ghostSurvivor, townField,
               itemTileColor, settings, storage, types, Zustand store
               (+ data/ JSON catalogs: items, lootTables, recipes, enemies, itemTileColors)
  api/         same-origin worldwide score client (no fetch under game/)
  audio/       procedural Web Audio ambience (engine singleton + `useAmbience` hook fed scalars
               from GameScreen); cosmetic only, may use Math.random
  i18n/        locale catalogs (`messages/en.json` source of truth, `zh-Hans.json` overlay)
               and `t` / `useT`; player primer is `guide.*` keys; zh voice/glossary in
               docs/i18n-zh-hans.md
  content/     guide topic routing (`guideContent.ts`) — copy lives in i18n
  hooks/       shared React hooks (e.g. useAnimatedNumber)
  icons/       icon registry + keys (emoji fallbacks → drop-in PNGs)
  dev/         DEV-only editors + Dev menu (loot / enemies / icons / locale) — never imported from game/
  components/  GameMap, FogOverlay, NeighbourhoodWash, Inventory/*, CraftingPanel, CombatPanel,
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
  The union is cached; only the live sight disc is subtracted per update. During a glide the
  sight disc follows the pin (`useSightCenter` in `GameMap.tsx`, every 100 ms), so fog and
  buildings reveal along the walk and arrival has nothing left to change.
- **Island edge** (`components/EdgeVignette.tsx`, slot `edge`): the run map is a disc around the island; past `EDGE_CLEAR_M` the ground fades to near-black by `EDGE_DARK_M`, and the camera is held to `RUN_BOX` (`mapStyle.ts`), just inside that ring. The fog box reaches past it so there is no straight edge.
- **3D** (`buildings.ts`, setting `mapView3d`) extrudes the basemap's buildings from `LOD_ZOOM` 15.
  A building stands only inside an explored or live disc (feature-state `rise`, animated unless
  reduced motion; never held for the camera — only the 10–20 ms tile index scan waits for it to
  settle). Sites are matched to their building and coloured through feature-state, using known
  faction colours before category colours. Marker fills lighten the faction hue for dark-icon
  contrast; selection is a separate DOM badge ring in 2D and 3D, never a model colour override. Taps on
  a site's building select it, other buildings walk to them. Badges lift to the roof through the
  `--roof` / `--roof-lift` CSS variables. Spawn select and the route planner stay 2D.
  A visited street site's building wears its ruin tier: Damaged is scorched, Ravaged is cut to a
  stump (feature-state `ruin`, a height factor), Gutted swaps for a procedural broken model
  (`map/ruinModel.ts`, own `ruins-3d` layer) on the nearest 30 within 900 m and stays a low stump
  beyond. Models build within an 8 ms budget per slice and are cached per site.
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
  The rest of the city is damaged by a stable hash of the feature id (same buildings every run,
  not seeded): 7% scorched (`scorch`), 3% of 10 m+ buildings collapsed (`aruin` stump; the
  nearest 24 within 900 m get broken models too, flattening the building parts inside them),
  1% burning (`burn`). The nearest 14 fires within 1.6 km get a still ground glow (redrawn only when the set changes: a glow flickered by `setData` repaints the whole map)
  (`fires-3d-glow` / `-core` circle layers under the extrusions) and a flames + smoke `Marker`
  (`.fx-*` in `index.css`) lifted to the roof. A site's own `color` / `ruin` states override
  all of it. Wrecks and fires re-pick only when the sight disc moves 25 m or tiles re-index.
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

**Desktop HUD (`lg:` and up).** The 408px survivor rail sits down the left edge (clock, weather,
Rest, a compact `ObjectiveBar`, and `SurvivorDock`). The dock keeps labelled health, energy,
food and water visible; Condition, Backpack and More start collapsed and open one at a time
from an icon-and-label tray. Condition reveals limbs and attributes; More holds Logbook,
Stats, Skills, Timeline, Day logs and Settings. Stash automatically reveals the backpack
beside the equipment/stash slide-out so drag-and-drop still spans both grids. Bleeding,
injuries, infection and heavy load remain visible as clickable warnings even with details
collapsed. Escape collapses rail details after any slide-out is closed. Disclosure state is
local to the mounted desktop dock; the phone retains its full Condition panel and tabs.
A pinned map footer holds the island-front button, which carries the horde tier and
fits the whole island in view via GameMap's `islandViewToken`, plus the 3D and Rail map toggles.
The phone keeps those toggles on the map, `showModeToggles`), with panels in the slide-out beside it; the map fills the rest. The rail, slide-out
and phone tabs share the existing shell; the timeline column renders only below `lg`. Hotkeys `1`–`9`
follow `RAIL_KEYS` in `GameScreen.tsx` (objective, stash, craft, logbook, stats, skills, timeline
pin, day logs, settings) and stand down under `isModalOpen()`, text focus and the contact gate;
`Esc` closes the slide-out. Wide craft stops short of the timeline or ticker. Inside a block
`hdbInset` pads the HDB landing strips clear of the timeline and here card. With 3D on and room to
spare, the strips sit **over the map** instead of replacing it (`hdbOverMap`): they take about 54%
of the free width (`HDB_STRIPS_W`, 720 px max) and the map left of them (`blockStripW`, ≥180 px) shows the
tower. The selected room (`hdbSelUnit`, UI-only store state) feeds the action card
(`HdbContextPanel`) in a card spanning the strips' width. Larger door tiles, floor plates and
action text share the existing type scale; the current landing scrolls into view on travel and
layout resize. The HDB timeline stays available at 320–440 px, including automatic loot and
combat expansion. The timeline is a fading `LogTicker` top-right until it is
pinned (`timelinePinned` setting) or something needs an answer (event, search, contact, combat),
then the full `LogPanel` / `CombatPanel`. On the open desktop map, a **single location inspector**
sits at the lower-left edge of the map column. It shows the current location by default and the
target when one is selected; its Here / Target controls let the player inspect either without
discarding the route. `MapCallouts` positions only small clickable `MapLocationLabel`s above the
pins, including during a glide. Picking a pin never moves the inspector or the camera padding.
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
**Loot**, **Enemies**, **Icons**, and **Locale**. Overlays are mutually exclusive. `Ctrl+Shift+D`
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
- `ItemDef.startingItem` (+ optional `startingCount`) drives run-start gear in `store.ts`
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

---

## 2. Running it

```bash
npm install
npm run dev       # http://localhost:5190  (PORT env overrides; see vite.config.ts)
npm run build     # typecheck (tsc -b) + production build
npm run build:itch  # static zip for itch.io → release/singvive-itch.zip
npm run lint      # oxlint (--max-warnings=23) + type-scale + zh-Hans glossary guards
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
- Drops anything outside `SG_OUTLINE` (no Johor spill)
- Re-fetches building footprints, matches shop nodes to containing buildings
  (ways, multipolygon relations, and `building:part`), retries failed outline
  chunks, and rejects oversized mall/campus shells for small shops
- Prints category counts and outline coverage when it finishes

### Refreshing walkability zones

```bash
npm run bake:zones
```

Rewrites `public/zones.json` — land mask, inland water, coarse restricted
(military) perimeters, and known forest / nature-reserve polygons. Water and
restricted hard-block spawn/trek; vegetation stays walkable but adds a soft
stamina/time cost when a route cuts through it. Same rules as the other bakes:
manual, committed, never part of `npm run build`. Pass `--local` to skip
Overpass and write committed fallbacks only (useful when the public Overpass
mirrors are rate-limiting).

Narrow pedestrian crossings are committed separately in `src/game/crossings.ts`, starting with the
Sentosa Gateway footpath (OpenStreetMap geometry, with source way links). Their narrow deck corridors
override water in `playable.ts`; country bounds and restricted zones still win. `route.ts` adds the
crossing vertices and exact trek endpoints to the existing 100 m A* grid, connecting to land at the
shore approaches under the same 8 ms / 8,000-expansion budget. This avoids missing a bridge between
grid cells. Route simplification preserves crossing vertices, and memo keys retain exact endpoints
so a nearby sea click cannot reuse a deck route. No runtime map request or save migration is needed.
Regression tests use the committed `public/zones.json` for both directions and mid-crossing treks.
The spawn terrain wash subtracts those same deck corridors from sea and inland-water tint through
`src/map/crossingGeometry.ts`, so the map does not paint a traversable bridge as blocked water.
Restricted-area tint stays intact; the cutout geometry is cached with the terrain, not rebuilt per frame.

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
- **Residential thinning.** OSM has ~45k apartment blocks in Singapore; `world.ts` uses at most 100 per
  run. Keeping one per ~200m cell cuts that to ~4.4k while still leaving ~175 candidates inside any
  1.5 km scavenge radius. Without it, void decks alone are ~5 MB.

The bake runs four passes. The last two exist because OSM maps most shops as point *nodes* inside a
building rather than as the building — straight from Overpass only ~10% of locations have any shape:

1. Shops & amenities (`out geom`).
2. HDB blocks (`out center` — polygon geometry for 45k blocks is a 100MB+ response).
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
the seed, has not posted, and passes `worker/scoreRules.ts` (day cap from the horde clock, kill and
loot ceilings, minimum real time per day, score must equal the formula). The Worker keeps its own
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
| Lint | `npm run lint` | oxlint (`--max-warnings=23`), `scripts/check-type-scale.mjs`, `scripts/check-zh-hans-glossary.mjs` |
| Tests | `npm run test` | Vitest, `environment: 'node'` |

GitHub CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `lint` → `test` → `build` on
push/PR to `main` (no deploy). Production deploys are **Workers Builds** on the Cloudflare Worker
(`npm run deploy`) plus optional local `npm run deploy`.

### Test coverage — know what is *not* covered

Fourteen suites, 83 tests, ~1.3k lines — mostly under `src/game/`, plus catalog validation and
i18n key guards:

`combat`, `wilds`, `events`, `inventory`, `firearms`, `intel`, `logGroup`, `persistRun`, `rng`,
`crafting`, `survival`, `storage`, `dev/catalogs`, `i18n/messageKeys`.

Vitest runs in the **node** environment, so there is **no component, hook, store, or worker
coverage** — roughly 17k lines of TSX and the ~7.6k-line `store.ts` are exercised only by hand.
When changing store actions or React state flow, a manual playtest is the only gate. The pure
`src/game/` modules are the parts that are cheap to test; prefer putting new logic there.
Still thin or missing among pure modules: `goal`, `noise`, `searchSession`.

### The lint warning ratchet

`--max-warnings=23` pins the current warning count. New warnings fail CI; the 23 existing ones
do not. They are:

- 17 `react/only-export-components` — fast-refresh ergonomics only, no correctness impact.
- 7 `react-hooks/exhaustive-deps` — each needs a judgement call, because adding a missing
  dependency changes when an effect re-runs. Do not bulk-fix these.
- 1 `eslint/no-control-regex`.

When you genuinely remove a warning, **lower the number** so the ratchet keeps its grip.

### Determinism is the real test

`src/game/` is pure and seed-driven, which means any change to it can be verified by replay:
run a seeded scenario before and after and compare the numbers. Note that **log text is
deliberately non-deterministic** — cosmetic flavour helpers may use `Math.random` — so compare
gameplay state (meters, body parts, items, kills, gauges), never the prose.

---

## 4. Known debt & scaling limits

Recorded so it is not rediscovered. None of this is currently breaking; all of it is a ceiling.

### `store.ts` is ~7,650 lines

A single flat `interface State` with ~85 data fields followed by ~95 action fields, ~187
`set()` calls, and ~58 helper closures inside one factory. Naming does the namespacing
(`tunnel*`, `hdb*`, `combat*`, `faction*`). It works and it is consistent, but it is the file
every cross-system change touches. Splitting it into zustand slices is the obvious next
structural move; it was deliberately deferred because the blast radius is large.

Note also that `_combatRng`, `_eventRng`, and `_eventClock` are underscore-prefixed but fully
public on the hook, and `window.__game` is assigned in production (harmless, intentional, and
documented for console inspection).

### Content catalogs are typed by assertion, not validation

`items.json` (175 defs), `lootTables.json`, `enemies.json`, `recipes.json`, and
`itemTileColors.json` are static ESM imports `structuredClone`d at module init and cast through
`as unknown as` — which erases *all* type checking of the JSON against `ItemDef` and friends.

Two independent descriptions of the same schema exist: the TypeScript types, and the
hand-written predicates in `src/dev/validate*.ts` (~360 lines each). Neither is checked against
the JSON in `npm run build` or in the test suite. The only production-path checks in
`src/game/loot.ts` are wrapped in `if (import.meta.env.DEV)` and `console.error` — they never
throw and never run in a shipped build.

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
loot browser now lists what still references an item before you confirm; and
`src/dev/catalogs.test.ts` runs every validator against the committed JSON in CI.

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

### Client-side scale pressure

Per `AGENTS.md`: the Worker is scores only, and all scale pressure is in the browser — the WebGL
map and its DOM markers, the 3.8 MB `public/pois.json` parse, and localStorage. Land A* and walkability scans are
the CPU hotspots, not combat resolution. The guardrails that keep this working (viewport
culling, cached polygon fog, debounced persist, location identity preservation) are listed in
`AGENTS.md` under "Performance / scale" — read that before touching the map.

Below zoom 14, ordinary POIs use one WebGL circle layer instead of individual DOM
markers and building outlines. Selecting a dot restores its full badge; the current
site and known landmarks retain theirs. Both representations share the same fog
visibility, padded viewport and 450-site cap, with selected/current sites and landmarks
prioritised before distance when the cap is reached. Full badges return at zoom 14.

Floating map cards cache their viewport dimensions through `ResizeObserver` and
follow the map's `render` event once per frame. Keep layout reads (`clientWidth`,
`offsetWidth`, etc.) out of camera callbacks: after marker transforms are written,
those reads force the browser to flush styles and layout during the frame.
