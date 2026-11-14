import type { LoadEffects } from '../game/inventory';
import { Icon } from '../icons/Icon';
import { useT } from '../i18n';
import { TipHint } from './TipHint';
import { loadModifierLines } from './loadTip';
import { loadTierLabel, loadTierTone } from './loadTier';

/**
 * The overload debuff as a status icon: a weight glyph tinted by tier, with
 * the full penalty list in a floating tip on hover (tap on touch). Renders
 * nothing while the load is light.
 */
export function LoadStatusIcon({
  fx,
  loadKg,
  carryKg,
}: {
  fx: LoadEffects;
  loadKg: number;
  carryKg: number;
}) {
  const { t } = useT();
  if (fx.strain <= 0) return null;
  const tier = loadTierLabel(fx, t);
  const tone = loadTierTone(fx);
  const severe = fx.tier === 'straining' || fx.tier === 'pinned';
  const lines = loadModifierLines(fx, t);
  const pct = carryKg > 0 ? Math.round((loadKg / carryKg) * 100) : 0;
  return (
    <TipHint
      placement="top"
      className="inline-flex shrink-0"
      tipClassName="w-max max-w-[240px] rounded-lg border border-white/15 bg-concrete-900 px-2.5 py-2 text-body leading-relaxed shadow-signage"
      tip={
        <div>
          <div className={`flex items-center gap-1.5 font-bold uppercase tracking-widest ${tone}`}>
            <Icon name="meta.weight" size={14} />
            {tier}
          </div>
          <div className="mb-1 text-micro tabular-nums text-white/45">
            {t('ui.load.statusSub', { load: loadKg.toFixed(1), carry: carryKg, pct })}
          </div>
          <ul className="space-y-0.5">
            {lines.map((m) => (
              <li key={m.text} className={`flex gap-1.5 ${m.good ? 'text-emerald-300' : 'text-hiss'}`}>
                <span aria-hidden className="text-white/25">•</span>
                {m.text}
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <button
        type="button"
        aria-label={t('ui.load.statusAria', { tier })}
        className={`relative flex h-6 w-6 items-center justify-center rounded border border-current bg-black/40 ${tone} ${
          severe ? 'animate-pulse' : ''
        }`}
      >
        <Icon name="meta.weight" size={14} />
        {fx.tier !== 'burdened' && (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-hiss" />
        )}
      </button>
    </TipHint>
  );
}
