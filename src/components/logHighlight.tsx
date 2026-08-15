import type { ReactNode } from 'react';

/**
 * Timeline keyword highlighting — call out game-relevant nouns so a long log
 * skims faster. Pure presentation; the underlying entry text is unchanged.
 */

const KEYWORD_GROUPS: { className: string; words: string[] }[] = [
  {
    className: 'text-hiss font-semibold',
    words: [
      'horde',
      'ambush',
      'wound',
      'wounds',
      'bleeding',
      'infection',
      'danger',
      'dead',
      'killed',
      'fight',
      'combat',
      'attack',
      'collapse',
      'floodwater',
      'hazard',
      'patrol',
    ],
  },
  {
    className: 'text-signal font-semibold',
    words: [
      'loot',
      'stash',
      'medkit',
      'bandage',
      'food',
      'water',
      'fuel',
      'ammo',
      'rounds',
      'evac',
      'extracted',
      'cleared',
      'intel',
      'trade',
      'healed',
      'restored',
    ],
  },
  {
    className: 'text-amber-200/90 font-semibold',
    words: [
      'energy',
      'hunger',
      'thirst',
      'sleep',
      'rest',
      'travel',
      'tunnel',
      'MRT',
      'station',
      'block',
      'HDB',
      'outpost',
      'faction',
    ],
  },
];

const PATTERN = (() => {
  const all = KEYWORD_GROUPS.flatMap((g) => g.words);
  all.sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${all.map(escapeRe).join('|')})\\b`, 'gi');
})();

const CLASS_BY_LOWER = new Map<string, string>();
for (const g of KEYWORD_GROUPS) {
  for (const w of g.words) CLASS_BY_LOWER.set(w.toLowerCase(), g.className);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split log prose into plain + highlighted keyword spans. */
export function highlightLogText(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  PATTERN.lastIndex = 0;
  while ((m = PATTERN.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const word = m[0];
    const cls = CLASS_BY_LOWER.get(word.toLowerCase()) ?? 'text-signal font-semibold';
    parts.push(
      <span key={`${m.index}-${word}`} className={cls}>
        {word}
      </span>,
    );
    last = m.index + word.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
