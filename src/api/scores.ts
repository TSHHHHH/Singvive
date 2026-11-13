export type OnlineScore = {
  id: number;
  name: string;
  days: number;
  score: number;
  escaped: boolean;
};

export type SubmitScoreInput = {
  name: string;
  days: number;
  score: number;
  cause: string;
  seed: string;
  escaped: boolean;
  kills: number;
};

export type SubmitScoreResult =
  | { ok: true; id: number; rank: number }
  | { ok: false; reason: 'offline' | 'limited' | 'invalid' };

export function submitDedupeKey(seed: string, score: number, escaped: boolean): string {
  return `singvive.posted.v1:${seed}:${score}:${escaped ? 1 : 0}`;
}

type PostedMeta = { id: number; rank: number };

const inflight = new Map<string, Promise<SubmitScoreResult>>();

export function readPosted(key: string): PostedMeta | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PostedMeta;
    if (typeof parsed.id !== 'number' || typeof parsed.rank !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function submitOnlineScoreOnce(
  key: string,
  input: SubmitScoreInput,
): Promise<SubmitScoreResult> {
  const cached = readPosted(key);
  if (cached) return { ok: true, id: cached.id, rank: cached.rank };

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = submitOnlineScore(input).then((result) => {
    if (result.ok) {
      try {
        sessionStorage.setItem(key, JSON.stringify({ id: result.id, rank: result.rank }));
      } catch {
        /* ignore */
      }
    }
    return result;
  });
  inflight.set(key, pending);
  return pending;
}

export async function fetchOnlineScores(limit = 20): Promise<OnlineScore[] | null> {
  try {
    const res = await fetch(`/api/scores?limit=${limit}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { scores?: OnlineScore[] };
    return Array.isArray(data.scores) ? data.scores : [];
  } catch {
    return null;
  }
}

const RUN_TOKEN_KEY = 'singvive.runToken.v1';

type RunToken = { seed: string; runId: string };

function readRunToken(seed: string): string | null {
  try {
    const raw = localStorage.getItem(RUN_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunToken>;
    return parsed.seed === seed && typeof parsed.runId === 'string' ? parsed.runId : null;
  } catch {
    return null;
  }
}

const registering = new Map<string, Promise<string | null>>();

/**
 * Registers the run with the Worker and keeps the id it hands back. The
 * worldwide board only takes a score that carries one, and checks the real
 * time since it was issued — so this is called as soon as a run is on screen,
 * new or continued, and is a no-op once the run has its id. Offline it fails
 * quietly and the next load tries again; the run itself never depends on it.
 */
export function ensureRunRegistered(seed: string): Promise<string | null> {
  if (!seed) return Promise.resolve(null);
  const have = readRunToken(seed);
  if (have) return Promise.resolve(have);
  const existing = registering.get(seed);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { runId?: unknown };
      if (typeof data.runId !== 'string') return null;
      try {
        localStorage.setItem(RUN_TOKEN_KEY, JSON.stringify({ seed, runId: data.runId }));
      } catch {
        /* ignore */
      }
      return data.runId;
    } catch {
      return null;
    } finally {
      registering.delete(seed);
    }
  })();
  registering.set(seed, pending);
  return pending;
}

export async function submitOnlineScore(input: SubmitScoreInput): Promise<SubmitScoreResult> {
  // A run that never reached the Worker has no id to post under.
  const runId = readRunToken(input.seed);
  if (!runId) return { ok: false, reason: 'offline' };
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, runId }),
    });
    if (res.status === 429) return { ok: false, reason: 'limited' };
    if (!res.ok) return { ok: false, reason: res.status >= 500 ? 'offline' : 'invalid' };
    const data = (await res.json()) as { id?: number; rank?: number };
    if (typeof data.id !== 'number' || typeof data.rank !== 'number') {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, id: data.id, rank: data.rank };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}
