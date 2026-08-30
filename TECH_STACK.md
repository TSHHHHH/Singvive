# SINGVIVE — Tech Stack & Architecture

> How **SINGVIVE** is built, run, and deployed. What the game *is* — the vision, loop, and
> system rules — lives in [GAME_DESIGN.md](GAME_DESIGN.md); the short overview is
> [README.md](README.md).

---

## 1. Architecture

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript 6 + Vite 8 |
| Map | Leaflet + react-leaflet, **CARTO "Dark Matter"** tiles (`VITE_CARTO_API_KEY`, retina `{r}` / `@2x`, native z20; Stadia + Esri kept in `tileConfig.ts` as alternatives), canvas renderer + custom fog overlay |
| Real data | OpenStreetMap → `public/pois.json` (`bake:pois`), `public/mrt.json` (`bake:mrt`), `public/zones.json` (`bake:zones`); URA planning areas → `public/towns.json` (`bake:towns`); live Overpass as POI runtime fallback |
| State | Zustand 5 (single store); `window.__game` in DEV |
| Inventory DnD | Custom pointer-drag over a cell grid (backpack ↔ stash ↔ equipment) |
| HDB viewport | `react-zoom-pan-pinch` |
| Determinism | `seedrandom`, wrapped in a forkable `Rng` (cosmetic flavour text may use `Math.random`) |
| Styling | Tailwind CSS 3 |
| Lint | oxlint |
| Backend | Cloudflare Worker + D1 honor board (`/api/scores`); run state is localStorage |
| Node | pinned by `.nvmrc` (22) |

```
src/
  game/        pure, seed-driven logic — rng, world, poi, loot, inventory, packGrid, survival,
               travel, weather, fog, combat, factions, events, character, occupations, crafting,
               trade, sleep, goal, searchSession, hdbDungeon, tunnelRun, mrtDamage, wilds,
               wildsEncounter, vegetation, playable, route, noise, ghostSurvivor, townField,
               itemTileColor, settings, storage, types, Zustand store
               (+ data/ JSON catalogs: items, lootTables, recipes, enemies, itemTileColors)
  api/         same-origin worldwide score client (no fetch under game/)
  i18n/        locale catalogs (`messages/en.json` source of truth, `zh-Hans.json` overlay)
               and `t` / `useT`; player primer is `guide.*` keys
  content/     guide topic routing (`guideContent.ts`) — copy lives in i18n
  hooks/       shared React hooks (e.g. useAnimatedNumber)
  icons/       icon registry + keys (emoji fallbacks → drop-in PNGs)
  dev/         DEV-only editors + Dev menu (loot / enemies / icons / locale) — never imported from game/
  components/  GameMap, FogOverlay, NeighbourhoodWash, Inventory/*, CraftingPanel, CombatPanel,
               ConditionPanel, StatsPanel, ObjectiveBar, ObjectivesPanel, PhoneStatusBar,
               HdbDungeonModal, TunnelRunView, StationStrip, TraderModal, GuideModal,
               SettingsModal, TrekCard, LocationCard, …
  screens/     Menu, CharacterCreate, SpawnSelect, GameScreen, DeathScreen
               (combat is a panel inside GameScreen — no combat phase)
worker/        Cloudflare Worker — GET/POST /api/scores → D1
```

**Design rule:** everything under `game/` is **pure and seed-driven** — deterministic for a given
seed, forked per-system (`rng.fork('loot'|'faction'|'event'|'human'|'wound'…)`), and testable without
the DOM. Exceptions: cosmetic flavour helpers may use `Math.random` (non-gameplay), and `rng.ts`
itself uses it only to mint a fresh seed string.

