import type { LocaleId, MessageNode, MessageTree } from './types';
import { DEFAULT_LOCALE, isLocaleId } from './types';
import en from './messages/en.json' with { type: 'json' };
import zhHans from './messages/zh-Hans.json' with { type: 'json' };

const CATALOGS: Record<LocaleId, MessageTree> = {
  en: en as MessageTree,
  'zh-Hans': zhHans as MessageTree,
};

/** Mutable overlay for DEV locale editor (zh-Hans only until saved). */
let zhOverlay: MessageTree | null = null;

export function getCatalog(locale: LocaleId): MessageTree {
  if (locale === 'zh-Hans' && zhOverlay) return zhOverlay;
  return CATALOGS[locale] ?? CATALOGS.en;
}

export function getEnglishCatalog(): MessageTree {
  return CATALOGS.en;
}

/** Snapshot of the bundled zh-Hans overlay (for the DEV locale editor). */
export function getZhHansCatalog(): MessageTree {
  return structuredClone(CATALOGS['zh-Hans']) as MessageTree;
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
    raw = asString(lookupNode(CATALOGS.en, key));
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
