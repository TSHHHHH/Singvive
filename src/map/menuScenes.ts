/**
 * Camera scenes for the home screen backdrop (components/MenuBackdrop.tsx).
 */

export interface Scene {
  lat: number;
  lng: number;
  bearing: number;
  /** Where the evac light stands. */
  beacon: { lat: number; lng: number };
}

/** Metres to degrees, near enough at Singapore's latitude. */
const M_LAT = 1 / 110_574;
const M_LNG = 1 / 111_300;

/**
 * A scene looking along `bearing`, with the evac light `ahead` metres away,
 * `side` degrees off the view line (so it stands clear of the menu column).
 */
function scene(lat: number, lng: number, bearing: number, ahead = 700, side = 32): Scene {
  const r = ((bearing + side) * Math.PI) / 180;
  return {
    lat,
    lng,
    bearing,
    beacon: { lat: lat + Math.cos(r) * ahead * M_LAT, lng: lng + Math.sin(r) * ahead * M_LNG },
  };
}

/** Places that read as Singapore from a tilted camera: towers, estates, the bay. */
export const SCENES: readonly Scene[] = [
  scene(1.2795, 103.8505, 335), // Marina Bay, looking into the CBD
  scene(1.3325, 103.8475, 20), // Toa Payoh estate
  scene(1.3045, 103.8305, 110), // Orchard Road
  scene(1.3335, 103.7425, 300), // Jurong East
  scene(1.3525, 103.9440, 200), // Tampines
  scene(1.3700, 103.8480, 160), // Ang Mo Kio
];


/** A scene over a saved run: the survivor's spot, looking toward their evac. */
export function sceneFor(
  at: { lat: number; lng: number },
  evac: { lat: number; lng: number } | null,
): Scene {
  if (!evac) return scene(at.lat, at.lng, 0);
  const dy = (evac.lat - at.lat) / M_LAT;
  const dx = (evac.lng - at.lng) / M_LNG;
  const toward = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  // Turn the camera a little so the light stands clear of the menu column,
  // still in its true direction. A far evac stands at the edge of view.
  const side = 32;
  const ahead = Math.min(Math.hypot(dx, dy), 900);
  return scene(at.lat, at.lng, (toward - side + 360) % 360, ahead, side);
}
