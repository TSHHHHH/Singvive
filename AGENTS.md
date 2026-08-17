# AGENTS.md

## Cursor Cloud specific instructions

SINGVIVE is a **Vite 8 + React 19 + TypeScript 6** SPA (Tailwind 3) with a thin **Cloudflare Worker + D1** honor-board for worldwide scores. Gameplay still runs entirely in the browser; map data (`public/pois.json`, `public/mrt.json`, `public/zones.json`) is pre-baked and committed, so a run works offline. The only runtime API is same-origin `/api/scores`.

Standard commands live in `package.json` (`dev`, `build`, `lint`, `preview`, `deploy`) and are documented in `README.md` (see "Run it"). Non-obvious notes:

- **Dev server port is 5190, not 5173.** `vite.config.ts` overrides the port. Honour `PORT` env var to run a second instance side by side.
- **`npm run dev` uses the Cloudflare Vite plugin.** Local D1 is automatic (no extra process). First-time local schema: `npm run db:migrate:local`.
- **`npm run build` runs `tsc -b` first**, so it is also the typecheck gate. There is no separate test suite in this repo.
- **Deploy** is Workers + Assets + D1 (`npm run deploy`), not Cloudflare Pages. One-time: `npx wrangler d1 create singvive-scores`, put the id in `wrangler.jsonc`, then `npm run db:migrate`.
- **Map basemap tiles:** active provider is **CARTO Dark Matter** (keyless everywhere, retina `{r}`, native z20). Stadia / Esri URLs live in `src/components/tileConfig.ts` as alternatives only.
- **`window.__game`** exposes the live Zustand store in the browser console for DEV inspection.
- The `bake:pois` / `bake:mrt` / `bake:zones` scripts re-fetch OpenStreetMap data via Overpass and are **manual, committed steps** — they are intentionally NOT part of `npm run build`. Do not run them during environment setup.
- Everything under `src/game/` is pure and seed-driven (see `.kiro/hooks/game-logic-guard.kiro.hook`): no React/DOM imports, no `fetch`, no gameplay `Math.random()` (use the seeded `Rng`), no `any`. Cosmetic flavour helpers may use `Math.random`; `rng.ts` may use it only to mint a fresh seed string. Score HTTP lives in `src/api/` and `worker/`.
- Player-facing guide copy is in `src/content/guideContent.ts` — keep it aligned with README score/evac/survival rules when those change.
- Active run schema key is `singvive.run.v6` (extraction + horde). Do not invent a new key without a migration path.
