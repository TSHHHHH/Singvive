import { useEffect, useState } from 'react';
import { getMrtNetwork, loadMrtNetwork, type MrtNetwork } from '../game/mrt';

/**
 * The rail network, fetching it once if it isn't in memory yet. `enabled` is
 * for callers that shouldn't pay for the file until the player asks to see it.
 *
 * Lives outside MrtOverlay so non-map screens (the tunnel run) can use it
 * without pulling the map library into their chunk.
 */
export function useMrtNetwork(enabled = true): MrtNetwork | null {
  const [net, setNet] = useState<MrtNetwork | null>(getMrtNetwork);
  useEffect(() => {
    if (!enabled || net) return;
    let live = true;
    void loadMrtNetwork().then((n) => {
      if (live) setNet(n);
    });
    return () => {
      live = false;
    };
  }, [enabled, net]);
  return net;
}
