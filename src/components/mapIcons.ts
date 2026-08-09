import L from 'leaflet';
import { POI_CONFIG } from '../game/poi';
import type { Poi } from '../game/types';

/** A coloured circular pin with the category glyph. Avoids Leaflet's
 *  broken default-marker image imports under bundlers. */
export function poiIcon(poi: Poi): L.DivIcon {
  const cfg = POI_CONFIG[poi.category];
  const dim = poi.exhausted;
  const ring = dangerColor(Math.round(poi.currentDanger));
  return L.divIcon({
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
    ">${cfg.glyph}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

/** Anonymous "?" blip — something is there, but you must go find out what.
 *  Amber + glow so it stands out against the dark map. */
export function unknownIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:24px;height:24px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;font-weight:700;color:#1a1204;cursor:pointer;
      background:#e6b83f;border:2px solid #ffe9a8;
      box-shadow:0 0 8px rgba(230,184,63,.85);
    ">?</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/** The player's marker — used both for the spawn preview and their live
 *  position on the game map. A person, not a house. */
export function playerIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:34px;height:34px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:18px;background:#1b2a1b;border:2px solid #6b8e23;
      box-shadow:0 0 10px rgba(107,142,35,.7);
    ">🧍</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

/** The extraction-zone beacon — always visible, the run's north star. */
export function evacIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:38px;height:38px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:20px;background:rgba(20,40,20,.85);
      border:2px solid #7bd88f;
      box-shadow:0 0 12px rgba(123,216,143,.9);
      animation:evacPulse 1.8s ease-in-out infinite;
    ">🚁</div>
    <style>@keyframes evacPulse{0%,100%{box-shadow:0 0 8px rgba(123,216,143,.6)}50%{box-shadow:0 0 18px rgba(123,216,143,1)}}</style>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

export function dangerColor(danger: number): string {
  switch (danger) {
    case 1:
      return '#7bd88f';
    case 2:
      return '#d8cf7b';
    case 3:
      return '#e0a458';
    case 4:
      return '#e06a4b';
    default:
      return '#e0342b';
  }
}
