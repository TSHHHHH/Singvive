import type { HazardKind } from './wilds';

export type CrossingChoice = 'careful' | 'direct' | 'withdraw';
export type CrossingLog =
  | { kind: 'noticed'; hazards: HazardKind[] }
  | { kind: 'careful'; minutes: number }
  | { kind: 'withdraw' | 'changed' | 'direct' }
  | { kind: 'resolved'; woundHp: number; infectionDelta: number; intercepted: boolean; extraMinutes: number };

/** Presentation is supplied by the caller; the saved event remains language neutral. */
export function crossingLogText(
  message: CrossingLog,
  tr: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (message.kind === 'noticed') return tr('ui.crossing.log.noticed', {
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
export interface CrossingHazard {
  id: string;
  kind: HazardKind;
  severity: number;
}

/** A departure decision: no part of the walk has been paid or committed yet. */
export interface PendingCrossing {
  id: string;
  mode: 'road' | 'trek';
  target: { lat: number; lng: number; locationId?: string; name?: string };
  from: { lat: number; lng: number };
  day: number;
  hour: number;
  hazards: CrossingHazard[];
  carefulMinutes: number;
}

/** Checking footing / watching movement costs time once per distinct zone. */
export function carefulCrossingMinutes(hazards: readonly CrossingHazard[]): number {
  return [...new Map(hazards.map((hazard) => [hazard.id, hazard])).values()]
    .reduce((minutes, hazard) => minutes + 6 + hazard.severity * 3, 0);
}
