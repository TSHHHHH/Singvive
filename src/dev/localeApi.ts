import type { MessageTree } from '../i18n';

export type LocaleFileId = 'en' | 'zh-Hans';

/** Query-string form — path segments with hyphens can fall through to SPA HTML. */
function localeUrl(id: LocaleFileId): string {
  return `/__dev/locale?id=${encodeURIComponent(id)}`;
}

export async function fetchLocaleCatalog(id: LocaleFileId): Promise<MessageTree> {
  const res = await fetch(localeUrl(id));
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to load locale ${id} (${res.status})`);
  }
  if (text.trimStart().startsWith('<')) {
    throw new Error(
      `Locale API returned HTML instead of JSON — restart the Vite dev server so /__dev/locale is registered.`,
    );
  }
  return JSON.parse(text) as MessageTree;
}

export async function saveLocaleCatalog(id: LocaleFileId, tree: MessageTree): Promise<void> {
  const res = await fetch(localeUrl(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tree),
  });
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(
      `Locale API returned HTML instead of JSON — restart the Vite dev server so /__dev/locale is registered.`,
    );
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* keep status */
    }
    throw new Error(detail);
  }
}
