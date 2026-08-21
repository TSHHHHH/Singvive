import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { itemDef } from '../game/loot';
import { SEARCH_DIMS, footprint } from '../game/inventory';
import {
  searchProgress,
  hasFoggedOrSearching,
  type SearchSlot,
} from '../game/searchSession';
import type { ItemDef } from '../game/types';
import { Icon } from '../icons/Icon';
import { itemIcon } from './Inventory/itemIcon';
import { formatClock } from '../game/survival';
import { useClockFormat } from '../game/settings';
import { SearchFindRevealCell } from './SearchFindRevealCell';
import { GuideInfoButton } from './GuideInfoButton';
import type { GuideTopic } from '../content/guideContent';
import { useT } from '../i18n';

/** Match inventory cell size so stash finds read at the same scale. */
const CELL = 34;

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
  const [whisperHot, setWhisperHot] = useState(false);
  const raf = useRef(0);
  const whisperClear = useRef(0);
  const lastWhisperSeen = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const loop = () => {
      setNow(Date.now());
      tickSearch();
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [session?.nonce, tickSearch]);

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
    if (!stillThere) setHoverSlotId(null);
  }, [session, hoverSlotId]);

  if (!session) return null;

  const dims = SEARCH_DIMS;
  const progress = searchProgress(session, now);
  const searchingId = session.queue[0] ?? null;
  const stillSearching = hasFoggedOrSearching(session);
  const foundCount = session.slots.filter((s) => s.state === 'found').length;
  const hovered = hoverSlotId
    ? (session.slots.find((sl) => sl.id === hoverSlotId) ?? null)
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
      <div className="flex items-stretch gap-2.5">
        <div className={`relative shrink-0 overflow-visible ${variant === 'timeline' ? '-m-2 p-2' : ''}`}>
          <div
            className="relative overflow-visible rounded border border-white/10 bg-black/40"
            style={{
              width: dims.w * CELL,
              height: dims.h * CELL,
              backgroundImage:
                'linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px)',
              backgroundSize: `${CELL}px ${CELL}px`,
            }}
            onMouseLeave={() => setHoverSlotId(null)}
          >
            {session.slots.map((slot) => {
              if (slot.state === 'abandoned' || slot.state === 'taken') return null;
              const def = itemDef(slot.defId);
              const { w, h } = footprint(def, slot.rotated);
              const isSearching =
                slot.state === 'searching' || (slot.state === 'fogged' && slot.id === searchingId);
              const isFogged = slot.state === 'fogged' || slot.state === 'searching';
              const cellStyle = {
                left: slot.x * CELL + 1,
                top: slot.y * CELL + 1,
                width: w * CELL - 2,
                height: h * CELL - 2,
                zIndex: isSearching ? 8 : slot.state === 'found' && slot.highlight ? 9 : 5,
              } as const;

              if (!isFogged) {
                const highlight = slot.highlight ?? null;
                return (
                  <SearchFindRevealCell
                    key={slot.id}
                    def={def}
                    count={slot.count}
                    condition={slot.condition}
                    highlight={highlight}
                    playKey={`${session.nonce}-${slot.id}-${slot.uid ?? 'pending'}`}
                    animate={!!highlight}
                    forceMotion
                    iconSize={Math.min(w, h) > 1 ? 22 : 18}
                    title={def.name}
                    onMouseEnter={() => setHoverSlotId(slot.id)}
                    onFocus={() => setHoverSlotId(slot.id)}
                    onClick={() => {
                      if (slot.uid) takeSearchItem(slot.uid);
                    }}
                    className="absolute cursor-pointer"
                    style={cellStyle}
                  />
                );
              }

              const ring =
                hoverSlotId === slot.id ? 'ring-2 ring-white/50' : 'ring-1 ring-black/40';

              return (
                <button
                  key={slot.id}
                  type="button"
                  title={t('ui.search.clickNext')}
                  onMouseEnter={() => setHoverSlotId(slot.id)}
                  onFocus={() => setHoverSlotId(slot.id)}
                  onClick={() => prioritizeSearchSlot(slot.id)}
                  className={`absolute flex cursor-pointer flex-col items-center justify-center rounded text-center transition hover:brightness-125 ${ring}`}
                  style={{
                    ...cellStyle,
                    background: '#1a1a1ecc',
                  }}
                >
                  <span className="text-base text-white/25">?</span>
                  {isSearching && (
                    <span
                      className="pointer-events-none absolute inset-1 rounded border border-signal/40"
                      style={{
                        background: `linear-gradient(to top, rgba(143,191,75,0.35) ${progress * 100}%, transparent ${progress * 100}%)`,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <SearchHoverPanel slot={hovered} gridH={dims.h * CELL} />
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        {foundCount > 0 && (
          <button
            type="button"
            onClick={() => takeAllFound()}
            className="flex w-full items-center gap-1.5 rounded border border-signal/40 px-2 py-1 text-left text-xs text-signal transition hover:bg-signal/10"
          >
            <Icon name="action.stash" size={13} className="shrink-0" />
            {t('ui.search.takeAllCount', { count: foundCount })}
          </button>
        )}
        {stillSearching ? (
          <button
            type="button"
            onClick={() => abortSearch()}
            className="flex w-full items-center gap-1.5 rounded border border-white/15 px-2 py-1 text-left text-xs text-white/60 transition hover:bg-white/5"
          >
            <Icon name="choice.leave" size={13} className="shrink-0" />
            {t('ui.location.leaveAbandon')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => completeSearch()}
            className="flex w-full items-center gap-1.5 rounded border border-signal/40 px-2 py-1 text-left text-xs font-semibold text-signal transition hover:bg-signal/10"
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
        <div className="text-2xs uppercase tracking-widest text-signal/70">
          {t('ui.location.search')}
        </div>
        <p className="text-xs leading-snug text-white/70">
          <span className="mr-1.5 font-mono text-2xs tabular-nums text-white/35">
            {formatClock(hour, clock)}
          </span>
          {headerInner}
        </p>
        {gridAndActions}
      </div>
    );
  }

  return (
    <li className="relative flex gap-2 rounded bg-white/[0.07] py-1.5 pl-6 pr-3">
      <span className="absolute left-0 top-[7px] h-[11px] w-[11px] animate-pulse rounded-full border-2 border-concrete-900 bg-signal" />
      <div className="min-w-0 flex-1">
        <p
          style={hang}
          className="whitespace-normal break-words text-xs leading-snug text-white/70"
        >
          <span
            className="inline-block font-mono text-2xs tabular-nums text-white/25"
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

function SearchHoverPanel({
  slot,
  gridH,
}: {
  slot: SearchSlot | null;
  gridH: number;
}) {
  const { t } = useT();
  return (
    <div
      className="min-w-0 flex-1 overflow-hidden rounded border border-white/15 bg-concrete-900/80 px-2.5 py-2"
      style={{ minHeight: gridH }}
    >
      {!slot ? (
        <p className="text-2xs leading-snug text-white/30">{t('ui.search.hoverDetails')}</p>
      ) : slot.state === 'fogged' || slot.state === 'searching' ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-white/50">{t('ui.search.unknown')}</div>
          <p className="text-2xs leading-snug text-white/35">{t('ui.search.clickNext')}</p>
          <p className="text-2xs text-white/25">
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
  const def = itemDef(slot.defId);
  const lines = describeSearchItem(def, slot);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto">
      <div className="flex items-start gap-1.5">
        <Icon name={itemIcon(def)} size={18} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-xs font-semibold text-concrete-50">{def.name}</span>
            {def.exotic && (
              <span className="rounded bg-amber-300/15 px-1 text-2xs uppercase tracking-wide text-amber-300">
                Exotic
              </span>
            )}
            {slot.count > 1 && (
              <span className="tabular-nums text-2xs text-signal">×{slot.count}</span>
            )}
          </div>
          <div className="text-2xs uppercase tracking-wide text-white/35">{itemKindLabel(def)}</div>
        </div>
      </div>
      <ul className="space-y-0.5">
        {lines.map((line) => (
          <li key={line} className="text-2xs leading-snug text-white/55">
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

function itemKindLabel(def: ItemDef): string {
  if (def.slot) return def.effect.kind === 'weapon' ? 'Weapon' : 'Gear';
  switch (def.effect.kind) {
    case 'food':
      return 'Food';
    case 'water':
      return 'Drink';
    case 'heal':
    case 'cure':
      return 'Medical';
    case 'energy':
      return 'Stimulant';
    case 'fuel':
      return 'Fuel';
    case 'ammo':
      return 'Ammo';
    default:
      return 'Misc';
  }
}

/** Short readable lines for the timeline hover panel (no equip compare). */
function describeSearchItem(def: ItemDef, slot: SearchSlot): string[] {
  const lines: string[] = [];
  const e = def.effect;
  const m = def.modifiers ?? {};

  lines.push(`${def.w}×${def.h} · ${def.weight} kg`);
  if (slot.condition !== undefined) {
    lines.push(`Condition ${Math.round(slot.condition)}%`);
  }

  switch (e.kind) {
    case 'weapon':
      lines.push(
        `Damage ${e.damage}${e.ranged ? ' · ranged' : ' · melee'}${
          e.roundsPerShot && e.roundsPerShot > 1 ? ` · ${e.roundsPerShot}/shot` : ''
        }`,
      );
      break;
    case 'food':
      lines.push(`Restores hunger ${e.hunger}`);
      break;
    case 'water':
      lines.push(`Restores thirst ${e.thirst}`);
      if (e.infectionRisk) lines.push(`Infection risk +${e.infectionRisk}`);
      break;
    case 'heal':
      lines.push(
        `Heals ${e.health}${e.stopsBleeding ? ` · stops bleeding (${e.stopsBleeding})` : ''}`,
      );
      break;
    case 'cure':
      lines.push(`Clears infection ${e.infection}`);
      break;
    case 'energy':
      lines.push(`Energy ${e.energy}`);
      break;
    case 'ammo':
      lines.push(`${e.rounds} rounds`);
      break;
    case 'fuel':
      lines.push('Fuel for the road');
      break;
    default:
      break;
  }

  if (m.attackBonus) lines.push(`Attack ${m.attackBonus > 0 ? '+' : ''}${m.attackBonus}`);
  if (m.defenseBonus) lines.push(`Defence +${m.defenseBonus}`);
  if (m.accuracyBonus) lines.push(`Accuracy +${m.accuracyBonus}`);
  if (m.speedBonus) lines.push(`Speed +${m.speedBonus}`);
  if (m.searchSpeedBonus) {
    lines.push(`Search speed +${Math.round(m.searchSpeedBonus * 100)}%`);
  }
  if (m.travelSpeedBonus) {
    lines.push(`Travel ${m.travelSpeedBonus > 0 ? '+' : ''}${Math.round(m.travelSpeedBonus * 100)}%`);
  }
  if (m.awarenessMod) lines.push(`Awareness +${m.awarenessMod}`);
  if ((def.scarcity ?? 1) <= 0.45) lines.push('Scarce find');

  return lines;
}
