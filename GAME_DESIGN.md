# SINGVIVE — Game Design

> The design source of truth for **SINGVIVE**, a browser-based zombie-apocalypse survival
> roguelike played on the real map of Singapore. Hand this to a human or another agent to
> reason about mechanics, extend systems, or critique the design.
>
> **Scope of this document:** what the game *is* — vision, loop, systems, UI, and direction.
> How it is *built* lives in [TECH_STACK.md](TECH_STACK.md); the short overview is
> [README.md](README.md).
>
> **Copy sync:** player-facing primer copy lives in `src/i18n/messages/*.json` (`guide.*` keys:
> Survive / Fight / Loot / Block / Tunnels / Evac / Score). `src/content/guideContent.ts` only
> orders those topics. Keep the catalogs and this document aligned when score, evac, or
> survival rules change.

---

## 1. Vision

You wake up in a fallen Singapore. There is no rescue on a timetable — only a rising **horde** and,
eventually, a chance to **extract**. Knowing nothing of what's around you, you push out into the fog,
chart real places by walking to them, scavenge what you can carry, and manage a failing body until it
gives out or you call for a lift. Every run is procedurally generated from pre-baked map data and a seed,
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
Pick an occupation seed (or build traits freely on the same screen) → Choose a real SG spawn (density-checked) →
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
- Real locations come from **OpenStreetMap**, pre-baked into `public/pois.json` by a **manual**
  commit step (`npm run bake:pois` — not part of `npm run build`) rather than queried per run. On spawn
  the game loads that static file once and filters it to POIs within ~1.5 km. Shops/amenities carry full
  geometry (`out geom`, for outlines); HDB blocks are centroids only (`out center`, kept light).
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
  curse**, nets the budget at exactly 0, and loads as an **editable seed** on the create screen
  (same grid as a hand-rolled build — swap traits to make it yours).
- **Attributes** are **derived from traits** (base 5 each, clamped 1–12) — Strength, Dexterity,
  Endurance, Perception, Wits. There is no separate point-buy panel; traits *are* the build.
- **Traits** — budget starts at **0**. Negatives *refund* points; positives *spend* them. Remaining
  points must stay ≥ 0. Caps: **max one signature** (cost ≥ 4), **max one curse** (cost ≤ −3),
  **max two negatives** total. A 5-cost identity is paid with a curse, not a pile of −1s. Cheap
  cousins stay for spread builds (*Reservist*, *Medic*, *Karang Guni*, *Home Cook*, *Distance Runner*,
  plus mid options like *Shadow Habit*, *Train Memory*, *Sharp Eye*…).
  Signatures include *Combat Veteran*, *Trauma Medic*, *Hyrox Champion*, *Estate Memory*, *Made Man*;
  *Mule* and *Sixth Sense* compete with jobs for the one signature slot.
- **Trait presets** persist across runs in `localStorage` so custom builds can be reused. Old
  six-flaw presets become illegal and show “needs fixing” on the create screen.
- Trait modifiers feed combat, travel, survival, loot, fog, crafting cost, faction standing, and
  unique rules (first hit halved, hawker-centre loot, HDB corridor reads, remaining-search intel).

### 3.2b Skills (in-run, passive)

- Seven **passive** skills sit between traits and mechanical mods: Fighting, Shooting,
  Fitness, Scavenging, Medicine, Trades, Stealth. Levels run **0–5** and **die with the run**.
- **Soft funnel:** traits keep their `*Mod` fields and also grant `skillStart` / `skillXpMult`.
  Signatures typically start at **+2** in their lane. Final mod = traits + skill levels + gear.
- **Growth:** meaningful actions grant practice XP (soft daily cap per skill). Looted
  **skill books** cost hours to read and grant a big XP chunk or one gated level by tier.
- Awareness / dialogue / fog stay on traits and attributes — not a skill in v1.
- Run schema is `singvive.run.v7` (v6 continues are wiped).

### 3.3 Fog of war — blind exploration
- You have **no knowledge** of any location until you stand in it. Undiscovered places show only as
  anonymous **"?" blips** (no name, category or danger). Their **building outline is still drawn** (in
  neutral) if OSM has one; locations without an outline are just their circular badge.
- The on-map rings are **not vision — they're travelable range**. The **inner, dashed ring** is how
  far you can comfortably push right now, derived from walking speed (END/DEX + leg injuries),
  current **energy**, weather and load. It shrinks as you tire or get hurt. The **outer, solid ring**
  is the **max travel range**: the same sum when rested and unhindered (full energy, sound legs, no
  overload, fair weather), so only your build and worn gear move it. The outer ring is what opens the
  fog and stands the 3D buildings, so the city holds still while energy ticks; ground and buildings
  between the two rings are **dimmed**, the walkable disc reads brighter. **Perception/awareness**
  extends how far out you *sense* blips (never their identity).
