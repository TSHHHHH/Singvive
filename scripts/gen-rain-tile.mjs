// Tileable rain streak sheet for the map weather overlay.
//
// Writes public/weather/rain-sheet.svg — a scattered field of vertical streaks
// that tiles seamlessly at 168px (matches wx-fall-back travel in index.css).
//
//   npm run gen:rain-tile
//
// NOT part of `npm run build` — rerun by hand when tuning density or palette.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../public/weather');
const OUT_FILE = resolve(OUT_DIR, 'rain-sheet.svg');

const TILE_W = 192;
const TILE_H = 168;
const STREAK_COUNT = 108;
const SEED = (() => {
  let h = 2166136261;
  for (const ch of 'singvive-rain-v1') {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
})();

/** Tiny seeded PRNG — no gameplay RNG, build-time cosmetic only. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function streakLine(x, y, len, opacity) {
  const y2 = y + len;
  const r = 196;
  const g = 218;
  const b = 228;
  return `<line x1="${x.toFixed(2)}" y1="${y.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="rgb(${r},${g},${b})" stroke-opacity="${opacity.toFixed(3)}" stroke-width="1" stroke-linecap="round"/>`;
}

function generateStreaks() {
  const rand = mulberry32(SEED);
  const lines = [];

  for (let i = 0; i < STREAK_COUNT; i++) {
    const x = rand() * TILE_W;
    const y = rand() * TILE_H;
    const len = 10 + rand() * 16;
    const opacity = 0.1 + rand() * 0.12;

    lines.push(streakLine(x, y, len, opacity));

    // Seamless vertical wrap: streaks crossing the bottom edge reappear at top.
    if (y + len > TILE_H) {
      lines.push(streakLine(x, y - TILE_H, len, opacity));
    }
  }

  return lines.join('\n  ');
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}" viewBox="0 0 ${TILE_W} ${TILE_H}">
  ${generateStreaks()}
</svg>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, svg, 'utf8');
console.log(`Wrote ${OUT_FILE} (${STREAK_COUNT} streaks, ${TILE_W}×${TILE_H})`);
