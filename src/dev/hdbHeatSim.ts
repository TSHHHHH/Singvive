import { Rng } from '../game/rng';
import type { Attributes, LocationState } from '../game/types';
import {
  addDoorHeat,
  addHeat,
  breachOutcome,
  coolLevels,
  FIGHT_HEAT,
  generateDungeon,
  HAZARD_HEAT,
  HEAT_BANDS,
  HEAT_MAX,
  HUNT_ELITE_CHANCE,
  isOpen,
  isSafeLanding,
  levelHeat,
  retreatFailChance,
  SPILL,
  travelPlan,
  UNIT_META,
  alarmArmed,
  themeSearchMult,
  canCutAlarm,
  cutAlarmChance,
  cutAlarmCheck,
  scoutUnit,
  tripAlarm,
  updateUnit,
  type HdbDungeon,
} from '../game/hdbDungeon';

/**
 * Heat balance sim for a whole HDB block. A scripted survivor clears the block
 * bottom-up (every door it can open, forcing locked ones — no lockpicks), then
 * walks back down to the void deck. Uses the production generator, breach
 * odds, heat, cooling and stair rules; only the search time is a flat guess.
 * `npm run sim:hdb-heat` prints the table; hdbHeatSim.test.ts pins the bounds.
 */

/** How a forced door's heat lands. `spread` is the shipping rule. */
export type DoorRule = 'spread' | 'legacy';

/**
 * How the scripted survivor meets room events.
 * - `off`: events stripped from the block (the world before them).
 * - `blind`: never reads a door; alarms go off on whoever opens them.
 * - `smart`: reads every door (Perception odds at SIM_ATTRS) and cuts a spotted
 *   alarm when the odds are even or better (else leaves the room shut).
 */
export type EventPolicy = 'off' | 'blind' | 'smart';

export interface ClearResult {
  storeys: number;
  landings: number;
  doors: number;
  forced: number;
  /** Fights from doorways (encounter rolls plus fight-verb rooms) during the clear. */
  doorFights: number;
  /** Landings sitting at Hunting or above when the clear ends. */
  huntingLandings: number;
  /** Landings pinned at Swarm when the clear ends. */
  swarmLandings: number;
  /** Mean heat over open landings at the end. */
  meanHeat: number;
  /** Odds the walk back down to the void deck is fight-free. */
  cleanExit: number;
  /** Expected fights on the walk back down. */
  exitFights: number;
  hours: number;
  alarmsTripped: number;
  alarmsCut: number;
  /** Rooms left shut because of a spotted alarm. */
  skipped: number;
  /** Mean loot mod over looted rooms (the payoff side). */
  lootMod: number;
}

/** Search time per looted room (game minutes): ~searchMinutes() for a mid table. */
export const SIM_SEARCH_MINUTES = 35;
/** A doorway fight's clock cost (game minutes). */
export const SIM_FIGHT_MINUTES = 3;

const SITE = {
  id: 'sim-blk',
  name: 'Sim block',
  currentDanger: 2,
} as Pick<LocationState, 'id' | 'name' | 'currentDanger'>;

export const SIM_ATTRS: Attributes = {
  strength: 5,
  dexterity: 5,
  endurance: 5,
  perception: 5,
  wits: 5,
} as Attributes;

function forcedDoorHeat(d: HdbDungeon, rule: DoorRule, heat: number, level: number, barricaded: boolean) {
  if (rule === 'spread') return addDoorHeat(d, heat, level);
  // The rule before this change: locked doors stayed on the landing,
  // barricades spilled 35% to the landings either side.
  return addHeat(d, heat, level, barricaded ? 0.35 : 0);
}

