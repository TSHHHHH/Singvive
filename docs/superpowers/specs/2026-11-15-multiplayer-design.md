# Four-survivor co-op prototype

Approved through the planning conversation and the request to build on a new multiplayer branch.

## Scope

A separate, explicitly labelled prototype expedition with up to four players in private invite-code rooms. Use a compact schematic district, finite shared loot, simplified health and stance combat, medical rescue, replacement survivors and individual extraction. This proves the networked loop; it is not the full island, solo inventory, body simulation, HDB or tunnel conversion. Solo remains offline and its v7 save is untouched.

## Rules

Players act independently against one authoritative clock. Idle players do not pause time. Any connected participant can pause; connected participants ready up to resume after a three-second countdown. Disconnect pauses automatically for 15 seconds, after which connected participants may ready up and continue. If nobody is connected, the session stays paused. A disconnected survivor remains in the world if others continue.

Travel, search, rest and rescue take time. Shared locations have finite supplies. Enemies have shared health and nearby survivors may join the same fight. Aggressive, guarded and precision stances change damage/defence. Rescue requires proximity, five seconds, and one medical charge consumed on success; incoming damage interrupts rescue. Downed players have 30 simulation seconds to be rescued and return injured. Death loses progression and inventory drops at the site. Dead players can replace their character at a rendezvous occupied by another active survivor; replacements start without medical supplies to avoid supply farming. Extraction is individual. When no active survivor remains, remaining downed survivors die and the room ends; no replacement can restart an ended room. Extracted seats cannot respawn.

## Architecture

One SQLite-backed Cloudflare Durable Object per room, authenticated player capability tokens, same-origin WebSocket upgrade, bounded messages and ordered idempotent commands. The Worker routes `/api/coop/*`. The room persists authoritative state and command receipts before broadcasting. Browser animation is presentation only. Alarms advance active rooms at two-second intervals; paused/lobby/ended rooms do not run a perpetual ticker. Real-time deadlines are server owned. Recover from eviction using persisted wall clock and simulation state; cap abandoned rooms by automatically pausing when sockets disappear. Local development uses the existing Cloudflare Vite integration.

## Prototype constants

One real second represents one game minute. Travel eight seconds; search six; rest twenty; extraction five. Initial medical charges: one, initial food: two. A seeded shared encounter is available at the market. Visible map is a schematic, not authoritative island routefinding. Full world generation and solo rules remain outside the prototype.

## Verification

Pure tests cover simultaneous actions, contested loot, room capacity, pause/countdown, offline grace, medical requirements/interruption, combat outcomes, replacement eligibility, terminal sessions and deterministic restart. Runtime smoke tests use real HTTP/WebSocket connections to the local Worker, including four clients, invalid credentials, fifth-player rejection and reconnect. Browser QA covers lobby, room, responsive layout and the solo entry. Run full tests, lint and production build. No production deployment is part of this request.
