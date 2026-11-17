import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { useSetting } from '../game/settings';
import { ATTRIBUTE_ICONS } from '../game/character';
import type { ShownRoll } from '../game/events';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Icon } from '../icons/Icon';
import { useT } from '../i18n';
import { sfx } from '../audio/sfx';
import { markRollRevealed } from '../ui/diceGate';

// ---------------------------------------------------------------------------
// The d20, on screen.
//
// Checks resolve in the store the instant they are made; this only plays back
// a result that is already decided (store.shownRoll). The die tumbles through
// a few faces, lands on the real roll, then the sum and the verdict stamp in.
// Any tap or key skips ahead: first to the landed result, then away.
//
// Until the verdict, the rest of the screen keeps showing the world from
// before the roll (diceGate): the backdrop hides panels that changed behind
// it, and logs, vitals, clock and sounds hold what the roll caused.
// ---------------------------------------------------------------------------

/** Gaps between face flips while tumbling — decelerating, ~0.8 s in all. */
const FLIP_GAPS = [45, 45, 50, 55, 60, 70, 80, 95, 115, 140];
const LAND_MS = FLIP_GAPS.reduce((a, b) => a + b, 0);
const VERDICT_DELAY_MS = 260;
const HOLD_MS = 1500;
const HOLD_STILL_MS = 1400;

type Phase = 'tumble' | 'landed' | 'verdict';

/** Faces shown while tumbling: varied, never the same twice running, never the real roll early. */
function tumbleFaces(r: ShownRoll): number[] {
  let x = (r.id * 2654435761 + r.roll * 97) >>> 0;
  const out: number[] = [];
  let prev = r.roll;
  for (let i = 0; i < FLIP_GAPS.length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    let face = (x % 20) + 1;
    if (face === prev || face === r.roll) face = (face % 20) + 1;
    if (face === r.roll) face = (face % 20) + 1;
    out.push(face);
    prev = face;
  }
  return out;
}

export function DiceRoll() {
  const roll = useGame((s) => s.shownRoll);
  const enabled = useSetting('diceFx') !== 'off';
  if (!roll || !enabled) return null;
  return <DiceOverlay key={roll.id} roll={roll} />;
}

