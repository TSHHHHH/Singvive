# Implementation Plan: Fog of War

## Overview

Implement a three-layer fog-of-war system: pure logic in `fog.ts`, state management in `store.ts`, and canvas rendering in `FogOverlay.tsx`. Players start with zero map knowledge and progressively reveal terrain through movement and scouting. A new Awareness stat (Perception + modifiers) governs detect range independently from the reveal radius.

## Tasks

- [x] 1. Extend types and pure fog logic
  - [x] 1.1 Add `awarenessMod` to `ItemModifiers` and `Trait` interfaces in `src/game/types.ts`
    - Add optional `awarenessMod?: number` field to `ItemModifiers`
    - Add optional `awarenessMod?: number` field to `Trait`
    - _Requirements: 3.1, 3.4, 8.3_

  - [x] 1.2 Add `ExploredCircle` interface and update fog functions in `src/game/fog.ts`
    - Add `AWARENESS_RANGE_PER_POINT` tuning constant (60 metres per point)
    - Add `ExploredCircle` interface with `lat`, `lng`, `radius` fields
    - Add `awareness(perception, equipMod, traitMod)` function returning clamped value
    - Modify `detectRadius` signature to accept `(reveal, awarenessValue)` instead of just `(reveal)`
    - Update `detectRadius` body: `Math.max(reveal, reveal + Math.round(awarenessValue * AWARENESS_RANGE_PER_POINT))`
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 8.1_

  - [x] 1.3 Add `equipAwarenessMod` helper in `src/game/character.ts`
    - Implement function that sums `awarenessMod` from all equipped item slots
    - _Requirements: 3.1, 3.4_

  - [ ]* 1.4 Write property tests for fog logic (Properties 3 & 4)
    - **Property 3: Detect radius formula correctness** — for any valid reveal ∈ [100,1000] and awareness ∈ [0,15], `detectRadius(reveal, awareness)` equals `reveal + Math.round(awareness * AWARENESS_RANGE_PER_POINT)`
    - **Validates: Requirements 3.2, 3.3**
    - **Property 4: Detect radius is always at least reveal radius** — for any reveal ∈ [1,2000] and awareness ∈ [0,20], `detectRadius(reveal, awareness) >= reveal`
    - **Validates: Requirements 3.5**

