import type { IslandInteriorCommand } from './islandBuildings';
import type { ItemInstance } from '../game/types';
import type { IslandPoint, IslandWorld } from './islandModel';
import type { ExpeditionCommand, ExpeditionCraft, ExpeditionSurvivor } from './expeditionSurvivor';
export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 4;
export const SITES = [
  { id: 'shelter', name: 'Rendezvous', x: 18, y: 72, description: 'Safe meeting point. Bring a replacement survivor here.', links: ['pharmacy', 'market'] },
  { id: 'pharmacy', name: 'Pharmacy', x: 25, y: 24, description: 'Medical supplies. Search, then collect from the shared cache.', links: ['shelter', 'market', 'evac'] },
  { id: 'market', name: 'Market', x: 57, y: 55, description: 'Food and a hostile encounter. Teammates can join the fight.', links: ['shelter', 'pharmacy', 'evac'] },
  { id: 'evac', name: 'Extraction', x: 83, y: 22, description: 'Board individually. The expedition continues for those left behind.', links: ['pharmacy', 'market'] },
] as const;
export type SiteId = string;
export type Stance = 'guarded' | 'aggressive' | 'precision';
export type LifeStatus = 'active' | 'downed' | 'dead' | 'extracted';
export type Action = { kind: 'travel' | 'search' | 'rest' | 'rescue' | 'extract' | 'craft' | 'treat'; startedAt: number; endsAt: number; target?: string; route?: IslandPoint[]; mode?: 'surface' | 'tunnel' | 'interior'; travelHours?: number; craft?: ExpeditionCraft };
export interface Survivor {
  id: string; name: string; connected: boolean; status: LifeStatus; site: SiteId;
  hp: number; wounds: number; medical: number; food: number; stance: Stance;
  action: Action | null; fighting: boolean; downedUntil: number | null; life: number; kills: number;
  expedition?: ExpeditionSurvivor; previousSite?: string;
}
export interface SiteState { searches: number; medical: number; food: number; enemyHp: number; round: number; items?: ItemInstance[] }
export interface RoomState {
  version: 1; code: string; seed: string; revision: number; phase: 'lobby' | 'running' | 'ended';
  hostId: string; simMs: number; wallAt: number; nextCombatAt: number;
  pause: { reason: string; by: string | null; graceUntil: number } | null;
  ready: string[]; resumeAt: number | null;
  players: Survivor[]; sites: Record<SiteId, SiteState>;
  log: { at: number; text: string }[];
  world?: IslandWorld;
}
export type Command =
  | IslandInteriorCommand
  | { type: 'start' | 'pause' | 'ready' | 'cancel' | 'search' | 'rest' | 'fight' | 'flee' | 'extract' | 'replace' | 'eat' }
  | { type: 'travel'; site: SiteId }
  | { type: 'tunnel'; stationId: string }
  | { type: 'trek'; lat: number; lng: number }
  | { type: 'spawn'; district: string }
  | { type: 'occupation'; occupationId: string }
  | { type: 'takeItem'; uid: string }
  | { type: 'giveItem'; uid: string; playerId: string }
  | ExpeditionCommand
  | { type: 'stance'; stance: Stance }
  | { type: 'rescue'; playerId: string }
  | { type: 'take'; item: 'medical' | 'food' }
  | { type: 'give'; item: 'medical' | 'food'; playerId: string };
export interface CommandEnvelope { type: 'command'; seq: number; command: Command }
export interface Credentials { room: string; playerId: string; token: string; nextSeq: number }
export type ServerMessage =
  | { type: 'snapshot'; room: RoomState; playerId: string; nextSeq: number; serverNow: number }
  | { type: 'ack'; seq: number; error?: string }
  | { type: 'error'; error: string };
