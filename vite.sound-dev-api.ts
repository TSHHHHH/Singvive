import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIO_EXTS,
  CUES,
  cueIdFromFile,
  type AudioManifest,
  type CueAsset,
} from './src/audio/cues.ts';

// DEV-only API behind the Sound console. Writes audio files into
// public/audio/<cue id>.<ext> and keeps public/audio/manifest.json in step.
// Not part of any build: `configureServer` only runs under `vite dev`.

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const AUDIO_DIR = path.join(ROOT, 'public/audio');
const MANIFEST_PATH = path.join(AUDIO_DIR, 'manifest.json');

/** Short SFX, not soundtracks. Keeps the public repo light. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const KNOWN = new Set<string>(CUES.map((c) => c.id));

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

/** Does the payload look like the audio format its extension claims? */
export function sniffAudio(buf: Buffer, ext: string): boolean {
  const ascii = (o: number, n: number) => buf.subarray(o, o + n).toString('latin1');
  switch (ext) {
    case 'ogg':
    case 'opus':
      return ascii(0, 4) === 'OggS';
    case 'mp3':
      return ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0);
    case 'wav':
      return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE';
    case 'm4a':
      return ascii(4, 4) === 'ftyp';
    case 'webm':
      return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
    case 'flac':
      return ascii(0, 4) === 'fLaC';
    default:
      return false;
  }
}

function readManifest(): AudioManifest {
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as AudioManifest;
    if (m && typeof m === 'object' && m.cues && typeof m.cues === 'object') return { version: 1, cues: m.cues };
  } catch {
    /* missing or broken: start fresh */
  }
  return { version: 1, cues: {} };
}

