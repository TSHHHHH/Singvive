import { haversine } from './overpass';
import { Rng } from './rng';
import type { PoiCategory, WeatherKind } from './types';

export type ActivityKind = 'player' | 'car_alarm' | 'gunfire' | 'shutter' | 'scavengers';
export type ActivityEventKind = Exclude<ActivityKind, 'player'>;
export type ActivityBand = 'quiet' | 'stirred' | 'hunting';

export interface ActivitySource {
  id: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  intensity: number;
  /** Absolute game hours; never wall-clock timestamps. */
  createdAt: number;
  expiresAt: number;
  kind: ActivityKind;
}

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  lat: number;
  lng: number;
  createdAt: number;
  expiresAt: number;
  resolved: boolean;
}

export interface ActivityState {
  sources: ActivitySource[];
  /** Persisted ordinal: attempts consume an ID even if no scene happens. */
  sequence: number;
  eventClock: {
    lastAt: number | null;
    distanceM: number;
    day: number;
    count: number;
    lastKind: ActivityEventKind | null;
    /** Last attempted arrival, preventing loops around a doorway from farming scenes. */
    anchorLat?: number;
    anchorLng?: number;
  };
  event: ActivityEvent | null;
}

type ActivityEmission = Pick<ActivitySource, 'lat' | 'lng' | 'radiusMeters' | 'intensity' | 'kind'>;
interface ActivityExploration {
  seed: string;
  lat: number;
  lng: number;
  distanceM: number;
  now: number;
  weather: WeatherKind;
  category?: PoiCategory | null;
}

const MAX_SOURCES = 32;
const SOURCE_HOURS = 6;
const EVENT_HOURS = 1.5;
const MAX_RADIUS_M = 2000;
const MAX_GAME_HOUR = 10_000_000;
const MAX_SEQUENCE = 1_000_000_000;
const KINDS: readonly ActivityKind[] = ['player', 'car_alarm', 'gunfire', 'shutter', 'scavengers'];
const EVENTS: readonly ActivityEventKind[] = ['car_alarm', 'gunfire', 'shutter', 'scavengers'];
const SHOP_CATEGORIES: readonly PoiCategory[] = [
  'supermarket', 'convenience', 'pharmacy', 'hardware', 'eatery', 'foodcourt', 'industrial',
];

export const BASE_ACTIVITY_PRESSURE = 0.42;

export function freshActivity(): ActivityState {
  return {
    sources: [], sequence: 0,
    eventClock: { lastAt: null, distanceM: 0, day: 1, count: 0, lastKind: null },
    event: null,
  };
}

