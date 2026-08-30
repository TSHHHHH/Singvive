import { describe, expect, it } from 'vitest';
import { groupLogEntries, inferLogScope, scopeKey } from './logGroup';
import type { GameLogEntry, LogScope } from './types';

function entry(id: number, scope?: LogScope): GameLogEntry {
  return { id, text: `line ${id}`, tone: 'info', day: 1, hour: 8, scope };
}

describe('scopeKey', () => {
  it('is stable per scope kind', () => {
    expect(scopeKey({ kind: 'hdb_unit', blockId: 'blk', level: 3, unitId: 'L3-c2', label: '#03-412' })).toBe(
      'hdb_unit:blk:L3-c2',
    );
    expect(scopeKey({ kind: 'tunnel_node', runId: 'run1', nodeId: 'c2l0', label: 'Signal board' })).toBe(
      'tunnel_node:run1:c2l0',
    );
  });
});

describe('groupLogEntries', () => {
  it('returns empty for empty input', () => {
    expect(groupLogEntries([])).toEqual([]);
  });

  it('leaves unscoped entries flat', () => {
    const e = entry(1);
    expect(groupLogEntries([e])).toEqual([{ type: 'flat', entry: e }]);
  });

  it('merges consecutive same-scope entries', () => {
    const scope: LogScope = {
      kind: 'hdb_unit',
      blockId: 'blk',
      level: 3,
      unitId: 'L3-c2',
      label: '#03-412',
    };
    const a = entry(1, scope);
    const b = entry(2, scope);
    const groups = groupLogEntries([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ type: 'section', key: 'hdb_unit:blk:L3-c2', entries: [a, b] });
  });

  it('splits on scope change', () => {
    const s1: LogScope = { kind: 'hdb_floor', blockId: 'blk', level: 3 };
    const s2: LogScope = {
      kind: 'hdb_unit',
      blockId: 'blk',
      level: 3,
      unitId: 'L3-c2',
      label: '#03-412',
    };
    const groups = groupLogEntries([entry(1, s1), entry(2, s2)]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.type).toBe('section');
    expect(groups[1]?.type).toBe('section');
  });

  it('merges consecutive site entries', () => {
    const scope: LogScope = { kind: 'site', locationId: 'shop1', label: 'FairPrice' };
    const a = entry(1, scope);
    const b = entry(2, scope);
    const groups = groupLogEntries([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ type: 'section', key: 'site:shop1', entries: [a, b] });
  });

  it('breaks sections on unscoped entries', () => {
    const scope: LogScope = { kind: 'hdb_floor', blockId: 'blk', level: 2 };
    const groups = groupLogEntries([entry(1, scope), entry(2), entry(3, scope)]);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.type)).toEqual(['section', 'flat', 'section']);
  });
});

describe('inferLogScope', () => {
  it('infers site scope from pending search', () => {
    const scope = inferLogScope({
      pendingSearch: { locationId: 'shop1' },
      locations: { shop1: { name: 'FairPrice' } },
    });
    expect(scope).toEqual({ kind: 'site', locationId: 'shop1', label: 'FairPrice' });
  });

  it('suppresses site scope while traveling', () => {
    expect(
      inferLogScope({
        pendingSearch: { locationId: 'shop1' },
        locations: { shop1: { name: 'FairPrice' } },
        traveling: true,
      }),
    ).toBeUndefined();
  });
});
