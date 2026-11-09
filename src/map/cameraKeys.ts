// ---------------------------------------------------------------------------
// Keyboard camera bindings for the run map.
//
// Matched on `KeyboardEvent.code` (the physical key), so WASD sits under the
// left hand on AZERTY and Dvorak too. The Settings panel reads `CAMERA_KEY_HINTS`
// for its reference list, so the list and the handler cannot drift apart.
// ---------------------------------------------------------------------------

export type PanDir = 'up' | 'down' | 'left' | 'right';

export const PAN_KEYS: Record<string, PanDir> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** Arrow keys also scroll panels and lists; they only pan when nothing else has focus. */
export const ARROW_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Q twists the map anticlockwise (bearing down), E clockwise. 3D only. */
export const ROTATE_KEYS: Record<string, -1 | 1> = { KeyQ: -1, KeyE: 1 };

export const ZOOM_KEYS: Record<string, -1 | 1> = {
  Equal: 1,
  NumpadAdd: 1,
  Minus: -1,
  NumpadSubtract: -1,
};

export const RECENTER_KEY = 'KeyC';

/** Screen pixels per second at full speed, before Shift. */
export const PAN_SPEED_PX: Record<string, number> = {
  slow: 450,
  normal: 800,
  fast: 1300,
};
export const PAN_SHIFT_MULT = 2.5;
/** Seconds to reach full speed, and to coast to a stop — a short, soft ramp. */
export const PAN_RAMP_S = 0.09;
export const ROTATE_DEG_PER_S = 90;

/** Rows for the Settings reference: key caps, then the i18n id of the action. */
export const CAMERA_KEY_HINTS: { keys: string[]; action: 'pan' | 'fast' | 'rotate' | 'zoom' | 'recenter' }[] = [
  { keys: ['W', 'A', 'S', 'D'], action: 'pan' },
  { keys: ['↑', '←', '↓', '→'], action: 'pan' },
  { keys: ['Shift'], action: 'fast' },
  { keys: ['Q', 'E'], action: 'rotate' },
  { keys: ['+', '−'], action: 'zoom' },
  { keys: ['C'], action: 'recenter' },
];
