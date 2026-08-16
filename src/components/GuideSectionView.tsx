import type { GuideSection } from '../content/guideContent';
import { GuideDiagram } from './GuideDiagram';

/** One guide topic: title, diagram, bullets — shared by Menu and GuideModal. */
export function GuideSectionView({
  section,
  showTitle = true,
  compactTitle = false,
}: {
  section: GuideSection;
  showTitle?: boolean;
  compactTitle?: boolean;
}) {
  return (
    <section className="min-w-0">
      {showTitle && (
        <h3
          className={
            compactTitle
              ? 'mb-1.5 text-xs uppercase tracking-widest text-signal/80'
              : 'mb-1.5 text-xs font-semibold uppercase tracking-widest text-white/75'
          }
        >
          {section.title}
        </h3>
      )}
      <GuideDiagram topic={section.id} />
      <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-white/55">
        {section.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </section>
  );
}
