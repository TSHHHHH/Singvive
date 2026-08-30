import type { GameLogEntry, LogScope } from './types';

export type LogGroup =
  | { type: 'flat'; entry: GameLogEntry }
  | { type: 'section'; scope: LogScope; entries: GameLogEntry[]; key: string };

/** Stable grouping key for consecutive entries sharing a scope. */
export function scopeKey(scope: LogScope): string {
  switch (scope.kind) {
    case 'hdb_block':
      return `hdb_block:${scope.blockId}`;
    case 'hdb_floor':
      return `hdb_floor:${scope.blockId}:L${scope.level}`;
    case 'hdb_unit':
      return `hdb_unit:${scope.blockId}:${scope.unitId}`;
    case 'tunnel_run':
      return `tunnel_run:${scope.runId}`;
    case 'tunnel_node':
      return `tunnel_node:${scope.runId}:${scope.nodeId}`;
    case 'site':
      return `site:${scope.locationId}`;
  }
}

/**
 * Merge entries that share a place into one collapsible section.
 *
 * Unscoped lines (consume, skill-check aftermath, ambient) stay inside the
 * visit when the next scoped line is still that place — or when nothing else
 * has been scoped yet (still standing there). They stay on the spine when the
 * next scoped line is a different place, so travel between sites does not get
 * swallowed.
 */
export function groupLogEntries(entries: GameLogEntry[]): LogGroup[] {
  const n = entries.length;
  const nextScoped: (string | null)[] = new Array(n);
  let ahead: string | null = null;
  for (let i = n - 1; i >= 0; i--) {
    nextScoped[i] = ahead;
    const scope = entries[i]?.scope;
    if (scope) ahead = scopeKey(scope);
  }

  const out: LogGroup[] = [];
  for (let i = 0; i < n; i++) {
    const entry = entries[i]!;
    const last = out[out.length - 1];
    if (!entry.scope) {
      if (last?.type === 'section') {
        const nxt = nextScoped[i];
        if (nxt === null || nxt === last.key) {
          last.entries.push(entry);
          continue;
        }
      }
      out.push({ type: 'flat', entry });
      continue;
    }
    const key = scopeKey(entry.scope);
    if (last?.type === 'section' && last.key === key) {
      last.entries.push(entry);
    } else {
      out.push({ type: 'section', scope: entry.scope, entries: [entry], key });
    }
  }
  return out;
}

/** Section header icon name for the timeline UI. */
export function scopeIcon(
  scope: LogScope,
): 'hdb.unit' | 'hdb.enterBlock' | 'tunnel.platform' | 'action.map' {
  switch (scope.kind) {
    case 'hdb_unit':
      return 'hdb.unit';
    case 'hdb_block':
    case 'hdb_floor':
      return 'hdb.enterBlock';
    case 'tunnel_run':
    case 'tunnel_node':
      return 'tunnel.platform';
    case 'site':
      return 'action.map';
  }
}

/** i18n key + vars for a section header label. */
export function sectionLabelKey(
  scope: LogScope,
): { key: string; vars: Record<string, string | number> } {
  switch (scope.kind) {
    case 'hdb_block':
      return { key: 'ui.log.sectionBlock', vars: { name: scope.label } };
    case 'hdb_floor':
      return {
        key: 'ui.log.sectionCorridor',
        vars: { level: String(scope.level).padStart(2, '0') },
      };
    case 'hdb_unit':
      return { key: 'ui.log.sectionUnit', vars: { label: scope.label } };
    case 'tunnel_run':
      return { key: 'ui.log.sectionTunnelRun', vars: { label: scope.label } };
    case 'tunnel_node':
      return { key: 'ui.log.sectionTunnelNode', vars: { label: scope.label } };
    case 'site':
      return { key: 'ui.log.sectionSite', vars: { name: scope.label } };
  }
}

export function hdbBlockScope(blockId: string, label: string): LogScope {
  return { kind: 'hdb_block', blockId, label };
}

