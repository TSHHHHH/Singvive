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

const CELL = 26;

/**
 * Live sequential-search node at the foot of the timeline — fogged stash grid,
 * hybrid auto-reveal + click-to-prioritize, take / done / leave controls.
 */
export function SearchSessionNode({
  timeW,
  hang,
}: {
  timeW: string;
  hang: { paddingLeft: string; textIndent: string };
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
  const [now, setNow] = useState(() => Date.now());
  const [hoverSlotId, setHoverSlotId] = useState<string | null>(null);
  const raf = useRef(0);

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

  return (
    <li className="relative flex gap-2 rounded bg-white/[0.07] py-1 pl-6">
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
          <span className="font-semibold text-concrete-50">
            {stillSearching
              ? session.hdbUnit
                ? `Searching ${session.hdbUnit.label}`
                : 'Searching'
              : 'Search complete'}
          </span>
          {session.lastWhisper ? ` — ${session.lastWhisper}` : null}
        </p>

        <div className="mt-1.5" style={{ paddingLeft: timeW }}>
          <div className="flex items-stretch gap-2">
            <div
              className="relative shrink-0 overflow-hidden rounded border border-white/10 bg-black/40"
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
                const highlight = slot.state === 'found' ? slot.highlight : null;
                const ring =
                  highlight === 'exotic'
                    ? 'ring-2 ring-amber-300 search-find-pulse'
                    : highlight === 'pristine'
                      ? 'ring-2 ring-signal search-find-pulse'
                      : highlight === 'scarce'
                        ? 'ring-2 ring-white/70 search-find-pulse'
                        : hoverSlotId === slot.id
                          ? 'ring-2 ring-white/50'
                          : def.exotic
                            ? 'ring-1 ring-amber-300/50'
                            : 'ring-1 ring-black/40';
                const condPct =
                  slot.condition !== undefined
                    ? Math.max(0, Math.min(100, Math.round(slot.condition)))
                    : null;

                return (
                  <button
                    key={slot.id}
                    type="button"
                    title={isFogged ? 'Click to search this next' : def.name}
                    onMouseEnter={() => setHoverSlotId(slot.id)}
                    onFocus={() => setHoverSlotId(slot.id)}
                    onClick={() => {
                      if (isFogged) prioritizeSearchSlot(slot.id);
                      else if (slot.state === 'found' && slot.uid) takeSearchItem(slot.uid);
                    }}
                    className={`absolute flex flex-col items-center justify-center rounded text-center transition ${ring} ${
                      isFogged
                        ? 'cursor-pointer hover:brightness-125'
                        : 'cursor-pointer hover:ring-signal'
                    }`}
                    style={{
                      left: slot.x * CELL + 1,
                      top: slot.y * CELL + 1,
                      width: w * CELL - 2,
                      height: h * CELL - 2,
                      background: isFogged ? '#1a1a1ecc' : `${def.color}66`,
                      boxShadow: isFogged ? undefined : `inset 0 0 0 1px ${def.color}`,
                      zIndex: isSearching ? 8 : 5,
                    }}
                  >
                    {isFogged ? (
                      <>
                        <span className="text-sm text-white/25">?</span>
                        {isSearching && (
                          <span
                            className="pointer-events-none absolute inset-1 rounded border border-signal/40"
                            style={{
                              background: `linear-gradient(to top, rgba(143,191,75,0.35) ${progress * 100}%, transparent ${progress * 100}%)`,
                            }}
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <Icon
                          name={itemIcon(def)}
                          size={Math.min(w, h) > 1 ? 18 : 14}
                          className="drop-shadow"
                        />
                        {slot.count > 1 && (
                          <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-0.5 text-2xs font-black leading-tight text-white">
                            ×{slot.count}
                          </span>
                        )}
                        {condPct != null && (
                          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-black/50">
                            <span
                              className="block h-full"
                              style={{
                                width: `${condPct}%`,
                                background: '#8fbf4b',
                              }}
                            />
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <SearchHoverPanel slot={hovered} gridH={dims.h * CELL} />
          </div>

          <div className="mt-1.5 flex flex-col gap-1">
            {foundCount > 0 && (
              <button
                type="button"
                onClick={() => takeAllFound()}
                className="flex w-full items-center gap-1.5 rounded border border-signal/40 px-2 py-1 text-left text-xs text-signal transition hover:bg-signal/10"
              >
                <Icon name="action.stash" size={13} className="shrink-0" />
                Take all found ({foundCount})
              </button>
            )}
            {stillSearching ? (
              <button
                type="button"
                onClick={() => abortSearch()}
                className="flex w-full items-center gap-1.5 rounded border border-white/15 px-2 py-1 text-left text-xs text-white/60 transition hover:bg-white/5"
              >
                <Icon name="choice.leave" size={13} className="shrink-0" />
                Leave (keep finds, partial search)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => completeSearch()}
                className="flex w-full items-center gap-1.5 rounded border border-signal/40 px-2 py-1 text-left text-xs font-semibold text-signal transition hover:bg-signal/10"
              >
                <Icon name="choice.check" size={13} className="shrink-0" />
                Done
              </button>
            )}
          </div>
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
  return (
    <div
      className="min-w-0 flex-1 overflow-hidden rounded border border-white/10 bg-black/30 px-2 py-1.5"
      style={{ minHeight: gridH }}
    >
      {!slot ? (
        <p className="text-2xs leading-snug text-white/30">Hover a cell for details.</p>
      ) : slot.state === 'fogged' || slot.state === 'searching' ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-white/50">Unknown</div>
          <p className="text-2xs leading-snug text-white/35">
            Still buried. Click to search this next.
          </p>
          <p className="text-2xs text-white/25">
            Footprint {slotFootprintLabel(slot)}
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
          <div className="text-2xs uppercase tracking-wide text-white/35">
            {itemKindLabel(def)}
          </div>
        </div>
      </div>
      <ul className="space-y-0.5">
        {lines.map((line) => (
          <li
            key={line}
            className="text-2xs leading-snug text-white/55"
          >
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
