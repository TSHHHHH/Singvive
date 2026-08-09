import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Player settings.
//
// Designed to grow: every setting is a data-driven descriptor in
// SETTINGS_SCHEMA, so adding a new option is a one-liner and the Settings panel
// renders it automatically. Values are a flat id→choice map persisted to
// localStorage, independent of any run.
// ---------------------------------------------------------------------------

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingDef {
  key: string;
  label: string;
  description?: string;
  /** grouping header in the settings panel */
  group: string;
  options: SettingOption[];
  default: string;
}

// ---- Timeline / log view modes ----
// `count` = how many past log entries to show (Infinity = all). A live event
// node is always shown on top of this.
export interface LogViewMode {
  id: string;
  label: string;
  count: number;
}

export const LOG_VIEW_MODES: LogViewMode[] = [
  { id: 'full', label: 'Full', count: Infinity },
  { id: 'latest', label: 'Latest', count: 1 },
  { id: 'recent5', label: 'Recent 5', count: 5 },
  { id: 'recent10', label: 'Recent 10', count: 10 },
];

export function logViewMode(id: string): LogViewMode {
  return LOG_VIEW_MODES.find((m) => m.id === id) ?? LOG_VIEW_MODES[0];
}

// ---- The schema (single source of truth for the Settings panel) ----
export const SETTINGS_SCHEMA: SettingDef[] = [
  {
    key: 'logView',
    label: 'Timeline detail',
    description: 'How much of the timeline to keep on screen.',
    group: 'Timeline',
    options: LOG_VIEW_MODES.map((m) => ({ value: m.id, label: m.label })),
    default: 'recent10',
  },
];

const STORAGE_KEY = 'singvive.settings.v1';

function defaults(): Record<string, string> {
  return Object.fromEntries(SETTINGS_SCHEMA.map((s) => [s.key, s.default]));
}

function loadSettings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults(), ...(JSON.parse(raw) as Record<string, string>) };
  } catch {
    /* ignore */
  }
  return defaults();
}

interface SettingsState {
  values: Record<string, string>;
  setSetting: (key: string, value: string) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  values: loadSettings(),
  setSetting: (key, value) => {
    const values = { ...get().values, [key]: value };
    set({ values });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
      /* storage unavailable — non-fatal */
    }
  },
}));

/** Read a single setting's current value (falling back to its schema default). */
export function useSetting(key: string): string {
  return useSettings(
    (s) => s.values[key] ?? SETTINGS_SCHEMA.find((d) => d.key === key)?.default ?? '',
  );
}
