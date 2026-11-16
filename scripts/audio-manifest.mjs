// Rebuild public/audio/manifest.json from the files in public/audio/:
// adopts `<cue id>.<ext>` files and drops entries whose file is gone.
// The dev server does the same on every load; this is for builds without it.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('public/audio');
const file = path.join(dir, 'manifest.json');
const EXTS = ['ogg', 'mp3', 'wav', 'm4a', 'webm', 'flac', 'opus'];
const known = new Set(
  [...fs.readFileSync('src/audio/cues.ts', 'utf8').matchAll(/\{ id: '([a-z0-9_.]+)', category:/g)].map((m) => m[1]),
);
let manifest = { version: 1, cues: {} };
try { manifest = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* fresh */ }
const files = fs.readdirSync(dir).filter((f) => EXTS.includes(f.split('.').pop().toLowerCase()));
for (const [id, a] of Object.entries(manifest.cues)) if (!files.includes(a.file)) delete manifest.cues[id];
for (const f of files) {
  const id = f.slice(0, f.lastIndexOf('.'));
  if (!known.has(id)) { console.warn(`skip ${f}: no cue named ${id}`); continue; }
  if (!manifest.cues[id]) {
    const st = fs.statSync(path.join(dir, f));
    manifest.cues[id] = { file: f, rev: `${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}` };
  }
}
const cues = Object.fromEntries(Object.keys(manifest.cues).sort().map((k) => [k, manifest.cues[k]]));
fs.writeFileSync(file, `${JSON.stringify({ version: 1, cues }, null, 2)}\n`);
console.log(`${Object.keys(cues).length} cue(s) assigned`);
