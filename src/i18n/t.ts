import type { LocaleId, MessageNode, MessageTree } from './types';
import { DEFAULT_LOCALE, isLocaleId } from './types';
import en from './messages/en.json' with { type: 'json' };

/**
 * English is bundled: it is the universal fallback, and `t()` has to resolve
 * synchronously. Every other locale is fetched on demand.
 *
 * Importing all catalogs statically put both files (~141 KB of JSON) in the
 * entry chunk for every player regardless of language, and made each new locale
 * a download tax on people who would never read it. Because `t()` already
 * falls through to English for any missing key, a not-yet-loaded catalog
 * degrades to English rather than breaking.
 */
const EN = en as MessageTree;

const LOADERS: Partial<Record<LocaleId, () => Promise<{ default: unknown }>>> = {
  'zh-Hans': () => import('./messages/zh-Hans.json'),
};

const CATALOGS: Partial<Record<LocaleId, MessageTree>> = { en: EN };

/** Mutable overlay for DEV locale editor (zh-Hans only until saved). */
let zhOverlay: MessageTree | null = null;

/**
 * Bumped when a catalog arrives, so `useT` can re-render the tree once a
 * lazily-loaded locale is actually available.
 */
let catalogVersion = 0;
const listeners = new Set<() => void>();
const inflight = new Map<LocaleId, Promise<void>>();

export function localeVersion(): number {
  return catalogVersion;
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function announce(): void {
  catalogVersion += 1;
  for (const fn of listeners) fn();
}

/** Load a locale's catalog if it is not bundled and not already loaded. */
export function ensureLocale(locale: LocaleId): Promise<void> {
  if (CATALOGS[locale]) return Promise.resolve();
  const existing = inflight.get(locale);
  if (existing) return existing;
  const loader = LOADERS[locale];
  if (!loader) return Promise.resolve();
  const task = loader()
    .then((mod) => {
      CATALOGS[locale] = mod.default as MessageTree;
      announce();
    })
    .catch(() => {
      /* stay on English — a failed catalog must not break the UI */
    })
    .finally(() => {
      inflight.delete(locale);
    });
  inflight.set(locale, task);
  return task;
}

export function getCatalog(locale: LocaleId): MessageTree {
  if (locale === 'zh-Hans' && zhOverlay) return zhOverlay;
  return CATALOGS[locale] ?? EN;
}

export function getEnglishCatalog(): MessageTree {
  return EN;
}

/** Snapshot of the zh-Hans catalog (for the DEV locale editor). */
export async function getZhHansCatalog(): Promise<MessageTree> {
  await ensureLocale('zh-Hans');
  return structuredClone(CATALOGS['zh-Hans'] ?? EN) as MessageTree;
}

/** DEV: preview unsaved zh-Hans edits without writing disk. */
export function setZhHansOverlay(tree: MessageTree | null): void {
  zhOverlay = tree;
}

export function lookupNode(tree: MessageTree, path: string): MessageNode | undefined {
  const parts = path.split('.').filter(Boolean);
  let cur: MessageNode | undefined = tree;
  for (const part of parts) {
    if (cur == null || typeof cur === 'string' || Array.isArray(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function asString(node: MessageNode | undefined): string | undefined {
  return typeof node === 'string' && node.length > 0 ? node : undefined;
}

export type TVars = Record<string, string | number>;

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/#\{(\w+)\}|\{(\w+)\}/g, (match, hashKey, braceKey) => {
    const key = (hashKey as string | undefined) ?? (braceKey as string | undefined);
    if (!key || !(key in vars)) return match;
    return String(vars[key]);
  });
}

/**
 * Resolve a message key. English is source of truth and always the fallback.
 * Empty / missing zh-Hans entries fall through to English.
 */
export function t(key: string, vars?: TVars, locale: LocaleId = DEFAULT_LOCALE): string {
  const lang = isLocaleId(locale) ? locale : DEFAULT_LOCALE;
  let raw: string | undefined;
  if (lang !== 'en') {
    raw = asString(lookupNode(getCatalog(lang), key));
  }
  if (raw == null) {
    raw = asString(lookupNode(EN, key));
  }
  if (raw == null) return key;
  return interpolate(raw, vars);
}

/** Guide bullets and other string lists. Falls back to English list. */
export function tList(key: string, locale: LocaleId = DEFAULT_LOCALE): string[] {
  const lang = isLocaleId(locale) ? locale : DEFAULT_LOCALE;
  const pick = (loc: LocaleId): string[] | undefined => {
    const node = lookupNode(getCatalog(loc), key);
    if (!Array.isArray(node)) return undefined;
    const list = node.filter((x): x is string => typeof x === 'string');
    return list.length > 0 ? list : undefined;
  };
  if (lang !== 'en') {
    const list = pick(lang);
    if (list) return list;
  }
  return pick('en') ?? [];
}

/** Flatten nested catalogs to `{ key, value }[]` for the locale editor. */
export function flattenMessages(
  tree: MessageTree,
  prefix = '',
): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      out.push({ key: path, value: v });
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'string') out.push({ key: `${path}.${i}`, value: item });
      });
    } else {
      out.push(...flattenMessages(v, path));
    }
  }
  return out;
}

/** Set a leaf string in a deep-cloned tree (creates intermediate objects). */
export function setMessageLeaf(tree: MessageTree, path: string, value: string): MessageTree {
  const parts = path.split('.').filter(Boolean);
  const root = structuredClone(tree) as MessageTree;
  let cur: Record<string, MessageNode> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    const nextPart = parts[i + 1]!;
    const wantArray = /^\d+$/.test(nextPart);
    if (next == null || typeof next === 'string') {
      cur[p] = wantArray ? [] : {};
    } else if (Array.isArray(next) && !wantArray) {
      cur[p] = {};
    } else if (!Array.isArray(next) && wantArray) {
      cur[p] = [];
    }
    const child = cur[p]!;
    if (Array.isArray(child)) {
      cur = child as unknown as Record<string, MessageNode>;
    } else {
      cur = child as Record<string, MessageNode>;
    }
  }
  const leaf = parts[parts.length - 1]!;
  if (/^\d+$/.test(leaf) && Array.isArray(cur)) {
    (cur as unknown as string[])[Number(leaf)] = value;
  } else {
    (cur as Record<string, MessageNode>)[leaf] = value;
  }
  return root;
}
