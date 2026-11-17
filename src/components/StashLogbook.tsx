import { useMemo } from 'react';
import { isCarried } from '../game/inventory';
import { useGame } from '../game/store';
import { itemName, poiCategoryLabel, useT } from '../i18n';
import { POI_CONFIG } from '../game/poi';
import { Icon } from '../icons/Icon';
import type { ItemInstance, LocationState } from '../game/types';
import type { ExplorationLead } from '../game/exploration';
import { knownFacilityKinds } from './explorationPresentation';
import { FactionLedger } from './FactionLedger';

interface Props {
  /** Focus the map camera on a place without auto-traveling. */
  onFocusLocation?: (lat: number, lng: number) => void;
}

/**
 * Remembered leads, facilities and caches. Rendered as the body of the
 * side panel — the panel owns the header and the close control.
 */
export function StashLogbook({ onFocusLocation }: Props) {
  const { locale, t } = useT();
  const items = useGame((s) => s.items);
  const locations = useGame((s) => s.locations);
  const currentPositionId = useGame((s) => s.currentPositionId);
  const leads = useGame((s) => s.explorationLeads);
  const activeLeads = leads.filter(lead => lead.completedDay === undefined);
  const completedLeads = leads.filter(lead => lead.completedDay !== undefined);
  const facilities = useMemo(() => Object.values(locations).flatMap(location => {
    const kinds = knownFacilityKinds(location);
    return kinds.length ? [{ location, kinds }] : [];
  }), [locations]);

  // group stashed items by their location container (exclude backpack + equipment)
  const byLocation = new Map<string, ItemInstance[]>();
  for (const inst of items) {
    if (isCarried(inst.container) || inst.container.startsWith('equip:')) continue;
    if (!locations[inst.container]) continue;
    const arr = byLocation.get(inst.container) ?? [];
    arr.push(inst);
    byLocation.set(inst.container, arr);
  }

  const entries = [...byLocation.entries()].filter(([, arr]) => arr.length > 0);

  return (
    <>
      <FactionLedger onFocusLocation={onFocusLocation} />
      <section className="mb-6 space-y-3">
        <h3 className="text-label uppercase text-signal">{t('ui.exploration.activeLeads', { n: activeLeads.length })}</h3>
        <p className="text-body text-white/50">{t('ui.exploration.leadHint')}</p>
        {activeLeads.length === 0 ? <p className="text-read text-white/40">{t('ui.exploration.noLeads')}</p> : (
          <ul className="flex flex-col gap-3">
            {activeLeads.map(lead => <LeadEntry key={lead.id} lead={lead} locations={locations} onFocusLocation={onFocusLocation} />)}
          </ul>
        )}
        {completedLeads.length > 0 && (
          <details className="rounded-lg border border-white/15 p-3">
            <summary className="min-h-11 cursor-pointer text-body text-white/65">{t('ui.exploration.visitedLeads', { n: completedLeads.length })}</summary>
            <ul className="mt-2 flex flex-col gap-3">
              {completedLeads.map(lead => <LeadEntry key={lead.id} lead={lead} locations={locations} onFocusLocation={onFocusLocation} />)}
            </ul>
          </details>
        )}
      </section>
      <section className="mb-6 space-y-3">
        <h3 className="text-label uppercase text-signal">{t('ui.exploration.knownFacilities')}</h3>
        <p className="text-body text-white/50">{t('ui.exploration.facilityHint')}</p>
        {facilities.length === 0 ? <p className="text-read text-white/40">{t('ui.exploration.noFacilities')}</p> : (
          <ul className="flex flex-col gap-3">
            {facilities.map(({ location, kinds }) => (
              <li key={location.id} className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
                <PlaceHeading location={location} onFocusLocation={onFocusLocation} />
                <p className="mt-1 text-body text-white/60">{kinds.map(kind => t(`ui.exploration.facilities.${kind}`)).join(' · ')}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <h3 className="mb-3 text-label uppercase text-signal">{t('ui.exploration.stashes')}</h3>
      {entries.length === 0 ? (
        <p className="text-read text-white/40">
          {t('ui.stashLog.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map(([locId, arr]) => {
            const loc = locations[locId];
            const counts = new Map<string, number>();
            for (const i of arr) counts.set(i.defId, (counts.get(i.defId) ?? 0) + i.stack);
            const here = currentPositionId === locId;
            return (
              <li key={locId} className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 font-semibold">
                    <Icon name={POI_CONFIG[loc.category].icon} /> {loc.name}
                    {here && <span className="ml-2 text-body text-signal">{t('ui.stashLog.here')}</span>}
                  </span>
                  {onFocusLocation && (
                    <button
                      type="button"
                      onClick={() => onFocusLocation(loc.lat, loc.lng)}
                      className="shrink-0 rounded border border-white/15 px-2 py-0.5 text-micro text-white/70 transition hover:bg-white/10 hover:text-signal"
                    >
                      {t('ui.log.showOnMap')}
                    </button>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-body text-white/60">
                  {[...counts.entries()].map(([defId, n]) => (
                    <span key={defId}>
                      {itemName(defId, locale)} ×{n}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-body text-white/30">
        {t('ui.stashLog.hint')}
      </p>
    </>
  );
}

function PlaceHeading({ location, onFocusLocation }: { location: LocationState } & Props) {
  const { locale, t } = useT();
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-read font-semibold"><Icon name={POI_CONFIG[location.category].icon} /> {location.name}</p>
        <p className="text-body text-white/45">{poiCategoryLabel(location.category, locale)}</p>
      </div>
      {onFocusLocation && <button type="button" onClick={() => onFocusLocation(location.lat, location.lng)} className="min-h-11 shrink-0 rounded border border-white/15 px-2 text-body text-white/70 transition hover:bg-white/10 hover:text-signal focus-visible:outline focus-visible:outline-signal">{t('ui.log.showOnMap')}</button>}
    </div>
  );
}

function LeadEntry({ lead, locations, onFocusLocation }: { lead: ExplorationLead; locations: Record<string, LocationState> } & Props) {
  const { t } = useT();
  const target = locations[lead.targetId];
  if (!target) return null;
  const source = locations[lead.sourceId];
  return (
    <li className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
      <PlaceHeading location={target} onFocusLocation={onFocusLocation} />
      {lead.completedDay === undefined && <p className="mt-2 text-body text-white/75">{t(`ui.exploration.descriptions.${lead.source}`)}</p>}
      <p className="mt-2 text-body text-white/50">{t('ui.exploration.sourceDay', { source: t(`ui.exploration.sources.${lead.source}`), name: source?.name ?? t('ui.location.unknownLocation'), day: lead.createdDay })}</p>
      {lead.facility && <p className="mt-1 text-body text-white/60">{t('ui.exploration.reportedFacility', { facility: t(`ui.exploration.facilities.${lead.facility}`) })}</p>}
      <p className="mt-1 text-body text-white/45">{lead.completedDay === undefined ? t('ui.exploration.conditionsUnknown') : t('ui.exploration.visitedDay', { day: lead.completedDay })}</p>
    </li>
  );
}
