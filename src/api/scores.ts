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

export async function submitOnlineScore(input: SubmitScoreInput): Promise<SubmitScoreResult> {
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
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
