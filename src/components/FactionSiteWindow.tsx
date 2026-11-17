import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import {
  FACTION_CONFIG,
  STANDING_KIN,
  STANDING_KNOWN,
  STANDING_TRUSTED,
  gateRequirement,
  hasFactionClearance,
  isOutpostSite,
  locationServices,
} from '../game/factions';
import { factionShortName } from '../game/eventCopy';
import { useGame } from '../game/store';
import { formatDuration } from '../game/travel';
import { remainingSearchMinutes } from '../game/searchSession';
import type { FactionService, LocationState } from '../game/types';
import { poiCategoryLabel, standingDisplayLabel, useT } from '../i18n';
import { BountyBoard, FactionDesk, FactionStrip } from './FactionDesk';
import { SERVICE_RUNG, serviceLabel } from './factionServices';
import { LocalMapAction } from './LocalMapAction';
import { PlaceMapToggle } from './PlaceMapToggle';
import { SiteFacilitiesPanel } from './SiteFacilitiesPanel';
import { BtnSub } from './placeCard';
import { BTN, tint } from './placeCardStyle';

/**
 * Standing at a faction's site: the faction's own window, the camera held on
 * the site beside it (desktop) or above it (phone). Everything you can do on
 * their ground in one place: the door and its rule, what they sell and to
 * whom, the job board, and the ladder. Same shape as the HDB block view, and
 * the same Map toggle to look around and plan the next move.
 */
export function FactionSiteWindow({
  site,
  placeKey,
  onEnter,
  onOpenStash,
  inset,
  phone,
  onSheetHeight,
}: {
  site: LocationState;
  placeKey: string;
  onEnter: () => void;
  onOpenStash: () => void;
  /** Desktop: px of the map kept clear for the HUD; the window fills the rest. */
  inset?: { top: number; right: number; bottom: number; left: number };
  phone: boolean;
  /** Phone: the sheet's height, so the camera frames the site above it. */
  onSheetHeight?: (px: number) => void;
}) {
  const { locale, t } = useT();
  const outposts = useGame((s) => s.outposts);
  const standing = useGame((s) => s.factionStanding);
  const day = useGame((s) => s.day);
  const raidMode = useGame((s) => s.raidMode);
  const pendingSearch = useGame((s) => s.pendingSearch);
  const abortSearch = useGame((s) => s.abortSearch);
  const raidSearch = useGame((s) => s.raidSearch);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sheetRef.current;
    if (!phone || !el || !onSheetHeight) return;
    const ro = new ResizeObserver(() => onSheetHeight(Math.round(el.offsetHeight)));
    ro.observe(el);
    return () => {
      ro.disconnect();
      onSheetHeight(0);
    };
  }, [phone, onSheetHeight]);

  const fid = site.factionId;
  if (!fid) return null;
  const cfg = FACTION_CONFIG[fid];
  const isOutpost = site.isFactionOutpost || isOutpostSite(outposts, fid, site.id);
  const title = isOutpost
    ? t(`ui.faction.${fid}.outpost`)
    : `${factionShortName(fid, locale)}${locale === 'zh-Hans' ? '' : ' '}${t('ui.location.territory')}`;
  const cleared = hasFactionClearance(site, standing, day);
  const policy = site.gatePolicy ?? 'fee';
  const raiding = raidMode?.locationId === site.id;
  const searching = !!pendingSearch && pendingSearch.locationId === site.id;

  const doorRule =
    policy === 'open'
      ? t('ui.place.gateOpen')
      : policy === 'members'
        ? t('ui.place.gateMembers', {
            rung: standingDisplayLabel(gateRequirement(site), locale),
            n: `+${gateRequirement(site)}`,
          })
        : t('ui.place.gateFee');
  const passDay = site.tollPaidThroughDay ?? -1;
  const where = raiding
    ? raidMode!.mode === 'sneak'
      ? t('ui.location.insideUnseen')
      : t('ui.location.forcedEntry')
    : cleared
      ? t('ui.place.inside')
      : t('ui.place.outside');

  const gate = (
    <Section title={t('ui.place.gate')}>
      <p className="text-body text-concrete-200">{doorRule}</p>
      <p className="text-micro text-concrete-400">
        {where}
        {passDay >= day && <> · {t('ui.place.passThrough', { d: passDay })}</>}
      </p>
      <div className="mt-1">
        {searching ? (
          <button onClick={() => abortSearch()} className={BTN.secondary}>
            <Icon name="action.search" /> {t('ui.location.searching')}
            <BtnSub>
              {t('ui.location.searchRemaining', {
                time: formatDuration(remainingSearchMinutes(pendingSearch!)),
              })}{' '}
              — {t('ui.location.leaveStopEarly')}
            </BtnSub>
          </button>
        ) : raiding ? (
          <div className="flex flex-col gap-2">
            <button disabled={site.exhausted} onClick={raidSearch} className={BTN.primary}>
              <Icon name="action.search" />{' '}
              {site.exhausted
                ? t('ui.location.nothingLeft')
                : raidMode!.mode === 'sneak'
                  ? t('ui.location.searchWhileUnseen')
                  : t('ui.location.tearThrough')}
            </button>
            <button onClick={onOpenStash} className={BTN.secondary}>
              <Icon name="action.stash" /> {t('ui.location.openStashHere')}
            </button>
          </div>
        ) : (
          <FactionDesk sel={site} onEnter={onEnter} onOpenStash={onOpenStash} jobs={false} />
        )}
      </div>
    </Section>
  );

  const hasBoard =
    site.category === 'mrt' || !!site.isMrtStation || site.category === 'residential' || site.category === 'community';
  const extras = (site.facilities || hasBoard) && (
    <Section title={t('ui.place.site')}>
      {site.facilities && <SiteFacilitiesPanel />}
      {hasBoard && <LocalMapAction location={site} />}
    </Section>
  );

  const standingCol = (
    <Section title={t('ui.place.standing')}>
      <FactionStrip sel={site} fid={fid} />
      <StandingLadder site={site} />
    </Section>
  );

  const jobs = (
    <Section title={t('ui.location.desk.jobs')}>
      <BountyBoard
        sel={site}
        bare
        empty={<p className="text-body text-concrete-400">{t('ui.place.noJobs')}</p>}
      />
    </Section>
  );

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-concrete-800 px-3 py-3 lg:px-4">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded border"
        style={tint(cfg.color)}
        aria-hidden
      >
        <Icon name={cfg.icon} size={20} />
      </span>
      <div className="min-w-0 flex-[1_1_12rem]">
        <div className="truncate text-plate uppercase lg:text-title" style={{ color: cfg.color }}>
          {title}
        </div>
        <div className="truncate text-body text-concrete-400">
          {site.name} · {poiCategoryLabel(site.category, locale)}
        </div>
      </div>
      <div className="ml-auto">
        <PlaceMapToggle
          placeKey={placeKey}
          placeLabel={t('ui.place.siteTab')}
          placeName={site.name}
          placeIcon={cfg.icon}
          hotkey={!phone}
        />
      </div>
    </div>
  );

  if (phone) {
    return (
      // Above the sheet is the view of the site: drag there to orbit it.
      <div className="absolute inset-0 flex flex-col justify-end" data-block-orbit="">
        <div
          ref={sheetRef}
          data-faction-window=""
          className="flex max-h-[64%] min-h-0 flex-col rounded-t-lg border-t border-concrete-600 bg-concrete-950/95 shadow-[0_-8px_32px_rgba(0,0,0,0.6)]"
        >
          {header}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
            {gate}
            {jobs}
            {standingCol}
            {extras}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      // The bare padding is the view of the site: drag there to orbit it.
      data-block-orbit=""
      className="box-border flex h-full w-full cursor-grab flex-col active:cursor-grabbing"
      style={inset ? { paddingTop: inset.top, paddingRight: inset.right, paddingBottom: inset.bottom, paddingLeft: inset.left } : undefined}
    >
      <div
        data-faction-window=""
        className="flex max-h-full min-h-0 cursor-auto flex-col rounded-sm border border-concrete-600 bg-concrete-950/95 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
      >
        {header}
        <div className="grid min-h-0 flex-1 grid-cols-2 items-start gap-4 overflow-y-auto overscroll-contain p-4">
          <div className="flex min-w-0 flex-col gap-4">
            {gate}
            {extras}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {jobs}
            {standingCol}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-label uppercase text-concrete-400">{title}</h3>
      {children}
    </section>
  );
}

