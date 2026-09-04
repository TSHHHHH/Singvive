# SINGVIVE

> A browser-based **zombie-apocalypse survival roguelike** played on the **real map of Singapore**.

You wake up in a fallen Singapore. There is no rescue on a timetable — only a rising horde and,
eventually, a chance to extract. Knowing nothing of what is around you, you push out into the fog,
chart real places by walking to them, scavenge what you can carry, and manage a failing body until
it gives out or you call for a lift. Every run is generated from live OpenStreetMap data and a
seed, so no two survivors face the same city.

**Status:** feature-rich and fully playable on desktop and mobile — crafting, faction trade, HDB
cutaways, tunnel runs, extraction, and an in-game guide are all implemented end to end.

<!-- screenshot: drop a gameplay capture here -->

---

## Documentation

| Document | What is in it |
|---|---|
| **README.md** (you are here) | What the game is, how to run it, where everything lives |
| **[GAME_DESIGN.md](GAME_DESIGN.md)** | Design source of truth — vision, loop, every system rule, UI, roadmap |
| **[TECH_STACK.md](TECH_STACK.md)** | Architecture, DEV tooling, run/deploy detail, testing & CI, known debt |
| **[AGENTS.md](AGENTS.md)** | Working agreements and guardrails for agents and contributors |

---

## Quickstart

```bash
npm install
```

Copy `.env.example` to `.env.local` and set `VITE_CARTO_API_KEY` — without it the CARTO basemap
tiles are watermarked, but the game still runs.

```bash
npm run dev
```

Then open **http://localhost:5190** (not 5173 — the port is overridden in `vite.config.ts`; set
`PORT` to run a second instance side by side).

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :5190, with the Cloudflare plugin and local D1 |
| `npm run build` | Typecheck (`tsc -b`) then production build — **this is the typecheck gate** |
| `npm run test` | Vitest over the pure `src/game/` logic |
| `npm run lint` | oxlint |
| `npm run preview` | Serve the production build locally (Worker + assets) |
| `npm run db:migrate:local` | Apply D1 migrations to the local honor board (first run) |
| `npm run deploy` | Build and publish to Cloudflare Workers |

The `bake:*` scripts re-fetch map data from Overpass and data.gov.sg. They are **manual,
committed steps** and deliberately not part of the build — see
[TECH_STACK.md](TECH_STACK.md#2-running-it).

---

## How it plays

```
Pick an occupation seed (or build traits freely on the same screen) → choose a real Singapore spawn →
  [ read the map: "?" blips inside your travelable range → trek BLIND across open ground →
    arrive (a doorway event or faction gate may fire) → search session → maybe fight →
    optional HDB dive or tunnel run → haul loot into the grid → cache surplus in a stash →
    craft / repair / trade at a hub → eat, drink, treat wounds, rest → watch the evac
    beacon and the horde clock ]
  repeat until death or a successful extract → score → local board + worldwide honor board
```

There is no fixed turn. Every action costs **in-game hours**, so time is the central currency and
the survivor is always moving — the map is explored, not surveyed.

A few things that make it specific rather than generic:

- **Real world, real stakes.** The map, buildings, and loot come from OpenStreetMap. A supermarket
  really is a supermarket; that block really is an HDB estate.
- **Blind and nomadic.** No top-down omniscience. You know nothing about a location until you walk
  to it, and you relocate one-way through the ruins rather than commuting from a safe base.
- **The body is a resource.** A Project-Zomboid-style injury model over six body parts sits on top
  of hunger / thirst / energy / infection. Wounds are lasting and location-specific.
- **Tactile inventory.** A spatial, Tarkov-style grid where weight and space are both real limits.
- **Dual-path scoring.** Linger for a rising day multiplier, or haul a fogged cargo kit to a timed
  beacon and extract. The best runs do both: survive long, then lift out late.

Full rules — combat maths, loot tables, factions, the horde clock, extraction — are in
[GAME_DESIGN.md](GAME_DESIGN.md).

---

## Layout

```
src/
  game/        pure, seed-driven logic (no React, no DOM, no fetch) + JSON content catalogs
  components/  map, fog, inventory, combat, HDB cutaway, tunnel run, panels and modals
  screens/     Menu, CharacterCreate, SpawnSelect, GameScreen, DeathScreen
  dev/         DEV-only content editors (loot / enemies / icons / locale)
  i18n/        message catalogs and the t / useT helpers
  icons/       icon registry (emoji fallbacks, drop-in PNGs)
  api/         same-origin worldwide score client
worker/        Cloudflare Worker — GET/POST /api/scores → D1
public/        pre-baked map data (pois, mrt, zones, towns) — committed, so runs work offline
scripts/       manual bake scripts for refreshing map data
```

**The core rule:** everything under `src/game/` is pure and seed-driven — deterministic for a
given seed, forked per system, and testable without a DOM. No React, no `fetch`, no gameplay
`Math.random()`. See [TECH_STACK.md](TECH_STACK.md#1-architecture).

---

## Stack

React 19 · TypeScript 6 (strict) · Vite 8 · Zustand 5 · Leaflet + react-leaflet · Tailwind 3 ·
oxlint · Vitest · Cloudflare Workers + D1. Run state is localStorage; the only runtime API is
same-origin `/api/scores`.

---

## Deploy

```bash
npm run deploy
```

Cloudflare **Workers + Assets + D1** (not Pages). First-time setup and migrations are in
[TECH_STACK.md](TECH_STACK.md#deploying).
