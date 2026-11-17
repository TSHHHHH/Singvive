import type { GuidePin, GuideStep } from './types';

/** Every point a step marks: its `pins`, else its single highlight / anchored call-out. */
export function stepPins(step: GuideStep): GuidePin[] {
  if (step.pins?.length) return step.pins;
  const anchored = step.callout?.anchor ? step.callout : undefined;
  const at = anchored?.anchor ?? step.highlight;
  return at ? [{ at, ring: !!step.highlight, callout: anchored }] : [];
}
