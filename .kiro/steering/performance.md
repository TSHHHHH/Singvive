---
inclusion: auto
---

# Performance Budget

This file defines performance constraints for Singvive. Treat the **budget** tables as hard limits when adding features. The **current implementation** section is what the code actually does — update it in the same change that lands a perf fix so this file does not rot into a wish list.

## Bundle Size

| Target | Limit |
|--------|-------|
| Initial JS (gzip) | < 180 KB |
| Total JS (gzip, all lazy chunks) | < 300 KB |
| CSS (gzip) | < 20 KB |

- Leaflet + react-leaflet account for most of the map chunk. Do not add a second mapping library.
- Leaflet alone may exceed the 180 KB **initial** gzip target. That is an accepted exception **if** Leaflet is not in the menu chunk (`React.lazy` for spawn/game/create/death). Document the measured sizes after a bundle visualizer pass.
- Before adding any new runtime dependency, check its minified size on bundlephobia. Flag anything > 15 KB min+gzip.

## Map Rendering

| Metric | Limit |
|--------|-------|
| Max POIs rendered simultaneously | 450 (viewport-culled) |
| Max polygon vertices on-screen | 3 000 |
| Tile layer count | 1 (dark CARTO only) |

- Always use `preferCanvas` on `MapContainer` — never switch to SVG renderer.
- POIs outside the viewport + a 20 % buffer must not produce Leaflet layer objects. Filter to `map.getBounds().pad(0.2)` before mapping. Recalc on `moveend` / `zoomend`, debounced ≥100 ms.
- Fog of war is a **tiled canvas GridLayer** with in-place tile refresh. That is the Leaflet-correct fit: it avoids remounting tiles (and the fade flicker) on energy/range ticks. Do not replace it with one fullscreen canvas or per-tile image compositing.
- Hidden (undiscovered, out of blip range) POIs must not become Leaflet layers. Returning `null` after mapping the whole world still costs React children — filter first.
- If a dense downtown area pushes past 450 visible POIs, document the exception in a code comment with the rationale and mitigation. Get explicit sign-off before merging.

## Runtime Targets (60 fps on mid-range mobile)

| Operation | Budget |
|-----------|--------|
| Store action (any) | < 4 ms |
| Full React render of GameScreen | < 12 ms |
| Inventory drag reflow | < 8 ms |
| Overpass response parsing | < 50 ms |
| localStorage save | < 10 ms |

- Profile with Chrome DevTools Performance tab at 4× CPU throttle.
- Avoid synchronous loops over the full POI array inside render. Precompute filtered/sorted lists in the store action or a `useMemo`.
- Never trigger a full store snapshot serialisation on every tick or inventory cell move — debounce autosave to once per 5 seconds minimum, plus flush on `visibilitychange` / `beforeunload`.
- Do not subscribe `GameScreen` (or any map parent) to the whole `combat` object. Gauge ticks rewrite it at 20 Hz. Select booleans/scalars; let `CombatPanel` own combat.
- `advanceTime` / noise / faction expand must preserve identity of untouched `locations` entries. A new dict invalidates every map subscriber.

## Memory

- Total JS heap while playing should stay under 50 MB.
- Discard Overpass raw JSON after parsing into `LocationState[]`. Do not cache the live API response. The baked `public/pois.json` is a module-level cache by design (parsed once per page) — do not fetch it a second time per spawn.
- Inventory icons are per-PNG via `import.meta.glob` in `src/icons/registry.ts`, not a sprite sheet. A single SVG sprite (`public/icons.svg`) is a later asset pass, not a current requirement.

## Images & Assets

- No raster images larger than 100 KB. Use SVG or WebP.
- Hero image (`src/assets/hero.png`) is menu-only; do not import it in the game screen bundle.
- Prefer Tailwind utility classes over background-image for decorative patterns.

## Lazy Loading & Code Splitting

Screens that are not needed at first paint should be lazily loaded:

```
Menu            → eager (entry)
CharacterCreate → lazy
SpawnSelect     → lazy
GameScreen      → lazy
DeathScreen     → lazy
```

Combat is an overlay panel inside `GameScreen`, not a route and not a `GamePhase`. Do not add a `CombatScreen` lazy import.

Use `React.lazy(() => import('./screens/X'))` with a lightweight suspense fallback.

## Network

| Request | Constraint |
|---------|-----------|
| `pois.json` / `zones.json` / `mrt.json` / `towns.json` | Static baked files. Prefetch `pois.json` on the spawn screen. Parse once per page. |
| Overpass API | Fallback only if the bake is missing/malformed. One attempt → success or `generateFallbackWorld()`. |
| CARTO tiles | Standard tile caching via HTTP headers; no custom prefetch. |
| `/api/scores` | Honor board only. GET may be cached briefly; gameplay never depends on it. |
| Other network | None. The game is offline-first after spawn. |

- Never poll or retry Overpass in a loop.
- Tile requests happen naturally via Leaflet pan/zoom — don't pre-warm tiles programmatically.
- A 30 km evac query over the full bake is the spawn hitch. Prefer a baked evac-eligible subset; do not add another full-island scan.

## Current implementation

Update this section when the matching code changes.

- **Screens:** `App.tsx` lazy-loads CharacterCreate, SpawnSelect, GameScreen, DeathScreen. Menu is eager. Leaflet lives in the game/spawn chunks, not the menu.
- **Saves:** `persist()` is debounced (≥5 s) with flush on hide/unload. OSM `outline` rings are omitted and rehydrated from the bake on `continueRun`. Quota failure is logged, not swallowed. Key remains `singvive.run.v6`.
- **Map HUD:** GameScreen selects combat as booleans/scalars. `PoiLayer` viewport-culls to padded bounds. `HazardRings` `pathIds` is memoised. Fog is tiled canvas; `exploredArea` discs are merged when they overlap.
- **World clock:** `advanceTime` and faction expand copy dirty location ids only.
- **Spawn:** `pois.json` is prefetched on SpawnSelect. Evac pick uses a bake-side eligible set rather than haversine-ing all 9k POIs.
- **Walkability:** zone rings are spatially indexed so A* cell tests are not a linear scan of 709 water polygons.
- **Honor board:** GET `/api/scores` sends short `Cache-Control`. Rank `COUNT(*)` on POST is acceptable until the table is huge.

## How to Verify

```bash
# Bundle analysis
npx vite-bundle-visualizer

# Lighthouse performance audit (after build)
npm run build && npx serve dist
# Then run Lighthouse in Chrome DevTools → target > 90 perf score on mobile preset

# Type-check + build (catches dead-code issues)
npm run build
```

## When to Break the Rules

If a feature genuinely requires exceeding a limit (e.g., a dense downtown area pushes past 450 visible POIs), document the exception in a code comment with the rationale and any mitigation (progressive culling, LOD, clustering). Get explicit sign-off before merging.