- [x] 2. Update store state and persistence
  - [x] 2.1 Add `exploredArea` to `SavedRun` in `src/game/storage.ts`
    - Add `exploredArea: ExploredCircle[]` to `SavedRun` interface (import from fog.ts)
    - Handle migration for old saves: default to empty `[]` when field is missing in `loadRun`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 2.2 Add `exploredArea` to store state and update `persist()` in `src/game/store.ts`
    - Add `exploredArea: ExploredCircle[]` to `State` interface, initialise to `[]`
    - Update `persist()` to include `exploredArea` in the saved run object
    - Update `continueRun` to restore `exploredArea` from loaded save (default `[]`)
    - _Requirements: 5.1, 5.2_

  - [x] 2.3 Update `revealAround` to append `ExploredCircle` entries
    - After computing the reveal radius, push `{ lat: currentPos.lat, lng: currentPos.lng, radius: r }` to `exploredArea`
    - _Requirements: 2.2, 2.5, 4.1, 4.2_

  - [x] 2.4 Remove initial `revealAround(120)` from `setSpawn` and enforce blank start
    - Remove or gate the `revealAround(120, false)` call in `setSpawn` so no locations start discovered
    - Ensure all locations begin with `discovered: false` (already the default from world gen)
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 2.5 Update `rest` action to only refresh already-discovered locations
    - Modify `revealAround` call in `rest` (or add a separate refresh helper) so it updates `lastSeen` memory for already-discovered locations within radius but does NOT set `discovered: true` on new locations
    - _Requirements: 4.3_

  - [x] 2.6 Update `detectRadius` call sites in `store.ts` to pass awareness value
    - Compute awareness using `awareness(perception, equipAwarenessMod(equipment), traitAwarenessMod)` wherever detect radius is derived
    - Pass the result to the updated `detectRadius(reveal, awarenessValue)` signature
    - _Requirements: 3.2, 3.4_

  - [ ]* 2.7 Write property tests for store behaviour (Properties 1, 2 & 5)
    - **Property 1: All locations start undiscovered** — for any generated set of 1–50 locations, after spawn init, every location has `discovered === false`
    - **Validates: Requirements 1.1, 1.3**
    - **Property 2: Explored area is monotonically non-decreasing** — for any initial state + sequence of actions, `exploredArea.length` never decreases
    - **Validates: Requirements 2.5**
    - **Property 5: Rest never discovers new locations** — for any state with a mix of discovered/undiscovered locations, after rest the discovered set is unchanged
    - **Validates: Requirements 4.3**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement FogOverlay canvas component
  - [x] 4.1 Create `src/components/FogOverlay.tsx` — custom Leaflet GridLayer
    - Create the component using `createLayerComponent` from react-leaflet
    - Implement `createTile(coords)`: fill tile with fog colour `rgba(10, 12, 8, 0.92)`
    - For each `ExploredCircle`, convert lat/lng to pixel coords at current zoom and punch transparent circle using `globalCompositeOperation: 'destination-out'`
    - Include the live reveal circle (current position + current reveal radius) as an always-visible cutout
    - Set appropriate z-index (between tile layer and overlay pane, below markers)
    - Accept props: `exploredArea`, `currentRevealCenter`, `currentRevealRadius`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.3_

  - [ ]* 4.2 Write unit tests for FogOverlay
    - Verify correct number of cutout circles rendered for given exploredArea
    - Verify fog colour matches spec
    - _Requirements: 2.1, 2.5_

- [x] 5. Integrate fog overlay and detect circle into GameMap
  - [x] 5.1 Update `src/components/GameMap.tsx` to render `<FogOverlay>`
    - Import and render `FogOverlay` between `<TileLayer>` and markers
    - Pass `exploredArea` from store, `currentRevealCenter` as current position, `currentRevealRadius` as computed reveal
    - _Requirements: 2.3, 2.4_

  - [x] 5.2 Add detect radius dashed circle to GameMap
    - Add a second `<Circle>` for the detect radius with distinct styling (different colour, dashed pattern)
    - Compute detect radius using `detectRadius(reveal, awarenessValue)` with awareness derived from character stats + equipment
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 5.3 Wire store state to GameMap/GameScreen
    - Ensure `exploredArea`, computed awareness, and detect radius are available to the map components via Zustand selectors
    - _Requirements: 3.4, 7.3_

  - [ ]* 5.4 Write property test for visibility classification (Property 6)
    - **Property 6: Detected visibility classification** — for any undiscovered location at distance d where `reveal < d <= detect`, `visibilityOf` returns `'detected'`
    - **Validates: Requirements 4.4**

- [x] 6. Serialization and migration
  - [x] 6.1 Ensure explored area persists through save/load cycle
    - Verify `exploredArea` is written to localStorage via `saveRun` and restored via `loadRun`
    - Handle old saves missing the field (default `[]`) in `loadRun`
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 6.2 Write property test for serialization round-trip (Property 7)
    - **Property 7: Explored area serialization round-trip** — for any valid `ExploredCircle[]`, `JSON.parse(JSON.stringify(arr))` produces a deeply equal array
    - **Validates: Requirements 5.1, 5.2**

- [x] 7. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The design uses TypeScript throughout — all implementation follows the existing project conventions
- Property tests use fast-check + Vitest (the only new dev dependency)
- The fog overlay leverages Leaflet's built-in tile invalidation for smooth pan/zoom performance
- `exploredArea` grows at ~1 entry per travel/scout action; typical runs stay well under 200 entries (~5 KB JSON)
