import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateItemsCatalog } from './src/dev/validateItems.ts';
import { validateLootTablesCatalog } from './src/dev/validateLootTables.ts';
import { validateEnemiesCatalog } from './src/dev/validateEnemies.ts';
import { validateItemTileColors } from './src/dev/validateItemTileColors.ts';
import {
  normalizeRecipesCatalog,
  validateRecipesCatalog,
  type RecipesCatalog,
} from './src/dev/validateRecipes.ts';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ITEMS_PATH = path.join(ROOT, 'src/game/data/items.json');
const ITEM_TILE_COLORS_PATH = path.join(ROOT, 'src/game/data/itemTileColors.json');
const LOOT_TABLES_PATH = path.join(ROOT, 'src/game/data/lootTables.json');
const RECIPES_PATH = path.join(ROOT, 'src/game/data/recipes.json');
const ENEMIES_PATH = path.join(ROOT, 'src/game/data/enemies.json');
const LOCALE_EN_PATH = path.join(ROOT, 'src/i18n/messages/en.json');
const LOCALE_ZH_PATH = path.join(ROOT, 'src/i18n/messages/zh-Hans.json');
const ICONS_DIR = path.join(ROOT, 'src/assets/icons');
const KEYS_PATH = path.join(ROOT, 'src/icons/keys.ts');

export const MAX_ICON_BYTES = 64 * 1024;
/** Either edge of an uploaded icon must be ≤ this (UI tiles). */
export const MAX_ICON_EDGE = 256;

/** Keep uploads small — inventory tiles, not full art boards. */

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
};

const ICON_FILE_RE = /^(?!item-).+\.(png|webp|svg)$/i;

