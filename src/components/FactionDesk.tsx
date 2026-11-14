import { useState } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { tip } from './tips';
import {
  FACTION_CONFIG,
  STANDING_KIN,
  STANDING_KNOWN,
  STANDING_TRUSTED,
  canKinSearch88Deck,
  escortCandidates,
  factionEscorts,
  factionFeeds,
  factionOffersAid,
  factionSharesIntel,
  factionShelters,
  factionTrades,
  hasFactionClearance,
  isOutpostSite,
  locationServices,
} from '../game/factions';
import { isCarried } from '../game/inventory';
import { useGame } from '../game/store';
import { haversine } from '../game/overpass';
import type { FactionId, FactionService, LocationState } from '../game/types';
import { BtnSub, Dots } from './placeCard';
import { BTN, tint } from './placeCardStyle';
import { itemName, standingDisplayLabel, useT } from '../i18n';

type Fid = Exclude<FactionId, null>;

/** The rung each service opens at — mirrors the gates in factions.ts. */
const SERVICE_RUNG: Record<FactionService, number> = {
  trade: STANDING_KNOWN,
  intel: STANDING_KNOWN,
  feed: STANDING_KNOWN,
  escort: STANDING_KNOWN,
  rest: STANDING_TRUSTED,
  aid: STANDING_TRUSTED,
};

const SERVICE_ICON: Record<FactionService, IconName> = {
  trade: 'action.search',
  rest: 'action.sleep',
  aid: 'action.search',
  intel: 'action.map',
  feed: 'poi.foodcourt',
  escort: 'poi.waypoint',
};

/** Which verbs earn the big buttons, after the faction's signature. */
const PRIORITY: FactionService[] = ['trade', 'feed', 'escort', 'aid', 'rest', 'intel'];

function serviceLabel(t: (k: string) => string, s: FactionService, fid: Fid): string {
  if (s === 'trade' && fid === 'syndicate_88') return t('ui.location.desk.fence');
  return t(`ui.location.desk.${s}`);
}

/** Ladder rungs, low to high, for the strip's dot meter. */
const RUNGS = [-4, -2, -1, 0, STANDING_KNOWN, STANDING_TRUSTED, STANDING_KIN];

/**
 * Whose ground, how they see you, what the next rung buys and what they're
 * short of. The one place a player learns why standing is worth chasing.
 */
