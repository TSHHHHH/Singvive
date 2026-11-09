import { countBleeding } from '../../game/survival';
import { useGame } from '../../game/store';

/** Below this a meter is worth a badge on the dock's Condition tile. */
export const VITALS_LOW = 25;

/**
 * Desktop: is any survival meter low, or is the body bleeding? Drives the
 * dock's Condition badge so a closed window still says "look at me".
 */
export function useVitalsAlarm(): boolean {
  return useGame((s) => {
    const m = s.meters;
    return (
      m.hunger < VITALS_LOW ||
      m.thirst < VITALS_LOW ||
      m.energy < VITALS_LOW ||
      m.infection > 60 ||
      countBleeding(s.bodyParts, 'major') + countBleeding(s.bodyParts, 'minor') > 0
    );
  });
}
