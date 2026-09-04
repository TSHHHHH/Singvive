import { create } from 'zustand';
import type { ClockFormat } from './survival';

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
  /** Fits the square toggles in the timeline header; `label` is for Settings. */
  shortLabel: string;
  count: number;
}

export const LOG_VIEW_MODES: LogViewMode[] = [
  { id: 'full', label: 'Full', shortLabel: 'All', count: Infinity },
  { id: 'latest', label: 'Latest', shortLabel: '1', count: 1 },
  { id: 'recent5', label: 'Recent 5', shortLabel: '5', count: 5 },
  { id: 'recent10', label: 'Recent 10', shortLabel: '10', count: 10 },
];

export function logViewMode(id: string): LogViewMode {
  return LOG_VIEW_MODES.find((m) => m.id === id) ?? LOG_VIEW_MODES[0];
}

// ---- The schema (single source of truth for the Settings panel) ----
export const SETTINGS_SCHEMA: SettingDef[] = [
  {
    key: 'language',
    label: 'Language',
    description: 'Interface language. Game content follows when a translation exists.',
    group: 'Display',
    options: [
      { value: 'en', label: 'English' },
      { value: 'zh-Hans', label: '简体中文' },
    ],
    default: 'en',
  },
  {
    key: 'logView',
    label: 'Timeline detail',
    description: 'How much of the timeline to keep on screen.',
    group: 'Timeline',
    options: LOG_VIEW_MODES.map((m) => ({ value: m.id, label: m.label })),
    default: 'recent10',
  },
  {
    key: 'clockFormat',
    label: 'Clock',
    description: 'How the time reads on the clock, the timeline and the day logs.',
    group: 'Display',
    options: [
      { value: '24', label: '24-hour' },
      { value: '12', label: '12-hour' },
    ],
    default: '24',
  },
  {
    key: 'weatherFx',
    label: 'Weather effects',
    description:
      'Rain, glare and haze drawn over the map. Purely visual — costs GPU fill rate, so it is off unless you ask for it.',
    group: 'Display',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'subtle', label: 'Subtle' },
      { value: 'full', label: 'Full' },
    ],
    default: 'off',
  },
  {
    key: 'fontSize',
    label: 'Font size',
    description: 'UI text scale. Affects the whole interface, including the timeline.',
    group: 'Display',
    options: [
      { value: 'sm', label: 'Small' },
      { value: 'md', label: 'Medium' },
      { value: 'lg', label: 'Large' },
      { value: 'xl', label: 'Extra large' },
    ],
    default: 'md',
  },
  {
    key: 'showGuideOnStart',
    label: 'How to play on start',
    description: 'Show the how-to-play primer when a run begins. Turn off after you know the ropes.',
    group: 'Guide',
    options: [
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
    ],
    default: 'on',
  },
  {
    key: 'limbCoachSeen',
    label: 'Limb injury coach',
    description: 'One-shot tip the first time you take a meaningful limb wound. Reset to Off to see it again.',
    group: 'Guide',
    options: [
      { value: 'off', label: 'Not seen yet' },
      { value: 'on', label: 'Already shown' },
    ],
    default: 'off',
  },
];

/** Root font-size multipliers applied via `document.documentElement`. */
export const FONT_SIZE_PX: Record<string, string> = {
  sm: '14px',
  md: '16px',
  lg: '18px',
  xl: '20px',
};

const STORAGE_KEY = 'singvive.settings.v1';

function defaults(): Record<string, string> {
  return Object.fromEntries(SETTINGS_SCHEMA.map((s) => [s.key, s.default]));
}

function loadSettings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      const merged = { ...defaults(), ...parsed };
      // New key: returning installs keep the primer off until they opt in.
      if (!('showGuideOnStart' in parsed)) merged.showGuideOnStart = 'off';
      return merged;
    }
  } catch {
    /* ignore */
  }
  return defaults();
}

/** Keys the player has actually set, as opposed to keys sitting on their
 *  default. Lets a setting distinguish "they chose this" from "nobody's said" —
 *  which is how an explicit choice gets to override an OS hint. */
function loadExplicit(): Record<string, true> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      return Object.fromEntries(Object.keys(parsed).map((k) => [k, true as const]));
    }
  } catch {
    /* ignore */
  }
  return {};
}

interface SettingsState {
  values: Record<string, string>;
  explicit: Record<string, true>;
  setSetting: (key: string, value: string) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  values: loadSettings(),
  explicit: loadExplicit(),
  setSetting: (key, value) => {
    const values = { ...get().values, [key]: value };
    set({ values, explicit: { ...get().explicit, [key]: true } });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
      /* storage unavailable — non-fatal */
    }
  },
}));

/**
 * Schema defaults by key. Built once — the linear `find` this replaces ran
 * *inside* the zustand selector, so it re-executed on every store evaluation
 * for every `useSetting` call site in the tree.
 */
const SETTING_DEFAULT: ReadonlyMap<string, string> = new Map(
  SETTINGS_SCHEMA.map((d) => [d.key, d.default]),
);

/** Read a single setting's current value (falling back to its schema default). */
export function useSetting(key: string): string {
  return useSettings((s) => s.values[key] ?? SETTING_DEFAULT.get(key) ?? '');
}

/**
 * The clock the player reads time on. Everything that prints an in-game time
 * goes through this, so the two clocks never disagree.
 */
export function useClockFormat(): ClockFormat {
  return useSetting('clockFormat') === '12' ? '12' : '24';
}

/** True once the player has picked this setting themselves. */
export function useSettingIsExplicit(key: string): boolean {
  return useSettings((s) => s.explicit[key] === true);
}
