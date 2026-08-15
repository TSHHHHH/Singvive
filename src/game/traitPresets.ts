import { isLegalTraitBuild } from './character';

// Player-saved custom trait builds. Independent of the active run — same idea
// as settings.ts: a flat list in localStorage that survives death and reload.

const STORAGE_KEY = 'singvive.traitPresets';
export const MAX_TRAIT_PRESETS = 12;

export interface TraitPreset {
  id: string;
  name: string;
  traitIds: string[];
  updatedAt: number;
}

function sanitize(raw: unknown): TraitPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: TraitPreset[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const traitIds = Array.isArray(r.traitIds)
      ? r.traitIds.filter((t): t is string => typeof t === 'string')
      : [];
    const updatedAt = typeof r.updatedAt === 'number' ? r.updatedAt : Date.now();
    if (!id || !name) continue;
    out.push({ id, name, traitIds, updatedAt });
  }
  return out.slice(0, MAX_TRAIT_PRESETS);
}

export function loadPresets(): TraitPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitize(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function persist(list: TraitPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_TRAIT_PRESETS)));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

function newId(): string {
  return `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Save or overwrite by name (case-insensitive). Returns the stored preset. */
export function savePreset(name: string, traitIds: string[]): TraitPreset | null {
  const trimmed = name.trim().slice(0, 32);
  if (!trimmed) return null;
  if (!isLegalTraitBuild(traitIds)) return null;

  const list = loadPresets();
  const existing = list.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const next: TraitPreset = existing
    ? { ...existing, name: trimmed, traitIds: [...traitIds], updatedAt: Date.now() }
    : { id: newId(), name: trimmed, traitIds: [...traitIds], updatedAt: Date.now() };

  const without = list.filter((p) => p.id !== next.id);
  if (!existing && without.length >= MAX_TRAIT_PRESETS) return null;
  persist([next, ...without].sort((a, b) => b.updatedAt - a.updatedAt));
  return next;
}

export function renamePreset(id: string, name: string): TraitPreset | null {
  const trimmed = name.trim().slice(0, 32);
  if (!trimmed) return null;
  const list = loadPresets();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  if (list.some((p) => p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase())) {
    return null;
  }
  const next = { ...list[idx], name: trimmed, updatedAt: Date.now() };
  list[idx] = next;
  persist(list);
  return next;
}

export function deletePreset(id: string): void {
  persist(loadPresets().filter((p) => p.id !== id));
}

export function getPreset(id: string): TraitPreset | null {
  return loadPresets().find((p) => p.id === id) ?? null;
}
