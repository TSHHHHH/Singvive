import type { Equipment, ItemInstance } from './types';

/** Full equipment shape including the holster slot (inventory.ts emptyEquipment predates firearm). */
export function fullEquipment(partial?: Partial<Equipment>): Equipment {
  return {
    head: partial?.head ?? null,
    body: partial?.body ?? null,
    hands: partial?.hands ?? null,
    legs: partial?.legs ?? null,
    feet: partial?.feet ?? null,
    bag: partial?.bag ?? null,
    mainHand: partial?.mainHand ?? null,
    offHand: partial?.offHand ?? null,
    firearm: partial?.firearm ?? null,
  };
}

export function mergeEquipment(
  equipment: Equipment,
  patch: Partial<Equipment>,
): Equipment {
  return fullEquipment({ ...equipment, ...patch });
}

export function firearmFromPartial(raw: Partial<Equipment> | null | undefined): ItemInstance | null {
  return raw?.firearm ?? null;
}
