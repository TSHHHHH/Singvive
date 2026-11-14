import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import en from './messages/en.json';
import zh from './messages/zh-Hans.json';
import { ensureLocale, flattenMessages, lookupNode, t } from './t';
import { OCCUPATIONS } from '../game/occupations';
import { SKILL_IDS } from '../game/skills';
import { TRAIT_TAG_ORDER } from '../game/traitTags';
import { ATTRIBUTE_KEYS, TRAITS, attributeEffects, pickBlockReason } from '../game/character';
import { BODY_PART_IDS, meterModifiers } from '../game/survival';
import { POI_CATEGORIES } from '../game/poi';
import { STANCES, TERRAIN } from '../game/combat';
import { HAZARD_CONFIG } from '../game/wilds';
import { TUNNEL_HAZARD, TUNNEL_NODE_META } from '../game/tunnelRun';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const sources = readdirSync(sourceRoot, { recursive: true })
  .filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.') && !file.startsWith(`dev${path.sep}`))
  .map((file) => ts.createSourceFile(file, readFileSync(path.join(sourceRoot, file), 'utf8'), ts.ScriptTarget.Latest, true));
const at = (source: ts.SourceFile, node: ts.Node) =>
  `${source.fileName}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;

describe('localization catalog integrity', () => {
  it('keeps every Chinese leaf and list entry present and nonempty, without English fallback', () => {
    const english = flattenMessages(en);
    const chinese = flattenMessages(zh);
    expect(chinese.map(({ key }) => key).sort()).toEqual(english.map(({ key }) => key).sort());
    expect(chinese.filter(({ value }) => !value.trim())).toEqual([]);
    // Equal flattened paths alone would allow an array to accidentally become an object.
    const shape = (value: unknown): unknown => {
      if (typeof value === 'string') return 'string';
      if (Array.isArray(value)) return value.map(shape);
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shape(v)]));
    };
    expect(shape(zh)).toEqual(shape(en));
  });

  it('preserves interpolation variables and rejects syntax unsupported by the translator', () => {
    const chinese = new Map(flattenMessages(zh).map(({ key, value }) => [key, value]));
    const variables = (value: string) => [...new Set([...value.matchAll(/#?\{(\w+)\}/g)].map((m) => m[1]))].sort();
    for (const { key, value } of flattenMessages(en)) {
      expect(variables(chinese.get(key)!), key).toEqual(variables(value));
      expect(value, key).not.toMatch(/\{\w+,\s*(plural|select|selectordinal)\b/);
      expect(chinese.get(key), key).not.toMatch(/\{\w+,\s*(plural|select|selectordinal)\b/);
    }
  });

  it('resolves literal UI keys and literal translation calls in production source', () => {
    const missing: string[] = [];
    for (const source of sources) {
      const check = (node: ts.Node, key: string) => {
        const value = lookupNode(en, key);
        if (value === undefined || value === '') missing.push(`${at(source, node)} ${key}`);
      };
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteralLike(node) && /^ui\.[\w.-]+$/.test(node.text)) check(node, node.text);
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t', 'tr', 'tList', 'msgOr', 'ev'].includes(node.expression.text)) {
          const key = node.arguments[0];
          if (key && ts.isStringLiteralLike(key)) check(key, node.expression.text === 'ev' ? `event.${key.text}` : key.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(missing).toEqual([]);
  });

  it('keeps player-facing JSX text and accessibility labels in the catalogs', () => {
    const untranslated: string[] = [];
    const invariantText = new Set(['SINGVIVE', 'kg']);
    for (const source of sources) {
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node)) {
          const text = node.text.trim();
          if (/[a-z]{2}/i.test(text) && !invariantText.has(text)) untranslated.push(`${at(source, node)} ${text}`);
        }
        if (ts.isJsxAttribute(node) && ['title', 'aria-label', 'placeholder', 'alt'].includes(node.name.getText(source))) {
          const value = node.initializer;
          if (value && ts.isStringLiteral(value) && /[a-z]{2}/i.test(value.text)) untranslated.push(`${at(source, node)} ${value.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(untranslated).toEqual([]);
  });

  it('covers the dynamic UI families using their real content ids in both catalogs', () => {
    const keys = [
      ...OCCUPATIONS.flatMap(({ id }) => ['name', 'tagline', 'blurb', 'goodAt', 'strugglesWith'].map((field) => `occupation.${id}.${field}`)),
      ...SKILL_IDS.flatMap((id) => [`ui.skills.names.${id}`, `ui.skills.descriptions.${id}`]),
      ...TRAIT_TAG_ORDER.map((id) => `ui.create.tags.${id}`),
      ...ATTRIBUTE_KEYS.map((id) => `ui.attributes.blurb.${id}`),
      ...BODY_PART_IDS.map((id) => `ui.body.parts.${id}`),
      ...POI_CATEGORIES.flatMap((id) => [`ui.location.blurb.${id}`, `ui.location.finds.${id}`]),
      ...Object.keys(STANCES).map((id) => `ui.combat.stanceHint.${id}`),
      ...Object.keys(TERRAIN).map((id) => `ui.combat.terrain.${id}`),
      ...Object.keys(HAZARD_CONFIG).flatMap((id) => [`ui.hazards.${id}.label`, `ui.hazards.${id}.blurb`]),
      ...Object.keys(TUNNEL_NODE_META).flatMap((id) => ['label', 'verb', 'blurb'].map((field) => `ui.tunnel.meta.${id}.${field}`)),
      ...Object.keys(TUNNEL_HAZARD).flatMap((id) => ['label', 'blurb'].map((field) => `ui.tunnel.hazard.${id}.${field}`)),
      ...['gear', 'medicine', 'perishable'].flatMap((family) => ['torn', 'used', 'worn', 'pristine'].map((tier) => `ui.inventory.condition.${family}.${tier}`)),
      ...['open', 'roofed', 'enclosed'].flatMap((shelter) => ['ground', 'bed'].map((bed) => `ui.sleep.summary.${shelter}.${bed}`)),
    ];
    for (const catalog of [en, zh]) expect(keys.filter((key) => lookupNode(catalog, key) == null)).toEqual([]);
  });

  it('keeps localized trait effect lists in sync when game effects change', () => {
    for (const trait of TRAITS) {
      // A translated array replaces the entire fallback list. Missing skill
      // bonuses used to silently disappear in both languages after rebalance.
      expect(lookupNode(en, `trait.${trait.id}.effects`), trait.id).toEqual(trait.effects);
      expect(lookupNode(zh, `trait.${trait.id}.effects`), trait.id).toHaveLength(trait.effects.length);
    }
  });
});

