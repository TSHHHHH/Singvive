import { useEffect, useMemo, useState } from 'react';
import { useSetting } from '../game/settings';
import type { WeatherKind } from '../game/types';
import { WEATHER_DIFFUSE } from '../map/atmosphere';
import type { BuildingEngine } from '../map/buildings';
import { DaylightDriver, buildingTone, shadowColor } from '../map/daylight';
import { useMapGL } from '../map/hooks';
import { gradeAt, shadowRatio, shadowStrength, sunAt } from '../map/lighting';

/**
 * Time of day on the run map's ground: the basemap grade, and shadows (a
 * drop shadow on the flat map, cast shadows from the standing 3D buildings).
 * Keyed to the stepped light hour (useLightHour), so it changes only when
 * the game clock crosses a 10-minute step, never on a timer. The 3D light itself is Atmosphere3d's.
 */
export function Daylight({
  hour,
  weather,
  view3d,
  engine,
}: {
  hour: number;
  weather: WeatherKind;
  view3d: boolean;
  engine: BuildingEngine | null;
}) {
  const map = useMapGL();
  const mode = useSetting('mapLighting');
  const weatherFx = useSetting('weatherFx');
  const [driver, setDriver] = useState<DaylightDriver | null>(null);

  useEffect(() => {
    const d = new DaylightDriver(map);
    setDriver(d);
    return () => d.destroy();
  }, [map]);

  const on = mode !== 'off';
  const shadows = mode === 'full';
  // Cloud softens shadows only when the player sees weather at all.
  const diffuse = weatherFx === 'off' ? 0 : WEATHER_DIFFUSE[weather];
  // `hour` is already stepped (useLightHour); everything below follows it.
  const grade = useMemo(() => gradeAt(hour), [hour]);

  useEffect(() => {
    driver?.setGrade(on ? grade : null);
  }, [driver, on, grade]);

  useEffect(() => {
    if (!engine) return;
    const t = buildingTone(on ? grade : null);
    engine.setTone(t.base, t.flat);
  }, [engine, on, grade]);

  useEffect(() => {
    if (!driver) return;
    const sun = sunAt(hour);
    const strength = shadows ? shadowStrength(sun.alt, diffuse) : 0;
    const cast = strength > 0 ? { az: sun.az, ratio: shadowRatio(sun.alt), color: shadowColor(grade, strength) } : null;
    driver.setDropShadow(!view3d ? cast : null);
    engine?.setSun(view3d ? cast : null);
  }, [driver, engine, view3d, shadows, hour, grade, diffuse]);

  return null;
}
