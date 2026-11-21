import type { GuideTopic } from '../content/guideContent';
import { tip } from './tips';
import { useT } from '../i18n';

/**
 * Shared look for every `?` help control in the dock headers: one size, one
 * border, and an invisible halo so the hit area stays ~36px on touch.
 */
export const HELP_BUTTON_CLASS =
  "relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/15 text-micro font-semibold leading-none text-white/45 transition before:absolute before:-inset-2 before:content-[''] hover:border-signal/40 hover:text-signal";

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
      className={HELP_BUTTON_CLASS}
    >
      ?
    </button>
  );
}
