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

### Co-op prototype (experimental branch)

The menu's **Online co-op prototype** opens a separate expedition across Singapore.
Up to four survivors join with an invite code and act independently. The host chooses
Bishan, Tampines, Jurong East, Woodlands or Chinatown; each survivor chooses a role
(its starting kit, with no traits).
One real second represents one game minute. Surface journeys use validated land routes
in hops up to 1.2 km, with duration determined by distance, equipment, injuries and weather.
Free-ground waypoints allow crossing beyond known POIs. Exploration is shared with the squad;
live cache and enemy information depends on the viewer's current sight. Old saved schematic
rooms keep their original four-site rules.

Each survivor carries real items and equipment and has independent hunger, hydration,
energy, infection, body injuries and skills. Searching takes 15 seconds and reserves one
finite search; the resulting items go into the shared cache. Pickup and nearby transfers
are serialized by the server. Field crafting reserves ingredients and produces its output
when the action finishes; cancellation refunds reserved ingredients. Rest lasts 240 seconds
and may be cancelled. Wound treatment and rescue use actual medical supplies. Travel,
searching, combat, medicine and crafting grant practice through the solo skill rules.

Reaching an MRT station reveals adjacent tunnel exits from the committed rail network.
Tunnel travel is on foot, costs 1.5 times the walking duration, and reveals surface sites
only at its endpoint. Faction ownership is seeded metadata; faction services are not yet
available in co-op.

HDB void decks support a shared generated block layout with independent survivor positions.
Open landings and open/half-open searchable units are accessible through timed stairs and
door actions. Unit caches, traps and enemies persist across visits; teammates must reach
the same room to trade or rescue. Locked/barricaded doors, roof access, heat/hunting,
NPC services and room intelligence remain unavailable in this first interior pass.

The server owns the shared clock, finite caches and encounter outcomes. Anyone can pause;
all connected participants ready up for a three-second resume countdown. A disconnect
pauses the room for a 15-second reconnect grace period; remaining players may then ready
up and continue. The absent survivor remains exposed if play resumes. An empty room stays
paused. Paused players can inspect state but cannot perform gameplay actions.

First arrivals can trigger seeded shared encounters. Survivors at the same site explicitly join attacks,
choose a stance or flee; the enemy can attack any exposed active survivor at that site.
Combat currently resolves in two-second beats using melee equipment, body protection and
skills. Firearms fall back to unarmed attacks; ammunition-based shooting and the solo
combat gauge are not integrated. Flee retreats along a valid previous journey.
Downed survivors have 30 simulation seconds for a nearby teammate to complete a five-second
rescue. The rescuer needs a medical charge, spent only on success; damage interrupts rescue.
Rescue restores 30% of each body part's maximum HP, stops bleeding and leaves crippling injuries.
It provides a small survival-meter floor so a rescued survivor can act. If everyone is down,
there is no rescuer and the expedition ends. Expiry takes precedence over a rescue completing
at exactly the same instant.

Dead survivors leave supplies at their location. They can return as a fresh survivor only
while another active survivor waits idle at the rendezvous. Replacements receive no supplies.
Extraction is individual and extracted seats cannot return. When nobody remains active,
remaining downed survivors die and the room ends. This prototype does not submit solo scores.
Rooms and reconnect credentials are separate from solo saves; server rooms expire after
24 hours without a successful join, connection or sequenced command.

The island expansion is not complete solo-system parity. Advanced faction services,
firearms, book study, intelligence chains, world facilities, horde-driven timed extraction
and solo scoring remain separate. Co-op extraction uses a seeded destination and five-second
boarding; each survivor may board independently.

Several months after the outbreak, you begin your journey in a fallen Singapore. Supplies run low,
night makes the streets dangerous, and nearby **noise** can draw trouble. With little reliable
knowledge of what's around you, you push out into the fog,
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
   through roles (story and starting kit), attributes derived from traits, and a positive/negative
   trait economy.
5. **Tactile inventory** — a spatial, Tarkov-style grid where weight and space are both real
   constraints.
6. **Dual-path scoring** — linger for a rising day multiplier, or haul a fogged cargo kit to a timed
   map beacon and extract. Best board scores do both: survive long, then lift out late.

**Current status:** feature-rich, fully playable. Systems below are implemented end to end
(desktop + mobile), including crafting, faction trade, HDB cutaways, tunnel runs, extraction, and
the in-game guide.

### World setting and event tone

The outbreak began **several months before the survivor's run**. Singapore's government has
collapsed completely. The run's day counter measures this survivor's journey; Day 1 is not
the first day of the outbreak.

Survivors are scarce. Those still alive generally stay concealed in secured rooms, small
enclaves, or a few defended faction strongholds. Leaving shelter to scavenge is a deliberate
risk. Public queues, casual roadside stalls, frequent roaming crowds, and routine street
patrols must not make the city feel populated or orderly. Existing factions represent local
survivor groups with limited reach, not a functioning replacement government.

Outside help has not disappeared entirely. A world peacekeeping organization and a health
organization still conduct **occasional evacuation operations**. Their intermittent presence
does not restore civil authority or make the island safe. A current evacuation transmission
is consequential; an abandoned checkpoint or an old evacuation notice is not evidence that
a pickup is still available. Organization names and insignia are not yet specified.

These authoring constraints guide the implemented arrival-event and local-activity revisions:

- **Most encounters with the human world are traces:** stripped shelves, weathered notices,
  abandoned triage stations, old barricades, concealed supply caches, and signs of recent use.
  A trace may offer information without producing a living NPC.
- **Direct human contact is uncommon and contextual.** A voice behind the locked door of one
  room within a site, or a lone scavenger withdrawing from view, fits better than an exposed
  trader waiting for customers. Describe the room explicitly: its locked door does not mean
  the site's entrance is locked or that the rest of the site is inaccessible.
  Sustained trade, medical aid, and organized water distribution belong inside established
  enclaves. Environmental and infected threats carry ordinary street danger.
- **Time leaves material consequences.** Distinguish old remains from a recent death. A working
  radio, powered alarm, active fire, or clean water source needs a plausible ongoing or recent
  cause; do not imply unattended infrastructure has run normally for months.
- **Scene facts govern choices and consequences.** Aid can cost time or supplies, and a cautious
  survivor may refuse it. Failed aid does not itself create infected enemies. Violence needs
  an established threat; noise, exposure, or a clearly signalled trap can connect an action to
  an encounter. Cosmetic prose variants must not change the physical situation underneath the
  same resolution rules.
- **Evacuation information distinguishes current from obsolete.** Old routes, expired pickup
  instructions, and abandoned relief supplies can tell the story of earlier operations.
  Present-tense promises of extraction must agree with the active evacuation window.

#### The city several months later

Singapore remains recognisable. Block numbers, bus shelters, tiled walkways, shop shutters,
station maps and the outlines of housing estates survive. Most buildings are still standing.
Months of interrupted maintenance leave blocked drains, damp interiors, damaged fittings and
patches of overgrowth; they do not turn the entire island into an ancient jungle or make every
concrete tower collapse. A collapsed route needs a local cause such as a fire, impact or damaged
structure. The city's scale makes the absence of people palpable.

The collapse happened unevenly. Early emergency notices sit beneath later handwritten
corrections. A school used as a temporary assembly point may have closed before the last
evacuation; a clinic may have continued treating neighbours after its supplies stopped arriving.
These are scene possibilities, not a fixed sequence of real institutions' failures. A uniform,
an official stamp or a surviving sign does not establish present authority. Some former public
workers still help in a personal capacity, without a functioning chain of command behind them.

The player is a survivor of those intervening months, not necessarily someone who slept through
the disaster. Starting without reliable nearby information can follow displacement or the loss
of shelter. Do not impose a single personal history on every occupation. The rest of the world
is only partly known: continuing outside operations establish that some organized capacity
survives, but neither global recovery nor global collapse is confirmed.

#### Everyday survival and infrastructure

The following conditions are fictional extrapolations for the setting, grounded in the real
dependencies listed below. They are not predictions about Singapore's actual emergency plans.
Use local variation rather than a single exact date when every service supposedly failed.

