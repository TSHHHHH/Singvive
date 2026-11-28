import {
  gutOf,
  infectionEffect,
  infectionHpPerHour,
  infectionRatePerHour,
  infectionTier,
  stomachOf,
} from '../game/infection';
import type { Meters } from '../game/types';
import type { TVars } from '../i18n/t';

type Tr = (key: string, vars?: TVars) => string;

const num = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** "+1.5/h" beside the infection meter, or null when it isn't moving on its own. */
export function infectionRateChip(m: Meters, t: Tr): { text: string; bad: boolean } | null {
  const rate = infectionRatePerHour(m);
  if (rate === 0) return null;
  return { text: t('ui.infection.rate', { n: `${rate > 0 ? '+' : '−'}${num(Math.abs(rate))}` }), bad: rate > 0 };
}

/** The lines behind the infection meter: how ill you are, what it costs, what is coming. */
export function infectionLines(m: Meters, t: Tr): { text: string; good: boolean }[] {
  const out: { text: string; good: boolean }[] = [];
  const tier = infectionTier(m.infection);
  const fx = infectionEffect(m.infection);
  if (tier !== 'none') {
    const parts = [t('ui.condition.modifier.drain', { n: `+${Math.round(fx.energyDrain * 100)}%` })];
    parts.push(t('ui.condition.modifier.recovery', { n: `−${Math.round((1 - fx.recovery) * 100)}%` }));
    if (fx.attack) parts.push(t('ui.condition.modifier.hit', { n: `−${fx.attack}` }));
    out.push({ text: t('ui.infection.tierLine', { tier: t(`ui.infection.tier.${tier}`), effects: parts.join(' · ') }), good: false });
  }
  const stomach = stomachOf(m);
  if (stomach > 0) out.push({ text: t('ui.infection.stomach', { n: Math.ceil(stomach) }), good: false });
  const gut = gutOf(m);
  if (gut >= 0.5) out.push({ text: t('ui.infection.gut', { n: Math.round(gut) }), good: true });
  // Below fever, limb regen outheals the drain, so the number would only alarm.
  const hp = infectionHpPerHour(m.infection);
  if (hp > 0 && tier !== 'none') out.push({ text: t('ui.infection.hp', { n: num(Math.round(hp * 10) / 10) }), good: false });
  if (!out.length) out.push({ text: t('ui.infection.clean'), good: true });
  return out;
}
