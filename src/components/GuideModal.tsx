import { getGuideSection, guideTopicsFor, type GuideTopic } from '../content/guideContent';
import { useT } from '../i18n';
import { GuideSectionView } from './GuideSectionView';

/**
 * Backdrop guide sheet — same shell as Settings / Day Logs. Opens on one
 * entry topic; evac also includes Score so Objectives help covers both paths.
 */
export function GuideModal({
  topic,
  onClose,
}: {
  topic: GuideTopic;
  onClose: () => void;
}) {
  const { locale, t } = useT();
  const topics = guideTopicsFor(topic);
  const sections = topics.map((id) => getGuideSection(id, locale));
  const heading = sections.length === 1 ? sections[0].title : t('ui.guide.objectives');

  return (
    <div
      className="absolute inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[min(85vh,36rem)] w-full max-w-md overflow-y-auto rounded-xl border border-white/15 bg-concrete-900 p-5 shadow-signage"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-signal">{heading}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-white/40 hover:text-white/70"
          >
            {t('ui.common.close')}
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <GuideSectionView
              key={section.id}
              section={section}
              showTitle={sections.length > 1}
              compactTitle
            />
          ))}
        </div>
      </div>
    </div>
  );
}
