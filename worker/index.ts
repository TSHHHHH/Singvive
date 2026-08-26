const NAME_MAX = 24;
const CAUSE_MAX = 120;
const SEED_MAX = 16;
const DAYS_MIN = 1;
const DAYS_MAX = 200;
const SCORE_MIN = 0;
const SCORE_MAX = 2_000_000;
const LIST_DEFAULT = 20;
const LIST_MAX = 50;
const RATE_GAP_MS = 20_000;
const RATE_HOUR_MAX = 8;
const HOUR_MS = 3_600_000;

type ScoreRow = {
  id: number;
  name: string;
  days: number;
  score: number;
  escaped: number;
};

type RateRow = {
  last_at: number;
  hour_bucket: number;
  count_hour: number;
};

type SubmitBody = {
  name?: unknown;
  days?: unknown;
  score?: unknown;
  cause?: unknown;
  seed?: unknown;
  escaped?: unknown;
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 404 });
    }

    if (url.pathname === '/api/scores') {
      if (request.method === 'GET') return listScores(url, env.DB);
      if (request.method === 'POST') return submitScore(request, env.DB);
      return json({ error: 'Method not allowed' }, 405);
    }

    return json({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;

async function listScores(url: URL, db: D1Database): Promise<Response> {
  const raw = Number(url.searchParams.get('limit') ?? LIST_DEFAULT);
  const limit = Number.isFinite(raw)
    ? Math.min(LIST_MAX, Math.max(1, Math.trunc(raw)))
    : LIST_DEFAULT;

  const { results } = await db
    .prepare(
      `SELECT id, name, days, score, escaped
       FROM scores
       ORDER BY score DESC, created_at ASC, id ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<ScoreRow>();

  return json(
    {
      scores: (results ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        days: row.days,
        score: row.score,
        escaped: row.escaped === 1,
      })),
    },
    200,
    { 'Cache-Control': 'public, max-age=30' },
  );
}

async function submitScore(request: Request, db: D1Database): Promise<Response> {
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = parseSubmit(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') ?? 'unknown');
  const limited = await rateLimit(db, ipHash);
  if (limited) return json({ error: 'Too many submissions' }, 429);

  const createdAt = Date.now();
  const escaped = parsed.escaped ? 1 : 0;
  const insert = await db
    .prepare(
      `INSERT INTO scores (name, days, score, cause, seed, escaped, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      parsed.name,
      parsed.days,
      parsed.score,
      parsed.cause,
      parsed.seed,
      escaped,
      createdAt,
    )
    .first<{ id: number }>();

  if (!insert) return json({ error: 'Insert failed' }, 500, { 'Cache-Control': 'no-store' });

  // Rank is a COUNT of rows strictly ahead — fine until the table is huge.
  const rankRow = await db
    .prepare(
      `SELECT COUNT(*) + 1 AS rank
       FROM scores
       WHERE score > ? OR (score = ? AND (created_at < ? OR (created_at = ? AND id < ?)))`,
    )
    .bind(parsed.score, parsed.score, createdAt, createdAt, insert.id)
    .first<{ rank: number }>();

  return json({ id: insert.id, rank: rankRow?.rank ?? 1 }, 200, {
    'Cache-Control': 'no-store',
  });
}

function parseSubmit(
  body: SubmitBody,
):
  | { name: string; days: number; score: number; cause: string; seed: string; escaped: boolean }
  | { error: string } {
  const name = sanitizeName(body.name);
  const days = asInt(body.days);
  const score = asInt(body.score);
  const cause = sanitizeCause(body.cause);
  const seed = sanitizeSeed(body.seed);
  if (days === null || days < DAYS_MIN || days > DAYS_MAX) {
    return { error: 'Invalid days' };
  }
  if (score === null || score < SCORE_MIN || score > SCORE_MAX) {
    return { error: 'Invalid score' };
  }
  if (!seed) return { error: 'Invalid seed' };
  return {
    name,
    days,
    score,
    cause,
    seed,
    escaped: body.escaped === true,
  };
}

function stripControls(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code !== 127) out += ch;
  }
  return out;
}

function sanitizeName(value: unknown): string {
  if (typeof value !== 'string') return 'Survivor';
  const cleaned = stripControls(value)
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, NAME_MAX);
  return cleaned || 'Survivor';
}

function sanitizeCause(value: unknown): string {
  if (typeof value !== 'string') return '';
  return stripControls(value).trim().slice(0, CAUSE_MAX);
}

function sanitizeSeed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const seed = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,16}$/.test(seed) || seed.length > SEED_MAX) return null;
  return seed;
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

async function rateLimit(db: D1Database, ipHash: string): Promise<boolean> {
  const now = Date.now();
  const hourBucket = Math.floor(now / HOUR_MS);
  const row = await db
    .prepare(`SELECT last_at, hour_bucket, count_hour FROM rate_limits WHERE ip_hash = ?`)
    .bind(ipHash)
    .first<RateRow>();

  if (row && now - row.last_at < RATE_GAP_MS) return true;
  const countHour = row && row.hour_bucket === hourBucket ? row.count_hour : 0;
  if (countHour >= RATE_HOUR_MAX) return true;

  await db
    .prepare(
      `INSERT INTO rate_limits (ip_hash, last_at, hour_bucket, count_hour)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(ip_hash) DO UPDATE SET
         last_at = excluded.last_at,
         hour_bucket = excluded.hour_bucket,
         count_hour = CASE
           WHEN rate_limits.hour_bucket = excluded.hour_bucket THEN rate_limits.count_hour + 1
           ELSE 1
         END`,
    )
    .bind(ipHash, now, hourBucket)
    .run();

  // Drop rows that have not been touched in a day so the table cannot grow unbounded.
  await db.prepare(`DELETE FROM rate_limits WHERE last_at < ?`).bind(now - 24 * HOUR_MS).run();

  return false;
}

async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
