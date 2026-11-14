// The px font sizes below are icon geometry, not type: each glyph is centred in
// a hard-coded pin box, so it must not scale with the Font size setting. They
// are allow-listed in scripts/check-type-scale.mjs.
import { POI_CONFIG } from '../game/poi';
import { FACTION_CONFIG } from '../game/factions';
import { iconMarkup } from '../icons/markup';
import type { Poi } from '../game/types';
import { mixHex } from '../map/geo';

/**
 * A map pin: HTML for a DOM marker, its box, and the pixel inside the box that
 * sits on the map point. `MapMarker` / `iconElement` (src/map/markers.ts) turn
 * one into a MapLibre Marker element.
 *
 * Every icon below is built once per distinct *appearance* and reused: a POI pin
 * only looks different when its category, danger ring, exhausted state, known
 * faction or outpost mark differs, and the fixed icons never differ at all. Markers compare
 * icons by identity to decide whether to rebuild their element.
 */
export interface MapIcon {
  html: string;
  className?: string;
  size: [number, number];
  anchor: [number, number];
}

const poiIconCache = new Map<string, MapIcon>();

/** Known territory colour for identified sites; outposts also carry their faction emblem. */
export function knownFactionColor(poi: Poi): string | null {
  return poi.factionId && (poi.isFactionOutpost || poi.isFactionRevealed)
    ? FACTION_CONFIG[poi.factionId].color
    : null;
}

/** A coloured circular pin with the category glyph. */
export function poiIcon(poi: Poi): MapIcon {
  const cfg = POI_CONFIG[poi.category];
  const factionColor = knownFactionColor(poi);
  const dim = poi.exhausted && !factionColor;
  const danger = Math.round(poi.currentDanger);
  const ring = dangerColor(danger);
  const outpost = !!poi.isFactionOutpost && !!poi.factionId;
  const held = !outpost && !!poi.factionId && poi.isFactionRevealed;
  // Lift faction hues against the dark glyph, including the Syndicate's red.
  const markerColor = factionColor ? mixHex(factionColor, '#ffffff', 0.2) : cfg.color;

  const key = `${poi.category}|${danger}|${dim ? 1 : 0}|${outpost ? poi.factionId : 0}|${held ? poi.factionId : 0}`;
  const cached = poiIconCache.get(key);
  if (cached) return cached;

  const glyph =
    outpost && poi.factionId
      ? iconMarkup(FACTION_CONFIG[poi.factionId].icon, { size: 15, color: '#08080a' })
      : iconMarkup(cfg.icon, { size: 15, color: '#08080a' });
  const badge =
    held && poi.factionId ? iconMarkup(FACTION_CONFIG[poi.factionId].icon, { size: 9, color: markerColor }) : '';
  const borderColor = outpost ? '#f0ead8' : ring;
  const px = outpost ? 34 : 30;
  const icon: MapIcon = {
    html: `<div style="position:relative;width:${px}px;height:${px}px;">
      <div style="
        width:100%;height:100%;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:15px;line-height:1;
        background:${markerColor};
        border:${outpost ? 3 : 2}px solid ${borderColor};
        ${outpost ? `outline:2px solid ${factionColor};outline-offset:1px;` : ''}
        opacity:${dim ? 0.4 : 1};
        box-sizing:border-box;
      ">${glyph}</div>
      ${badge ? `<div style="position:absolute;right:-1px;bottom:-1px;width:14px;height:14px;border-radius:50%;background:#08080a;border:1.5px solid ${markerColor};display:flex;align-items:center;justify-content:center;line-height:1;">${badge}</div>` : ''}
    </div>`,
    size: [px, px],
    anchor: [px / 2, px / 2],
  };
  poiIconCache.set(key, icon);
  return icon;
}

/** Rumoured site from a smudged map note — fuzzy, not a real POI pin yet. */
const RUMOUR_ICON: MapIcon = {
  html: `<div style="
    width:26px;height:26px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:13px;font-weight:700;color:#e8e5dd;cursor:pointer;
    background:rgba(20,26,30,.85);border:2px dashed #c4b07a;opacity:.9;
  ">~</div>`,
  size: [26, 26],
  anchor: [13, 13],
};
export const rumourIcon = (): MapIcon => RUMOUR_ICON;

/** Anonymous "?" blip — something is there, but you must go find out what.
 *  White + glow so it stands out against the dark map. */
const UNKNOWN_ICON: MapIcon = {
  html: `<div style="
    width:24px;height:24px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:14px;font-weight:700;color:#1a1204;cursor:pointer;
    background:#e8e5dd;border:2px solid #ffffff;
  ">?</div>`,
  size: [24, 24],
  anchor: [12, 12],
};
export const unknownIcon = (): MapIcon => UNKNOWN_ICON;

/** The player's marker — used both for the spawn preview and their live
 *  position on the game map. A person, not a house.
 *
 *  A teardrop rather than a disc: it hangs *above* the point it marks, so in a
 *  POI-dense block it no longer sits on top of the pin for the place the player
 *  is standing in. The trade is that it now covers whatever is a few pixels
 *  north of them instead, which is what `.player-pin` fading in index.css is
 *  for — the pin never eats a click, and it gets out of the way visually when
 *  the cursor enters its footprint. */
const PLAYER_ICON: MapIcon = {
  className: 'player-pin',
  html: `<div class="player-pin__body">
    <div class="player-pin__glyph">${iconMarkup('combat.player', { size: 16, color: '#e8e5dd' })}</div>
  </div><div class="player-pin__ground"></div>`,
  size: [30, 38],
  anchor: [15, 36],
};
export const playerIcon = (): MapIcon => PLAYER_ICON;

/** The extraction-zone beacon — always visible, the run's north star.
 *  Its pulse keyframes live in index.css. */
const EVAC_ICON: MapIcon = {
  html: `<div class="evac-beacon" style="
    width:38px;height:38px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:20px;background:rgba(20,26,30,.9);
    border:2px solid #2bc4d9;
  ">${iconMarkup('action.evac', { size: 20, color: '#2bc4d9' })}</div>`,
  size: [38, 38],
  anchor: [19, 19],
};
export const evacIcon = (): MapIcon => EVAC_ICON;

/** Where you're thinking of crossing to — bare ground, not a place. */
const TREK_TARGET_ICON: MapIcon = {
  html: `<div style="
    width:22px;height:22px;border-radius:50%;
    border:2px dashed #e8e5dd;opacity:.85;
  "></div>`,
  size: [22, 22],
  anchor: [11, 11],
};
export const trekTargetIcon = (): MapIcon => TREK_TARGET_ICON;

export function dangerColor(danger: number): string {
  switch (danger) {
    case 1:
      return '#b7b3a9';
    case 2:
      return '#cfccc4';
    case 3:
      return '#d9683d';
    case 4:
      return '#d9683d';
    default:
      return '#d92d2d';
  }
}
