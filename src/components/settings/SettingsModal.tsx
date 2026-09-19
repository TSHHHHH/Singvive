import { useState } from 'react';
import {
  SETTINGS_TABS,
  settingsForTab,
  useSettings,
  type SettingDef,
  type SettingTabId,
} from '../../game/settings';
import { settingGroupLabel, settingTabLabel, useT } from '../../i18n';
import { ModalShell, TabRail } from '../ModalShell';
import { SettingControl, SettingRow } from './SettingControl';
import { SettingsDataTab } from './SettingsDataTab';

/**
 * Settings panel. The schema still drives everything — adding a `SettingDef`
 * puts a control on its tab with no edits here — but the tab list is explicit
 * so that ordering is stable and the action-only Data tab can exist at all.
 */
export function SettingsModal({
  onClose,
  onReviewGuide,
}: {
  onClose: () => void;
  onReviewGuide?: () => void;
}) {
  const values = useSettings((s) => s.values);
  const setSetting = useSettings((s) => s.setSetting);
  const { locale, t } = useT();
  const [tab, setTab] = useState<SettingTabId>('display');

  return (
    <ModalShell
      title={t('ui.settings.title')}
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col sm:flex-row"
    >
      <TabRail
        items={SETTINGS_TABS.map((x) => ({ id: x.id, label: settingTabLabel(x.id, locale) }))}
        active={tab}
        onSelect={(id) => setTab(id as SettingTabId)}
        ariaLabel={t('ui.settings.tabsAria')}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'data' ? (
          <SettingsDataTab />
        ) : (
          <div className="flex flex-col gap-5">
            {sections(settingsForTab(tab)).map((sec) => (
              <section key={sec.name ?? '_'}>
                {sec.name && (
                  <h4 className="mb-2 text-label uppercase text-white/30">
                    {settingGroupLabel(sec.name, locale)}
                  </h4>
                )}
                <div className="flex flex-col gap-4">
                  {sec.defs.map((def) => (
                    <SettingControl
                      key={def.key}
                      def={def}
                      value={values[def.key] ?? def.default}
                      onChange={(next) => setSetting(def.key, next)}
                    />
                  ))}
                </div>
              </section>
            ))}

            {tab === 'guide' && onReviewGuide && (
              <SettingRow
                label={t('ui.settings.reviewGuide')}
                description={t('ui.settings.reviewGuideDesc')}
              >
                <button
                  type="button"
                  onClick={onReviewGuide}
                  className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-body text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  {t('ui.settings.openGuide')}
                </button>
              </SettingRow>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/** Split a tab's settings into optional `section` blocks, in schema order. */
function sections(defs: SettingDef[]): { name?: string; defs: SettingDef[] }[] {
  const out: { name?: string; defs: SettingDef[] }[] = [];
  for (const def of defs) {
    const last = out[out.length - 1];
    if (last && last.name === def.section) last.defs.push(def);
    else out.push({ name: def.section, defs: [def] });
  }
  return out;
}
