import type { Command, CommandEnvelope } from './model';

const simple = new Set(['start', 'pause', 'ready', 'cancel', 'search', 'rest', 'fight', 'flee', 'extract', 'replace', 'eat', 'enterBuilding', 'leaveUnit', 'exitBuilding']);
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9:./_-]{1,256}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
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
  } else if (c.type === 'stairs' && Number.isSafeInteger(c.level) && Number(c.level) >= 1 && Number(c.level) <= 100) {
    command = {type:'stairs',level:Number(c.level)};
  } else if (c.type === 'enterUnit' && id(c.unitId)) {
    command = {type:'enterUnit',unitId:c.unitId};
  } else if (c.type === 'tunnel' && id(c.stationId)) {
    command = { type: 'tunnel', stationId: c.stationId };
  } else if (c.type === 'travel' && id(c.site)) {
    command = { type: 'travel', site: c.site };
  } else if (c.type === 'trek' && typeof c.lat === 'number' && typeof c.lng === 'number' && Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.lat >= 1.15 && c.lat <= 1.5 && c.lng >= 103.6 && c.lng <= 104.1) {
    command = { type: 'trek', lat: c.lat, lng: c.lng };
  } else if (c.type === 'spawn' && id(c.district)) {
    command = { type: 'spawn', district: c.district };
  } else if (c.type === 'occupation' && id(c.occupationId)) {
    command = { type: 'occupation', occupationId: c.occupationId };
  } else if (c.type === 'craft' && id(c.recipeId)) {
    command = { type: 'craft', recipeId: c.recipeId };
  } else if (typeof c.type === 'string' && ['useItem','dropItem','equipItem','takeItem','giveItem'].includes(c.type) && id(c.uid)) {
    if (c.type === 'giveItem') {
      if (!id(c.playerId)) return null;
      command = { type: 'giveItem', uid: c.uid, playerId: c.playerId };
    } else if (c.type === 'useItem') {
      if (c.part !== undefined && (typeof c.part !== 'string' || !['head','torso','leftArm','rightArm','leftLeg','rightLeg'].includes(c.part))) return null;
      command = { type: 'useItem', uid: c.uid, ...(c.part ? { part: c.part } : {}) } as Command;
    } else command = { type: c.type, uid: c.uid } as Command;
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