- **Discover-on-visit → permanent memory.** Arriving charts a location forever as **last-known intel**
  (stale danger, faction, looted state). Because danger regenerates while you're away, old intel can
  be dangerously wrong — the card flags "intel may be stale".
- A near-black **fog** darkens everything you haven't lit up by visiting.
- **3D view** (setting *3D map*, on by default; the on-map **3D** button toggles it). The run map tilts
  and the real buildings stand — but only where you have been or can see now. Unexplored blocks
  lie flat under the fog, so the city rises as you chart it. A site's own building takes its state
  colour (detected sites neutral, remembered ones dimmer, picked-clean darker); tap it to select the
  site. Sites with no building are just their badge, lifted to roof height. Turn it off for a flat,
  north-up map on slower phones. The spawn screen and route planner are always flat.

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
- **Night sight** (`game/nightSight.ts`). After dusk the survivor sees only as far as their light.
  Ambient light falls to ~60% at dusk and ~22% at night (cloud, rain, storm and haze cut it
  further). Sight scales the **blip range** and the **hazard-sensing radius**, so pockets outside the
  light are left off the trek card but still fire on the walk; the night swarm still reads further
  than ordinary pockets (you hear a street flood before you see it). A black **veil** past the edge
  of sight covers the map (above fog, below the MRT overlay and pins). Walking blind adds up to
  **+32% trek encounter** at full dark. Unlit night aim is **−3** (was −2); lit is **−1**, lit dusk 0.
  **Light gear:** `lightPower` on items — *Torch* 0.55 (off hand, so it spends the off-hand fork),
  *Headlamp* 0.45 (head, hands free). Sources stack with diminishing returns (cap 0.85); rain
  shortens the beam. A lit survivor at night pays a small **beacon** tax (+5% trek encounter).
  *Night Owl* +0.12 sight, *Afraid of the Dark* −0.06. Daytime is untouched.
- **Rest** is not a free full refill — see **sleep quality** (3.12).

### 3.5 Survival meters & the injury system
- **Meters:** Health, Hunger, Thirst, Energy, Infection (drain per active hour). Hunger or thirst
  below **35** starts draining limb HP (ramps to empty); at 0 you die of starvation / dehydration.
  Infection deals HP damage each hour until cured and is lethal at 100 (you turn). Sleep still drains
  hunger/thirst at **×0.55** of the waking rate.
- **Injuries (Project-Zomboid-style), 6 body parts** — Head, Torso, L/R Arm, L/R Leg. Combat damage
  lands on a weighted-random part, lowering its condition and sometimes causing **bleeding** (drains
  HP until treated). Total health is the **sum of all six parts**.
  - **Legs** slow **travel** (limp with one bad leg; crawl only when both are wrecked). They do **not**
    throttle combat gauge fill; footwork still takes a mild dodge hit.
  - **Arms are handed:** right = weapon accuracy, left = guard / off-hand block & free-hand tempo.
  - **Head** wounds tax attack accuracy, search speed, and awareness.
  - **Torso** wounds raise energy drain and cut carry capacity.
  - **Crippled** limbs (0 HP without proper treatment) cap passive heal at 70% until splinted/cleared.
  - **Passive regen** when stable — but **major bleeding blocks regen** until you bandage it.
- **Treatment:** bandage (stops one bleed + dresses a wound), medkit (stops all bleeds + big heal),
  painkillers (HP only), antibiotics/antiseptic (infection), splint (clears fracture).
- **Teaching:** How-to-play includes a **Body** topic; first meaningful injury shows a one-shot coach
  (settings flag `limbCoachSeen`).
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
- **Off-hand is a fork**, not leftover space. Empty: faster fill and a small dodge bump. A lid or
  shield can fully **block** a hit (and slows you) — shields buy block chance, not dodge. A second
  one-hander sometimes follows through. A torch only helps you see and search. A **two-handed**
  weapon occupies mainHand and blocks offHand.
- **Player attack:** `d20 + Dexterity + weapon accuracy + trait + stance − arm/head-injury penalty` vs.
  `10 + enemy defense`. Natural 20 (or stance crit floor) crits. Damage = `weapon damage + Strength/2`
  (+ stance).
- **Enemy attack:** `d20 + attack + environment` vs. `10 + Dexterity/2 + trait/armour defense + stance`.
  Worn **limb armour** soaks the body zone it covers. Zombie hits can infect; the hit wounds a body part.
