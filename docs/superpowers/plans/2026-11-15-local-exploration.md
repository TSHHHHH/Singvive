# Local exploration implementation plan

**Goal:** Implement the approved nearby recognition, search clues and useful local facilities, with Singapore locality maps/noticeboards and persistent mini objectives in the existing logbook.

**Architecture:** Pure seeded exploration helpers own recognition, lead selection and one-time facility discovery. Store actions apply these only on arrival, completed search or reading a board. Identified sites remain separate from visited snapshots. UI extends the existing logbook and camera focus action.

**Constraints:** Keep singvive.run.v7 with optional backward-compatible fields. Preserve untouched location identity. No bake fetches/scans or per-frame exploration work. Keep viewport culling, debounce, named type roles and scalar map subscriptions. Preserve all pre-existing working-tree edits.

## Contracts

- LocationState optional fields: `identified?: boolean`, `visited?: boolean`, `localFacilityChecked?: boolean`, `searchClueChecked?: boolean`, `localMapRead?: boolean`.
- ExplorationLead (exported from game/exploration.ts): `id`, `sourceId`, `targetId`, `source: 'search' | 'noticeboard' | 'locality'`, `createdDay`, optional `completedDay`, optional `facility: 'water' | 'shelter' | 'stove'`.
- Store: `explorationLeads: ExplorationLead[]`; `readLocalMap(): void`.
- Recognition: `recognitionRadius(awareness: number, sight: number, weather: WeatherKind): number`, `recognizeNearby(locations, origin, radiusM): Record<string, LocationState>`. Radius 20–60m before weather/light, baseline awareness 5 gives 35m. Exterior categories only; conservative footprint occlusion; no live snapshots or faction state.
- Leads: `findExplorationLeads(seed, locations, sourceId, source, day, existing, excludeId?): ExplorationLead[]` returns NEW leads (not combined). Search chance 35%, one clue per source; noticeboard one within 800m; MRT locality up to three public sites within 400m; active cap six, unique targets, no visited sites, no evac. Stable seeds per source. `completeExplorationLeads(leads, targetId, day)`; `normalizeExplorationLeads(value, locations)` validates and bounds save data.
- Facilities: `localFacilityFor(seed, loc): 'water' | 'shelter' | 'stove' | null`; `discoverLocalFacility(seed, loc): LocationState` applies once on physical arrival, never refills. Water two clean portions, shelter uses existing rain shelter, stove needs normal player-supplied fuel. Do not overwrite existing crafted facilities. Faction-held sites do not give free public facilities.

## Tasks

- [x] Pure helpers and behavioral tests: radius caps/weather, identity-only recognition/occlusion, stable bounded lead selection, completion, old saves, finite facility discovery.
- [x] Integration tests then store wiring: physical arrival (including tunnels/spawn), completed/empty searches, guarded five-minute maps/noticeboards, persistence/reset/continue. Map reads reveal identity, never fog or live status. Aborted searches cannot yield clues.
- [x] Presentation: identified marker/card with unknown conditions, logbook active/completed leads and facilities, camera focus, local-map action, English and Chinese translations. Reuse existing travel controls and avoid hidden state leaks.
- [x] Update GAME_DESIGN/TECH_STACK/guide; focused tests, full tests, lint/build, desktop and phone browser checks, final review.

## Execution notes

User approved the proposed mechanics and requested implementation, including logbook tracking and camera focus. Continue within that authorization. This feature depends on substantial existing uncommitted location/activity changes; work in this checkout and preserve them. Pure logic and UI ownership can be delegated under the subagent-driven-development skill; store integration remains with the primary agent. No commit/deploy requested.

Validation: final full suite 461/461 passed (57 files); lint/type-scale/glossary and production build passed. Added direct physical-arrival and pre-exploration-v7 integration coverage. Independent source review found no actionable mechanics issues. Browser regression fixed: closing the logbook's padding animation canceled camera focus; combined camera ownership now preserves it. Desktop (1440×1000) and phone (390×844) verified board time/one-use, persistent leads on continue, source narratives/long names, identity-only cards, repeated and responsive focus to exact coordinates at zoom16 with no travel, and actual Travel here completing a lead. No horizontal phone overflow or app errors in final interaction checks. Browser plugin absent; Playwright used installed Chrome with a local blank 2D style because external basemap requests were denied. Actual basemap/3D rendering is outside this validation.
