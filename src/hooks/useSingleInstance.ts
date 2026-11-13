import { useSyncExternalStore } from 'react';

/**
 * One live game per browser. Two tabs share one save in localStorage, so a
 * second tab can write a dead run back after the first one buried it — the
 * cheapest way round permadeath there is. The first tab takes a Web Lock for
 * as long as it lives; any later tab sees it held and stays out until it frees.
 *
 * The lock is taken once at module load, not in an effect: StrictMode's double
 * mount would otherwise race its own release and lock the only tab out.
 * Browsers without Web Locks play unguarded.
 */
type InstanceState = 'checking' | 'owner' | 'blocked';

const LOCK_NAME = 'singvive.instance';

let state: InstanceState = 'checking';
const listeners = new Set<() => void>();

function setState(next: InstanceState) {
  state = next;
  for (const fn of listeners) fn();
}

const hold = () => new Promise<never>(() => {});

function claim() {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) {
    setState('owner');
    return;
  }
  void locks
    .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (lock) {
        setState('owner');
        return hold();
      }
      setState('blocked');
      // Queue behind the live tab. When it closes, reload so this tab starts
      // from the save that tab left behind rather than its own stale memory.
      void locks.request(LOCK_NAME, () => {
        window.location.reload();
        return hold();
      });
      return undefined;
    })
    .catch(() => setState('owner'));
}

claim();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSingleInstance(): InstanceState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => 'owner' as const,
  );
}
