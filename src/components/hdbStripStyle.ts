import type { IconName } from '../icons/keys';
import type { HdbFloorTheme, HdbUnitType, SealKind } from '../game/hdbDungeon';

/**
 * Shared colours and icons for the HDB landing strips and their dock. The
 * bureau rule holds here too: greys for everything, red only for danger, cyan
 * only for what your senses read.
 */

export const SEAL_ICON: Record<SealKind, IconName> = {
  collapsed: 'hdb.sealedCollapsed',
  flooded: 'hdb.sealedFlooded',
  welded: 'hdb.sealedWelded',
  burnt: 'hdb.sealedBurnt',
};

/** Room icon ink: red for the rooms that can hurt you, signage white for the rest. */
export function unitFaceClass(type: HdbUnitType): string {
  if (type === 'trapped' || type === 'den' || type === 'burning' || type === 'nest') {
    return 'text-hiss';
  }
  if (type === 'notice') return 'text-signal';
  return 'text-concrete-200';
}

/**
 * Heat-meter fill per band index (Quiet → Swarm): grey warming to red, so a
 * hot landing never reads like the off-white "you are here" plate.
 */
export const BAND_FILL = [
  'bg-concrete-600',
  'bg-concrete-400',
  'bg-concrete-200',
  'bg-hiss/70',
  'bg-hiss',
];

export function bandText(idx: number, hunting: boolean): string {
  if (hunting || idx >= 3) return 'text-hiss';
  if (idx >= 1) return 'text-concrete-200';
  return 'text-concrete-400';
}

/**
 * Landing backdrop per theme: a wash and the theme's icon drawn large and faint
 * behind the rooms, so a fire floor or a nest reads at a glance. Same palette
 * rule: red washes only where the landing can hurt you, cyan where people keep it.
 */
export interface ThemeBackdrop {
  icon: IconName;
  /** Tailwind gradient wash (direction + stops). */
  wash: string;
  /** Watermark ink. */
  ink: string;
}

export const THEME_BACKDROP: Partial<Record<HdbFloorTheme, ThemeBackdrop>> = {
  fire: {
    icon: 'hdb.burning',
    wash: 'bg-gradient-to-t from-hiss/25 via-hiss/5 to-transparent',
    ink: 'text-hiss',
  },
  nest: {
    icon: 'hdb.nest',
    wash: 'bg-gradient-to-l from-hiss/15 to-transparent',
    ink: 'text-hiss',
  },
  holdout: {
    icon: 'hdb.service',
    wash: 'bg-gradient-to-l from-astral/10 to-transparent',
    ink: 'text-astral',
  },
  refuge: {
    icon: 'hdb.shelter',
    wash: 'bg-gradient-to-l from-astral/10 to-transparent',
    ink: 'text-astral',
  },
  picked_over: {
    icon: 'hdb.unavailable',
    wash: 'bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgba(255,255,255,0.035)_10px_12px)]',
    ink: 'text-concrete-200',
  },
  roof: {
    icon: 'sleep.roof',
    wash: 'bg-gradient-to-b from-concrete-200/15 via-concrete-200/5 to-transparent',
    ink: 'text-concrete-50',
  },
};
