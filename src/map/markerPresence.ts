export interface MarkerPresence<T> {
  item: T;
  removeAt: number | null;
}

export function reconcileMarkers<T extends { id: string }>(
  previous: readonly MarkerPresence<T>[], items: readonly T[], now: number, duration: number, limit: number,
): MarkerPresence<T>[] {
  const next: MarkerPresence<T>[] = items.slice(0, limit).map((item) => ({ item, removeAt: null }));
  if (duration <= 0) return next;
  const active = new Set(items.map((item) => item.id));
  for (const entry of previous) {
    if (next.length >= limit) break;
    if (active.has(entry.item.id)) continue;
    const removeAt = entry.removeAt ?? now + duration;
    if (removeAt > now) next.push({ item: entry.item, removeAt });
  }
  return next;
}
