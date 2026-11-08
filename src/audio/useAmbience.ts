import { useEffect, useRef } from 'react';
import { useSetting } from '../game/settings';
import { ambience, soundVolume, type AmbienceParams } from './ambience';

/**
 * Drive the ambience engine from the game screen. Pass scalars only — this is
 * called from GameScreen, which must not subscribe to whole combat/log slices.
 * Stingers fire on edges: entering combat, and the light failing into night.
 */
export function useAmbience(p: AmbienceParams): void {
  const setting = useSetting('sound');

  useEffect(() => {
    ambience.setVolume(soundVolume(setting));
  }, [setting]);

  // Browsers only start audio from a gesture. Listen once per mount.
  useEffect(() => {
    const unlock = () => ambience.unlock();
    const onVis = () => ambience.setHidden(document.hidden);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVis);
      ambience.quiet();
    };
  }, []);

  const { band, weather, dread, sight, hpFrac, inCombat, underground } = p;
  useEffect(() => {
    ambience.update({ band, weather, dread, sight, hpFrac, inCombat, underground });
  }, [band, weather, dread, sight, hpFrac, inCombat, underground]);

  const prevCombat = useRef(inCombat);
  useEffect(() => {
    if (inCombat && !prevCombat.current) ambience.stinger('contact');
    prevCombat.current = inCombat;
  }, [inCombat]);

  const prevBand = useRef(band);
  useEffect(() => {
    if (band === 'night' && prevBand.current !== 'night' && !underground) {
      ambience.stinger('nightfall');
    }
    prevBand.current = band;
  }, [band, underground]);
}