| System | Condition in the setting | What a scene can make the player notice |
|---|---|---|
| Food | Imports, distribution and refrigeration have been disrupted. Exposed shops were searched early. Surviving stocks are uneven: missed cupboards, sealed stores, household reserves and occasional relief supplies. | A hawker stall's menu remains, but its fridge is warm and its cooking fuel is gone. A freshly cooked meal requires someone with ingredients, water and a heat source. |
| Water | Rain and reservoirs remain; reliable treatment, pumping and distribution do not follow automatically. Working local supplies require maintenance and a credible source. | A dry upstairs tap, an empty collection container, or a carefully maintained rain-catching arrangement. Floodwater is not a free drinking-water reward. |
| Power and communications | Most public services are unavailable or unreliable. Small maintained generators, batteries or solar installations can support limited local use. | One powered radio behind a dark shopfront; a battery saved for the next listening period. A working alarm or broadcast needs a power source. |
| Housing | Secure rooms can shelter people, while stairs, corridors and shared entrances remain exposed. Lifts cannot be assumed to work. | Carrying water upstairs, a landing blocked by furniture, a rope lowering a container from one occupied flat. One locked room never implies the entire site is locked. |
| Transport | Roads retain their geography but access is uncertain. Trains do not run. Underground routes depend on local drainage, access and maintenance. | A route map still gives directions; a recent waterline warns that the route itself may no longer be usable. A dark third rail is not automatically live without an established power source. |
| Health and sanitation | Clinical supplies and ordinary care are scarce. Waste, spoiled stores and loss of routine treatment compound the outbreak. | A clinician reusing a ledger to record supplies; a cleaned sleeping space that somebody has worked to preserve. An intact hospital facade does not imply a functioning hospital. |

Heat, humidity and rain shape the day. Clothing and bedding are hard to keep dry; sealed rooms
are uncomfortable; exposed equipment deteriorates. Downpours can conceal footsteps while
obscuring other sounds and making some routes worse. Nights remain tropical, even though the
infected make them more dangerous. Do not import winter survival imagery into this setting.
The city is not acoustically dead: rain on shelter roofs, insects, birds, dripping water and
loose metal continue in the spaces where traffic and crowds used to dominate.

The infected and their established game behaviour are the speculative premise. Keep surrounding
material details grounded. Do not casually add transmission routes, cures, immunity, or claims
that ordinary medicine treats the fictional pathogen. The exact origin and biological explanation
remain unspecified; any future clarification must agree with the existing infection rules.

#### Singapore in the details

Local identity should change how people move, remember and help each other. Landmarks alone
are insufficient. A scene should still feel local when Marina Bay is nowhere in view.

| Place or practice | Loss the player can read | A small sign of continuity |
|---|---|---|
| HDB landings and void decks | A communal table sits empty; water must be carried up dark stairs. Home is visible but difficult to reach or maintain. | A neighbour lowers a container, or leaves a dated note naming a usable stairwell. |
| Hawker centres and wet markets | Familiar stall signs remain over stripped counters. Shared tables have no customers; recognizable food names describe things no longer available. | Within a defended enclave, someone still measures portions fairly and makes room at a shared table. |
| Covered walkways and bus shelters | Shelter from sun and rain remains useful, but a once-routine covered route can funnel a traveller into a blocked passage. | Someone has moved an obstruction or marked a usable connection. |
| MRT stations | Line colours and station codes preserve a shared map while the platforms are silent and exits uncertain. | A maintenance note records which passage was checked and when. It helps without promising the whole network is safe. |
| Schools, community spaces and places of worship | Old distribution lists and abandoned assembly arrangements show where people once gathered. Each location has its own history. | A small group maintains one room, a noticeboard or a supply exchange; no whole institution needs to be functioning. |
| Port, airport and coastal approaches | Cargo and passenger infrastructure remain visible while access, fuel, crews and safe routes are missing. Seeing the sea or a runway is not an escape plan. | A verified operation provides a specific, temporary way out. Boats and aircraft require actual crews and logistics. |

People include residents and non-residents, different generations, languages and walks of life.
Maintenance workers, cleaners, stallholders, nurses, drivers and neighbours have practical
knowledge that matters alongside armed personnel. Names, languages and beliefs do not determine
whether someone is trustworthy, helpless or dangerous. A migrant worker can be the person who
knows how to keep a shelter running, with needs and relationships of their own.

Use multilingual traces naturally: official printed notices, later handwritten additions, block
and unit numbers, food containers and familiar ways of addressing neighbours. Dialogue should
sound like a person with a purpose, not a display of local slang. Chinese copy follows
`docs/i18n-zh-hans.md`: local nouns and roles carry the setting; do not sprinkle untranslated
Singlish into every sentence. Religious and community spaces need specific local circumstances,
not a blanket promise of safety or a default association with danger.

#### People, factions and the reach of authority

Living people are more likely to be heard behind a door, glimpsed at a distance or inferred from
recent work than encountered standing openly in the street. Most people have reasons to avoid
injury and exposure. Fear can produce silence, withdrawal, refusal or negotiation; it does not
automatically produce an attack. Genuine predation exists, but is tied to a person's intent and
an advantageous position rather than used as every conversation's failed outcome.

Keep the existing faction identities and mechanics. Their narrative reach is limited:

- **`muster` / 联防队:** surviving guards, reservists and former public-service personnel can
  organize a watch or hold a small perimeter. Familiar procedures and equipment do not make
  them a restored national command. Protection competes with dwindling supplies and fatigue.
- **`gotong` / 普通幸存者:** small groups preserve meals, care and mutual obligations behind
  defensible doors. Their dilemma is how much they can share while keeping those already inside
  alive. They are not a populous public market.
- **`sta` / 环线同盟:** people keep particular entrances and stretches of tunnel usable through
  local knowledge and work. They cannot certify every station or operate an intact railway.
- **`syndicate_88` / 双八堂:** coercion and control of a few useful approaches or stores sustain
  their power. They do not need an endless supply of gunmen to be threatening. Their identity
  does not explain every unaffiliated robber or hostile civilian.

These limits guide event placement and prose. They do not silently remove existing outposts,
services or faction rules; implementation changes are a separate, explicit step.

#### What despair and hope mean here

Despair comes from the gap between a visible need and the means to meet it: water below a home
whose lift no longer works, a destination printed clearly on a notice whose date has passed,
or supplies too heavy for the injured person who needs them. Let the player understand the
cost and retain a meaningful choice. Repeated arbitrary punishment makes planning meaningless
and weakens the setting's credibility.

Use absence and interrupted routines more often than graphic tragedy. Not every missing person
is confirmed dead; not every unattended belonging needs a death scene. Ordinary discomfort,
unfinished messages and quiet stretches allow a later encounter to matter.

Hope is specific and sometimes fulfilled. Someone leaves the promised water. A marked route
really is passable. A voice answers the current call sign. Assistance can be refused without
becoming a trap, and a good deed can have a modest, real effect without buying a reward.
If every offer of help is secretly bait, the player learns only to distrust the writing.

An event should make its stakes legible before the choice, then acknowledge the actual outcome.
Show the remaining cost alongside any relief: a meal shared uses food; keeping a radio alive
uses power; helping a stranger may consume time. Preserve moments in which the effort succeeds.
Survival means keeping some ability to act for oneself and others, as well as avoiding death.

#### Intermittent evacuation and the outside world

The world peacekeeping organization provides security and access for limited operations; the
health organization provides medical coordination and assessment. Transport depends on assigned
crews and available aircraft or vessels. These are fictional roles for the setting, not claims
about the mandates or actions of named real-world organizations. Names, insignia and the exact
offshore or regional base remain unspecified.

They cannot maintain a permanent island-wide presence. Weather, fuel, maintenance, crew capacity
and conditions at the pickup point constrain operations. Fresh transmissions carry a time,
location and identifying detail so players can distinguish a current contact from a recording.
A missed window means that operation is over; it does not establish that every outside contact
has vanished. A confirmed rescue must sometimes deliver on its promise.

Departure offers a credible chance of shelter and care without promising a cure, a restored home
or knowledge of everyone's fate. The player need not learn the entire geopolitical situation to
believe that the responding crew is real.

**Evacuation:** there is no cargo/readiness quota as an admission condition.
Fuel, medical supplies and ammunition help the survivor make the journey; they are not a
humanitarian organization's price for a human life. Keep the opening broadcast's known map
destination. Randomly finding a notice, receiver or trustworthy NPC must not become the new
admission gate. The implemented flow and scoring are specified in section 3.16.

#### Event-writing examples (proposed, not implemented)

These examples establish tone and causal boundaries; they are not promises of new simulated
systems or guaranteed rewards.

| Scene | Opening image | Choice and credible consequence |
|---|---|---|
| A container on a rope | At an HDB block, a container descends from one upstairs flat. The person holding the rope stays out of sight. | Leave water, speak quietly or move on. Refused contact ends the exchange; it does not spawn infected. Any danger must already be established nearby. |
| The washed-out arrow | Under a covered walkway, rain has nearly erased a handwritten direction beside an old printed assembly notice. The printed date has passed. | Spend time checking the route or continue elsewhere. It may yield a local route clue, never an invented live evacuation window. |
| One working receiver | Behind one locked room inside a clinic, someone asks whether the broadcast repeated today's date. | Share verified information, offer a suitable battery or decline. No knowledge or battery is consumed unless the player actually has it. |
| A table kept clean | Most of a hawker centre is abandoned. Inside a secured enclave, one shared table has been wiped and a small meal is being divided. | Accept an offered share, contribute supplies or leave. The meal comes from the group's finite stores; kindness need not conceal a fight. |
| A maintenance mark | A station passage has an old waterline and a newer note identifying the last checked exit. | Inspect the route, take a known alternative or withdraw. Present the hazard decision in the timeline before applying its consequences. |

