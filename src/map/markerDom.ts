import { Marker } from 'maplibre-gl';
import type { MapIcon } from '../components/mapIcons';

/** Build a MapLibre-hostable element from a cached icon. */
export function iconElement(icon: MapIcon): HTMLDivElement {
  const el = document.createElement('div');
  if (icon.className) el.className = icon.className;
  el.style.width = `${icon.size[0]}px`;
  el.style.height = `${icon.size[1]}px`;
  el.innerHTML = icon.html;
  return el;
}

/** Offset that puts the icon's anchor pixel on the map point (anchor 'top-left'). */
export function iconOffset(icon: MapIcon): [number, number] {
  return [-icon.anchor[0], -icon.anchor[1]];
}

export function createMarker(icon: MapIcon, lat: number, lng: number): Marker {
  return new Marker({ element: iconElement(icon), anchor: 'top-left', offset: iconOffset(icon) }).setLngLat([lng, lat]);
}

/** Swap a marker's look in place (keeps its position and listeners on the wrapper). */
export function setMarkerIcon(marker: Marker, icon: MapIcon) {
  const el = marker.getElement();
  // MapLibre owns the element's transform/classes; replace contents and box only.
  el.innerHTML = icon.html;
  el.style.width = `${icon.size[0]}px`;
  el.style.height = `${icon.size[1]}px`;
  if (icon.className) el.classList.add(...icon.className.split(' '));
  marker.setOffset(iconOffset(icon));
}
