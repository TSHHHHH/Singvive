import type { EventChoice } from './events';
import { canFireHolstered } from './firearms';
import { isCarried } from './inventory';
import type { Equipment, ItemInstance } from './types';

type ChoiceAvailability =
  | { available: false; reason: 'loadedGun' | 'payment' }
  | { available: true; payment?: string };

export function getChoiceAvailability(
  choice: EventChoice,
  state: { equipment: Equipment; items: readonly ItemInstance[] },
): ChoiceAvailability {
  if (choice.needs === 'loadedGun' && !canFireHolstered(state.equipment)) {
    return { available: false, reason: 'loadedGun' };
  }
  if (choice.kind !== 'pay') return { available: true };

  const payment = choice.itemIds?.find((id) =>
    state.items.some((item) => item.defId === id && isCarried(item.container)),
  );
  return payment ? { available: true, payment } : { available: false, reason: 'payment' };
}
