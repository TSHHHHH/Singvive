import { STANDING_KNOWN, STANDING_TRUSTED } from '../game/factions';
import type { FactionId, FactionService } from '../game/types';

type Fid = Exclude<FactionId, null>;

/** The rung each service opens at — mirrors the gates in factions.ts. */
export const SERVICE_RUNG: Record<FactionService, number> = {
  trade: STANDING_KNOWN,
  intel: STANDING_KNOWN,
  feed: STANDING_KNOWN,
  escort: STANDING_KNOWN,
  rest: STANDING_TRUSTED,
  aid: STANDING_TRUSTED,
};

export function serviceLabel(t: (k: string) => string, s: FactionService, fid: Fid): string {
  if (s === 'trade' && fid === 'syndicate_88') return t('ui.location.desk.fence');
  return t(`ui.location.desk.${s}`);
}
