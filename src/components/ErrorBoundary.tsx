import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearRun } from '../game/storage';
import { SETTINGS_SCHEMA, useSettings } from '../game/settings';
import { t } from '../i18n/t';
import { DEFAULT_LOCALE, isLocaleId, type LocaleId } from '../i18n/types';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function currentLocale(): LocaleId {
  const fallback = SETTINGS_SCHEMA.find((d) => d.key === 'language')?.default ?? 'en';
  const raw = useSettings.getState().values.language ?? fallback;
  return isLocaleId(raw) ? raw : DEFAULT_LOCALE;
}

/**
 * Catches render/lifecycle crashes so a thrown error shows a recovery screen
 * instead of a blank page. The run lives in localStorage and is untouched by a
 * crash, so reloading almost always resumes where the player left off.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[singvive] crash:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const locale = currentLocale();
    const tr = (key: string) => t(key, undefined, locale);

    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mb-2 text-6xl">📻</div>
          <h1 className="text-3xl font-black text-hiss">{tr('ui.error.signalLost')}</h1>
          <p className="mt-1 text-sm text-white/50">{tr('ui.error.brokeBlurb')}</p>

          <pre className="mt-6 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-left text-xs text-white/40">
            {error.message || String(error)}
          </pre>

          <button
            onClick={() => window.location.reload()}
            className="mt-8 rounded-lg bg-signal/80 px-8 py-3 font-bold text-black hover:bg-signal"
          >
            {tr('ui.error.reload')}
          </button>

          <button
            onClick={() => {
              clearRun();
              window.location.reload();
            }}
            className="mt-3 block w-full text-xs text-white/30 hover:text-white/60"
          >
            {tr('ui.error.deleteRun')}
          </button>
        </div>
      </div>
    );
  }
}
