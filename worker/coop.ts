export function coopJson(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Small bodies are bounded while reading, not only after buffering. */
export async function readName(request: Request): Promise<string | null> {
  if (!request.headers.get('Content-Type')?.includes('application/json') || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof body !== 'object' || body === null || !('name' in body) || typeof body.name !== 'string') return null;
    const name = body.name.trim();
    return name.length > 0 && name.length <= 24 && ![...name].some((char) => char.charCodeAt(0) < 32) ? name : null;
  } catch { return null; }
}

export async function handleCoop(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  // Both state-changing HTTP and socket handshakes must come from this app.
  if (request.headers.get('Origin') !== url.origin) return coopJson({ error: 'Forbidden origin.' }, 403);
  if (url.pathname === '/api/coop' && request.method === 'POST') {
    const name = await readName(request);
    if (!name) return coopJson({ error: 'Use a name of 1–24 characters.' }, 400);
    const code = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
    return env.COOP_ROOMS.getByName(code).fetch(new Request(`https://room/create?code=${code}`, { method: 'POST', body: JSON.stringify({ name }), headers: { 'Content-Type': 'application/json' } }));
  }
  const match = url.pathname.match(/^\/api\/coop\/([A-F0-9]{12})\/(join|ws)$/);
  if (!match) return coopJson({ error: 'Room route not found.' }, 404);
  const [, code, operation] = match;
  const stub = env.COOP_ROOMS.getByName(code);
  if (operation === 'join' && request.method === 'POST') {
    const name = await readName(request);
    if (!name) return coopJson({ error: 'Use a name of 1–24 characters.' }, 400);
    return stub.fetch(new Request('https://room/join', { method: 'POST', body: JSON.stringify({ name }), headers: { 'Content-Type': 'application/json' } }));
  }
  if (operation === 'ws' && request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    return stub.fetch(new Request(`https://room/ws${url.search}`, request));
  }
  return coopJson({ error: 'Method not allowed.' }, 405);
}
