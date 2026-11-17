import { useEffect, useState, type CSSProperties } from 'react';
import { useT } from '../i18n';
import { modalStack } from '../components/modalStack';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { guide, useGuideState } from './guide';
import { GuideCalloutCard } from './GuideCalloutCard';
import type { GuideInputLock } from './types';

const NEXT_KEYS = new Set(['Enter', ' ', 'ArrowRight']);
const MODAL_ID = 'guide';

/** The map's box on screen, for a `map` lock. Read on resize, not per frame. */
function useMapRect(on: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!on) return;
    const read = () => setRect(document.querySelector('[data-guide-map]')?.getBoundingClientRect() ?? null);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [on]);
  return on ? rect : null;
}

/**
 * The guide's chrome: an input shield (per the sequence's lock), a caption
 * with progress, Next and Skip, and the keyboard rules — Esc skips; Enter,
 * Space and → go next; under an `all` lock every other key is swallowed so
 * camera and rail hotkeys cannot fight the tour. Mount once per screen.
 */
export function GuideOverlay() {
  const state = useGuideState();
  const { t } = useT();
  const reduced = useReducedMotion();
  const lock: GuideInputLock = state?.sequence.lock ?? 'none';
  const mapRect = useMapRect(lock === 'map');
  const active = !!state;

  // Global hotkeys check the modal stack; join it while a locking guide runs.
  useEffect(() => {
    if (!active || lock === 'none') return;
    modalStack.push(MODAL_ID);
    return () => {
      const i = modalStack.lastIndexOf(MODAL_ID);
      if (i >= 0) modalStack.splice(i, 1);
    };
  }, [active, lock]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const s = guide.state;
      if (!s) return;
      if (e.key === 'Escape' && s.sequence.skippable) {
        e.preventDefault();
        e.stopImmediatePropagation();
        guide.skip();
        return;
      }
      if (NEXT_KEYS.has(e.key) && s.step.advance.kind !== 'signal') {
        // Leave Enter / Space to a focused control (our own buttons included).
        const focused = document.activeElement;
        if (e.key !== 'ArrowRight' && focused instanceof HTMLElement && focused.closest('button,a,input,textarea,select')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        guide.next();
        return;
      }
      if (s.sequence.lock === 'all') {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [active]);

  if (!state) return null;
  const { sequence, step, index, phase, token } = state;
  const canNext = step.advance.kind !== 'signal';
  const docked = step.callout && !step.callout.anchor ? step.callout : null;
  const holdMs = step.advance.kind === 'timer' ? step.advance.ms : 0;
  const shield =
    lock === 'all'
      ? 'fixed inset-0'
      : lock === 'map' && mapRect
        ? 'fixed'
        : null;
  const shieldStyle: CSSProperties | undefined =
    lock === 'map' && mapRect
      ? { left: mapRect.left, top: mapRect.top, width: mapRect.width, height: mapRect.height }
      : undefined;

  return (
    <>
      {shield && (
        <div
          className={`${shield} guide-shield z-[1080] ${canNext ? 'cursor-pointer' : ''}`}
          style={shieldStyle}
          onClick={canNext ? () => guide.next() : undefined}
          aria-hidden
        />
      )}
      <div
        className={`guide-caption pointer-events-none fixed inset-x-0 top-0 z-[1090] flex justify-center px-3${reduced ? ' guide-still' : ''}`}
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
        role="dialog"
        aria-label={sequence.title}
      >
        <div data-guide-caption="" className="guide-caption-box pointer-events-auto w-full max-w-[26rem] overflow-hidden rounded border border-white/15 bg-concrete-900/95 shadow-signage">
          <div className="flex items-center gap-2 px-3 pt-2">
            {sequence.title && <div className="min-w-0 flex-1 truncate text-label uppercase text-astral">{sequence.title}</div>}
            {sequence.steps.length > 1 && (
              <div className="text-micro tabular-nums text-concrete-400">
                {t('ui.tour.progress', { n: index + 1, total: sequence.steps.length })}
              </div>
            )}
          </div>
          {sequence.steps.length > 1 && (
          <div className="flex gap-1 px-3 pt-1.5" aria-hidden>
            {sequence.steps.map((s, i) => (
              <span
                key={s.id}
                className={`h-0.5 flex-1 rounded-full ${i < index ? 'bg-astral/70' : i === index ? 'bg-astral' : 'bg-white/15'}`}
              />
            ))}
          </div>
          )}
          {docked && (
            <div key={token} className="px-3 pt-2">
              <GuideCalloutCard callout={docked} docked />
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1 text-micro text-concrete-500">
              {/* Keys on a desktop; a tap anywhere on touch. */}
              <span className="guide-hint-keys">{sequence.skippable ? t('ui.tour.skipHint') : ''}</span>
              <span className="guide-hint-touch">{canNext && lock !== 'none' ? t('ui.tour.tapNext') : ''}</span>
            </div>
            {sequence.skippable && (
              <button
                type="button"
                onClick={() => guide.skip()}
                className="rounded border border-white/15 px-2.5 py-1 text-body text-concrete-300 hover:text-concrete-50"
              >
                {t('ui.tour.skip')}
              </button>
            )}
            {canNext && (
              <button
                type="button"
                onClick={() => guide.next()}
                className="rounded border border-astral/50 bg-astral/15 px-3 py-1 text-body font-semibold text-astral hover:bg-astral/25"
              >
                {t('ui.tour.next')}
              </button>
            )}
          </div>
          {holdMs > 0 && (
            <div className="h-0.5 w-full bg-white/5" aria-hidden>
              <div
                key={`${token}:${phase}`}
                className={`guide-hold h-full bg-astral/60 ${phase === 'showing' ? 'is-running' : ''}`}
                style={{ animationDuration: `${holdMs}ms` }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
