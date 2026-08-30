import { useState, type CSSProperties } from 'react';
import { itemDef } from '../game/loot';
import {
  activeScopeKey,
  groupLogEntries,
  scopeIcon,
  sectionLabelKey,
  sectionStats,
  type LogGroup,
} from '../game/logGroup';
import type { GameLogEntry, LogScope } from '../game/types';
import { Icon } from '../icons/Icon';
import { formatClock, type ClockFormat } from '../game/survival';
import { highlightLogText } from './logHighlight';
import { itemIcon } from './Inventory/itemIcon';
import { tip } from './tips';
import { itemName, type LocaleId, type TVars } from '../i18n';

type Translate = (key: string, vars?: TVars) => string;

const toneClass: Record<string, string> = {
  good: 'text-signal',
  bad: 'text-hiss',
  info: 'text-white/60',
};

const dotClass: Record<string, string> = {
  good: 'bg-signal',
  bad: 'bg-hiss',
  info: 'bg-white/30',
};

export function sectionTitle(scope: LogScope, tr: Translate): string {
  const { key, vars } = sectionLabelKey(scope);
  return tr(key, vars);
}

export function useActiveLogScopeKey(ctx: {
  pendingSearch?: { locationId: string; hdbUnit?: { level: number; unitId: string; label: string } } | null;
  pendingEvent?: { locationId: string } | null;
  combat?: {
    context: {
      locationId: string | null;
      hdbUnit?: { level: number; unitId: string };
      tunnel?: { nodeId: string };
      wilds?: boolean;
    };
  } | null;
  hdb?: { locationId: string; floors: { units: { id: string; label: string }[] }[] } | null;
  tunnel?: { id: string; currentId: string; nodes: Record<string, { name: string }> } | null;
  locations?: Record<string, { name: string }>;
  traveling?: boolean;
}): string | null {
  return activeScopeKey({
    pendingSearch: ctx.pendingSearch,
    pendingEvent: ctx.pendingEvent,
    combat: ctx.combat,
    hdb: ctx.hdb,
    tunnel: ctx.tunnel,
    locations: ctx.locations,
    traveling: ctx.traveling,
    tunnelCurrentId: ctx.tunnel?.currentId,
  });
}

export function LogEntryBody({
  e,
  locale,
  clock,
  timeW,
  hang,
  onFocusMap,
  tr,
  compact = false,
}: {
  e: GameLogEntry;
  locale: LocaleId;
  clock: ClockFormat;
  timeW: string;
  hang?: CSSProperties;
  onFocusMap?: (lat: number, lng: number) => void;
  tr: Translate;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      {compact ? (
        <div className={`break-words text-xs leading-snug ${toneClass[e.tone] ?? 'text-white/60'}`}>
          <span className="mr-2 shrink-0 tabular-nums text-2xs text-white/25">
            {formatClock(e.hour, clock)}
          </span>
          {highlightLogText(e.text)}
        </div>
      ) : (
        <p
          style={hang}
          className={`whitespace-normal break-words text-xs leading-snug ${
            toneClass[e.tone] ?? 'text-white/60'
          }`}
        >
          <span
            className="inline-block font-mono text-2xs tabular-nums text-white/25"
            style={{ width: timeW, textIndent: 0 }}
          >
            {formatClock(e.hour, clock)}
          </span>
          {highlightLogText(e.text)}
        </p>
      )}
      {e.focus && onFocusMap && (
        <div style={{ paddingLeft: compact ? 0 : timeW }} className="mt-1">
          <button
            type="button"
            onClick={() => onFocusMap(e.focus!.lat, e.focus!.lng)}
            className="rounded border border-signal/40 bg-signal/10 px-2 py-0.5 text-2xs text-signal hover:bg-signal/20"
          >
            {e.focus.label
              ? tr('ui.log.showOnMapLabel', { label: e.focus.label })
              : tr('ui.log.showOnMap')}
          </button>
        </div>
      )}
      {e.loot && e.loot.length > 0 && (
        <ul
          className="mt-1 flex flex-col gap-px"
          style={compact ? undefined : { paddingLeft: timeW }}
        >
          {e.loot.map((s, i) => {
            const def = itemDef(s.defId);
            return compact ? (
              <li key={i} className="text-xs text-white/40">
                {itemName(s.defId, locale)} ×{s.count}
              </li>
            ) : (
              <li
                key={i}
                className="flex items-center gap-1.5 border-l border-white/15 bg-white/[0.04] px-2 py-0.5 text-xs"
              >
                <Icon name={itemIcon(def)} size={13} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-concrete-200">
                  {itemName(s.defId, locale)}
                </span>
                <span className="shrink-0 tabular-nums text-signal">×{s.count}</span>
              </li>
            );
          })}
        </ul>
      )}
      {e.leftover && e.leftover.length > 0 && (
        <div
          className="mt-1 text-2xs text-hiss"
          style={compact ? undefined : { paddingLeft: timeW }}
        >
          {tr('ui.log.packFull', {
            items: e.leftover
              .map((s) => `${itemName(s.defId, locale)} ×${s.count}`)
              .join(', '),
          })}
        </div>
      )}
    </div>
  );
}

