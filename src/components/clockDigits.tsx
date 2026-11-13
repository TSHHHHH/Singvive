import { useState } from 'react';

/**
 * One digit cell: the old figure drops out as the new one drops in. Under
 * reduced motion the two crossfade in place instead of sliding.
 */
function RollDigit({ ch, still }: { ch: string; still: boolean }) {
  const [state, setState] = useState({ cur: ch, prev: null as string | null, n: 0 });
  if (state.cur !== ch) setState({ cur: ch, prev: state.cur, n: state.n + 1 });
  return (
    <span className="clock-digit relative inline-block">
      {state.prev !== null && (
        <span
          key={`o${state.n}`}
          className={still ? 'clock-digit-out clock-digit-fade' : 'clock-digit-out'}
          aria-hidden
          onAnimationEnd={() => setState((s) => ({ ...s, prev: null }))}
        >
          {state.prev}
        </span>
      )}
      <span key={state.n} className={`inline-block ${state.n > 0 ? (still ? 'clock-digit-in clock-digit-fade' : 'clock-digit-in') : ''}`}>
        {state.cur}
      </span>
    </span>
  );
}

/**
 * A run of clock figures, each rolling on its own. Cells are keyed from the
 * right, so "9:59" → "10:00" keeps the minute cells and only adds the tens.
 */
export function RollingDigits({ text, still }: { text: string; still: boolean }) {
  const chars = [...text];
  return (
    <>
      {chars.map((ch, i) => (
        <RollDigit key={chars.length - i} ch={ch} still={still} />
      ))}
    </>
  );
}
