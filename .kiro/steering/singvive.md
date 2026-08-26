---
inclusion: always
---

# Singvive — Project Steering

## What This Is

Singvive is a browser-based zombie-apocalypse survival roguelike played on the real map of Singapore. Players navigate actual OSM-sourced locations, manage survival meters, engage in D&D-style combat, and haul loot home in a spatial Tetris inventory. Permadeath. Seeded determinism. Worldwide scores are an honor board on Cloudflare D1; the run itself stays client-side.

## Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | React 19 + TypeScript (strict) + Vite 8 |
| State | Zustand 5 (single store façade in `src/game/store.ts`) |
| Map | Leaflet + react-leaflet (dark CARTO tiles, canvas renderer) |
| Real-world data | Baked `public/pois.json` (and `mrt` / `zones` / `towns`). Live Overpass is fallback only. |
| Determinism | `seedrandom` wrapped in a forkable `Rng` class |
| Styling | Tailwind CSS 3 (apocalyptic palette: `rot`, `blood`, `toxic`) |
| Inventory DnD | Custom pointer-drag in `src/components/Inventory/` — not `@dnd-kit` |
| Linting | oxlint |
| Persistence | localStorage for the run + personal top 10; Cloudflare D1 for the worldwide honor board |

## Project Structure

```
src/
  game/         Pure logic — deterministic, seed-driven, no React/DOM deps.
                Key files: store.ts (façade), types.ts, combat.ts, survival.ts,
                world.ts, loot.ts, inventory.ts, travel.ts, weather.ts,
                events.ts, factions.ts, fog.ts, bakedPois.ts, overpass.ts,
                poi.ts, rng.ts
  api/          Same-origin score client (not under game/)
  components/   React UI: GameMap, CombatPanel (overlay), Inventory/*, …
  screens/      Full-screen phase components: Menu, CharacterCreate,
                SpawnSelect, GameScreen, DeathScreen
  App.tsx       Phase router — renders screen based on store.phase
worker/         Cloudflare Worker: GET/POST /api/scores → D1
```

`store.ts` is a large façade over the pure modules. New systems belong in `src/game/<system>.ts` and hook `advanceTime` / `persist` — do not grow a second Zustand store for gameplay, and do not dump new mechanics only into the façade.

## Architecture Rules

1. **Pure game logic.** Everything under `src/game/` must have zero React or DOM dependencies, and no `fetch`. Functions take explicit params, return new values, and route all randomness through the seeded `Rng`. (`bakedPois.ts` / `playable.ts` / `mrt.ts` may `fetch` static baked JSON — that is the allowed exception, not live gameplay HTTP.)

2. **Single Zustand store.** `src/game/store.ts` is the one source of truth for the run. All game actions live there (or in modules it calls). Do not introduce additional stores or React context for game state. Settings may stay in `src/game/settings.ts`.

3. **Deterministic by seed.** Once a seed is chosen at spawn, all RNG is forked deterministically (`rng.fork('subsystem:key')`). Never use `Math.random()` in gameplay. A given seed + spawn must reproduce the identical world, encounters, and loot.

4. **Phase-based routing.** App.tsx switches screens based on `GamePhase`: `menu | character | spawn | game | death`. Combat is an overlay inside `game`, not a phase. Transitions happen via store actions only.

5. **Spatial inventory.** Items have `W×H` footprints on grids. Placement logic lives in `src/game/inventory.ts`. Don't bypass the grid — if it doesn't fit, it doesn't fit.

6. **Bake, then Overpass, then fallback.** Spawn prefers `public/pois.json`. If the bake is missing/malformed, one Overpass attempt. If that fails, `generateFallbackWorld()`. Never hard-fail on network errors. Do not treat live Overpass as the common path.

## Coding Conventions

- **Naming:** PascalCase for types/interfaces/components. camelCase for functions/variables. SHOUTED_CASE for tuning constants.
- **Types:** All game state is strictly typed in `src/game/types.ts`. Use discriminated unions (e.g., `ItemEffect.kind`). No `any`.
- **File boundaries:** One system per module. Don't merge unrelated logic into a single file.
- **No unprompted refactoring:** Only modify lines required to complete the task. Don't reorganize imports, reformat code, or "clean up" adjacent functions.
- **Tailwind only:** No inline styles or CSS modules. Use the project's Tailwind classes and the custom palette (`rot-50`, `rot-900`, `blood`, `toxic`).
- **UI z-index layering:** EventModal (500), Inventory (1000), ScavengeResult (1100). Don't break this stack.

## Key Game Systems (Quick Reference)

| System | File(s) | Notes |
|--------|---------|-------|
| Character | `character.ts`, `types.ts` | Attributes derived from traits; occupations in `occupations.ts` |
| Meters | `survival.ts` | Health, Hunger, Thirst, Energy; tick per hour |
| Injuries | `survival.ts` | Body parts with condition %; bleeding drains HP |
| Combat | `combat.ts` | d20 resolve; UI overlay in `CombatPanel`, not a phase |
| Loot | `loot.ts`, `data/items.json`, `data/lootTables.json` | Catalog is JSON; `loot.ts` is the API |
| Inventory | `inventory.ts` | Tetris grid placement, rotation, encumbrance |
| Travel | `travel.ts`, `route.ts` | Walking speed + land-aware A* |
| Weather | `weather.ts` | Daily roll; affects combat, visibility, travel |
| Events | `events.ts` | Faction shakedowns, locked doors, desperate NPCs |
| Factions | `factions.ts` | Muster, Gotong Royong, 88 Syndicate, STA |
| Fog of War | `fog.ts` | Perception + weather → reveal/detect radii |
| World Gen | `world.ts`, `bakedPois.ts`, `overpass.ts` | Bake → LocationState; Overpass fallback |
| Persistence | `storage.ts` | localStorage autosave (`singvive.run.v6`); personal high scores |

Performance / scale invariants live in `AGENTS.md` and this folder's `performance.md`. Update those in the same change as the matching code.

## Build & Run

```bash
npm install
npm run dev        # Vite + local Worker/D1 at localhost:5190
npm run build      # tsc -b && vite build (typecheck + production)
npm run lint       # oxlint
```

Dev port is **5190**, not 5173. Bake scripts (`bake:pois` / `bake:mrt` / `bake:zones` / `bake:towns`) are manual and committed — not part of `npm run build`.

## When Adding Features

- Add new item definitions to `src/game/data/items.json` (and locale keys). `loot.ts` loads the catalog.
- New events go in `events.ts`. Wire them into the pre-scavenge roll.
- New POI categories require updates to `poi.ts` (config), `world.ts` (classification), loot tables, and usually `scripts/bake-pois.mjs`.
- New screens require a new `GamePhase` variant in `types.ts`, a component in `screens/`, routing in `App.tsx`, and a `React.lazy` import unless it is the menu.
- Tuning constants (meter drain rates, combat modifiers, loot weights) are grouped at the top of their respective files. Adjust there.

## What Not To Do

- Don't put Worker imports under `src/game/`. The worldwide board lives in `src/api/` and `worker/`.
- Don't replace Zustand with Redux, MobX, or React context.
- Don't use `Math.random()` anywhere in game logic.
- Don't introduce CSS-in-JS or styled-components.
- Don't break the bake → Overpass → fallback path — the game must always be playable offline.
- Don't add heavyweight dependencies without discussing the tradeoff (bundle size matters for a browser game).
- Don't subscribe the map HUD to 20 Hz combat gauges or stringify OSM outlines into localStorage. See `performance.md`.
