import { useCallback, useState, type ReactNode } from 'react';
import { useSetting, useSettings } from '../../game/settings';
import { DiscardConfirm } from './DiscardConfirm';

/**
 * Put the throw-away confirm in front of any action that loses items (leaving
 * a search with unclaimed finds, abandoning a temp stash). `gate(uids, run)`
 * runs `run` straight away when there is nothing to lose or the player turned
 * the confirm off; otherwise it asks first. Render `dialog` somewhere.
 */
export function useDiscardGate(): {
  gate: (uids: string[], run: () => void) => void;
  dialog: ReactNode;
} {
  const enabled = useSetting('confirmDiscard') !== 'off';
  const [pending, setPending] = useState<{ uids: string[]; run: () => void } | null>(null);
  const gate = useCallback(
    (uids: string[], run: () => void) => {
      if (!enabled || uids.length === 0) run();
      else setPending({ uids, run });
    },
    [enabled],
  );
  const cancel = useCallback(() => setPending(null), []);
  const dialog = pending ? (
    <DiscardConfirm
      uids={pending.uids}
      onCancel={cancel}
      onConfirm={(dontAsk) => {
        if (dontAsk) useSettings.getState().setSetting('confirmDiscard', 'off');
        const run = pending.run;
        setPending(null);
        run();
      }}
    />
  ) : null;
  return { gate, dialog };
}
