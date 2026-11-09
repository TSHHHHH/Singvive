import { CAMERA_KEY_HINTS } from '../../map/cameraKeys';
import { useT } from '../../i18n';

/**
 * Read-only key list under the Map settings. Rows come from the same table the
 * handler binds, so the reference cannot advertise a key that does nothing.
 */
export function CameraKeysReference({ dimmed }: { dimmed: boolean }) {
  const { t } = useT();
  return (
    <div className={`rounded border border-white/10 bg-white/[0.03] p-3 transition-opacity ${dimmed ? 'opacity-40' : ''}`}>
      <div className="mb-2 text-label uppercase text-white/35">{t('ui.settings.cameraKeys.title')}</div>
      <dl className="flex flex-col gap-1.5">
        {CAMERA_KEY_HINTS.map((row) => (
          <div key={row.keys.join('')} className="flex items-center justify-between gap-4">
            <dt className="text-body text-concrete-200">{t(`ui.settings.cameraKeys.${row.action}`)}</dt>
            <dd className="flex shrink-0 gap-1">
              {row.keys.map((k) => (
                <kbd
                  key={k}
                  className="min-w-[1.5rem] rounded border border-white/20 bg-concrete-900 px-1.5 py-0.5 text-center text-label text-white/70 shadow-signage"
                >
                  {k}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-micro text-white/35">{t('ui.settings.cameraKeys.note')}</p>
    </div>
  );
}
