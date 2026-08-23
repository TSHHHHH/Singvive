import { useEffect, useState } from 'react';

/** True when the device has no reliable hover (phones / most tablets).
 *  TipLayer then uses press-and-hold instead of mouse hover. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return coarse;
}
