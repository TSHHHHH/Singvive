import { DAYS_MAX, RUN_MAX_AGE_MS, implausible, maxScore } from './scoreRules';

const NAME_MAX = 24;
const CAUSE_MAX = 120;
const SEED_MAX = 16;
const DAYS_MIN = 1;
const SCORE_MIN = 0;
const BODY_MAX = 2048;
/** Run registrations one address may make per hour — roomy enough for a shared network. */
const RUN_HOUR_MAX = 30;
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
  kills?: unknown;
  runId?: unknown;
};

type RunRow = {
  seed: string;
  started_at: number;
  submitted_at: number | null;
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 404 });
    }

    if (request.method === 'POST' && !sameOrigin(request, url)) {
      return json({ error: 'Forbidden' }, 403);
    }

    if (url.pathname === '/api/scores') {
      if (request.method === 'GET') return listScores(url, env.DB);
      if (request.method === 'POST') return submitScore(request, env.DB);
      return json({ error: 'Method not allowed' }, 405);
    }

    if (url.pathname === '/api/runs') {
      if (request.method === 'POST') return startRun(request, env.DB);
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
  const body = await readJson<SubmitBody>(request);
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const parsed = parseSubmit(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') ?? 'unknown');
  const limited = await rateLimit(db, ipHash);
  if (limited) return json({ error: 'Too many submissions' }, 429);

  const createdAt = Date.now();
  const escaped = parsed.escaped ? 1 : 0;

  // The score must belong to a run this Worker registered, for the same seed,
  // not yet posted, and old enough for the days it claims. One generic refusal
  // for all of it — a forger learns nothing about which rule caught them.
  const run = await db
    .prepare(`SELECT seed, started_at, submitted_at FROM runs WHERE id = ?`)
    .bind(parsed.runId)
    .first<RunRow>();
  if (!run || run.seed !== parsed.seed) return json({ error: 'Rejected' }, 422);
  if (run.submitted_at !== null) return json({ error: 'Already posted' }, 409);
  const why = implausible({
    days: parsed.days,
    kills: parsed.kills,
    score: parsed.score,
    escaped: parsed.escaped,
    elapsedMs: createdAt - run.started_at,
  });
  if (why) return json({ error: 'Rejected' }, 422);

  // Claim the run atomically so two racing posts cannot both land.
  const claim = await db
    .prepare(`UPDATE runs SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL`)
    .bind(createdAt, parsed.runId)
    .run();
  if (claim.meta.changes !== 1) return json({ error: 'Already posted' }, 409);
  const insert = await db
    .prepare(
      `INSERT INTO scores (name, days, score, cause, seed, escaped, created_at, kills, run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      parsed.kills,
      parsed.runId,
    )
    .first<{ id: number }>();

  if (!insert) return json({ error: 'Insert failed' }, 500);

  // Rank is a COUNT of rows strictly ahead — fine until the table is huge.
  const rankRow = await db
    .prepare(
      `SELECT COUNT(*) + 1 AS rank
       FROM scores
       WHERE score > ? OR (score = ? AND (created_at < ? OR (created_at = ? AND id < ?)))`,
    )
    .bind(parsed.score, parsed.score, createdAt, createdAt, insert.id)
    .first<{ rank: number }>();

  return json({ id: insert.id, rank: rankRow?.rank ?? 1 });
}

/** Registers a run at its start and hands back the id a later score must carry. */
async function startRun(request: Request, db: D1Database): Promise<Response> {
  const body = await readJson<{ seed?: unknown }>(request);
  if (!body) return json({ error: 'Invalid JSON' }, 400);
  const seed = sanitizeSeed(body.seed);
  if (!seed) return json({ error: 'Invalid seed' }, 400);

  const now = Date.now();
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') ?? 'unknown');
  const recent = await db
    .prepare(`SELECT COUNT(*) AS n FROM runs WHERE ip_hash = ? AND started_at > ?`)
    .bind(ipHash, now - HOUR_MS)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= RUN_HOUR_MAX) return json({ error: 'Too many runs' }, 429);

  const runId = crypto.randomUUID().replaceAll('-', '');
  await db
    .prepare(`INSERT INTO runs (id, seed, ip_hash, started_at) VALUES (?, ?, ?, ?)`)
    .bind(runId, seed, ipHash, now)
    .run();

  // Runs past their claim window can never post — drop them so the table stays small.
  await db.prepare(`DELETE FROM runs WHERE started_at < ?`).bind(now - RUN_MAX_AGE_MS).run();

  return json({ runId });
}

/**
 * Browsers always send Origin on a cross-site POST, so another site cannot
 * post scores through a visitor. Non-browser clients omit it; the run id and
 * rate limits are what hold those back.
 */
function sameOrigin(request: Request, url: URL): boolean {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('Origin');
  return !origin || origin === url.origin;
}

/** JSON body with a hard size cap — the largest honest payload is a few hundred bytes. */
async function readJson<T extends object>(request: Request): Promise<T | null> {
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) return null;
  if (Number(request.headers.get('Content-Length') ?? 0) > BODY_MAX) return null;
  try {
    const text = await request.text();
    if (text.length > BODY_MAX) return null;
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : null;
  } catch {
    return null;
  }
}

function parseSubmit(
  body: SubmitBody,
):
  | {
      name: string;
      days: number;
      score: number;
      cause: string;
      seed: string;
      escaped: boolean;
      kills: number;
      runId: string;
    }
  | { error: string } {
  const name = sanitizeName(body.name);
  const days = asInt(body.days);
  const score = asInt(body.score);
  const cause = sanitizeCause(body.cause);
  const seed = sanitizeSeed(body.seed);
  if (days === null || days < DAYS_MIN || days > DAYS_MAX) {
    return { error: 'Invalid days' };
  }
  const escaped = body.escaped === true;
  if (score === null || score < SCORE_MIN || score > maxScore(days, escaped)) {
    return { error: 'Invalid score' };
  }
  if (!seed) return { error: 'Invalid seed' };
  const kills = asInt(body.kills);
  if (kills === null || kills < 0) return { error: 'Invalid kills' };
  const runId = typeof body.runId === 'string' && /^[0-9a-f]{32}$/.test(body.runId) ? body.runId : null;
  if (!runId) return { error: 'Invalid run' };
  return {
    name,
    days,
    score,
    cause,
    seed,
    escaped,
    kills,
    runId,
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
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}
