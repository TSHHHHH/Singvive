/**
 * Open modals, innermost last.
 *
 * Settings can open the how-to-play primer *on top of itself* — both stay
 * mounted — so two shells listen for Escape at once and a single keypress would
 * close both. Only the top of this stack reacts.
 */
export const modalStack: string[] = [];

/** True while any modal shell is open — global hotkeys stand down under one. */
export function isModalOpen(): boolean {
  return modalStack.length > 0;
}
