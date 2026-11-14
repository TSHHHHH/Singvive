import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { collectedRain, gameHour, heatRemaining, surfaceSite } from '../game/facilities';
import { useT } from '../i18n';

/** Reads only the current site's facilities and the action clock. */
export function SiteFacilitiesPanel() {
  const { t } = useT();
  const { loc, day, hour, seed, collect, busy } = useGame(useShallow(s => ({
    loc: surfaceSite(s), day: s.day, hour: s.hour, seed: s.seed,
    collect: s.collectSiteWater,
    busy: !!(s.combat || s.travelAnim || s.pendingSearch || s.pendingEvent),
  })));
  if (!loc?.facilities) return null;
  const site = loc.facilities;
  const now = gameHour(day, hour);
  const heat = heatRemaining(site, now);
  const rain = collectedRain(site, now, seed);
  const water = site.water?.amount ?? 0;
  const hot = water > 0 && (site.water?.hotUntil ?? 0) > now;
  const button = 'min-h-11 rounded border border-white/20 px-3 text-body text-white/80 hover:bg-white/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-signal';
  return <details className="rounded border border-white/15 bg-black/20 p-3 text-body">
    <summary className="min-h-11 cursor-pointer text-white/85 focus-visible:outline focus-visible:outline-signal">
      {t('ui.craft.siteFacilities')}
      <span className="mt-1 block text-white/65">{t(heat > 0 ? 'ui.craft.heatLeft' : 'ui.craft.noHeat', { h: heat.toFixed(1) })}</span>
    </summary>
    <div className="mt-2 space-y-2">
    {site.fireUntil !== undefined && <p className="text-white/55">{t(site.fireUntil > now ? 'ui.craft.fireLit' : 'ui.craft.fireSpent')}</p>}
    {site.stove && <p className="text-white/55">{t('ui.craft.stoveBuilt')}</p>}
    {site.rainShelter && <p className="text-white/65">{t('ui.craft.shelterBuilt')}</p>}
    {site.collector && <div className="flex flex-wrap items-center gap-2">
      <span className="text-white/65">{t('ui.craft.rainStored', { n: rain.toFixed(1) })}</span>
      <button type="button" className={button} disabled={busy || rain < 1} onClick={() => collect('rain')}>{t('ui.craft.collectRain')}</button>
    </div>}
    {water > 0 && <div className="flex flex-wrap items-center gap-2">
      <span className="text-white/65">{t(hot ? 'ui.craft.hotStored' : 'ui.craft.cleanStored', { n: water, h: Math.max(0, (site.water?.hotUntil ?? 0) - now).toFixed(1) })}</span>
      <button type="button" className={button} disabled={busy} onClick={() => collect('boiled')}>{t('ui.craft.collectClean')}</button>
    </div>}
    </div>
  </details>;
}
