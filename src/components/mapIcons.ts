import L from 'leaflet';
import { POI_CONFIG } from '../game/poi';
import { iconMarkup } from '../icons/markup';
import type { Poi } from '../game/types';

/**
 * Icons are handed to Leaflet as props, and a fresh object identity makes it
 * tear the marker's DOM down and rebuild it. Every icon below is therefore
 * built once per distinct *appearance* and reused: a POI pin only looks
 * different when its category, danger ring, or exhausted state differs, and the
 * fixed icons never differ at all.
 */
const poiIconCache = new Map<string, L.DivIcon>();

/** A coloured circular pin with the category glyph. Avoids Leaflet's
 *  broken default-marker image imports under bundlers. */
export function poiIcon(poi: Poi): L.DivIcon {
  const cfg = POI_CONFIG[poi.category];
  const dim = poi.exhausted;
  const danger = Math.round(poi.currentDanger);
  const ring = dangerColor(danger);

  const key = `${poi.category}|${danger}|${dim ? 1 : 0}`;
  const cached = poiIconCache.get(key);
  if (cached) return cached;

  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:30px;height:30px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:15px;line-height:1;
      background:${cfg.color};
      border:2px solid ${ring};
      box-shadow:0 0 6px rgba(0,0,0,.6);
      opacity:${dim ? 0.4 : 1};
      filter:${dim ? 'grayscale(1)' : 'none'};
    ">${iconMarkup(cfg.icon, { size: 15, color: '#08080a' })}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
  poiIconCache.set(key, icon);
  return icon;
}

/** Anonymous "?" blip — something is there, but you must go find out what.
 *  White + glow so it stands out against the dark map. */
const UNKNOWN_ICON = L.divIcon({
  className: '',
  html: `<div style="
    width:24px;height:24px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:14px;font-weight:700;color:#1a1204;cursor:pointer;
    background:#e8e5dd;border:2px solid #ffffff;
    box-shadow:0 0 8px rgba(232,229,221,.7);
  ">?</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
export const unknownIcon = (): L.DivIcon => UNKNOWN_ICON;

/** The player's marker — used both for the spawn preview and their live
 *  position on the game map. A person, not a house.
 *
 *  A teardrop rather than a disc: it hangs *above* the point it marks, so in a
 *  POI-dense block it no longer sits on top of the pin for the place the player
 *  is standing in. The trade is that it now covers whatever is a few pixels
 *  north of them instead, which is what `.player-pin` fading in index.css and
 *  the marker's `interactive={false}` are for — the pin never eats a click, and
 *  it gets out of the way visually when the cursor enters its footprint. */
const PLAYER_ICON = L.divIcon({
  className: 'player-pin',
  html: `<div class="player-pin__body">
    <div class="player-pin__glyph">${iconMarkup('combat.player', { size: 16, color: '#e8e5dd' })}</div>
  </div><div class="player-pin__ground"></div>`,
  iconSize: [30, 38],
  iconAnchor: [15, 36],
});
export const playerIcon = (): L.DivIcon => PLAYER_ICON;

/** The extraction-zone beacon — always visible, the run's north star.
 *  Its pulse keyframes live in index.css; inlining a <style> block here meant
 *  re-injecting a stylesheet every time the icon was rebuilt. */
const EVAC_ICON = L.divIcon({
  className: '',
  html: `<div class="evac-beacon" style="
    width:38px;height:38px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:20px;background:rgba(20,26,30,.9);
    border:2px solid #2bc4d9;
  ">${iconMarkup('action.evac', { size: 20, color: '#2bc4d9' })}</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});
export const evacIcon = (): L.DivIcon => EVAC_ICON;

/** Where you're thinking of crossing to — bare ground, not a place. */
const TREK_TARGET_ICON = L.divIcon({
  className: '',
  html: `<div style="
    width:22px;height:22px;border-radius:50%;
    border:2px dashed #e8e5dd;opacity:.85;
    box-shadow:0 0 6px rgba(0,0,0,.6);
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});
export const trekTargetIcon = (): L.DivIcon => TREK_TARGET_ICON;

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
