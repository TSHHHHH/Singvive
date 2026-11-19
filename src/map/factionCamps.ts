import { Marker, type Map as MlMap } from 'maplibre-gl';
import type { Feature, Polygon } from 'geojson';
import { hash01 } from './cityDamage';
import { fc, inDisc, type Disc, type LngLatPair } from './geo';
import { alive, installOverlay, setData } from './layers';
import type { Site3d } from './buildings';

const SOURCE = 'faction-camps';
const CAMP_ZOOM = 15.5;
interface Camp { id: string; at: LngLatPair; distance: number }

/** Pitch camp just beyond a facade, including for a tenant in a taller building. */
export function campEntrance(ring: ReadonlyArray<ReadonlyArray<number>>): LngLatPair {
  const east = ring.reduce((best, p) => p[0] > best[0] ? p : best);
  return [east[0] + 5 / 111_320, east[1]];
}

export function nearbyCamps(sites: Iterable<Site3d>, live: Disc | null, entrances: ReadonlyMap<string, LngLatPair>): Camp[] {
  if (!live) return [];
  const cos = Math.cos(live.lat * Math.PI / 180);
  const camps: Camp[] = [];
  for (const site of sites) {
    if (!site.occupied || !inDisc(site.lat, site.lng, live, cos)) continue;
    const at: LngLatPair = entrances.get(site.id) ?? [site.lng, site.lat];
    if (!inDisc(at[1], at[0], live, cos)) continue;
    camps.push({ id: site.id, at, distance: Math.hypot((at[0] - live.lng) * cos, at[1] - live.lat) });
  }
  return camps.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)).slice(0, 4);
}

function campGeometry({ id, at }: Camp): Feature<Polygon>[] {
  const angle = hash01(id, 5) * 2 * Math.PI;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const metresLng = 111_320 * Math.cos(at[1] * Math.PI / 180);
  const point = (x: number, y: number) => [at[0] + (x * cos - y * sin) / metresLng, at[1] + (x * sin + y * cos) / 111_320];
  const box = (x: number, y: number, w: number, d: number, base: number, top: number, color: string): Feature<Polygon> =>
    ({ type: 'Feature', properties: { base, top, color }, geometry: { type: 'Polygon', coordinates: [[
      point(x, y), point(x + w, y), point(x + w, y + d), point(x, y + d), point(x, y),
    ]] } });
  const tarp = hash01(id, 12) < 0.5 ? '#777b5f' : '#687c81';
  return [
    ...[-3, 1.5].flatMap(x => [-1.8, 1.4].map(y => box(x, y, 0.32, 0.32, 0, 2.3, '#635e4d'))),
    box(-3.4, -2.2, 5.6, 4.4, 2.25, 2.55, tarp),
    box(-2.7, -1.6, 2.5, 0.85, 0, 0.9, '#806a4d'),
    box(-3.3, 2.6, 1.4, 1.2, 0, 1, '#86775c'),
    box(-1.7, 2.7, 1, 1, 0, 0.7, '#6d624e'),
    box(-0.45, -0.45, 0.9, 0.9, 0, 0.8, '#454846'),
  ];
}

/** World-scale shelters and at most two quiet cooking plumes in the live sight disc. */
export class FactionCamps {
  private camps: Camp[] = [];
  private key = '';
  private smoke: Marker[] = [];
  private remove: () => void;
  private map: MlMap;
  constructor(map: MlMap) {
    this.map = map;
    this.remove = installOverlay(map, 'buildings', {
      [SOURCE]: { type: 'geojson', data: fc([]), tolerance: 0.08, maxzoom: 18 },
    }, [{ id: SOURCE, source: SOURCE, type: 'fill-extrusion', minzoom: CAMP_ZOOM,
      paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'top'] } }]);
    map.on('zoom', this.draw);
  }
  update(sites: Iterable<Site3d>, live: Disc | null, entrances: ReadonlyMap<string, LngLatPair>) {
    this.camps = nearbyCamps(sites, live, entrances);
    this.draw();
  }
  private draw = () => {
    const camps = this.map.getZoom() >= CAMP_ZOOM ? this.camps : [];
    const key = camps.map(c => c.id + '@' + c.at.join(',')).join('|');
    if (this.key === key) return;
    this.key = key;
    setData(this.map, SOURCE, fc(camps.flatMap(campGeometry)));
    for (const marker of this.smoke) marker.remove();
    this.smoke = camps.slice(0, 2).map(camp => {
      const el = document.createElement('div');
      el.className = 'camp-steam';
      el.setAttribute('aria-hidden', 'true');
      el.style.setProperty('--camp-delay', (-hash01(camp.id, 9) * 5).toFixed(2) + 's');
      return new Marker({ element: el }).setLngLat(camp.at).addTo(this.map);
    });
  };
  destroy() {
    if (alive(this.map)) this.map.off('zoom', this.draw);
    for (const marker of this.smoke) marker.remove();
    this.remove();
  }
}
