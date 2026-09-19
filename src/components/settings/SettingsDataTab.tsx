import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettings } from '../../game/settings';
import { useGame } from '../../game/store';
import { flushPersist } from '../../game/persistRun';
import { clearHighScores, exportRunJson, importRunJson } from '../../game/storage';
import { useT } from '../../i18n';
import { ConfirmAction } from './ConfirmAction';
import { SettingRow } from './SettingControl';

/**
 * Save and local-data management. Actions only — nothing here is a preference,
 * so none of it lives in SETTINGS_SCHEMA. Ordered least to most destructive.
 */
export function SettingsDataTab() {
  const { t } = useT();
  const resetSettings = useSettings((s) => s.resetSettings);
  const { phase, day, hasSavedRun, abandonRun, refreshSaveSlot } = useGame(
    useShallow((s) => ({
      phase: s.phase,
      day: s.day,
      hasSavedRun: s.hasSavedRun,
      abandonRun: s.abandonRun,
      refreshSaveSlot: s.refreshSaveSlot,
    })),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [scoresCleared, setScoresCleared] = useState(false);

  const onMenu = phase === 'menu';

  const doExport = () => {
    // Run writes are debounced; without this the file trails play by up to 5s.
    flushPersist();
    const json = exportRunJson();
    if (!json) {
      setNote(t('ui.settings.data.exportEmpty'));
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([`${json}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `singvive-save-day${day}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNote(null);
  };

  const doImport = async (file: File) => {
    const ok = importRunJson(await file.text());
    if (ok) refreshSaveSlot();
    setNote(t(ok ? 'ui.settings.data.importOk' : 'ui.settings.data.importFailed'));
  };

  return (
    <div className="flex flex-col gap-5">
      <ConfirmAction
        label={t('ui.settings.data.resetLabel')}
        description={t('ui.settings.data.resetDesc')}
        action={t('ui.settings.data.resetAction')}
        onConfirm={resetSettings}
      />

      <SettingRow
        label={t('ui.settings.data.exportLabel')}
        description={t('ui.settings.data.exportDesc')}
      >
        <button
          type="button"
          onClick={doExport}
          className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-body text-white/70 transition hover:border-white/30 hover:text-white"
        >
          {t('ui.settings.data.exportAction')}
        </button>
      </SettingRow>

      {/* Menu only. A live run's next debounced write would overwrite whatever
          was just imported, so there is no safe mid-run version of this. */}
      <SettingRow
        label={t('ui.settings.data.importLabel')}
        description={
          onMenu ? t('ui.settings.data.importDesc') : t('ui.settings.data.importMenuOnly')
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void doImport(file);
          }}
        />
        <button
          type="button"
          disabled={!onMenu}
          onClick={() => fileRef.current?.click()}
          className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-body text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/25 disabled:hover:border-white/5"
        >
          {t('ui.settings.data.importAction')}
        </button>
      </SettingRow>

      {note && <div className="text-body text-white/50">{note}</div>}

      <ConfirmAction
        label={t('ui.settings.data.scoresLabel')}
        description={t('ui.settings.data.scoresDesc')}
        action={t('ui.settings.data.scoresAction')}
        danger
        note={scoresCleared ? t('ui.settings.data.scoresCleared') : null}
        onConfirm={() => {
          clearHighScores();
          refreshSaveSlot();
          setScoresCleared(true);
        }}
      />

      {(hasSavedRun || phase === 'game') && (
        <ConfirmAction
          label={t('ui.settings.data.abandonLabel')}
          description={t('ui.settings.data.abandonDesc', { day: String(day) })}
          action={t('ui.settings.data.abandonAction')}
          danger
          onConfirm={abandonRun}
        />
      )}
    </div>
  );
}
