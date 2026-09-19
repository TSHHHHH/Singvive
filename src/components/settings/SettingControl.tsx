import type { SettingDef } from '../../game/settings';
import { settingDescription, settingLabel, settingOptionLabel, useT } from '../../i18n';

/**
 * One setting, drawn according to `def.control`. Both controls write the same
 * flat string value — a toggle is just a two-option setting that reads better
 * as a switch than as a pair of pills.
 */
export function SettingControl({
  def,
  value,
  onChange,
}: {
  def: SettingDef;
  value: string;
  onChange: (next: string) => void;
}) {
  const { locale } = useT();
  const label = settingLabel(def.key, locale);
  const description = def.description ? settingDescription(def.key, locale) : null;

  if (def.control === 'toggle') {
    const onValue = def.options[0]?.value ?? 'on';
    const offValue = def.options[1]?.value ?? 'off';
    const checked = value === onValue;
    return (
      <SettingRow label={label} description={description} labelFor={`set-${def.key}`} inline>
        <button
          id={`set-${def.key}`}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(checked ? offValue : onValue)}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
            checked ? 'border-signal bg-signal/30' : 'border-white/15 bg-white/5'
          }`}
        >
          <span
            className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all ${
              checked ? 'left-[1.5rem] bg-signal' : 'left-0.5 bg-white/40'
            }`}
          />
        </button>
      </SettingRow>
    );
  }

  return (
    <SettingRow label={label} description={description}>
      <div className="flex flex-wrap gap-1.5">
        {def.options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={`rounded border px-2.5 py-1 text-body transition ${
                active
                  ? 'border-signal bg-signal/15 text-signal'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
              }`}
            >
              {settingOptionLabel(def.key, opt.value, opt.label, locale)}
            </button>
          );
        })}
      </div>
    </SettingRow>
  );
}

/**
 * Shared label/description/control layout. `inline` puts the control beside the
 * text (switches) rather than under it (pill rows, which wrap).
 */
export function SettingRow({
  label,
  description,
  children,
  inline = false,
  labelFor,
}: {
  label: string;
  description?: string | null;
  children: React.ReactNode;
  inline?: boolean;
  labelFor?: string;
}) {
  const text = (
    <div className="min-w-0">
      <div className="text-read font-semibold">
        {labelFor ? <label htmlFor={labelFor}>{label}</label> : label}
      </div>
      {description && <div className="text-body text-white/40">{description}</div>}
    </div>
  );

  if (inline) {
    return (
      <div className="flex items-start justify-between gap-4">
        {text}
        {children}
      </div>
    );
  }
  return (
    <div>
      {text}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
