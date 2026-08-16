import { SETTINGS_SCHEMA, useSettings } from '../game/settings';

/**
 * Settings panel. Renders entirely from SETTINGS_SCHEMA, grouped by section, so
 * new options show up here automatically — no edits to this file needed.
 * Guide review is a one-off action wired beside the schema group.
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

  // group the schema by its `group` field, preserving first-seen order
  const groups: { name: string; defs: typeof SETTINGS_SCHEMA }[] = [];
  for (const def of SETTINGS_SCHEMA) {
    let g = groups.find((x) => x.name === def.group);
    if (!g) {
      g = { name: def.group, defs: [] };
      groups.push(g);
    }
    g.defs.push(def);
  }

  return (
    <div
      className="absolute inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[min(88vh,40rem)] w-full max-w-md overflow-y-auto rounded-xl border border-white/15 bg-concrete-900 p-5 shadow-signage"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-signal">⚙ Settings</h3>
          <button onClick={onClose} className="text-xs text-white/40 hover:text-white/70">
            ✕ close
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.name}>
              <h4 className="mb-2 text-2xs uppercase tracking-widest text-white/30">
                {group.name}
              </h4>
              <div className="flex flex-col gap-3">
                {group.defs.map((def) => {
                  const current = values[def.key] ?? def.default;
                  return (
                    <div key={def.key}>
                      <div className="text-sm font-semibold">{def.label}</div>
                      {def.description && (
                        <div className="mb-1.5 text-xs text-white/40">{def.description}</div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {def.options.map((opt) => {
                          const active = current === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setSetting(def.key, opt.value)}
                              className={`rounded border px-2.5 py-1 text-xs transition ${
                                active
                                  ? 'border-signal bg-signal/15 text-signal'
                                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {group.name === 'Guide' && onReviewGuide && (
                  <div>
                    <div className="text-sm font-semibold">Review how to play</div>
                    <div className="mb-1.5 text-xs text-white/40">
                      Open the primer with Survive, Loot, Block, Tunnels, and the rest.
                    </div>
                    <button
                      type="button"
                      onClick={onReviewGuide}
                      className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                    >
                      Open guide
                    </button>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
