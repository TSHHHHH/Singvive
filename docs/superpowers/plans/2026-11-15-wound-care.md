# Wound Care Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Complete tests and review for each task.

**Goal:** Replace instant medical healing with optional targeted care and clear body feedback.
**Architecture:** Pure per-part care helpers integrate with existing survival ticking and store item actions. The existing Body panel renders wounded parts and calls targeted use directly.
**Tech Stack:** React 19, TypeScript 6, Zustand, Vitest, Tailwind 3.
**Spec:** docs/superpowers/specs/2026-11-15-wound-care-design.md

## Global Constraints
- Stay on singvive.run.v7 with migration defaults.
- Pure deterministic game logic; no new dependencies or map parent subscriptions.
- Use src/ui/type.ts typography roles and EN/zh-Hans translations.
- No care ordering gates; dirty wounds heal more slowly, not zero.

### Task 1: Pure care and recovery
Files: src/game/types.ts, src/game/survival.ts, new src/game/woundCare.ts, associated game tests.
- [x] Write failing behavioral tests proving bandaging leaves HP and dirt unchanged, cleaning works before/after bandaging, dirty recovery remains positive but slower, splinting leaves fracture active, pain relief expires, dressings soil, old saves normalize safely.
- [x] Implement optional serializable per-part state and pure helpers. Expose CareAction, careForItem(defId), canCareForPart(part, action), chooseCareTarget(parts, action), applyCare(parts,id,action). Keep identity unchanged for invalid actions.
- [x] Integrate wound creation with damage, deterministic recovery and safe migration. Retain treatInjuries as service stabilization compatibility without instant HP.
- [x] Run focused tests and review diff.

### Task 2: Item/store integration
Files: src/game/store.ts, src/game/data/items.json, src/game/inventory.ts, src/game/restPlan.ts, tests.
- [x] Add targeted applyItem(uid, partId?) with automatic eligible target for existing inventory callers; reject invalid care before consuming items/time.
- [x] Route bandage, clean, pain relief, splint and first aid through pure helpers; preserve systemic infection medicines separately. Advance treatment time and persist. Surface a short result for UI feedback.
- [x] Replace misleading numeric heal item summaries and immediate healing service paths. Apply hydration/rest modifiers through both rest planning and normal clock.
- [x] Test real store consumption/targeting and run TypeScript build.

### Task 3: Compact body care UI
Files: src/components/ConditionPanel.tsx, BodyDoll.tsx, new WoundCarePanel.tsx, src/index.css, EN/zh-Hans messages.
- [x] Add wound/dressing/splint glyphs to existing silhouette with accessible labels; direct care rows only for affected parts, independent choices and clear effects/supply/time cost.
- [x] Add short treatment feedback linked to body part, persistent treatment visuals and reduced-motion handling. No inspection gate or modal.
- [x] Verify desktop/mobile rendering and treatment interactions, including no supplies, combat lockout and recovery states.

### Task 4: Documentation and verification
Files: GAME_DESIGN.md, TECH_STACK.md, src/content/guideContent.ts, guide localization.
- [x] Align body guide, item copy and design rules with implemented mechanics.
- [x] Run full npm test, npm run lint, npm run build; review integrated diff and resolve findings.

## Progress
- Latest main fetched and worktree fast-forwarded to d5c014b; clean starting state.
- Interface check: Task 1 owns pure helpers consumed by Tasks 2/3. Tasks 2/3 share store interface only; parent owns store. No changes to map subscriptions.
- Task 1 complete: 29 focused tests; parent review removed the old permanent 70% cripple recovery cap, since it trapped untreated strain injuries. Long-step and split-step recovery tested across care transitions.
- Task 2 complete: 10 live-store integration tests plus 11 rest tests pass; TypeScript build and lint pass. Medkits have three persisted care charges; IFAK pouches remain single-use. Old flat healing bonuses now increase recovery by the same numerical percentage.
- Task 3 complete: compact care UI and bilingual guidance; desktop and phone treatment interactions verified, including Chinese and reduced motion. No inspection gate.
- Task 4 complete: independent review findings fixed and rereviewed (protected-rest recovery, improvised dressing no-op, remaining medical item mappings). Final standalone suite: 515 tests across 61 files passed. Production build and lint passed, retaining the existing 23-warning lint allowance. Browser checks reported no console errors or horizontal overflow.
- One existing city-damage test timed out while tests, build, and browser checks ran concurrently; the full standalone rerun passed without changing that test or its timeout.
- Recovery timing and supply costs remain initial balance values for gameplay playtesting. Changes are local and uncommitted; nothing deployed.
