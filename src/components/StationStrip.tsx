import { useLayoutEffect, useRef } from 'react';
import {
  codeOnLine,
  type JourneyHop,
  type JourneyStop,
  type JourneyStrip,
} from '../game/mrt';
import type { CrawlPlace } from '../game/tunnelRun';

type StopKind = 'past' | 'here' | 'next' | 'future';

function stopKind(i: number, place: CrawlPlace): StopKind {
  if (place.atPlatform) {
    if (i < place.index) return 'past';
    if (i === place.index) return 'here';
    if (i === place.nextIndex) return 'next';
    return 'future';
  }
  if (i <= place.index) return 'past';
  if (i === place.nextIndex) return 'next';
  return 'future';
}

function hopForStop(hops: JourneyHop[], i: number): JourneyHop | undefined {
  return hops[i - 1] ?? hops[i];
}

interface PidsCopy {
  kicker: string;
  title: string;
  lineName: string;
  lineColor: string;
  detail?: string;
}

/** In-train PIDS line: next stop, change, or alighting. */
function pidsCopy(strip: JourneyStrip, place: CrawlPlace): PidsCopy {
  const { stops, hops } = strip;
  const last = hops[hops.length - 1];
  const here = stops[place.index];
  const next = place.nextIndex != null ? stops[place.nextIndex] : null;
  const walking = !place.atPlatform ? hops[place.index] : null;
  const departing = place.nextIndex != null ? hops[place.index] : last;

  if (place.atPlatform && place.nextIndex == null) {
    return {
      kicker: 'Arrived',
      title: here?.name ?? '',
      lineName: last?.lineName ?? '',
      lineColor: last?.color ?? '#9c9890',
    };
  }

  if (place.atPlatform && here?.isTransfer && departing) {
    return {
      kicker: 'Change to',
      title: departing.lineName,
      lineName: departing.lineName,
      lineColor: departing.color,
      detail: `Now: ${here.name}`,
    };
  }

  if (place.atPlatform && next && departing) {
    const change = next.isTransfer ? `Change at ${next.name}` : `Next: ${next.name}`;
    return {
      kicker: 'Now',
      title: here?.name ?? '',
      lineName: departing.lineName,
      lineColor: departing.color,
      detail: change,
    };
  }

  if (walking && next) {
    const dest = place.nextIndex === stops.length - 1;
    if (dest) {
      return {
        kicker: 'Alighting',
        title: next.name,
        lineName: walking.lineName,
        lineColor: walking.color,
      };
    }
    if (next.isTransfer) {
      const after = hops[place.nextIndex!];
      return {
        kicker: 'Change at',
        title: next.name,
        lineName: walking.lineName,
        lineColor: walking.color,
        detail: after ? `to ${after.lineName}` : undefined,
      };
    }
    return {
      kicker: 'Next',
      title: next.name,
      lineName: walking.lineName,
      lineColor: walking.color,
    };
  }

  return {
    kicker: 'Now',
    title: here?.name ?? '',
    lineName: last?.lineName ?? '',
    lineColor: last?.color ?? '#9c9890',
  };
}

function stopsLeft(place: CrawlPlace, stopCount: number): number {
  if (place.nextIndex == null) return 0;
  return Math.max(0, stopCount - 1 - place.index);
}

function namedStop(stop: JourneyStop, kind: StopKind, last: boolean): boolean {
  return kind === 'here' || kind === 'next' || stop.isTransfer || last;
}

/** Sticky PIDS chrome: next/change/alight copy plus the schematic strip. */
export function CrawlPids({
  strip,
  place,
  meters,
}: {
  strip: JourneyStrip;
  place: CrawlPlace;
  meters: number;
}) {
  const pids = pidsCopy(strip, place);
  const remaining = stopsLeft(place, strip.stops.length);
  return (
    <div className="sticky top-0 z-10 shrink-0 border-b border-concrete-600 bg-concrete-800">
      <div className="flex items-start justify-between gap-3 px-3 pt-2.5 lg:px-4">
        <div className="min-w-0">
          <div className="signage text-2xs text-signal">{pids.kicker}</div>
          <div className="truncate text-sm font-semibold leading-tight text-concrete-50">
            {pids.title}
          </div>
          <div className="truncate text-2xs text-concrete-400">
            {pids.lineName}
            {pids.detail ? ` · ${pids.detail}` : ''}
            {remaining > 0 ? ` · ${remaining} stop${remaining === 1 ? '' : 's'} left` : ''}
          </div>
        </div>
        <div className="shrink-0 pt-1 text-right">
          <div className="h-1 w-16 rounded-full" style={{ background: pids.lineColor }} />
          <div className="mt-1 text-2xs tabular-nums text-concrete-400">
            {meters} m · no weather
          </div>
        </div>
      </div>
      <StationStrip strip={strip} place={place} />
    </div>
  );
}

