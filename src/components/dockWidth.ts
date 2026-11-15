/** Keep at least 60% of a desktop viewport available to the map. */
export function dockWidth(viewport: number, saved: string) {
  const min = 320;
  const max = Math.max(min, Math.min(560, Math.floor(viewport * 0.4)));
  const fallback = viewport >= 1440 ? 384 : 360;
  const parsed = Number(saved);
  const preferred = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return { min, max, width: Math.round(Math.max(min, Math.min(max, preferred))) };
}
