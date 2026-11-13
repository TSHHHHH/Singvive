import type { LoadEffects } from '../game/inventory';
import { loadModifierLines } from './loadTip';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** True from Heavy up: the load is now a choice, so the HUD names it. */
export function loadTierShown(fx: LoadEffects): boolean {
  return fx.tier !== 'light' && fx.tier !== 'burdened';
}

/** Tier label, e.g. "Heavy". */
export function loadTierLabel(fx: LoadEffects, t: TFn): string {
  return t(`ui.load.tier.${fx.tier}`);
}

/**
 * The two or three penalties that matter most right now, for the line beside
 * the carry readout. Hard stops (pinned, no flee, injury) lead.
 */
export function loadDebuffBrief(fx: LoadEffects, t: TFn, max = 4): string[] {
  if (fx.strain <= 0) return [];
  return loadModifierLines(fx, t)
    .filter((m) => !m.good)
    .slice(0, max)
    .map((m) => m.text);
}

/** Text colour for a tier: quiet → amber → red. */
export function loadTierTone(fx: LoadEffects): string {
  switch (fx.tier) {
    case 'light':
      return 'text-white/60';
    case 'burdened':
      return 'text-amber-300';
    default:
      return 'text-hiss';
  }
}

