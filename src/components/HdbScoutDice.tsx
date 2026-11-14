import { useEffect, useState } from 'react';
import { ATTRIBUTE_ICONS } from '../game/character';
import type { RoomScoutRoll } from '../game/hdbDungeon';
import { useSetting } from '../game/settings';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';

/** Playback of the original percentile checks, never another gameplay roll. */
export function HdbScoutDice({ roll, startedAt, order }: {
  roll: RoomScoutRoll;
  startedAt: number;
  order: number;
}) {
  const { t } = useT();
  const still = useReducedMotion();
  const enabled = useSetting('diceFx') !== 'off';
  const [now, setNow] = useState(Date.now);
  const start = startedAt + order * 120;
  const end = start + 2300;
  const done = now >= end;

  useEffect(() => {
    if (!enabled || still || done) return;
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [enabled, still, done, start]);

  if (!enabled || still || done) return null;
  const elapsed = Math.max(0, now - start);
  const attr = elapsed < 1000 ? 'perception' : 'dexterity';
  const check = roll[attr];
  const settled = elapsed % 1000 >= 650 || elapsed >= 2000;
  const waiting = now < start;
  const face = settled ? check.roll : ((Math.floor(elapsed / 65) * 37 + check.roll + order * 11) % 100) + 1;
  const tone = settled ? check.success ? 'text-astral' : 'text-concrete-400' : 'text-signal';

  return (
    <span
      data-hdb-scout={waiting ? 'waiting' : attr}
      role="img"
      aria-label={t('ui.hdb.scouting')}
      className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col items-center justify-center gap-0.5 bg-concrete-800"
    >
      <span className={`relative flex h-9 w-9 items-center justify-center ${tone} ${waiting ? 'opacity-40' : settled ? 'dice-land' : 'dice-tumble'}`}>
        <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path d="M20 2 36 14 32 31 20 38 8 31 4 14Z M20 2 8 31 M20 2 32 31 M8 31H32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.65" />
        </svg>
        <span className="relative text-plate tabular-nums">{waiting ? '·' : face}</span>
      </span>
      <span className={`flex items-center gap-1 text-micro tabular-nums ${tone}`}>
        <Icon name={ATTRIBUTE_ICONS[attr]} size={10} />
        {settled ? (check.success ? '✓' : '−') : `≤${Math.round(check.chance * 100)}`}
      </span>
    </span>
  );
}