/** The three rungs and what each opens at this site, yours lit. */
function StandingLadder({ site }: { site: LocationState }) {
  const { locale, t } = useT();
  const outposts = useGame((s) => s.outposts);
  const fid = site.factionId!;
  const standing = useGame((s) => s.factionStanding[fid]);
  const cfg = FACTION_CONFIG[fid];
  const services = locationServices(site, outposts);
  const rungs = [STANDING_KNOWN, STANDING_TRUSTED, STANDING_KIN];
  const what = (r: number) => {
    if (r === STANDING_KIN) return [t('ui.location.desk.reserved')];
    return services
      .filter((s: FactionService) => SERVICE_RUNG[s] === r)
      .map((s) => serviceLabel(t, s, fid));
  };
  return (
    <div className="flex flex-col gap-1" aria-label={t('ui.place.ladder')}>
      {rungs.map((r) => {
        const reached = standing >= r;
        const list = what(r);
        return (
          <div
            key={r}
            className={`flex items-baseline gap-2 rounded border px-2 py-1 text-body ${
              reached ? '' : 'border-concrete-800 text-concrete-400'
            }`}
            style={reached ? tint(cfg.color) : undefined}
          >
            <span className="w-20 shrink-0 font-semibold">{standingDisplayLabel(r, locale)}</span>
            <span className="w-8 shrink-0 tabular-nums opacity-80">+{r}</span>
            <span className="min-w-0 flex-1">
              {list.length ? list.join(' · ') : t('ui.location.desk.betterBoard')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
