import type { BountyOffer } from '../game/bounties';
import type { LocationState } from '../game/types';
import { itemName } from '../i18n';

/** Player-facing lines for a faction job and its pay. */
type Tr = (k: string, v?: Record<string, string | number>) => string;

export function bountyText(
  t: Tr,
  locale: Parameters<typeof itemName>[1],
  b: BountyOffer,
  locations: Record<string, LocationState>,
): string {
  if (b.kind === 'deliver') return t('ui.location.desk.jobDeliver', { n: b.count, item: itemName(b.defId!, locale) });
  if (b.kind === 'scout') {
    return t('ui.location.desk.jobScout', { name: locations[b.targetId!]?.name ?? t('ui.location.unknownLocation') });
  }
  return t('ui.location.desk.jobCull', { n: b.count });
}

export function rewardText(t: Tr, locale: Parameters<typeof itemName>[1], b: BountyOffer): string {
  const base = t('ui.location.desk.jobReward', {
    s: b.rewardStanding,
    n: b.rewardCount,
    item: itemName(b.rewardDefId, locale),
  });
  return b.passDays ? `${base} · ${t('ui.location.desk.jobPass', { d: b.passDays })}` : base;
}
