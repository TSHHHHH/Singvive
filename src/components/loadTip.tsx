import type { LoadEffects } from '../game/inventory';
import type { MeterModifier } from '../game/survival';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function pctDelta(mult: number): number {
  return Math.round((mult - 1) * 100);
}

function signedPct(n: number): string {
  const r = Math.round(n * 100);
  return r > 0 ? `+${r}` : `${r}`;
}

function signedFlat(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Live load penalty lines for TipHint — same shape as hunger/energy meter toasts. */
export function loadModifierLines(fx: LoadEffects, t: TFn): MeterModifier[] {
  if (fx.strain <= 0) {
    return [{ text: t('ui.load.light'), good: true }];
  }
  const out: MeterModifier[] = [];
  const travel = pctDelta(fx.travelMult);
  if (travel) out.push({ text: t('ui.load.travel', { n: travel }), good: false });
  const energy = pctDelta(fx.energyMult);
  if (energy) out.push({ text: t('ui.load.energy', { n: energy }), good: false });
  const spd = Math.round((1 - fx.combatSpeedMult) * 100);
  if (spd) out.push({ text: t('ui.load.combatSpeed', { n: spd }), good: false });
  if (fx.attackMod) out.push({ text: t('ui.load.attack', { n: signedFlat(fx.attackMod) }), good: false });
  if (fx.dodgeMod) out.push({ text: t('ui.load.dodge', { n: signedPct(fx.dodgeMod) }), good: false });
  if (fx.fleeDcMod) out.push({ text: t('ui.load.flee', { n: fx.fleeDcMod }), good: false });
  const enc = Math.round(fx.encounterMod * 100);
  if (enc) out.push({ text: t('ui.load.encounters', { n: enc }), good: false });
  const stairs = pctDelta(fx.stairMult);
  if (stairs) out.push({ text: t('ui.load.stairs', { n: stairs }), good: false });
  const search = pctDelta(fx.searchMult);
  if (search) out.push({ text: t('ui.load.search', { n: search }), good: false });
  return out;
}

export const LOAD_TIP_CLASS =
  'w-max max-w-[220px] rounded border border-white/15 bg-black/90 px-2 py-1.5 text-2xs leading-relaxed shadow-signage';

export function LoadTipBody({
  fx,
  t,
  title,
}: {
  fx: LoadEffects;
  t: TFn;
  title: string;
}) {
  const lines = loadModifierLines(fx, t);
  return (
    <>
      <div className="mb-0.5 uppercase tracking-widest text-white/40">{title}</div>
      {lines.map((m) => (
        <div key={m.text} className={m.good ? 'text-emerald-300' : 'text-hiss'}>
          {m.text}
        </div>
      ))}
    </>
  );
}