export function simulateClear(
  seed: string,
  storeys: number,
  rule: DoorRule,
  attrs = SIM_ATTRS,
  events: EventPolicy = 'off',
): ClearResult {
  const rng = new Rng(seed);
  let d = generateDungeon(rng.fork('block'), SITE, 'estate', { storeys });
  if (events === 'off') {
    d = {
      ...d,
      floors: d.floors.map((f) => ({ ...f, units: f.units.map((u) => ({ ...u, event: undefined })) })),
    };
  }
  let alarmsTripped = 0;
  let alarmsCut = 0;
  let skipped = 0;
  let lootSum = 0;
  let looted = 0;
  const roll = rng.fork('play');
  const open = d.floors.filter((f) => !f.sealed).map((f) => f.level);
  let minutes = 0;
  let doors = 0;
  let forced = 0;
  let doorFights = 0;

  const tick = (m: number) => {
    minutes += m;
    d = coolLevels(d, m, d.pos.level);
  };

  for (const level of open) {
    if (level !== d.pos.level) {
      const plan = travelPlan(d, d.pos.level, level);
      tick(plan.minutes);
      for (const c of plan.crossings) if (c.hunt && roll.chance(HUNT_ELITE_CHANCE)) doorFights++;
      d = { ...d, pos: { level }, currentLevel: level };
    }
    const order = d.floors[level - 1].units.map((u) => u.id);
    if (events === 'smart') {
      // Read every door from the corridor first.
      const sweep = roll.fork(`sweep:${level}`);
      for (const id of order) d = scoutUnit(sweep, attrs, d, level, id).dungeon;
    }
    for (const id of order) {
      let unit = d.floors[level - 1].units.find((u) => u.id === id)!;
      if (!unit.available) continue;
      const verb = UNIT_META[unit.type].verb;
      if (verb === 'service' || verb === 'intel') continue;
      if (events === 'smart' && canCutAlarm(unit)) {
        if (cutAlarmChance(attrs.wits, 0) < 0.5) {
          skipped++;
          continue;
        }
        tick(10);
        if (cutAlarmCheck(roll, attrs.wits, 0).success) {
          alarmsCut++;
          d = updateUnit(d, level, id, { eventSpent: true });
        } else {
          alarmsTripped++;
          d = tripAlarm(d, level, id);
        }
        unit = d.floors[level - 1].units.find((u) => u.id === id)!;
      }
      doors++;
      const out = breachOutcome(d, unit, level);
      const heat = verb === 'fight' ? 0 : out.heat;
      tick(out.minutes);
      if (heat > 0) {
        forced++;
        d = forcedDoorHeat(d, rule, heat, level, unit.entry === 'barricaded');
      }
      if (out.alarm && alarmArmed(unit)) {
        alarmsTripped++;
        d = tripAlarm(d, level, id);
      }
      if (out.trapped && roll.chance(0.35)) d = addHeat(d, HAZARD_HEAT, level, SPILL.trap);
      const fight = verb === 'fight' || roll.chance(out.encounterChance);
      if (fight) {
        doorFights++;
        tick(SIM_FIGHT_MINUTES);
        d = addHeat(d, FIGHT_HEAT, level, SPILL.fight);
      }
      if (UNIT_META[unit.type].lootTable) {
        tick(SIM_SEARCH_MINUTES * themeSearchMult(d, level));
        lootSum += out.lootMod;
        looted++;
      }
      if (unit.event) d = updateUnit(d, level, id, { eventKnown: true });
    }
  }

  const heats = open.map((l) => levelHeat(d, l));
  const hunting = HEAT_BANDS.find((b) => b.label === 'Hunting')!.at;

  // Walk back down to the void deck: hunts on Swarm landings, descent checks on every landing.
  const exit = travelPlan(d, d.pos.level, 1);
  let cleanExit = 1;
  let exitFights = 0;
  for (const c of exit.crossings) {
    if (!isOpen(d, c.level)) continue;
    const hunt = c.hunt && !isSafeLanding(d, c.level) ? HUNT_ELITE_CHANCE : 0;
    const fail = retreatFailChance(attrs, d, c.level);
    const pFight = 1 - (1 - hunt) * (1 - fail);
    exitFights += pFight;
    cleanExit *= 1 - pFight;
  }

  return {
    storeys,
    landings: open.length,
    doors,
    forced,
    doorFights,
    huntingLandings: heats.filter((h) => h >= hunting).length,
    swarmLandings: heats.filter((h) => h >= HEAT_MAX).length,
    meanHeat: heats.reduce((a, b) => a + b, 0) / Math.max(1, heats.length),
    cleanExit,
    exitFights,
    hours: minutes / 60,
    alarmsTripped,
    alarmsCut,
    skipped,
    lootMod: lootSum / Math.max(1, looted),
  };
}

export interface ClearSummary {
  rule: DoorRule;
  events: EventPolicy;
  storeys: number;
  runs: number;
  landings: number;
  forced: number;
  doorFights: number;
  meanHeat: number;
  huntingLandings: number;
  swarmLandings: number;
  /** Share of runs that end with more than half the open landings at Hunting+. */
  runaway: number;
  cleanExit: number;
  exitFights: number;
  hours: number;
  alarmsTripped: number;
  alarmsCut: number;
  skipped: number;
  lootMod: number;
}

export function summarize(
  rule: DoorRule,
  storeys: number,
  runs: number,
  events: EventPolicy = 'off',
  attrs = SIM_ATTRS,
): ClearSummary {
  const rs = Array.from({ length: runs }, (_, i) =>
    simulateClear(`heat-${storeys}-${i}`, storeys, rule, attrs, events),
  );
  const mean = (f: (r: ClearResult) => number) => rs.reduce((a, r) => a + f(r), 0) / runs;
  return {
    rule,
    events,
    storeys,
    runs,
    landings: mean((r) => r.landings),
    forced: mean((r) => r.forced),
    doorFights: mean((r) => r.doorFights),
    meanHeat: mean((r) => r.meanHeat),
    huntingLandings: mean((r) => r.huntingLandings),
    swarmLandings: mean((r) => r.swarmLandings),
    runaway: mean((r) => (r.huntingLandings > r.landings / 2 ? 1 : 0)),
    cleanExit: mean((r) => r.cleanExit),
    exitFights: mean((r) => r.exitFights),
    hours: mean((r) => r.hours),
    alarmsTripped: mean((r) => r.alarmsTripped),
    alarmsCut: mean((r) => r.alarmsCut),
    skipped: mean((r) => r.skipped),
    lootMod: mean((r) => r.lootMod),
  };
}
