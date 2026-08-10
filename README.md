# SINGVIVE — Design & Scope Document

> A browser-based **zombie-apocalypse survival roguelike** played on the **real map of Singapore**.
> This README doubles as the project's scope/design brief — hand it to a human or another AI agent
> to reason about mechanics, extend systems, or critique the design.

---

## 1. Vision

You wake up in a fallen Singapore. There is no rescue. The only goal is to **survive as long as
possible**. Knowing nothing of what's around you, you push out into the fog, chart real places by
walking to them, scavenge what you can carry, and manage a failing body until it gives out. Every run
is procedurally generated from live map data and a seed, so no two survivors face the same city.

**Pillars**

1. **Real world, real stakes** — the map, the buildings, and the loot are grounded in the actual
   geography of Singapore (via OpenStreetMap). A supermarket really is a supermarket; that block
   really is an HDB estate.
2. **Blind, nomadic exploration** — no top-down omniscience. You have zero knowledge of a location
   until you physically visit it, and you relocate one-way through the ruins rather than commuting
   from a safe base.
3. **The body is a resource** — a Project-Zomboid-style injury model on top of survival meters; wounds
   are lasting, location-specific, and have to be treated.
4. **Roguelike depth** — permadeath, procedural worlds, seeded reproducibility, and deep build variety
   through attributes and a positive/negative trait economy.
5. **Tactile inventory** — a spatial, Tarkov-style grid where weight and space are both real
   constraints.

**Current status:** feature-rich, fully playable. All systems below are implemented and verified
end to end (desktop + mobile).

---

## 2. Core Gameplay Loop

```
Create survivor (attributes + traits) → Choose a real SG spawn (density-checked) →
  [ read the map: "?" blips inside your travelable range → travel BLIND to one (one-way) →
    a pre-scavenge event may fire → search it → maybe fight → haul loot into the grid →
    cache surplus in the location's stash → eat / drink / treat wounds / sleep ]
  repeat until death → score → local leaderboard
```

There is no fixed "turn": every action consumes a number of **in-game hours**. Time is the central
currency, and the survivor is always moving — the map is explored, not surveyed.

---

## 3. Systems

### 3.1 World generation (real locations)
- Real locations come from **OpenStreetMap**, pre-baked into `public/pois.json` at build time
  (`npm run bake:pois`) rather than queried per run. On spawn the game loads that static file once and
  filters it to POIs within ~1.5 km. Shops/amenities carry full geometry (`out geom`, for outlines);
  HDB blocks are centroids only (`out center`, kept light).
- Data sources degrade in order: **baked file → live Overpass → procedural fallback**. Baking removes
  the per-run dependency on a volunteer-run API that rate-limits by IP — a static file on the CDN
  can't throttle, works offline once cached, and returns in milliseconds.
- Each element is classified into a **category**; a **seeded RNG** assigns **size** (small/med/large),
  a **base danger (1–5)**, remaining searches, and a faction. A given seed reproduces the same world.
- Density is high (up to ~**220 locations**, incl. up to ~100 void decks) — fog of war means only the
  handful you've explored are ever drawn, so world size is decoupled from render cost.
- **Remote-spawn check:** if a real data source returns fewer than 5 POIs in range, the click was
  wilderness/reservoir/sea — the spawn is rejected with a notice so the player picks again. Procedural
  generation is reserved strictly as a **data-unavailable fallback**, never for genuinely empty areas.

**POI categories → real-life resources** (Singapore-flavoured):

| Category | Real examples | Yields | Base danger |
|---|---|---|---|
| Supermarket | FairPrice, Sheng Siong, Giant | Food, water, some meds | 2 |
| Convenience | 7-Eleven, Cheers | Snacks, drinks | 1 |
| Pharmacy | Guardian, Watsons, Unity | Medicine, bandages, antibiotics | 2 |
| Hospital/Clinic | Polyclinics, hospitals | Strong medical + armour | 4 |
| Hardware | DIY / hardware shops | Tools, melee weapons, hard hats, crafting parts | 2 |
| Petrol station | Shell, Esso, Caltex, SPC | Fuel, roadside snacks, torches | 3 |
| Police | Neighbourhood police posts | Firearms, ammo, riot gear | 5 |
| HDB void deck | Housing blocks | Common household loot | 2 |
| Hawker centre | Food courts, markets | Food | 2 |
| MRT station | Rail / LRT stations | Transit fast-travel node; light loot | 3 |

### 3.2 Survivor — attributes & the trait economy
- **Attributes** (point-buy, base 5, spend 6, range 3–10): **Strength** (melee damage, carry
  capacity), **Dexterity** (accuracy, dodge, flee, travel line), **Endurance** (max HP, walking speed,
  carry), **Perception** (loot quantity + fog awareness/blip range), **Wits** (event skill checks).
