/**
 * Fails if zh-Hans catalog regresses to banned glossary / calque patterns.
 *
 *   node scripts/check-zh-hans-glossary.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/i18n/messages/zh-Hans.json');
const text = fs.readFileSync(file, 'utf8');

/** @type {{ re: RegExp; msg: string }[]} */
const RULES = [
  { re: /派系/g, msg: 'use 势力 (glossary)' },
  { re: /尸群/g, msg: 'use 尸潮 (glossary)' },
  { re: /\bauntie\b/gi, msg: 'translate auntie → 阿姨' },
  { re: /门赢了/g, msg: 'calque — rewrite fail line (not sports personification)' },
  { re: /路障赢了/g, msg: 'calque — rewrite fail line (not sports personification)' },
];

const hits = [];
for (const { re, msg } of RULES) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const line = text.slice(0, m.index).split('\n').length;
    hits.push({ line, match: m[0], msg });
  }
}

if (hits.length) {
  console.error(`zh-Hans glossary lint failed (${hits.length}):`);
  for (const h of hits) {
    console.error(`  L${h.line}: "${h.match}" — ${h.msg}`);
  }
  process.exit(1);
}

console.log('zh-Hans glossary lint ok');