export function FactionStrip({ sel, fid }: { sel: LocationState; fid: Fid }) {
  const { locale, t } = useT();
  const cfg = FACTION_CONFIG[fid];
  const standing = useGame((s) => s.factionStanding[fid]);
  const outposts = useGame((s) => s.outposts);
  const items = useGame((s) => s.items);
  const isOutpost = sel.isFactionOutpost || isOutpostSite(outposts, fid, sel.id);
  const services = locationServices(sel, outposts);
  const place = isOutpost ? cfg.outpostName : `${cfg.shortName} ${t('ui.location.territory')}`;
  const score = standing > 0 ? `+${standing}` : `${standing}`;
  const filled = RUNGS.filter((r) => standing >= r).length;

  const nextRung = [STANDING_KNOWN, STANDING_TRUSTED, STANDING_KIN].find((r) => standing < r);
  const unlocks = nextRung
    ? nextRung === STANDING_KIN
      ? [t('ui.location.desk.reserved')]
      : services.filter((s) => SERVICE_RUNG[s] === nextRung).map((s) => serviceLabel(t, s, fid))
    : [];
  const nextLine = nextRung
    ? t('ui.location.desk.next', {
        rung: standingDisplayLabel(nextRung, locale),
        n: `+${nextRung}`,
        what: unlocks.length ? unlocks.join(' · ') : t('ui.location.desk.betterBoard'),
      })
    : t('ui.location.desk.kinTop');

  const carried = new Map<string, number>();
  for (const i of items) {
    if (!isCarried(i.container)) continue;
    carried.set(i.defId, (carried.get(i.defId) ?? 0) + i.stack);
  }
  const wants = cfg.wants.slice(0, 4);

  return (
    <div className="flex flex-col gap-1 rounded border px-2.5 py-2 text-body" style={tint(cfg.color)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold">
          <Icon name={cfg.icon} className="shrink-0" />
          <span className="truncate">{place}</span>
        </span>
        <span
          className="flex shrink-0 items-center gap-1.5 tabular-nums"
          {...tip(t('ui.location.desk.earnTip'))}
        >
          <Dots filled={filled} of={RUNGS.length} color={cfg.color} />
          <span className="opacity-90">
            {standingDisplayLabel(standing, locale)} {score}
          </span>
        </span>
      </div>
      <div className="text-micro text-concrete-200">{nextLine}</div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-micro text-concrete-400">
        <span>{t('ui.location.desk.shortOf')}</span>
        {wants.map((id, i) => {
          const have = carried.get(id) ?? 0;
          return (
            <span key={id} className={have ? 'text-concrete-50' : undefined}>
              {itemName(id, locale)}
              {have > 0 && <span style={{ color: cfg.color }}> ×{have}</span>}
              {i < wants.length - 1 ? ' ·' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const CHIP =
  'inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-body text-concrete-50 ' +
  'hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35 max-lg:min-h-10';

/**
 * Everything you can do on someone else's ground, in three tiers: the two
 * verbs worth the walk as big buttons, the rest as chips, and what's still
 * locked as one line naming the rung. Replaces a column of disabled buttons
 * that all said "Gate first".
 */
export function FactionDesk({
  sel,
  onEnter,
  onOpenStash,
}: {
  sel: LocationState;
  onEnter: () => void;
  onOpenStash: () => void;
}) {
  const { locale, t } = useT();
  const [escortOpen, setEscortOpen] = useState(false);
  const standing = useGame((s) => s.factionStanding);
  const outposts = useGame((s) => s.outposts);
  const day = useGame((s) => s.day);
  const items = useGame((s) => s.items);
  const locations = useGame((s) => s.locations);
  const escort = useGame((s) => s.escort);
  const openTrader = useGame((s) => s.openTrader);
  const outpostRest = useGame((s) => s.outpostRest);
  const factionAid = useGame((s) => s.factionAid);
  const factionIntel = useGame((s) => s.factionIntel);
  const factionFeed = useGame((s) => s.factionFeed);
  const factionEscort = useGame((s) => s.factionEscort);
  const searchKinDeck = useGame((s) => s.searchKinDeck);
  const sneakEnter = useGame((s) => s.sneakEnter);
  const forceEnter = useGame((s) => s.forceEnter);
  if (!sel.factionId) return null;
  const fid = sel.factionId;
  const cfg = FACTION_CONFIG[fid];
  const services = locationServices(sel, outposts);
  const cleared = hasFactionClearance(sel, standing, day);

  const stashChip = (
    <button onClick={onOpenStash} className={CHIP}>
      <Icon name="action.stash" /> {t('ui.location.desk.stash')}
    </button>
  );

  // ---- outside the wire ---------------------------------------------------
  if (!cleared) {
    const has = (id: string) => items.some((i) => isCarried(i.container) && i.defId === id);
    const fee = cfg.tribute.find(has);
    return (
      <div className="flex flex-col gap-2">
        <button onClick={onEnter} className={BTN.primary}>
          <Icon name={cfg.icon} /> {t('ui.location.approachGate')}
          <BtnSub>
            {fee
              ? t('ui.location.desk.feeHave', { item: itemName(fee, locale) })
              : t('ui.location.desk.feeNone', {
                  items: cfg.tribute.map((id) => itemName(id, locale)).join(' / '),
                })}
          </BtnSub>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={sneakEnter} className={BTN.secondary} {...tip(t('ui.location.sneakHint'))}>
            {t('ui.location.sneakIn')}
            <BtnSub>{t('ui.location.desk.sneakSub')}</BtnSub>
          </button>
          <button onClick={forceEnter} className={BTN.danger} {...tip(t('ui.location.forceHint'))}>
            {t('ui.location.forceEnter')}
            <BtnSub>{t('ui.location.desk.forceSub')}</BtnSub>
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {services.length > 0 ? (
            <span className="text-micro text-concrete-400">
              {t('ui.location.desk.behindWire', {
                what: services.map((s) => serviceLabel(t, s, fid)).join(' · '),
              })}
            </span>
          ) : (
            <span />
          )}
          {stashChip}
        </div>
      </div>
    );
  }

  // ---- inside --------------------------------------------------------------
  const usedToday: Partial<Record<FactionService, boolean>> = {
    aid: (sel.aidUsedDay ?? -1) >= day,
    intel: (sel.intelUsedDay ?? -1) >= day,
    feed: (sel.feedUsedDay ?? -1) >= day,
    escort: !!escort?.toId,
  };
  const unlocked: Record<FactionService, boolean> = {
    trade: factionTrades(fid, standing),
    rest: factionShelters(fid, standing),
    aid: factionOffersAid(fid, standing),
    intel: factionSharesIntel(fid, standing),
    feed: factionFeeds(fid, standing),
    escort: factionEscorts(fid, standing),
  };
  const run: Record<FactionService, () => void> = {
    trade: () => openTrader(sel.id),
    rest: outpostRest,
    aid: factionAid,
    intel: factionIntel,
    feed: factionFeed,
    escort: () => setEscortOpen((o) => !o),
  };
  const sub: Record<FactionService, string> = {
    trade: t('ui.location.desk.tradeSub'),
    rest: t('ui.location.desk.restSub'),
    aid: t('ui.location.desk.aidSub'),
    intel: t('ui.location.desk.intelSub'),
    feed: t('ui.location.desk.feedSub'),
    escort: t('ui.location.desk.escortSub'),
  };

  const order = [
    ...(cfg.signature && services.includes(cfg.signature) ? [cfg.signature] : []),
    ...PRIORITY.filter((s) => s !== cfg.signature && services.includes(s)),
  ];
  const open = order.filter((s) => unlocked[s]);
  const locked = order.filter((s) => !unlocked[s]);
  const ready = open.filter((s) => !usedToday[s]);
  const big = ready.slice(0, 2);
  const chips = open.filter((s) => !big.includes(s));

  const lockedByRung = new Map<number, FactionService[]>();
  for (const s of locked) {
    const r = SERVICE_RUNG[s];
    lockedByRung.set(r, [...(lockedByRung.get(r) ?? []), s]);
  }

  const kinDeck = canKinSearch88Deck(sel, standing);
  const escortDests = escortOpen ? escortCandidates(sel, locations).slice(0, 5) : [];
  const escortDest = escort?.toId ? locations[escort.toId] : null;

  return (
    <div className="flex flex-col gap-2">
      {big.length > 0 && (
        <div className={`grid gap-2 ${big.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {big.map((s, i) => (
            <button
              key={s}
              onClick={run[s]}
              aria-expanded={s === 'escort' ? escortOpen : undefined}
              className={i === 0 ? BTN.tinted : BTN.secondary}
              style={i === 0 ? tint(cfg.color) : undefined}
            >
              <Icon name={SERVICE_ICON[s]} /> {serviceLabel(t, s, fid)}
              <BtnSub>{sub[s]}</BtnSub>
            </button>
          ))}
        </div>
      )}

      {escortOpen && (
        <div className="flex flex-col gap-1 rounded border border-white/10 p-1.5">
          {escortDests.length === 0 ? (
            <span className="px-1 text-body text-concrete-400">{t('ui.location.escortNoDest')}</span>
          ) : (
            escortDests.map((d) => (
              <button
                key={d.id}
                onClick={() => factionEscort(d.id)}
                className="w-full rounded px-2 py-1 text-left text-body hover:bg-white/5"
              >
                {d.name}
                <span className="ml-1 tabular-nums text-concrete-400">
                  {Math.round(haversine(sel.lat, sel.lng, d.lat, d.lng))} m
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {escortDest && (
        <span className="text-micro text-concrete-200">
          {t('ui.location.escortBooked', { name: escortDest.name })}
        </span>
      )}

      <div className="flex flex-wrap gap-1.5">
        {chips.map((s) => (
          <button
            key={s}
            onClick={run[s]}
            disabled={!!usedToday[s]}
            className={CHIP}
            {...tip(usedToday[s] ? t('ui.location.alreadyUsedToday') : sub[s])}
          >
            <Icon name={SERVICE_ICON[s]} /> {serviceLabel(t, s, fid)}
          </button>
        ))}
        {kinDeck && (
          <button onClick={searchKinDeck} className={CHIP} {...tip(t('ui.location.walkTheDecksHint'))}>
            <Icon name="hdb.enterBlock" /> {t('ui.location.walkTheDecks')}
          </button>
        )}
        {stashChip}
      </div>

      {[...lockedByRung.entries()].map(([rung, list]) => (
        <span key={rung} className="text-micro text-concrete-400">
          {t('ui.location.desk.lockedAt', {
            rung: standingDisplayLabel(rung, locale),
            n: `+${rung}`,
            what: list.map((s) => serviceLabel(t, s, fid)).join(' · '),
          })}
        </span>
      ))}
    </div>
  );
}
