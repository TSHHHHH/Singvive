import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { ATTRIBUTE_ICONS, ATTRIBUTE_LABELS } from '../game/character';
import type { ChoiceKind, GameEvent } from '../game/events';
import type { IconName } from '../icons/keys';
import { formatClock } from '../game/survival';
import { useClockFormat } from '../game/settings';
import { useT } from '../i18n';

/** One glyph per kind of choice, so a decision reads before it's read. */
export const CHOICE_ICON: Record<ChoiceKind, IconName> = {
  check: 'choice.check',
  pay: 'choice.pay',
  fight: 'choice.fight',
  leave: 'choice.leave',
};

/**
 * Choice buttons for a pending story event — shared by the timeline live node
 * and the phone map interrupt card.
 */
export function PendingEventChoices({
  event,
  className = '',
}: {
  event: GameEvent;
  className?: string;
}) {
  const items = useGame((s) => s.items);
  const resolveEvent = useGame((s) => s.resolveEvent);
  const { t } = useT();

  const hasItem = (defId?: string) =>
    !defId || items.some((i) => i.container === 'backpack' && i.defId === defId);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {event.choices.map((c) => {
        const affordable =
          c.kind !== 'pay' || !!c.itemIds?.some((id) => hasItem(id));
        const tone =
          c.kind === 'fight'
            ? 'border-hiss/50 text-hiss hover:bg-hiss/10'
            : c.kind === 'leave'
              ? 'border-white/15 text-white/60 hover:bg-white/5'
              : 'border-signal/40 text-signal hover:bg-signal/10';
        const check =
          c.kind === 'check' && c.attr && c.dc != null
            ? { attr: c.attr, dc: c.dc }
            : null;
        return (
          <button
            key={c.id}
            type="button"
            disabled={!affordable}
            onClick={() => resolveEvent(c.id)}
            className={`flex w-full items-center gap-1.5 rounded border px-2 py-1 text-left text-xs leading-snug transition disabled:opacity-30 ${tone}`}
          >
            <Icon name={CHOICE_ICON[c.kind]} size={13} className="shrink-0" />
            <span className="min-w-0 flex-1 whitespace-normal break-words">
              {c.label}
              {c.kind === 'pay' && !affordable && (
                <span className="ml-1 text-hiss">{t('ui.pending.youHaveNone')}</span>
              )}
            </span>
            {check && (
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums opacity-60">
                <Icon
                  name={ATTRIBUTE_ICONS[check.attr]}
                  size={12}
                  title={ATTRIBUTE_LABELS[check.attr]}
                />
                {t('ui.pending.dc', { n: check.dc })}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Phone map card body for a pending story event. */
export function PendingEventCardBody({ event }: { event: GameEvent }) {
  const hour = useGame((s) => s.hour);
  const clock = useClockFormat();
  const { t } = useT();

  return (
    <div className="space-y-2">
      <div className="text-2xs uppercase tracking-widest text-signal/70">
        {t('ui.pending.someoneWantsWord')}
      </div>
      <p className="text-xs leading-snug text-white/70">
        <span className="mr-1.5 font-mono text-2xs tabular-nums text-white/35">
          {formatClock(hour, clock)}
        </span>
        <span className="font-semibold text-concrete-50">{event.title}</span>
        {' — '}
        {event.text}
      </p>
      <PendingEventChoices event={event} />
    </div>
  );
}
