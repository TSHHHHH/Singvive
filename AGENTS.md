# AGENTS.md

## Cursor Cloud specific instructions

SINGVIVE is a **static client-only SPA** (Vite + React 19 + TypeScript, styled with Tailwind). There is **no backend / no database / no services to start** — the game runs entirely in the browser. Real map data (`public/pois.json`, `public/mrt.json`) is pre-baked and committed, so the app works offline without any external API.

Standard commands live in `package.json` (`dev`, `build`, `lint`, `preview`) and are documented in `README.md` (see "Run it"). Non-obvious notes:

- **Dev server port is 5190, not 5173.** `vite.config.ts` overrides the port (README says 5173, but the config wins). Honour `PORT` env var to run a second instance side by side.
- **`npm run lint` currently exits non-zero** due to a pre-existing `react-hooks/rules-of-hooks` error in `src/components/Inventory/InventoryPanel.tsx`. This is a pre-existing repo condition, not an environment problem. The lint tooling itself works.
- **`npm run build` runs `tsc -b` first**, so it is also the typecheck gate. There is no separate test suite in this repo.
- **Map basemap tiles:** Stadia is keyless only on `localhost`; a deployed domain needs a free Stadia key. An Esri dark fallback exists in `src/components/tileConfig.ts`. Locally, tiles may not render but do not block gameplay.
- **`window.__game`** exposes the live Zustand store in the browser console for dev inspection.
- The `bake:pois` / `bake:mrt` scripts re-fetch OpenStreetMap data via Overpass and are **manual, committed steps** — they are intentionally NOT part of `npm run build`. Do not run them during environment setup.
- Everything under `src/game/` is pure and seed-driven (see `.kiro/hooks/game-logic-guard.kiro.hook`): no React/DOM imports, no `Math.random()` (use the seeded `Rng`), no `any`.