**Note on tiles:** Active basemap is **CARTO Dark Matter** (`{r}` retina, native z20). Raster tiles
need `VITE_CARTO_API_KEY` in `.env.local` (copy from `.env.example`; baked in at `vite build`) or
CARTO watermarks them. Stadia is sharper but keyless only on `localhost`; Esri is a last-resort
fallback (no `@2x`, caps at z16). **Any replacement must support both `{r}` and native z20**, or
the map goes soft — `TILE_MAX_NATIVE_ZOOM` must match what the provider actually serves.

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
# copy .env.example → .env.local and set VITE_CARTO_API_KEY (CARTO raster watermark otherwise)
npm run dev       # http://localhost:5190  (PORT env overrides; see vite.config.ts)
npm run build     # typecheck (tsc -b) + production build
npm run lint      # oxlint
npm run preview   # serve the production build locally (Worker + assets)
npm run db:migrate:local  # apply D1 migrations to the local honor board (first time)
```

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

Bake `VITE_CARTO_API_KEY` as a **Workers Builds → Build variables and secrets** entry (same name as
`.env.local`). Vite inlines it at build time; a Worker runtime secret will not clear CARTO watermarks.

The worldwide board is an honor list: the client posts the score; the Worker sanitizes names and
rate-limits by IP. Personal top-10 stays in `localStorage` and is not bulk-uploaded.

---


---

## 3. Testing, linting & CI

| Gate | Command | What it covers |
|---|---|---|
| Types | `npm run build` (`tsc -b` runs first) | All four TS projects. **`strict` is on everywhere** — app, node, vitest, worker. |
| Lint | `npm run lint` | oxlint with `--max-warnings=27` |
| Tests | `npm run test` | Vitest, `environment: 'node'` |

GitHub CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `lint` → `test` → `build` on
push/PR to `main` (no deploy). Production deploys are **Workers Builds** on the Cloudflare Worker
(`npm run deploy`) plus optional local `npm run deploy`.

### Test coverage — know what is *not* covered

Nine suites, 44 tests, ~780 lines, all under `src/game/` and all pure logic:

`combat`, `wilds`, `events`, `inventory`, `firearms`, `intel`, `logGroup`, `persistRun`, `rng`.

Vitest runs in the **node** environment, so there is **no component, hook, store, or worker
coverage** — roughly 17k lines of TSX and the 7.6k-line `store.ts` are exercised only by hand.
When changing store actions or React state flow, a manual playtest is the only gate. The pure
`src/game/` modules are the parts that are cheap to test; prefer putting new logic there.

### The lint warning ratchet

`--max-warnings=27` pins the current warning count. New warnings fail CI; the 27 existing ones
do not. They are:

- ~18 `react/only-export-components` — fast-refresh ergonomics only, no correctness impact.
- ~8 `react-hooks/exhaustive-deps` — each needs a judgement call, because adding a missing
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

### `store.ts` is 7,546 lines

A single flat `interface State` with ~85 data fields followed by ~95 action fields, ~187
`set()` calls, and ~58 helper closures inside one factory. Naming does the namespacing
(`tunnel*`, `hdb*`, `combat*`, `faction*`). It works and it is consistent, but it is the file
every cross-system change touches. Splitting it into zustand slices is the obvious next
structural move; it was deliberately deferred because the blast radius is large.

Note also that `_combatRng`, `_eventRng`, and `_eventClock` are underscore-prefixed but fully
public on the hook, and `window.__game` is assigned in production (harmless, intentional, and
documented for console inspection).

### Content catalogs are typed by assertion, not validation

`items.json` (141 defs), `lootTables.json`, `enemies.json`, `recipes.json`, and
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

Related: `itemDef(id: string): ItemDef` returns `ITEMS[id]`, so an unknown id yields `undefined`
typed as `ItemDef`. `strict` cannot catch this because the lie is in the signature.

### Saves are parsed across a trust boundary with no validation

`localStorage` is user-editable. `loadRun()` does `JSON.parse(raw) as SavedRun` and then runs
~10 in-place field-presence migrations; a corrupt or hand-edited save is caught only by the
outer `try/catch` returning `null`. Same pattern for `HighScore[]` and the settings map.

That catch-all is more dangerous than it looks: any throw inside a migration is indistinguishable
from "no save", so the player loses the run rather than seeing an error. One such case (an item
deleted from the catalog while still equipped) is fixed and covered by `src/game/storage.test.ts`,
but the shape of the risk remains — a validating parser that reports *what* is wrong would be
strictly better than a `try/catch` that answers only yes or no.

Versioning is by key name (`singvive.run.v6`): bumping to `v7` silently orphans every existing
save, because there is no read-old-key-and-upgrade path. All intra-v6 evolution is the inline
migration list.

### localStorage quota is a real ceiling

`saveRun` already detects `QuotaExceededError` and surfaces it as a log line, because the ~5 MB
limit is reachable. Writes are debounced 5 s and flushed on hide, and OSM building outlines are
stripped before write and rehydrated from the bake on load. What still grows without bound in a
long run: `locations` (as cells expand), `hdbBlocks` (every block ever entered, with full unit
graphs), and `log` (capped at 4,000 entries).

### i18n keys are stringly typed

`t(key: string)` resolves against a 1,988-line catalog by splitting the path per call, with no
flat-map cache and no key type. A typo falls through to `?? key` with no compile-time signal.
`useSetting(key: string)` has the same shape — `useSetting('langauge')` type-checks and
returns `''`.

Partly mitigated: `src/i18n/messageKeys.test.ts` walks every *templated* key family
(`item.${id}`, `trait.${id}.name`, `ui.slots.${slot}`, …) over its real id set, so new content
cannot ship without an English label. That closes the class no static check could see — the
Holster slot once rendered as the literal `UI.SLOTS.FIREARM`. Hand-written literal keys are
still unchecked; a generated key union from `en.json` would finish the job.

### Client-side scale pressure

Per `AGENTS.md`: the Worker is scores only, and all scale pressure is in the browser — Leaflet
DOM, the 3.8 MB `public/pois.json` parse, and localStorage. Land A* and walkability scans are
the CPU hotspots, not combat resolution. The guardrails that keep this working (viewport
culling, tiled canvas fog, debounced persist, location identity preservation) are listed in
`AGENTS.md` under "Performance / scale" — read that before touching the map.
