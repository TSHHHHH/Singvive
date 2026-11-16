import { useEffect, useState } from 'react';
import { useSetting } from '../game/settings';

/** The OS "reduce motion" hint, live. */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduce;
}

/**
 * Whether to hold animation still, resolving the `reduceMotion` setting against
 * the OS hint.
 *
 * Defaults to `off` so the map moves out of the box. `auto` follows the OS
 * hint for anyone who wants that, and `on` asks for stillness on an OS with no
 * such switch.
 */
export function useReducedMotion(): boolean {
  const choice = useSetting('reduceMotion');
  const osHint = usePrefersReducedMotion();
  if (choice === 'on') return true;
  if (choice === 'off') return false;
  return osHint;
}
