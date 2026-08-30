import { describe, it, expect } from 'vitest';
import { itemDef } from '../loot';
import { SEARCH_DIMS, footprint } from '../inventory';
import {
  qualityMult,
  highlightFor,
  isGoodFind,
  whisperFor,
  searchSpeedFactor,
  buildSearchSession,
  abortChargeSpent,
  remainingSearchMinutes,
  ensureSearching,
  prioritizeSlot,
  tryReveal,
  searchProgress,
  allSlotsResolved,
  hasFoggedOrSearching,
  type SearchSession,
  type SearchLootPiece,
} from '../searchSession';

const katana = itemDef('katana'); // exotic, scarcity 0.18, maxCondition 75
const rations = itemDef('army_ration'); // not exotic, scarcity 0.35, no maxCondition
const cannedFood = itemDef('canned_food'); // plain, no exotic/scarcity/condition
const stick = itemDef('wooden_stick'); // maxCondition 60, no exotic/scarcity

describe('qualityMult', () => {
  it('stacks exotic, scarcity, and pristine-condition multipliers, capped at 1.8', () => {
    expect(qualityMult(cannedFood)).toBe(1);
    expect(qualityMult(rations)).toBeCloseTo(1.25, 10); // scarcity < 0.45
    expect(qualityMult(stick, 80)).toBeCloseTo(1.35, 10); // condition >= 75
    expect(qualityMult(katana, 80)).toBe(1.8); // 1.35 * 1.4 * 1.25 = 2.36..., capped
  });
});

describe('highlightFor / isGoodFind / whisperFor', () => {
  it('flags exotic items regardless of condition', () => {
    expect(highlightFor(katana, 10)).toBe('exotic');
    expect(isGoodFind(katana, 10)).toBe(true);
  });

  it('flags scarce (non-exotic) items', () => {
    expect(highlightFor(rations)).toBe('scarce');
  });

  it('flags pristine condition on an otherwise ordinary item', () => {
    expect(highlightFor(stick, 80)).toBe('pristine');
    expect(highlightFor(stick, 50)).toBeNull();
  });

  it('finds nothing noteworthy about a plain common item', () => {
    expect(highlightFor(cannedFood)).toBeNull();
    expect(isGoodFind(cannedFood)).toBe(false);
    expect(whisperFor(cannedFood, null)).toBeNull();
  });

  it('writes a distinct whisper line per highlight tier', () => {
    expect(whisperFor(katana, 'exotic')).toContain(katana.name);
    expect(whisperFor(stick, 'pristine')).toContain(stick.name);
    expect(whisperFor(rations, 'scarce')).toContain(rations.name);
  });
});

