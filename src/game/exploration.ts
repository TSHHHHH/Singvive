import type { LocationState, PoiCategory, WeatherKind } from './types';
import { haversine } from './overpass';
import { Rng } from './rng';

export interface ExplorationLead {
  id: string; sourceId: string; targetId: string;
  source: 'search' | 'noticeboard' | 'locality'; createdDay: number; completedDay?: number;
  facility?: 'water' | 'shelter' | 'stove';
}

type Position = { lat: number; lng: number };
type Facility = NonNullable<ExplorationLead['facility']>;
const EXTERIOR_CATEGORIES = new Set<PoiCategory>([
  'supermarket', 'fuel', 'police', 'hospital', 'residential', 'housing',
  'community', 'park', 'foodcourt', 'mrt', 'school', 'landmark',
]);
const PUBLIC_CATEGORIES = new Set<PoiCategory>([
  'hospital', 'clinic', 'pharmacy', 'supermarket', 'police', 'community', 'park', 'foodcourt', 'mrt', 'school', 'landmark',
]);
const SURVIVAL_CATEGORIES = new Set<PoiCategory>([
  'clinic', 'pharmacy', 'supermarket', 'convenience', 'foodcourt', 'hardware', 'community', 'hospital',
]);

/** Sight is the existing daylight/night-sight multiplier, not a distance. */
export function recognitionRadius(awareness: number, sight: number, weather: WeatherKind): number {
  const base = Math.max(20, Math.min(60, 20 + (Number.isFinite(awareness) ? awareness : 5) * 3));
  const light = Number.isFinite(sight) ? Math.max(0, Math.min(1, sight)) : 0;
  const visibility = weather === 'thunderstorm' ? 0.5 : weather === 'haze' ? 0.6 : weather === 'rain' ? 0.75 : 1;
  return base * light * visibility;
}

function inside(point: Position, ring: [number, number][]): boolean {
  let contained = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ay, ax] = ring[i], [by, bx] = ring[j];
    if ((ay > point.lat) !== (by > point.lat)
      && point.lng < (bx - ax) * (point.lat - ay) / (by - ay) + ax) contained = !contained;
  }
  return contained;
}

function crosses(a: Position, b: Position, c: [number, number], d: [number, number]): boolean {
  const orient = (p: Position, q: Position, r: Position) =>
    (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng);
  const p = { lat: c[0], lng: c[1] }, q = { lat: d[0], lng: d[1] };
  if (Math.max(a.lat, b.lat) < Math.min(p.lat, q.lat) || Math.min(a.lat, b.lat) > Math.max(p.lat, q.lat)
    || Math.max(a.lng, b.lng) < Math.min(p.lng, q.lng) || Math.min(a.lng, b.lng) > Math.max(p.lng, q.lng)) return false;
  return orient(a, b, p) * orient(a, b, q) <= 0 && orient(p, q, a) * orient(p, q, b) <= 0;
}

/** Conservative occlusion using available POI footprints, not a full GIS sightline. */
export function recognizeNearby(locations: Record<string, LocationState>, origin: Position, radiusM: number): Record<string, LocationState> {
  if (!(radiusM > 0)) return locations;
  const all = Object.values(locations);
  const candidates = all.filter(loc => !loc.identified && !loc.discovered && EXTERIOR_CATEGORIES.has(loc.category)
    && haversine(origin.lat, origin.lng, loc.lat, loc.lng) <= radiusM);
  if (candidates.length === 0) return locations;
  const footprints = all.filter(loc => loc.outline && loc.outline.length >= 3);
  let next = locations;
  for (const loc of candidates) {
    const blocked = footprints.some(building => {
      if (building.id === loc.id) return false;
      const ring = building.outline!;
      // Embedded shops are not exterior signs, even if their containing building is known.
      if (inside(loc, ring)) return true;
      if (inside(origin, ring)) return false;
      return ring.some((point, i) => crosses(origin, loc, point, ring[(i + 1) % ring.length]));
    });
    if (blocked) continue;
    if (next === locations) next = { ...locations };
    next[loc.id] = { ...loc, identified: true };
  }
  return next;
}

