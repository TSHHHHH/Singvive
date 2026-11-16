import { useEffect, useState, type ReactNode } from 'react';
import { ATTRIBUTE_ICONS } from '../game/character';
import type { RoomScoutRoll } from '../game/hdbDungeon';
import { useSetting } from '../game/settings';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';

type Check = RoomScoutRoll['perception'];

/** Tumble, then the settled face, then the field's real value. */
export const SCOUT_TUMBLE_MS = 750;
export const SCOUT_SETTLE_MS = 550;
/** Gap before the second field's die starts, so the two reads land one after the other. */
export const SCOUT_STAGGER_MS = 650;
/** When the last field has its value back. */
export const SCOUT_REVEAL_MS = SCOUT_STAGGER_MS + SCOUT_TUMBLE_MS + SCOUT_SETTLE_MS;

/**
 * Inline playback of one corridor read inside its own ledger field. Shows a
 * d100 tumbling to the roll that was already made, holds the settled face with
 * a read/unread mark, then hands the field back to `children` (the result).
 * Never another gameplay roll. Reduced motion or dice off = the result at once.
 */
export function HdbScoutDie({
  attr,
  check,
  startedAt,
  delay = 0,
  children,
}: {
  attr: 'perception' | 'dexterity';
  check: Check;
  startedAt: number;
  delay?: number;
  children: ReactNode;
}) {
  const { t } = useT();
  const still = useReducedMotion();
  const enabled = useSetting('diceFx') !== 'off';
  const [now, setNow] = useState(Date.now);
  const start = startedAt + delay;
  const settleAt = start + SCOUT_TUMBLE_MS;
  const end = settleAt + SCOUT_SETTLE_MS;
  const done = now >= end;
  const live = enabled && !still && !done;

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [live, start]);

  if (!live) {
    // Only flash the value in when it is replacing a die the player just watched.
    const fresh = enabled && !still && now - end < 600;
    return (
      <span data-hdb-scout="done" className={fresh ? 'scout-reveal inline-block' : undefined}>
        {children}
      </span>
    );
  }

  const waiting = now < start;
  const settled = now >= settleAt;
  const elapsed = Math.max(0, now - start);
  const face = settled ? check.roll : ((Math.floor(elapsed / 60) * 37 + check.roll) % 100) + 1;
  const tone = waiting
    ? 'text-concrete-600'
    : settled
      ? check.success ? 'text-astral' : 'text-concrete-400'
      : 'text-signal';
  const pct = Math.round(check.chance * 100);
  const label = t('ui.hdb.scoutResult', {
    attr: t(`ui.attributes.${attr}`),
    roll: check.roll,
    chance: pct,
    result: t(check.success ? 'ui.hdb.scoutRead' : 'ui.hdb.scoutUnread'),
  });

  return (
    <span
      data-hdb-scout={waiting ? 'waiting' : settled ? 'settled' : 'rolling'}
      role="img"
      aria-label={settled ? label : t('ui.hdb.scouting')}
      className={`inline-flex items-center justify-end gap-1.5 tabular-nums ${tone}`}
    >
      <Icon name={ATTRIBUTE_ICONS[attr]} size={12} />
      <span className="text-micro">≤{pct}</span>
      <span
        className={`relative -my-1 inline-flex h-6 w-6 items-center justify-center ${
          waiting ? 'opacity-40' : settled ? 'dice-land' : 'scout-tumble'
        }`}
      >
        <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path
            d="M20 2 36 14 32 31 20 38 8 31 4 14Z M20 2 8 31 M20 2 32 31 M8 31H32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeOpacity="0.7"
          />
        </svg>
        <span className="relative text-micro font-semibold">{waiting ? '·' : face}</span>
      </span>
      <span className="w-3 text-center">{settled ? (check.success ? '✓' : '−') : ''}</span>
    </span>
  );
}