/**
 * Schematic beads for this crawl only — official liveries, codes on every
 * stop, names on here / next / transfer / destination so a 20-stop ride fits.
 */
export function StationStrip({
  strip,
  place,
}: {
  strip: JourneyStrip;
  place: CrawlPlace;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const focusIndex = place.atPlatform ? place.index : (place.nextIndex ?? place.index);
  const lastI = strip.stops.length - 1;

  useLayoutEffect(() => {
    const el = focusRef.current;
    const root = scroller.current;
    if (!el || !root) return;
    const bead = el.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    root.scrollLeft += bead.left + bead.width / 2 - (box.left + box.width / 2);
  }, [focusIndex, place.atPlatform]);

  return (
    <div
      ref={scroller}
      className="overflow-x-auto px-3 pb-2 pt-1 [scrollbar-width:thin]"
      aria-label="Planned stations"
    >
      <div className="flex min-w-min items-start">
        {strip.stops.map((stop, i) => {
          const kind = stopKind(i, place);
          const hop = hopForStop(strip.hops, i);
          const code = codeOnLine(stop, hop?.lineCode ?? '');
          const interchange = stop.codes.length > 1;
          const showName = namedStop(stop, kind, i === lastI);
          return (
            <div key={stop.id} className="flex items-start">
              {i > 0 && (
                <div className="flex flex-col">
                  <div className="h-7" aria-hidden />
                  <div className="flex h-3.5 items-center">
                    <HopBar
                      hop={strip.hops[i - 1]}
                      past={stopKind(i - 1, place) === 'past' && kind === 'past'}
                      walking={!place.atPlatform && i - 1 === place.index}
                    />
                  </div>
                </div>
              )}
              <div
                ref={i === focusIndex ? focusRef : undefined}
                className="flex w-11 shrink-0 flex-col items-center lg:w-12"
              >
                <div className="mb-0.5 h-7 w-full px-0.5">
                  {showName && (
                    <div
                      className={`truncate text-center text-2xs leading-tight ${
                        kind === 'here'
                          ? 'font-semibold text-concrete-50'
                          : kind === 'next'
                            ? 'text-signal'
                            : 'text-concrete-400'
                      }`}
                      title={stop.name}
                    >
                      {stop.name}
                    </div>
                  )}
                </div>
                <div className="flex h-3.5 items-center">
                  <Bead
                    color={hop?.color ?? '#9c9890'}
                    kind={kind}
                    interchange={interchange}
                    transfer={stop.isTransfer}
                  />
                </div>
                <div
                  className={`mt-0.5 font-mono text-2xs leading-none ${
                    kind === 'past' ? 'text-concrete-400/50' : 'text-concrete-200'
                  }`}
                >
                  {code}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HopBar({
  hop,
  past,
  walking,
}: {
  hop: JourneyHop | undefined;
  past: boolean;
  walking: boolean;
}) {
  return (
    <div
      className={`min-w-[14px] flex-1 rounded-full lg:min-w-[22px] ${walking ? 'h-1.5' : 'h-1'}`}
      style={{
        background: hop?.color ?? '#9c9890',
        opacity: walking ? 1 : past ? 0.28 : 0.8,
      }}
      aria-hidden
    />
  );
}

function Bead({
  color,
  kind,
  interchange,
  transfer,
}: {
  color: string;
  kind: StopKind;
  interchange: boolean;
  transfer: boolean;
}) {
  const size = kind === 'here' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5';
  const ring =
    kind === 'here' ? 'ring-2 ring-astral/80' : kind === 'next' ? 'ring-1 ring-signal/70' : '';
  const fill = interchange ? '#e8e5dd' : color;
  return (
    <span
      className={`relative inline-block rounded-full border-2 border-[#08080a] ${size} ${ring} ${
        kind === 'past' ? 'opacity-40' : ''
      }`}
      style={{ background: fill }}
      title={transfer ? 'Change here' : undefined}
    >
      {transfer && (
        <span
          className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full border border-[#08080a] bg-signal"
          aria-hidden
        />
      )}
    </span>
  );
}