describe('searchSpeedFactor', () => {
  it('is 1 (no speedup) at the neutral baseline', () => {
    expect(searchSpeedFactor(0, 5, 0)).toBe(1);
  });

  it('increases speed (lowers the factor) with equipment, perception above 5, and traits', () => {
    expect(searchSpeedFactor(0.2, 10, 0.1)).toBeCloseTo(1 / 1.5, 10);
  });

  it('never lets perception below 5 slow the search down', () => {
    expect(searchSpeedFactor(0, 1, 0)).toBe(1);
  });
});

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('buildSearchSession', () => {
  it('packs every piece without overlap and inside the search grid', () => {
    const pieces: SearchLootPiece[] = [
      { defId: 'katana', count: 1 },
      { defId: 'purification_tabs', count: 1 },
      { defId: 'army_ration', count: 1 },
      { defId: 'canned_food', count: 3 },
    ];
    const session = buildSearchSession({
      locationId: 'loc-1',
      stashLocationId: 'loc-1',
      raiding: false,
      fled: false,
      nonce: 'n1',
      pieces,
      totalMinutes: 40,
      speedFactor: 1,
    });

    expect(session.slots).toHaveLength(pieces.length);

    const boxes = session.slots.map((s) => {
      const def = itemDef(s.defId);
      const { w, h } = footprint(def, s.rotated);
      return { x: s.x, y: s.y, w, h };
    });
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(SEARCH_DIMS.w);
      expect(b.y + b.h).toBeLessThanOrEqual(SEARCH_DIMS.h);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it('drops pieces that reference an unknown item def', () => {
    const session = buildSearchSession({
      locationId: 'loc-1',
      stashLocationId: 'loc-1',
      raiding: false,
      fled: false,
      nonce: 'n1',
      pieces: [{ defId: 'canned_food', count: 1 }, { defId: 'not_a_real_item', count: 1 }],
      totalMinutes: 10,
      speedFactor: 1,
    });
    expect(session.slots).toHaveLength(1);
    expect(session.slots[0].defId).toBe('canned_food');
  });

  it('stops placing once the grid (8x5 = 40 cells) is full, dropping the overflow', () => {
    const pieces: SearchLootPiece[] = Array.from({ length: 45 }, () => ({ defId: 'canned_food', count: 1 }));
    const session = buildSearchSession({
      locationId: 'loc-1',
      stashLocationId: 'loc-1',
      raiding: false,
      fled: false,
      nonce: 'n1',
      pieces,
      totalMinutes: 10,
      speedFactor: 1,
    });
    expect(session.slots.length).toBe(SEARCH_DIMS.w * SEARCH_DIMS.h);
  });

  it('splits the time budget across slots proportional to their pack weight', () => {
    // katana (1x4, exotic+scarce) is far heavier than a 1x1 plain item.
    const session = buildSearchSession({
      locationId: 'loc-1',
      stashLocationId: 'loc-1',
      raiding: false,
      fled: false,
      nonce: 'n1',
      pieces: [{ defId: 'katana', count: 1 }, { defId: 'purification_tabs', count: 1 }],
      totalMinutes: 80,
      speedFactor: 1,
    });
    const katanaSlot = session.slots.find((s) => s.defId === 'katana')!;
    const tabsSlot = session.slots.find((s) => s.defId === 'purification_tabs')!;
    expect(katanaSlot.searchMinutes).toBeGreaterThan(tabsSlot.searchMinutes);
    expect(katanaSlot.searchMinutes + tabsSlot.searchMinutes).toBeCloseTo(80, 6);
  });

  it('seeds the session with a fogged queue matching the placed slots and no progress yet', () => {
    const session = buildSearchSession({
      locationId: 'loc-1',
      stashLocationId: 'loc-1',
      raiding: true,
      fled: false,
      nonce: 'n2',
      pieces: [{ defId: 'canned_food', count: 1 }],
      totalMinutes: 5,
      speedFactor: 1,
    });
    expect(session.queue).toEqual(session.slots.map((s) => s.id));
    expect(session.slots.every((s) => s.state === 'fogged')).toBe(true);
    expect(session.revealedCount).toBe(0);
    expect(session.settled).toBe(false);
    expect(session.searchingStartedAt).toBeNull();
  });
});

function twoItemSession(): SearchSession {
  return buildSearchSession({
    locationId: 'loc-1',
    stashLocationId: 'loc-1',
    raiding: false,
    fled: false,
    nonce: 'n',
    pieces: [{ defId: 'canned_food', count: 1 }, { defId: 'purification_tabs', count: 1 }],
    totalMinutes: 20,
    speedFactor: 1,
  });
}

describe('ensureSearching', () => {
  it('promotes the queue head from fogged to searching and stamps the start time', () => {
    const session = twoItemSession();
    const active = ensureSearching(session, 1000);
    const head = active.slots.find((s) => s.id === active.queue[0])!;
    expect(head.state).toBe('searching');
    expect(active.searchingStartedAt).toBe(1000);
  });

  it('is a no-op once the head is already searching', () => {
    const session = twoItemSession();
    const active = ensureSearching(session, 1000);
    expect(ensureSearching(active, 2000)).toBe(active);
  });

  it('drops a resolved head off the front of the queue', () => {
    const session = twoItemSession();
    const headId = session.queue[0];
    const resolved: SearchSession = {
      ...session,
      slots: session.slots.map((s) => (s.id === headId ? { ...s, state: 'taken' as const } : s)),
    };
    const advanced = ensureSearching(resolved, 1000);
    expect(advanced.queue).toEqual(session.queue.slice(1));
  });
});

describe('tryReveal', () => {
  it('returns null before the slot timer has elapsed', () => {
    const session = twoItemSession();
    const started = ensureSearching(session, 1000);
    expect(tryReveal(started, 1000, 'uid-1')).toBeNull();
  });

  it('reveals the slot once its full duration has elapsed, and starts the next one', () => {
    const session = twoItemSession();
    const started = ensureSearching(session, 1000);
    const headId = started.queue[0];
    const head = started.slots.find((s) => s.id === headId)!;

    const result = tryReveal(started, 1000 + head.remainingMs, 'uid-1');
    expect(result).not.toBeNull();
    expect(result!.slot.state).toBe('found');
    expect(result!.slot.uid).toBe('uid-1');
    expect(result!.session.revealedCount).toBe(1);
    expect(result!.session.queue).toEqual([started.queue[1]]);
    // The next slot should already have been kicked off searching.
    const nextHead = result!.session.slots.find((s) => s.id === result!.session.queue[0])!;
    expect(nextHead.state).toBe('searching');
  });
});

describe('prioritizeSlot', () => {
  it('pauses the current search (preserving remaining time) and moves the target to the front', () => {
    const session = twoItemSession();
    const started = ensureSearching(session, 1000);
    const originalHeadId = started.queue[0];
    const otherId = started.queue[1];
    const originalHead = started.slots.find((s) => s.id === originalHeadId)!;

    const elapsed = 200;
    const prioritized = prioritizeSlot(started, otherId, 1000 + elapsed);

    expect(prioritized.queue[0]).toBe(otherId);
    const pausedOriginal = prioritized.slots.find((s) => s.id === originalHeadId)!;
    expect(pausedOriginal.state).toBe('fogged');
    expect(pausedOriginal.remainingMs).toBe(originalHead.remainingMs - elapsed);

    const newHead = prioritized.slots.find((s) => s.id === otherId)!;
    expect(newHead.state).toBe('searching');
  });

  it('is a no-op when the target is already the searching head', () => {
    const session = twoItemSession();
    const started = ensureSearching(session, 1000);
    const headId = started.queue[0];
    expect(prioritizeSlot(started, headId, 1500)).toBe(started);
  });

  it('is a no-op for a slot that is already resolved', () => {
    const session = twoItemSession();
    const headId = session.queue[0];
    const taken: SearchSession = {
      ...session,
      slots: session.slots.map((s) => (s.id === headId ? { ...s, state: 'taken' as const } : s)),
    };
    expect(prioritizeSlot(taken, headId, 1000)).toBe(taken);
  });
});

describe('searchProgress', () => {
  it('is 0 before anything is searching', () => {
    const session = twoItemSession();
    expect(searchProgress(session, 1000)).toBe(0);
  });

  it('rises from 0 to 1 as the current slot search elapses, clamped at 1', () => {
    const session = twoItemSession();
    const started = ensureSearching(session, 1000);
    const head = started.slots.find((s) => s.id === started.queue[0])!;
    expect(searchProgress(started, 1000)).toBe(0);
    expect(searchProgress(started, 1000 + head.remainingMs / 2)).toBeCloseTo(0.5, 5);
    expect(searchProgress(started, 1000 + head.remainingMs * 5)).toBe(1);
  });
});

describe('allSlotsResolved / hasFoggedOrSearching', () => {
  it('reports unresolved while any slot is fogged or searching, resolved once all are taken', () => {
    const session = twoItemSession();
    expect(allSlotsResolved(session)).toBe(false);
    expect(hasFoggedOrSearching(session)).toBe(true);

    const done: SearchSession = { ...session, slots: session.slots.map((s) => ({ ...s, state: 'taken' as const })) };
    expect(allSlotsResolved(done)).toBe(true);
    expect(hasFoggedOrSearching(done)).toBe(false);
  });
});

describe('abortChargeSpent', () => {
  it('charges the full budget for a session with no slots', () => {
    const session = twoItemSession();
    expect(abortChargeSpent({ ...session, slots: [], chargeBudget: 2 })).toBe(2);
  });

  it('never charges less than the 0.15 floor even with zero reveals', () => {
    const session = twoItemSession();
    expect(abortChargeSpent({ ...session, chargeBudget: 1, revealedCount: 0 })).toBeCloseTo(0.15, 10);
  });

  it('scales with the fraction of slots already revealed', () => {
    const session = twoItemSession();
    expect(abortChargeSpent({ ...session, chargeBudget: 1, revealedCount: 1 })).toBe(0.5);
  });
});

describe('remainingSearchMinutes', () => {
  it('sums minutes only for fogged/searching slots, ignoring resolved ones', () => {
    const session = twoItemSession();
    const totalBefore = remainingSearchMinutes(session);
    expect(totalBefore).toBeCloseTo(20, 6);

    const oneTaken: SearchSession = {
      ...session,
      slots: session.slots.map((s, i) => (i === 0 ? { ...s, state: 'taken' as const } : s)),
    };
    expect(remainingSearchMinutes(oneTaken)).toBeCloseTo(session.slots[1].searchMinutes, 6);
  });
});
