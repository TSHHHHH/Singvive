/**
 * Keeps the type scale from drifting back.
 *
 * Every typographic value in the app comes from src/ui/type.ts — as a Tailwind
 * role class (text-body, text-label, …), as a --type-* custom property in
 * index.css, or via typeCss() in the imperative Leaflet label builders. This
 * script fails the build on anything that reaches around that.
 *
 * oxlint can't express these: it has no no-restricted-syntax and no JS-plugin
 * hook, and nothing in its rule set inspects string-literal contents against a
 * user-supplied pattern. Hence a script, wired into `npm run lint`.
 *
 *   node scripts/check-type-scale.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Icon and glyph geometry: a size locked to a hard-coded px box, which must NOT
 * scale with the player's Font size setting. Adding an entry here takes a code
 * change, which is the point — the exception shows up in review.
 */
const ALLOW = [
  { file: 'src/components/mapIcons.ts', reason: 'glyph centred in a fixed-size map pin' },
  { file: 'src/icons/markup.ts', reason: 'emoji branch must match the <img> width exactly' },
  { file: 'src/icons/Icon.tsx', reason: 'emoji branch must match the <img> width exactly' },
  { file: 'src/components/statFold.tsx', reason: 'stacked chevrons inside a 24px button' },
  { file: 'src/components/LocationCard.tsx', reason: 'standing rung mark' },
  { file: 'src/components/ErrorBoundary.tsx', reason: 'decorative emoji' },
  { file: 'src/screens/DeathScreen.tsx', reason: 'decorative emoji' },
  { file: 'src/screens/SpawnSelect.tsx', reason: 'decorative emoji' },
  { file: 'src/components/HdbDungeonModal.tsx', reason: 'container-query cell glyph' },
];
const allowed = new Set(ALLOW.map((a) => path.normalize(a.file)));

const RULES = [
  {
    re: /\btext-\[[\d.]+(px|rem|em)\]/g,
    msg: 'arbitrary font size — pick a role from src/ui/type.ts',
    allowlisted: true,
  },
  {
    re: /\b(leading|tracking)-\[/g,
    msg: 'arbitrary line-height / letter-spacing — the role should carry it',
    allowlisted: true,
  },
  {
    re: /\btext-(2xs|xs|sm|base|lg|[2-9]?xl)\b/g,
    msg: 'the old size scale no longer exists — this class compiles to nothing',
  },
  {
    re: /\bfont-(thin|extralight|light|medium|extrabold|black)\b/g,
    msg: 'weight not loaded for Noto Sans SC (index.html loads 400/600/700 only)',
  },
  { re: /\bfont-(mono|sans|serif)\b/g, msg: 'one family only, set on body from src/ui/type.ts' },
  {
    // A declaration is fine when its value comes from the scale.
    re: /(font-size|font-weight|letter-spacing)\s*:\s*(?!var\(--type-)/g,
    msg: 'imperative typography — use typeCss() from src/ui/type.ts',
    allowlisted: true,
  },
];

/** The scale itself is the one file allowed to spell these values out. */
const SOURCE_OF_TRUTH = path.normalize('src/ui/type.ts');

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && path.normalize(p) !== SOURCE_OF_TRUTH) files.push(p);
  }
})('src');

const problems = [];
for (const file of files) {
  const isAllowed = allowed.has(path.normalize(file));
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.allowlisted && isAllowed) continue;
      rule.re.lastIndex = 0;
      const m = rule.re.exec(line);
      if (m) problems.push(`${file}:${i + 1}: ${m[0]} — ${rule.msg}`);
    }
  });
}

// index.css may reach the scale only through the --type-* custom properties.
const css = fs.readFileSync(path.join('src', 'index.css'), 'utf8').split(/\r?\n/);
css.forEach((line, i) => {
  const m = /font-size\s*:\s*([^;]+)/.exec(line);
  // The zh-Hans legibility lift is a deliberate locale override of a role, not
  // a new size, so it is the one literal value index.css may name.
  if (m && !/^var\(--type-/.test(m[1].trim()) && !/0\.6875rem/.test(m[1])) {
    problems.push(`src/index.css:${i + 1}: font-size: ${m[1].trim()} — use var(--type-<role>-size)`);
  }
});

if (problems.length) {
  console.error('Type scale violations:\n');
  for (const p of problems) console.error('  ' + p);
  console.error(
    `\n${problems.length} violation(s). The scale lives in src/ui/type.ts — add a role there rather than a one-off value.`,
  );
  process.exit(1);
}
console.log('type scale: clean');
