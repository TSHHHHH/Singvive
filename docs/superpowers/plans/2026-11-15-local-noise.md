# Local noise survival implementation plan

Approved design: replace global escalation and automatic overrun with persistent spatial disturbances, a compact Surroundings display, and four seeded exploration events. Survival is open ended; extraction stays voluntary. No new artwork or dependencies.

## Constraints
- Work in the existing checkout on codex/local-noise-survival to preserve the user's extensive uncommitted work. Do not commit unrelated edits.
- Keep singvive.run.v7, debounce saves, tolerate missing new state, never restore the old doom clock on continue.
- Gameplay uses game hours and seeded RNG. UI animation uses wall time only for presentation.
- Preserve static dangerous sites and night hazards. Remove town-front gameplay/UI; no omniscient event locations in fog.
- A noise source affects open ground and sites spatially, is capped, decays, and is not added twice to encounter odds.
- Keep map parent subscriptions off combat/log ticks; obey existing type scale, localization, reduced motion, and phone shell.

## Tasks
- [x] Pure activity module + tests: spatial sources, decay, capped accumulation, deterministic travel events, remembered cooldown/distance/choices, load normalization.
- [x] Store integration + tests: emit sources, local pressure for travel/search/rest/tunnels, event response actions, remove clock and death gate, persist and resume.
- [x] UI: Surroundings in rail/map; animated waveform and transition pulse; cause/age/consequence details, event choices; remove island UI and wash; update localized guide.
- [x] Long-run scores: replace 16-day doom-derived rejection with elapsed-time plausibility, retain finite/integer input and score checks.
- [x] Validation: focused tests then full tests/lint/build; desktop/mobile browser flow, event response/reload/noise decay; review final diff.

## Interface contract
New src/game/activity.ts exports ActivityState, ActivitySource, ActivityEvent, ActivityKind ('player'|'car_alarm'|'gunfire'|'shutter'|'scavengers'), freshActivity(), addActivity(state, {lat,lng,radiusMeters,intensity,kind}, now), activityAt(state, lat,lng,now) (0..1), activityBand(level), pruneActivity(state,now), exploreActivity(state,{seed,lat,lng,distanceM,now,weather,category}), respondActivity(state,now), normalizeActivity(value,now).
ActivityState: sources, sequence, eventClock (lastAt, distanceM, day, count, lastKind), event. Sources: id,lat,lng,radiusMeters,intensity,createdAt,expiresAt,kind. Event: id,kind,lat,lng,createdAt,expiresAt,resolved. IDs strings. intensity 0..1. Single bounded active event, no repeated kind, >=250m accumulated exploration, >=2h between attempts, max 3 events/game day. Event source at arrival position (observed nearby), gunfire may be offset without revealing POIs. Events persist and cannot reroll on reload. Activity event response is contextual; costs and rewards wired in store, source is reduced but residual attention remains.

Store adds activity: ActivityState; respondToActivity(): void; dismissActivity(): void. UI calls these actions. Time now = (day-1)*24+hour. New sources no longer also mutate tempDangerBoost; legacy boosts continue to decay.

## Decisions / progress
- Work in place because source includes ongoing location/HDB changes needed by this implementation; branch isolates the new line of work without moving those edits.
- Baseline surface pressure stays 0.42. Local disturbance adds bounded pressure; no day-dependent global increase. Exact formulas will be covered by tests.

## Verification (2026-11-15)
- Baseline: 353 tests passed before changes. Final: 422 tests across 53 files passed.
- npm run lint passed with the existing 23-warning allowance; type scale and Chinese glossary passed. npm run build (TypeScript + Worker/client Vite builds) passed; existing large-chunk advisory remains.
- Playwright with installed Chrome (Browser plugin not available): desktop1440x960 and phone390x844, all four event responses, discard retaining disturbance, six-second debounced save + reload, Chinese, reduced-motion, actual walking arrival event. No uncaught page exceptions.
- Map tiles/fonts verified with browser network access. MapLibre logs null color/number style warnings; visuals and noise interactions rendered.
- Independent review caught and resolved fractional-hour save validation and missed midpoint route pressure. Re-review:26 focused tests passed, no further findings.
- Local preview http://127.0.0.1:5192/; no production deployment or commits. Existing unrelated working changes preserved.

## UI simplification (2026-11-15)
Approved replacement: remove the standalone Surroundings panel/waveform; use a weather-adjacent activity icon and existing timeline cards.

- [x] ActivityBadge: Quiet/Stirred/Hunting through shape and colour, finite increase-only pulse, reduced-motion support, state/cause tooltip, timeline shortcut. Phone status chrome includes compact weather/activity so the indicator remains reachable on Map.
- [x] Optional street incidents use timeline prose and choice styling. Costs are visible; resolved/expired actions are disabled; outcomes remain attached to the original card. No interruption gate added.
- [x] Persist event snapshots in the existing bounded log/v7 schema. Old live scenes are backfilled on continue. Actions accept expected event IDs to reject stale cards.
- [x] Keep live choices visible in Latest mode and across midnight; explicit icon focus reveals the relevant historical entry.
- [x] Update English/Chinese guide copy, design and technical docs. Remove obsolete panel and CSS.
- Validation: full suite 426 tests/53 files passed, then additional log grouping regression passed (13/13). Lint/type scale/Chinese glossary and production build passed; existing warnings/chunk-size advisory remain.
- Browser: desktop 1440x960 and phone 390x844; all four choices, expiry/history, Latest/midnight, persistence/reload, Chinese, reduced motion, no horizontal phone overflow, and a real walking arrival producing a timeline card. No uncaught page exceptions. Final desktop screenshot includes loaded map.
- Screenshots: activity-timeline-desktop-map.png, activity-timeline-phone.png, activity-timeline-phone-zh.png in the task visualization folder. Local preview remains http://127.0.0.1:5192/.
- Final review: no actionable findings in event guards, history/expiry, grouping, navigation or badge motion. Incident outcomes now appear once on their own card, with plain-log fallback only for missing legacy cards.
- Final verification after cleanup: 427 tests across 53 files passed; lint/type scale/Chinese glossary and production build passed.
