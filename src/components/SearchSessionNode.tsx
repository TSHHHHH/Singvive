import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { itemDef } from '../game/loot';
import { SEARCH_DIMS, footprint } from '../game/inventory';
import { searchProgress, hasFoggedOrSearching } from '../game/searchSession';
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

  if (!session) return null;

  const dims = SEARCH_DIMS;
  const progress = searchProgress(session, now);
  const searchingId = session.queue[0] ?? null;
  const stillSearching = hasFoggedOrSearching(session);
  const foundCount = session.slots.filter((s) => s.state === 'found').length;

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
            {stillSearching ? 'Searching' : 'Search complete'}
          </span>
          {session.lastWhisper ? ` — ${session.lastWhisper}` : null}
        </p>

        <div className="mt-1.5" style={{ paddingLeft: timeW }}>
          <div
            className="relative overflow-hidden rounded border border-white/10 bg-black/40"
            style={{
              width: dims.w * CELL,
              height: dims.h * CELL,
              maxWidth: '100%',
              backgroundImage:
                'linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px)',
              backgroundSize: `${CELL}px ${CELL}px`,
            }}
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
                  onClick={() => {
                    if (isFogged) prioritizeSearchSlot(slot.id);
                    else if (slot.state === 'found' && slot.uid) takeSearchItem(slot.uid);
                  }}
                  className={`absolute flex flex-col items-center justify-center rounded text-center transition ${ring} ${
                    isFogged ? 'cursor-pointer hover:brightness-125' : 'cursor-pointer hover:ring-signal'
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
