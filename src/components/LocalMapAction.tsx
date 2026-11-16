import type { LocationState } from '../game/types';
import { useGame } from '../game/store';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';
import { BtnSub } from './placeCard';
import { tip } from './tips';
import { BTN } from './placeCardStyle';

/** Local boards cost one short action; no combat gauge subscription here. */
export function LocalMapAction({ location }: { location: LocationState }) {
  const { t } = useT();
  const readLocalMap = useGame(s => s.readLocalMap);
  const busy = useGame(s => s.phase !== 'game' || !s.character || s.currentPositionId !== location.id ||
    !!(s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim || s.hdb || s.tunnel));
  const atCap = useGame(s => s.explorationLeads.filter(lead => lead.completedDay === undefined).length >= 6);
  const locality = location.category === 'mrt' || location.isMrtStation;
  if (!locality && location.category !== 'residential' && location.category !== 'community') return null;

  return (
    <button type="button" onClick={readLocalMap} disabled={busy || location.localMapRead || atCap} className={BTN.secondary} {...tip(t('ui.exploration.readCost'))}>
      <Icon name="action.logbook" /> {t(locality ? 'ui.exploration.readLocality' : 'ui.exploration.readNoticeboard')}
      <BtnSub hint={!location.localMapRead && !atCap}>{t(location.localMapRead ? 'ui.exploration.alreadyRead' : atCap ? 'ui.exploration.tooManyLeads' : 'ui.exploration.readCost')}</BtnSub>
    </button>
  );
}