function writeManifest(m: AudioManifest): void {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  // Stable key order so diffs stay small.
  const cues: Record<string, CueAsset> = {};
  for (const id of Object.keys(m.cues).sort()) cues[id] = m.cues[id]!;
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({ version: 1, cues }, null, 2)}\n`);
}

function revOf(file: string): string {
  const st = fs.statSync(path.join(AUDIO_DIR, file));
  return `${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}`;
}

/**
 * Bring the manifest in line with the folder: adopt `<cue id>.<ext>` files
 * dropped in by hand, and forget entries whose file is gone. Returns the
 * manifest and whether it changed.
 */
export function syncManifest(): { manifest: AudioManifest; files: { file: string; bytes: number }[]; changed: boolean } {
  const m = readManifest();
  let changed = false;
  const files = fs.existsSync(AUDIO_DIR)
    ? fs
        .readdirSync(AUDIO_DIR)
        .filter((f) => cueIdFromFile(f) !== null)
        .map((f) => ({ file: f, bytes: fs.statSync(path.join(AUDIO_DIR, f)).size }))
    : [];
  const present = new Set(files.map((f) => f.file));
  for (const [id, a] of Object.entries(m.cues)) {
    if (!a || !present.has(a.file)) {
      delete m.cues[id];
      changed = true;
    }
  }
  for (const { file } of files) {
    const id = cueIdFromFile(file)!;
    if (KNOWN.has(id) && !m.cues[id]) {
      m.cues[id] = { file, rev: revOf(file) };
      changed = true;
    }
  }
  if (changed) writeManifest(m);
  return { manifest: m, files, changed };
}

function isKnownCue(id: unknown): id is string {
  return typeof id === 'string' && KNOWN.has(id);
}

function clamp(v: unknown, lo: number, hi: number): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined;
}

export function soundDevApi(): Plugin {
  return {
    name: 'singvive-sound-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== '/__dev/audio' && url !== '/__dev/audio/settings') return next();

        try {
          if (url === '/__dev/audio' && req.method === 'GET') {
            const { manifest, files } = syncManifest();
            const assigned = new Set(Object.values(manifest.cues).map((a) => a?.file));
            json(res, 200, {
              manifest,
              maxBytes: MAX_AUDIO_BYTES,
              exts: AUDIO_EXTS,
              // Files in the folder no cue uses (typo'd names, old uploads).
              orphans: files.filter((f) => !assigned.has(f.file)),
              sizes: Object.fromEntries(files.map((f) => [f.file, f.bytes])),
            });
            return;
          }

          if (url === '/__dev/audio' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req)) as { cue?: unknown; ext?: unknown; dataBase64?: unknown };
            if (!isKnownCue(body.cue)) return json(res, 400, { error: 'Unknown cue id' });
            const ext = typeof body.ext === 'string' ? body.ext.toLowerCase() : '';
            if (!(AUDIO_EXTS as readonly string[]).includes(ext)) {
              return json(res, 400, { error: `Use one of: ${AUDIO_EXTS.join(', ')}` });
            }
            const buf = Buffer.from(typeof body.dataBase64 === 'string' ? body.dataBase64 : '', 'base64');
            if (buf.byteLength === 0) return json(res, 400, { error: 'Empty file' });
            if (buf.byteLength > MAX_AUDIO_BYTES) {
              return json(res, 400, { error: `File is ${(buf.byteLength / 1048576).toFixed(1)} MB; the limit is ${MAX_AUDIO_BYTES / 1048576} MB` });
            }
            if (!sniffAudio(buf, ext)) return json(res, 400, { error: `That file is not a valid .${ext}` });

            fs.mkdirSync(AUDIO_DIR, { recursive: true });
            for (const other of AUDIO_EXTS) {
              const p = path.join(AUDIO_DIR, `${body.cue}.${other}`);
              if (other !== ext && fs.existsSync(p)) fs.unlinkSync(p);
            }
            const file = `${body.cue}.${ext}`;
            fs.writeFileSync(path.join(AUDIO_DIR, file), buf);
            const m = readManifest();
            m.cues[body.cue] = { ...m.cues[body.cue], file, rev: revOf(file) };
            writeManifest(m);
            json(res, 200, { ok: true, manifest: m, file, bytes: buf.byteLength });
            return;
          }

          if (url === '/__dev/audio/settings' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req)) as { cue?: unknown; volume?: unknown; pitchVar?: unknown; loop?: unknown };
            if (!isKnownCue(body.cue)) return json(res, 400, { error: 'Unknown cue id' });
            const m = readManifest();
            const cur = m.cues[body.cue];
            if (!cur) return json(res, 400, { error: 'Assign a file before tuning it' });
            const next: CueAsset = { ...cur };
            const vol = clamp(body.volume, 0, 1);
            const pv = clamp(body.pitchVar, 0, 12);
            if (vol !== undefined) next.volume = Math.round(vol * 100) / 100;
            if (pv !== undefined) next.pitchVar = Math.round(pv * 10) / 10;
            if (typeof body.loop === 'boolean') next.loop = body.loop;
            m.cues[body.cue] = next;
            writeManifest(m);
            json(res, 200, { ok: true, manifest: m });
            return;
          }

          if (url === '/__dev/audio' && req.method === 'DELETE') {
            const cue = new URL(req.url ?? '', 'http://localhost').searchParams.get('cue');
            if (!isKnownCue(cue)) return json(res, 400, { error: 'Unknown cue id' });
            let removed: string | null = null;
            for (const ext of AUDIO_EXTS) {
              const p = path.join(AUDIO_DIR, `${cue}.${ext}`);
              if (fs.existsSync(p)) {
                fs.unlinkSync(p);
                removed = `${cue}.${ext}`;
              }
            }
            const m = readManifest();
            const assigned = m.cues[cue]?.file;
            if (assigned && assigned !== removed && fs.existsSync(path.join(AUDIO_DIR, assigned))) {
              fs.unlinkSync(path.join(AUDIO_DIR, assigned));
              removed = assigned;
            }
            delete m.cues[cue];
            writeManifest(m);
            json(res, 200, { ok: true, manifest: m, removed });
            return;
          }

          json(res, 405, { error: 'Method not allowed' });
        } catch (err) {
          json(res, 500, { error: String(err) });
        }
      });
    },
  };
}
