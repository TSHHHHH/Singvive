import { snapshot } from './fog';
import { haversine } from './overpass';
import type { Rng } from './rng';
import type { IntelBias, LocationState, MapAnnotation, PoiCategory } from './types';

export const DEFAULT_INTEL_RADIUS_M = 1200;
export const MAX_INTEL_POOL = 4;
export const MAX_MAP_ANNOTATIONS = 8;
export const DEFAULT_RUMOUR_FUZZ_M = 250;

const M_PER_DEG_LAT = 111_320;

function mPerDegLng(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Offset a point by metres along a random bearing — for smudged map pins. */
export function offsetLatLng(
  lat: number,
  lng: number,
  distM: number,
  angleRad: number,
): { lat: number; lng: number } {
  return {
    lat: lat + (distM * Math.cos(angleRad)) / M_PER_DEG_LAT,
    lng: lng + (distM * Math.sin(angleRad)) / mPerDegLng(lat),
  };
}

export interface IntelOrigin {
  lat: number;
  lng: number;
  /** Skip self when picking from a site. */
  excludeId?: string;
}

function nearbyUndiscovered(
  locs: Record<string, LocationState>,
  origin: IntelOrigin,
  radiusM: number,
  excludeEvacId?: string | null,
): { l: LocationState; d: number }[] {
  return Object.values(locs)
    .filter(
      (l) =>
        l.id !== origin.excludeId &&
        !l.discovered &&
        l.id !== excludeEvacId,
    )
    .map((l) => ({ l, d: haversine(origin.lat, origin.lng, l.lat, l.lng) }))
    .filter((x) => x.d <= radiusM);
}

function sortPool(
  nearby: { l: LocationState; d: number }[],
  bias: IntelBias,
): { l: LocationState; d: number }[] {
  if (bias === 'any') {
    return [...nearby].sort((a, b) => a.d - b.d);
  }
  if (bias === 'danger') {
    return [...nearby].sort(
      (a, b) => b.l.currentDanger - a.l.currentDanger || a.d - b.d,
    );
  }
  if (bias === 'outpost') {
    const ops = nearby.filter((x) => x.l.isFactionOutpost);
    return ops.length ? [...ops].sort((a, b) => a.d - b.d) : [];
  }
  if (bias === 'faction') {
    const held = nearby.filter((x) => x.l.factionId);
    return held.length ? [...held].sort((a, b) => a.d - b.d) : [];
  }
  const cats = bias as readonly PoiCategory[];
  const preferred = nearby.filter((x) => cats.includes(x.l.category));
  return preferred.length
    ? [...preferred].sort((a, b) => a.d - b.d)
    : [...nearby].sort((a, b) => a.d - b.d);
}

/** Pick one undiscovered POI near `origin`, biased by note type or faction intel. */
export function pickIntelTarget(
  rng: Rng,
  locs: Record<string, LocationState>,
  origin: IntelOrigin,
  bias: IntelBias,
  radiusM = DEFAULT_INTEL_RADIUS_M,
  excludeEvacId?: string | null,
): LocationState | null {
  const nearby = nearbyUndiscovered(locs, origin, radiusM, excludeEvacId);
  const preferred = sortPool(nearby, bias);
  const pool =
    preferred.length > 0
      ? preferred
      : bias === 'danger' || bias === 'any' || Array.isArray(bias)
        ? [...nearby].sort((a, b) => a.d - b.d)
        : [];
  if (!pool.length) return null;
  const top = Math.min(MAX_INTEL_POOL, pool.length);
  return pool[rng.int(0, top - 1)].l;
}

/** Mark a site discovered; reveal faction identity when held. */
export function applyPreciseReveal(
  locs: Record<string, LocationState>,
  targetId: string,
): { locs: Record<string, LocationState>; target: LocationState } | null {
  const pick = locs[targetId];
  if (!pick) return null;
  const revealed: LocationState = {
    ...pick,
    discovered: true,
    isFactionRevealed: pick.factionId ? true : pick.isFactionRevealed,
  };
  revealed.lastSeen = snapshot(revealed);
  return { locs: { ...locs, [targetId]: revealed }, target: revealed };
}

/** Turf map — reveal several nearby faction-held sites at once. */
export function applyFactionTurfReveal(
  rng: Rng,
  locs: Record<string, LocationState>,
  origin: IntelOrigin,
  count: number,
  radiusM = DEFAULT_INTEL_RADIUS_M,
  excludeEvacId?: string | null,
): { locs: Record<string, LocationState>; revealed: LocationState[] } {
  const nearby = nearbyUndiscovered(locs, origin, radiusM, excludeEvacId).filter(
    (x) => x.l.factionId,
  );
  if (!nearby.length) return { locs, revealed: [] };
  const shuffled = [...nearby].sort((a, b) => a.d - b.d);
  const picks: LocationState[] = [];
  let next = { ...locs };
  const take = Math.min(count, shuffled.length);
  const start = rng.int(0, Math.max(0, Math.min(MAX_INTEL_POOL, shuffled.length) - take));
  for (let i = 0; i < take; i++) {
    const target = shuffled[start + i]?.l;
    if (!target || next[target.id]?.discovered) continue;
    const applied = applyPreciseReveal(next, target.id);
    if (!applied) continue;
    next = applied.locs;
    picks.push(applied.target);
  }
  return { locs: next, revealed: picks };
}

/** Fuzzy pin offset from the true target — rumoured stash / smudged map. */
export function createRumourAnnotation(
  rng: Rng,
  target: LocationState,
  fuzzM: number,
  label: string,
  id: string,
  day: number,
): MapAnnotation {
  const dist = rng.int(Math.round(fuzzM * 0.35), fuzzM);
  const angle = rng.next() * Math.PI * 2;
  const pos = offsetLatLng(target.lat, target.lng, dist, angle);
  return {
    id,
    lat: pos.lat,
    lng: pos.lng,
    label,
    targetId: target.id,
    createdDay: day,
  };
}

/** Drop annotations whose target has since been discovered. */
export function pruneMapAnnotations(
  annotations: MapAnnotation[],
  locs: Record<string, LocationState>,
): MapAnnotation[] {
  return annotations.filter((a) => !locs[a.targetId]?.discovered);
}
