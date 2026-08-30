// Shared basemap config so GameMap and SpawnSelect stay in sync.
//
// ACTIVE: CARTO "Dark Matter". Native tiles to z20, and serves @2x variants —
// the `{r}` placeholder is what Leaflet expands to "@2x" on high-DPI displays.
// Dropping `{r}` (or using a provider without @2x tiles) makes the whole map
// look soft on a retina screen at every zoom level.
//
// Raster tiles watermark "API KEY REQUIRED" unless `VITE_CARTO_API_KEY` is set
// (`.env.local`; baked in at Vite build). Free key: carto.com/basemaps/apikey
const CARTO_DARK_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY?.trim();

export const TILE_URL = CARTO_KEY
  ? `${CARTO_DARK_URL}?key=${encodeURIComponent(CARTO_KEY)}`
  : CARTO_DARK_URL;

// CARTO's terms require attributing both them and OpenStreetMap.
export const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO';

/** CDN shards CARTO serves tiles from. */
export const TILE_SUBDOMAINS = 'abcd';

/** Highest zoom the active provider actually has tiles for. */
export const TILE_MAX_NATIVE_ZOOM = 20;

// ALTERNATIVES, if CARTO is ever blocked or rate-limited:
//
// Stadia "Alidade Smooth Dark" — sharpest option, retina, native z20. Keyless
// on localhost ONLY; a deployed domain needs a free Stadia API key with the
// domain allowlisted, or every tile 401s. Subdomains: none.
export const STADIA_DARK_URL =
  'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png';
export const STADIA_ATTRIBUTION =
  '&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap';

// Esri "World Dark Gray Base" — keyless, but NO @2x tiles and nothing above
// z16, so it looks blurry on high-DPI screens. Last resort only; if you switch
// to it, set TILE_MAX_NATIVE_ZOOM to 16. Subdomains: none.
export const ESRI_DARK_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
export const ESRI_ATTRIBUTION = '&copy; Esri';
