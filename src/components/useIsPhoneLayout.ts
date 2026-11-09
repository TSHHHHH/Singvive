import { useEffect, useState } from 'react';

/** Same cutoff as Tailwind `lg` / GameScreen phone shell. */
const PHONE_MQ = '(max-width: 1023px)';

function readIsPhone(): boolean {
  if (typeof window === 'undefined') return false;
  // innerWidth catches cases where matchMedia lags behind a rotation.
  return window.matchMedia(PHONE_MQ).matches || window.innerWidth < 1024;
}

/** Tailwind `lg` breakpoint — matches GameScreen phone shell. */
export function useIsPhoneLayout(): boolean {
  const [phone, setPhone] = useState(readIsPhone);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
    const sync = () => setPhone(readIsPhone());
    sync();
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return phone;
}
