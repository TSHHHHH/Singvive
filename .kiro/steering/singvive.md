---
inclusion: always
---

# Singvive — Project Steering

## What This Is

Singvive is a browser-based zombie-apocalypse survival roguelike played on the real map of Singapore. Players navigate actual OSM-sourced locations, manage survival meters, engage in D&D-style combat, and haul loot home in a spatial Tetris inventory. Permadeath. Seeded determinism. No backend.

## Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | React 19 + TypeScript (strict) + Vite 8 |
| State | Zustand 5 (single store in `src/game/store.ts`) |
| Map | Leaflet + react-leaflet (dark CARTO tiles, canvas renderer) |
| Real-world data | OpenStreetMap Overpass API (no auth) |
| Determinism | `seedrandom` wrapped in a forkable `Rng` class |
| Styling | Tailwind CSS 3 (apocalyptic palette: `rot`, `blood`, `toxic`) |
| Inventory DnD | Custom pointer-drag + `@dnd-kit/core` |
| Linting | oxlint |
| Persistence | localStorage only |

## Project Structure

```
src/
  game/         Pure logic — deterministic, seed-driven, no React/DOM deps.
                Key files: store.ts, types.ts, combat.ts, survival.ts,
                world.ts, loot.ts, inventory.ts, travel.ts, weather.ts,
                events.ts, factions.ts, fog.ts, overpass.ts, poi.ts, rng.ts
  components/   React UI: GameMap, Hud, MeterBar, EventModal, Inventory/*
  screens/      Full-screen phase components: Menu, CharacterCreate,
                SpawnSelect, GameScreen, CombatScreen, DeathScreen
  App.tsx       Phase router — renders screen based on store.phase
```

## Architecture Rules

1. **Pure game logic.** Everything under `src/game/` must have zero React or DOM dependencies. Functions take explicit params, return new values, and route all randomness through the seeded `Rng`.

2. **Single Zustand store.** `src/game/store.ts` is the one source of truth. All game actions live there. Do not introduce additional stores or React context for game state.

3. **Deterministic by seed.** Once a seed is chosen at spawn, all RNG is forked deterministically (`rng.fork('subsystem:key')`). Never use `Math.random()`. A given seed + spawn must reproduce the identical world, encounters, and loot.

4. **Phase-based routing.** App.tsx switches screens based on `GamePhase`: `menu | character | spawn | game | combat | death`. Transitions happen via store actions only.

5. **Spatial inventory.** Items have `W×H` footprints on grids (backpack 8×5, stash 10×8). Placement logic lives in `src/game/inventory.ts`. Don't bypass the grid — if it doesn't fit, it doesn't fit.

6. **Overpass fallback.** If the OSM Overpass API fails (rate limit, offline), the game must still run using `generateFallbackWorld()`. Never hard-fail on network errors.

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
| Character | `character.ts`, `types.ts` | 5 attributes (STR/DEX/END/PER/WIT), 5 traits, point-buy |
| Meters | `survival.ts` | Health, Hunger, Thirst, Energy, Infection; tick per hour |
| Injuries | `survival.ts` | 6 body parts with condition %; bleeding drains HP |
| Combat | `combat.ts` | d20 auto-resolve, env modifiers, flee mechanic |
| Loot | `loot.ts` | 50+ items, weighted tables per POI category |
| Inventory | `inventory.ts` | Tetris grid placement, rotation, encumbrance |
| Travel | `travel.ts` | Walking speed = f(Endurance, Energy, legs, encumbrance) |
| Weather | `weather.ts` | Daily roll; affects combat, visibility, travel |
| Events | `events.ts` | Faction shakedowns, locked doors, desperate NPCs |
| Factions | `factions.ts` | SAF, Hawker Guild, Void Deck Raiders, Transit Coalition |
| Fog of War | `fog.ts` | Perception + weather → reveal/detect radii |
| World Gen | `world.ts`, `overpass.ts` | OSM query → LocationState; danger & size seeded |
| Persistence | `storage.ts` | localStorage autosave; high scores |

## Build & Run

```bash
npm install
npm run dev        # Vite dev server at localhost:5173
npm run build      # tsc -b && vite build (typecheck + production)
npm run lint       # oxlint
```

## When Adding Features

- Add new item definitions to the `ITEMS` catalog in `loot.ts`. Respect the `ItemDef` interface.
- New events go in `events.ts` using the `GameEvent` type. Wire them into the pre-scavenge roll.
- New POI categories require updates to `poi.ts` (config), `world.ts` (classification), and `loot.ts` (tables).
- New screens require a new `GamePhase` variant in `types.ts`, a component in `screens/`, and routing in `App.tsx`.
- Tuning constants (meter drain rates, combat modifiers, loot weights) are grouped at the top of their respective files. Adjust there.

## What Not To Do

- Don't add a backend. The game is fully client-side by design.
- Don't replace Zustand with Redux, MobX, or React context.
- Don't use `Math.random()` anywhere in game logic.
- Don't introduce CSS-in-JS or styled-components.
- Don't break the Overpass fallback path — the game must always be playable offline.
- Don't add heavyweight dependencies without discussing the tradeoff (bundle size matters for a browser game).