- **Traits** — a **budget economy** (6 points): pick up to **4 positive** and **3 negative** traits;
  negatives *refund* points to spend on positives, and **conflicting** traits grey each other out.
  ~14 positive / ~10 negative, all Singapore-flavoured, e.g.:
  - *NS Reservist* (+atk/+def), *Polyclinic Nurse* (+healing, −infection), *Karang Guni* (+loot &
    extra search), *IPPT Gold* (+max HP, −energy drain), *Tekong Legs* (+travel speed), *Sixth Sense*
    (+awareness, −ambush), *Pack Rat* (wider backpack).
  - *Glass Jaw* (−max HP), *Bad Knees* (−speed, slow leg-heal), *Hemophiliac* (bleeding never
    self-stops), *Noisy* (+encounter chance), *Aircon Addict* (+energy drain), *Kiasu* / *Hoarder*…
  - Trait modifiers feed combat, travel, survival, loot and fog. A few (crafting/barricade) anticipate
    the planned crafting system.

### 3.3 Fog of war — blind exploration
- You have **no knowledge** of any location until you stand in it. Undiscovered places show only as
  anonymous **"?" blips** (no name, category or danger). Their **building outline is still drawn** (in
  neutral) if OSM has one; locations without an outline are just their circular badge.
- The on-map ring is **not vision — it's travelable range**: how far you can comfortably push right
  now, derived from walking speed (END/DEX + leg injuries), current **energy**, weather and load. It
  shrinks as you tire or get hurt. **Perception/awareness** extends how far out you *sense* blips
  (never their identity).
- **Discover-on-visit → permanent memory.** Arriving charts a location forever as **last-known intel**
  (stale danger, faction, looted state). Because danger regenerates while you're away, old intel can
  be dangerously wrong — the card flags "intel may be stale".
- A canvas **fog overlay** darkens everything you haven't lit up by visiting.

### 3.4 Time, travel & the day/night cycle
- A day is **24 in-game hours**, starting at **08:00**. Travel is **one-way relocation** (nomadic):
  the survivor has a tracked position, and cost = distance(current → target) ÷ walking speed, stretched
  by **weather** (rain ×1.5, thunderstorm ×1.75) and **encumbrance** (×1.5).
- **Night is dangerous.** Bands: day (06–17), dusk (17–19), night (19–06). Being out after dark sharply
  raises encounter chance and hardens combat.
- **Sleep till dawn** fast-forwards to next morning, restoring energy (hunger/thirst still drain) and
  regenerating location danger.

### 3.5 Survival meters & the injury system
- **Meters:** Health, Hunger, Thirst, Energy, Infection (drain per active hour). Infection deals HP
  damage each hour until cured and is lethal at 100 (you turn).
