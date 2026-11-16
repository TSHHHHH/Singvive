// One AudioContext per page, shared by the ambience synth and the cue engine.
// Browsers cap live contexts and each one costs a real-time audio thread.

let ctx: AudioContext | null = null;

/** The page's AudioContext, created on first call. Null where Web Audio is missing. */
export function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  return ctx;
}

/** The context if one has been made, without making it. */
export function existingAudioContext(): AudioContext | null {
  return ctx;
}
