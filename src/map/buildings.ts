import type { Map as MlMap, MapSourceDataEvent } from 'maplibre-gl';
import type { ExploredCircle } from '../game/fog';
import type { PoiCategory } from '../game/types';
import { BASEMAP, GROUND_COLOR, slotId } from './mapStyle';
import { FOG_COLOUR, FOG_TOTAL } from './fogGeometry';
import { anchorOf, dimHex, inDisc, mixHex, pointInRing, pxPerMetre, toLngLatRing, type Disc, type LngLatPair } from './geo';
import { alive } from './layers';

/**
 * The 3D run map's buildings: the basemap's own footprints extruded to their
 * real heights.
 *
 * - **Fog.** A building stands only once it's been seen: inside the live sight
 *   disc, any explored disc, or under a sensed site. Everything else lies flat
 *   in the fog's colour, so the unexplored island stays dark. Revealed
 *   buildings rise out of the ground (feature-state `rise`, 0 → 1) instead of
 *   popping in.
 * - **Sites.** Each game location is matched to the basemap building it sits
 *   in, which then takes the site's colour, lifts its badge to the roof and
 *   takes its taps. A small shop inside a tower (TENANT_MAX_M) keeps a plain
 *   street-level badge: colouring a 200 m tower as a 7-Eleven breaks the read.
 * - **Zoom.** Below LOD_ZOOM the basemap's flat building fills draw instead;
 *   heights grow in across one zoom level, so pinching in raises the city.
 *
 * Imperative on purpose: it touches thousands of features and animates them
 * per frame, which React would only get in the way of.
 */

/** Extrusions draw from here. CARTO's building ids are stable from z15 tiles. */
export const LOD_ZOOM = 15;
/** Heights grow from 0 to full across this much zoom above LOD_ZOOM. */
const ZOOM_RISE_SPAN = 1;
/** How long a building takes to rise out of the ground when revealed. */
const RISE_MS = 600;
/** After tiles load, wait this long before indexing their buildings. */
const INDEX_DEBOUNCE_MS = 300;

export const BUILDINGS_LAYER = 'buildings-3d';
export const SELECTED_COLOR = '#f0c040';
const BASE_BUILDING_COLOR = '#2a2e2a';
/**
 * An unrevealed footprint draws over the ground fog, so it takes the colour
 * the fog gives the ground, undershot a little: extrusion lighting brightens
 * roofs, which would otherwise outline every footprint in the dark.
 */
const FLAT_COLOR = dimHex(mixHex(GROUND_COLOR, FOG_COLOUR, FOG_TOTAL), 0.7);

/**
 * Largest building (metres) a site of this kind can *be*. Taller, and the
 * site is a tenant (a shop in a tower block): it keeps a street-level marker.
 */
const TENANT_MAX_M: Partial<Record<PoiCategory, number>> = {
  convenience: 15,
  pharmacy: 15,
  clinic: 20,
  fuel: 12,
  hardware: 20,
  supermarket: 25,
  foodcourt: 25,
  mrt: 30,
};

type FeatureId = string | number;

export interface Site3d {
  id: string;
  lat: number;
  lng: number;
  /** Footprint from the bake, `[lat, lng]` (sites without one match by point). */
  outline?: ReadonlyArray<readonly [number, number]>;
  category: PoiCategory;
  /** The building's colour while it stands for this site. */
  color: string;
  selected: boolean;
}

export type BuildingHit = { kind: 'site'; id: string } | { kind: 'building'; lat: number; lng: number };

interface Rise {
  from: number;
  to: number;
  start: number;
  v: number;
}

interface Box {
  b: [number, number, number, number];
  ring: number[][];
  h: number;
  id: FeatureId | undefined;
  part: boolean;
}

/** Height (or base) × rise, grown in across the LOD zoom band. */
function heightExpr(base: boolean) {
  const own = base
    ? ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0]
    : ['coalesce', ['get', 'render_height'], ['get', 'height'], 8];
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    LOD_ZOOM,
    0,
    LOD_ZOOM + ZOOM_RISE_SPAN,
    ['*', own, ['coalesce', ['feature-state', 'rise'], 0]],
  ] as unknown as number;
}

