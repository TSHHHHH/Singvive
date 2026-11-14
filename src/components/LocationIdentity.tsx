import type { ReactNode } from 'react';
import type { PoiCategory } from '../game/types';
import { POI_CONFIG } from '../game/poi';
import { poiCategoryLabel, useT } from '../i18n';
import { Icon } from '../icons/Icon';
import { LOCATION_ACCENTS } from './locationPresentation';

/** Only pass a category once its identity has been revealed to the player. */
export function LocationIdentity({
  category,
  title,
  meta,
  showFinds = true,
}: {
  category?: PoiCategory;
  title: ReactNode;
  meta?: ReactNode;
  showFinds?: boolean;
}) {
  const { locale, t } = useT();
  const color = category ? LOCATION_ACCENTS[category] : '#aaa89e';
  return (
    <div
      className="relative isolate overflow-hidden rounded border-t-2 px-3 py-2.5"
      style={{ borderColor: color, background: `linear-gradient(110deg, ${color}18, transparent)` }}
      data-location-type={category ?? 'unknown'}
    >
      <div className="pointer-events-none absolute right-2 top-3 -z-10 opacity-[0.12]" style={{ color }} aria-hidden>
        <Icon name={category ? POI_CONFIG[category].icon : 'poi.unknown'} size={68} />
      </div>
      <div className="pr-14">
        <div className="text-label uppercase" style={{ color }}>
          {category ? poiCategoryLabel(category, locale) : t('ui.location.unidentified')}
        </div>
        <div className="mt-1 break-words text-read font-semibold text-concrete-50">{title}</div>
      </div>
      {meta && <div className="relative mt-1 text-body text-concrete-400">{meta}</div>}
      {category && showFinds && (
        <p className="relative mt-2 text-body text-concrete-200">
          <span className="text-micro text-concrete-400">{t('ui.location.typicalFinds')}: </span>
          {t(`ui.location.finds.${category}`)}
        </p>
      )}
    </div>
  );
}
