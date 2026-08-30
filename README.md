# SINGVIVE — Design & Scope Document

> A browser-based **zombie-apocalypse survival roguelike** played on the **real map of Singapore**.
> This README doubles as the project's scope/design brief — hand it to a human or another AI agent
> to reason about mechanics, extend systems, or critique the design.
>
> Player-facing primer copy lives in `src/i18n/messages/*.json` (`guide.*` keys:
> Survive / Fight / Loot / Block / Tunnels / Evac / Score). `src/content/guideContent.ts`
> only orders those topics. Keep the catalogs and this doc aligned when score, evac,
> or survival rules change.

---

## 1. Vision

You wake up in a fallen Singapore. There is no rescue on a timetable — only a rising **horde** and,
eventually, a chance to **extract**. Knowing nothing of what's around you, you push out into the fog,
chart real places by walking to them, scavenge what you can carry, and manage a failing body until it
gives out or you call for a lift. Every run is procedurally generated from live map data and a seed,
so no two survivors face the same city.

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
   through occupations, attributes derived from traits, and a positive/negative trait economy.
5. **Tactile inventory** — a spatial, Tarkov-style grid where weight and space are both real
   constraints.
6. **Dual-path scoring** — linger for a rising day multiplier, or haul a fogged cargo kit to a timed
   map beacon and extract. Best board scores do both: survive long, then lift out late.

**Current status:** feature-rich, fully playable. Systems below are implemented end to end
(desktop + mobile), including crafting, faction trade, HDB cutaways, tunnel runs, extraction, and
the in-game guide.

---

## 2. Core Gameplay Loop

