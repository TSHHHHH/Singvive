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
 * `auto` follows the system, which is the right default — but it is only a
 * default. Someone who wants the rain moving on a machine set to reduce motion
 * system-wide can say so, and someone whose OS has no such switch can ask for
 * stillness anyway.
 */
export function useReducedMotion(): boolean {
  const choice = useSetting('reduceMotion');
  const osHint = usePrefersReducedMotion();
  if (choice === 'on') return true;
  if (choice === 'off') return false;
  return osHint;
}
