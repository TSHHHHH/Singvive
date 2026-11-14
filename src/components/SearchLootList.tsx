import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type React from 'react';
import type { SearchSession, SearchSlot } from '../game/searchSession';
import type { ItemDef } from '../game/types';
import { itemDef } from '../game/loot';
import { conditionBarColor, tileColor } from '../game/itemTileColor';
import { Icon } from '../icons/Icon';
import { itemIcon } from './Inventory/itemIcon';
import { SearchFindRevealCell } from './SearchFindRevealCell';
import { itemName, useT } from '../i18n';
import { tip } from './tips';
import { revealName, slotProgress } from '../game/searchReveal';

/** Row height in px — also used to cap the list height. */
const ROW_H = 34;
const ICON_BOX = 26;
const MAX_VISIBLE_ROWS = 8;

const SCRAMBLE_MS = 70;

/** Blur + desaturate the icon until the bar fills; mosaic overlay fades out. */
function censorStyle(p: number): CSSProperties {
  const k = 1 - p;
  return {
    filter: `blur(${(k * 3.5).toFixed(2)}px) grayscale(${k.toFixed(2)}) brightness(${(0.45 + 0.55 * p).toFixed(2)})`,
  };
}

type Props = {
  session: SearchSession;
  now: number;
  hoverSlotId: string | null;
  onHover: (slotId: string, e?: React.PointerEvent) => void;
  onLeave: () => void;
  onPrioritize: (slotId: string) => void;
  onTake: (uid: string) => void;
  /** Native tooltip with the item name on found rows (phone card has no hover card). */
  nameTips: boolean;
};

/**
 * Zomboid-style vertical loot list for a live search session. Each unknown
 * row fills left to right as it is searched; the name types itself in and the
 * icon sharpens in step with the bar.
 *
 * Cost: the parent already re-renders per frame while a slot is searching
 * (it drives `tickSearch`). Everything here is a transform / filter on a
 * small box — no layout-affecting animation, and nothing ticks once the
 * search is complete.
 */
