# Multiplayer Prototype Implementation Plan

> Execute the approved prototype in this session, using isolated implementation and review where useful.

**Goal:** Play a small authoritative co-op expedition with up to four browser clients on a Free-plan-compatible Cloudflare backend.

**Architecture:** Pure serializable simulation shared by tests and a per-room Durable Object. A separate lazy-loaded React screen sends authenticated commands and renders server snapshots.

**Tech Stack:** Existing React, TypeScript, Vite, Vitest, Workers and SQLite Durable Objects; no new production dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-multiplayer-design.md`

## Global constraints

- Strict TypeScript; type roles from `src/ui/type.ts`.
- Solo store, offline gameplay and `singvive.run.v7` remain unchanged.
- No bake downloads, full-island scans or extra mapping library.
- New room state version 1 is independent of solo saves.
- No secrets in snapshots or invite links; invite links contain only a room code.
- Persist important mutations before acknowledgements; duplicate commands cannot consume twice.
- Private playtest scope; no remote deployment.

## Tasks

- [x] 1. Define `src/coop/model.ts` and implement `src/coop/simulation.ts` with failing-first Vitest tests in `src/coop/simulation.test.ts`. Interfaces: `createRoom(code, seed, now)`, `joinRoom(room, id, name)`, `advanceRoom(room, now)`, `applyCommand(room, id, command, now)`, `setConnected(room, id, connected, now)`. Test capacity, shared loot, independent deadlines, rescue, replacement and terminal rules.
- [x] 2. Implement `worker/CoopRoom.ts` and route `/api/coop` via `worker/coop.ts`; add SQLite DO binding/migration and environment types. Persist room and credentials, validate same-origin requests, cap payloads, handle WebSocket attachments and recover via storage. Exercise HTTP/WebSockets with four clients and denied credentials.
- [x] 3. Implement `src/coop/client.ts`, `CoopScreen.tsx` and a compact schematic expedition view. Add a menu link and separate lazy entry in `src/main.tsx` so co-op bypasses solo locks without loading solo side effects. Explain prototype rules in the UI, expose all authoritative actions and connection status, test desktop/mobile.
- [x] 4. Document rules in GAME_DESIGN and run instructions/limits in TECH_STACK. Run simulation tests, full suite, lint, build and local multi-client/browser smoke. Review changes and fix findings.

## Progress / rulings

- Created `codex/multiplayer` in existing managed worktree.
- Ruling: separate prototype expedition rather than converting all island mechanics; approved bounded prototype scope and protects offline solo.
- Ruling: use existing visual language, typography and palette; this is a gameplay/network prototype, not a visual redesign.
- Implemented all four tasks, including English/Chinese UI, bounded command parsing, reconnect sequencing, persisted receipts and room expiry.
- Verification: all 538 tests across 64 files passed; lint passed with the existing 23-warning allowance; production build and strict TypeScript passed.
- Real four-client HTTP/WebSocket smoke passed: room capacity, independent actions, shared supplies, idempotent commands, pause/readiness, reconnect, seat replacement and rejected credentials/origins.
- Actual local server restart retained room state, supplies, player identity, pause and command sequence.
- Browser checks covered lobby, travel, search, collection, pause, reconnect, solo menu and desktop/phone layouts. Fixed a clipped mobile extraction control by constraining the schematic width.
- Independent review findings were resolved and re-reviewed. No production deployment or remote push was performed.
- Known prototype limits: four schematic sites, simplified combat/supplies, no solo score submission, raw diagnostic errors remain English, and public rollout still needs measured free-tier usage and room admission controls.
