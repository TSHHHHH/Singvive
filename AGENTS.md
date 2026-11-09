# AGENTS.md

## Cursor Cloud specific instructions

SINGVIVE is a **Vite 8 + React 19 + TypeScript 6** SPA (Tailwind 3) with a thin **Cloudflare Worker + D1** honor-board for worldwide scores. Gameplay still runs entirely in the browser; map data (`public/pois.json`, `public/mrt.json`, `public/zones.json`, `public/towns.json`) is pre-baked and committed, so a run works offline. The only runtime API is same-origin `/api/scores`.

Docs are split three ways: **`README.md`** (overview + quickstart), **`GAME_DESIGN.md`** (design source of truth — vision, loop, every system rule), **`TECH_STACK.md`** (architecture, DEV tooling, run/deploy, testing & CI, known debt). Put new content in the right one; the README stays a summary.

Standard commands live in `package.json` (`dev`, `build`, `lint`, `preview`, `deploy`) and are documented in `TECH_STACK.md` (see "Running it"). Non-obvious notes:

- **Dev server port is 5190, not 5173.** `vite.config.ts` overrides the port. Honour `PORT` env var to run a second instance side by side.
- **`npm run dev` uses the Cloudflare Vite plugin.** Local D1 is automatic (no extra process). First-time local schema: `npm run db:migrate:local`.
- **`npm run build` runs `tsc -b` first**, so it is also the typecheck gate. Pure game logic tests: `npm run test` (Vitest, `src/game/*.test.ts`).
- **TypeScript `strict` is on for every project** (app, node, vitest, worker). Keep it that way — the tree currently compiles clean under it.
- **`npm run lint` is `oxlint --max-warnings=24` plus `scripts/check-type-scale.mjs`** — the first is a ratchet pinning the existing warning count so new warnings fail CI (if you genuinely remove a warning, lower the number); the second fails on any typographic value that does not come from `src/ui/type.ts`.
- **All type comes from `src/ui/type.ts`** — eight named roles (`text-micro`, `text-label`, `text-body`, `text-plate`, `text-read`, `text-title`, `text-marquee`, `text-banner`), each carrying its own line-height, tracking and weight. Tailwind's default size scale is replaced, so `text-xs`/`text-sm`/`text-lg` no longer exist. Never write `text-[13px]`; add a role instead. See TECH_STACK.md § The type scale.
- **Cross-module changes:** before editing `store.ts` or touching combat + travel + persist together, query the **user-codebase-memory** MCP (`search_graph`, `trace_path`). Singvive is indexed as `D-Projects-Singvive`.
- **Deploy** is Workers + Assets + D1 (`npm run deploy`), not Cloudflare Pages. One-time: `npx wrangler d1 create singvive-scores`, put the id in `wrangler.jsonc`, then `npm run db:migrate`. Agent deploy flow: `npm run lint && npm run build` → `npm run db:migrate:local` (if `migrations/` changed) → `npm run deploy`.
- **Map is MapLibre GL (WebGL), not Leaflet.** Basemap is CARTO's **Dark Matter vector style** (`src/map/mapStyle.ts`): keyless, never watermarked, and its buildings carry `height` / `min_height` for the 3D view. OpenFreeMap Dark is kept there as the fallback. MapLibre zoom = old Leaflet zoom − 1.
- **Map overlays go through slots** (`SLOTS` in `src/map/mapStyle.ts`): `installOverlay(map, slot, sources, layers)` from `src/map/layers.ts` inserts layers before the slot's marker, so draw order never depends on mount order. Our own text stays DOM (`Marker`s with `typeCss`), never map glyphs.
- **3D view** (`mapView3d` setting, on-map 3D button): `src/map/buildings.ts` extrudes basemap buildings from `LOD_ZOOM` (15), rising only inside explored discs and the live sight disc; site buildings take state colours via feature-state. Spawn screen and route planner stay 2D. `window.__map` exposes the live run map and `window.__buildings` its building engine in DEV. The fog and building sight disc follow the pin during a glide (`useSightCenter`); POI visibility still keys off the store's `currentPos`. Sky and light belong to the weather (`src/map/atmosphere.ts`, `window.__atmosphere` in DEV); do not call `setSky`/`setLight` elsewhere.
- **Desktop HUD vs phone shell.** At `lg:` the 408px survivor rail and its slide-out stay down the left edge (same markup as the phone's Status tab and slide-out), the map fills the rest, the here → target card pair sits at bottom centre of the map, and a timeline ticker opens itself (`LogTicker`, `timelinePinned`). The phone tabs and the timeline column render only below `lg` (`useIsPhone`) and must stay as they are. Rail hotkeys are digits (`RAIL_KEYS`); camera keys stay letters/arrows. See TECH_STACK.md § Desktop HUD.
- **`window.__game`** exposes the live Zustand store in the browser console for DEV inspection.
- The `bake:pois` / `bake:mrt` / `bake:zones` / `bake:towns` scripts re-fetch map data (Overpass or data.gov.sg) and are **manual, committed steps** — they are intentionally NOT part of `npm run build`. Do not run them during environment setup.
- Everything under `src/game/` is pure and seed-driven (see `.kiro/hooks/game-logic-guard.kiro.hook`): no React/DOM imports, no `fetch`, no gameplay `Math.random()` (use the seeded `Rng`), no `any`. Cosmetic flavour helpers may use `Math.random`; `rng.ts` may use it only to mint a fresh seed string. Score HTTP lives in `src/api/` and `worker/`.
- Player-facing guide copy is in `src/content/guideContent.ts` — keep it aligned with `GAME_DESIGN.md` score/evac/survival rules when those change.
- Active run schema key is `singvive.run.v7` (extraction + horde). Do not invent a new key without a migration path.

## Performance / scale

Scale pressure is **client-side** (WebGL map + DOM markers, `pois.json` parse, localStorage). The Worker is scores only — do not move gameplay onto it. Combat resolution, crafting, and events are not CPU hotspots; land A* and walkability scans are. Do not "optimise" the d20 resolver.

- Do not subscribe `GameScreen` (or any map parent) to the whole `combat` object — gauge ticks rewrite it at 20 Hz. Select booleans/scalars; let `CombatPanel` own combat. Do not add `log` or per-frame search progress to that slice.
- `persist()` must stay **debounced** (≥5 s + flush on hide). Never stringify OSM `outline` rings; rehydrate from the bake on `continueRun`. Stay on `singvive.run.v7` unless there is a migration path.
- POI layers must be **viewport-culled** (bounds padded 0.2, cap 450). Mapping every `locations` entry into a Marker/feature does not scale with island crossing. Hidden POIs must not become markers or GeoJSON features.
- Keep MapLibre out of the menu chunk (`React.lazy` for spawn/game/create/death screens; `manualChunks` puts it in `maplibre`). Do not add a second mapping library.
- `advanceTime` / noise / faction expand must **preserve location identity** for untouched sites. Cloning the whole `locations` record re-renders the map HUD.
- Fog is ground polygons (`src/map/fogGeometry.ts`): world minus the union of explored discs, cached, minus the live sight disc per update. Do not rebuild the explored union on energy ticks.
- 3D buildings use **feature-state** only (rise, colour, selected). Never `setFilter` / re-add the extrusion layer per tick, and keep the building index to loaded tiles (`querySourceFeatures`).
- `bakedPois.ts` parses the island bake once per page. A 30 km evac query is the spawn hitch — do not add another full-island scan. Prefetch the bake on the spawn screen.

## Cursor tooling

- **Project skill:** `.cursor/skills/singvive-systems/` — system map, playtest checklist, deploy flow.
- **Rules:** `.cursor/rules/` — file-scoped guardrails (game logic, map perf, persist, guide copy).
- **Hooks:** `.cursor/hooks.json` — bake script guard, lint-on-edit, typecheck-on-stop.
- **Perf profiling (optional):** copy `.cursor/mcp.example.json` chrome-devtools entry into your user MCP config when profiling map/fog load.
