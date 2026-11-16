import { useEffect } from 'react';
import { useSetting } from '../game/settings';
import { soundVolume } from './ambience';
import { isCueId } from './cues';
import { installSoundDirector, uninstallSoundDirector } from './director';
import { effectsVolume, sfx } from './sfx';

/** Hover blips only on devices that really hover. */
function canHover(): boolean {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}

/** The button a pointer event landed on, unless it is disabled or opted out. */
function soundButton(target: EventTarget | null): HTMLElement | null {
  const el = (target as Element | null)?.closest?.<HTMLElement>('button, [role="button"], [role="tab"], [data-sfx]');
  if (!el) return null;
  if (el.matches(':disabled, [aria-disabled="true"]')) return null;
  if (el.dataset.sfx === 'none') return null;
  return el;
}

/**
 * Mount once at the app root: keeps the cue engine's volume in step with the
 * Sound / Sound effects settings, unlocks audio on the first gesture, plays the
 * generic UI cues through one delegated listener, and runs the sound director
 * while effects can be heard (always in DEV, so the Sound console sees cues).
 */
export function useSfx(): void {
  const sound = useSetting('sound');
  const effects = useSetting('sfx');
  const audible = soundVolume(sound) * effectsVolume(effects) > 0;

  useEffect(() => {
    sfx.setVolumes(soundVolume(sound), effectsVolume(effects));
  }, [sound, effects]);

  // Unlock on the first gesture; pause with the tab.
  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, []);

  // Director: in production only while effects are audible and some file is assigned.
  useEffect(() => {
    if (import.meta.env.DEV) {
      installSoundDirector();
      return uninstallSoundDirector;
    }
    if (!audible) return;
    let live = true;
    void sfx.loadManifest().then(() => {
      if (live && Object.keys(sfx.getManifest().cues).length) installSoundDirector();
    });
    return () => {
      live = false;
      uninstallSoundDirector();
    };
  }, [audible]);

  // UI cues: one delegated listener for every button in the app.
  useEffect(() => {
    if (!audible && !import.meta.env.DEV) return;
    const onClick = (e: MouseEvent) => {
      const el = soundButton(e.target);
      if (!el) return;
      const own = el.dataset.sfx;
      sfx.play(own && isCueId(own) ? own : 'hud.click');
    };
    let lastHover: Element | null = null;
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = soundButton(e.target);
      if (el === lastHover) return;
      lastHover = el;
      if (el) sfx.play('hud.hover');
    };
    const hover = canHover();
    document.addEventListener('click', onClick, true);
    if (hover) document.addEventListener('pointerover', onOver, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      if (hover) document.removeEventListener('pointerover', onOver, true);
    };
  }, [audible]);
}
