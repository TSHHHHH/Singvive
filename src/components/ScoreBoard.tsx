import { useT } from '../i18n';

export type ScoreRow = {
  id?: number;
  name: string;
  days: number;
  score: number;
  escaped?: boolean;
};

export function ScoreBoard({
  rows,
  highlightId,
  empty,
}: {
  rows: readonly ScoreRow[];
  highlightId?: number;
  empty?: string;
}) {
  const { t } = useT();

  if (rows.length === 0) {
    return empty ? <p className="text-sm text-white/40">{empty}</p> : null;
  }

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map((h, i) => {
        const active = highlightId != null && h.id === highlightId;
        return (
          <li
            key={h.id ?? `${h.name}:${h.days}:${h.score}:${i}`}
            className={`flex justify-between rounded px-3 py-1.5 ${
              active ? 'bg-signal/20 text-signal' : 'bg-white/5 text-white/70'
            }`}
          >
            <span>
              {i + 1}. {h.name}
              {h.escaped === true ? (
                <span className="ml-2 text-[10px] uppercase tracking-widest text-signal/80">
                  {t('ui.scores.evac')}
                </span>
              ) : h.escaped === false ? (
                <span className="ml-2 text-[10px] uppercase tracking-widest text-white/30">
                  {t('ui.scores.died')}
                </span>
              ) : null}
            </span>
            <span className="tabular-nums">
              {h.days}d · {h.score}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ScoreBoardTabs({
  value,
  onChange,
}: {
  value: 'world' | 'device';
  onChange: (next: 'world' | 'device') => void;
}) {
  const { t } = useT();
  return (
    <div className="mb-2 flex gap-1">
      <TabButton active={value === 'world'} onClick={() => onChange('world')}>
        {t('ui.scores.worldwide')}
      </TabButton>
      <TabButton active={value === 'device'} onClick={() => onChange('device')}>
        {t('ui.scores.thisDevice')}
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm px-3 py-1 text-[10px] uppercase tracking-widest ${
        active ? 'bg-white/15 text-white' : 'text-white/40 transition hover:text-white/70'
      }`}
    >
      {children}
    </button>
  );
}
