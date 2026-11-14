import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { itemDef } from '../game/loot';
import { footprint } from '../game/inventory';
import {
  hasFoggedOrSearching,
  type SearchSlot,
} from '../game/searchSession';
import type { ItemDef } from '../game/types';
import { Icon } from '../icons/Icon';
import { itemIcon } from './Inventory/itemIcon';
import { formatClock } from '../game/survival';
import { useClockFormat } from '../game/settings';
import { SearchLootList } from './SearchLootList';
import { ItemHoverCard } from './Inventory/ItemHoverCard';
import { GuideInfoButton } from './GuideInfoButton';
import type { GuideTopic } from '../content/guideContent';
import { itemName, useT } from '../i18n';
import { LIVE_NODE_BAND } from './logTimeline';

type Variant = 'timeline' | 'card';

/**
 * Live sequential-search UI — timeline live node, or phone map interrupt card.
 */
export function SearchSessionNode({
  variant = 'timeline',
  timeW = '2.5rem',
  hang = { paddingLeft: '2.5rem', textIndent: '-2.5rem' },
  onOpenGuide,
}: {
  variant?: Variant;
  timeW?: string;
  hang?: { paddingLeft: string; textIndent: string };
  onOpenGuide?: (topic: GuideTopic) => void;
}) {
  const session = useGame((s) => s.pendingSearch);
  const items = useGame((s) => s.items);
  const equipment = useGame((s) => s.equipment);
  const hour = useGame((s) => s.hour);
  const tickSearch = useGame((s) => s.tickSearch);
  const prioritizeSearchSlot = useGame((s) => s.prioritizeSearchSlot);
  const takeSearchItem = useGame((s) => s.takeSearchItem);
  const takeAllFound = useGame((s) => s.takeAllFound);
  const abortSearch = useGame((s) => s.abortSearch);
  const completeSearch = useGame((s) => s.completeSearch);
  const clock = useClockFormat();
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  const [hoverSlotId, setHoverSlotId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  // The timeline node only renders on desktop (phone routes live nodes to the
  // map card), so it follows the inventory convention: a floating ItemHoverCard
  // on hover. The phone card variant keeps its dedicated detail panel.
  const floatCard = variant === 'timeline';
  const [whisperHot, setWhisperHot] = useState(false);
  // Bumped on a refused Take all so the button replays its red flash.
  const [denyFlash, setDenyFlash] = useState(0);
  const denyClear = useRef(0);
  const raf = useRef(0);
  const whisperClear = useRef(0);
  const lastWhisperSeen = useRef<string | null>(null);

  useEffect(() => () => window.clearTimeout(denyClear.current), []);

  // Per-frame loop drives tickSearch + the bars. It stops once every slot is
  // revealed, so a finished search sitting open costs nothing at idle.
  const searching = session ? hasFoggedOrSearching(session) : false;
  useEffect(() => {
    if (!session || !searching) return;
    const loop = () => {
      setNow(Date.now());
      tickSearch();
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [session?.nonce, searching, tickSearch]);

  useEffect(() => {
    lastWhisperSeen.current = null;
    setWhisperHot(false);
  }, [session?.nonce]);

  useEffect(() => {
    if (!session?.lastWhisper) return;
    if (session.lastWhisper === lastWhisperSeen.current) return;
    lastWhisperSeen.current = session.lastWhisper;
    setWhisperHot(true);
    window.clearTimeout(whisperClear.current);
    whisperClear.current = window.setTimeout(() => setWhisperHot(false), 1100);
    return () => window.clearTimeout(whisperClear.current);
  }, [session?.lastWhisper, session?.revealedCount]);

  useEffect(() => {
    if (!session || !hoverSlotId) return;
    const stillThere = session.slots.some(
      (sl) => sl.id === hoverSlotId && sl.state !== 'taken' && sl.state !== 'abandoned',
    );
    if (!stillThere) {
      setHoverSlotId(null);
      setHoverPos(null);
    }
  }, [session, hoverSlotId]);

  if (!session) return null;

  const stillSearching = hasFoggedOrSearching(session);
  const foundCount = session.slots.filter((s) => s.state === 'found').length;
  const clearHover = () => {
    setHoverSlotId(null);
    setHoverPos(null);
  };
  const hovered = hoverSlotId
    ? (session.slots.find((sl) => sl.id === hoverSlotId) ?? null)
    : null;

  const hoverInst =
    hovered?.state === 'found' && hovered.uid
      ? (items.find((it) => it.uid === hovered.uid) ?? null)
      : null;

  const title = stillSearching
    ? session.hdbUnit
      ? t('ui.search.searchingNamed', { name: session.hdbUnit.label })
      : t('ui.search.searching')
    : t('ui.search.complete');

  const headerInner = (
    <>
      <span className="inline-flex items-center gap-1.5 font-semibold text-concrete-50">
        {title}
        {onOpenGuide && <GuideInfoButton topic="loot" onOpen={onOpenGuide} />}
      </span>
      {session.lastWhisper ? (
        <span className={whisperHot ? 'text-amber-200/90' : 'text-white/55'}>
          {` — ${session.lastWhisper}`}
        </span>
      ) : null}
    </>
  );

  const gridAndActions = (
    <>
      <SearchLootList
        session={session}
        now={now}
        hoverSlotId={hoverSlotId}
        onHover={(id, e) => {
          setHoverSlotId(id);
          if (floatCard && e) setHoverPos({ x: e.clientX, y: e.clientY });
        }}
        onLeave={clearHover}
        onPrioritize={prioritizeSearchSlot}
        onTake={takeSearchItem}
        nameTips={!floatCard}
      />

      {!floatCard && hovered && <SearchHoverPanel slot={hovered} />}

      {floatCard && hoverInst && hoverPos && (
        <ItemHoverCard
          inst={hoverInst}
          equipment={equipment}
          equipSlot={null}
          clientX={hoverPos.x}
          clientY={hoverPos.y}
        />
      )}

      <div className="mt-2 flex flex-col gap-1.5">
        {foundCount > 0 && (
          <button
            type="button"
            key={`take-all-${denyFlash}`}
            onClick={() => {
              if (takeAllFound()) return;
              setDenyFlash((n) => n + 1);
              window.clearTimeout(denyClear.current);
              denyClear.current = window.setTimeout(() => setDenyFlash(0), 700);
            }}
            className={`flex w-full items-center gap-1.5 rounded border border-signal/40 px-2 py-1 text-left text-body text-signal transition hover:bg-signal/10${
              denyFlash > 0 ? ' take-all-deny' : ''
            }`}
          >
            <Icon name="action.stash" size={13} className="shrink-0" />
            {t('ui.search.takeAllCount', { count: foundCount })}
          </button>
        )}
        {stillSearching ? (
          <button
            type="button"
            onClick={() => abortSearch()}
            className="flex w-full items-center gap-1.5 rounded border border-white/15 px-2 py-1 text-left text-body text-white/60 transition hover:bg-white/5"
          >
            <Icon name="choice.leave" size={13} className="shrink-0" />
            {t('ui.location.leaveAbandon')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => completeSearch()}
            className="flex w-full items-center gap-1.5 rounded border border-signal/40 px-2 py-1 text-left text-body font-semibold text-signal transition hover:bg-signal/10"
          >
            <Icon name="choice.check" size={13} className="shrink-0" />
            {foundCount > 0 ? t('ui.location.doneAbandon') : t('ui.location.done')}
          </button>
        )}
      </div>
    </>
  );

  if (variant === 'card') {
    return (
      <div className="space-y-2">
        <div className="text-label uppercase text-signal/70">
          {t('ui.location.search')}
        </div>
        <p className="text-body text-white/70">
          <span className="mr-1.5 text-micro tabular-nums text-white/35">
            {formatClock(hour, clock)}
          </span>
          {headerInner}
        </p>
        {gridAndActions}
      </div>
    );
  }

  return (
    <li data-timeline-live="" className={`relative flex gap-2 py-1.5 pl-6 pr-2 ${LIVE_NODE_BAND}`}>
      <span className="absolute left-0 top-[7px] h-[11px] w-[11px] animate-pulse rounded-full border-2 border-concrete-900 bg-signal" />
      <div className="min-w-0 flex-1">
        <p
          style={hang}
          className="whitespace-normal break-words text-body text-white/70"
        >
          <span
            className="inline-block text-micro tabular-nums text-white/25"
            style={{ width: timeW, textIndent: 0 }}
          >
            {formatClock(hour, clock)}
          </span>
          {headerInner}
        </p>

        <div className="mt-2" style={{ paddingLeft: timeW }}>
          {gridAndActions}
        </div>
      </div>
    </li>
  );
}

function SearchHoverPanel({ slot }: { slot: SearchSlot | null }) {
  const { t } = useT();
  return (
    <div className="mt-2 max-h-40 min-w-0 overflow-hidden rounded border border-white/15 bg-concrete-900/80 px-2.5 py-2">
      {!slot ? (
        <p className="text-micro text-white/30">{t('ui.search.hoverDetails')}</p>
      ) : slot.state === 'fogged' || slot.state === 'searching' ? (
        <div className="space-y-1">
          <div className="text-body font-semibold text-white/50">{t('ui.search.unknown')}</div>
          <p className="text-micro text-white/35">{t('ui.search.clickNext')}</p>
          <p className="text-micro text-white/25">
            {t('ui.search.footprint', { label: slotFootprintLabel(slot) })}
          </p>
        </div>
      ) : (
        <FoundHoverDetails slot={slot} />
      )}
    </div>
  );
}

function FoundHoverDetails({ slot }: { slot: SearchSlot }) {
  const { locale, t } = useT();
  const def = itemDef(slot.defId);
  const lines = describeSearchItem(def, slot, t);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto">
      <div className="flex items-start gap-1.5">
        <Icon name={itemIcon(def)} size={18} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-body font-semibold text-concrete-50">{itemName(def.id, locale)}</span>
            {def.exotic && (
              <span className="rounded bg-amber-300/15 px-1 text-label uppercase text-amber-300">
                {t('ui.inventory.exotic')}
              </span>
            )}
            {slot.count > 1 && (
              <span className="tabular-nums text-micro text-signal">×{slot.count}</span>
            )}
          </div>
          <div className="text-label uppercase text-white/35">{itemKindLabel(def, t)}</div>
        </div>
      </div>
      <ul className="space-y-0.5">
        {lines.map((line) => (
          <li key={line} className="text-micro text-white/55">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function slotFootprintLabel(slot: SearchSlot): string {
  const def = itemDef(slot.defId);
  const { w, h } = footprint(def, slot.rotated);
  return `${w}×${h}`;
}

function itemKindLabel(def: ItemDef, t: ReturnType<typeof useT>['t']): string {
  if (def.slot) return def.effect.kind === 'weapon' ? t('ui.itemKind.weapon') : t('ui.itemKind.gear');
  switch (def.effect.kind) {
    case 'food':
      return t('ui.itemKind.food');
    case 'water':
      return t('ui.itemKind.drink');
    case 'heal':
    case 'cure':
      return t('ui.itemKind.medical');
    case 'energy':
      return t('ui.itemKind.stimulant');
    case 'fuel':
      return t('ui.itemKind.fuel');
    case 'ammo':
      return t('ui.itemKind.ammo');
    default:
      return t('ui.itemKind.misc');
  }
}

/** Short readable lines for the timeline hover panel (no equip compare). */
function describeSearchItem(def: ItemDef, slot: SearchSlot, t: ReturnType<typeof useT>['t']): string[] {
  const lines: string[] = [];
  const e = def.effect;
  const m = def.modifiers ?? {};

  lines.push(`${def.w}×${def.h} · ${def.weight} kg`);
  if (slot.condition !== undefined) {
    lines.push(t('ui.search.condition', { n: Math.round(slot.condition) }));
  }

  switch (e.kind) {
    case 'weapon':
      lines.push(
        t('ui.search.damage', { n: e.damage, kind: t(e.ranged ? 'ui.search.ranged' : 'ui.search.melee') }) +
          (e.roundsPerShot && e.roundsPerShot > 1 ? t('ui.search.perShot', { n: e.roundsPerShot }) : ''),
      );
      break;
    case 'food':
      lines.push(t('ui.search.restoreHunger', { n: e.hunger }));
      break;
    case 'water':
      lines.push(t('ui.search.restoreThirst', { n: e.thirst }));
      if (e.infectionRisk) lines.push(t('ui.search.infectionRisk', { n: e.infectionRisk }));
      break;
    case 'heal':
      lines.push(
        t('ui.search.heal', { n: e.health }) + (e.stopsBleeding ? t('ui.search.stopsBleeding', { kind: t(`ui.search.bleed.${e.stopsBleeding}`) }) : ''),
      );
      break;
    case 'cure':
      lines.push(t('ui.search.cure', { n: e.infection }));
      break;
    case 'energy':
      lines.push(`${t('ui.stats.energy')} ${e.energy}`);
      break;
    case 'ammo':
      lines.push(t('ui.inventory.rounds', { n: e.rounds }));
      break;
    case 'fuel':
      lines.push(t('ui.search.fuel'));
      break;
    default:
      break;
  }

  if (m.attackBonus) lines.push(`${t('ui.stats.attack')} ${m.attackBonus > 0 ? '+' : ''}${m.attackBonus}`);
  if (m.defenseBonus) lines.push(`${t('ui.stats.defence')} +${m.defenseBonus}`);
  if (m.accuracyBonus) lines.push(`${t('ui.stats.accuracy')} +${m.accuracyBonus}`);
  if (m.speedBonus) lines.push(`${t('ui.stats.speed')} +${m.speedBonus}`);
  if (m.searchSpeedBonus) {
    lines.push(t('ui.search.searchSpeed', { n: Math.round(m.searchSpeedBonus * 100) }));
  }
  if (m.travelSpeedBonus) {
    lines.push(`${t('ui.stats.travel')} ${m.travelSpeedBonus > 0 ? '+' : ''}${Math.round(m.travelSpeedBonus * 100)}%`);
  }
  if (m.awarenessMod) lines.push(`${t('ui.stats.awareness')} +${m.awarenessMod}`);
  if (m.lightPower) lines.push(`${t('ui.stats.light')} ${Math.round(m.lightPower * 100)}%`);
  if ((def.scarcity ?? 1) <= 0.45) lines.push(t('ui.search.scarce'));

  return lines;
}
