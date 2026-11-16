import { useEffect, useRef, useState } from 'react';
import { ambience } from '../audio/ambience';
import type { TimeOfDay, WeatherKind } from '../game/types';
import { AtmosphereDriver } from '../map/atmosphere';
import { useMapGL } from '../map/hooks';
import { useAtmosphere, type WeatherDom } from './useAtmosphere';

/** Mounts the atmosphere driver on the 3D run map. */
export function Atmosphere3d({ kind, time, dom }: { kind: WeatherKind; time: TimeOfDay; dom: WeatherDom }) {
  const map = useMapGL();
  const { atmos, lightning, still } = useAtmosphere(kind, time);
  const [driver, setDriver] = useState<AtmosphereDriver | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const d = new AtmosphereDriver(map);
    d.bolt = () => dom.bolt.current;
    d.depth = () => dom.depth.current;
    d.onStrike = (delay) => ambience.strike(delay);
    if (import.meta.env.DEV) (window as unknown as { __atmosphere?: AtmosphereDriver }).__atmosphere = d;
    first.current = true;
    setDriver(d);
    return () => d.destroy();
  }, [map, dom]);

  useEffect(() => {
    if (!driver) return;
    // Entering 3D lands on today's sky at once; later changes ease in.
    driver.set(atmos, still || first.current);
    first.current = false;
  }, [driver, atmos, still]);

  useEffect(() => {
    if (!driver) return;
    driver.setStorm(lightning);
    ambience.setSkyThunder(lightning);
    return () => {
      driver.setStorm(false);
      ambience.setSkyThunder(false);
    };
  }, [driver, lightning]);

  return null;
}
