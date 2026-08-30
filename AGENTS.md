# AGENTS.md

## Cursor Cloud specific instructions

SINGVIVE is a **Vite 8 + React 19 + TypeScript 6** SPA (Tailwind 3) with a thin **Cloudflare Worker + D1** honor-board for worldwide scores. Gameplay still runs entirely in the browser; map data (`public/pois.json`, `public/mrt.json`, `public/zones.json`, `public/towns.json`) is pre-baked and committed, so a run works offline. The only runtime API is same-origin `/api/scores`.

Standard commands live in `package.json` (`dev`, `build`, `lint`, `preview`, `deploy`) and are documented in `README.md` (see "Run it"). Non-obvious notes:

- **Dev server port is 5190, not 5173.** `vite.config.ts` overrides the port. Honour `PORT` env var to run a second instance side by side.
- **`npm run dev` uses the Cloudflare Vite plugin.** Local D1 is automatic (no extra process). First-time local schema: `npm run db:migrate:local`.
- **`npm run build` runs `tsc -b` first**, so it is also the typecheck gate. There is no separate test suite in this repo.
- **Deploy** is Workers + Assets + D1 (`npm run deploy`), not Cloudflare Pages. One-time: `npx wrangler d1 create singvive-scores`, put the id in `wrangler.jsonc`, then `npm run db:migrate`.
- **Map basemap tiles:** active provider is **CARTO Dark Matter** (retina `{r}`, native z20). Raster tiles need `VITE_CARTO_API_KEY` in `.env.local` (baked in at Vite build) or CARTO watermarks them. Stadia / Esri URLs live in `src/components/tileConfig.ts` as alternatives only.
- **`window.__game`** exposes the live Zustand store in the browser console for DEV inspection.
- The `bake:pois` / `bake:mrt` / `bake:zones` / `bake:towns` scripts re-fetch map data (Overpass or data.gov.sg) and are **manual, committed steps** — they are intentionally NOT part of `npm run build`. Do not run them during environment setup.
- Everything under `src/game/` is pure and seed-driven (see `.kiro/hooks/game-logic-guard.kiro.hook`): no React/DOM imports, no `fetch`, no gameplay `Math.random()` (use the seeded `Rng`), no `any`. Cosmetic flavour helpers may use `Math.random`; `rng.ts` may use it only to mint a fresh seed string. Score HTTP lives in `src/api/` and `worker/`.
- Player-facing guide copy is in `src/content/guideContent.ts` — keep it aligned with README score/evac/survival rules when those change.
- Active run schema key is `singvive.run.v6` (extraction + horde). Do not invent a new key without a migration path.

## Performance / scale

Scale pressure is **client-side** (Leaflet DOM, `pois.json` parse, localStorage). The Worker is scores only — do not move gameplay onto it. Combat resolution, crafting, and events are not CPU hotspots; land A* and walkability scans are. Do not "optimise" the d20 resolver.

- Do not subscribe `GameScreen` (or any map parent) to the whole `combat` object — gauge ticks rewrite it at 20 Hz. Select booleans/scalars; let `CombatPanel` own combat. Do not add `log` or per-frame search progress to that slice.
- `persist()` must stay **debounced** (≥5 s + flush on hide). Never stringify OSM `outline` rings; rehydrate from the bake on `continueRun`. Stay on `singvive.run.v6` unless there is a migration path.
- POI layers must be **viewport-culled** (`getBounds().pad(0.2)`). Mapping every `locations` entry into a Marker/Polygon does not scale with island crossing. Hidden POIs must not become Leaflet layers.
- Keep Leaflet out of the menu chunk (`React.lazy` for spawn/game/create/death screens). Do not add a second mapping library.
- `advanceTime` / noise / faction expand must **preserve location identity** for untouched sites. Cloning the whole `locations` record re-renders the map HUD.
- Fog is a tiled canvas GridLayer with in-place tile refresh. Do not remount tiles on energy ticks or replace it with one fullscreen canvas.
- `bakedPois.ts` parses the island bake once per page. A 30 km evac query is the spawn hitch — do not add another full-island scan. Prefetch the bake on the spawn screen.