- **Dodge is a second save, not a second AC.** After a swing beats defence, the survivor may still
  slip it (`playerDodgeChance`, hard-capped at **28%**). Dex, traits, light gear, free off-hand,
  stance, terrain, and energy feed the chance; energy alone is only ±10%. A **natural 20 never
  dodges**. A successful dodge costs **3 energy** — footwork taxes the meter so a high-dodge run
  tires itself out instead of erasing half the fight for free.
- **Armour has a ceiling.** Gear contributes at most **+6** defence in total (`MAX_EQUIP_DEFENSE`);
  traits sit outside the cap. Defence is a d20 target, so a point of it is a flat 5% off every
  incoming swing — uncapped, a full riot kit reached +13 and was hit only on a natural 20. Past the
  cap armour earns its keep through soak, status resist and blocking, not evasion. A swing the kit
  turns — one that would have landed on a bare survivor — **scuffs the armour that stopped it**, so
  good gear pays upkeep instead of being free to own. Protective stats also fade faster with wear
  than a weapon's edge does (floor 40%, vs 75%), and heavy plate costs **combat speed and carry**.
- **Environment:** night/dusk and rain/storm/haze shift odds toward the enemy. After dark the dead
  swing at **+2** (dusk +1); the survivor's own swing loses **1** at night and another **1** if
  unlit (a worn light turns that into +1). Rain, haze and midday heat cost 1, a storm 2.
- **Pacing rule:** penalties to the *survivor's* accuracy lengthen a fight without making any single
  swing more dangerous, so they are kept small and the danger of a bad situation is carried by the
  enemy's side of the roll. **Guarded**, the stance every fight opens in, has **no accuracy cost**
  — it buys +2 defence and softer limb hits with tempo and damage. `npm run sim:combat` reports swings per fight, whiff rate and
  damage taken for a ladder of loadouts; run it before and after touching combat numbers.
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
  station, code badges from z15 — in its own map slot **above the fog**. Collapsed segments for
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
- **Weight, not space, is the limit.** Nothing is ever left behind for lack of grid room: whatever
  doesn't fit the pack grid is **carried loose** (`LOOSE` container, no grid, listed under the pack).
  Search Take / Take all, travel finds, crafting, trades, event gains and bag swaps all fill the grid
  first, then go loose. Loose items count **×1.25** weight, can't be reached mid-fight (reloads come
  from the pack), and can be dragged into the grid or the stash at any time.
- **Bags cut weight.** An equipped bag takes `weightReduction` off everything packed in its grid:
  pockets/tote 0%, daypack 15%, school bag and duffel 20%, hiking pack 35%, military rucksack 45%
  (a broken bag stops helping). This is why the grid is still worth playing.
- **Load** = (packed × (1 − bag cut) + loose × 1.25 + worn) ÷ `maxCarry`, where
  `maxCarry = Strength×3 + Endurance×2` (+ equipped bonuses, × torso condition).

  | Tier | Load | Effect |
  |---|---|---|
  | Light | ≤ 55% | none |
  | Burdened | 55–100% | quiet tax: travel up to ×1.44, energy ×1.5, combat speed ×0.7, attack −1 |
  | Heavy | 100–150% | travel ×1.44 → ×2, energy → ×2.2, attack −2, flee DC +4, loud arrival (noise pulse) |
  | Straining | 150–200% | travel → ×3.7, energy → ×4.2, attack −4, **can't flee**; each km walked costs legs and torso 1 → 3 HP (no bleeding; the torso stops at 1 HP) and has a 5% sprain chance |
  | Pinned | > 200% | **can't travel** (overland, tunnels) until you drop or stash something |

  The carry bar spans 0–200%, names the tier and lists its top penalties once you're past Light;
  the survivor Carry cell turns red and names the tier from Heavy. Hover either for the full list.

### 3.10 Search sessions
- Searching a site is a **real-time fogged grid** (`game/searchSession.ts`), not an instant loot dump.
  Street POIs roll a **destruction tier** on first visit (shown instead of loot richness); haul size
  scales with footprint (~3–7 finds) and item **condition** sits on that ruin's band (Intact =
  Brand New … Gutted = Old & Torn). In the 3D view the site's building shows the same tier:
  scorched, cut down, or broken open.
  Click fogged cells to prioritize them; finds reveal one by one; Take / Take all claim into the pack
  (overflow is carried loose). **Done** or **Leave** abandons unclaimed finds. Leaving early still
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
- Void decks open the block as a **stack of landing strips** (`game/hdbDungeon.ts`,
  `components/HdbLevelStrips.tsx`): one strip per open landing, top storey first, each with its
  own **heat** meter and its rooms. Click a strip to take the stairs there; click a room on your
  own strip to open its action card (Force / Pick / search / rest / read / service). Room tiles
  show the type (search, hazard, burn, fight, rest, intel, service), boarded ✕, cleared ·, and a
  dot when Dexterity read the containers from the corridor. Most loot doors must be Forced or
  Picked (lockpick, consumed). There is no maze: no corridor blockades, no walking pin.
