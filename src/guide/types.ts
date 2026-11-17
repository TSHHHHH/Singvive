import type { IconName } from '../icons/keys';

/**
 * The guidance system: a data-driven sequence of steps that can take the
 * camera, point at places on the map and show call-outs. Nothing here knows
 * about noticeboards — a reveal tour, a tutorial or a story beat are all just
 * sequences. Pure data, so a sequence can be built and tested without a map.
 */

export interface GuidePoint {
  lat: number;
  lng: number;
}

/** A camera move. Missing fields keep the camera's current value. */
export interface GuideShot {
  /** Look at a point, or at the survivor's current position. */
  center?: GuidePoint | 'player';
  /** Frame all these points instead of `center` (with the HUD padding). */
  fit?: GuidePoint[];
  zoom?: number;
  /** Ceiling for `fit`, so two close points do not dive to street level. */
  maxZoom?: number;
  pitch?: number;
  bearing?: number;
  /** Move length. Reduced motion cuts instead. */
  durationMs?: number;
}

/** What moves a step on. */
export type GuideAdvance =
  /** After the camera arrives, hold this long, then go on. Next skips the wait. */
  | { kind: 'timer'; ms: number }
  /** Wait for Next (button, tap on the shield, Enter / Space / →). */
  | { kind: 'tap' }
  /** Wait for game code to call `guide.signal(name)` — a tutorial's "now open your bag". */
  | { kind: 'signal'; name: string };

export interface GuideCallout {
  /** `reveal` pops with the emphasis animation; `note` just fades in. */
  variant: 'reveal' | 'note';
  /** Pin the call-out over this map point; without one it docks in the caption. */
  anchor?: GuidePoint;
  icon?: IconName;
  /** CSS colour for the icon and the call-out's edge. */
  accent?: string;
  eyebrow?: string;
  title: string;
  body?: string;
  meta?: string;
}

export interface GuideStep {
  id: string;
  shot?: GuideShot;
  /** A pulsing ring on the map. */
  highlight?: GuidePoint;
  callout?: GuideCallout;
  advance: GuideAdvance;
}

/**
 * Who keeps input while a sequence runs.
 * - `all`: the whole screen is a shield (tap = Next) and hotkeys stand down.
 * - `map`: only the map is shielded; the HUD stays usable (tutorials).
 * - `none`: nothing is blocked; the guide only overlays.
 */
export type GuideInputLock = 'all' | 'map' | 'none';

export type GuideEndReason = 'done' | 'skipped' | 'cancelled';

export interface GuideSequence {
  id: string;
  /** Short header over the caption, e.g. "Noticeboard". */
  title?: string;
  steps: GuideStep[];
  lock: GuideInputLock;
  /** Fly back to the view from before the sequence when it ends. */
  restoreCamera: boolean;
  skippable: boolean;
  /** Runs once, however the sequence ended. */
  onEnd?: (reason: GuideEndReason) => void;
}