function nextSequence(state: ActivityState): number {
  let sequence = state.sequence >= MAX_SEQUENCE ? 1 : state.sequence + 1;
  while (state.sources.some((source) => source.id === `activity-${sequence}`)
    || state.event?.id === `activity-${sequence}`) {
    sequence = sequence >= MAX_SEQUENCE ? 1 : sequence + 1;
  }
  return sequence;
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function coordinates(lat: unknown, lng: unknown): boolean {
  return finite(lat, -90, 90) && finite(lng, -180, 180);
}

function gameHour(value: unknown): value is number {
  return finite(value, 0, MAX_GAME_HOUR);
}

function currentIntensity(source: ActivitySource, now: number): number {
  const duration = source.expiresAt - source.createdAt;
  if (duration <= 0 || now < source.createdAt || now >= source.expiresAt) return 0;
  return source.intensity * ((source.expiresAt - now) / duration);
}

/** Quiet sources disappear entirely; merely reading the field never mutates it. */
export function pruneActivity(state: ActivityState, now: number): ActivityState {
  if (!gameHour(now)) return state;
  const sources = state.sources.filter((source) => source.expiresAt > now);
  const event = state.event && state.event.expiresAt > now ? state.event : null;
  if (sources.length === state.sources.length && event === state.event) return state;
  return { ...state, sources, event };
}

export function addActivity(state: ActivityState, emission: ActivityEmission, now: number): ActivityState {
  if (!gameHour(now) || !coordinates(emission.lat, emission.lng)
    || !Number.isFinite(emission.radiusMeters) || emission.radiusMeters <= 0
    || !Number.isFinite(emission.intensity) || emission.intensity <= 0
    || !KINDS.includes(emission.kind)) return state;
  const live = pruneActivity(state, now);
  const sequence = nextSequence(live);
  const source: ActivitySource = {
    ...emission, radiusMeters: Math.max(1, Math.min(MAX_RADIUS_M, emission.radiusMeters)),
    intensity: Math.min(1, emission.intensity),
    id: `activity-${sequence}`, createdAt: now, expiresAt: now + SOURCE_HOURS,
  };
  return { ...live, sequence, sources: [...live.sources, source].slice(-MAX_SOURCES) };
}

/** Independent bounded contributions: overlap increases attention but never exceeds one. */
export function activityAt(state: ActivityState, lat: number, lng: number, now: number): number {
  if (!gameHour(now) || !coordinates(lat, lng)) return 0;
  let quiet = 1;
  for (const source of state.sources) {
    const strength = currentIntensity(source, now);
    if (strength <= 0) continue;
    const distance = haversine(source.lat, source.lng, lat, lng);
    if (distance >= source.radiusMeters) continue;
    quiet *= 1 - strength * (1 - distance / source.radiusMeters);
  }
  return Math.min(1, Math.max(0, 1 - quiet));
}

export function activityPressure(state: ActivityState, lat: number, lng: number, now: number): number {
  return BASE_ACTIVITY_PRESSURE + activityAt(state, lat, lng, now) * (1 - BASE_ACTIVITY_PRESSURE);
}

export function activityBand(level: number): ActivityBand {
  return level < 0.12 ? 'quiet' : level < 0.5 ? 'stirred' : 'hunting';
}

/** Rate limits remember failed rolls, elapsed time and distance across saves. */
export function exploreActivity(state: ActivityState, input: ActivityExploration): ActivityState {
  const { lat, lng, now } = input;
  if (!gameHour(now) || !coordinates(lat, lng) || !finite(input.distanceM, 0, 100_000)) return state;
  const live = pruneActivity(state, now);
  const day = Math.floor(now / 24) + 1;
  const previous = live.eventClock;
  // Small genuine travel segments count; the anchor gate prevents local loops farming rolls.
  const distanceM = Math.min(2000, previous.distanceM + input.distanceM);
  const eventClock: ActivityState['eventClock'] = {
    ...previous, distanceM, day, count: day === previous.day ? previous.count : 0,
  };
  const anchored = coordinates(previous.anchorLat, previous.anchorLng);
  const farEnough = !anchored || haversine(previous.anchorLat!, previous.anchorLng!, lat, lng) >= 250;
  const cooldown = previous.lastAt === null || now - previous.lastAt >= 2;
  const mayAttempt = !live.event && distanceM >= 250 && farEnough && cooldown && eventClock.count < 3;
  if (!mayAttempt) {
    if (!anchored) { eventClock.anchorLat = lat; eventClock.anchorLng = lng; }
    if (JSON.stringify(eventClock) === JSON.stringify(previous)) return live;
    return { ...live, eventClock };
  }

  const sequence = nextSequence(live);
  const rng = new Rng(`${input.seed}::activity:${day}:${sequence}`);
  eventClock.lastAt = now;
  eventClock.distanceM = 0;
  eventClock.anchorLat = lat;
  eventClock.anchorLng = lng;
  const attempted = { ...live, sequence, eventClock };
  const storm = input.weather === 'thunderstorm';
  const eligible = EVENTS.filter((kind) => {
    if (kind === previous.lastKind) return false;
    if (kind === 'gunfire') return !storm;
    if (kind === 'shutter') return input.category != null && SHOP_CATEGORIES.includes(input.category);
    if (kind === 'car_alarm') return input.category != null
      && input.category !== 'park' && input.category !== 'waypoint';
    // A lone scavenger only risks contact beside plausible cover, away from
    // an already noisy area; a storm makes this quiet exchange impossible.
    return !storm && input.category != null && input.category !== 'park'
      && input.category !== 'waypoint' && activityAt(live, lat, lng, now) < 0.12;
  });
  if (eligible.length === 0 || !rng.chance(storm ? 0.35 : 0.55)) return attempted;
  const kind = rng.weighted(eligible.map((kind) => [kind, kind === 'scavengers' ? 1 : 12] as const));
  const id = `activity-${sequence}`;
  // Distant shots reveal an audible point nearby, never a hidden location or POI.
  const eventLat = kind === 'gunfire' ? lat + (rng.next() - 0.5) * 0.001 : lat;
  const eventLng = kind === 'gunfire' ? lng + (rng.next() - 0.5) * 0.001 : lng;
  const event: ActivityEvent = {
    id, kind, lat: eventLat, lng: eventLng, createdAt: now,
    expiresAt: now + EVENT_HOURS, resolved: false,
  };
  const effects: Record<ActivityEventKind, [number, number]> = {
    car_alarm: [550, 0.9], gunfire: [900, 0.7], shutter: [300, 0.55], scavengers: [250, 0.35],
  };
  const [radiusMeters, intensity] = effects[kind];
  const source: ActivitySource = {
    id, kind, lat: eventLat, lng: eventLng, radiusMeters, intensity,
    createdAt: now, expiresAt: now + SOURCE_HOURS,
  };
  return {
    ...attempted, event,
    eventClock: { ...eventClock, count: eventClock.count + 1, lastKind: kind },
    sources: [...live.sources, source].slice(-MAX_SOURCES),
  };
}

/** Contextual costs and rewards belong to the caller; a response can quiet a scene only once. */
export function respondActivity(state: ActivityState, now: number): ActivityState {
  const live = pruneActivity(state, now);
  if (!gameHour(now) || !live.event || live.event.resolved) return live;
  const event = { ...live.event, resolved: true };
  const sources = live.sources.map((source) => source.id === event.id
    ? { ...source, intensity: source.intensity * 0.45 }
    : source);
  return { ...live, event, sources };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 96;
}

function kind(value: unknown): value is ActivityKind {
  return typeof value === 'string' && KINDS.includes(value as ActivityKind);
}

function eventKind(value: unknown): value is ActivityEventKind {
  return kind(value) && value !== 'player';
}

function validTimes(value: Record<string, unknown>, now: number, maxLife: number): boolean {
  return gameHour(value.createdAt) && gameHour(value.expiresAt)
    && value.createdAt <= now && value.expiresAt > now
    && value.expiresAt > value.createdAt && value.expiresAt <= value.createdAt + maxLife;
}

/** Missing v7 fields become quiet; malformed persisted data never becomes unbounded pressure. */
export function normalizeActivity(value: unknown, now: number): ActivityState {
  const saved = record(value);
  if (!saved || !gameHour(now)) return freshActivity();
  const sources: ActivitySource[] = [];
  const seen = new Set<string>();
  if (Array.isArray(saved.sources)) {
    // Bound traversal as well as the result for oversized/untrusted saves.
    for (const item of saved.sources.slice(0, 256)) {
      const source = record(item);
      if (!source || !validId(source.id) || seen.has(source.id)
        || !coordinates(source.lat, source.lng) || !kind(source.kind)
        || !finite(source.radiusMeters, 1, MAX_RADIUS_M)
        || !finite(source.intensity, Number.MIN_VALUE, 1)
        || !validTimes(source, now, SOURCE_HOURS)) continue;
      seen.add(source.id);
      sources.push({
        id: source.id, lat: source.lat as number, lng: source.lng as number,
        kind: source.kind, radiusMeters: source.radiusMeters, intensity: source.intensity,
        createdAt: source.createdAt as number, expiresAt: source.expiresAt as number,
      });
    }
  }
  const clock = record(saved.eventClock);
  const fallback = freshActivity();
  const eventClock: ActivityState['eventClock'] = {
    lastAt: clock && gameHour(clock.lastAt) && clock.lastAt <= now ? clock.lastAt : null,
    distanceM: clock && finite(clock.distanceM, 0, 2000) ? clock.distanceM : 0,
    day: clock && finite(clock.day, 1, Math.floor(now / 24) + 1) && Number.isInteger(clock.day)
      ? clock.day : 1,
    count: clock && finite(clock.count, 0, 3) && Number.isInteger(clock.count) ? clock.count : 0,
    lastKind: clock && eventKind(clock.lastKind) ? clock.lastKind : null,
  };
  if (clock && coordinates(clock.anchorLat, clock.anchorLng)) {
    eventClock.anchorLat = clock.anchorLat as number;
    eventClock.anchorLng = clock.anchorLng as number;
  }
  let event: ActivityEvent | null = null;
  const storedEvent = record(saved.event);
  if (storedEvent && validId(storedEvent.id) && eventKind(storedEvent.kind)
    && coordinates(storedEvent.lat, storedEvent.lng) && typeof storedEvent.resolved === 'boolean'
    && validTimes(storedEvent, now, EVENT_HOURS)) {
    event = {
      id: storedEvent.id, kind: storedEvent.kind,
      lat: storedEvent.lat as number, lng: storedEvent.lng as number,
      createdAt: storedEvent.createdAt as number, expiresAt: storedEvent.expiresAt as number,
      resolved: storedEvent.resolved,
    };
  }
  let sequence = finite(saved.sequence, 0, MAX_SEQUENCE) && Number.isInteger(saved.sequence)
    ? saved.sequence : fallback.sequence;
  for (const id of [...seen, ...(event ? [event.id] : [])]) {
    const ordinal = /^activity-(\d+)$/.exec(id);
    const n = ordinal ? Number(ordinal[1]) : 0;
    if (finite(n, 0, MAX_SEQUENCE)) sequence = Math.max(sequence, n);
  }
  return { sources: sources.slice(-MAX_SOURCES), sequence: Math.max(sequence, sources.length), eventClock, event };
}
