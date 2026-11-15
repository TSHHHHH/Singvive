# Full-island co-op

Approved in chat: expand the four-player prototype into the solo Singapore survival experience, with shared squad exploration. Implementation proceeds on `codex/multiplayer`; pushes currently deploy the live Worker, so changes stay local until verified.

## World and ownership

Reuse committed POI metadata, walkability masks, land routes, map style, item definitions, survival rules and seeded RNG. Never call the bake scripts. The server owns destinations, action deadlines, exploration, shared site depletion, encounters, inventories and extraction. Clients submit intentions, never damage, loot or elapsed time. Each survivor has their own character, body, meters, inventory, equipment and skills. Shared weather and the world clock advance once. Solo saves and the solo store remain independent.

New rooms use the full island. Existing version-1 schematic rooms remain playable until expiry; their saved state must not be silently reinterpreted. An optional versioned island extension carries the new world and survivor state. Static catalog data is loaded once through the asset binding; only discovered/mutated state belongs in room storage. Spatial indexing avoids scanning every POI each tick. Snapshots filter mutable distant-site details to current sight, while discovered names and teammate positions remain shared.

## Play loop

The host selects a starting district before starting. Survivors choose a solo occupation build. The squad spawns together and can split up. Travel uses server-validated land routes and distance-based time; selecting an empty walkable point creates a trek destination, allowing traversal beyond discovered POIs. Discovery happens on arrival. The map presents the real basemap, shared exploration and independent survivor markers. Marker work remains viewport culled and capped at 450.

Scavenging uses real site categories and solo loot definitions, with shared finite caches. Carrying, consumption, equipment, injury treatment and crafting use the solo rules where their APIs permit independent simulation. Combat remains concurrent and server-resolved; allies at the same site can help. Rescue requires an actual medical item, consumed only on completion. Death drops belongings; replacement requires another active survivor at the rendezvous. Extraction is individual; no active survivor ends the room. Pauses, readiness, reconnect grace and idempotent commands retain the existing contract.

## Delivery and verification

Deliver connected slices: island exploration/travel; survivor inventory/survival; richer encounters/crafting/interiors/transit/factions/extraction. Explicitly track any solo system not yet integrated instead of presenting partial parity as complete. Validate deterministic world generation, malformed coordinates and IDs, simultaneous looting, interrupted rescues, shared clocks, reconnect/restart, legacy rooms, four live clients, and full tests/lint/build. Check desktop and phone rendering. No automatic push while work is incomplete.
