/**
 * One-shot migration from the ad-hoc Tailwind size scale to the named type
 * roles in src/ui/type.ts. Run with --write to apply; default is a dry run.
 *
 *   node scripts/codemod-type-scale.mjs [--write] [path ...]
 *
 * It only rewrites whitespace-delimited tokens inside string and template
 * literals, and only when the segment already carries a legacy size class.
 * Everything it declines to touch is reported so the residue can be done by
 * hand — see the plan's "manual pass B".
 */
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const ROOTS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TARGETS = ROOTS.length ? ROOTS : ['src'];

/** legacy size class -> [plain role, signage role (when `uppercase` is present)] */
const SIZE_MAP = {
  'text-2xs': ['micro', 'label'],
  'text-[10px]': ['micro', 'label'],
  'text-[9px]': ['micro', 'label'],
  'text-xs': ['body', 'plate'],
  'text-[11px]': ['body', 'plate'],
  'text-sm': ['read', 'read'],
  'text-base': ['title', 'title'],
  'text-lg': ['title', 'title'],
  'text-2xl': ['marquee', 'marquee'],
  'text-3xl': ['marquee', 'marquee'],
  'text-5xl': ['banner', 'banner'],
};

/** Tokens the role now carries itself, so the call site must stop declaring them. */
const ABSORBED = {
  micro: ['leading-snug', 'leading-tight'],
  label: [
    'leading-snug',
    'leading-tight',
    'tracking-widest',
    'tracking-wider',
    'tracking-wide',
    'tracking-normal',
    'font-semibold',
    'font-bold',
  ],
  body: ['leading-snug'],
  plate: [
    'leading-snug',
    'leading-tight',
    'tracking-widest',
    'tracking-wider',
    'tracking-wide',
    'tracking-normal',
    'font-semibold',
    'font-bold',
  ],
  read: ['leading-snug', 'leading-tight'],
  title: ['leading-snug', 'leading-tight', 'font-semibold', 'font-bold'],
  marquee: ['leading-snug', 'leading-tight', 'leading-none', 'font-semibold', 'font-bold'],
  banner: ['leading-snug', 'leading-tight', 'leading-none', 'tracking-tight', 'font-bold'],
};

/**
 * Glyph geometry, not type — a size locked to a hard-coded px box. Left alone
 * here and allow-listed in scripts/check-type-scale.mjs. See the plan, §4a.
 */
const GLYPH_SIZES = new Set(['text-6xl', 'text-[0.65rem]']);
const GLYPH_FILES = new Set([path.join('src', 'components', 'statFold.tsx')]);
/** Exact class strings that are emoji sizing, not text. */
const GLYPH_STRINGS = new Set(['mb-2 animate-pulse text-2xl']);

const LEGACY_RE = /(^|\s)text-(2xs|xs|sm|base|lg|2xl|3xl|5xl|\[[\d.]+(px|rem|em)\])(\s|$)/;
const LEGACY_ANY = /(?:^|\s)text-(?:2xs|xs|sm|base|lg|2xl|3xl|5xl|\[[\d.]+(?:px|rem|em)\])(?:\s|$)/;

const files = [];
for (const t of TARGETS) {
  if (fs.statSync(t).isFile()) files.push(t);
  else
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name === 'i18n' || e.name === 'content') continue;
          walk(p);
        } else if (/\.tsx?$/.test(e.name)) files.push(p);
      }
    })(t);
}

const skipped = [];
let changedFiles = 0;
let rewritten = 0;

/**
 * Rewrite one class segment whose tokens are all fully delimited. Whitespace
 * runs are preserved verbatim so multi-line class strings keep their shape and
 * the diff stays readable.
 */
function rewriteSegment(seg, ctx) {
  const parts = seg.split(/(\s+)/); // even indices are words, odd are gaps
  const words = parts.filter((_, i) => i % 2 === 0).filter(Boolean);
  const sizes = words.filter((w) => SIZE_MAP[w]);
  if (!sizes.length) return seg;
  if (words.some((w) => GLYPH_SIZES.has(w))) return seg;

  const uppercase = words.includes('uppercase');
  const drop = new Set();
  const rename = new Map();
  for (const s of sizes) {
    const role = SIZE_MAP[s][uppercase ? 1 : 0];
    rename.set(s, 'text-' + role);
    for (const t of ABSORBED[role]) drop.add(t);
  }

  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i % 2 === 1) {
      // keep the gap only if it still separates two surviving words
      if (out.length && !/^\s+$/.test(out[out.length - 1])) out.push(p);
      continue;
    }
    if (!p) continue;
    if (drop.has(p)) continue;
    out.push(rename.get(p) ?? p);
  }
  while (out.length && /^\s+$/.test(out[out.length - 1])) out.pop();
  const next = out.join('');
  if (next !== seg) {
    rewritten++;
    ctx.changed = true;
  }
  return next;
}