describe('localized dynamic copy', () => {
  beforeAll(() => ensureLocale('zh-Hans'));

  it('renders lead counts without leaking plural syntax', () => {
    for (const locale of ['en', 'zh-Hans'] as const) for (const count of [0, 1, 2]) {
      for (const key of ['ui.objective.leadsNotes', 'ui.objective.leadsRumours']) {
        const label = t(key, { count }, locale);
        expect(label).toContain(String(count));
        expect(label).not.toMatch(/[{}]/);
      }
    }
  });

  it('translates attribute and meter effects while preserving their direction', () => {
    for (const attr of ATTRIBUTE_KEYS) for (const value of [3, 7]) {
      const english = attributeEffects(attr, value);
      const chinese = attributeEffects(attr, value, 'zh-Hans');
      expect(chinese.map((effect) => effect.good)).toEqual(english.map((effect) => effect.good));
      expect(chinese.every((effect) => /\p{Script=Han}/u.test(effect.label))).toBe(true);
    }
    for (const meter of ['hunger', 'thirst', 'energy'] as const) for (const value of [10, 90]) {
      const meters = { hunger: value, thirst: value, energy: value };
      const english = meterModifiers(meter, meters);
      const chinese = meterModifiers(meter, meters, 'zh-Hans');
      expect(chinese.map((effect) => effect.good)).toEqual(english.map((effect) => effect.good));
      expect(chinese.every((effect) => /\p{Script=Han}/u.test(effect.text))).toBe(true);
    }
  });

  it('translates blocked trait picks without changing legality', () => {
    expect(pickBlockReason('local_contacts', [], 'zh-Hans')).toBe('点数不足');
    expect(pickBlockReason('local_contacts', [])).toBe('not enough points');
    expect(pickBlockReason('local_contacts', ['local_contacts'], 'zh-Hans')).toBeNull();
  });
});