- **Injuries (Project-Zomboid-style), 6 body parts** — Head, Torso, L/R Arm, L/R Leg. Combat damage
  lands on a weighted-random part, lowering its condition and sometimes causing **bleeding** (drains
  HP until treated).
  - Injured parts **cut effective max HP** (Head/Torso hit hardest).
  - **Limb-specific effects:** injured **legs slow travel**, injured **arms lower attack accuracy**.
  - **Passive regen** (so bad luck doesn't brick a run): HP and part condition recover slowly when
    stable — but **bleeding blocks regen** until you bandage it.
- **Treatment:** bandage (stops one bleed + dresses a wound), medkit (stops all bleeds + big heal),
  painkillers (HP only), antibiotics/antiseptic (infection).
- Death causes: overwhelmed (HP 0), starvation, dehydration, infection, fatal head/torso wound.

### 3.6 Combat — DnD-style turn-based auto-combat
- Encounters trigger while scavenging (chance scales with a place's **current** danger + darkness +
  weather). Combat **auto-resolves round by round** with a visible dice log.
  - **Player attack:** `d20 + Dexterity + weapon accuracy + trait − arm-injury penalty` vs.
    `10 + enemy defense`. Natural 20 crits. Damage = `weapon damage + Strength/2`.
  - **Enemy attack:** `d20 + attack + environment` vs. `10 + Dexterity/2 + trait/armour defense`.
    Zombie hits can infect; the hit wounds a body part.
  - **Environment:** night/dusk and rain/storm/haze shift odds toward the enemy.
- **Same loop for humans:** hostile-faction/event combat reuses the exact zombie loop with a **human
  stat block** (`kind: 'human'`, no infection, higher defense; drops gear on death).
- Weapon damage/accuracy come from the **equipped main-hand** (see 3.9), not an auto-pick. Between
  rounds you may use a heal/cure item or attempt to **flee** (Dex+Per check).

### 3.7 Events & factions
- Four factions hold territory, assigned by category via seeded RNG: **SAF Remnants** (police/hospital),
  **Hawker Guild** (hawker centres), **Void Deck Raiders** (HDB, hostile), **Transit Coalition** (MRT).
- On arrival, a **pre-scavenge event** may fire (`game/events.ts`, pure):
  - **Locked Security Door** — Strength/Wits/Perception check; success grants entry, failure triggers
    an ambush.
  - **The Desperate Survivor** — give an item, pass a check, or refuse (may turn violent).
  - **Faction Shakedown** — pay tribute, talk your way past (Wits), or refuse — hostile factions
    (Raiders) then fight; others block access.
- All checks are `d20 + attribute vs DC(current danger)`.

### 3.8 MRT highway (Transit Coalition)
- The **real Singapore rail network** ships with the game (`public/mrt.json`, baked from OSM — see
  *Refreshing the rail network*): 186 stations, every line in its official livery, with station codes.
- Station POIs are **bound to the network** at world build: each baked station claims its nearest POI
  within 220 m and takes its name and codes. Leftover station elements — OSM maps a big station as
  several — become *"<name> Entrance"*: searchable, but not somewhere you can ride from.
- **Map overlay.** A *Rail map* toggle on the map draws the whole network — real track geometry, dots
  per station, code badges from z15 — in its own Leaflet pane **above the fog**. The MRT map is the one
  thing every commuter here already knows by heart; fog hides what's *inside* a station, never where
  the line runs. The preference persists like the zoom does.
- **Riding is line-aware.** A hop needs a **path along the tracks** between two **cleared** stations,
  routed by Dijkstra over (station, line) pairs with a change penalty — so it prefers fewer changes,
  and a dogleg through an interchange is priced as one. Cost is distance *along the tunnels* at
  −70% time, plus 7 min per change; weather and encumbrance are still ignored. Every station the
  route passes through is discovered. A **toll event** (1× EZ-link card) still gates the turnstile.
- Without the network file, riding falls back to the old any-two-cleared-stations rule rather than
  breaking.

### 3.9 Inventory, equipment & weight
- **Spatial Tetris grid** (Tarkov-style): items have **W×H footprints**, **rotate**, and drag between
  the **Backpack** (8×5, what you carry) and the **on-site stash** of wherever you're standing.
- **Equipment slots** — head / body / mainHand / offHand. Equipping **removes the item from the grid**
  (freeing space) and applies its `modifiers` (attack/defense/carry bonuses). Combat reads the weapon
  from mainHand. Armour comes from police/hospital/hardware (riot helmet, kevlar/utility vest, riot
  shield, torch, hard hat).
- **Weight & encumbrance:** every item has a weight; `maxCarry = Strength×3 + Endurance×2`
  (+ equipped bonuses). Backpack over **80%** of capacity → **Encumbered**, multiplying travel time by
  1.5×.

### 3.10 Decentralized stashes & the logbook
- **No home base.** Every cleared location has its own **10×8 stash**; you deposit/withdraw only while
  physically there. Danger regenerates while you're away, so a cache you left loot in can become
  dangerous to revisit.
- The read-only **Stash Logbook** lists every location holding cached items, with coordinates and a
  contents summary.

### 3.11 Persistence & scoring
- Fully **client-side**: the active run + high-score leaderboard autosave to `localStorage` (schema
  `singvive.run.v5`). Score = `days×100 + kills×25 + loot value`. Permadeath clears the run.

---

## 4. UI

- **Desktop — 3-pane layout:** a **left interaction hub** (header + pinned location card + tabbed
  **Status** [meters, 6-part body, character sheet] and **Gear** [equipment, backpack/stash grids, a
  dedicated item-detail box] + Sleep/Logbook), a **centre map**, and a **right column that is purely
  the game log**.
- **Mobile — bottom tab bar:** full-screen **Map / Status / Gear / Log** views; on the map, the
  selected location slides up as a bottom sheet so you can travel without leaving it.

---

## 5. Tech & Architecture

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript + Vite |
| Map | Leaflet + react-leaflet, **CARTO "Dark Matter"** tiles (keyless, retina `@2x`, native z20; Stadia + Esri kept in `tileConfig.ts` as alternatives), canvas renderer + custom fog overlay |
| Real data | OpenStreetMap, pre-baked to `public/pois.json` via `npm run bake:pois`; live Overpass as fallback. Rail network baked separately to `public/mrt.json` via `npm run bake:mrt` |
| State | Zustand (single store) |
| Inventory DnD | Custom pointer-drag over a cell grid (backpack ↔ stash ↔ equipment slots) |
| Determinism | `seedrandom`, wrapped in a forkable `Rng` |
| Styling | Tailwind CSS |
| Backend | none (localStorage only) |

```
src/
  game/        pure, seed-driven logic — rng, singapore, overpass, world, poi, loot, inventory,
               survival (meters + injuries), travel, weather, fog, combat, factions, events,
               character (attributes + traits), storage, types, and the Zustand store
  components/  GameMap, FogOverlay, mapIcons, tileConfig, MeterBar, StatusPanel, LogPanel,
               LocationCard, StashLogbook, EventModal, Inventory/{InventoryGrid, InventoryPanel,
               itemGlyph}
  screens/     Menu, CharacterCreate, SpawnSelect, GameScreen, CombatScreen, DeathScreen
```

**Design rule:** everything under `game/` is **pure and seed-driven** — deterministic for a given
seed, forked per-system (`rng.fork('loot'|'faction'|'event'|'human'|'wound'…)`), and testable without
the DOM. `window.__game` exposes the live store for dev inspection.

**Note on tiles:** Stadia is keyless on `localhost`; a deployed domain needs a free Stadia API key
(an Esri dark fallback URL is in `components/tileConfig.ts`).

---

## 6. Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck (tsc -b) + production build
npm run lint      # oxlint
```

### Refreshing map data

```bash
npm run bake:pois
```

Rewrites `public/pois.json` — ~8.6k POIs, **1.0 MB raw / 0.20 MB gzipped**, in about 30 seconds. It
is **not** part of `npm run build` — a flaky Overpass should never break a deploy. Run it manually for
fresher OSM data, then commit the result.

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

Two traps, both already paid for:

- `out geom tags` on a relation silently returns **zero members**. The `tags` modifier switches Overpass
  to a tags-only print. It must be `out geom`.
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
   buildings; pass 2 only asked for centroids). Batches of 500.
4. Buildings within 15m of the remaining point POIs, matched by **point-in-polygon**; smallest
   containing building wins, so a unit inside a mall gets the unit, not the mall.

Two rules in pass 4 are load-bearing:

- **One outline per building.** A mall is one OSM building holding many POI nodes. Giving every tenant
  the mall polygon stacks a dozen identical giant shapes in different colours — visually worse than no
  outline. The building is drawn once for its richest tenant; co-tenants stay as badges, which reads
  correctly as "shops inside this building".
- **Simplify with Douglas-Peucker, never by sampling every Nth vertex.** Sampling discards the corners
  that define a footprint and turns complex buildings (MRT concourses run 65-74 points) into spiky
  arrows.

Void decks keep their category-default `size` even though they now have outlines — see the comment in
`world.ts`, it's a deliberate balance decision, not an oversight.

`scripts/bake-pois.mjs` imports `classifyOsm` straight from `src/game/poi.ts` (Node strips the
`import type`), so classification logic lives in exactly one place — edit `poi.ts`, re-bake.

### Deploying

Static SPA, no backend. Cloudflare Pages: build `npm run build`, output `dist`, Node pinned by
`.nvmrc`. No `_redirects` needed — the app is phase-based state with no router, so every URL is `/`.

---

## 7. Roadmap / open design questions

Good areas for another agent to extend or pressure-test:

- **Crafting & barricades:** consume parts (scrap, tape, tools) to craft gear or fortify a stash; some
  traits (HDB Handyman) already anticipate this.
- **Vehicles:** fuel exists as loot — let it enable faster/farther travel with its own risks/noise.
- **Weapon durability & ammo:** ranged weapons should consume the ammo already in the loot tables.
- **Meta-progression:** unlocks across runs, daily/shareable seeds, online leaderboards & accounts
  (a Neon Postgres backend is available if we go online).
- **Survivor NPCs / trading** beyond the current event, base-building, reputation with factions.
- **Balance:** tune travel speed, meter/injury drain, danger regen and loot rarity for a satisfying
  survival length.

### Known constraints
- Overpass has rate limits and latency → map data is pre-baked to a static file, so the live API is
  only touched by `npm run bake:pois` and as a runtime fallback. Baked data is a point-in-time
  snapshot: new shops in OSM won't appear until the next bake.
- Many Singapore shops are mapped as **point nodes**, not buildings, so not every POI has a drawable
  outline — those render as a category badge instead.
- The Stadia basemap needs an API key off-localhost, so the deployed build uses CARTO Dark Matter
  instead — keyless, and it serves the `@2x` tiles that keep the map sharp on high-DPI screens.
  **Any replacement basemap must support both `{r}` (retina) and native z20**, or the map goes soft:
  Esri was tried and looks blurry for exactly that reason. `TILE_MAX_NATIVE_ZOOM` must match whatever
  the provider actually serves, since Leaflet upscales beyond it rather than showing blank tiles.
