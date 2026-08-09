---
inclusion: auto
---

# Performance Budget

This file defines performance constraints for Singvive. Treat these as hard limits when adding features or reviewing PRs.

## Bundle Size

| Target | Limit |
|--------|-------|
| Initial JS (gzip) | < 180 KB |
| Total JS (gzip, all lazy chunks) | < 300 KB |
| CSS (gzip) | < 20 KB |

- Leaflet + react-leaflet account for roughly half the initial bundle. Do not add a second mapping library.
- Heavy screens (`CombatScreen`, `InventoryPanel`) should be code-split via `React.lazy` if they push the initial chunk past budget.
- Before adding any new runtime dependency, check its minified size on bundlephobia. Flag anything > 15 KB min+gzip.

## Map Rendering

| Metric | Limit |
|--------|-------|
| Max POIs rendered simultaneously | 450 (viewport-culled) |
| Max polygon vertices on-screen | 3 000 |
| Tile layer count | 1 (dark CARTO only) |

- Always use `preferCanvas` on `MapContainer` — never switch to SVG renderer.
- POIs outside the viewport + a 20 % buffer should not produce Leaflet layer objects. Filter before mapping.
- Fog-of-war overlays must use Canvas paths, not per-tile image compositing.
- Filter the POI array to those within `map.getBounds().pad(0.2)` before rendering. The world may hold 450+ POIs but only viewport-visible ones should produce Leaflet layers.
- Debounce the visible-set recalculation on pan/zoom (≥100 ms idle) to avoid per-frame filtering.

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
- Never trigger a full store snapshot serialisation on every tick — debounce autosave to once per 5 seconds minimum.

## Memory

- Total JS heap while playing should stay under 50 MB.
- Discard Overpass raw JSON after parsing into `LocationState[]`. Do not cache the full API response.
- Inventory sprites: use a single SVG sprite sheet (`public/icons.svg`), not individual image imports.

## Images & Assets

- No raster images larger than 100 KB. Use SVG or WebP.
- Hero image (`src/assets/hero.png`) is menu-only; do not import it in the game screen bundle.
- Prefer Tailwind utility classes over background-image for decorative patterns.

## Lazy Loading & Code Splitting

Screens that are not needed at first paint should be lazily loaded:

```
Menu          → eager (entry)
CharacterCreate → lazy
SpawnSelect     → lazy
GameScreen      → lazy
CombatScreen    → lazy
DeathScreen     → lazy
```

Use `React.lazy(() => import('./screens/X'))` with a lightweight suspense fallback.

## Network

| Request | Constraint |
|---------|-----------|
| Overpass API | 1 call per game session (at spawn). Cache result in store. |
| CARTO tiles | Standard tile caching via HTTP headers; no custom prefetch. |
| Other network | None. The game is offline-first after spawn. |

- Never poll or retry Overpass in a loop. One attempt → success or fallback world.
- Tile requests happen naturally via Leaflet pan/zoom — don't pre-warm tiles programmatically.

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
