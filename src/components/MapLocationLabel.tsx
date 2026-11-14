import type { LocationState } from '../game/types';
import { POI_CONFIG } from '../game/poi';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';
import { LOCATION_ACCENTS } from './locationPresentation';

/** Pin labels carry identity only; the stationary inspector owns the actions. */
export function MapLocationLabel({ location, here, active, onClick }: {
  location?: LocationState | null;
  here?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useT();
  const known = location?.discovered ? location : null;
  const name = location
    ? known ? known.name : t('ui.location.unknownLocation')
    : t(here ? 'ui.game.inTheOpen' : 'ui.game.openGround');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`pointer-events-auto flex max-w-[13rem] items-center gap-1.5 rounded border bg-concrete-900/95 px-2 py-1.5 text-body shadow-signage ${active ? 'border-signal/70 text-concrete-50' : 'border-white/20 text-concrete-200 hover:border-white/50'}`}
    >
      <span style={{ color: known ? LOCATION_ACCENTS[known.category] : undefined }} aria-hidden>
        <Icon name={known ? POI_CONFIG[known.category].icon : location ? 'poi.unknown' : 'action.target'} />
      </span>
      <span className="min-w-0 truncate">
        <span className="text-concrete-400">{t(here ? 'ui.location.hereShort' : 'ui.game.target')} · </span>
        {name}
      </span>
    </button>
  );
}
