# Design Document: Fog of War

## Overview

The Fog of War system transforms Singvive's map from a fully-visible playground into a progressively discovered world. Players start blind and reveal terrain through movement and scouting. The system has three layers:

1. **Data layer** (`src/game/fog.ts`) — pure functions computing awareness, radii, visibility classification, and managing the explored-area geometry.
2. **State layer** (`src/game/store.ts`) — Zustand actions that trigger reveals, persist explored area, and enforce the "no free intel at spawn" rule.
3. **Render layer** (`src/components/FogOverlay.tsx`) — a custom Leaflet canvas layer that paints darkness over unexplored terrain and punches circular cutouts for explored areas.

A new **Awareness** stat (derived from Perception + equipment/trait modifiers) replaces the hard-coded 1.8× detect multiplier, giving players agency over their sensing range.

## Architecture

```mermaid
graph TD
    subgraph Pure Logic (src/game/)
        FOG[fog.ts] -->|revealRadius, detectRadius, visibilityOf| STORE[store.ts]
        CHAR[character.ts] -->|awareness()| FOG
        STORAGE[storage.ts] -->|SavedRun with exploredArea| STORE
    end

    subgraph React UI (src/components/)
        STORE -->|exploredArea, currentPos, reveal, detect| OVERLAY[FogOverlay.tsx]
        STORE -->|detect radius| GAMEMAP[GameMap.tsx]
        OVERLAY -->|canvas layer| LEAFLET[Leaflet Map]
        GAMEMAP -->|dashed circle| LEAFLET
    end
```

**Key architectural decisions:**

- The fog overlay is a **custom Leaflet GridLayer** (canvas-based) rather than a react-leaflet component with its own canvas. This leverages Leaflet's built-in tile invalidation on pan/zoom, keeping us within the 16ms budget without manual projection math.
- Explored area is stored as a **list of `{lat, lng, radius}` circles** — compact, serializable, and trivially composited via canvas `globalCompositeOperation: 'destination-out'`.
- All fog logic stays in `src/game/fog.ts` with zero DOM/React dependencies. The React component only reads state and renders.

## Components and Interfaces

### `src/game/fog.ts` — Extended API

```typescript
// New tuning constant
export const AWARENESS_RANGE_PER_POINT = 60; // metres of detect range per awareness point

/** Explored area entry — a circle that was revealed at some point. */
export interface ExploredCircle {
  lat: number;
  lng: number;
  radius: number; // metres
}

/**
 * Derive awareness from Perception + modifiers.
 * Awareness controls detect range independently of reveal radius.
 */
export function awareness(
  perception: number,
  equipMod: number,   // sum of equipment awareness bonuses
  traitMod: number,   // trait-based awareness bonus
): number {
  return Math.max(0, perception + equipMod + traitMod);
}

/**
 * Detect radius: how far the player senses unidentified activity.
 * Now uses Awareness instead of a fixed 1.8× multiplier.
 */
export function detectRadius(reveal: number, awarenessValue: number): number {
  return Math.max(reveal, reveal + Math.round(awarenessValue * AWARENESS_RANGE_PER_POINT));
}

// revealRadius() — unchanged signature
// visibilityOf() — unchanged signature
// snapshot() — unchanged
```

### `src/game/character.ts` — Awareness Helper

```typescript
/**
 * Compute awareness modifiers from equipped items.
 * Reads the new optional `awarenessMod` field on ItemModifiers.
 */
export function equipAwarenessMod(equipment: Equipment): number {
  let mod = 0;
  for (const slot of Object.values(equipment)) {
    if (slot?.modifiers?.awarenessMod) mod += slot.modifiers.awarenessMod;
  }
  return mod;
}
```

### `src/game/types.ts` — Additions

```typescript
// Add to ItemModifiers:
export interface ItemModifiers {
  attackBonus?: number;
  defenseBonus?: number;
  weightCapacityBonus?: number;
  awarenessMod?: number; // NEW: bonus to awareness/detect range
}

// Add to Trait:
export interface Trait {
  // ... existing fields ...
  awarenessMod?: number; // NEW: trait-based awareness bonus
}
```

### `src/game/storage.ts` — SavedRun Extension

```typescript
export interface SavedRun {
  // ... existing fields ...
  exploredArea: ExploredCircle[]; // NEW: cumulative fog cutouts
}
```

### `src/components/FogOverlay.tsx` — New Component

A custom Leaflet `L.GridLayer` subclass rendered via `createLayerComponent` from react-leaflet. It:

1. Maintains reference to a single off-screen canvas.
2. On each `createTile(coords)` call, fills the tile with the fog colour (`rgba(10, 12, 8, 0.92)`).
3. For each `ExploredCircle`, converts lat/lng to pixel coordinates at the current zoom and punches a transparent circle using `globalCompositeOperation: 'destination-out'`.
4. Renders below markers (z-index between tiles and overlayPane).

```typescript
interface FogOverlayProps {
  exploredArea: ExploredCircle[];
  currentRevealCenter: { lat: number; lng: number };
  currentRevealRadius: number; // live reveal (always visible)
}
```

### `src/components/GameMap.tsx` — Changes

- Import and render `<FogOverlay>` between `<TileLayer>` and markers.
- Add a second `<Circle>` for the detect radius with distinct styling (dashed, different colour).
- Pass `exploredArea`, `currentPos`, and `reveal` to the fog overlay.