export function SearchLootList({
  session,
  now,
  hoverSlotId,
  onHover,
  onLeave,
  onPrioritize,
  onTake,
  nameTips,
}: Props) {
  const { locale, t } = useT();
  const listRef = useRef<HTMLUListElement>(null);
  const searchingId = session.queue[0] ?? null;
  const rows = session.slots.filter((s) => s.state !== 'abandoned' && s.state !== 'taken');

  // Keep the active row in view without scrolling the page around it.
  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!ul || !searchingId) return;
    const li = ul.querySelector<HTMLElement>(`[data-slot="${CSS.escape(searchingId)}"]`);
    if (!li) return;
    const top = li.offsetTop;
    const bottom = top + li.offsetHeight;
    if (top < ul.scrollTop) ul.scrollTop = top;
    else if (bottom > ul.scrollTop + ul.clientHeight) ul.scrollTop = bottom - ul.clientHeight;
  }, [searchingId]);

  return (
    <ul
      ref={listRef}
      className="search-loot-list relative flex flex-col gap-1 overflow-y-auto overflow-x-hidden rounded border border-white/10 bg-black/40 p-1"
      style={{ maxHeight: MAX_VISIBLE_ROWS * (ROW_H + 4) + 8 }}
      onMouseLeave={onLeave}
    >
      {rows.map((slot) => {
        const def = itemDef(slot.defId);
        const isActive =
          slot.state === 'searching' || (slot.state === 'fogged' && slot.id === searchingId);
        const p = slotProgress(slot, session, now);
        return (
          <li key={slot.id} data-slot={slot.id}>
            {slot.state === 'found' ? (
              <FoundRow
                slot={slot}
                def={def}
                name={itemName(def.id, locale)}
                nonce={session.nonce}
                hovered={hoverSlotId === slot.id}
                tipText={nameTips ? itemName(def.id, locale) : undefined}
                onHover={onHover}
                onLeave={onLeave}
                onTake={onTake}
              />
            ) : (
              <FoggedRow
                slot={slot}
                def={def}
                name={itemName(def.id, locale)}
                progress={p}
                active={isActive}
                scrambleTick={isActive ? Math.floor(now / SCRAMBLE_MS) : null}
                hovered={hoverSlotId === slot.id}
                tipText={t('ui.search.clickNext')}
                onHover={onHover}
                onPrioritize={onPrioritize}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

const rowBase = 'relative flex w-full cursor-pointer items-center gap-2 rounded px-1 text-left';

function FoggedRow({
  slot,
  def,
  name,
  progress,
  active,
  scrambleTick,
  hovered,
  tipText,
  onHover,
  onPrioritize,
}: {
  slot: SearchSlot;
  def: ItemDef;
  name: string;
  progress: number;
  active: boolean;
  scrambleTick: number | null;
  hovered: boolean;
  tipText: string;
  onHover: (slotId: string, e?: React.PointerEvent) => void;
  onPrioritize: (slotId: string) => void;
}) {
  const { shown, frontier, masked } = revealName(name, progress, scrambleTick);
  const started = progress > 0;
  return (
    <button
      type="button"
      {...tip(tipText)}
      onMouseEnter={() => onHover(slot.id)}
      onFocus={() => onHover(slot.id)}
      onClick={() => onPrioritize(slot.id)}
      className={`${rowBase} overflow-hidden border transition-colors ${
        active
          ? 'border-[rgba(143,191,75,0.5)] bg-[#1a1a1e]'
          : hovered
            ? 'border-white/30 bg-[#1a1a1e]'
            : 'border-white/[0.06] bg-[#1a1a1ecc] hover:border-white/20'
      }`}
      style={{ height: ROW_H }}
    >
      {/* Horizontal search bar — transform only, so it stays on the compositor. */}
      <span
        aria-hidden
        className={`search-row-fill pointer-events-none absolute inset-0 origin-left ${
          active ? 'bg-[rgba(143,191,75,0.32)]' : 'bg-[rgba(143,191,75,0.12)]'
        }`}
        style={{ transform: `scaleX(${progress})` }}
      />
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[#8fbf4b]"
          style={{ transform: `scaleX(${progress})` }}
        />
      )}
      <span
        className="search-censor relative z-[1] flex shrink-0 items-center justify-center overflow-hidden rounded"
        style={{
          width: ICON_BOX,
          height: ICON_BOX,
          background: started ? `${tileColor(def)}33` : '#ffffff08',
          ['--censor' as string]: String(1 - progress),
        }}
      >
        <span className="flex" style={censorStyle(progress)}>
          <Icon name={itemIcon(def)} size={ICON_BOX - 8} />
        </span>
      </span>
      <span className="relative z-[1] min-w-0 flex-1 truncate whitespace-pre text-body">
        <span className="text-concrete-50">{shown}</span>
        <span className={active ? 'text-[#a8d466]' : 'text-white/30'}>{frontier}</span>
        <span className="text-white/20">{masked}</span>
      </span>
      {slot.count > 1 && started && progress >= 0.5 ? (
        <span className="relative z-[1] shrink-0 tabular-nums text-micro text-white/40">×{slot.count}</span>
      ) : null}
      <span
        className={`relative z-[1] w-8 shrink-0 text-right tabular-nums text-micro ${
          active ? 'text-[#a8d466]' : 'text-white/25'
        }`}
      >
        {started ? `${Math.floor(progress * 100)}%` : '?'}
      </span>
    </button>
  );
}

function FoundRow({
  slot,
  def,
  name,
  nonce,
  hovered,
  tipText,
  onHover,
  onLeave,
  onTake,
}: {
  slot: SearchSlot;
  def: ItemDef;
  name: string;
  nonce: string;
  hovered: boolean;
  tipText?: string;
  onHover: (slotId: string, e?: React.PointerEvent) => void;
  onLeave: () => void;
  onTake: (uid: string) => void;
}) {
  const highlight = slot.highlight ?? null;
  const condPct =
    slot.condition !== undefined ? Math.max(0, Math.min(100, Math.round(slot.condition))) : null;
  const hex = tileColor(def);
  const totalKg = def.weight * slot.count;
  return (
    <button
      type="button"
      {...tip(tipText)}
      onMouseEnter={() => onHover(slot.id)}
      onPointerEnter={(e) => onHover(slot.id, e)}
      onPointerMove={(e) => onHover(slot.id, e)}
      onPointerLeave={onLeave}
      onFocus={() => onHover(slot.id)}
      onClick={() => {
        if (slot.uid) onTake(slot.uid);
      }}
      className={`${rowBase} search-row-found search-find-fx--force-motion border transition-colors ${
        hovered ? 'brightness-125' : ''
      }`}
      style={{
        height: ROW_H,
        background: `linear-gradient(90deg, ${hex}40, ${hex}14 60%, transparent)`,
        borderColor: highlight === 'exotic' || def.exotic ? 'rgba(252,211,77,0.55)' : `${hex}66`,
      }}
    >
      <SearchFindRevealCell
        def={def}
        highlight={highlight}
        playKey={`${nonce}-${slot.id}-${slot.uid ?? 'pending'}`}
        animate={!!highlight}
        forceMotion
        iconSize={ICON_BOX - 8}
        as="div"
        className="relative z-[1] shrink-0"
        style={{ width: ICON_BOX, height: ICON_BOX }}
      />
      <span className="relative z-[1] min-w-0 flex-1 truncate text-body font-semibold text-concrete-50">
        {name}
      </span>
      {slot.count > 1 && (
        <span className="relative z-[1] shrink-0 tabular-nums text-micro text-signal">×{slot.count}</span>
      )}
      <span className="relative z-[1] shrink-0 text-right tabular-nums text-micro text-white/45">
        {formatKg(totalKg)}
      </span>
      {condPct != null && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-black/50">
          <span
            className="block h-full"
            style={{ width: `${condPct}%`, background: conditionBarColor(condPct) }}
          />
        </span>
      )}
    </button>
  );
}

function formatKg(kg: number): string {
  if (kg < 10) return `${kg.toFixed(kg < 1 ? 2 : 1).replace(/\.?0+$/, '') || '0'} kg`;
  return `${Math.round(kg)} kg`;
}
