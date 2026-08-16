import type { EquipSlot } from '../../game/types';
import type { IconName } from '../../icons/keys';

export const EQUIP_SLOTS: { slot: EquipSlot; label: string; icon: IconName }[] = [
  { slot: 'head', label: 'Head', icon: 'slot.head' },
  { slot: 'body', label: 'Body', icon: 'slot.body' },
  { slot: 'hands', label: 'Hands', icon: 'slot.hands' },
  { slot: 'legs', label: 'Legs', icon: 'slot.legs' },
  { slot: 'feet', label: 'Feet', icon: 'slot.feet' },
  { slot: 'bag', label: 'Bag', icon: 'slot.bag' },
  { slot: 'mainHand', label: 'Main', icon: 'slot.mainHand' },
  { slot: 'offHand', label: 'Off', icon: 'slot.offHand' },
];