const ringBox = (ring: ReadonlyArray<ReadonlyArray<number>>): [number, number, number, number] => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
};

export class BuildingEngine {
  private readonly map: MlMap;
  /** Called with every site's roof height (metres) when matching finds more. */
  onRoofs: ((roofs: ReadonlyMap<string, number>) => void) | null = null;
  private readonly src = BASEMAP.source;
  private readonly sl = BASEMAP.buildingLayer;
  private destroyed = false;
  /** Rises snap instead of animating (reduced motion). */
  private instant = false;

  // Reveal inputs.
  private explored: readonly ExploredCircle[] = [];
  private live: Disc | null = null;

  // Sites and their matched buildings.
  private sites = new Map<string, Site3d>();
  private rings = new Map<string, LngLatPair[] | null>();
  private tried = new Set<string>();
  private roofs = new Map<string, number>();
  private siteFeatures = new Map<string, FeatureId[]>();
  private featureToSite = new Map<FeatureId, string>();
  /** Feature-state currently applied to site buildings, keyed by id. */
  private applied = new Map<FeatureId, string>();

  /** Buildings in the loaded z15+ tiles: id → anchor. */
  private index = new Map<FeatureId, { lat: number; lng: number }>();
  private rise = new Map<FeatureId, Rise>();
  private rising = new Set<FeatureId>();
  private riseRaf = 0;
  private indexTimer: ReturnType<typeof setTimeout> | null = null;
  /** Flat basemap building layers and their original zoom ranges. */
  private flatLayers: { id: string; min: number; max: number }[] = [];

  constructor(map: MlMap) {
    this.map = map;
    this.install();
  }

  /** Roof heights (metres) of the sites matched so far, by site id. */
  roofHeights(): ReadonlyMap<string, number> {
    return new Map(this.roofs);
  }

  // --- Lifecycle ---------------------------------------------------------------

