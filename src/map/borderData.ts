import { buildBorder, type BorderData, type BorderScene } from './borderGeometry';

let scene: BorderScene | null = null;
let pending: Promise<BorderScene> | null = null;

/** The border set piece, fetched and built once per page. */
export function loadBorder(): Promise<BorderScene> {
  if (scene) return Promise.resolve(scene);
  pending ??= fetch(`${import.meta.env.BASE_URL}border.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`border.json ${res.status}`);
      return res.json() as Promise<BorderData>;
    })
    .then((data) => (scene = buildBorder(data)))
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}

export function getBorder(): BorderScene | null {
  return scene;
}
