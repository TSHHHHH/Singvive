import { SITES } from './model';
import type { Command, CommandEnvelope } from './model';

const simple = new Set(['start', 'pause', 'ready', 'cancel', 'search', 'rest', 'fight', 'flee', 'extract', 'replace', 'eat']);
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function parseEnvelope(text: string): CommandEnvelope | null {
  if (text.length > 2048) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!record(value) || value.type !== 'command' || !Number.isSafeInteger(value.seq) || Number(value.seq) < 1 || !record(value.command)) return null;
  const c = value.command;
  const seq = Number(value.seq);
  let command: Command;
  if (typeof c.type === 'string' && simple.has(c.type)) {
    command = { type: c.type } as Command;
  } else if (c.type === 'travel' && SITES.some((site) => site.id === c.site)) {
    command = { type: 'travel', site: c.site } as Command;
  } else if (c.type === 'stance' && typeof c.stance === 'string' && ['guarded', 'aggressive', 'precision'].includes(c.stance)) {
    command = { type: 'stance', stance: c.stance } as Command;
  } else if (c.type === 'take' && (c.item === 'medical' || c.item === 'food')) {
    command = { type: 'take', item: c.item };
  } else if ((c.type === 'rescue' || c.type === 'give') && typeof c.playerId === 'string' && c.playerId.length <= 64) {
    if (c.type === 'rescue') command = { type: 'rescue', playerId: c.playerId };
    else if (c.item === 'medical' || c.item === 'food') command = { type: 'give', playerId: c.playerId, item: c.item };
    else return null;
  } else return null;
  return { type: 'command', seq, command };
}
