import { useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { SettingRow } from './SettingControl';

/**
 * An action that costs something irreversible, armed in two steps.
 *
 * The first click swaps the button for an explicit cancel/confirm pair rather
 * than raising `window.confirm` — a native dialog steals focus out of the modal
 * and reads in the browser's language, not the game's. The armed state dies
 * with the component, so closing the panel disarms it.
 */
export function ConfirmAction({
  label,
  description,
  action,
  onConfirm,
  danger = false,
  note,
}: {
  label: string;
  description?: string;
  action: string;
  onConfirm: () => void;
  /** Irreversible — draws the confirm in the alarm palette. */
  danger?: boolean;
  /** Result line shown under the row after the action runs. */
  note?: ReactNode;
}) {
  const { t } = useT();
  const [armed, setArmed] = useState(false);

  return (
    <SettingRow label={label} description={description}>
      {armed ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body text-white/45">{t('ui.settings.confirmPrompt')}</span>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-body text-white/60 transition hover:border-white/30"
          >
            {t('ui.common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              setArmed(false);
              onConfirm();
            }}
            className={`rounded border px-2.5 py-1 text-body transition ${
              danger
                ? 'border-hiss/50 bg-hiss/15 text-hiss hover:bg-hiss/25'
                : 'border-signal/50 bg-signal/15 text-signal hover:bg-signal/25'
            }`}
          >
            {action}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className={`rounded border px-2.5 py-1 text-body transition ${
            danger
              ? 'border-hiss/30 bg-white/5 text-hiss/80 hover:border-hiss/60 hover:text-hiss'
              : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:text-white'
          }`}
        >
          {action}
        </button>
      )}
      {note && <div className="mt-1 text-body text-white/45">{note}</div>}
    </SettingRow>
  );
}
