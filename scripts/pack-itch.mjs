/**
 * Zip dist-itch/ so index.html is at the archive root — itch.io's HTML
 * player expects that layout. Run via `npm run build:itch`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'dist-itch');
const releaseDir = path.join(root, 'release');
const zipPath = path.join(releaseDir, 'singvive-itch.zip');

if (!fs.existsSync(path.join(outDir, 'index.html'))) {
  console.error('dist-itch/index.html is missing. The itch Vite build did not finish.');
  process.exit(1);
}

const index = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
if (/(?:src|href)="\//.test(index)) {
  console.error('index.html still has root-absolute asset URLs. itch.io would 404 them.');
  process.exit(1);
}

fs.mkdirSync(releaseDir, { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const packed = spawnSync('tar', ['-a', '-c', '-f', zipPath, '-C', outDir, '.'], {
  stdio: 'inherit',
});
if (packed.status !== 0) process.exit(packed.status ?? 1);

const listing = spawnSync('tar', ['-tf', zipPath], { encoding: 'utf8' });
if (listing.status !== 0) process.exit(listing.status ?? 1);
const names = listing.stdout.split(/\r?\n/).filter(Boolean);
const atRoot = names.some((name) => /^(?:\.\/)?index\.html$/.test(name));
const nested = names.some((name) => /index\.html$/.test(name) && !/^(?:\.\/)?index\.html$/.test(name));
if (!atRoot || nested) {
  console.error('Zip must contain index.html at the archive root, not inside a folder.');
  process.exit(1);
}

const mb = fs.statSync(zipPath).size / (1024 * 1024);
console.log(`Wrote release/singvive-itch.zip (${mb.toFixed(1)} MB)`);