/**
 * A static run of a template literal. If it abuts a ${} the touching token may
 * be a fragment (`text-x` + `${suffix}`), so peel those off and, if the size
 * class itself is in the fragment, report the site instead of guessing.
 */
function rewriteStatic(run, file, ctx, boundedLeft, boundedRight) {
  if (!run.trim() || !run.includes('text-')) return run;
  const startsMid = boundedLeft && !/^\s/.test(run);
  const endsMid = boundedRight && !/\s$/.test(run);

  const lead = startsMid ? run.match(/^\S*/)[0] : '';
  const tail = endsMid ? run.match(/\S*$/)[0] : '';
  const mid = run.slice(lead.length, run.length - tail.length);

  if (LEGACY_ANY.test(' ' + lead + ' ') || LEGACY_ANY.test(' ' + tail + ' ')) {
    skipped.push(file + ': size class abuts an interpolation — ' + run.trim().slice(0, 70));
    return run;
  }
  if (!mid.trim()) return run;
  const lw = mid.match(/^\s*/)[0];
  const tw = mid.match(/\s*$/)[0];
  return lead + lw + rewriteSegment(mid.trim(), ctx) + tw + tail;
}

/**
 * Hand-rolled literal scanner. A regex for this backtracks catastrophically on
 * files this size, and an apostrophe in a comment sends it hunting to EOF.
 */
function replaceLiterals(src, fn) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const e = src.indexOf('\n', i);
      const end = e === -1 ? src.length : e;
      out += src.slice(i, end);
      i = end;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e === -1 ? src.length : e + 2;
      out += src.slice(i, end);
      i = end;
      continue;
    }
    if (c !== '"' && c !== "'" && c !== '`') {
      out += c;
      i++;
      continue;
    }
    const quote = c;
    let j = i + 1;
    let depth = 0;
    let ok = false;
    for (; j < src.length; j++) {
      const d = src[j];
      if (d === '\\') {
        j++;
        continue;
      }
      if (quote === '`') {
        if (d === '{' && src[j - 1] === '$') depth++;
        else if (d === '}' && depth > 0) depth--;
        else if (d === '`' && depth === 0) {
          ok = true;
          break;
        }
        continue;
      }
      if (d === quote) {
        ok = true;
        break;
      }
      if (d === '\n') break; // unterminated quote — an apostrophe in prose
    }
    if (!ok) {
      out += c;
      i++;
      continue;
    }
    out += quote + fn(quote, src.slice(i + 1, j)) + quote;
    i = j + 1;
  }
  return out;
}

for (const file of files) {
  if (GLYPH_FILES.has(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const ctx = { changed: false };

  const out = replaceLiterals(src, (quote, body) => {
    if (!LEGACY_RE.test(body)) return body;
    if (GLYPH_STRINGS.has(body.trim())) return body;
    if (quote !== '`') {
      const lw = body.match(/^\s*/)[0];
      const tw = body.slice(lw.length).match(/\s*$/)[0];
      return lw + rewriteSegment(body.slice(lw.length, body.length - tw.length), ctx) + tw;
    }

    let i = 0;
    let res = '';
    const holes = [...body.matchAll(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g)];
    for (let k = 0; k < holes.length; k++) {
      const h = holes[k];
      // a run is only "bounded" on a side where a ${} actually touches it
      res += rewriteStatic(body.slice(i, h.index), file, ctx, k > 0, true);
      res += h[0];
      i = h.index + h[0].length;
    }
    res += rewriteStatic(body.slice(i), file, ctx, holes.length > 0, false);
    return res;
  });

  if (ctx.changed) {
    changedFiles++;
    if (WRITE) fs.writeFileSync(file, out);
  }
}

for (const s of [...new Set(skipped)]) console.log('SKIP  ' + s);
console.log(
  '\n' +
    (WRITE ? 'rewrote ' : 'would rewrite ') +
    rewritten +
    ' class string(s) in ' +
    changedFiles +
    ' file(s); ' +
    new Set(skipped).size +
    ' skipped for manual review',
);
