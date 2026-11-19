# Known evacuation objective implementation plan

**Goal:** Replace cargo admission with a known evacuation destination and free contact/boarding, and locate that destination from Objectives.
**Architecture:** Keep the single active operation and existing map focus flow. Store contact separately from legacy cargo fields; retain v7 compatibility. Selection checks land routes and windows allow travel, rest and supplies. Optional information never gates pickup.
**Spec:** GAME_DESIGN.md section 3.16 and the user's approval in this chat.
**Execution:** In this shared checkout, preserve existing travel, skills and map edits. Execute inline; no deployment or commits requested.

## Tasks

- [x] Add store integration regressions: empty inventory can contact then board; combat/search/interiors and expired windows cannot board; old quota fields do not matter; cooldown and contact survive v7 reload.
- [x] Add objective-selection regressions: reject unreachable destinations, fall back to a reachable site, and give longer routes sufficient window time. Implement bounded deterministic route checks without rescanning the island bake.
- [x] Replace cargo checks and random demand generation with contact state, localized operation notices, explicit deadline checks and automatic follow-up notices. Normalize legacy saves without reviving a cooling-down operation.
- [x] Replace cargo bars with public instructions, contact state and next-broadcast countdown. Add a map-location button through the existing focus callback; this moves only the camera and dismisses the objective panel on desktop/phone.
- [x] Update map actions, audio metadata, guide diagram and bilingual copy; retain score bonus. Update design/runtime documentation to describe shipped behavior.
- [x] Run focused tests, full Vitest, lint and build. Use Playwright (Browser plugin absent) for desktop/phone objective navigation and contact/boarding checks; inspect screenshots and browser errors.

## Acceptance

No random item, cargo value, clue or rescue-refusal roll controls admission. A real known location remains the destination after reload; cooldown does not fabricate one. Map navigation does not move the survivor, spend time or reveal POIs. Existing seeded gameplay, typography roles, debounced persistence and the v7 key remain intact.

## Added scope and verification

- [x] Revise existing arrival events and local activity for months after the outbreak: rare concealed people, abandoned traces, plausible failure consequences and one locked interior room.
- [x] Add interactive dangerous-area crossings before costs, bilingual timeline outcomes, one-shot settlement and v7 departure/arrival save consistency.
- [x] Independent review fixed candidate sampling, action-blocking and glide-save issues.

Final verification: 94 Vitest files / 783 tests pass; lint passes with the existing 23-warning allowance; production build/typecheck passes. Build retains its existing large-chunk warning. Playwright desktop (1440×1000) and phone (390×844) checks passed: locate closes the objective sheet, changes camera only, does not reveal POIs; one phone crossing host; withdrawal is free; empty-pack report then boarding works in EN/ZH. Screenshots inspected in tmp/evacuation-qa. Browser plugin not available; regular Playwright used. External basemap network was unavailable, so UI QA supplied an empty local basemap source while retaining real MapLibre and gameplay overlays. External-resource network denial is outside these UI assertions.
