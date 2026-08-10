/**
 * Every icon in the game, named by what it *means* rather than where it lives.
 * Game modules reference these keys; only `registry.ts` knows what file (if any)
 * each one resolves to, so swapping an asset never touches a call site.
 *
 * This module deliberately imports nothing — `src/game/` can pull the type in
 * without dragging asset imports into pure logic.
 */
export type IconName =
  // --- POI categories ---
  | 'poi.supermarket'
  | 'poi.convenience'
  | 'poi.pharmacy'
  | 'poi.hospital'
  | 'poi.hardware'
  | 'poi.fuel'
  | 'poi.police'
  | 'poi.residential'
  | 'poi.foodcourt'
  | 'poi.mrt'
  | 'poi.unknown'
  // --- factions ---
  | 'faction.idtf'
  | 'faction.pasir_panjang'
  | 'faction.syndicate_88'
  | 'faction.sta'
  // --- survival meters ---
  | 'meter.health'
  | 'meter.hunger'
  | 'meter.thirst'
  | 'meter.energy'
  | 'meter.infection'
  // --- combat ---
  | 'stance.aggressive'
  | 'stance.guarded'
  | 'stance.precision'
  | 'stance.disengage'
  | 'combat.enemyHuman'
  | 'combat.enemyZombie'
  | 'combat.player'
  | 'combat.hostiles'
  | 'combat.encounter'
  // --- HDB block ---
  | 'hdb.unit'
  | 'hdb.cornerUnit'
  | 'hdb.stairwell'
  | 'hdb.service'
  | 'hdb.hazard'
  | 'hdb.skybridge'
  | 'hdb.enterBlock'
  | 'hdb.scout'
  | 'hdb.breach'
  | 'hdb.trader'
  | 'hdb.doctor'
  | 'hdb.bunk'
  // --- actions / chrome ---
  | 'action.sleep'
  | 'action.inventory'
  | 'action.logbook'
  | 'action.objectives'
  | 'action.stash'
  | 'action.travel'
  | 'action.search'
  | 'action.map'
  | 'action.status'
  | 'action.log'
  | 'action.evac'
  | 'action.mrt'
  | 'action.settings'
  | 'action.here'
  | 'action.target'
  | 'action.kills'
  // --- weather / time ---
  | 'weather.clear'
  | 'weather.cloudy'
  | 'weather.rain'
  | 'weather.thunderstorm'
  | 'weather.haze'
  | 'time.day'
  | 'time.dusk'
  | 'time.night'
  // --- status flags ---
  | 'status.bleeding'
  | 'status.night'
  | 'status.blocked'
  | 'status.terrain';

/**
 * What renders until a real asset is dropped in. Every key must have one, so the
 * UI is never blank mid-migration.
 */
export const EMOJI_FALLBACK: Record<IconName, string> = {
  'poi.supermarket': '🛒',
  'poi.convenience': '🏪',
  'poi.pharmacy': '💊',
  'poi.hospital': '🏥',
  'poi.hardware': '🔧',
  'poi.fuel': '⛽',
  'poi.police': '🚓',
  'poi.residential': '🏢',
  'poi.foodcourt': '🍜',
  'poi.mrt': '🚉',
  'poi.unknown': '❓',

  'faction.idtf': '🎖️',
  'faction.pasir_panjang': '🍜',
  'faction.syndicate_88': '🗡️',
  'faction.sta': '🚉',

  'meter.health': '❤️',
  'meter.hunger': '🍖',
  'meter.thirst': '💧',
  'meter.energy': '⚡',
  'meter.infection': '☣️',

  'stance.aggressive': '⚔️',
  'stance.guarded': '🛡️',
  'stance.precision': '🎯',
  'stance.disengage': '🏃',
  'combat.enemyHuman': '🧑‍🦲',
  'combat.enemyZombie': '🧟',
  'combat.player': '🧍',
  'combat.hostiles': '⚔️',
  'combat.encounter': '☣️',

  'hdb.unit': '🚪',
  'hdb.cornerUnit': '🪟',
  'hdb.stairwell': '🪜',
  'hdb.service': '🤝',
  'hdb.hazard': '☢️',
  'hdb.skybridge': '🌉',
  'hdb.enterBlock': '🏢',
  'hdb.scout': '👁️',
  'hdb.breach': '🔨',
  'hdb.trader': '🧺',
  'hdb.doctor': '🩺',
  'hdb.bunk': '🛏️',

  'action.sleep': '😴',
  'action.inventory': '🎒',
  'action.logbook': '📓',
  'action.objectives': '🎯',
  'action.stash': '📦',
  'action.travel': '🚶',
  'action.search': '🔦',
  'action.map': '🗺️',
  'action.status': '❤️',
  'action.log': '📜',
  'action.evac': '🚁',
  'action.mrt': '🚆',
  'action.settings': '⚙',
  'action.here': '📍',
  'action.target': '🎯',
  'action.kills': '💀',

  'weather.clear': '☀️',
  'weather.cloudy': '☁️',
  'weather.rain': '🌧️',
  'weather.thunderstorm': '⛈️',
  'weather.haze': '🌫️',
  'time.day': '☀️',
  'time.dusk': '🌆',
  'time.night': '🌙',

  'status.bleeding': '🩸',
  'status.night': '🌙',
  'status.blocked': '⛔',
  'status.terrain': '🏙️',
};