export function findExplorationLeads(
  seed: string, locations: Record<string, LocationState>, sourceId: string,
  source: ExplorationLead['source'], day: number, existing: ExplorationLead[], excludeId?: string,
): ExplorationLead[] {
  const origin = locations[sourceId];
  if (!origin || !validDay(day)) return [];
  if (source === 'search' ? origin.searchClueChecked : origin.localMapRead) return [];
  if (source === 'locality' && !origin.isMrtStation && origin.category !== 'mrt') return [];
  if (source === 'noticeboard' && origin.category !== 'community' && origin.category !== 'residential') return [];
  if (existing.some(lead => lead.sourceId === sourceId && lead.source === source)) return [];
  const slots = 6 - existing.filter(lead => lead.completedDay === undefined).length;
  if (slots <= 0) return [];
  const rng = new Rng(seed).fork(`exploration:${sourceId}:${source}`);
  if (source === 'search' && !rng.chance(0.35)) return [];
  const used = new Set(existing.map(lead => lead.targetId));
  const radius = source === 'locality' ? 400 : 800;
  const candidates = Object.values(locations).filter(loc => loc.id !== sourceId && loc.id !== excludeId
    && !loc.visited && !loc.discovered && !used.has(loc.id) && loc.category !== 'waypoint'
    && (source !== 'locality' || PUBLIC_CATEGORIES.has(loc.category))
    && haversine(origin.lat, origin.lng, loc.lat, loc.lng) <= radius)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ranked = rng.shuffle(candidates).map(loc => ({
    loc, facility: source === 'locality' ? null : localFacilityFor(seed, loc),
  })).filter(candidate => source === 'locality' || candidate.facility || SURVIVAL_CATEGORIES.has(candidate.loc.category));
  // Stable sort retains the seeded shuffle within each useful-destination tier.
  ranked.sort((a, b) => Number(Boolean(b.facility)) - Number(Boolean(a.facility))
    || Number(SURVIVAL_CATEGORIES.has(b.loc.category)) - Number(SURVIVAL_CATEGORIES.has(a.loc.category)));
  return ranked.slice(0, Math.min(slots, source === 'locality' ? 3 : 1)).map(({ loc, facility }) => {
    return {
      id: `explore:${source}:${sourceId}:${loc.id}`, sourceId, targetId: loc.id, source, createdDay: day,
      ...(facility ? { facility } : {}),
    };
  });
}

export function completeExplorationLeads(leads: ExplorationLead[], targetId: string, day: number): ExplorationLead[] {
  if (!validDay(day) || !leads.some(lead => lead.targetId === targetId && lead.completedDay === undefined)) return leads;
  return leads.map(lead => lead.targetId === targetId && lead.completedDay === undefined
    ? { ...lead, completedDay: Math.max(day, lead.createdDay) } : lead);
}

function validDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

/** Old saves have no leads; malformed entries are discarded without revealing or completing sites. */
export function normalizeExplorationLeads(value: unknown, locations: Record<string, LocationState>): ExplorationLead[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>(), targets = new Set<string>();
  const active: ExplorationLead[] = [], completed: ExplorationLead[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id || row.id.length > 500 || ids.has(row.id)
      || typeof row.sourceId !== 'string' || !Object.hasOwn(locations, row.sourceId)
      || typeof row.targetId !== 'string' || !Object.hasOwn(locations, row.targetId)
      || row.sourceId === row.targetId || targets.has(row.targetId)
      || (row.source !== 'search' && row.source !== 'noticeboard' && row.source !== 'locality')
      || !validDay(row.createdDay)
      || (row.completedDay !== undefined && (!validDay(row.completedDay) || row.completedDay < row.createdDay))
      || (row.facility !== undefined && row.facility !== 'water' && row.facility !== 'stove' && row.facility !== 'shelter')) continue;
    const lead: ExplorationLead = {
      id: row.id, sourceId: row.sourceId, targetId: row.targetId, source: row.source, createdDay: row.createdDay,
      ...(row.completedDay === undefined ? {} : { completedDay: row.completedDay as number }),
      ...(row.facility === undefined ? {} : { facility: row.facility as Facility }),
    };
    ids.add(lead.id);
    targets.add(lead.targetId);
    if (lead.completedDay !== undefined) completed.push(lead);
    else if (active.length < 6) active.push(lead);
  }
  return [...active, ...completed.sort((a, b) => b.completedDay! - a.completedDay!).slice(0, 24 - active.length)];
}

export function localFacilityFor(seed: string, loc: LocationState): Facility | null {
  if (loc.factionId || loc.isFactionOutpost) return null;
  const choices: Facility[] = [];
  if (['community', 'school', 'park', 'mrt', 'hospital'].includes(loc.category)) choices.push('water');
  if (['community', 'school', 'park', 'mrt', 'residential', 'housing'].includes(loc.category)) choices.push('shelter');
  if (['community', 'foodcourt', 'eatery'].includes(loc.category)) choices.push('stove');
  if (!choices.length) return null;
  const rng = new Rng(seed).fork(`local-facility:${loc.id}`);
  return rng.chance(0.3) ? rng.pick(choices) : null;
}

/** Arrival marks the check even when empty: ownership changes and return trips cannot reroll it. */
export function discoverLocalFacility(seed: string, loc: LocationState): LocationState {
  if (loc.localFacilityChecked) return loc;
  const next = { ...loc, localFacilityChecked: true };
  const kind = localFacilityFor(seed, loc);
  if (kind === 'water' && !loc.facilities?.water) {
    next.facilities = { ...loc.facilities, water: { amount: 2, hotUntil: 0 } };
  } else if (kind === 'stove' && !loc.facilities?.stove) {
    next.facilities = { ...loc.facilities, stove: true };
  } else if (kind === 'shelter' && !loc.facilities?.rainShelter) {
    next.facilities = { ...loc.facilities, rainShelter: true };
  }
  return next;
}
