import { useEffect } from 'react';
import type { TimeOfDay } from '../game/types';
import { setBasemapTime } from '../map/basemapTone';
import { useMapGL } from '../map/hooks';

/** Keeps the basemap's road tone on the current hour band (day / dusk / night). */
export function BasemapTime({ time }: { time: TimeOfDay }) {
  const map = useMapGL();
  useEffect(() => {
    setBasemapTime(map, time);
  }, [map, time]);
  return null;
}
