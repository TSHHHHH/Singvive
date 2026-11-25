// The px font sizes below are icon geometry, not type: each glyph is centred in
// a hard-coded pin box, so it must not scale with the Font size setting. They
// are allow-listed in scripts/check-type-scale.mjs.
import { POI_CONFIG } from '../game/poi';
import { FACTION_CONFIG } from '../game/factions';
import { iconMarkup } from '../icons/markup';
import type { Poi, PoiCategory } from '../game/types';
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

export const trackedLeadIcon: MapIcon = {
  html: `<span class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-signal bg-concrete-900 shadow-signage">${iconMarkup('action.target', { size: 18, color: '#e6ed88' })}</span>`,
  size: [28, 28],
  anchor: [14, 38],
};

const poiIconCache = new Map<string, MapIcon>();
const identifiedIconCache = new Map<PoiCategory, MapIcon>();

/** Identity-only pins cannot receive danger, faction or depletion state. */
export function identifiedIcon(category: PoiCategory): MapIcon {
  const cached = identifiedIconCache.get(category);
  if (cached) return cached;
  const icon: MapIcon = {
    html: `<div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#1c211f;border:2px dashed #e8e5dd;box-shadow:0 0 0 2px #08080a,0 3px 6px #0009;box-sizing:border-box;">${iconMarkup(POI_CONFIG[category].icon, { size: 19, color: '#fff5e0' })}</div>`,
    size: [34, 34],
    anchor: [17, 17],
  };
  identifiedIconCache.set(category, icon);
  return icon;
}

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
  // Lift faction hues against the dark glyph, including the 88 Tong's red.
  const markerColor = factionColor ? mixHex(factionColor, '#ffffff', 0.2) : cfg.color;
  // Depletion mutes the fill, never the glyph or the danger ring.
  const fillColor = dim ? mixHex(markerColor, '#40433e', 0.7) : markerColor;
  const glyphColor = dim ? '#e8e5dd' : '#08080a';

  const key = `${poi.category}|${danger}|${dim ? 1 : 0}|${outpost ? poi.factionId : 0}|${held ? poi.factionId : 0}`;
  const cached = poiIconCache.get(key);
  if (cached) return cached;

  const glyph =
    outpost && poi.factionId
      ? iconMarkup(FACTION_CONFIG[poi.factionId].icon, { size: 19, color: glyphColor })
      : iconMarkup(cfg.icon, { size: 19, color: glyphColor });
  const badge =
    held && poi.factionId ? iconMarkup(FACTION_CONFIG[poi.factionId].icon, { size: 12, color: '#08080a' }) : '';
  const borderColor = outpost ? '#f0ead8' : ring;
  const px = outpost ? 38 : 34;
  const icon: MapIcon = {
    html: `<div style="position:relative;width:${px}px;height:${px}px;">
      <div style="
        width:100%;height:100%;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:15px;line-height:1;
        background:${fillColor};
        border:${outpost ? 3 : 2}px solid ${borderColor};
        ${outpost ? `outline:2px solid ${factionColor};outline-offset:1px;` : ''}
        box-shadow:0 0 0 ${outpost ? 5 : 2}px #08080a,0 3px 6px #0009;
        box-sizing:border-box;
      ">${glyph}</div>
      ${badge ? `<div style="position:absolute;right:-5px;top:-5px;width:19px;height:19px;border-radius:50%;background:${markerColor};border:2px solid #08080a;display:flex;align-items:center;justify-content:center;line-height:1;">${badge}</div>` : ''}
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
 *  Rests as a small soft dot so a district full of unknowns stays calm; the
 *  "?" badge grows back on hover, when picked, or as the here capsule
 *  (`.blip-unknown` in index.css). The marker box keeps the full 24px, so
 *  the dot's tap and hover target never shrinks. The glow, hint ring and "?"
 *  are separate layers so the grow/shrink animates opacity and transform only. */
const UNKNOWN_ICON: MapIcon = {
  html: `<div class="blip-unknown" style="
    width:24px;height:24px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:14px;font-weight:700;cursor:pointer;
    background:#e8e5dd;border:2px solid #ffffff;box-sizing:border-box;position:relative;
  "><span class="blip-glow"></span><span class="blip-ring"></span><span class="blip-q">?</span></div>`,
  size: [24, 24],
  anchor: [12, 12],
};
export const unknownIcon = (): MapIcon => UNKNOWN_ICON;

const playerLocationCache = new WeakMap<MapIcon, MapIcon>();
const compactPlayerLocationCache = new WeakMap<MapIcon, MapIcon>();

/** One clickable capsule at a site, anchored on its location badge. */
export function playerLocationIcon(location: MapIcon, compact = false): MapIcon {
  const cache = compact ? compactPlayerLocationCache : playerLocationCache;
  const cached = cache.get(location);
  if (cached) return cached;
  const scale = compact ? 0.7 : 1;
  const inset = compact ? 6 : 8;
  const siteTop = compact ? 24 : 32;
  const width = location.size[0] * scale + inset * 2;
  const height = location.size[1] * scale + siteTop + inset;
  const icon: MapIcon = {
    html: `<div class="player-location${compact ? ' player-location--compact' : ''}" style="width:${width}px;height:${height}px;">
      <div class="player-location__human">${iconMarkup('combat.player', { size: compact ? 14 : 18, color: '#fff5e0' })}</div>
      <div class="player-location__site" style="left:${inset - 2}px;top:${siteTop - 2}px;transform:scale(${scale});">${location.html}</div>
    </div>`,
    size: [width, height],
    anchor: [inset + location.anchor[0] * scale, siteTop + location.anchor[1] * scale],
  };
  cache.set(location, icon);
  return icon;
}

/** Standalone human marker for spawn, open ground, and travel. At a site the
 *  POI owns the combined capsule, while this marker keeps driving the camera. */
const PLAYER_ICON: MapIcon = {
  className: 'player-pin',
  html: `<div class="player-pin__avatar">${iconMarkup('combat.player', { size: 18, color: '#fff5e0' })}</div>`,
  size: [32, 32],
  anchor: [16, 16],
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