  private install() {
    const map = this.map;
    for (const l of map.getStyle().layers) {
      if (l.type === 'fill' && 'source-layer' in l && l['source-layer'] === this.sl) {
        const min = l.minzoom ?? 0;
        const max = l.maxzoom ?? 24;
        this.flatLayers.push({ id: l.id, min, max });
        map.setLayerZoomRange(l.id, min, Math.min(max, LOD_ZOOM));
      }
    }
    map.addLayer(
      {
        id: BUILDINGS_LAYER,
        type: 'fill-extrusion',
        source: this.src,
        'source-layer': this.sl,
        minzoom: LOD_ZOOM,
        paint: {
          'fill-extrusion-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            SELECTED_COLOR,
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'rise'], 0],
              0,
              FLAT_COLOR,
              1,
              ['to-color', ['coalesce', ['feature-state', 'color'], BASE_BUILDING_COLOR]],
            ],
          ],
          'fill-extrusion-height': heightExpr(false),
          'fill-extrusion-base': heightExpr(true),
          'fill-extrusion-opacity': 0.9,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      slotId('buildings'),
    );
    map.setSky({
      'sky-color': '#0b0d0a',
      'horizon-color': '#1c221c',
      'fog-color': '#0b0d0a',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.85,
      'atmosphere-blend': 0,
    });
    map.setLight({ anchor: 'viewport', color: '#ffffff', intensity: 0.4, position: [1.5, 210, 35] });

    map.on('sourcedata', this.onSourceData);
    map.on('idle', this.onIdle);
    map.on('move', this.placeBadges);
    this.placeBadges();
    this.scheduleIndex();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const map = this.map;
    map.off('sourcedata', this.onSourceData);
    map.off('idle', this.onIdle);
    map.off('move', this.placeBadges);
    if (this.indexTimer) clearTimeout(this.indexTimer);
    if (this.riseRaf) cancelAnimationFrame(this.riseRaf);
    if (!alive(map)) return;
    map.getContainer().style.removeProperty('--roof-lift');
    if (map.getLayer(BUILDINGS_LAYER)) map.removeLayer(BUILDINGS_LAYER);
    for (const l of this.flatLayers) if (map.getLayer(l.id)) map.setLayerZoomRange(l.id, l.min, l.max);
    // No id: clears every state this engine put on the building layer.
    if (map.getSource(this.src)) map.removeFeatureState({ source: this.src, sourceLayer: this.sl });
  }

  // --- Inputs ------------------------------------------------------------------

  setInstant(instant: boolean) {
    this.instant = instant;
  }

  /** `explored` is compared by identity; pass the store's array as-is. */
  setReveal(explored: readonly ExploredCircle[], live: { lat: number; lng: number; radius: number }) {
    const same =
      explored === this.explored &&
      this.live?.lat === live.lat &&
      this.live.lng === live.lng &&
      this.live.r === live.radius;
    if (same) return;
    this.explored = explored;
    this.live = { lat: live.lat, lng: live.lng, r: live.radius };
    this.updateReveal(false);
  }

  /** The sites drawn on screen now (already fog- and viewport-culled). */
  setSites(sites: readonly Site3d[]) {
    const next = new Map<string, Site3d>();
    let fresh = false;
    for (const s of sites) {
      next.set(s.id, s);
      if (!this.sites.has(s.id)) fresh = true;
    }
    const gone = [...this.sites.keys()].some((id) => !next.has(id));
    this.sites = next;
    if (fresh) this.matchSites();
    this.applySiteStates();
    // A site's building stands even in fog, so membership changes the reveal.
    if (fresh || gone) this.updateReveal(false);
  }

  /** What a tap at this screen point lands on, nearest first. */
  hit(point: { x: number; y: number }): BuildingHit | null {
    if (!this.map.getLayer(BUILDINGS_LAYER)) return null;
    const top = this.map.queryRenderedFeatures([point.x, point.y], { layers: [BUILDINGS_LAYER] })[0];
    if (!top || top.id === undefined) return null;
    const site = this.featureToSite.get(top.id);
    if (site !== undefined && this.sites.has(site)) return { kind: 'site', id: site };
    // Only a standing building blocks the ground behind it.
    if ((this.rise.get(top.id)?.v ?? 0) < 0.5) return null;
    // Walk to the building, not to the ground the tap ray reaches behind it.
    const known = this.index.get(top.id);
    if (known) return { kind: 'building', lat: known.lat, lng: known.lng };
    const at = anchorOf(top.geometry);
    return at ? { kind: 'building', lat: at[1], lng: at[0] } : null;
  }

  // --- Indexing and reveal ----------------------------------------------------

  private onSourceData = (e: MapSourceDataEvent) => {
    if (e.sourceId !== this.src || !e.tile) return;
    this.scheduleIndex();
  };

  private scheduleIndex() {
    if (this.indexTimer) return;
    this.indexTimer = setTimeout(() => {
      this.indexTimer = null;
      if (this.destroyed) return;
      this.indexBuildings();
    }, INDEX_DEBOUNCE_MS);
  }

  /**
   * Rebuild the building index from the loaded tiles. Only what is loaded is
   * kept, so the reveal pass stays sized to the view, not to the whole run.
   */
  private indexBuildings() {
    const map = this.map;
    if (!map.getSource(this.src) || map.getZoom() < LOD_ZOOM) return;
    const next = new Map<FeatureId, { lat: number; lng: number }>();
    for (const f of map.querySourceFeatures(this.src, { sourceLayer: this.sl })) {
      if (f.id === undefined || next.has(f.id)) continue;
      const at = anchorOf(f.geometry);
      if (at) next.set(f.id, { lat: at[1], lng: at[0] });
    }
    const first = this.index.size === 0;
    this.index = next;
    // The first reveal (entering 3D, loading a run) is instant; tiles that
    // load later rise in.
    this.updateReveal(first);
  }

  private updateReveal(instant: boolean) {
    const map = this.map;
    if (this.destroyed || !this.live || !this.index.size || !map.getLayer(BUILDINGS_LAYER)) return;
    const cosLat = Math.cos((this.live.lat * Math.PI) / 180);
    // Only explored discs that can touch the loaded area are worth testing.
    const b = map.getBounds();
    const padLat = 0.02;
    const discs: Disc[] = [];
    for (const c of this.explored) {
      const r = c.radius / 111_320;
      if (
        c.lat + r < b.getSouth() - padLat ||
        c.lat - r > b.getNorth() + padLat ||
        c.lng + r < b.getWest() - padLat ||
        c.lng - r > b.getEast() + padLat
      ) {
        continue;
      }
      discs.push({ lat: c.lat, lng: c.lng, r: c.radius });
    }
    const siteIds = new Set<FeatureId>();
    for (const [site, ids] of this.siteFeatures) if (this.sites.has(site)) for (const id of ids) siteIds.add(id);

    const snap = instant || this.instant;
    const now = performance.now();
    for (const [id, c] of this.index) {
      const cur = this.rise.get(id);
      const curTo = cur?.to ?? 0;
      const want =
        siteIds.has(id) || inDisc(c.lat, c.lng, this.live, cosLat) || discs.some((d) => inDisc(c.lat, c.lng, d, cosLat))
          ? 1
          : 0;
      if (want === curTo) continue;
      if (snap) {
        this.rise.set(id, { from: want, to: want, start: now, v: want });
        this.rising.delete(id);
        map.setFeatureState({ source: this.src, sourceLayer: this.sl, id }, { rise: want });
      } else {
        const v = cur?.v ?? 0;
        this.rise.set(id, { from: v, to: want, start: now, v });
        this.rising.add(id);
      }
    }
    if (this.rising.size && !this.riseRaf) this.riseRaf = requestAnimationFrame(this.stepRise);
  }

  private stepRise = (now: number) => {
    this.riseRaf = 0;
    if (this.destroyed || !alive(this.map) || !this.map.getLayer(BUILDINGS_LAYER)) return;
    for (const id of this.rising) {
      const r = this.rise.get(id);
      if (!r) {
        this.rising.delete(id);
        continue;
      }
      const t = Math.min(1, (now - r.start) / RISE_MS);
      const e = 1 - (1 - t) ** 3; // ease-out: quick start, soft landing
      r.v = t >= 1 ? r.to : r.from + (r.to - r.from) * e;
      this.map.setFeatureState({ source: this.src, sourceLayer: this.sl, id }, { rise: r.v });
      if (t >= 1) this.rising.delete(id);
    }
    if (this.rising.size) this.riseRaf = requestAnimationFrame(this.stepRise);
  };

  // --- Sites → buildings --------------------------------------------------------

  private onIdle = () => {
    this.matchSites();
  };

  private ringOf(site: Site3d): LngLatPair[] | null {
    let ring = this.rings.get(site.id);
    if (ring === undefined) {
      ring = site.outline && site.outline.length >= 3 ? toLngLatRing(site.outline) : null;
      this.rings.set(site.id, ring);
    }
    return ring;
  }

  /**
   * Find each on-screen site's building in the loaded tiles. One building *is*
   * the site: the candidate whose footprint best matches the bake's (towers
   * on a podium are separate buildings and must not be claimed just for
   * sitting inside it), plus any building parts inside the footprint.
   */
  private matchSites() {
    const map = this.map;
    if (this.destroyed || map.getZoom() < LOD_ZOOM || !map.isSourceLoaded(this.src)) return;
    const view = map.getBounds();
    const pending = [...this.sites.values()].filter((s) => !this.tried.has(s.id) && view.contains([s.lng, s.lat]));
    if (!pending.length) return;

    const boxes: Box[] = [];
    for (const f of map.querySourceFeatures(this.src, { sourceLayer: this.sl })) {
      const props = f.properties as Record<string, unknown>;
      const h = Number(props.render_height ?? props.height ?? NaN);
      if (!Number.isFinite(h) || h <= 0) continue;
      const part = props.kind === 'building_part';
      const g = f.geometry;
      const outers =
        g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((pg) => pg[0]) : [];
      for (const ring of outers) if (ring) boxes.push({ b: ringBox(ring), ring, h, id: f.id, part });
    }

    let changed = false;
    for (const site of pending) {
      this.tried.add(site.id);
      const ring = this.ringOf(site);
      const sb = ring ? ringBox(ring) : null;
      const siteArea = sb ? Math.max(1e-12, (sb[2] - sb[0]) * (sb[3] - sb[1])) : 0;
      let main: Box | null = null;
      let mainScore = Infinity;
      const parts: Box[] = [];
      for (const box of boxes) {
        const [x0, y0, x1, y1] = box.b;
        const area = Math.max(1e-12, (x1 - x0) * (y1 - y0));
        if (sb && ring) {
          if (x1 < sb[0] || x0 > sb[2] || y1 < sb[1] || y0 > sb[3]) continue;
          const centreInside = pointInRing((x0 + x1) / 2, (y0 + y1) / 2, ring);
          if (box.part) {
            if (centreInside) parts.push(box);
            continue;
          }
          if (!centreInside && !pointInRing(site.lng, site.lat, box.ring)) continue;
          const score = Math.abs(Math.log(area / siteArea));
          if (score < mainScore) {
            mainScore = score;
            main = box;
          }
        } else {
          // No footprint: the smallest whole building the point stands in.
          if (box.part || site.lng < x0 || site.lng > x1 || site.lat < y0 || site.lat > y1) continue;
          if (!pointInRing(site.lng, site.lat, box.ring)) continue;
          if (area < mainScore) {
            mainScore = area;
            main = box;
          }
        }
      }
      let best = 0;
      const ids = new Set<FeatureId>();
      for (const box of main ? [main, ...parts] : parts) {
        if (box.h > best) best = box.h;
        if (box.id !== undefined) ids.add(box.id);
      }
      if (best <= 0) continue;
      const cap = TENANT_MAX_M[site.category];
      if (cap !== undefined && best > cap) continue; // a tenant: street-level badge
      // A building claimed by an earlier site stays with it.
      const own = [...ids].filter((id) => !this.featureToSite.has(id));
      if (!own.length) continue;
      this.siteFeatures.set(site.id, own);
      for (const id of own) this.featureToSite.set(id, site.id);
      this.roofs.set(site.id, best);
      changed = true;
    }
    if (!changed) return;
    this.onRoofs?.(this.roofHeights());
    this.applySiteStates();
    this.updateReveal(false);
  }

  /** Push site colours and selection onto the buildings that are sites. */
  private applySiteStates() {
    const map = this.map;
    if (this.destroyed || !map.getLayer(BUILDINGS_LAYER)) return;
    const want = new Map<FeatureId, { color: string; selected: boolean }>();
    for (const [site, ids] of this.siteFeatures) {
      const s = this.sites.get(site);
      if (!s) continue;
      for (const id of ids) want.set(id, { color: s.color, selected: s.selected });
    }
    for (const id of [...this.applied.keys()]) {
      if (want.has(id)) continue;
      const target = { source: this.src, sourceLayer: this.sl, id };
      map.removeFeatureState(target, 'color');
      map.removeFeatureState(target, 'selected');
      this.applied.delete(id);
    }
    for (const [id, s] of want) {
      const key = `${s.color}|${s.selected ? 1 : 0}`;
      if (this.applied.get(id) === key) continue;
      map.setFeatureState({ source: this.src, sourceLayer: this.sl, id }, s);
      this.applied.set(id, key);
    }
  }

  // --- Badges ------------------------------------------------------------------

  /**
   * Badges ride their roofs: a marker with a roof translates up by
   * `--roof × --roof-lift` px (index.css). One CSS variable per frame on the
   * container moves every badge, instead of one setOffset per marker.
   */
  private placeBadges = () => {
    const map = this.map;
    if (this.destroyed || !alive(map)) return;
    const z = map.getZoom();
    const zoomRise = Math.min(1, Math.max(0, (z - LOD_ZOOM) / ZOOM_RISE_SPAN));
    const lift = pxPerMetre(z, map.getCenter().lat) * Math.sin((map.getPitch() * Math.PI) / 180) * zoomRise;
    map.getContainer().style.setProperty('--roof-lift', lift.toFixed(4));
  };
}
