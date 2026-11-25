import type { HazardKind } from './wilds';

export type CrossingLog =
  /** Zones the survivor passed a check for: crossed (`slipped`) or left (`slippedOut`) unnoticed. */
  | { kind: 'slipped' | 'slippedOut'; hazards: HazardKind[] }
  /** Zones that caught the survivor; they are crossed directly. */
  | { kind: 'caught'; hazards: HazardKind[] }
  /**
   * Legacy: the old departure decision. No longer written, but kept so a
   * saved timeline from before the change still reads.
   */
  | { kind: 'noticed'; hazards: HazardKind[] }
  | { kind: 'careful'; minutes: number }
  | { kind: 'withdraw' | 'changed' | 'direct' }
  | { kind: 'resolved'; woundHp: number; infectionDelta: number; intercepted: boolean; extraMinutes: number };

/** Presentation is supplied by the caller; the saved event remains language neutral. */
export function crossingLogText(
  message: CrossingLog,
  tr: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (message.kind === 'noticed' || message.kind === 'slipped' || message.kind === 'slippedOut' || message.kind === 'caught') return tr(`ui.crossing.log.${message.kind}`, {
    hazards: message.hazards.map((kind) => tr(`ui.crossing.kind.${kind}`)).join(' · '),
  });
  if (message.kind === 'careful') return tr('ui.crossing.log.careful', { minutes: message.minutes });
  if (message.kind === 'resolved') return tr('ui.crossing.log.resolved', {
    injury: message.woundHp > 0 ? tr('ui.crossing.log.injury', { n: message.woundHp }) : tr('ui.crossing.log.noInjury'),
    infection: message.infectionDelta > 0 ? tr('ui.crossing.log.infection', { n: message.infectionDelta }) : tr('ui.crossing.log.noInfection'),
    contact: tr(message.intercepted ? 'ui.crossing.log.intercepted' : 'ui.crossing.log.clear'),
    minutes: message.extraMinutes,
  });
  return tr(`ui.crossing.log.${message.kind}`);
}
