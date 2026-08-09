# Requirements Document

## Introduction

The Fog of War system ensures the player begins with zero knowledge of their surroundings and must actively explore to uncover the Singapore map. Unexplored terrain is visually obscured on the Leaflet map via a canvas overlay. A dedicated Awareness stat governs the detect range independently from the existing Perception-based reveal radius, giving players fine-grained control over how far they can sense undiscovered locations before positively identifying them.

## Glossary

- **Fog_Overlay**: A canvas-based visual layer rendered on top of the Leaflet tile map that obscures all terrain the player has not yet explored.
- **Explored_Area**: The set of map coordinates that the player has previously had within their reveal radius. Explored areas are permanently unfogged.
- **Reveal_Radius**: The distance (in metres) within which the player can positively identify locations. Governed by Perception, weather, time of day, and vantage.
- **Detect_Radius**: The distance (in metres) within which the player can sense unidentified activity. Governed by the Awareness stat.
- **Awareness**: A derived or allocated stat that specifically controls the detect range, independent of the Perception-based reveal radius.
- **Discovery_State**: The per-location boolean (`discovered`) indicating whether the player has ever observed that location.
- **Tile_Mask**: The portion of the Fog_Overlay that has been cut away (revealed) based on the player's cumulative Explored_Area.
- **Player_Position**: The player's current latitude/longitude coordinates on the map.

## Requirements

### Requirement 1: Initial Blank State

**User Story:** As a player, I want to start with no knowledge of my surroundings, so that I am motivated to explore the world.

#### Acceptance Criteria

1. WHEN the game spawns the player, THE Store SHALL set all locations to `discovered: false` with no initial reveal.
2. WHEN the game spawns the player, THE Fog_Overlay SHALL obscure 100% of the map tiles surrounding the player.
3. WHEN the game spawns the player, THE Store SHALL NOT call `revealAround` with any vantage bonus; the player begins with zero discovered locations.

### Requirement 2: Visual Fog Overlay

**User Story:** As a player, I want unexplored areas to be visually hidden on the map, so that I can distinguish explored terrain from the unknown.

#### Acceptance Criteria

1. THE Fog_Overlay SHALL render an opaque dark layer over all map tiles that are outside the cumulative Explored_Area.
2. WHEN the player moves or reveals new territory, THE Fog_Overlay SHALL remove the opaque layer from the newly explored coordinates within the current Reveal_Radius.
3. THE Fog_Overlay SHALL use a canvas element layered above the Leaflet TileLayer and below all map markers.
4. WHILE the player is at a position, THE Fog_Overlay SHALL display a circular cutout centred on Player_Position with radius equal to the current Reveal_Radius.
5. THE Fog_Overlay SHALL persist previously explored areas as permanently visible (cutouts remain even when the player moves away).
6. WHILE a location has Discovery_State `detected`, THE Fog_Overlay SHALL render a semi-transparent zone (partial visibility) at the Detect_Radius boundary rather than full opacity.

### Requirement 3: Awareness Stat Controls Detect Range

**User Story:** As a player, I want a dedicated stat that affects how far I can sense things, so that I have meaningful control over my exploration capability.

#### Acceptance Criteria

1. THE Character system SHALL expose an Awareness value derived from the Perception attribute with a base multiplier and optional modifiers.
2. WHEN calculating the Detect_Radius, THE Fog system SHALL use the Awareness value instead of a fixed 1.8x multiplier on the Reveal_Radius.
3. THE Detect_Radius SHALL equal `Reveal_Radius + (Awareness * AWARENESS_RANGE_PER_POINT)` where `AWARENESS_RANGE_PER_POINT` is a tuning constant.
4. WHEN the Awareness value changes (due to equipment, traits, or effects), THE Fog system SHALL recalculate the Detect_Radius immediately.
5. THE Detect_Radius SHALL always be greater than or equal to the Reveal_Radius (minimum detect range equals reveal range).

### Requirement 4: Exploration-Driven Discovery

**User Story:** As a player, I want to discover locations only by moving near them or actively scouting, so that exploration feels rewarding.

#### Acceptance Criteria

1. WHEN the player travels to a new position, THE Store SHALL call the reveal logic using the standard Reveal_Radius (no vantage bonus) to discover locations.
2. WHEN the player performs a scout action, THE Store SHALL call the reveal logic with the scouting vantage bonus to discover locations at extended range.
3. WHEN the player rests until morning, THE Store SHALL refresh visibility of already-discovered locations within Reveal_Radius without discovering new locations beyond the current Reveal_Radius.
4. IF a location is within Detect_Radius but outside Reveal_Radius and has not been previously discovered, THEN THE Map SHALL display a faint unidentified blip without marking the location as discovered.

### Requirement 5: Explored Area Persistence

**User Story:** As a player, I want my exploration progress to be saved, so that map visibility survives save/load and page reload.

#### Acceptance Criteria

1. THE Store SHALL persist the cumulative Explored_Area geometry as part of the saved game run.
2. WHEN the player loads a saved run, THE Fog_Overlay SHALL restore all previously explored cutouts from the persisted Explored_Area.
3. THE Explored_Area representation SHALL be storage-efficient (compressed coordinate set or radii log rather than raw pixel data).

### Requirement 6: Fog Overlay Performance

**User Story:** As a player, I want the fog overlay to render smoothly, so that map interaction remains responsive.

#### Acceptance Criteria

1. THE Fog_Overlay SHALL render using a single off-screen canvas composited over the Leaflet map, avoiding per-tile DOM manipulation.
2. WHEN the map is panned or zoomed, THE Fog_Overlay SHALL update the canvas projection within one animation frame (16ms budget).
3. THE Fog_Overlay SHALL batch all cutout recalculations when multiple reveals happen in the same game tick.

### Requirement 7: Detect Radius Visual Feedback

**User Story:** As a player, I want to see my detect range on the map, so that I understand the boundary of my awareness.

#### Acceptance Criteria

1. WHILE the player is at a position, THE GameMap SHALL render a dashed circle at the Detect_Radius boundary to indicate the awareness zone.
2. THE Detect_Radius circle SHALL be visually distinct from the existing Reveal_Radius circle (different colour and dash pattern).
3. WHEN the Detect_Radius changes (weather, stat change, equipment), THE GameMap SHALL update the circle size immediately.

### Requirement 8: Deterministic Fog State

**User Story:** As a developer, I want fog state to be deterministic given the same seed and actions, so that replay and debugging remain consistent.

#### Acceptance Criteria

1. THE Fog system SHALL derive all visibility calculations from explicit parameters (position, stats, weather, time) without using `Math.random()`.
2. FOR ALL identical sequences of player actions with the same seed, THE Explored_Area SHALL be identical at every game tick.
3. THE Awareness stat derivation SHALL use only deterministic inputs (base Perception, equipped modifiers, active trait bonuses).