- **Heat is per landing.** What you do on a landing heats that landing (`addHeat`); loud acts
  **spill** a share to the open landings directly above and below — door force 0, barricade
  0.35, trap 0.25, fight end 0.5, roof hatch 0.5. A landing's heat band drives its encounter
  odds, room threat (`floorThreat`, +1 in the top third once Awake) and descent DC
  (`8 + 2 × dcStep`). Max heat is **danger only**: a Swarm landing ambushes doors and anyone who
  crosses it (80% elite), never a forced move. Landings you are not on **cool 5 heat/hour**
  (`coolLevels`, run from `advanceTime`); re-entering a block halves every landing.
  `blockHeat` is kept as the peak (`peakHeat`) for the scar, the site card and the exit leak.
- **Stairs.** `travelPlan(from, to)` costs 0.75 min per real storey × the load stair factor.
  Going **down**, every open landing crossed (and the destination) rolls d20 + Dex + End against
  that landing's DC + the load flee modifier; the first fail stops you there in a fight. Climbing
  has no rolls, but a Swarm landing on the way still ambushes. Hot landings below you make the
  way back to 01 the risk. The strip tooltip previews minutes, each roll's fail %, and the odds
  of arriving clean.
- **Roof hatch.** The roof is reached through a hatch from the landing below it: Force it
  (20 min, +12 heat with 0.5 spill, a street noise pulse) or open it quietly with the roof fob a
  flat on a mid landing may hold (60%).
- **Real height sets the scale, not the content.** `hdbEnter` reads the block's 3D roof
  (`siteRoofs`, `roof ÷ 2.8 m`, clamped 3–50; no roof → seeded 10–16 storeys). Open landings
  are capped by height — ≤5 storeys: 3–4 · 6–12: 4–6 · 13–20: 5–7 · 21+: 6–8 — ground and roof
  always included. The dead storeys between two landings collapse into one **sealed span row**
  ("04–11 · slab collapsed"), a thin muted strip. Labels show the real storey number.
- **Landing themes**, dealt from a seeded no-repeat deck (`ordinary` may repeat once):
  `holdout` (services, calmer), `fire` (burning rooms, good loot), `nest` (dens, starts hot,
  one stocked door), `picked_over` (mostly cleared, one notice), `refuge` (20+ storeys only;
  safe stairs, rest drops heat). Revealed on arrival with a log line; a chip on the strip.
- **The block on the map.** Desktop with 3D on: the strips sit over the map beside the tower,
  each with a notch pointing at it, while the camera closes in until the tower fills about half
  the view (and eases back out on exit). Every other building ghosts so the block reads through
  the estate. Drag the empty map beside the tower to turn and tilt the camera around it; scroll
  to zoom. An amber **storey band** on the extrusion marks your landing and follows strip hover.
  Phone or 2D: the same strips as a full-screen list, the action card below.
- **The block remembers.** `hdbScar` reads the persisted dungeon: worked blocks dim on the 3D map
  in quarter-steps, the site card shows doors cleared · storeys sealed · hunting. Leaving while
  any landing is at **Swarm** leaks a noise pulse (350 m) into the street.
  **Leave only from level 01.** Estate vs shelter archetypes change holdout rates.
- **Saves.** Blocks carry `v: 2`. A maze-era block is converted on load (`migrateHdbDungeon`):
  doors, per-landing heat and fobs carry over, the stair geometry is dropped, you re-enter on 01,
  and an opened roof gate becomes an open hatch. Run key stays `singvive.run.v7`.

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
  distant neighbourhoods sit behind it. **Neighbourhood** tiers: Stirring → Restless → Massing →
  Fallen → Lost (the island meter itself tops out as Swarming → Overrun).
  Lost is walkable, not a wall: extra trek/search pressure, dusk-rate night swarm in daylight,
  spawn snaps you into a roofed site. The spawn map stays clean; the run map paints a neighbourhood
  status overlay when you zoom out until the island fits (zoom ≤12) — real URA planning-area shapes
  coloured by tier, and a legend. Hovering an area names it and its tier (no always-on labels).
  On desktop the rail's **Island front** button shows the horde tier and pulls the camera back
  over the whole island. Street zoom stays clear. Old saves without `groundZeroId`
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