```
Pick an occupation (or Advanced trait build) → Choose a real SG spawn (density-checked) →
  [ read the map: "?" blips inside your travelable range → trek BLIND across open ground →
    arrive (pre-scavenge event / faction gate may fire) → search session → maybe fight →
    optional HDB dive or tunnel run → haul loot into the grid → cache surplus in the stash →
    craft / repair / trade at a hub → eat / drink / treat wounds / rest under site conditions →
    watch the evac beacon & horde clock ]
  repeat until death or successful extract → score → local board + worldwide honor board
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
- **Walkability zones** (`public/zones.json`, `npm run bake:zones`): land mask, inland water,
  restricted (military) perimeters, and vegetation. Water and restricted hard-block spawn/trek;
  vegetation stays walkable but adds a soft stamina/time cost. Routes prefer land paths around water
  (`game/route.ts`, `game/playable.ts`, `game/vegetation.ts`).

**POI categories → real-life resources** (Singapore-flavoured):

| Category | Real examples | Yields | Base danger |
|---|---|---|---|
| Supermarket | FairPrice, Sheng Siong, Giant | Food, water, some meds | 2 |
| Convenience | 7-Eleven, Cheers | Snacks, drinks | 1 |
| Pharmacy | Guardian, Watsons, Unity | Medicine, bandages, antibiotics | 2 |
| Hospital | Hospitals | Strong medical + armour | 4 |
| Clinic | GPs, polyclinics | Medicine, not a war zone | 2 |
| Hardware | DIY / hardware shops | Tools, melee weapons, hard hats, crafting parts | 2 |
| Petrol station | Shell, Esso, Caltex, SPC | Fuel, roadside snacks, torches | 3 |
| Police | Neighbourhood police posts | Firearms, ammo, riot gear | 5 |
| HDB void deck | Housing blocks | Common household loot; gateway to HDB cutaways | 2 |
| Hawker centre | Food courts, markets | Food | 2 |
| MRT station | Rail / LRT stations | Way into the tunnels (see 3.8); light loot | 3 |
| Industrial | Warehouses, factories | Tools, fuel, materials | 3 |
| School | Schools, colleges | Canteen, sick bay, workshop; used as shelters | 3 |
| Waypoint | Between-pin stops | Not a destination — whatever the road left behind | 2 |

### 3.2 Survivor — occupations, attributes & traits
- **Occupations** — nine two-trait kits (College Student, Personal Trainer, Soldier, Nurse,
  Food Vendor, Scavenger, Office Worker, Contractor, Fixer). Each is **one signature + one matching
  curse**, nets the budget at exactly 0, and can be opened in **Advanced Mode** and edited.
- **Attributes** are **derived from traits** (base 5 each, clamped 1–12) — Strength, Dexterity,
  Endurance, Perception, Wits. There is no separate point-buy panel; traits *are* the build.
- **Traits** — budget starts at **0**. Negatives *refund* points; positives *spend* them. Remaining
  points must stay ≥ 0. Caps: **max one signature** (cost ≥ 4), **max one curse** (cost ≤ −3),
  **max two negatives** total. A 5-cost identity is paid with a curse, not a pile of −1s. Cheap
  cousins stay for spread builds (*Reservist*, *Medic*, *Karang Guni*, *Home Cook*, *Distance Runner*…).
  Signatures include *Combat Veteran*, *Trauma Medic*, *Hyrox Champion*, *Estate Memory*, *Made Man*;
  Advanced-only signatures *Mule* and *Sixth Sense* compete with jobs for the one signature slot.
- **Trait presets** persist across runs in `localStorage` so Advanced builds can be reused. Old
  six-flaw presets become illegal and show “needs fixing” in Advanced Mode.
- Trait modifiers feed combat, travel, survival, loot, fog, crafting cost, faction standing, and
  unique rules (first hit halved, hawker-centre loot, HDB corridor reads, remaining-search intel).

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

### 3.4 Time, travel, wilds & the day/night cycle
- A day is **24 in-game hours**, starting at **08:00**. Travel is **one-way relocation** (nomadic):
  the survivor has a tracked position, and cost = distance(current → target) ÷ walking speed, stretched
  by **weather** (rain ×1.5, thunderstorm ×1.75), a **graduated load tax** (quiet until capacity, brutal
  past it — hover the carry bar), and vegetation soft-costs.
- **Open-ground treks** (`game/wilds.ts`): between pins the path crosses seeded ~350 m hazard
  pockets (overlapping discs: horde, patrol, collapse, flood, wildlife). POI travel cards preview
  sensed pockets on the route. Collapse wounds; flood slows and can infect; horde/patrol/wildlife
  fight. Short hops under a minimum distance skip the trek card.
- **Night swarm.** Dusk (17–19) they bloom; night (19–06) empty streets flood with a second seeded
  layer (I Am Legend). Crossing is a near-certain high-danger fight. Roofed sites shelter you; tunnels
  bypass the surface. Dawn they recede. Rest shows recovery **and** night ambush chance.
- **Night is dangerous.** Bands: day (06–17), dusk (17–19), night (19–06). Combat hardens after dark.
- **Rest** is not a free full refill — see **sleep quality** (3.12).

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
- Death causes: overwhelmed (HP 0), starvation, dehydration, infection, fatal head/torso wound,
  **overrun** (horde hits 100%).

### 3.6 Combat — contact, then live-stance auto-combat
- Combat is an **overlay inside the game screen** (no combat phase). Encounters trigger while
  scavenging (chance scales with a place's **current** danger + darkness + weather + noise). At
  contact you choose **Fight** or **Flee** (desktop dims the map until chosen; phone keeps tabs live
  behind an interrupt card). Fight **auto-resolves** on a shared **fill-the-track**: both markers
  race one gauge; whoever fills it swings. Light weapons and a **free off-hand** fill faster; heavy
  weapons hit harder but slower. Mid-fight you can switch **stance** (*Aggressive* / *Guarded* /
  *Precision*) — the next swing uses the new profile. Flee / Break off use the *Disengage* profile
  (easier flee DC, parting swing).
- **Off-hand is a fork**, not leftover space. Empty: faster fill and easier dodge. A lid or shield
  can fully stop a hit (and slows you). A second one-hander sometimes follows through. A torch only
  helps you see and search. A **two-handed** weapon occupies mainHand and blocks offHand.
- **Player attack:** `d20 + Dexterity + weapon accuracy + trait + stance − arm-injury penalty` vs.
  `10 + enemy defense`. Natural 20 (or stance crit floor) crits. Damage = `weapon damage + Strength/2`
  (+ stance).
- **Enemy attack:** `d20 + attack + environment` vs. `10 + Dexterity/2 + trait/armour defense + stance`.
  Worn **limb armour** soaks the body zone it covers. Zombie hits can infect; the hit wounds a body part.
- **Environment:** night/dusk and rain/storm/haze shift odds toward the enemy.
- **Same loop for humans:** hostile-faction/event combat reuses the zombie loop with a **human
  stat block** (`kind: 'human'`, no infection, higher defense; drops gear on death).
- **Infected animals** (`kind: 'animal'`) use the same loop and **can infect**. They are not the
  zombie ladder: otters/monitors sit on inland water, macaques/boars in forest, dogs/cats/rats
  on urban streets. Some drop meat or stolen food.
- **Ammo & condition:** firearms consume loaded **rounds**; a dry gun swings as a club (as fast as
  fists). Item **condition** degrades and can be repaired (whetstone / gun oil in the field;
  workbench repair with tape + scrap). Perishable food wears with elapsed hours. Items stay in the
  pack until the fight ends; **Break off** attempts to flee.

### 3.7 Events, factions & trade
Four factions hold territory (seeded by category), with a **standing ladder** (−5…+5) that gates
hostility, trade, shelter, aid, and intel:

| Id | Name | Flavour |
|---|---|---|
| `muster` | The Muster | Extra-legal NS militia — police / school (not hospitals) |
| `gotong` | Gotong Royong | Civilian mutual aid — hawker / supermarket |
| `syndicate_88` | The 88 Syndicate (双八会) | Hostile by default until known; void-deck muscle |
| `sta` | Subterranean Transit Authority (STA) | Manned MRT platforms; tunnel tolls |

- Each run marks up to **two outposts per faction** (`OUTPOSTS_PER_FACTION`, preferred categories,
  spaced apart). Outposts are labelled on the map and offer that faction's **full kit** (canteen,
  fence, escort, tunnel camp — not a shared four-button shop); ordinary claimed territory gets a
  lesser subset, never the signature verb.
- On arrival, a **pre-scavenge event** may fire (`game/events.ts`, pure): locked doors, desperate
  survivors, faction shakedowns, STA tolls, etc. Checks are `d20 + attribute vs DC(current danger)`.
- **Barter** (`game/trade.ts`): no currency — seeded daily chalk-board swaps at faction hubs. Standing
  grows board size and unlocks better lines; each offer is take-it-or-leave-it and one-shot for the day.
  Hubs may also offer rest, aid, or intel once standing is high enough.

### 3.8 The tunnels (Subterranean Transit Authority)
- The **real Singapore rail network** ships with the game (`public/mrt.json`, baked from OSM — see
  *Refreshing the rail network*): 186 stations, every line in its official livery, with station codes.
- Station POIs are **bound to the network** at world build: each baked station claims its nearest POI
  within 220 m and takes its name and codes. Leftover station elements — OSM maps a big station as
  several — become *"<name> Entrance"*: searchable, but not a way into the tunnels.
- **Map overlay.** A *Rail map* toggle draws the whole network — one centreline per line, dots per
  station, code badges from z15 — in its own Leaflet pane **above the fog**. Collapsed segments for
  *this run* draw as dashed broken strokes on top, so after spawn you can read tunnel condition
  without opening the planner. The MRT map is the one thing every commuter here already knows by
  heart; fog hides what's *inside* a station, never where the line runs. The preference persists
  like the zoom does.
- **Collapsed tunnels.** Each run collapses ~15–25% of adjacent segments (seeded, soft-biased toward
  the spawn→first-evac corridor). Those edges stay walkable — a brutal crawl (rubble, packs, no camps),
  not a wall. The planner defaults to a fewest-stop **intact** path and offers a
  shorter rubble shortcut when one exists. Long island crossings may have no intact route at all.
- **Nothing runs.** Travel is a **planned tunnel crawl**: pick a destination on the route planner
  (`MrtRoutePlanner`), choose among fewest-stop routes (and alternates), then walk **one run for the
  whole path**. Intermediate station platforms let you **exit early**; the final platform arrives
  as before. Adjacent hops remain valid one-stop routes.
- **Starting one:** stand at a station and **Plan tunnel travel** replaces the world map with the
  route planner (same column as HDB / tunnel crawl). Selecting an adjacent known station still
  deep-links the planner with that destination. Far stations need not be discovered — fog hides
  them on the surface map, but the planner shows the whole network.
- **The tunnels run off the edge of the built world.** A stop outside the 1.5 km scavenge radius is
  still a valid destination: resolving it calls `expandWorldAround`, which pulls that station's
  neighbourhood out of the baked POI set and merges it in. Only if the bake has nothing there does
  `makeStationLocation` stand up a bare platform. This is what makes the network a way to *cross the
  island* rather than a shuttle inside your starting district.
- What the bore buys you is what it doesn't charge: **no travel-range cap, no weather**, and none of
  `URBAN_DECAY_DETOUR` — it's straight, and the streets above it aren't. Load still taxes the walk
  (milder than overland) and drains energy the same as the surface, so the MRT is not a dump exploit.
  Time is the real track distance at walking pace. There is no train discount any more.
- **The run itself is a Slay-the-Spire map** (`game/tunnelRun.ts`, `components/TunnelRunView.tsx`):
  platforms at each station on the route, bore columns between them (capped so long rides stay
  playable), forward-only edges, one column of reveal ahead (two after a working **signal** board).
  Between stations the bore can **fork into side passages** that run a few hops before they rejoin —
  pick the node you can afford; the other way is gone once you step. Middle node kinds: **contact**,
  **salvage**, **camp**, **obstruction**, **carriage**, **signal**, **checkpoint**. Obstructions are
  floodwater (fail: turned otter, no wound), falling debris (heavy wound), live rail, a long
  **blackout**, or a strength pinch. A stalled **carriage** is under-or-through; rare Contact is a
  **Stalker** keeping pace. The crawl HUD is an in-train schematic strip of the planned route
  (`StationStrip`) — next stop, livery-coloured hops, and transfer stations — not a single
  `from → to` line name.
- **Stations are exits.** STA **toll** still gates the *stairs down* at the origin only; marshals
  may also hold a **checkpoint** in the bore. Roughly **45% of platforms stand empty**
  (`CLAIM_CHANCE.sta`).
- A run **survives a reload** — same graph, same node (`SavedRun.tunnel`). Collapsed edges persist
  with the run (or re-roll from seed on older saves). Every trip generates a fresh crawl graph.

### 3.9 Inventory, equipment & weight
- **Spatial Tetris grid** (Tarkov-style): items have **W×H footprints**, **rotate**, and drag between
  the **Backpack** (5×4 pockets with no bag; an equipped bag sets a **cell silhouette** so holes are
  unusable — a smaller or hole-punched bag only equips if the current haul can rearrange into it)
  and the **on-site stash** of wherever you're standing (**3×3**, tight on purpose). Traits can add
  or drop columns on the right of the pack.
- **Equipment slots** — head / body / hands / legs / feet / bag / mainHand / offHand. Equipping
  **removes the item from the grid** (freeing space) and applies its `modifiers` (attack/defense/carry,
  plus zone **limb armour** on the part it covers). Combat reads the weapon from mainHand; two-handed
  weapons block offHand. Armour comes from police/hospital/hardware (riot helmet, kevlar/utility vest,
  riot shield, gloves, boots, torch, hard hat).
- **Own clothes:** you can tear strips off what you're wearing **four times** (`OWN_CLOTHES_TEARS`)
  for improvised dressings — a lifeline, not a rag farm.
- **Weight:** every item has a weight; worn gear counts too. `maxCarry = Strength×3 + Endurance×2`
  (+ equipped bonuses). There is no pickup cap. Below ~55% of capacity load does nothing; it taxes
  quietly up to 100%, then quadratically. Hover the carry bar or survivor Carry cell for live
  penalties (travel, energy, combat, stairs, search). The HUD never says Encumbered.

### 3.10 Search sessions
- Searching a site is a **real-time fogged grid** (`game/searchSession.ts`), not an instant loot dump.
  Street POIs roll a **destruction tier** on first visit (shown instead of loot richness); haul size
  scales with footprint (~3–7 finds) and item **condition** sits on that ruin's band (Intact =
  Brand New … Gutted = Old & Torn).
  Click fogged cells to prioritize them; finds reveal one by one; Take / Take all claim into the pack
  (overflow to on-site stash). **Done** or **Leave** abandons unclaimed finds. Leaving early still
  spends a **partial search charge**.

### 3.11 Decentralized stashes & the logbook
- **No home base.** Every cleared location has its own **3×3 stash**; you deposit/withdraw only while
  physically there. Danger regenerates while you're away, so a cache you left loot in can become
  dangerous to revisit. Tunnel crawl overflow uses a separate **4×4** temp pile (`temp:crawl`), not
  a location stash.
- The read-only **Stash Logbook** lists every location holding cached items, with coordinates and a
  contents summary.

### 3.12 Sleep quality
- Rest fast-forwards toward morning and restores energy, but recovery scales by **enclosure**, **roof**,
  and **bed** (`game/sleep.ts`). A sleeping bag, faction bunk, HDB shelter, or tunnel camp beats open
  ground. The Rest control shows recovery **and** night ambush chance (priced as if you sleep through
  the night, including night swarm on the tile). Pockets underfoot change the odds. Hunger/thirst still
  drain (at a reduced rate).

### 3.13 Crafting & repair
- Deliberately small recipe set (`game/data/recipes.json`): purify/boil water, tear dressings, lash spear
  variants, strip gear for parts, handload shells, stitch a sleeping bag, plus a few SG sinks
  (EZ-Link knife, Kopi C, Milo dinosaur, cooked Maggi). Some recipes need a
  **workbench** (stash / HDB shelter). Tools can be required without being consumed.
- **Repair:** field whetstone / gun oil; workbench repair with duct tape + scrap + toolbox.
- Crafting is a **loot sink** first — scrap and tape have somewhere to go; clean water is made, not found.

### 3.14 HDB dungeons
- Void decks open a **vertical push-your-luck cutaway** (`game/hdbDungeon.ts`, zoom/pan via
  `react-zoom-pan-pinch`): stair columns, units, block **heat**, noise, and tiered loot.
  Door faces show **room type** (search, hazard, burn, fight, rest, intel, service);
  locked / half-open / barricaded state and encounter odds live on the location card
  (hover Room for the type blurb). Most loot doors must be Forced or Picked (lockpick,
  consumed). The pin **walks hop-by-hop**; every downward storey is a Dex+End check
  and a fight stops you on that landing. Sealed storeys are **permanently gone**.
  Stairs stay visible for orientation. Auto-path stops at corridor/stair **blockades**
  — smash them or use a **fob**. The **roof** is a short gated deck with extra loot.
  **Leave only from level 01.** Estate vs shelter archetypes change holdout rates.

### 3.15 Noise
- Actions emit spatial **noise pulses** (`game/noise.ts`) that temporarily boost nearby POI danger
  (`tempDangerBoost`, decays over hours). Combat and HDB entries are noisy; quiet traits help.

### 3.16 Extraction goal & horde clock
- Dual-path spine (`game/goal.ts`):
  - **Linger** — score day multiplier rises (`1.0 + 0.1 × (days − 1)`).
  - **Extract** — haul weighted readiness in the **backpack** (fuel > meds/ammo > water > food;
    weapons/scrap barely count) to a timed map beacon (≥8 km from first spawn) and call for a lift.
    Each staging window rolls a **seeded demand** (± band around a rising day curve) plus a soft cargo
    bias. On the approach the radio vibe stays qualitative (jittered so you cannot binary-search the
    quota). **Standing on the pad**, the first press **raises the channel** and the crew reads the
    numeric manifest for the rest of the window — a short haul can be topped up on purpose. A pack
    that already clears lifts on that same press (flare). Miss the window → cooldown → new site +
    fresh demand; the horde keeps rising either way.
- **Horde** rises ~8/day from a **mid-crisis** start (~42 on a new run); at 100 the city is **overrun**
  and the run ends. That island clock is still the fail state — but street danger is **geographic**.
  A seed-picked **ground zero** (one of 20 real towns in `game/townField.ts`) sits ahead of the mean;
  distant neighbourhoods sit behind it. Tiers: Stirring → Restless → Massing → Fallen → Lost.
  Lost is walkable, not a wall: extra trek/search pressure, dusk-rate night swarm in daylight,
  spawn snaps you into a roofed site. The spawn map stays clean; the run map paints a neighbourhood
  status overlay when you zoom out until the island fits (zoom ≤12) — real URA planning-area shapes,
  town name, tier, and a legend. Street zoom stays clear. Old saves without `groundZeroId`
  keep the flat global meter.
  `hordeIntensity()` / local `pressureAt()` feed hazard-cell density (20% → 42%), the **horde pocket**
  share of hazards (~33% → ~45%), a severity bump above 45, pocket radius (up to +40%), trek encounter
  chance (+18 pts, more in Lost daylight), search encounter chance (+30 pts), and a +1 tunnel danger
  tier above 50. Later days mean denser, nastier, more frequent contact — **and** a worse neighbourhood
  than yesterday.
- Successful extract adds `2000 × dayMult` on top of survival score.

### 3.17 Ghost survivors
- Death writes a **legacy corpse** (`singvive.legacy_run`). A later run that walks within ~120 m can
  meet a mini-boss, loot the corpse, or find a one-shot trader — whatever became of them
  (`game/ghostSurvivor.ts`).

### 3.18 Persistence, scoring & settings
- Fully **client-side** for the run. Keys:
  - `singvive.run.v6` — active run (v6: extraction + horde; optional `groundZeroId` for the town field)
  - `singvive.scores.v1` — personal leaderboard on this device
  - `singvive.settings.v1` — prefs independent of the run (language `en` | `zh-Hans`, timeline
    detail, 12/24 clock, weather FX, font size, how-to-play on start)
  - `singvive.legacy_run` — last dead survivor for ghost encounters
  - plus zoom / MRT overlay prefs
- **Worldwide honor board** — death and extract also `POST /api/scores` (Cloudflare Worker + D1).
  Failures are silent; the personal list still writes. Lists do not sync. Client-computed scores are
  accepted (rate-limited, sanitized names) — not anti-cheat.
- **Score** = `(kills×25 + carried loot value + days×50) × dayMult` (+ optional `2000×dayMult` on
  extract). Permadeath clears the run; death still posts a score.

---

## 4. UI

- **Desktop — left rail + map + timeline:**
  - **Left survivor rail** (~340px): clock, weather, Rest (with sleep-quality preview), `ObjectiveBar`,
    `ConditionPanel` (meters + body), and panel buttons **Inventory / Craft / Logbook / Stats**.
  - **Slide-out overlay** (does not reflow the map): inventory, craft, logbook, stats, objectives.
  - **Centre map** with target dock, trek/location sheets, noise/weather FX; HDB cutaway or tunnel run
    take over when active.
  - **Right timeline** — game log; contact Fight/Flee gate dims the rest of the UI until chosen.
- **Mobile — phone chrome:** a **status bar** (vitals) sits above the map. Bottom tabs are
  **Map / Hub / Inventory / Craft / Log**. On the map, the selected location / trek slides up as a
  sheet. Contact, doorway events, and search sessions are interrupt cards; tabs stay usable.
- **Overlays / modals:** trader, contextual guide, how-to-play primer, settings, day logs, event modals, HDB dungeon, tunnel run,
  ghost encounter.

---

## 5. Tech & Architecture

| Concern | Choice |
|---|---|
| Framework | React 19 + TypeScript 6 + Vite 8 |
| Map | Leaflet + react-leaflet, **CARTO "Dark Matter"** tiles (`VITE_CARTO_API_KEY`, retina `{r}` / `@2x`, native z20; Stadia + Esri kept in `tileConfig.ts` as alternatives), canvas renderer + custom fog overlay |
| Real data | OpenStreetMap → `public/pois.json` (`bake:pois`), `public/mrt.json` (`bake:mrt`), `public/zones.json` (`bake:zones`); URA planning areas → `public/towns.json` (`bake:towns`); live Overpass as POI runtime fallback |
| State | Zustand 5 (single store); `window.__game` in DEV |
| Inventory DnD | Custom pointer-drag over a cell grid (backpack ↔ stash ↔ equipment) |
| HDB viewport | `react-zoom-pan-pinch` |
| Determinism | `seedrandom`, wrapped in a forkable `Rng` (cosmetic flavour text may use `Math.random`) |
| Styling | Tailwind CSS 3 |
| Lint | oxlint |
| Backend | Cloudflare Worker + D1 honor board (`/api/scores`); run state is localStorage |
| Node | pinned by `.nvmrc` (22) |

```
src/
  game/        pure, seed-driven logic — rng, world, poi, loot, inventory, packGrid, survival,
               travel, weather, fog, combat, factions, events, character, occupations, crafting,
               trade, sleep, goal, searchSession, hdbDungeon, tunnelRun, mrtDamage, wilds,
               wildsEncounter, vegetation, playable, route, noise, ghostSurvivor, townField,
               itemTileColor, settings, storage, types, Zustand store
               (+ data/ JSON catalogs: items, lootTables, recipes, enemies, itemTileColors)
  api/         same-origin worldwide score client (no fetch under game/)
  i18n/        locale catalogs (`messages/en.json` source of truth, `zh-Hans.json` overlay)
               and `t` / `useT`; player primer is `guide.*` keys
  content/     guide topic routing (`guideContent.ts`) — copy lives in i18n
  hooks/       shared React hooks (e.g. useAnimatedNumber)
  icons/       icon registry + keys (emoji fallbacks → drop-in PNGs)
  dev/         DEV-only editors + Dev menu (loot / enemies / icons / locale) — never imported from game/
  components/  GameMap, FogOverlay, NeighbourhoodWash, Inventory/*, CraftingPanel, CombatPanel,
               ConditionPanel, StatsPanel, ObjectiveBar, ObjectivesPanel, PhoneStatusBar,
               HdbDungeonModal, TunnelRunView, StationStrip, TraderModal, GuideModal,
               SettingsModal, TrekCard, LocationCard, …
  screens/     Menu, CharacterCreate, SpawnSelect, GameScreen, DeathScreen
               (combat is a panel inside GameScreen — no combat phase)
worker/        Cloudflare Worker — GET/POST /api/scores → D1
```

**Design rule:** everything under `game/` is **pure and seed-driven** — deterministic for a given
seed, forked per-system (`rng.fork('loot'|'faction'|'event'|'human'|'wound'…)`), and testable without
the DOM. Exceptions: cosmetic flavour helpers may use `Math.random` (non-gameplay), and `rng.ts`
itself uses it only to mint a fresh seed string.

**Note on tiles:** Active basemap is **CARTO Dark Matter** (`{r}` retina, native z20). Raster tiles
need `VITE_CARTO_API_KEY` in `.env.local` (copy from `.env.example`; baked in at `vite build`) or
CARTO watermarks them. Stadia is sharper but keyless only on `localhost`; Esri is a last-resort
fallback (no `@2x`, caps at z16). **Any replacement must support both `{r}` and native z20**, or
the map goes soft — `TILE_MAX_NATIVE_ZOOM` must match what the provider actually serves.

### DEV tooling stack (reuse this)

In-game editors that must **persist to the repo** (not just mutate a live run) follow the loot
catalog tool. Use the same shape when adding trait, recipe, faction, or loot-table browsers.

**Launcher:** floating **Dev** control (bottom-left) in `npm run dev` only — opens a panel for
**Loot**, **Enemies**, **Icons**, and **Locale**. Overlays are mutually exclusive. `Ctrl+Shift+D`
hides the launcher for clean playtest screenshots (remembered for the tab via `sessionStorage`).
Deep-links still work via `src/dev/devBridge.ts` (`openLootItem`, `openEnemyEditor`,
`openIconBrowser`, `openLocaleEditor`).

| Layer | Role | Where |
|---|---|---|
| Catalog on disk | Machine-writable source of truth | e.g. `src/game/data/items.json`, `lootTables.json`, `recipes.json`, `enemies.json`, `itemTileColors.json`; chrome icons under `src/assets/icons/`; locales under `src/i18n/messages/` |
| Game import | Load catalog into pure logic (clone if you mutate at boot) | e.g. `src/game/loot.ts`, `crafting.ts`, `enemies.ts`, `itemTileColor.ts`; icons via `src/icons/`; copy via `src/i18n/` |
| Shared validation | Same checks for API + UI | `src/dev/validateItems.ts`, `validateLootTables.ts`, `validateRecipes.ts`, `validateEnemies.ts`, `validateItemTileColors.ts` |
| Vite DEV API | `apply: 'serve'` only — never in `vite build` | `vite.loot-dev-api.ts` → wired in `vite.config.ts` |
| Client API helpers | `fetch` / export / import / upload | `src/dev/lootApi.ts`, `enemyApi.ts`, `iconApi.ts`, `localeApi.ts` |
| UI | Full-screen overlays + Dev menu, gated by `import.meta.env.DEV` | `src/dev/DevToolsMenu.tsx`, `LootBrowser.tsx`, `EnemyBrowser.tsx`, `IconBrowser.tsx`, `LocaleEditor.tsx`, mounted from `App.tsx` |

**HTTP surface (localhost, DEV server only):**

- `GET/PUT /__dev/items` — read/write the JSON catalog (PUT validates + pretty-prints; HMR suppressed so the editor stays open)
- `GET/PUT /__dev/loot-tables` — read/write `src/game/data/lootTables.json` (same; hard-refresh to load into live `loot.ts`)
- `GET/PUT /__dev/recipes` — read/write `src/game/data/recipes.json` (same; hard-refresh to load into live `crafting.ts`)
- `GET/PUT /__dev/enemies` — read/write `src/game/data/enemies.json` (zombies, elites, humans, loners, animals, spawn rules; hard-refresh for live combat)
- `GET/PUT /__dev/item-tile-colors` — read/write `src/game/data/itemTileColors.json` (inventory tile tints by category)
- `GET/PUT /__dev/locale?id=en|zh-Hans` — read/write locale catalogs (query form; path `/__dev/locale/zh-Hans` can fall through to SPA HTML)
- `GET /__dev/item-icons` — list on-disk `item-*` assets + max upload size
- `POST /__dev/item-icon` — upload PNG/WebP (64 KB / 256px edge max) → `src/assets/icons/item-<id>.(png|webp)`, and
  register `item.<id>` in `src/icons/keys.ts` when missing
- `GET /__dev/icons` — list on-disk **non-item** chrome icon assets + max upload size/edge
- `POST /__dev/icon` — upload PNG/WebP for an existing non-`item.*` key → `src/assets/icons/<key-with-dashes>.(png|webp)` (does not edit `keys.ts`)
- `DELETE /__dev/icon?key=…` — remove on-disk chrome asset (emoji fallback remains)

**Loot browser UX extras worth copying:**

- Tabs: **Items** | **Tables** | **Recipes** | **Tiles** in the same floating DEV tool
- Per-item dirty prompts when changing selection; catalog-level **diff review** before Save
- Keyboard: `Ctrl/Cmd+S` save, `Esc` dismiss/close, `↑/↓` move the list
- Duplicate item, side-by-side compare, where-used (loot tables / recipes / factions / starting)
- Filters: exotic, starting, missing art; sort + group-by-kind
- `ItemDef.startingItem` (+ optional `startingCount`) drives run-start gear in `store.ts`
- Bags: in-item **bag-grid editor** (`packGrid` silhouette + blocked cells)
- Tables editor: scarcity-aware effective %, sort, badges, weight bars, ± steppers, normalize, duplicate category, drag reorder, craft-only / no-common warnings, only-in-table, diff-before-save, roll simulator + richness, jump-to-item
- Recipes editor: combination builder (search-add ingredients with kind filter + keyboard), output, optional tool, field vs shelter, hours, economy strip (value/weight/evac Δ), source badges, soft warnings, sandbox pack + Handyman, workbench preview + read-only repair, chain/cousin links, overview table, compare, family duplicate (swap one input), reorder, dirty-nav, jump-to-item; drafts stay mounted across Items/Tables tabs; item where-used reads the live recipe draft
- **Item art** is owned here (`item.*` upload / missing-art filter) — not in the Icons browser
- **Tile colors** tab edits `itemTileColors.json` (tints by item category; gameplay tiles ignore per-item `color`)

**Enemies browser:** opened from the Dev menu. Tabs **Overview** | **Zombies** | **Humans** |
**Spawn** — sortable strength table (HP/atk/threat/TTK), tier reorder, shared `humanDefaults` +
faction overrides, elite/loner stats, drop pools (click → Loot), where-used, compare, derived
danger readout, seeded preview.

**Icons browser:** opened from the Dev menu. Browse all non-`item.*` keys by namespace; filter
missing/has art; progress counter; tint preview swatches; drag/drop or upload PNG/WebP; clear
asset; orphan-file list for on-disk files with no matching key. Hard-refresh after uploads to
pick up new asset URLs in the live game.

**Locale editor:** opened from the Dev menu. English is source of truth; zh-Hans is an overlay.
Filter by namespace (`ui` / `settings` / `guide` / `item` / `enemy` / `recipe` / `trait`), missing
only, and search. Mass JSON export/import for translation drafts. Placeholders (`{n}`, `#{vars}`)
must stay intact; do not translate Singapore place names (POI / MRT / zones). Save writes
`src/i18n/messages/zh-Hans.json` (or `en.json`); a live overlay previews unsaved zh-Hans in the
running client.

**Hard rules when cloning the pattern:**

1. **Keep `src/game/` pure** — no React, no `fetch`, no file I/O. Editors live in `src/dev/`; the
   game only *imports* the committed data.
2. **Prefer JSON (or generated TS) over rewriting hand-authored modules** — comments in a giant
   `ITEMS = {…}` block do not survive round-trips; put lore in docs or optional fields if needed.
3. **Gate the UI with `import.meta.env.DEV`** and the plugin with `apply: 'serve'` so production
   bundles and `vite build` never expose write endpoints.
4. **Validate on both sides** — UI disables Save when invalid; the middleware rejects bad PUTs with
   400 + error list (same invariants as any DEV asserts in game code).
5. **Export/Import** — download JSON / file-pick into the *draft*; persist only on Save so imports
   are reviewable.
6. **Asset uploads** — size + mime + magic-byte checks; canonical filenames; optional keys/registry
   patch so the rest of the app resolves the new art after HMR.
7. **Immutable ids after create** when other tables reference them by string (loot tables, recipes,
   factions). Allow id edits only on unsaved drafts.
8. **Register new overlays in `DevToolsMenu`** instead of adding another floating chip; use
   `devBridge` open/close events so tools stay mutually exclusive.

**Minimal checklist for a new similar tool**

1. Extract the catalog to `src/game/data/<name>.json` (or add a sibling file).
2. Point the pure game module at that file.
3. Add `validate…` + `src/dev/<Name>Browser.tsx` + helpers under `src/dev/`.
4. Extend or add a Vite `apply: 'serve'` plugin with `GET/PUT /__dev/<name>`.
5. Mount `{import.meta.env.DEV && <Dev… />}` from `App.tsx` and add a row to `DevToolsMenu`.
6. Confirm `npm run build` — no `/__dev` strings and no editor chrome in `dist/`.

---

## 6. Run it

```bash
npm install
# copy .env.example → .env.local and set VITE_CARTO_API_KEY (CARTO raster watermark otherwise)
npm run dev       # http://localhost:5190  (PORT env overrides; see vite.config.ts)
npm run build     # typecheck (tsc -b) + production build
npm run lint      # oxlint
npm run preview   # serve the production build locally (Worker + assets)
npm run db:migrate:local  # apply D1 migrations to the local honor board (first time)
```

### Refreshing map data

```bash
npm run bake:pois
```

Rewrites `public/pois.json` from a fresh Overpass pull. It is **not** part of
`npm run build` — a flaky Overpass should never break a deploy. Run it manually for
fresher OSM data, then commit the result.

The bake:

- Classifies via `src/game/poi.ts` (hospitals vs clinics are separate)
- Drops anything outside `SG_OUTLINE` (no Johor spill)
- Re-fetches building footprints, matches shop nodes to containing buildings
  (ways, multipolygon relations, and `building:part`), retries failed outline
  chunks, and rejects oversized mall/campus shells for small shops
- Prints category counts and outline coverage when it finishes

### Refreshing walkability zones

```bash
npm run bake:zones
```

Rewrites `public/zones.json` — land mask, inland water, coarse restricted
(military) perimeters, and known forest / nature-reserve polygons. Water and
restricted hard-block spawn/trek; vegetation stays walkable but adds a soft
stamina/time cost when a route cuts through it. Same rules as the other bakes:
manual, committed, never part of `npm run build`. Pass `--local` to skip
Overpass and write committed fallbacks only (useful when the public Overpass
mirrors are rate-limiting).

### Refreshing planning areas

```bash
npm run bake:towns
```

Rewrites `public/towns.json` — simplified URA Master Plan 2019 planning-area polygons (no sea),
each assigned to one of the 20 gameplay towns. The run map paints these as the island status
overlay. Same rules: manual, committed, never part of `npm run build`. Pass `--from file.geojson`
to skip the data.gov.sg download.

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

Three traps, all already paid for:

- `out geom tags` on a relation silently returns **zero members**. The `tags` modifier switches Overpass
  to a tags-only print. It must be `out geom`.
- **OSM maps each direction of travel as its own way**, so a line arrives as two parallel rails ~15 m
  apart and draws as a double line. `dedupeWays` keeps one centreline by dropping any way whose length
  is ≥75% covered (within 40 m) by an already-accepted, *longer* way on the same line — short ≤3-point
  stubs drop at ≥50% cover. It must be a **cover fraction**, not a nearest-point test: the Changi
  branch shares the East West alignment for a few hundred metres out of Tanah Merah, and a "reject
  anything that comes close" rule eats every branch at its junction. Longest-first ordering is what
  stops two twins deleting each other. After dedupe, `stitchWays` chains leftover fragments whose
  endpoints lie within 200 m into continuous polylines so the overlay does not draw dashed track.
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
   buildings; pass 2 only asked for centroids). Batches of 100.
4. Buildings within 15m of the remaining point POIs (ways, building multipolygons, and
   `building:part`), matched by **point-in-polygon**. Prefer tagged amenity matches and unit-sized
   parts; smallest rank wins. Failed grid chunks are retried. Small shops skip shells larger than
   ~8,000 m² so a 7‑Eleven does not inherit the whole mall.

Two rules in pass 4 are load-bearing:

- **One outline per building.** A mall is one OSM building holding many POI nodes. Giving every tenant
  the mall polygon stacks a dozen identical giant shapes in different colours — visually worse than no
  outline. The building is drawn once for its richest tenant; co-tenants stay as badges, which reads
  correctly as "shops inside this building".
- **Simplify with Douglas-Peucker, never by sampling every Nth vertex.** Sampling discards the corners
  that define a footprint and turns complex buildings (MRT concourses run 65-74 points) into spiky
  arrows.

Pins that fall outside their assigned ring are snapped to the footprint centroid so fog/hover stay
attached to the building.

Void decks keep their category-default `size` even though they now have outlines — see the comment in
`world.ts`, it's a deliberate balance decision, not an oversight.

`scripts/bake-pois.mjs` imports `classifyOsm` straight from `src/game/poi.ts` (Node strips the
`import type`), so classification logic lives in exactly one place — edit `poi.ts`, re-bake.

### Deploying

Cloudflare **Workers + Assets + D1** (live origin `https://singvive.shhhhhdev.workers.dev`). Node
pinned by `.nvmrc`. No `_redirects` — the app is phase-based with no router, so every URL is `/`
except `/api/scores`.

One-time D1 setup (Cloudflare login):

```bash
npx wrangler d1 create singvive-scores
# paste database_id into wrangler.jsonc
npm run db:migrate
```

Then `npm run deploy` (`tsc -b && vite build && wrangler deploy`).

The worldwide board is an honor list: the client posts the score; the Worker sanitizes names and
rate-limits by IP. Personal top-10 stays in `localStorage` and is not bulk-uploaded.

---

## 7. Roadmap / identity bets

The game is already **feature-rich**. Adding more Project Zomboid / Tarkov systems will make it
heavier, not more itself. Fun comes from making the **island** the opponent and **local knowledge**
the skill.

The loop (spawn → blind trek → search / HDB / MRT → pack Tetris → horde clock / evac) is solid.
What still feels generic is the **skill** (stats + Tetris). The **clock** now has a first geographic
prototype (neighbourhood wash, seed-picked ground zero, Lost as an expensive shortcut) — it is not
yet the full “front retreats factions” vision. Singapore's actual fantasy is: *you know this city,
it is tiny, water is a wall, and neighbourhoods die in place.*

### Double down (north star)

These are **design bets**, not a build queue. Geographic doom has a **shipped prototype** (see §3.16);
the next uniqueness pass should be **local knowledge**, not a second horde system.

1. **Geographic doom, not a meter.** *(prototype in.)* The horde is a front: estates go quiet, then
   hostile, then Lost on the map. A day-8 Toa Payoh is not a day-2 Toa Payoh with +30% encounter
   chance. Night swarm already hinted at this; the wash + local `pressureAt` is the first place-falling
   layer. Still not in: faction retreats as the front moves, origin flavour, a 20-town HUD spreadsheet.
2. **Local knowledge as the build.** Occupations already gesture at this (*Estate Memory*, *Made Man*,
   STA). Make spawn + job change *what you remember*: MRT lines you can trust, which void decks are
   88, where Gotong still cooks. A tourist run is fog; a resident run is a damaged mental map.
   The MRT overlay (visible above fog) is the proof this fantasy already works.

### Protect, don’t dilute

- **HDB cutaways** and **tunnel crawls** are the unique setpieces. Street search + fight should stay
  the glue, not the star.
- **Nomadic 3×3 caches:** leaving loot is a geographic bet. Keep that; don’t add a home-base fort.
- **Real OSM + walkability zones:** the board is Singapore, not a themed tile set.
- **Infected wildlife** tied to habitat polygons (otters / macaques / boars) is more “Singapore
  apocalypse” than another shambler tier.

### Do not chase next

Generic survival add-ons. Fine later; they do not answer “why this game.”

- **Vehicles** — fuel already counts hard toward evac; faster/farther surface travel is a maybe.
- **Player-built street barricades** — HDB doors can already be barricaded as dungeon state; stash
  forts and street walls would fight the nomadic-cache identity.
- **Meta-unlock trees / accounts / daily seeds** — daily seeds are also deferred because the same
  seed is not the same run while spawn is player-chosen.
- **More meters, more recipes, more enemy tiers** — craft is correctly a small sink; add recipes only
  when loot piles up with nowhere to go.

### Fun, practically

- Cut busywork so the unique beats breathe: travel cards and search grids should resolve faster as
  the horde front closes.
- Faction **outposts** are already destinations — lean social geography (who still holds which block)
  before adding quests.
- **Balance** still matters: travel speed, meter/injury drain, danger regen, horde climb, evac
  thresholds, loot rarity.
- **Tests:** pure modules (`crafting`, `goal`, `noise`, `searchSession`, `wilds`) are ripe for a
  lightweight Vitest suite; none exists yet.

### Shipped (was roadmap)

- Crafting & repair, faction barter + marked outposts, ammo + weapon condition, extraction + horde
  clock, geographic neighbourhood field (ground zero + town wash), HDB cutaways, search sessions,
  sleep quality, occupations, in-game guide (en + zh-Hans), fill-the-track combat, noise, worldwide
  honor board (D1) beside the personal local top-10.

### Known constraints

- Overpass has rate limits and latency → map data is pre-baked to a static file, so the live API is
  only touched by `npm run bake:pois` / `bake:mrt` / `bake:zones` and as a runtime POI fallback.
  Planning-area overlays come from URA via `npm run bake:towns`. Baked data is a point-in-time
  snapshot: new shops in OSM won't appear until the next bake.
- Many Singapore shops are mapped as **point nodes**, not buildings, so not every POI has a drawable
  outline — those render as a category badge instead.
- The active basemap is CARTO Dark Matter (`VITE_CARTO_API_KEY` in `.env.local`). Stadia needs an
  API key off-localhost; Esri looks soft (no `@2x`, no z20). **Any replacement must support both
  `{r}` (retina) and native z20**, or Leaflet upscales and the map goes soft — set
  `TILE_MAX_NATIVE_ZOOM` to what the provider serves.
