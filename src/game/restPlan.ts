import {
  HOURS_PER_DAY,
  START_HOUR,
  STARVING_THRESHOLD,
  checkDeath,
  sleepRestore,
  tickInjuries,
  tickMeters,
  tickSystemicDamage,
  totalHp,
  totalMaxHp,
} from './survival';
import { applySleepRecovery } from './sleep';
import type { BodyParts, Meters } from './types';

// ---------------------------------------------------------------------------
// Rest planning.
//
// One pure function decides what a rest does: how long you actually sleep,
// what the meters and limbs look like when you wake, and how likely the night
// is to go wrong. The Rest preview and `rest()` both call it with the same
// input, so the numbers the player confirms are the numbers they get.
// ---------------------------------------------------------------------------

/** Fixed lengths on the Rest picker, in hours. `'morning'` sleeps to 08:00. */
export const REST_LENGTHS = [1, 2, 4, 8] as const;
export type RestLength = (typeof REST_LENGTHS)[number] | 'morning';

/**
 * The ambush, collapse and damp numbers in `sleep.ts` were tuned for one full
 * night. Shorter rests take a proportional share, so four two-hour naps carry
 * the same risk as one eight-hour sleep rather than four full nights' worth.
 */
export const REFERENCE_NIGHT_HOURS = 8;
const FLOOD_INFECTION_PER_NIGHT = 4;
const COLLAPSE_WOUND_PER_NIGHT = 0.4;

/** Hunger/thirst below this wakes you from a rest that started above it. */
export const REST_WAKE_FLOOR = STARVING_THRESHOLD;
/** Second floor for a rest that already started below the first one. */
export const REST_CRITICAL_FLOOR = 15;
/** Below the critical floor you can only doze this long. */
export const RESTLESS_MAX_HOURS = 1;
/** Blood loss wakes you before limbs drop under this share of max HP. */
export const REST_HP_FLOOR_SHARE = 0.25;

export function hoursUntilMorning(hour: number): number {
  return ((START_HOUR - hour + HOURS_PER_DAY) % HOURS_PER_DAY) || HOURS_PER_DAY;
}

export function restLengthHours(length: RestLength, hour: number): number {
  return length === 'morning' ? hoursUntilMorning(hour) : length;
}

/** Share of a full night's risk that `hours` of sleep carries. */
export function scaleNightChance(perNight: number, hours: number): number {
  if (perNight <= 0 || hours <= 0) return 0;
  if (perNight >= 1) return 1;
  return 1 - Math.pow(1 - perNight, hours / REFERENCE_NIGHT_HOURS);
}

export interface RestPlanInput {
  day: number;
  hour: number;
  meters: Meters;
  bodyParts: BodyParts;
  requestedHours: number;
  /** From the sleep conditions (walls / roof / bed / occupancy). */
  recoveryMult: number;
  sleepRestoreMod: number;
  /** Same options `advanceTime` hands `tickMeters`; `sleeping` is forced on. */
  meterOpts: Omit<NonNullable<Parameters<typeof tickMeters>[2]>, 'sleeping'>;
  injury: { selfStopDisabled: boolean; legHealMod: number; bleedStopBonus: number };
  /** Per-night ambush chance from `restAmbushPreview` (0 when walls + bed hold). */
  nightAmbushChance: number;
  floodSleep: boolean;
  collapseSleep: boolean;
}

export type RestWakeReason = 'hunger' | 'thirst' | 'blood' | 'restless';

export interface RestOutcome {
  requestedHours: number;
  /** What you actually sleep. Less than requested when something wakes you. */
  hours: number;
  /** Null when you sleep the whole stretch. */
  wokeBy: RestWakeReason | null;
  endDay: number;
  endHour: number;
  before: Meters;
  /** Meters on waking, energy already restored. */
  after: Meters;
  bodyParts: BodyParts;
  hpBefore: number;
  hpAfter: number;
  hpMax: number;
  ambushChance: number;
  infectionDelta: number;
  collapseChance: number;
}

function floorFor(start: number): number | null {
  if (start >= REST_WAKE_FLOOR) return REST_WAKE_FLOOR;
  if (start >= REST_CRITICAL_FLOOR) return REST_CRITICAL_FLOOR;
  return null;
}

/**
 * Walk the rest hour by hour and stop before the hour that would push hunger
 * or thirst over a floor, or bleed the body into danger. Nobody dies in their
 * sleep: the worst a rest can do is wake you early.
 */
export function planRest(input: RestPlanInput): RestOutcome {
  const { meters: start, bodyParts: startParts } = input;
  const hungerFloor = floorFor(start.hunger);
  const thirstFloor = floorFor(start.thirst);
  const restless = hungerFloor === null || thirstFloor === null;
  const cap = restless
    ? Math.min(input.requestedHours, RESTLESS_MAX_HOURS)
    : input.requestedHours;
  const hpMax = totalMaxHp(startParts);
  const hpBefore = totalHp(startParts);
  const hpFloor = Math.min(hpBefore, hpMax * REST_HP_FLOOR_SHARE);

  let meters = start;
  let parts = startParts;
  let slept = 0;
  let wokeBy: RestWakeReason | null = restless && cap < input.requestedHours ? 'restless' : null;

  while (slept < cap - 1e-9) {
    const step = Math.min(1, cap - slept);
    const { parts: healed } = tickInjuries(
      parts,
      step,
      input.injury.selfStopDisabled,
      meters.hunger,
      input.injury.legHealMod,
      input.injury.bleedStopBonus,
    );
    const nextParts = tickSystemicDamage(healed, meters, step);
    const nextMeters = tickMeters(meters, step, { ...input.meterOpts, sleeping: true });

    if (hungerFloor !== null && nextMeters.hunger < hungerFloor) {
      wokeBy = 'hunger';
      break;
    }
    if (thirstFloor !== null && nextMeters.thirst < thirstFloor) {
      wokeBy = 'thirst';
      break;
    }
    const hp = totalHp(nextParts);
    if (checkDeath(nextMeters, nextParts) || (hp < hpFloor && hp < totalHp(parts))) {
      wokeBy = 'blood';
      break;
    }
    meters = nextMeters;
    parts = nextParts;
    slept += step;
  }

  const fullRest = sleepRestore(start.energy, slept, start, input.sleepRestoreMod);
  const energy = slept > 0 ? applySleepRecovery(start.energy, fullRest, input.recoveryMult) : start.energy;
  const total = input.hour + slept;
  const endDay = input.day + Math.floor(total / HOURS_PER_DAY);
  const endHour = ((total % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;

  return {
    requestedHours: input.requestedHours,
    hours: slept,
    wokeBy,
    endDay,
    endHour,
    before: start,
    after: { ...meters, energy },
    bodyParts: parts,
    hpBefore,
    hpAfter: totalHp(parts),
    hpMax,
    ambushChance: scaleNightChance(input.nightAmbushChance, slept),
    infectionDelta: input.floodSleep
      ? Math.min(FLOOD_INFECTION_PER_NIGHT, (FLOOD_INFECTION_PER_NIGHT * slept) / REFERENCE_NIGHT_HOURS)
      : 0,
    collapseChance: input.collapseSleep ? scaleNightChance(COLLAPSE_WOUND_PER_NIGHT, slept) : 0,
  };
}

/** "45m", "2h", "7h 30m". */
export function formatRestHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
