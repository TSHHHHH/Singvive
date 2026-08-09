// Shared basemap config so GameMap and SpawnSelect stay in sync.
//
// ACTIVE: Esri "World Dark Gray Base". Keyless on any domain, so it works in
// production without signup. Native tiles stop at z16 — TILE_MAX_NATIVE_ZOOM
// makes Leaflet upscale past that instead of showing blank tiles.
export const TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

export const TILE_ATTRIBUTION = '&copy; Esri';

/** Highest zoom the active provider actually has tiles for. */
export const TILE_MAX_NATIVE_ZOOM = 16;

// ALTERNATIVE: Stadia "Alidade Smooth Dark" — better looking (detailed dark
// streets + labels, native to z20). Keyless on localhost ONLY; a deployed
// domain needs a free Stadia API key with the domain allowlisted, or every
// tile request 401s. To switch: use these below and set the native zoom to 20.
export const STADIA_DARK_URL =
  'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png';

export const STADIA_ATTRIBUTION =
  '&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap';
