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
  { re: /底层空地/g, msg: 'use 组屋底层 (glossary)' },
  { re: /底层公共空间/g, msg: 'use 组屋底层 (glossary)' },
  { re: /召集队/g, msg: 'use 集合军 for Muster (glossary)' },
  { re: /88\s*帮/g, msg: 'use 双八 / 双八会 (glossary)' },
  { re: /饥饿度|口渴度/g, msg: 'positive meters are 饱食度 / 水分, not hunger / thirst severity' },
  { re: /囤点|囤入/g, msg: 'use 储藏点 for the place and 存放 for the action' },
  { re: /往往日日志|(?<!往)日日志/g, msg: 'use 往日日志 (glossary)' },
  { re: /脑筋|旅行速度|组屋破门热量/g, msg: 'use consistent stat labels: 机智 / 赶路速度 / 热度' },
  { re: /签名特质|软漏斗|撤离垫|拉起频道/g, msg: 'rewrite literal calques in natural Chinese' },
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