function LogSectionCard({
  group,
  locale,
  clock,
  timeW,
  hang,
  latestId,
  onFocusMap,
  tr,
  activeKey,
  manualClosed,
  onToggle,
}: {
  group: Extract<LogGroup, { type: 'section' }>;
  locale: LocaleId;
  clock: ClockFormat;
  timeW: string;
  hang: CSSProperties;
  latestId: number | null;
  onFocusMap?: (lat: number, lng: number) => void;
  tr: Translate;
  activeKey: string | null;
  manualClosed: Set<string>;
  onToggle: (key: string) => void;
}) {
  const isActive = group.key === activeKey;
  const open = !manualClosed.has(group.key);
  const { bad, hauls } = sectionStats(group.entries);
  const title = sectionTitle(group.scope, tr);

  return (
    <li className="relative py-0.5 pl-6">
      <span className="absolute left-0 top-[10px] h-[11px] w-[11px] rounded-full border-2 border-concrete-900 bg-white/20" />
      {/*
        Container left edge matches flat entry content, so timestamps stay on
        one column. Location title sits in the text column (icon in the time
        gutter) so it lines up with entry copy.
      */}
      <div
        className={`overflow-hidden rounded border ${
          isActive ? 'border-signal/35 bg-white/[0.05]' : 'border-white/10 bg-white/[0.02]'
        }`}
      >
        <button
          type="button"
          onClick={() => onToggle(group.key)}
          {...tip(open ? tr('ui.log.sectionCollapse') : tr('ui.log.sectionExpand'), {
            label: true,
          })}
          className="flex w-full items-center justify-between gap-2 py-1.5 pr-2 text-left transition hover:bg-white/[0.04]"
        >
          <span className="flex min-w-0 items-center text-xs font-semibold text-concrete-100">
            <span
              className="flex shrink-0 items-center justify-center self-stretch text-white/40"
              style={{ width: timeW }}
            >
              <Icon name={scopeIcon(group.scope)} size={13} className="align-middle" />
            </span>
            <span className="truncate">{title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-2xs text-white/35">
            <span>
              {group.entries.length === 1
                ? tr('ui.log.entry', { n: group.entries.length })
                : tr('ui.log.entries', { n: group.entries.length })}
            </span>
            {hauls > 0 && (
              <span className="text-signal/60">{tr('ui.log.hauls', { n: hauls })}</span>
            )}
            {bad > 0 && <span className="text-hiss/70">{tr('ui.log.bad', { n: bad })}</span>}
            <span className="text-white/25">{open ? '▾' : '▸'}</span>
          </span>
        </button>

        {open && (
          <ol className="flex flex-col border-t border-white/10 pb-1">
            {group.entries.map((e) => {
              const isLatest = e.id === latestId;
              return (
                <li
                  key={e.id}
                  className={`py-1 pr-2 ${isLatest ? 'rounded bg-white/[0.07]' : ''}`}
                >
                  <LogEntryBody
                    e={e}
                    locale={locale}
                    clock={clock}
                    timeW={timeW}
                    hang={hang}
                    onFocusMap={onFocusMap}
                    tr={tr}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </li>
  );
}

function CompactLogSection({
  group,
  locale,
  clock,
  timeW,
  tr,
}: {
  group: Extract<LogGroup, { type: 'section' }>;
  locale: LocaleId;
  clock: ClockFormat;
  timeW: string;
  tr: Translate;
}) {
  const [open, setOpen] = useState(true);
  const { bad, hauls } = sectionStats(group.entries);
  const title = sectionTitle(group.scope, tr);

  return (
    <li className="overflow-hidden rounded border border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 py-1.5 pr-2 text-left text-xs hover:bg-white/[0.04]"
      >
        <span className="flex min-w-0 items-center font-semibold">
          <span
            className="flex shrink-0 items-center justify-center self-stretch text-white/40"
            style={{ width: timeW }}
          >
            <Icon name={scopeIcon(group.scope)} size={12} className="align-middle" />
          </span>
          <span className="truncate">{title}</span>
        </span>
        <span className="shrink-0 text-2xs text-white/35">
          {group.entries.length}
          {hauls > 0 ? ` · ${hauls}` : ''}
          {bad > 0 ? ` · ${bad}` : ''} {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <ol className="flex flex-col gap-1 border-t border-white/10 py-1.5 pr-2">
          {group.entries.map((e) => (
            <li key={e.id}>
              <LogEntryBody
                e={e}
                locale={locale}
                clock={clock}
                timeW={timeW}
                tr={tr}
                compact
              />
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export function GroupedLogList({
  entries,
  locale,
  clock,
  timeW,
  hang,
  latestId,
  onFocusMap,
  tr,
  activeKey,
  compact = false,
}: {
  entries: GameLogEntry[];
  locale: LocaleId;
  clock: ClockFormat;
  timeW: string;
  hang: CSSProperties;
  latestId: number | null;
  onFocusMap?: (lat: number, lng: number) => void;
  tr: Translate;
  activeKey: string | null;
  compact?: boolean;
}) {
  const [manualClosed, setManualClosed] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) => {
    setManualClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groups = groupLogEntries(entries);

  if (compact) {
    return (
      <ol className="flex flex-col gap-1.5">
        {groups.map((g) =>
          g.type === 'flat' ? (
            <li key={g.entry.id} className="flex gap-2">
              <LogEntryBody
                e={g.entry}
                locale={locale}
                clock={clock}
                timeW={timeW}
                tr={tr}
                compact
              />
            </li>
          ) : (
            <CompactLogSection
              key={g.key}
              group={g}
              locale={locale}
              clock={clock}
              timeW={timeW}
              tr={tr}
            />
          ),
        )}
      </ol>
    );
  }

  return (
    <>
      {groups.map((g) =>
        g.type === 'flat' ? (
          <li
            key={g.entry.id}
            className={`relative flex gap-2 py-1 pl-6 ${
              g.entry.id === latestId ? 'rounded bg-white/[0.07]' : ''
            }`}
          >
            <span
              className={`absolute left-0 top-[7px] h-[11px] w-[11px] rounded-full border-2 border-concrete-900 ${
                dotClass[g.entry.tone] ?? 'bg-white/30'
              } ${g.entry.id === latestId ? 'ring-2 ring-signal/60' : ''}`}
            />
            <LogEntryBody
              e={g.entry}
              locale={locale}
              clock={clock}
              timeW={timeW}
              hang={hang}
              onFocusMap={onFocusMap}
              tr={tr}
            />
          </li>
        ) : (
          <LogSectionCard
            key={g.key}
            group={g}
            locale={locale}
            clock={clock}
            timeW={timeW}
            hang={hang}
            latestId={latestId}
            onFocusMap={onFocusMap}
            tr={tr}
            activeKey={activeKey}
            manualClosed={manualClosed}
            onToggle={toggle}
          />
        ),
      )}
    </>
  );
}