Example Chinese tone: “组屋里，其中一个锁着的房间传来声音。对方问的不是你是谁，是楼下还下不下雨。”
Another: “收音机里的声音念错了街名，又重新念了一遍。你把它记下来。这次有人在说话。”
Use the second only for a genuinely live contact, never as decoration on a prerecorded loop.

#### Real-world grounding

References checked **19 November 2026**. They establish the real setting; the collapse,
survivor conditions and relief operations above are fictional extrapolations.

- Singapore imports more than 90% of its food; [MSE's food policy overview](https://www.mse.gov.sg/policies/food/)
  supports the supply-chain dependency, not an exact post-collapse starvation timetable.
- [PUB's Singapore Water Story](https://www.pub.gov.sg/Public/WaterLoop/OurWaterStory) describes
  local catchment, imported water, NEWater and desalinated water. Abundant rainfall should not
  be confused with an automatically functioning supply of treated water.
- [Meteorological Service Singapore's climate overview](https://www.weather.gov.sg/climate-climate-of-singapore/)
  documents the year-round heat, humidity and rainfall underlying the environmental tone.
- [NHB's account of void decks](https://www.nhb.gov.sg/~/media/nhb/files/resources/publications/ebooks/nhb_ebook_void_decks.pdf)
  describes their shared social uses and shelter. Their fictional abandonment gains meaning
  from those everyday functions.
- [UNESCO's account of Singapore hawker culture](https://ich.unesco.org/en/RL/hawker-culture-in-singapore-community-dining-and-culinary-practices-in-a-multicultural-urban-context-01568)
  supports the role of hawker centres as multicultural community dining spaces.
- [MOT's statement on the 2017 tunnel flooding incident](https://www.mot.gov.sg/news-resources/newsroom/ministerial-statement-by-minister-khaw-boon-wan-on-7-october-tunnel-flooding-incident/)
  documents the importance of pump-system maintenance. It supports locally grounded tunnel
  hazards, not an assumption that every station floods after a fixed period.

---

## 2. Core Gameplay Loop

```
Pick a role (story + starting kit) → build traits from empty → Choose a real SG spawn (density-checked) →
  [ read the map: "?" blips inside your travelable range → trek BLIND across open ground →
    arrive (pre-scavenge event / faction gate may fire) → search session → maybe fight →
    optional HDB dive or tunnel run → haul loot into the grid → cache surplus in the stash →
    craft / repair / trade at a hub → eat / drink / treat wounds / rest under site conditions →
    watch the evac beacon & nearby activity ]
  repeat until death or successful extract → score → local board + worldwide honor board
```

There is no fixed "turn": every action consumes a number of **in-game hours**. Time is the central
currency, and the survivor is always moving — the map is explored, not surveyed.

---

## 3. Systems

### 3.1 World generation (real locations)
- In the 3D street view, explorable buildings show their destruction tier. Ordinary buildings
  also show the damage to the city. A tarp, stacked supplies or pale cooking smoke at a nearby
  site can hint at faction occupation before the survivor learns who holds it.
- Real locations come from **OpenStreetMap**, pre-baked into `public/pois.json` by a **manual**
  commit step (`npm run bake:pois` — not part of `npm run build`) rather than queried per run. On spawn
  the game loads that static file once and filters it to POIs within ~1.5 km. Shops/amenities carry full
  geometry (`out geom`, for outlines); HDB blocks are centroids only (`out center`, kept light).
- Data sources degrade in order: **baked file → live Overpass → retry notice**. Never invent
  real-world buildings when both fail. Baking removes
  the per-run dependency on a volunteer-run API that rate-limits by IP — a static file on the CDN
  can't throttle, works offline once cached, and returns in milliseconds.
- Each element is classified into a **category**; a **seeded RNG** assigns **size** (small/med/large),
  a **base danger (1–5)**, remaining searches, and a faction. A given seed reproduces the same world.
- Density is high (up to ~**220 locations**, incl. up to ~100 void decks) — fog of war means only the
  handful you've explored are ever drawn, so world size is decoupled from render cost.
- **Remote-spawn check:** fewer than 5 accepted real sites in range rejects the spawn with a
  notice. Sparse coverage can mean missing data as well as genuinely empty land. Generated
  stepping stones do not count; they are generic open-ground stops, never invented buildings.
- **HDB identity:** only OSM apartment/residential buildings whose pins match official HDB
  footprints may open HDB interiors. Condos, landed homes and community centres are not HDBs.
  Unverified sites are excluded conservatively. Older v7 saves keep their positions and stashes
  at exhausted open-ground stops; invalid HDB interiors are discarded.
- **Walkability zones** (`public/zones.json`, `npm run bake:zones`): land mask, inland water,
  restricted (military) perimeters, and vegetation. Water and restricted hard-block spawn/trek;
  vegetation stays walkable but adds time only. Routes prefer land paths around water.
  Real road and foot bridges (baked from OSM by `npm run bake:crossings`, plus the hand-placed
  Sentosa Gateway path) provide narrow walkable links over water in both directions; their full path determines travel time and recorded distance,
  while walking energy uses the direct distance between endpoints. Players
  can stop on the crossing and continue later. Nearby sea and restricted ground remain blocked
  (`game/route.ts`, `game/playable.ts`, `game/crossings.ts`, `game/vegetation.ts`).

**POI categories → real-life resources** (Singapore-flavoured):

Three curated landmarks — **Marina Bay Sands, ArtScience Museum and Supertree Grove** —
supplement the island bake. They use committed OSM footprints and the existing map's building
parts, with no imported 3D models. They obey normal fog, discovery, travel and street-scavenging
rules, and have priority within the same 220-site neighbourhood cap. Supertree Grove is outdoor
ground for rest; landmarks are not selected as guaranteed indoor spawn shelters.

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
| Residence | Mapped houses and apartments without an HDB match | Household supplies via street scavenging; no HDB interior | 2 |
| Eatery / food shop | Restaurants, cafes, bakeries | Food, drinks, kitchen supplies | 2 |
| Community site | Community clubs, libraries, places of worship, museums | Food, medical supplies, tools | 2 |
| Park / garden | Named parks, reserves, zoos and open-air attractions | Visitor belongings and light supplies; outdoor rest | 1 |
| Hawker centre | Food courts, markets | Food | 2 |
| MRT station | Rail / LRT stations | Way into the tunnels (see 3.8); light loot | 3 |
| Industrial | Warehouses, factories | Tools, fuel, materials | 3 |
| School | Schools, colleges | Canteen, sick bay, workshop; used as shelters | 3 |
| Landmark | Marina Bay Sands, ArtScience Museum, Supertree Grove | Visitor bags, water, snacks, basic supplies | 3 |
| Waypoint | Between-pin stops | Not a destination — whatever the road left behind | 2 |

### 3.2 Survivor — roles, attributes & traits
- **Roles** (`occupations.ts`, `occupationId` in saves) — eleven: Classic Survivor, Drifter,
  College Student, Personal Trainer, Soldier, Nurse, Food Vendor, Scavenger, Office Worker,
  Contractor, Fixer. A role is a **name, a story and a starting kit only** — no traits, no stats.
  Every run has one; the create screen selects **Classic Survivor** by default. Stories and kits
  are set months after the outbreak: worn gear, no fresh food, and every kit covers the legs.
  Classic Survivor carries the standard kit (the `startingItem` items: knife, jacket, jeans,
  sneakers, daypack, water). Drifter carries cloth wraps, jeans, flip-flops and a tote — no weapon,
  no water. The copy never labels a role as hard or easy. Scavenger adds one seeded pocket find.
- **Starting kit** — the role kit goes down first, then each trait adds **at most one** item
  (`TRAIT_KITS` in `startingKit.ts`). Traits that once granted a set keep one signature item.
  A trait wearable replaces the role item in that slot; a flaw item never displaces one; a
  two-handed weapon sends the off-hand item to the pack. *Go-Bag* and *Prepper* cost **1**.
  Pool picks roll off the run seed (role pool: fork `kit:role:<id>`).
- **Create screen** — step 1 picks the name and role (cards show the tagline and kit); step 2
  builds traits from **empty**. Picking a role never changes the traits, and loading a preset
  never changes the role.
- **Attributes** are **derived from traits** (base 5 each, clamped 1–12) — Strength, Dexterity,
  Endurance, Perception, Wits. There is no separate point-buy panel; traits *are* the build.
- **Traits** — budget starts at **0**. All negative traits are **flaws** and *refund* points;
  positives *spend* them. Each side has one list, with no point-value tiers or trait-count caps.
  Pick any number of compatible traits, including multiple expensive positives, as long as
  remaining points stay ≥ 0. A trait cannot be picked twice. Theme filters and point sorting
  apply across the whole list. Existing costs, effects, conflicts and trait IDs are unchanged;
  saved builds and active runs need no migration.
- **Trait presets** persist across runs in `localStorage` so custom builds can be reused. They
  hold **traits only** and live on the traits step.
  Older builds with many flaws are valid if they satisfy the budget and conflict rules and
  contain no duplicates. Invalid presets still show “needs fixing” on the create screen.
- Trait modifiers feed combat, travel, survival, loot, fog, crafting cost, faction standing, and
  unique rules (first hit halved, hawker-centre loot, HDB corridor reads, remaining-search intel).
- **Local Contacts** (2-point positive, People): start knowing one hub from each of two distinct
  factions, chosen deterministically from the run's existing outposts. Grants map knowledge only,
  with no standing bonus. If fewer than two factions have hubs, reveal only those available.

### 3.2b Skills (in-run, passive) — switched off

> **Currently disabled** (`SKILLS_ENABLED = false` in `src/game/featureFlags.ts`). The layer
> added little to a run and pushed play towards grinding XP. While off: every survivor stays at
> level 0 in every skill (so skills add no mods), practice and books grant no XP, skill books
> are filtered out of the loot tables, and the Skills panel, create-screen preview, guide page
> and co-op Skills tab are hidden. Traits keep their own `*Mod` fields, so they still work;
> their `skillStart` / `skillXpMult` values do nothing. The rules below describe the layer for
> when it is switched back on.

- Seven **passive** skills sit between traits and mechanical mods: Fighting, Shooting,
  Fitness, Scavenging, Medicine, Trades, Stealth. Levels run **0–5** and **die with the run**.
- **Soft funnel:** traits keep their `*Mod` fields and also grant `skillStart` / `skillXpMult`.
  Higher-cost traits often start at **+2** in their lane. Final mod = traits + skill levels + gear.
- **Growth:** meaningful actions grant practice XP (soft daily cap per skill). Looted
  **skill books** cost hours to read and grant a big XP chunk or one gated level by tier.
- Awareness / dialogue / fog stay on traits and attributes — not a skill in v1.
- Run schema is `singvive.run.v7` (v6 continues are wiped).

### 3.3 Fog of war — local knowledge
- Locations begin **unknown**; the evac beacon is broadcast and
  Local Contacts grants its two starting hub pins. Undiscovered places show only as
  anonymous **"?" blips** (no name, category or danger). Their **building outline is still drawn** (in
  neutral) if OSM has one; locations without an outline are just their circular badge.
- **Identified is not visited.** Nearby recognition, search clues and public maps reveal a
  site's name/category without danger, ownership, ruin, search charges or supplies. Identified
  pins remain neutral and do not clear explored fog or count as visits. Existing specialist
  faction intel retains its separate last-known information.
- **Recognition on arrival.** At spawn and completed surface/tunnel arrivals, Perception plus
  awareness equipment/traits (less head-injury penalties) identifies obvious nearby exterior
  sites. Base radius is `clamp(20 + awareness × 3, 20, 60)` metres: 35 m at awareness 5.
  Existing night sight reduces it; rain ×0.75, haze ×0.6, thunderstorm ×0.5 reduce it further.
  Nearby shop signs (including clinics, pharmacies, convenience shops, hardware and eateries)
  are eligible. Distance uses the nearest building edge where available, with a hard 60 m
  limit to the site's pin. Known footprints block intervening/embedded sites from outside;
  a shared footprint does not hide neighbours once inside. Absent geometry uses an
  exterior-category approximation, not complete line of sight. Waiting and camera movement
  never roll discoveries. The travel ring is unchanged.
  Newly recognized pins pulse briefly alongside a small count notice; reduced-motion
  players get a static ring. This cue lasts about four seconds, never moves the camera,
  and is not saved or replayed when continuing a run.
- **Local leads.** A site's first completed street search has a seeded 35% chance to yield one
  nearby lead (within 800 m), including a completed empty search. Aborted searches grant none.
  Leads prefer useful facilities and survival destinations, exclude visited/known sites and
  evac, and are fixed per source. Repeated searches cannot reroll a spent clue opportunity.
- **Singapore information sources.** Every MRT platform offers a locality map; HDB void decks
  and community centres offer residents' noticeboards. Reading costs five game minutes, once
  per site. MRT maps identify up to three public destinations within 400 m without facility
  availability. A residents' noticeboard names 5–12 nearby places at once (seeded per board,
  within 800 m, widening to 1.2 / 1.6 km on thin streets; useful facilities and survival shops
  first, nearer before farther), identity only; the most useful one also becomes a lead while the
  logbook has room. Reading does not grant live conditions, clear fog or bypass travel. A full
  logbook leaves an MRT map unread; a noticeboard still names places, just adds no lead.
- **Reveal tour.** After a board or map names places, the guide takes the camera: it frames all
  of them in one shot and every place's ring and name card pops at the same moment (cards pick a
  free side of their pin), holds for 2.5 s + 0.25 s per place, then returns to where you were.
  Skip any time (Skip, Esc); Next, a tap, Enter, Space or → ends it early. Reduced motion cuts
  instead of flying. A fight, event or new trek cancels the tour.
- **Logbook mini objectives.** Keep up to six active leads and 24 total active/completed entries.
  Each records its source, destination and day, with reported facilities labelled as unverified.
  Physical arrival marks a lead visited, with no score or loot bonus. **Show on map** closes the
  panel, opens the phone map when needed, and zooms to the destination without travelling.
- **Useful local facilities.** Eligible unoccupied sites have a seeded 30% chance of one
  category-appropriate facility on their first visit: two clean-water portions, rain shelter,
  or an unlit stove requiring normal fuel. Existing crafting/collection/rest rules apply.
  Revisits, reloads and ownership changes never replenish or reroll this opportunity. The
  logbook remembers facility types, not remote stock or heat. Faction sites grant no free public
  facilities through this system.
- The single, dashed on-map ring is **current affordable walking range**: remaining energy
  divided by the survivor's energy cost per metre. Energy uses **straight-line distance**;
  actual routes, terrain and weather determine time. Average stats, healthy legs, neutral hydration
  and no load penalty cost **0.1 energy/metre** (100 energy = 1 km). END/DEX, leg injuries,
  equipment, traits, fitness, hydration, torso injuries and load modify that rate consistently
  in the map, cards and travel actions. Pinned survivors have zero range. There is no flat
  crossing fee or minimum 5-energy gate; fractional costs remain fractional, including short hops.
  Travel time and fitness practice also retain fractions, so short hops cannot stop the clock
  or farm a minimum XP payout per move (ground picks under 1 m are ignored).
  The perimeter is affordable and may leave zero energy, with an **arrive exhausted** warning.
  Cards show walking energy and the remaining budget; encounters may cost extra. A valid dry
  route is still required. The ring shrinks as energy is spent and expands as it is recovered.
  The ring is planning only: it may run past the fog edge into ground you cannot see.
- The live fog disc is **sight**, not travel: `sightRadius` in `src/game/nightSight.ts`.
  450 m in clear daylight for awareness 5, ±40 m per awareness point (Perception, gear, traits,
  head wounds), cut by daytime haze (×0.7), storms (×0.75) and rain (×0.85), and after dark by
  the same `sightFactor` that drives the night veil (light, cloud, torch, Night Owl), scaled as
  0.35 + 0.65 × sight so pitch dark keeps about a third of daylight sight (~220 m unlit at night,
  ~360 m with a torch). The same radius bounds the "?" blips, sensed hazard pockets and the veil.
  Clamped to 90–700 m. Energy never moves it. Sight opens the fog and raises 3D buildings;
  buildings fall outside it, including previously visited sites. Discovered location markers
  remain at ground level outside it. During travel the disc follows the walking pin.
  **Perception/awareness**
  extends how far out you *sense* blips (never their identity).
- **Discover-on-visit → permanent memory.** Arriving charts a location forever as **last-known intel**
  (stale danger, faction, looted state). Because danger regenerates while you're away, old intel can
  be dangerously wrong — the card flags "intel may be stale".
- A near-black **fog** darkens everything you haven't lit up by visiting.
- **3D view** (setting *3D map*, on by default; the on-map **3D** button toggles it). The run map tilts
  and the real buildings stand — but only where you have been or can see now. Unexplored blocks
  lie flat under the fog, so the city rises as you chart it. A site's own building takes its state
  colour (detected sites neutral, remembered ones dimmer, picked-clean darker). Known faction
  territory uses the faction's colour, kept legible even after looting; badges use a lighter faction
  fill behind a dark category icon, so sites without a model show ownership too. Tap a building or
  badge to select the site: a separate pale ring surrounds its badge in both 2D and 3D, without
  recolouring the model. Turn it off for a flat,
  north-up map on slower phones. The spawn screen and route planner are always flat.

### 3.4 Time, travel, wilds & the day/night cycle
- A day is **24 in-game hours**, starting at **08:00**. Travel is **one-way relocation** (nomadic):
  the survivor has a tracked position, and time = land-route distance(current → target) ÷ walking speed,
  stretched by a **×2 surface detour allowance** for navigating city blocks, rubble and crossings,
  **weather** (rain ×1.5, thunderstorm ×1.75), a **graduated load tax** (quiet until capacity, brutal
  past it — hover the carry bar), and vegetation time costs. Surface walking energy is quoted
  from direct distance and departure condition, then charged once. The travel clock (including
  crossing delays) advances hunger, thirst, injuries and world events **without passive energy
  drain**. Terrain and detours add no energy surcharge; combat and explicit encounter outcomes
  may still spend energy. Recorded distance uses the walked route. Tunnel walking retains its
  separate time-based costs. A fresh END/DEX 5 survivor with healthy legs and no load penalty takes about
  **10 minutes per 500 m** on clear, non-vegetated ground. The map glide remains brief.
- **Weather drain** (`game/weather.ts`): passive thirst and energy drain run faster on two kinds
  of day. Heat wave: thirst ×1.9, energy ×1.25. Haze: thirst ×2.1, energy ×1.4 — the hardest day
  on water and legs, with no change to encounter odds.
- **Open-ground treks** (`game/wilds.ts`): between pins the path crosses seeded ~350 m hazard
  pockets (overlapping discs: horde, patrol, collapse, flood, wildlife). POI travel cards preview
  sensed pockets on the route. Each distinct zone on a surface route first rolls a **slip-past check**
  (`rollHazardChecks`): d20 + the fitting attribute (DEX collapse, END floodwater, WITS patrol, PER
  horde / wildlife / swarm) + trait check bonus vs DC 8 + 3 × severity (+3 night swarm). Starting
  inside a zone and leaving it is an **exit check** at −2 DC; moving within the zone you stand in asks
  nothing. Natural 20 passes, natural 1 fails. Passed zones are slipped past with no consequence and
  drop out of the route's encounter price; the roll is seeded per target and hour, so retrying the
  same walk in the same hour does not reroll. Zones that catch the survivor are crossed directly, with
  no prompt: the timeline names them, then the walk applies its energy, time, injury, exposure and
  interception results. The route label's fight chance weighs every pass / fail outcome of these
  checks by its exact d20 odds for the current survivor. Even a severe
  collapse allows a natural-20 success instead of an unconditional failure.
- **Sealed-off areas** (`game/hazardSites.ts`, `public/hazard-areas.json`). When a hazard cell holds
  a block-sized OpenStreetMap area (an estate, park, school grounds, campus, hospital, commercial or
  industrial block, roughly 120–500 m across), the whole area is sealed off along its real outline,
  Dark-Zone style, with a hard edge: quarantined school, overrun estate, infested park. These cells
  spawn 1.9× as often, which keeps the share of dangerous town ground at ~15%.
- **Hazards on real places** (`game/hazardSites.ts`). Otherwise, when a hazard cell holds a real campus,
  hawker centre, station, police post, store, works or HDB block (`public/hazard-sites.json`), the
  pocket settles on that place instead: its footprint plus a 50–90 m perimeter by severity, named
  for what went wrong (quarantined school, flooded market, barricaded police post, overrun blocks).
  The theme picks the kind, so mechanics stay the five pocket kinds. These cells spawn 1.8× as
  often, which keeps the share of dangerous town ground where the disc pockets had it (~15%).
  Cells with no eligible place keep disc pockets. Collapse wounds; flood slows and can infect; horde/patrol/wildlife
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
  - **Crippled** limbs (0 HP) remain impaired during recovery; care supports recovery without an obligatory treatment sequence.
  - **Passive regen** when stable — but **major bleeding blocks regen** until you bandage it.
- **Wound care:** treatment stabilizes, time heals. Bruises, cuts and deep wounds recover at different rates. Dirty wounds still heal, at 65% of their clean rate; cleaning is optional and independent of dressing. Hunger, hydration, sleep conditions and Medicine/medical traits influence recovery. No medical item grants instant limb HP.
  - **Bandage / plasters:** dress the chosen part and stop its bleeding (3 minutes). Cleaning is not a prerequisite. An improvised dressing controls bleeding but leaves the wound dirty and the dressing soiled; repeating it after bleeding stops provides no benefit and does not spend supplies.
  - **Antiseptic:** clean the chosen wound (5 minutes), without stopping bleeding or changing systemic infection.
  - **Painkillers / Tiger Balm:** temporary relief on the chosen part (1 minute, 4 game hours of relief); ease soft-tissue functional penalties without restoring HP or removing structural injuries.
  - **Splint:** support a fracture (10 minutes); it still heals gradually. Unsupported fractures also recover, more slowly. Baseline fracture recovery is 72 supported equivalent hours, modified by recovery conditions.
  - **First-aid kit:** three targeted care charges; each cleans, dresses, relieves pain and supports a fracture on one part (8 minutes). The smaller **IFAK pouch** provides one such treatment. No instant HP gain or fracture cure.
  - **Vitamin C:** optional recovery support (1 minute), giving currently injured parts 25% faster gradual recovery for 8 game hours. Existing support does not stack or refresh. This is a gameplay abstraction, not an instant heal.
  - **Dressings:** clean dressings modestly support recovery; after 12 game hours they become soiled and slow recovery. Replacement is optional. New trauma can soil the dressing and reopen a wound. No recurring random bleed simply for skipping maintenance.
  - **Antibiotics / Po Chai Pills:** retain their separate systemic infection effects. Antibiotics also clear infected wounds and cover every part against wound infection for 24 game hours.
  - **Open wounds hold back max HP:** a cut holds back 12% and a deep wound 25% of that part's max HP until it closes. Closing takes 12 (cut) / 36 (deep) recovery hours at the dressed, clean rate; no dressing ×0.55, soiled ×0.8, dirty ×0.8. Once closed the rest heals as a bruise. The health bar shows the held-back share hatched.
  - **Wound infection:** each full day a cut/deep wound stays open it is checked: 50% if dirty and undressed, 30% if dressed but dirty, 8% once cleaned; antibiotic cover ×0.2; deep ×1.2. An infected wound recovers and closes at 35% speed until antibiotics clear it. It is a local recovery penalty, not another lethal meter.
  - **Effects readout:** the Body panel lists each injured part's live costs (hit, block, dodge, travel, search, awareness, energy, carry, max HP, recovery), and the contact card in the timeline repeats them before Fight / Flee.
  - **Interface:** the existing Body panel shows injuries and independent care actions without an inspection step. The medical silhouette retains wound marks, dressings and splints; treatment briefly highlights the affected part. Healthy parts stay quiet. Inventory use selects an eligible part automatically; Body actions target explicitly. Care spends game time and carried/accessible supplies, and is unavailable during combat, travel or an unresolved action.
- **Teaching:** How-to-play includes a **Body** topic; first meaningful injury shows a one-shot coach
  (settings flag `limbCoachSeen`).
- Death causes: overwhelmed (HP 0), starvation, dehydration, infection, fatal head/torso wound.
  Survival is open-ended: supplies, injuries, local threats and night danger continue to matter.

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
- **Fists:** with no usable main-hand weapon (including "Fists (X broken)") a hit starts from base
  damage **6**, then the final damage is multiplied by the target's `unarmedMult` (rounded,
  minimum 1). A missing value is **0.5**. Shamblers, crawlers, walkers, rats, cats, macaques and
  loner survivors/touts take full damage (1); scavengers 0.8; otters and dogs 0.7; runners 0.6; bloaters, lurchers and monitors 0.5;
  rioters, boars and raiders 0.4; brutes 0.3; abominations 0.25; hulks and stalkers 0.15. Bare
  hands work against the weak and fail against the strong. Off-hand weapons and a dry gun used
  as a club are not fists.

### 3.7 Events, factions & trade
Four factions hold territory (seeded by category), with a **standing ladder** (−5…+5) that gates
hostility, trade, shelter, aid, and intel:

| Id | Name | Flavour |
|---|---|---|
| `muster` | The Citizen Watch | Extra-legal NS militia — police / school (not hospitals) |
| `gotong` | Kampung Kitchen | Civilian mutual aid — hawker / supermarket |
| `syndicate_88` | The 88 Gang (双八帮) | Hostile by default until known; void-deck muscle |
| `sta` | Tunnel Wardens | Manned MRT platforms; tunnel tolls |

- Each run creates up to **two outposts per faction** (`OUTPOSTS_PER_FACTION`, preferred categories,
  spaced apart). Players start with **no faction hub knowledge** by default; hubs are labelled only
  after discovery or intel. **Local Contacts** reveals one hub per faction for two factions at spawn;
  other standing traits do not reveal hubs. Outposts offer that faction's **full kit** (canteen,
  fence, escort, tunnel camp — not a shared four-button shop); ordinary claimed territory gets a
  lesser subset, never the signature verb.
- **Door rules** (`gatePolicy`, seeded per site): **open** (anyone not feuding with them walks in), **fee** (tribute at the gate, or a job), **members** (standing only — Known +1 by default). Outposts are fixed: Kampung Kitchen open, Citizen Watch and Wardens fee, 88 Gang members. Old saves get a rule stamped on load.
- **Gate jobs** (`game/bounties.ts`): two seeded jobs per site per day, readable from outside the wire. Deliver (their wants), scout (set foot on a named site, pinned on your map) or cull (kills after taking it). Up to 3 jobs at once; hand in at any site of that faction for standing and an item from their stock. At a fee door the first job also counts as the fee (7-day pass). The logbook lists every faction's standing, known outposts and jobs in hand.
- On arrival, a **pre-scavenge event** may fire (`game/events.ts`, pure). Abandoned notices,
  caches, scattered belongings, damaged access and weather carry most unclaimed-site scenes.
  Concealed survivors and traders have low selection weights and require effective danger <4,
  doorway threat <0.65 and local pressure <0.75. Faction contact remains at occupied sites.
  Checks are `d20 + attribute vs DC(current danger)`. Aid/refusal ends the exchange peacefully;
  one locked interior storeroom does not block the rest of the site. A separate timeline line
  announces subsequent searching, so a search encounter is not presented as punishment for aid.
- **Barter** (`game/trade.ts`): no currency — seeded daily chalk-board swaps at faction hubs. Standing
  grows board size and unlocks better lines; each offer is take-it-or-leave-it and one-shot for the day.
  Hubs may also offer rest, aid, or intel once standing is high enough.

### 3.8 The tunnels (Tunnel Wardens)
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
  (milder than overland) and retains time-based energy drain, so the MRT is not a dump exploit.
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
- **Stations are exits.** Wardens **toll** still gates the *stairs down* at the origin only; marshals
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
- Every item needs a practical use: consumption, equipment, bedding, an implemented action,
  or a crafting ingredient/tool. A price alone does not count. Item inspection lists crafting uses;
  catalog tests reject unused items. Recipes live in `game/data/recipes.json`.
- Some recipes need a **workbench** (stash / HDB shelter); tools are kept. Existing field weapons,
  dressings, armour, repair and sleeping-bag recipes remain.
- **Location facilities:** build a fire from firewood and tinder with a lighter, or build a fixed stove
  from scrap and parts with a toolbox and fuel it with a jerry can. Heat lasts **24 in-game hours from
  completion**, including travel and sleep. Facilities stay at the surface location, never in the pack.
  Active fires cannot be stacked; spent fires can be rebuilt. Indoor HDB/tunnel construction is excluded.
  Cooking needs enough heat to finish and a carried, reusable **cooking pot**.
- **Water and meals:** boiling consumes two carried waters (clean sources first, mixed sources allowed)
  and leaves two treated waters at the site. The batch stays hot for **2 game hours**, then remains clean.
  Use it in recipes or collect it as ordinary clean water. A hot batch can finish a recipe without an
  active fire if it remains hot throughout; cooled water needs reheating. Direct cooking includes heating
  its carried water. Dry noodles restore hunger only; cooked soup, sardine/luncheon noodles, rice porridge
  and sardine porridge require heat. Prepared meals spoil and do not appear in ordinary loot.
- **Drinks:** portion coffee, condensed/evaporated milk and Milo into measures; a tin yields eight measures.
  Kopi/teh families vary milk, sweetness and strength, with additional Milo and sachet drinks. Kopi-C uses
  evaporated milk. **Hot preparation gives full effects; room-temperature mixing halves hunger and energy
  restoration, but preserves hydration and unsafe-water infection risk.** Preparation quality persists on
  the item independently of spoilage; brewed drinks keep their quality after cooling. Iced drinks await
  an actual ice source. Food/drink, portioning and salvage quantities are fixed, without trait discounts.
- **Rain facilities:** a collector requires tarp, bindings and a container (or bottles). Every three rainy
  game hours adds one untreated water, capped at four, including days spent away. Collection preserves
  fractional progress. A rain shelter gives open surface sites a roof, improving sleep recovery without
  reducing ambush risk. Both are permanent location improvements.
- **Everyday gear and salvage:** sacrifice a pot for a helmet, towels for padding or a sling bag, and magazines
  for shin guards or tinder. Powerbanks yield cells, bicycle kits yield parts, cables make straps/lamps,
  repellent treats bedding, and paper tokens become tinder. Gear has modest benefits and material tradeoffs.
- **Repair:** field whetstone / gun oil; workbench repair with duct tape + scrap + toolbox.
- Crafting is a **loot sink** first — scrap and tape have somewhere to go; clean water is made, not found.

### 3.14 HDB dungeons
- Void decks open the block as a **stack of landing strips** (`game/hdbDungeon.ts`,
  `components/HdbLevelStrips.tsx`): one strip per open landing, top storey first, each with its
  own **heat** meter and its rooms. Click a strip to take the stairs there; click a room on your
  own strip to open its action card (Force / Pick / search / rest / read / service). Room tiles
  show the type (search, hazard, burn, fight, rest, intel, service), boarded ✕, cleared ·, and a
  dot when either sense read intel from the corridor. Most loot doors must be Forced or
  Picked (lockpick, consumed). There is no maze: no corridor blockades, no walking pin.
- **Corridor scouting.** First arrival plays the actual Perception and Dexterity percentile
  checks inside each available, unexplored room tile, then reveals the room face. Hover a room
  to inspect those rolls while on that landing. Revisited rooms do not reroll; Dice FX off and
  reduced motion show the resolved intel immediately. Playback changes no game time or odds.
- **Heat is per landing.** What you do on a landing heats that landing (`addHeat`); loud acts
  **spill** a share to the open landings directly above and below — door force 0, barricade
  0.35, trap 0.25, fight end 0.5, roof hatch 0.5. A landing's heat band drives its encounter
  odds, room threat (`floorThreat`, +1 in the top third once Awake) and descent DC
  (`8 + 2 × dcStep`). Max heat is **danger only**: a Swarm landing ambushes doors and anyone who
  crosses it (80% elite), never a forced move. Landings you are not on **cool 5 heat/hour**
  (`coolLevels`, run from `advanceTime`); re-entering a block halves every landing.
  `blockHeat` is kept as the peak (`peakHeat`) for the scar, the site card and the exit leak.
  The block header stays compact; hover or focus a strip's heat meter for its effects, descent
  check and next threshold (long-press on touch).
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
  safe stairs, rest drops heat). Revealed on arrival with a log line; the theme sits above the
  floor number on the left of its strip.
- **The block on the map.** Desktop with 3D on: the strips sit over the map beside the tower,
  each with a notch pointing at it. The wider corridor strips use large door tiles and floor
  numbers, and keep the current landing visible when taking the stairs. The camera fits the
  whole building into the space beside them, orbiting its centre (and eases back out on exit).
  Every other building ghosts so the block reads through
  the estate. Drag the empty map beside the tower to turn and tilt the camera around it; scroll
  to zoom, or use the zoom and **Frame building** controls. The timeline remains available for
  looting and combat. An amber **storey band** on the extrusion marks your landing and follows strip hover.
  Phone or 2D: the same strips as a full-screen list, the action card below.
- **The block remembers.** `hdbScar` reads the persisted dungeon: worked blocks dim on the 3D map
  in quarter-steps, the site card shows doors cleared · storeys sealed · hunting. Leaving while
  any landing is at **Swarm** leaks a noise pulse (350 m) into the street.
  **Leave only from level 01.** Estate vs shelter archetypes change holdout rates.
- **Saves.** Blocks carry `v: 2`. A maze-era block is converted on load (`migrateHdbDungeon`):
  doors, per-landing heat and fobs carry over, the stair geometry is dropped, you re-enter on 01,
  and an opened roof gate becomes an open hatch. Run key stays `singvive.run.v7`.

### 3.15 Noise & nearby activity
- Actions emit visual **noise pulses** (`game/noise.ts`) and persistent local attention
  (`game/activity.ts`). They do not also boost POI `tempDangerBoost`; legacy boosts still decay.
  Combat and HDB entries are noisy; quiet traits help.
- **Local pressure** (`game/activity.ts`) combines a stable **0.42 baseline** with nearby persistent
  noise sources. Sources are spatial, capped at **32**, and fade over **6 in-game hours**. Moving
  away or waiting changes exposure; the passage of days does not raise an island-wide doom meter.
- The three bands are **Quiet / Stirred / Hunting**. A small icon beside the weather shows local activity, with a brief pulse only when its band rises (respecting reduced motion). Its tooltip explains the state and cause; clicking opens the latest nearby event in the timeline. HDB
  interiors and tunnels retain their existing danger and noise rules.
- **Street incidents:** a recently powered alarm, loose shutters, distant gunfire and rare
  concealed scavengers. Exposed/noisy locations suppress friendly contact. Seeded event memory
  requires **250 m of accumulated movement**, arrival **250 m from the previous attempt's anchor**,
  and **2 in-game hours** between attempts, with at most **3 incidents per day**. Failed rolls
  consume the cooldown too. An incident's decision window lasts **1.5 in-game hours**. Sources and scheduling memory
  survive reloads in the existing **v7** save; old v7 runs initialize the new state safely.
- Responses are available only on the **surface within 120 m** of the source:

  | Incident | Response cost | Result |
  |---|---|---|
  | Alarm / shutter | 15 minutes, 4 energy | Quiet the source to 45% residual strength. |
  | Gunfire | 20 minutes, 5 energy | Recover 2 scrap; the investigation makes a small noise. |
  | Scavengers | 10 minutes, 1 carried, uncontaminated bottled water (`water_bottle` or `newater`) | Learn the nearest unknown site within 1 km; receive 1 scrap if none is available. |

  Optional incidents use the existing timeline event-card layout with costs and choices. Completed and expired cards remain in history; choices never block travel. Live choices remain reachable in Latest mode and across midnight.

  Each completed response reduces its source to **45%** residual strength; gunfire also adds the
  small investigation noise. Dismissing an incident closes the choice; it does **not** erase its noise source. The source
  continues to fade even after its decision window closes.

### 3.16 Extraction goal & open-ended survival

A run starts with a current operation's destination, remaining window and contact procedure
already recorded in Objectives and the timeline. The survivor received the broadcast before
setting out. A receiver, random clue or lucky NPC encounter is never an admission requirement.
Knowing the destination does not reveal the intervening streets or their supplies.

The loop is **receive the notice → prepare supplies and choose a route → reach the assembly
point → report to the crew → board**.

- **Published, free admission.** Report and board are two explicit, immediate actions at the
  active site. Both must happen before the displayed window ends. Neither action spends time,
  items or cargo value, and there is no hidden refusal roll. Combat, an unresolved event/search/
  crossing, active travel or an interior run must finish before contact or boarding.
- **Known map destination.** Objectives includes “Locate next known evacuation point”. It opens
  the map, closes the sheet and focuses the active published site on desktop and phone. It does
  not move the survivor, reveal surrounding sites or spend time. Between operations it is disabled.
- **Supplies support the journey.** Food, water, medicine and equipment remain valuable because
  travel and encounters consume them; the crew does not price a human life by backpack contents.
  Route notes and shelter information improve planning but never gate the main objective.
- **Reachable generation.** The first selection prefers named MRT, school or police sites at least
  8 km away from the prefetched evacuation metadata. Check all candidates for straight land
  access, then at most three detours using deterministic expansion limits. If needed, select a reachable
  already-built site, even nearer; never advertise a known disconnected destination. Later
  operations also validate routes from the current position without rescanning the island bake.
- **Time allowance.** Base windows are 96 hours for the first operation and 48 for subsequent
  operations, shrinking by 4 hours per day after Day 3. Route allowance always wins if larger:
  3 hours per rounded-up routed kilometre plus 24 hours for rest and resupply. This is generation
  fairness, not a guarantee that every detour or delay succeeds.
- **Missed operations.** Expiry clears the operation and contact, and publishes a seeded 10–30 hour
  countdown to the next update. The new point and window arrive automatically in Objectives and
  the timeline. If the bounded search finds no reachable site, another update is scheduled 12 hours later.
  Waiting for an update does not require random information drops or promise a waiting aircraft.
- **Persistence.** The existing v7 slot saves current contact and the cooldown. Legacy cargo demand,
  preference and manifest fields are ignored. Resume synchronizes expired windows and overdue
  updates without advancing the survivor's clock.
- **Dual-path scoring.** Staying alive raises the day multiplier (1.0 + 0.1 × (days − 1)). A
  successful extraction adds 2000 × dayMult on top of survival score.
- **No automatic ending or gameplay day cap.** There is no advancing island front or automatic
  overrun death. Local noise, encounters, night danger, hunger, thirst and infection remain threats.

### 3.17 Ghost survivors
- Death writes a **legacy corpse** (`singvive.legacy_run`). A later run that walks within ~120 m can
  meet a mini-boss, loot the corpse, or find a one-shot trader — whatever became of them
  (`game/ghostSurvivor.ts`).

### 3.18 Sound
- **Procedural ambience** (`src/audio/ambience.ts`, Web Audio, no asset files). Beds: brown-noise
  wind (hollower after dark, a rumble in tunnels), rain by weather, a tropical night chorus that
  **goes quiet as local pressure rises**. One-shots: distant groans (rate and closeness rise with
  local pressure and darkness), daytime koel and crow calls, house-gecko chirps, unseen metal
  clanks, thunder, tunnel drips.
  Heartbeat below 40% HP. Stingers: a far-off civil-defence wail at nightfall, a dissonant hit on
  contact. Setting `sound` (off / quiet / full); audio starts on the first click (browser policy)
  and suspends while the tab is hidden. Purely cosmetic — nothing in `game/` reads it.

#### Audio sourcing list (proposed)

Use a hybrid palette: keep procedural wind, tension, heartbeat and stingers; audition recorded
sounds for natural ambience, creatures and physical actions. Aim for quiet, grounded Singapore
survival horror, with enough silence to hear danger. This is a sourcing plan, not an implemented
asset set. Source pages and listed licences checked **14 November 2026**; recordings have not
been auditioned or downloaded.

**Free sources to start with**

| Source | What to look for | Licence / selection notes |
|---|---|---|
| [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Soft clicks, confirm, cancel, denied action | 100 files; CC0. Audition restrained options. |
| [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | Blunt hits, metal and wood impacts, object handling | 130 files; CC0. Select small, dry sounds that can be layered. |
| [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) | Footsteps, weapon and inventory foley | 50 files; CC0. Check individual clips for a modern setting. |
| [Freesound](https://freesound.org/) | Rain, tropical wildlife, drips, creature vocals, equipment | Filter for CC0 first. Licences vary per upload; CC BY requires credit. Downloads require an account. See [licence guidance](https://freesound.org/help/faq/#licenses). |
| [Sonniss GameAudioGDC archive](https://sonniss.com/gameaudiogdc/) | Broader field recordings, weapons, machinery and horror textures | Free archive under its own licence, not CC0; the archive states commercial game use is allowed without attribution. Keep the supplied licence with chosen files. |

[CC0](https://creativecommons.org/publicdomain/zero/1.0/) allows copying, editing and commercial
use without asking permission. Prefer it for the first pass. Keep the creator, original file
name, source URL, licence and any edits recorded for every selected asset; an asset becomes
selected only after listening and checking its own licence.

**Sound checklist** — P1 is the first listening pass; P2 is a later polish pass. “Existing”
means an existing procedural cue to compare against; “new” means a proposed addition.
Durations and variant counts below are targets for edited game clips.

| Priority | Sound / use | Target | Starting point or search terms |
|---|---|---|---|
| P1 | Rain and heavy rain — existing weather bed | 2 seamless loops, 30–60 s each | Freesound: `tropical rain`, `heavy rain no thunder`; keep thunder separate for timing. |
| P1 | Tropical night insects — existing bed | 1–2 loops, 30–60 s | Freesound: `tropical crickets night`; preserve the hush as local pressure rises. |
| P1 | Asian koel, house crow, house gecko — existing wildlife | 3–5 short calls per species | Freesound: `Asian koel`, `house crow`, `house gecko`; isolated calls rather than busy streets. |
| P1 | Infected groans — existing distant threat | 4–6 one-shots, 1–4 s | Freesound / Sonniss: `zombie groan`, `creature breathing`; avoid intelligible speech. |
| P1 | Footsteps — new travel feedback | 4–6 steps per concrete, grass and wet surface | Kenney RPG Audio; Freesound: `footsteps concrete`, `wet footsteps`. |
| P1 | Melee swing, hit and miss — new combat feedback | 3–4 variants per action, under 1 s | Kenney Impact Sounds / RPG Audio; `blunt impact`, `cloth whoosh`. |
| P1 | Search and loot pickup — new action feedback | 2–3 variants, 0.3–1.5 s | RPG Audio / Freesound: `bag rummage`, `cloth rustle`, `item pickup`. |
| P1 | UI select, confirm, cancel and denied — new interface feedback | 1 distinct clip per cue, 0.05–0.25 s | Kenney Interface Sounds or original synthesis; quiet and brief. |
| P2 | Distant thunder — existing storm one-shot | 3–4 rolls, 4–10 s | Freesound: `distant thunder isolated`; preserve lightning timing. |
| P2 | Metal clank — existing unseen activity | 3–4 clips, 0.3–2 s | Kenney Impact Sounds / Freesound: `metal clank distant`. |
| P2 | Tunnel drips — existing underground detail | 3–5 dry drops, 0.2–1 s | Freesound: `water drip single`; add room echo in the mix. |
| P2 | Tunnel air / rumble — existing bed | Keep synthesis; optionally audition a 30–60 s loop | Freesound / Sonniss: `empty tunnel ambience`, `ventilation rumble`. |
| P2 | Heartbeat — existing low-HP cue | Keep original two-pulse synthesis | Retain variable tempo as HP falls. |
| P2 | Nightfall siren and combat contact — existing stingers | Keep synthesis; refine 1 cue each | Original distant warning tone and short dissonant contact hit. |
| P2 | Gunshot, reload and empty click — new combat feedback | 2–4 shots plus handling cues per supported weapon family | Freesound / Sonniss: `pistol single shot`, `reload`, `dry fire`. |
| P2 | Injury, bandage, eating and drinking — new survival feedback | 2–3 variants per action, 0.5–2 s | Freesound: `pain grunt`, `bandage cloth`, `eating`, `water gulp`. |
| P2 | Door, drawer, shutter and locked attempt — new exploration feedback | 2 variants per action, 0.3–2 s | RPG Audio / Freesound: `door creak`, `drawer open`, `metal shutter`. |
| P2 | Equip, craft and trade — new inventory feedback | 1–2 clips per action, 0.2–1 s | RPG Audio / Impact Sounds; `tool handling`, `bag zip`, `small metal click`. |
| P2 | Extraction available, extraction success and death — new run milestones | 3 distinct cues, 1–5 s | Original synthesis first; restrained radio chime, relief tone and low fade. |
| P2 | Menu atmosphere — optional music | 1 sparse loop, 45–90 s | Original ambient composition or a separately verified free track; leave gameplay music optional. |

**Concrete rain candidates to audition:**
- [Tropical Rain - moderate — nyoz](https://freesound.org/people/nyoz/sounds/614203/)
  (CC0, 61.5 s): a garden recording from Reunion Island; candidate for the rain bed.
- [Rain very heavy with thunder.wav — Danjocross](https://freesound.org/people/Danjocross/sounds/164206/)
  (CC0, 122.8 s): candidate for storm texture. Embedded thunder means the full recording should
  not be looped under independently timed lightning; audition thunder-free sections first.

For the first pass, compare the P1 candidates at matched volume before selecting files. Use
multiple variants for frequently repeated actions. Preserve the existing off / quiet / full
setting, hidden-tab suspension and pressure-driven ambience; sound remains cosmetic and every
important gameplay cue must also be visible.

### 3.19 Persistence, scoring & settings
- Fully **client-side** for the run. Keys:
  - `singvive.run.v7` — active run, including spatial activity sources and seeded event memory;
    existing v7 runs load without those optional fields and initialize them safely
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
  There is no 16-day score limit: elapsed-real-time plausibility and the **60-real-day** registration
  window bound submissions, alongside kill/loot ceilings and finite safe integer counters.
- **One tab per browser.** A second tab shows "Already open" until the first closes
  (`useSingleInstance`) — two tabs on one save could write a dead run back.
- **Score** = `(kills×25 + carried loot value + days×50) × dayMult` (+ optional `2000×dayMult` on
  extract). Permadeath clears the run; death still posts a score.

---

## 4. UI

- **Desktop — left rail + map + timeline:**
  - **Left survivor rail** (~408px): clock, weather, Rest (with sleep-quality preview), `ObjectiveBar`,
    nearby activity, `ConditionPanel` (meters + body), and panel buttons **Inventory / Craft / Logbook / Stats**.
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
  sheet. Nearby activity has a compact surface display. Contact, doorway events, and search
  sessions are interrupt cards; tabs stay usable.
- **Overlays / modals:** trader, contextual guide, how-to-play primer, settings, day logs, event modals, HDB dungeon, tunnel run,
  ghost encounter.

---

## 5. Roadmap / identity bets

The game is already **feature-rich**. Adding more Project Zomboid / Tarkov systems will make it
heavier, not more itself. Fun comes from making the **island** the opponent and **local knowledge**
the skill.

The loop (spawn → blind trek → search / HDB / MRT → pack Tetris → local activity / evac) is solid.
Local noise now gives movement and waiting concrete consequences. The next identity work is
**local knowledge**: *you know this city, it is tiny, water is a wall, and familiar routes can
save a life.*

### Double down (north star)

These are **design bets**, not a build queue. Build on the local activity choices in §3.15 and
the routes, supplies and landmarks that make Singapore specific.

1. **Local consequences worth routing around.** An alarm changes the nearby street for a while;
   helping scavengers can reveal a useful destination. Make those choices legible and let the
   player judge whether responding, waiting or taking another route is worth the cost.
2. **Local knowledge as the build.** Traits already gesture at this (*Estate Memory*, *Made Man*,
   Wardens). Make spawn + job change *what you remember*: MRT lines you can trust, which void decks are
   88, where Kampung Kitchen still cooks. A tourist run is fog; a resident run is a damaged mental map.
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

- **Vehicles** — fuel supports practical survival uses; faster/farther surface travel is a maybe.
- **Player-built street barricades** — HDB doors can already be barricaded as dungeon state; stash
  forts and street walls would fight the nomadic-cache identity.
- **Meta-unlock trees / accounts / daily seeds** — daily seeds are also deferred because the same
  seed is not the same run while spawn is player-chosen.
- **More meters and enemy tiers** remain deferred. Crafting additions should give existing loot a practical
  purpose or a meaningful preparation choice; variants share recipe families rather than new survival meters.

### Fun, practically

- Cut busywork so the unique beats breathe: keep travel cards and search grids quick to read while
  nearby activity gives the player a reason to choose a route or spend supplies.
- Faction **outposts** are already destinations — lean social geography (who still holds which block)
  before adding quests.
- **Balance** still matters: travel speed, meter/injury drain, danger regen, local noise, evac
  thresholds, loot rarity.
- **Tests:** Vitest covers combat, wilds, crafting, survival, events, inventory, firearms, and more
  under `src/game/` (+ catalog / i18n key guards). Still thin or missing: `goal`, `noise`,
  `searchSession`, and anything that only lives in `store.ts` / React.

### Trait ideas — proposed, not implemented

New traits should change a route, timing decision, or resource gamble. Keep the existing positive /
flaw economy; these ideas do not add another category or survival meter. Point costs need playtesting.

| Trait | Type | Proposed rule | The choice it creates |
|-------|------|---------------|-----------------------|
| **Spare Key** | Positive | Once per HDB block, open an ordinary locked residential door quietly without a lockpick. Special gates remain locked. | Spend the opening early for supplies, or save it for a more promising room deeper inside. |
| **Storm Chaser** | Positive | Rain further reduces the noise of your outdoor movement and HDB breaches, on top of normal weather effects. | Move while the city masks you, accepting rain's existing visibility and travel costs. |
| **Cache Runner** | Positive | Travel toward a visited stash containing your supplies uses less energy; the route still follows normal walkability and encounter rules. | Build a useful cache circuit, then decide whether local threats make returning worth the risk. |
| **Improviser** | Positive | Spend scrap for a temporary weapon patch that lasts one encounter. Each weapon can receive only one patch before a proper repair. | Burn a resource for one crucial fight or retreat with it intact; avoid an infinite repair loop. |
| **Claustrophobic** | Flaw | Energy drains faster during HDB interiors and MRT exploration, with the extra cost shown before entry. | Take the longer surface route or budget supplies for a short, valuable indoor expedition. |
| **Creature Comforts** | Flaw | Sleep restores less energy at exposed sites; enclosed shelter and friendly hubs retain their normal restoration. | Detour to safe lodging or accept a poor night's rest to conserve supplies and travel time. |

Prototype **Spare Key**, **Storm Chaser**, and **Claustrophobic** first: they give HDBs, weather,
and MRT route choices distinct build identities. Keep costs and remaining uses visible, and avoid
extra confirmation dialogs. New per-run state (such as spent keys or patched weapons) must load
safely from existing `singvive.run.v7` saves before these proposals ship.

### Shipped (was roadmap)

- Crafting & repair, faction barter + marked outposts, ammo + weapon condition, extraction and
  open-ended survival, persistent local noise and response events, HDB cutaways, search sessions,
  sleep quality, roles, in-game guide (en + zh-Hans), fill-the-track combat, worldwide
  honor board (D1) beside the personal local top-10.

### Known constraints

- Overpass has rate limits and latency → map data is pre-baked to a static file, so the live API is
  only touched by `npm run bake:pois` / `bake:mrt` / `bake:zones` and as a runtime POI fallback.
  Planning-area data comes from URA via `npm run bake:towns`. Baked data is a point-in-time
  snapshot: new shops in OSM won't appear until the next bake.
- Many Singapore shops are mapped as **point nodes**, not buildings, so not every POI has a drawable
  outline — those render as a category badge instead.
- The basemap is CARTO's Dark Matter **vector** style (keyless). The 3D view needs building heights
  from it; any replacement must carry them (OpenFreeMap Dark does, as `render_height`). OSM
  building heights are uneven — some blocks are missing heights or mapped as one tall mass.