export function hdbFloorScope(blockId: string, level: number): LogScope {
  return { kind: 'hdb_floor', blockId, level };
}

export function hdbUnitScope(
  blockId: string,
  level: number,
  unitId: string,
  label: string,
): LogScope {
  return { kind: 'hdb_unit', blockId, level, unitId, label };
}

export function tunnelRunScope(runId: string, label: string): LogScope {
  return { kind: 'tunnel_run', runId, label };
}

export function tunnelNodeScope(runId: string, nodeId: string, label: string): LogScope {
  return { kind: 'tunnel_node', runId, nodeId, label };
}

export function siteScope(locationId: string, label: string): LogScope {
  return { kind: 'site', locationId, label };
}

/** Count bad-tone lines and loot rows inside a section. */
export function sectionStats(entries: GameLogEntry[]): { bad: number; hauls: number } {
  let bad = 0;
  let hauls = 0;
  for (const e of entries) {
    if (e.tone === 'bad') bad += 1;
    hauls += e.loot?.length ?? 0;
  }
  return { bad, hauls };
}

export interface LogScopeContext {
  pendingSearch?: {
    locationId: string;
    hdbUnit?: { level: number; unitId: string; label: string };
  } | null;
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
  tunnel?: { id: string; nodes: Record<string, { name: string }> } | null;
  locations?: Record<string, { name: string }>;
  /** When true, outdoor site scope is suppressed (road / trek travel lines stay flat). */
  traveling?: boolean;
}

function siteScopeFrom(
  ctx: LogScopeContext,
  locationId: string,
): LogScope | undefined {
  const loc = ctx.locations?.[locationId];
  return loc ? siteScope(locationId, loc.name) : undefined;
}

/**
 * Tag when a live search, event, or fight anchors the moment at a place.
 * Ambient survival and travel lines stay unscoped.
 */
export function inferLogScope(ctx: LogScopeContext): LogScope | undefined {
  if (ctx.traveling) return undefined;

  const hu = ctx.pendingSearch?.hdbUnit;
  if (hu && ctx.hdb) {
    return hdbUnitScope(ctx.hdb.locationId, hu.level, hu.unitId, hu.label);
  }

  const psLoc = ctx.pendingSearch?.locationId;
  if (psLoc && !ctx.pendingSearch?.hdbUnit) {
    const site = siteScopeFrom(ctx, psLoc);
    if (site) return site;
  }

  const peLoc = ctx.pendingEvent?.locationId;
  if (peLoc) {
    const site = siteScopeFrom(ctx, peLoc);
    if (site) return site;
  }

  const cu = ctx.combat?.context.hdbUnit;
  if (cu && ctx.hdb) {
    const unit = ctx.hdb.floors[cu.level - 1]?.units.find((u) => u.id === cu.unitId);
    return hdbUnitScope(
      ctx.hdb.locationId,
      cu.level,
      cu.unitId,
      unit?.label ?? cu.unitId,
    );
  }
  const tn = ctx.combat?.context.tunnel;
  if (tn && ctx.tunnel) {
    const node = ctx.tunnel.nodes[tn.nodeId];
    return tunnelNodeScope(ctx.tunnel.id, tn.nodeId, node?.name ?? tn.nodeId);
  }

  const c = ctx.combat?.context;
  if (c?.locationId && !c.hdbUnit && !c.tunnel && !c.wilds) {
    return siteScopeFrom(ctx, c.locationId);
  }

  return undefined;
}

/** Scope key for the section highlighted during live play. */
export function activeScopeKey(ctx: LogScopeContext & { tunnelCurrentId?: string }): string | null {
  const inferred = inferLogScope(ctx);
  if (inferred) return scopeKey(inferred);

  if (ctx.tunnel && ctx.tunnelCurrentId) {
    const node = ctx.tunnel.nodes[ctx.tunnelCurrentId];
    return scopeKey(
      tunnelNodeScope(ctx.tunnel.id, ctx.tunnelCurrentId, node?.name ?? ctx.tunnelCurrentId),
    );
  }
  return null;
}