function readBody(req: { on: (event: string, cb: (chunk?: Buffer) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      if (chunk) chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void }, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function isSafeItemId(id: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(id);
}

function listItemIconFiles(): { key: string; file: string; bytes: number }[] {
  if (!fs.existsSync(ICONS_DIR)) return [];
  return fs
    .readdirSync(ICONS_DIR)
    .filter((f) => /^item-.*\.(png|webp)$/i.test(f))
    .map((file) => {
      const key = file.replace(/\.(png|webp)$/i, '').replace(/-/g, '.');
      const bytes = fs.statSync(path.join(ICONS_DIR, file)).size;
      return { key, file, bytes };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

function keyFromIconFile(file: string): string {
  return file.replace(/\.(png|webp|svg)$/i, '').replace(/-/g, '.');
}

function listNonItemIconFiles(): { key: string; file: string; bytes: number }[] {
  if (!fs.existsSync(ICONS_DIR)) return [];
  return fs
    .readdirSync(ICONS_DIR)
    .filter((f) => ICON_FILE_RE.test(f))
    .map((file) => {
      const bytes = fs.statSync(path.join(ICONS_DIR, file)).size;
      return { key: keyFromIconFile(file), file, bytes };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Icon keys registered in keys.ts that are not item.*. */
function readKnownNonItemIconKeys(): Set<string> {
  const src = fs.readFileSync(KEYS_PATH, 'utf8');
  const keys = new Set<string>();
  for (const m of src.matchAll(/'([a-z]+(?:\.[a-zA-Z0-9_]+)+)'/g)) {
    const key = m[1]!;
    if (!key.startsWith('item.')) keys.add(key);
  }
  return keys;
}

function isSafeNonItemIconKey(key: string): boolean {
  return /^[a-z]+(\.[a-z][a-zA-Z0-9_]*)+$/.test(key) && !key.startsWith('item.');
}

function iconStemFromKey(key: string): string {
  return key.replace(/\./g, '-');
}

function parseIconUpload(buf: Buffer, ext: string): boolean {
  if (ext === 'png') return buf[0] === 0x89 && buf[1] === 0x50;
  if (ext === 'webp') {
    return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

/**
 * Ensure `item.<id>` exists on IconName + EMOJI_FALLBACK so auto-resolve and
 * typecheck stay in sync after an upload. No-op if already present.
 */
function ensureItemIconKey(itemId: string): boolean {
  const key = `item.${itemId}`;
  let src = fs.readFileSync(KEYS_PATH, 'utf8');
  if (src.includes(`'${key}'`)) return false;

  // Insert into the IconName union — before the trailing `;` on the last item.* line.
  const unionNeedle = 'export const EMOJI_FALLBACK';
  const unionIdx = src.indexOf(unionNeedle);
  if (unionIdx < 0) throw new Error('Could not find EMOJI_FALLBACK in keys.ts');
  const beforeUnion = src.slice(0, unionIdx);
  const lastItemUnion = beforeUnion.lastIndexOf("| 'item.");
  if (lastItemUnion < 0) throw new Error('Could not find item.* IconName entries');
  const lineEnd = beforeUnion.indexOf('\n', lastItemUnion);
  const line = beforeUnion.slice(lastItemUnion, lineEnd === -1 ? beforeUnion.length : lineEnd);
  const semiInLine = line.lastIndexOf(';');
  if (semiInLine >= 0) {
    const absSemi = lastItemUnion + semiInLine;
    src = `${src.slice(0, absSemi)}\n  | '${key}'${src.slice(absSemi)}`;
  } else {
    const insertAt = lineEnd === -1 ? beforeUnion.length : lineEnd;
    src = `${src.slice(0, insertAt)}\n  | '${key}'${src.slice(insertAt)}`;
  }

  // Insert into EMOJI_FALLBACK — after the last `'item.…':` entry.
  const fallbackIdx = src.indexOf('export const EMOJI_FALLBACK');
  const closeIdx = src.indexOf('\n};', fallbackIdx);
  if (closeIdx < 0) throw new Error('Could not find end of EMOJI_FALLBACK');
  const block = src.slice(fallbackIdx, closeIdx);
  const lastItemEmoji = block.lastIndexOf("  'item.");
  if (lastItemEmoji < 0) throw new Error('Could not find item.* emoji entries');
  const abs = fallbackIdx + lastItemEmoji;
  const emojiLineEnd = src.indexOf('\n', abs);
  src = `${src.slice(0, emojiLineEnd)}\n  '${key}': '📦',${src.slice(emojiLineEnd)}`;

  fs.writeFileSync(KEYS_PATH, src, 'utf8');
  return true;
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).localeCompare(path.resolve(b), undefined, {
    sensitivity: 'accent',
  }) === 0;
}

function isDevLootHotFile(file: string): boolean {
  if (
    samePath(file, ITEMS_PATH) ||
    samePath(file, ITEM_TILE_COLORS_PATH) ||
    samePath(file, LOOT_TABLES_PATH) ||
    samePath(file, RECIPES_PATH) ||
    samePath(file, ENEMIES_PATH) ||
    samePath(file, KEYS_PATH) ||
    samePath(file, LOCALE_EN_PATH) ||
    samePath(file, LOCALE_ZH_PATH)
  ) {
    return true;
  }
  const rel = path.relative(path.resolve(ICONS_DIR), path.resolve(file));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    return /\.(png|webp|svg)$/i.test(path.basename(rel));
  }
  return false;
}

function readKnownItemIds(): Set<string> | undefined {
  try {
    const items = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8')) as Record<string, unknown>;
    return new Set(Object.keys(items));
  } catch {
    return undefined;
  }
}

/**
 * DEV-only middleware for the loot catalog and item icon uploads.
 * `apply: 'serve'` keeps this out of production builds.
 */
export function lootDevApi(): Plugin {
  return {
    name: 'loot-dev-api',
    apply: 'serve',
    /**
     * Saving catalogs / icons writes under `src/`, which would otherwise trigger
     * a full page reload (JSON is imported by `loot.ts`). Suppress HMR so the
     * editor stays open; reload manually to pick up live game modules.
     */
    handleHotUpdate({ file }) {
      if (isDevLootHotFile(file)) return [];
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '';
        const url = rawUrl.split('?')[0];
        const qs = rawUrl.includes('?') ? new URL(rawUrl, 'http://dev.local').searchParams : null;

        // Locale catalogs — support /__dev/locale?id=en|zh-Hans (preferred) and
        // /__dev/locale/en path form. Query form avoids SPA fallback eating hyphens.
        const localeIdFromPath = url?.match(/^\/__dev\/locale\/(en|zh-Hans)$/)?.[1];
        const localeIdFromQuery =
          url === '/__dev/locale' ? qs?.get('id') : null;
        const localeId =
          localeIdFromPath ??
          (localeIdFromQuery === 'en' || localeIdFromQuery === 'zh-Hans'
            ? localeIdFromQuery
            : null);
        if (localeId) {
          const filePath = localeId === 'en' ? LOCALE_EN_PATH : LOCALE_ZH_PATH;
          if (req.method === 'GET') {
            try {
              const raw = fs.readFileSync(filePath, 'utf8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(raw);
            } catch (err) {
              json(res, 500, { error: String(err) });
            }
            return;
          }
          if (req.method === 'PUT') {
            try {
              const body = await readBody(req);
              const parsed: unknown = JSON.parse(body);
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                json(res, 400, { error: 'Locale catalog must be a JSON object' });
                return;
              }
              fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
              json(res, 200, { ok: true });
            } catch (err) {
              json(res, 400, { error: String(err) });
            }
            return;
          }
          res.statusCode = 405;
          res.setHeader('Allow', 'GET, PUT');
          res.end('Method Not Allowed');
          return;
        }

        if (url === '/__dev/icons' && req.method === 'GET') {
          try {
            json(res, 200, {
              maxBytes: MAX_ICON_BYTES,
              maxEdge: MAX_ICON_EDGE,
              icons: listNonItemIconFiles(),
            });
          } catch (err) {
            json(res, 500, { error: String(err) });
          }
          return;
        }

        if (url === '/__dev/icon' && req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req)) as {
              key?: unknown;
              mime?: unknown;
              dataBase64?: unknown;
            };
            const key = typeof body.key === 'string' ? body.key : '';
            const mime = typeof body.mime === 'string' ? body.mime : '';
            const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : '';

            if (!isSafeNonItemIconKey(key)) {
              json(res, 400, {
                error: 'key must be a non-item IconName (e.g. poi.supermarket)',
              });
              return;
            }
            const known = readKnownNonItemIconKeys();
            if (!known.has(key)) {
              json(res, 400, { error: `Unknown icon key: ${key}` });
              return;
            }
            const ext = MIME_EXT[mime];
            if (!ext) {
              json(res, 400, { error: 'Only image/png and image/webp are allowed' });
              return;
            }
            if (!dataBase64) {
              json(res, 400, { error: 'dataBase64 is required' });
              return;
            }

            const buf = Buffer.from(dataBase64, 'base64');
            if (buf.byteLength === 0) {
              json(res, 400, { error: 'Empty image payload' });
              return;
            }
            if (buf.byteLength > MAX_ICON_BYTES) {
              json(res, 400, {
                error: `Icon exceeds ${MAX_ICON_BYTES} byte limit (${buf.byteLength} bytes)`,
              });
              return;
            }
            if (!parseIconUpload(buf, ext)) {
              json(res, 400, { error: 'File contents do not match the declared image type' });
              return;
            }

            const stem = iconStemFromKey(key);
            fs.mkdirSync(ICONS_DIR, { recursive: true });
            for (const other of ['png', 'webp', 'svg'] as const) {
              const p = path.join(ICONS_DIR, `${stem}.${other}`);
              if (other !== ext && fs.existsSync(p)) fs.unlinkSync(p);
            }
            const file = `${stem}.${ext}`;
            fs.writeFileSync(path.join(ICONS_DIR, file), buf);

            json(res, 200, {
              ok: true,
              key,
              file,
              bytes: buf.byteLength,
            });
          } catch (err) {
            json(res, 400, { error: String(err) });
          }
          return;
        }

        if (url === '/__dev/icon' && req.method === 'DELETE') {
          try {
            const rawUrl = req.url ?? '';
            const q = new URL(rawUrl, 'http://localhost').searchParams.get('key') ?? '';
            if (!isSafeNonItemIconKey(q)) {
              json(res, 400, { error: 'key query param must be a non-item IconName' });
              return;
            }
            const known = readKnownNonItemIconKeys();
            if (!known.has(q)) {
              json(res, 400, { error: `Unknown icon key: ${q}` });
              return;
            }
            const stem = iconStemFromKey(q);
            let removed: string | null = null;
            for (const ext of ['png', 'webp', 'svg'] as const) {
              const p = path.join(ICONS_DIR, `${stem}.${ext}`);
              if (fs.existsSync(p)) {
                fs.unlinkSync(p);
                removed = `${stem}.${ext}`;
              }
            }
            json(res, 200, { ok: true, key: q, removed });
          } catch (err) {
            json(res, 400, { error: String(err) });
          }
          return;
        }

        if (url === '/__dev/item-icons' && req.method === 'GET') {
          try {
            json(res, 200, {
              maxBytes: MAX_ICON_BYTES,
              icons: listItemIconFiles(),
            });
          } catch (err) {
            json(res, 500, { error: String(err) });
          }
          return;
        }

        if (url === '/__dev/item-icon' && req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req)) as {
              itemId?: unknown;
              mime?: unknown;
              dataBase64?: unknown;
            };
            const itemId = typeof body.itemId === 'string' ? body.itemId : '';
            const mime = typeof body.mime === 'string' ? body.mime : '';
            const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : '';

            if (!isSafeItemId(itemId)) {
              json(res, 400, { error: 'itemId must match /^[a-z][a-z0-9_]*$/' });
              return;
            }
            const ext = MIME_EXT[mime];
            if (!ext) {
              json(res, 400, { error: 'Only image/png and image/webp are allowed' });
              return;
            }
            if (!dataBase64) {
              json(res, 400, { error: 'dataBase64 is required' });
              return;
            }

            const buf = Buffer.from(dataBase64, 'base64');
            if (buf.byteLength === 0) {
              json(res, 400, { error: 'Empty image payload' });
              return;
            }
            if (buf.byteLength > MAX_ICON_BYTES) {
              json(res, 400, {
                error: `Icon exceeds ${MAX_ICON_BYTES} byte limit (${buf.byteLength} bytes)`,
              });
              return;
            }

            // Soft magic-byte check
            const isPng = ext === 'png' && buf[0] === 0x89 && buf[1] === 0x50;
            const isWebp =
              ext === 'webp' && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
            if (!isPng && !isWebp) {
              json(res, 400, { error: 'File contents do not match the declared image type' });
              return;
            }

            fs.mkdirSync(ICONS_DIR, { recursive: true });
            // Prefer a single canonical file per item — remove the other ext if present.
            for (const other of ['png', 'webp'] as const) {
              const p = path.join(ICONS_DIR, `item-${itemId}.${other}`);
              if (other !== ext && fs.existsSync(p)) fs.unlinkSync(p);
            }
            const file = `item-${itemId}.${ext}`;
            const dest = path.join(ICONS_DIR, file);
            fs.writeFileSync(dest, buf);

            const key = `item.${itemId}`;
            const keysUpdated = ensureItemIconKey(itemId);

            json(res, 200, {
              ok: true,
              key,
              file,
              bytes: buf.byteLength,
              keysUpdated,
            });
          } catch (err) {
            json(res, 400, { error: String(err) });
          }
          return;
        }

        if (url === '/__dev/loot-tables') {
          if (req.method === 'GET') {
            try {
              const raw = fs.readFileSync(LOOT_TABLES_PATH, 'utf8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(raw);
            } catch (err) {
              json(res, 500, { error: String(err) });
            }
            return;
          }

          if (req.method === 'PUT') {
            try {
              const body = await readBody(req);
              const parsed: unknown = JSON.parse(body);
              const knownIds = readKnownItemIds();
              const errors = validateLootTablesCatalog(parsed, knownIds);
              if (errors.length > 0) {
                json(res, 400, { error: 'Validation failed', errors });
                return;
              }
              fs.writeFileSync(LOOT_TABLES_PATH, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
              json(res, 200, { ok: true });
            } catch (err) {
              json(res, 400, { error: String(err) });
            }
            return;
          }

          res.statusCode = 405;
          res.setHeader('Allow', 'GET, PUT');
          res.end('Method Not Allowed');
          return;
        }

        if (url === '/__dev/recipes') {
          if (req.method === 'GET') {
            try {
              const raw = fs.readFileSync(RECIPES_PATH, 'utf8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(raw);
            } catch (err) {
              json(res, 500, { error: String(err) });
            }
            return;
          }

          if (req.method === 'PUT') {
            try {
              const body = await readBody(req);
              const parsed: unknown = JSON.parse(body);
              const knownIds = readKnownItemIds();
              const errors = validateRecipesCatalog(parsed, knownIds);
              if (errors.length > 0) {
                json(res, 400, { error: 'Validation failed', errors });
                return;
              }
              const normalized = normalizeRecipesCatalog(parsed as RecipesCatalog);
              fs.writeFileSync(
                RECIPES_PATH,
                `${JSON.stringify(normalized, null, 2)}\n`,
                'utf8',
              );
              json(res, 200, { ok: true });
            } catch (err) {
              json(res, 400, { error: String(err) });
            }
            return;
          }

          res.statusCode = 405;
          res.setHeader('Allow', 'GET, PUT');
          res.end('Method Not Allowed');
          return;
        }

        if (url === '/__dev/enemies') {
          if (req.method === 'GET') {
            try {
              const raw = fs.readFileSync(ENEMIES_PATH, 'utf8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(raw);
            } catch (err) {
              json(res, 500, { error: String(err) });
            }
            return;
          }

          if (req.method === 'PUT') {
            try {
              const body = await readBody(req);
              const parsed: unknown = JSON.parse(body);
              const knownIds = readKnownItemIds();
              const errors = validateEnemiesCatalog(parsed, knownIds);
              if (errors.length > 0) {
                json(res, 400, { error: 'Validation failed', errors });
                return;
              }
              fs.writeFileSync(ENEMIES_PATH, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
              json(res, 200, { ok: true });
            } catch (err) {
              json(res, 400, { error: String(err) });
            }
            return;
          }

          res.statusCode = 405;
          res.setHeader('Allow', 'GET, PUT');
          res.end('Method Not Allowed');
          return;
        }

        if (url === '/__dev/item-tile-colors') {
          if (req.method === 'GET') {
            try {
              const raw = fs.readFileSync(ITEM_TILE_COLORS_PATH, 'utf8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(raw);
            } catch (err) {
              json(res, 500, { error: String(err) });
            }
            return;
          }

          if (req.method === 'PUT') {
            try {
              const body = await readBody(req);
              const parsed: unknown = JSON.parse(body);
              const errors = validateItemTileColors(parsed);
              if (errors.length > 0) {
                json(res, 400, { error: 'Validation failed', errors });
                return;
              }
              const pretty = `${JSON.stringify(parsed, null, 2)}\n`;
              fs.writeFileSync(ITEM_TILE_COLORS_PATH, pretty, 'utf8');
              json(res, 200, { ok: true });
            } catch (err) {
              json(res, 400, { error: String(err) });
            }
            return;
          }

          res.statusCode = 405;
          res.setHeader('Allow', 'GET, PUT');
          res.end('Method Not Allowed');
          return;
        }

        if (url !== '/__dev/items') {
          next();
          return;
        }

        if (req.method === 'GET') {
          try {
            const raw = fs.readFileSync(ITEMS_PATH, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(raw);
          } catch (err) {
            json(res, 500, { error: String(err) });
          }
          return;
        }

        if (req.method === 'PUT') {
          try {
            const body = await readBody(req);
            const parsed: unknown = JSON.parse(body);
            const errors = validateItemsCatalog(parsed);
            if (errors.length > 0) {
              json(res, 400, { error: 'Validation failed', errors });
              return;
            }
            const pretty = `${JSON.stringify(parsed, null, 2)}\n`;
            fs.writeFileSync(ITEMS_PATH, pretty, 'utf8');
            json(res, 200, { ok: true });
          } catch (err) {
            json(res, 400, { error: String(err) });
          }
          return;
        }

        res.statusCode = 405;
        res.setHeader('Allow', 'GET, PUT');
        res.end('Method Not Allowed');
      });
    },
  };
}
