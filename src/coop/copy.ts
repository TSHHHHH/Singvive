import { useT } from '../i18n/useT';
import { SITES, type SiteId } from './model';

type Translate = ReturnType<typeof useT>['t'];

function siteLabel(t: Translate, id: string): string {
  const site = SITES.find((candidate) => candidate.id === id || candidate.name === id);
  return site ? t(`ui.coop.sites.${site.id}.name`) : id;
}

/** The prototype protocol carries English log text; localize its known event forms. */
function translateLog(text: string, t: Translate): string {
  const fixed: Record<string, string> = {
    'Expedition ended. Everyone has extracted or died.': 'ui.coop.logs.ended',
    'Everyone ready. Expedition resumed.': 'ui.coop.logs.resumed',
    'Expedition started. Idle players remain in the world.': 'ui.coop.logs.started',
  };
  if (fixed[text]) return t(fixed[text]);
  let match: RegExpMatchArray | null;
  if ((match = text.match(/^(.*) joined the expedition\.$/))) return t('ui.coop.logs.joined', { name: match[1] });
  if ((match = text.match(/^(.*) died\. Their supplies remain at (.*)\.$/))) return t('ui.coop.logs.died', { name: match[1], site: siteLabel(t, match[2]) });
  if ((match = text.match(/^(.*)'s (travel|search|rest|rescue|extract) was interrupted\.$/))) return t('ui.coop.logs.interrupted', { name: match[1], action: t(`ui.coop.actions.${match[2]}`) });
  if ((match = text.match(/^(.*) is down! Reach them with a medical charge within 30 seconds\.$/))) return t('ui.coop.logs.downed', { name: match[1] });
  if ((match = text.match(/^(.*) arrived at (.*)\.$/))) return t('ui.coop.logs.arrived', { name: match[1], site: siteLabel(t, match[2]) });
  if ((match = text.match(/^(.*) uncovered supplies in the shared cache\.$/))) return t('ui.coop.logs.supplies', { name: match[1] });
  if ((match = text.match(/^(.*) finished resting\.$/))) return t('ui.coop.logs.rested', { name: match[1] });
  if ((match = text.match(/^(.*) rescued (.*)\. Lasting injuries remain\.$/))) return t('ui.coop.logs.rescued', { name: match[1], target: match[2] });
  if ((match = text.match(/^(.*) extracted alive on life (\d+)\.$/))) return t('ui.coop.logs.extracted', { name: match[1], life: match[2] });
  if ((match = text.match(/^(.*) landed the final hit\. (.*) is clear\.$/))) return t('ui.coop.logs.cleared', { name: match[1], site: siteLabel(t, match[2]) });
  if ((match = text.match(/^(.*) disconnected\. The room is paused\.$/))) return t('ui.coop.logs.disconnected', { name: match[1] });
  if ((match = text.match(/^(.*) returned as a new survivor, without replenished supplies\.$/))) return t('ui.coop.logs.replaced', { name: match[1] });
  // Unrecognized protocol diagnostics stay intact instead of hiding useful detail.
  return text;
}

export function useCoopCopy() {
  const { t } = useT();
  return {
    t,
    siteName: (id: SiteId) => siteLabel(t, id),
    logText: (text: string) => translateLog(text, t),
  };
}