function DiceOverlay({ roll }: { roll: ShownRoll }) {
  const { t } = useT();
  const still = useReducedMotion();
  const dismissRoll = useGame((s) => s.dismissRoll);
  const [phase, setPhase] = useState<Phase>(still ? 'verdict' : 'tumble');
  const [face, setFace] = useState(() => (still ? roll.roll : tumbleFaces(roll)[0]));
  const timers = useRef<number[]>([]);

  const clear = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Settle on the real roll and schedule the verdict and the exit.
  const land = useCallback(
    (instant: boolean) => {
      clear();
      setFace(roll.roll);
      if (instant) {
        setPhase('verdict');
      } else {
        setPhase('landed');
        later(() => setPhase('verdict'), VERDICT_DELAY_MS);
      }
      later(dismissRoll, (instant ? 0 : VERDICT_DELAY_MS) + (still ? HOLD_STILL_MS : HOLD_MS));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roll, dismissRoll, still],
  );

  // The verdict is the moment the outcome may show. (Closing the overlay
  // clears shownRoll, which releases it too.)
  useEffect(() => {
    if (phase === 'verdict') markRollRevealed(roll.id);
  }, [phase, roll.id]);

  // Sound follows the animation: tumble, land, then the verdict.
  useEffect(() => {
    if (phase === 'tumble') sfx.play('dice.tumble');
    else if (phase === 'landed') sfx.play('dice.land');
    else if (phase === 'verdict') {
      const id = roll.roll === 20 ? 'dice.nat20' : roll.roll === 1 && !roll.success ? 'dice.nat1' : roll.success ? 'dice.success' : 'dice.fail';
      sfx.play(id);
    }
  }, [phase, roll]);

  useEffect(() => {
    if (still) {
      land(true);
      return clear;
    }
    const faces = tumbleFaces(roll);
    let at = 0;
    faces.forEach((_face, i) => {
      at += FLIP_GAPS[i];
      if (i < faces.length - 1) later(() => setFace(faces[i + 1]), at);
    });
    later(() => land(false), LAND_MS);
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll.id]);

  const skip = useCallback(() => {
    if (phase === 'tumble') land(true);
    else {
      clear();
      dismissRoll();
    }
  }, [phase, land, dismissRoll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  const nat20 = roll.roll === 20;
  const settled = phase !== 'tumble';
  const showVerdict = phase === 'verdict';
  const tone = roll.success ? 'text-signal' : 'text-hiss';
  const dieTone = settled ? (roll.success ? '#e8e5dd' : '#d92d2d') : '#b7b3a9';
  const attrName = t(`ui.attributes.${roll.attr}`);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${roll.label}: d20 ${roll.roll}, ${roll.total} vs ${roll.dc}, ${
        roll.success ? t('ui.dice.success') : t('ui.dice.failure')
      }`}
      onClick={skip}
      className={`dice-backdrop fixed inset-0 z-[1100] flex cursor-pointer items-center justify-center p-4 transition-[background-color,backdrop-filter] duration-300 ${
        showVerdict ? 'bg-black/55' : 'bg-black/85 backdrop-blur-sm'
      }`}
    >
      <div className="flex w-full max-w-[18rem] flex-col items-center gap-3 border border-white/15 bg-concrete-900/95 px-5 py-5 text-center shadow-signage">
        <div className="text-label uppercase tracking-wide text-white/55">{roll.label}</div>

        <div
          className={`relative h-28 w-28 ${
            still ? '' : phase === 'tumble' ? 'dice-tumble' : phase === 'landed' ? 'dice-land' : ''
          } ${settled && nat20 ? 'dice-nat20' : ''}`}
        >
          <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
            <g
              fill="rgba(17,17,18,0.92)"
              stroke={dieTone}
              strokeWidth="2.4"
              strokeLinejoin="round"
              style={{ transition: 'stroke 160ms ease-out' }}
            >
              <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" />
            </g>
            <g fill="none" stroke={dieTone} strokeWidth="1.4" strokeOpacity="0.55" strokeLinejoin="round">
              <polygon points="50,26 76,70 24,70" />
              <path d="M50 26 L10 27 M50 26 L90 27 M24 70 L10 27 M24 70 L10 73 M24 70 L50 96 M76 70 L90 27 M76 70 L90 73 M76 70 L50 96" />
            </g>
            <text
              x="50"
              y="60"
              textAnchor="middle"
              dominantBaseline="middle"
              fill={settled ? dieTone : '#e8e5dd'}
              style={{ fontSize: face >= 10 ? 24 : 27, fontWeight: 700 }}
            >
              {face}
            </text>
          </svg>
        </div>

        <div
          className={`flex items-center justify-center gap-1.5 text-body tabular-nums text-white/70 transition-opacity duration-200 ${
            settled ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span>{roll.roll}</span>
          <span className="text-white/35">+</span>
          <Icon name={ATTRIBUTE_ICONS[roll.attr]} size={12} title={attrName} />
          <span>{roll.attrValue}</span>
          {roll.bonus !== 0 && (
            <>
              <span className="text-white/35">{roll.bonus > 0 ? '+' : '−'}</span>
              <span>{Math.abs(roll.bonus)}</span>
            </>
          )}
          <span className="text-white/35">=</span>
          <span className="font-semibold text-concrete-50">{roll.total}</span>
          <span className="ml-1 text-white/45">{t('ui.dice.dc', { n: roll.dc })}</span>
        </div>

        <div className={`min-h-[1.75rem] ${showVerdict ? (still ? '' : 'dice-verdict') : 'invisible'}`}>
          <div className={`text-title font-bold uppercase tracking-signage ${tone}`}>
            {nat20 ? t('ui.dice.natural20') : roll.success ? t('ui.dice.success') : t('ui.dice.failure')}
          </div>
        </div>

        <div className="text-micro text-white/30">{t('ui.dice.skip')}</div>
      </div>
    </div>
  );
}
