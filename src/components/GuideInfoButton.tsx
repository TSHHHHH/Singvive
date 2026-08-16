import type { GuideTopic } from '../content/guideContent';

/** Compact `?` control that asks the parent to open a guide topic. */
export function GuideInfoButton({
  topic,
  onOpen,
  label = 'How this works',
}: {
  topic: GuideTopic;
  onOpen: (topic: GuideTopic) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(topic);
      }}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/15 text-2xs font-semibold text-white/45 transition hover:border-signal/40 hover:text-signal"
    >
      ?
    </button>
  );
}