### 3.18 Sound
- **Procedural ambience** (`src/audio/ambience.ts`, Web Audio, no asset files). Beds: brown-noise
  wind (hollower after dark, a rumble in tunnels), rain by weather, a tropical night chorus that
  **goes quiet as horde pressure rises**. One-shots: distant groans (rate and closeness rise with
  local pressure and darkness), house-gecko chirps, unseen metal clanks, thunder, tunnel drips.
  Heartbeat below 40% HP. Stingers: a far-off civil-defence wail at nightfall, a dissonant hit on
  contact. Setting `sound` (off / quiet / full); audio starts on the first click (browser policy)
  and suspends while the tab is hidden. Purely cosmetic — nothing in `game/` reads it.

### 3.19 Persistence, scoring & settings
- Fully **client-side** for the run. Keys:
  - `singvive.run.v6` — active run (v6: extraction + horde; optional `groundZeroId` for the town field)
  - `singvive.scores.v1` — personal leaderboard on this device
  - `singvive.settings.v1` — prefs independent of the run (language `en` | `zh-Hans`, timeline
    detail, 12/24 clock, weather FX, sound, font size, how-to-play on start)
  - `singvive.legacy_run` — last dead survivor for ghost encounters
  - plus zoom / MRT overlay prefs
- **Worldwide honor board** — death and extract also `POST /api/scores` (Cloudflare Worker + D1).
  Failures are silent; the personal list still writes. Lists do not sync. The score is still
  computed in the browser, so the board is hardened rather than cheat-proof: a run registers with
  the Worker when it reaches the screen (`POST /api/runs`), and a score only posts against that
  registration — once, for the same seed, after a plausible amount of real time, and only if the
  kills and days can explain it (`worker/scoreRules.ts`). A run that never reached the Worker
  (played fully offline) stays on the personal list only.
- **One tab per browser.** A second tab shows "Already open" until the first closes
  (`useSingleInstance`) — two tabs on one save could write a dead run back.
- **Score** = `(kills×25 + carried loot value + days×50) × dayMult` (+ optional `2000×dayMult` on
  extract). Permadeath clears the run; death still posts a score.

---

## 4. UI

- **Desktop — left rail + map + timeline:**
  - **Left survivor rail** (~408px): clock, weather, Rest (with sleep-quality preview), `ObjectiveBar`,
    `ConditionPanel` (meters + body), and panel buttons **Inventory / Craft / Logbook / Stats**.
  - **Slide-out overlay** (does not reflow the map): inventory, craft, logbook, stats, objectives.
    Most panels are a 360px column beside the rail; **craft** spans the whole map instead (never
    narrower than 360px) and reflows its recipes into as many columns as that width allows.
  - **Centre map** with target dock, trek/location sheets, noise/weather FX; HDB cutaway or tunnel run
    take over when active.
  - **Weather in 3D.** With the 3D view on, weather lights the city instead of tinting the screen:
    warm sun on clear days, flat grey under overcast, cold blue-grey in rain, amber soup in haze,
    harsh orange in a heatwave. Dusk turns it orange, night blue and dim. Haze and rain thicken the
    far distance. Thunderstorms throw lightning that lights every building for a moment, followed
    by thunder. Purely visual; the 2D view keeps the flat overlays.
  - **Right timeline** — game log; contact Fight/Flee gate dims the rest of the UI until chosen.
- **Mobile — phone chrome:** a **status bar** (vitals) sits above the map. Bottom tabs are
  **Map / Hub / Inventory / Craft / Log**. On the map, the selected location / trek slides up as a
  sheet. Contact, doorway events, and search sessions are interrupt cards; tabs stay usable.
- **Overlays / modals:** trader, contextual guide, how-to-play primer, settings, day logs, event modals, HDB dungeon, tunnel run,
  ghost encounter.

---

## 5. Roadmap / identity bets

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
- **Tests:** Vitest covers combat, wilds, crafting, survival, events, inventory, firearms, and more
  under `src/game/` (+ catalog / i18n key guards). Still thin or missing: `goal`, `noise`,
  `searchSession`, and anything that only lives in `store.ts` / React.

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
- The basemap is CARTO's Dark Matter **vector** style (keyless). The 3D view needs building heights
  from it; any replacement must carry them (OpenFreeMap Dark does, as `render_height`). OSM
  building heights are uneven — some blocks are missing heights or mapped as one tall mass.

