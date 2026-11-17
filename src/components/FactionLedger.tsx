import { Icon } from '../icons/Icon';
import { FACTION_CONFIG, STANDING_KIN, STANDING_KNOWN, STANDING_TRUSTED } from '../game/factions';
import { factionShortName } from '../game/eventCopy';
import { bountyProgress } from '../game/bounties';
import { isCarried } from '../game/inventory';
import { useGame } from '../game/store';
import type { FactionId } from '../game/types';
import { Dots } from './placeCard';
import { bountyText, rewardText } from './bountyCopy';
import { standingDisplayLabel, useT } from '../i18n';

type Fid = Exclude<FactionId, null>;
const ORDER: Fid[] = ['muster', 'gotong', 'syndicate_88', 'sta'];
const RUNGS = [-4, -2, -1, 0, STANDING_KNOWN, STANDING_TRUSTED, STANDING_KIN];

/**
 * Logbook section: where you stand with every faction, what you know of their
 * outposts, and the jobs you're carrying for them.
 */
export function FactionLedger({ onFocusLocation }: { onFocusLocation?: (lat: number, lng: number) => void }) {
  const { locale, t } = useT();
  const standing = useGame((s) => s.factionStanding);
  const outposts = useGame((s) => s.outposts);
  const locations = useGame((s) => s.locations);
  const bounties = useGame((s) => s.bounties);
  const kills = useGame((s) => s.kills);
  const items = useGame((s) => s.items);
  const carried = (defId: string) =>
    items.filter((i) => isCarried(i.container) && i.defId === defId).reduce((n, i) => n + i.stack, 0);

  return (
    <section className="mb-6 space-y-3">
      <h3 className="text-label uppercase text-signal">{t('ui.factionLedger.title')}</h3>
      <ul className="flex flex-col gap-2">
        {ORDER.map((fid) => {
          const cfg = FACTION_CONFIG[fid];
          const n = standing[fid] ?? 0;
          const known = (outposts[fid] ?? [])
            .map((id) => locations[id])
            .filter((l) => l && (l.discovered || l.isFactionRevealed));
          const jobs = bounties.filter((b) => b.factionId === fid);
          return (
            <li key={fid} className="rounded-lg border bg-concrete-900/80 p-3" style={{ borderColor: `${cfg.color}55` }}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-read font-semibold" style={{ color: cfg.color }}>
                  <Icon name={cfg.icon} className="shrink-0" />
                  <span className="truncate">{factionShortName(fid, locale)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-body tabular-nums">
                  <Dots filled={RUNGS.filter((r) => n >= r).length} of={RUNGS.length} color={cfg.color} />
                  <span className="text-concrete-50">
                    {standingDisplayLabel(n, locale)} {n > 0 ? `+${n}` : n}
                  </span>
                </span>
              </div>
              <p className="mt-0.5 text-body text-white/50">{t(`ui.faction.${fid}.role`)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-white/60">
                <span>{t('ui.factionLedger.outposts', { n: known.length })}</span>
                {onFocusLocation &&
                  known.map((l) => (
                    <button
                      key={l!.id}
                      type="button"
                      onClick={() => onFocusLocation(l!.lat, l!.lng)}
                      className="rounded border border-white/15 px-2 py-0.5 text-micro text-white/70 hover:bg-white/10 hover:text-signal"
                    >
                      {l!.name}
                    </button>
                  ))}
              </div>
              {jobs.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
                  {jobs.map((b) => {
                    const p = bountyProgress(b, { kills, locations, carried });
                    return (
                      <li key={b.id} className="text-body">
                        <span className={p.done ? 'text-signal' : 'text-concrete-50'}>
                          {bountyText(t, locale, b, locations)}
                        </span>{' '}
                        <span className="tabular-nums text-white/50">
                          {p.have}/{p.need}
                        </span>
                        <span className="block text-micro text-white/45">
                          {rewardText(t, locale, b)} · {t('ui.factionLedger.handIn', { name: factionShortName(fid, locale) })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
