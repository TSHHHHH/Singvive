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
  | 'poi.industrial'
  | 'poi.school'
  | 'poi.waypoint'
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
  | 'action.stats'
  | 'action.dayLogs'
  | 'action.close'
  // --- run statistics ---
  | 'stat.value'
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
  | 'status.terrain'
  // --- equipment slots (shown when a slot is empty) ---
  | 'slot.head'
  | 'slot.body'
  | 'slot.mainHand'
  | 'slot.offHand'
  // --- item fallbacks, one per ItemEffect kind ---
  // Every item resolves to one of these unless its def names a specific key,
  // so a new item is never blank even before anyone draws it.
  | 'item.food'
  | 'item.water'
  | 'item.heal'
  | 'item.cure'
  | 'item.energy'
  | 'item.weaponMelee'
  | 'item.weaponRanged'
  | 'item.ammo'
  | 'item.fuel'
  | 'item.misc'
  // --- per-item art ---
  | 'item.canned_food'
  | 'item.rice_pack'
  | 'item.instant_noodles'
  | 'item.snacks'
  | 'item.hawker_meal'
  | 'item.bak_kwa'
  | 'item.army_ration'
  | 'item.milo_tin'
  | 'item.condensed_milk'
  | 'item.kaya_toast'
  | 'item.curry_puff'
  | 'item.nasi_lemak'
  | 'item.wild_boar_meat'
  | 'item.river_fish'
  | 'item.durian'
  | 'item.tiger_beer'
  | 'item.chin_chow'
  | 'item.yakult'
  | 'item.tiger_balm'
  | 'item.axe_oil'
  | 'item.po_chai'
  | 'item.splint'
  | 'item.n95_mask'
  | 'item.mosquito_coil'
  | 'item.wooden_stick'
  | 'item.meat_cleaver'
  | 'item.golf_club'
  | 'item.baseball_bat'
  | 'item.katana'
  | 'item.spear_knife'
  | 'item.spear_cleaver'
  | 'item.spear_parang'
  | 'item.changkol'
  | 'item.sbo_vest'
  | 'item.ez_link_card'
  | 'item.red_packet'
  | 'item.joss_paper'
  | 'item.rain_tarp'
  | 'item.powerbank'
  | 'item.four_d_ticket'
  | 'item.water_bottle'
  | 'item.newater'
  | 'item.dirty_water'
  | 'item.purification_tabs'
  | 'item.cloth_rags'
  | 'item.glass_bottle'
  | 'item.spare_parts'
  | 'item.whetstone'
  | 'item.gun_oil'
  | 'item.soft_drink'
  | 'item.isotonic'
  | 'item.bandage'
  | 'item.painkillers'
  | 'item.medkit'
  | 'item.antibiotics'
  | 'item.antiseptic'
  | 'item.coffee'
  | 'item.energy_drink'
  | 'item.kitchen_knife'
  | 'item.hammer'
  | 'item.crowbar'
  | 'item.fire_axe'
  | 'item.parang'
  | 'item.pistol'
  | 'item.shotgun'
  | 'item.ammo_box'
  | 'item.ammo_shell'
  | 'item.hard_hat'
  | 'item.riot_helmet'
  | 'item.leather_jacket'
  | 'item.work_vest'
  | 'item.kevlar_vest'
  | 'item.riot_shield'
  | 'item.torch'
  | 'item.fuel_can'
  | 'item.duct_tape'
  | 'item.batteries'
  | 'item.scrap_metal'
  | 'item.toolbox'
  | 'item.jewellery';

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
  'poi.industrial': '🏭',
  'poi.school': '🏫',
  'poi.waypoint': '🛣️',
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
  'action.stats': '📊',
  'action.dayLogs': '🗓️',
  'action.close': '✕',

  'stat.value': '💰',

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

  'slot.head': '🪖',
  'slot.body': '🦺',
  'slot.mainHand': '🗡️',
  'slot.offHand': '🛡️',

  'item.food': '🥫',
  'item.water': '💧',
  'item.heal': '➕',
  'item.cure': '💊',
  'item.energy': '⚡',
  'item.weaponMelee': '🔪',
  'item.weaponRanged': '🔫',
  'item.ammo': '🧨',
  'item.fuel': '⛽',
  'item.misc': '📦',

  'item.canned_food': '🥫',
  'item.rice_pack': '🍚',
  'item.instant_noodles': '🍜',
  'item.snacks': '🍪',
  'item.hawker_meal': '🍛',
  'item.bak_kwa': '🥓',
  'item.army_ration': '🎖️',
  'item.milo_tin': '🥤',
  'item.condensed_milk': '🥛',
  'item.kaya_toast': '🍞',
  'item.curry_puff': '🥟',
  'item.nasi_lemak': '🍱',
  'item.wild_boar_meat': '🥩',
  'item.river_fish': '🐟',
  'item.durian': '🍈',
  'item.tiger_beer': '🍺',
  'item.chin_chow': '🧋',
  'item.yakult': '🍶',
  'item.tiger_balm': '🧴',
  'item.axe_oil': '💚',
  'item.po_chai': '💊',
  'item.splint': '🦴',
  'item.n95_mask': '😷',
  'item.mosquito_coil': '🌀',
  'item.wooden_stick': '🪵',
  'item.meat_cleaver': '🔪',
  'item.golf_club': '🏌️',
  'item.baseball_bat': '🏏',
  'item.katana': '⚔️',
  'item.spear_knife': '🔱',
  'item.spear_cleaver': '🔱',
  'item.spear_parang': '🔱',
  'item.changkol': '⛏️',
  'item.sbo_vest': '🎽',
  'item.ez_link_card': '💳',
  'item.red_packet': '🧧',
  'item.joss_paper': '📄',
  'item.rain_tarp': '⛺',
  'item.powerbank': '🔌',
  'item.four_d_ticket': '🎫',
  'item.water_bottle': '💧',
  'item.newater': '🚰',
  'item.dirty_water': '🫗',
  'item.purification_tabs': '🧊',
  'item.cloth_rags': '🧻',
  'item.glass_bottle': '🍾',
  'item.spare_parts': '⚙️',
  'item.whetstone': '🪨',
  'item.gun_oil': '🛢️',
  'item.soft_drink': '🥤',
  'item.isotonic': '🧴',
  'item.bandage': '🩹',
  'item.painkillers': '💊',
  'item.medkit': '🧰',
  'item.antibiotics': '💉',
  'item.antiseptic': '🧪',
  'item.coffee': '☕',
  'item.energy_drink': '🥫',
  'item.kitchen_knife': '🔪',
  'item.hammer': '🔨',
  'item.crowbar': '🪓',
  'item.fire_axe': '🪓',
  'item.parang': '🗡️',
  'item.pistol': '🔫',
  'item.shotgun': '🔫',
  'item.ammo_box': '🧨',
  'item.ammo_shell': '🔴',
  'item.hard_hat': '⛑️',
  'item.riot_helmet': '🪖',
  'item.leather_jacket': '🧥',
  'item.work_vest': '🦺',
  'item.kevlar_vest': '🛡️',
  'item.riot_shield': '🛡️',
  'item.torch': '🔦',
  'item.fuel_can': '⛽',
  'item.duct_tape': '🩶',
  'item.batteries': '🔋',
  'item.scrap_metal': '🔩',
  'item.toolbox': '🧰',
  'item.jewellery': '💍',
};
