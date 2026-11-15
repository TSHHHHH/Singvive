import { expect, it } from 'vitest';
import { parseEnvelope } from './protocol';

it('accepts only bounded sequential envelopes and known command shapes', () => {
  expect(parseEnvelope(JSON.stringify({ type: 'command', seq: 1, command: { type: 'travel', site: 'market' } }))).toEqual({ type: 'command', seq: 1, command: { type: 'travel', site: 'market' } });
  for (const command of [{ type: 'travel', site: '__proto__' }, { type: 'take', item: 'hp' }, { type: 'stance', stance: 'god' }, { type: 'stance', stance: ['guarded'] }, { type: 'rescue' }, { type: 'teleport' }]) {
    expect(parseEnvelope(JSON.stringify({ type: 'command', seq: 1, command }))).toBeNull();
  }
  expect(parseEnvelope('{')).toBeNull();
  expect(parseEnvelope(' '.repeat(2049))).toBeNull();
  expect(parseEnvelope(JSON.stringify({ type: 'command', seq: -1, command: { type: 'pause' } }))).toBeNull();
});
