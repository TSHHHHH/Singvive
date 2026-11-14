import type { GuideTopic } from '../content/guideContent';
import { tip } from './tips';
import { useT } from '../i18n';

/** Compact `?` control that asks the parent to open a guide topic. */
export function GuideInfoButton({
  topic,
  onOpen,
  label,
}: {
  topic: GuideTopic;
  onOpen: (topic: GuideTopic) => void;
  label?: string;
}) {
  const { t } = useT();
  const description = label ?? t('ui.guide.howThisWorks');
  return (
    <button
      type="button"
      {...tip(description)}
      aria-label={description}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(topic);
      }}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/15 text-micro font-semibold text-white/45 transition hover:border-signal/40 hover:text-signal"
    >
      ?
    </button>
  );
}