## Data Models

### ExploredCircle

| Field | Type | Description |
|-------|------|-------------|
| lat | number | Centre latitude |
| lng | number | Centre longitude |
| radius | number | Radius in metres |

This is appended to the array each time `revealAround` fires. Typical run accumulates 50–200 circles (one per travel + scout + rest-refresh). At ~24 bytes JSON per entry, a 200-entry array is ~5 KB — well within localStorage budget.

### State Changes

The Zustand store gains:

```typescript
interface State {
  // ... existing ...
  exploredArea: ExploredCircle[]; // cumulative fog cutouts
}
```

### Awareness Derivation

```
awareness = perception + equipAwarenessMod + traitAwarenessMod
detectRadius = max(revealRadius, revealRadius + awareness * AWARENESS_RANGE_PER_POINT)
```

With Perception 5, no modifiers: awareness = 5, detectRadius = reveal + 300m.
With Perception 8, +1 equip: awareness = 9, detectRadius = reveal + 540m.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: All locations start undiscovered

*For any* set of generated locations (of any size and configuration), after the spawn initialization logic completes, every location in the resulting state SHALL have `discovered === false`.

**Validates: Requirements 1.1, 1.3**

### Property 2: Explored area is monotonically non-decreasing

*For any* game state and any sequence of store actions (travel, scout, rest, or any combination), the length of the `exploredArea` array after the actions SHALL be greater than or equal to its length before the actions. No action ever removes entries from the explored area.

**Validates: Requirements 2.5**

### Property 3: Detect radius formula correctness

*For any* valid reveal radius (positive number) and awareness value (non-negative integer), `detectRadius(reveal, awareness)` SHALL equal `reveal + Math.round(awareness * AWARENESS_RANGE_PER_POINT)`.

**Validates: Requirements 3.2, 3.3**

### Property 4: Detect radius is always at least reveal radius

*For any* valid reveal radius and any awareness value (including zero), `detectRadius(reveal, awareness)` SHALL be greater than or equal to `reveal`.

**Validates: Requirements 3.5**

### Property 5: Rest never discovers new locations

*For any* game state containing a mix of discovered and undiscovered locations, after the rest action completes, the set of location IDs with `discovered === true` SHALL be identical to (or a subset of) the set before rest. No previously-undiscovered location becomes discovered during rest.

**Validates: Requirements 4.3**

### Property 6: Detected visibility classification

*For any* location that has `discovered === false` and is at a distance `d` where `reveal < d <= detect`, `visibilityOf(location, d, reveal, detect)` SHALL return `'detected'`.

**Validates: Requirements 4.4**

### Property 7: Explored area serialization round-trip

*For any* valid `ExploredCircle[]` array, serializing it to JSON and deserializing it back SHALL produce an array that is deeply equal to the original.

**Validates: Requirements 5.1, 5.2**

## Error Handling

| Scenario | Handling |
|----------|----------|
| `exploredArea` missing from saved run (old save format) | Default to empty array `[]`; player keeps location `discovered` flags but fog overlay starts fresh. Graceful migration. |
| Canvas context unavailable (rare browser issue) | FogOverlay falls back to a simple CSS overlay with `pointer-events: none`. Map remains usable, just without per-pixel fog. |
| Extremely large `exploredArea` (1000+ circles) | Merge overlapping circles during persist to cap array growth. Two circles that fully overlap → keep only the larger. |
| `awareness` returns negative (malformed equipment data) | Clamped to 0 via `Math.max(0, ...)` in the awareness function. |
| Leaflet map not ready when FogOverlay mounts | Guard with null-check on map instance; layer adds itself on next tick via `useEffect`. |

## Testing Strategy

### Property-Based Tests (Vitest + fast-check)

The project will use **fast-check** with **Vitest** for property-based testing. Each property test runs a minimum of 100 iterations with generated inputs.

| Property | Generator Strategy |
|----------|-------------------|
| 1: Locations start undiscovered | Generate arrays of 1–50 LocationState objects with random coords and attributes |
| 2: Explored area monotonic | Generate initial exploredArea (0–20 circles) + sequence of 1–10 action types |
| 3: Detect radius formula | Generate reveal ∈ [100, 1000], awareness ∈ [0, 15] |
| 4: Detect ≥ reveal | Generate reveal ∈ [1, 2000], awareness ∈ [0, 20] |
| 5: Rest preserves discovery | Generate 5–30 locations with random discovered states, simulate rest |
| 6: Detected classification | Generate undiscovered location + distance between reveal and detect |
| 7: Serialization round-trip | Generate arrays of 0–100 ExploredCircle with random lat/lng/radius |

Each test is tagged: `// Feature: fog-of-war, Property N: <title>`

### Unit Tests (Vitest)

- `awareness()` returns correct values for known attribute/modifier combos
- `detectRadius()` with awareness=0 returns exactly reveal
- `revealAround()` with vantage=0 at spawn does not get called (integration)
- FogOverlay renders correct number of cutout circles
- Detect radius circle renders with correct dash pattern and colour
- Old saves without `exploredArea` field load gracefully

### Integration Tests

- Full spawn → travel → scout cycle verifies fog clears progressively
- Save/load cycle preserves fog state visually (snapshot test)
- Performance: fog overlay renders 200 circles within 16ms budget (benchmark)
