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

/**
 * Tabs down the side of the Settings panel, in the order they are shown.
 * A closed union rather than a free string: the `data` tab holds actions and no
 * schema entries at all, so the tab list cannot be derived from the schema —
 * and deriving order from first appearance let one new setting silently
 * reshuffle the whole panel.
 */
export type SettingTabId = 'display' | 'gameplay' | 'accessibility' | 'guide' | 'data';

/**
 * How a setting is drawn. Every control still resolves to "pick one of N string
 * values", which is why the store stays a flat string map.
 */
export type SettingControl = 'pills' | 'toggle';

export interface SettingDef {
  key: string;
  label: string;
  description?: string;
  /** which tab the setting lives on */
  tab: SettingTabId;
  /** optional sub-heading within the tab; shares the `settings.groups.*` i18n namespace */
  section?: string;
  /** defaults to 'pills' */
  control?: SettingControl;
  options: SettingOption[];
  default: string;
}

export const SETTINGS_TABS: { id: SettingTabId; label: string }[] = [
  { id: 'display', label: 'Display' },
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'guide', label: 'Guide' },
  { id: 'data', label: 'Data & save' },
];

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
    tab: 'display',
    options: [
      { value: 'en', label: 'English' },
      { value: 'zh-Hans', label: '简体中文' },
    ],
    default: 'en',
  },
  {
    key: 'clockFormat',
    label: 'Clock',
    description: 'How the time reads on the clock, the timeline and the day logs.',
    tab: 'display',
    options: [
      { value: '24', label: '24-hour' },
      { value: '12', label: '12-hour' },
    ],
    default: '24',
  },
  {
    key: 'fontSize',
    label: 'Font size',
    description: 'UI text scale. Affects the whole interface, including the timeline.',
    tab: 'display',
    options: [
      { value: 'sm', label: 'Small' },
      { value: 'md', label: 'Medium' },
      { value: 'lg', label: 'Large' },
      { value: 'xl', label: 'Extra large' },
    ],
    default: 'md',
  },
  {
    key: 'weatherFx',
    label: 'Weather effects',
    description:
      'Rain, glare and haze drawn over the map. Purely visual — costs GPU fill rate, so it is off unless you ask for it.',
    tab: 'display',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'subtle', label: 'Subtle' },
      { value: 'full', label: 'Full' },
    ],
    default: 'off',
  },
  {
    key: 'logView',
    label: 'Timeline detail',
    description: 'How much of the timeline to keep on screen.',
    tab: 'gameplay',
    section: 'Timeline',
    options: LOG_VIEW_MODES.map((m) => ({ value: m.id, label: m.label })),
    default: 'recent10',
  },
  {
    key: 'railOverlay',
    label: 'Rail map',
    description: 'Draw the MRT network over the map by default. The on-map button toggles the same thing.',
    tab: 'gameplay',
    section: 'Map',
    control: 'toggle',
    options: [
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
    ],
    default: 'off',
  },
  {
    key: 'reduceMotion',
    label: 'Reduce motion',
    description:
      'Stop drifting rain, pulses and shimmer. Auto follows your system setting.',
    tab: 'accessibility',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
    ],
    default: 'auto',
  },
  {
    key: 'tooltips',
    label: 'Hover tips',
    description:
      'Pop-up labels on hover, or long-press on touch. Many icon-only buttons have no other label — leave these on unless they get in the way.',
    tab: 'accessibility',
    control: 'toggle',
    options: [
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
    ],
    default: 'on',
  },
  {
    key: 'showGuideOnStart',
    label: 'How to play on start',
    description: 'Show the how-to-play primer when a run begins. Turn off after you know the ropes.',
    tab: 'guide',
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
    tab: 'guide',
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

/** The rail overlay predates this store and had its own key. Left in place for
 *  a release rather than deleted: nothing writes it any more, and removing it
 *  on read risks a half-migrated state if the settings write then fails. */
const LEGACY_MRT_KEY = 'singvive.mrtOverlay';

function loadSettings(): Record<string, string> {
  const merged = defaults();
  let hadRailOverlay = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      hadRailOverlay = 'railOverlay' in parsed;
      Object.assign(merged, parsed);
      // New key: returning installs keep the primer off until they opt in.
      if (!('showGuideOnStart' in parsed)) merged.showGuideOnStart = 'off';
    }
  } catch {
    /* ignore */
  }
  // Absorb the standalone rail pref. Gated on the *stored blob* lacking the
  // key, not on `merged` — `defaults()` always supplies one. Someone who
  // toggled the rail map but never opened Settings has the legacy key and no
  // blob at all, and that is exactly the case this has to catch.
  if (!hadRailOverlay) {
    try {
      const legacy = localStorage.getItem(LEGACY_MRT_KEY);
      if (legacy !== null) merged.railOverlay = legacy === '1' ? 'on' : 'off';
    } catch {
      /* ignore */
    }
  }
  return merged;
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

function persist(values: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

interface SettingsState {
  values: Record<string, string>;
  explicit: Record<string, true>;
  setSetting: (key: string, value: string) => void;
  /**
   * Back to schema defaults. Deliberately not a re-run of `loadSettings()`:
   * that function's showGuideOnStart branch is a returning-install heuristic,
   * not a default, and someone asking for defaults should get the primer back.
   */
  resetSettings: () => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  values: loadSettings(),
  explicit: loadExplicit(),
  setSetting: (key, value) => {
    const values = { ...get().values, [key]: value };
    set({ values, explicit: { ...get().explicit, [key]: true } });
    persist(values);
  },
  resetSettings: () => {
    const values = defaults();
    set({ values, explicit: {} });
    persist(values);
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

/** The full descriptor by key, for anything needing more than the value. */
export const SETTING_DEF: ReadonlyMap<string, SettingDef> = new Map(
  SETTINGS_SCHEMA.map((d) => [d.key, d]),
);

/** Schema entries on one tab, in schema order. */
export function settingsForTab(tab: SettingTabId): SettingDef[] {
  return SETTINGS_SCHEMA.filter((d) => d.tab === tab);
}

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
