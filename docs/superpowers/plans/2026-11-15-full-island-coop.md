# Full-island Co-op Implementation Plan

> Execute using subagent-driven-development with one implementation worker at a time and parent-owned integration. The user approved implementation in this chat; do not ask for another execution choice.

**Goal:** Expand multiplayer onto Singapore with independent survivors and shared exploration, then integrate solo survival systems.

**Architecture:** Preserve the legacy room engine and extend new rooms with an island world. Immutable assets load through the Worker asset binding. Pure island modules own spatial queries and action rules; the existing durable room owns authentication, command sequencing and persistence.

**Tech Stack:** Existing React, MapLibre, TypeScript, Vitest, Workers and SQLite Durable Objects.

**Spec:** `docs/superpowers/specs/2026-11-15-full-island-coop-design.md`

## Global constraints

- Strict TypeScript; no gameplay Math.random; no new production dependencies.
- Solo store and singvive.run.v7 are unchanged.
- Use committed map assets, shared typography and English/Chinese catalogs.
- Preserve legacy schematic rooms and authenticated, sequenced commands.
- No push/deployment until verification passes.

## Task 1: Island world and travel

Files: create `src/coop/islandModel.ts`, `islandWorld.ts`, `islandWorld.test.ts`, `worker/islandAssets.ts`; extend `model.ts`, `simulation.ts`, `protocol.ts`, `worker/CoopRoom.ts`, `wrangler.jsonc`; expose existing walkability installer in `src/game/playable.ts`.

- [x] Define `IslandWorld` with discovered locations, spawn/evac ids, exploration discs and immutable catalog revision; `IslandCatalog` indexes raw POIs by spatial cell.
- [x] Add failing tests for stable site initialization, only nearby discovery, revisiting depleted sites, coordinate rejection and legacy behavior. `expect(discoverNearby(room, catalog, point)).not.toContain(remoteId)` establishes hidden-site boundaries.
- [x] Implement catalog loading from versioned static assets, server-side route checks, distance deadlines and free-point trekking. Travel commands carry a site id or coordinates only, never route length or time.
- [x] Keep v1 creation as a test/legacy fixture; production room creation calls `initializeIsland(room, catalog)`. Route island commands through `applyIslandCommand` and run discovery when travel completes.
- [x] Run island and protocol tests plus existing simulation regressions.

## Task 2: Survivor systems

Files: create `src/coop/expeditionSurvivor.ts` and tests. Parent owns `model.ts`/simulation integration.

- [x] Introduce `ExpeditionSurvivor` with solo Character, Meters, BodyParts, ItemInstance[], Equipment, SkillsState. Factory accepts name/occupation/seed and supplies a bounded starting kit.
- [x] Implement pure tick, loot generation, item pickup/use/drop/give/equip, medical rescue consumption, injury damage/recovery, crafting and skill practice. Reuse existing pure game modules and deterministic item ids.
- [x] Test item conservation, no cross-player mutation, body damage, survival time equivalence, invalid recipes, occupied equipment and actual medical requirement.
- [x] Integrate with island simulation without changing schematic-room rules.

## Task 3: Full-island interface

Files: create `src/coop/IslandMap.tsx`, `IslandScreen.tsx`; adapt `CoopScreen.tsx`; add catalog copy.

- [x] Render real MapLibre basemap, discovered sites, squad markers, travel path and shared exploration. Bound viewport marker work to 450 and release map resources on unmount.
- [x] Add district/occupation lobby configuration, current-site actions, independent inventory/body/skills, nearby teammates, shared cache and extraction destination.
- [x] Ensure all gameplay commands stay server-owned; present disabled actions and errors clearly. Legacy room screen remains available.
- [x] Check locale coverage, desktop/phone UI, menu separation and reconnect.

## Task 4: Richer world systems and final integration

- [x] Inventory existing HDB/MRT/faction APIs and implement compatible shared actions without claiming solo parity for missing systems.
- [x] Add deterministic encounters and shared weather; preserve terminal and replacement rules for real destinations.
- [x] Update smoke scripts for island rooms; verify four clients, contested items, independent travel, pause/reconnect and legacy persistence.
- [x] Run full tests, lint, build and browser checks; independent review; resolve findings.
- [x] Update GAME_DESIGN/TECH_STACK and record remaining parity gaps explicitly.

## Progress

- Approved design recorded; existing managed worktree and multiplayer branch are clean at 5926309.
- Ruling: preserve legacy room format using an optional versioned island extension; switching an active room's meaning would corrupt saved sessions.

## Verification and scope

- Full suite: 581 tests pass with four workers; lint passes at existing 23-warning baseline; production build passes.
- Four-client local socket smoke and normalized-storage restart comparison pass.
- Browser verified desktop/phone map, shared search/pickup, surface travel, MRT arrival and HDB landing/unit entry/combat.
- Final review found and verified the fix for treatment cancellation timing; scoped re-review approved.
- Advanced solo firearms, locked HDB doors/roof/heat/services, faction services, book study, facilities and timed horde extraction remain explicit follow-up work. Co-op now covers the island with compatible shared survival actions; it does not claim full solo parity.
