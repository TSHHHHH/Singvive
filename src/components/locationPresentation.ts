import type { PoiCategory } from '../game/types';

/** Quiet resource families; danger and faction colours keep their own meaning. */
export const LOCATION_ACCENTS: Record<PoiCategory, string> = {
  supermarket: '#a2b580',
  convenience: '#a2b580',
  foodcourt: '#a2b580',
  pharmacy: '#76b1a7',
  hospital: '#76b1a7',
  clinic: '#76b1a7',
  hardware: '#bba469',
  industrial: '#bba469',
  fuel: '#bba469',
  police: '#8fa9c4',
  residential: '#b4a3ba',
  school: '#b4a3ba',
  landmark: '#c5ae75',
  mrt: '#84afb9',
  waypoint: '#aaa89e',
};
