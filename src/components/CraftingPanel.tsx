import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { itemDef, ITEMS } from '../game/loot';
import { TEAR_HOURS, TEAR_RAGS_YIELD } from '../game/inventory';
import { countOf, DIRTY_WATER_DRINK_INFECTION, RECIPES, type CraftBlock } from '../game/crafting';
import { gameHour, surfaceSite } from '../game/facilities';
import { SiteFacilitiesPanel } from './SiteFacilitiesPanel';
import { sumTraitMod } from '../game/character';
import { skillMods } from '../game/skills';
import type { ItemDef, ItemInstance } from '../game/types';
import { itemIcon } from './Inventory/itemIcon';
import { itemStatLines } from './Inventory/itemStatLines';
import { Icon } from '../icons/Icon';
import { itemName, recipeBlurb, recipeName, useT } from '../i18n';
import { tip } from './tips';
import {
  browseCraftingRows, CRAFT_CATEGORIES, craftingRows, matchesCraftFilter,
  type CraftCategory, type CraftFilter, type CraftRecipeRow, type CraftSort,
} from './craftingCatalog';

const controlClass = 'min-h-11 min-w-0 rounded border border-white/20 bg-concrete-950 px-3 text-body text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';

/** Browse without spending anything; open a recipe to inspect it and craft. */
export function CraftingPanel() {
  const { t, locale } = useT();
  const { items, clothingTears, currentPositionId, hdb, craftItem, tearOwnClothes, character, skills, site, atSite, day, hour, busy } =
    useGame(useShallow((s) => ({
      items: s.items, clothingTears: s.clothingTears,
      currentPositionId: s.currentPositionId, hdb: s.hdb,
      craftItem: s.craftItem, tearOwnClothes: s.tearOwnClothes,
      character: s.character, skills: s.skills,
      site: surfaceSite(s)?.facilities, atSite: !!surfaceSite(s), day: s.day, hour: s.hour,
      busy: !!(s.combat || s.travelAnim || s.pendingSearch || s.pendingEvent),
    })));
  const [filter, setFilter] = useState<CraftFilter>('all');
  const [category, setCategory] = useState<CraftCategory>('all');
  const [sort, setSort] = useState<CraftSort>('ready');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [crafted, setCrafted] = useState<{ defId: string; count: number } | null>(null);
  const [mode, setMode] = useState<'hot' | 'room'>('room');
  const [waterSource, setWaterSource] = useState<'carried' | 'site'>('carried');
  const [kopi, setKopi] = useState('kopi');
  const [teh, setTeh] = useState('teh');
  const context = useMemo(() => ({ site, atSite, now: gameHour(day, hour), mode, waterSource }), [site, atSite, day, hour, mode, waterSource]);
  const atShelter = currentPositionId !== null || hdb !== null;
  const hasToolbox = countOf(items, 'toolbox') > 0;
  const craftCost = sumTraitMod(character?.traitIds ?? [], 'craftCostMod') + skillMods(skills).craftCostMod;
  const rows = useMemo(() => craftingRows(items, atShelter, craftCost, context), [items, atShelter, craftCost, context]);
  const matching = browseCraftingRows(rows, { query, category, filter: 'all', sort, locale });
  const visible = matching.filter((row) => matchesCraftFilter(row, filter))
    .filter(row => query || !row.recipe.family || row.recipe.id === (row.recipe.family === 'kopi' ? kopi : teh));
  const filtered = query !== '' || category !== 'all' || filter !== 'all';
  const reset = () => { setQuery(''); setCategory('all'); setFilter('all'); };
  const craft = (row: CraftRecipeRow) => {
    // The store can interrupt crafting when time advancement ends a run.
    const before = useGame.getState().items;
    craftItem(row.recipe.id, mode, waterSource);
    const after = useGame.getState();
    if (after.phase === 'game' && after.items !== before) {
      setCrafted({ defId: row.recipe.outputDefId, count: row.recipe.outputCount });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/15 pb-3" aria-label={t('ui.craft.workbench')}>
        <h4 className="text-plate uppercase text-white/55">{t('ui.craft.workbench')}</h4>
        <div className="flex flex-wrap gap-2">
          <StatusChip ready={atShelter} label={t(atShelter ? 'ui.craft.shelterOk' : 'ui.craft.shelterNo')} />
          <StatusChip ready={hasToolbox} label={t(hasToolbox ? 'ui.craft.toolboxOk' : 'ui.craft.toolboxNo')} />
        </div>
        <p className="basis-full text-body text-white/55">{t('ui.craft.browserHint')}</p>
      </section>

      <SiteFacilitiesPanel />
      <details className="rounded border border-white/15 p-3">
        <summary className="min-h-11 cursor-pointer text-body text-white/80 focus-visible:outline focus-visible:outline-signal">
          {t('ui.craft.options')}
          <span className="mt-1 block text-white/55">{t(mode === 'room' ? 'ui.craft.roomMode' : 'ui.craft.hotMode')} · {t(waterSource === 'site' ? 'ui.craft.siteWater' : 'ui.craft.carriedWater')}</span>
        </summary>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-label text-white/65">{t('ui.craft.preparation')}
          <select aria-label={t('ui.craft.preparation')} className={controlClass} value={mode} onChange={e => setMode(e.target.value as 'hot' | 'room')}>
            <option value="room">{t('ui.craft.roomMode')}</option><option value="hot">{t('ui.craft.hotMode')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label text-white/65">{t('ui.craft.waterSource')}
          <select aria-label={t('ui.craft.waterSource')} className={controlClass} value={waterSource} onChange={e => setWaterSource(e.target.value as 'carried' | 'site')}>
            <option value="carried">{t('ui.craft.carriedWater')}</option><option value="site">{t('ui.craft.siteWater')}</option>
          </select>
        </label>
        {(['kopi', 'teh'] as const).map(family => <label key={family} className="flex flex-col gap-1 text-label text-white/65">{t(`ui.craft.family.${family}`)}
          <select aria-label={t(`ui.craft.family.${family}`)} className={controlClass} value={family === 'kopi' ? kopi : teh} onChange={e => { (family === 'kopi' ? setKopi : setTeh)(e.target.value); setSelected(e.target.value); }}>
            {RECIPES.filter(r => r.family === family).map(r => <option key={r.id} value={r.id}>{itemName(r.outputDefId, locale)}</option>)}
          </select>
        </label>)}
      </div>
      <p className="mt-2 text-body text-white/55">{t('ui.craft.preparationHint')}</p>
      </details>

      <div className="flex flex-col gap-2">
        <div className="relative flex">
          <input
            type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            aria-label={t('ui.craft.search')} placeholder={t('ui.craft.search')}
            className={`${controlClass} w-full pr-16 [&::-webkit-search-cancel-button]:appearance-none`}
          />
          {query && <button type="button" onClick={() => setQuery('')} className={`absolute inset-y-0 right-0 px-3 text-body text-white/65 ${focusClass}`}>{t('ui.craft.clear')}</button>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-label uppercase text-white/55">
            {t('ui.craft.categoryLabel')}
            <select aria-label={t('ui.craft.categoryLabel')} value={category} onChange={(event) => setCategory(event.target.value as CraftCategory)} className={controlClass}>
              {CRAFT_CATEGORIES.map((id) => <option key={id} value={id}>{t(`ui.craft.categories.${id}`)}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-label uppercase text-white/55">
            {t('ui.craft.sortLabel')}
            <select aria-label={t('ui.craft.sortLabel')} value={sort} onChange={(event) => setSort(event.target.value as CraftSort)} className={controlClass}>
              <option value="ready">{t('ui.craft.sortReady')}</option>
              <option value="time">{t('ui.craft.sortTime')}</option>
              <option value="name">{t('ui.craft.sortName')}</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('ui.craft.availability')}>
          {(['all', 'ready', 'almost'] as const).map((id) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
              className={`flex min-h-11 items-center gap-2 rounded border px-3 text-body ${focusClass} ${filter === id ? 'border-signal/60 bg-signal/10 text-signal' : 'border-white/15 text-white/65 hover:bg-white/5'}`}>
              {t(id === 'all' ? 'ui.craft.filterAll' : id === 'ready' ? 'ui.craft.filterReady' : 'ui.craft.filterAlmost')}
              <span className="tabular-nums text-white/50">{matching.filter((row) => matchesCraftFilter(row, id)).length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-body text-white/55">
        <span role="status">{t('ui.craft.showing', { n: visible.length, total: rows.length })}</span>
        {filtered ? <button type="button" onClick={reset} className={`min-h-9 underline underline-offset-4 hover:text-white ${focusClass}`}>{t('ui.craft.reset')}</button> : <span>{t('ui.craft.countLegend')}</span>}
      </div>
      <div role="status" aria-live="polite" className={crafted ? 'border-l-2 border-astral bg-astral/5 px-3 py-2 text-body text-astral' : 'sr-only'}>
        {crafted && t('ui.craft.made', { n: crafted.count, name: itemName(crafted.defId, locale) })}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded border border-dashed border-white/20 p-5">
          <p className="text-read text-white/85">{t('ui.craft.noMatches')}</p>
          <p className="max-w-prose text-body text-white/55">{t(filter === 'ready' ? 'ui.craft.noneReady' : filter === 'almost' ? 'ui.craft.noneAlmost' : 'ui.craft.trySearch')}</p>
          <button type="button" onClick={reset} className={`${controlClass} hover:bg-white/10`}>{t('ui.craft.reset')}</button>
        </div>
      ) : (
        <div className="grid items-start gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
          {visible.map((row) => <RecipeCard key={row.recipe.id} row={row} atShelter={atShelter} busy={busy}
            expanded={selected === row.recipe.id}
            onToggle={() => setSelected(selected === row.recipe.id ? null : row.recipe.id)}
            onCraft={() => craft(row)} />)}
        </div>
      )}

      <details className="rounded border border-white/15 bg-black/15">
        <summary className={`flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 p-3 text-body text-white/70 ${focusClass}`}>
          <Icon name={itemIcon(itemDef('cloth_rags'))} size={20} />
          <span className="flex-1">{t('ui.craft.tearName')}</span>
          <span className="text-white/45">{t('ui.craft.tearRemaining', { n: clothingTears })}</span>
          <span aria-hidden="true">＋</span>
        </summary>
        <div className="space-y-3 border-t border-white/10 p-3 text-body">
          <p className="text-white/60">{t(clothingTears > 0 ? 'ui.craft.tearBlurb' : 'ui.craft.tearNone')}</p>
          {clothingTears > 0 && <button type="button" onClick={tearOwnClothes} className={`${controlClass} hover:bg-white/10`}>
            {t('ui.craft.tearAction', { n: TEAR_RAGS_YIELD })} · {t('ui.craft.hoursShort', { h: TEAR_HOURS })}
          </button>}
        </div>
      </details>
    </div>
  );
}

function StatusChip({ ready, label }: { ready: boolean; label: string }) {
  return <span className={`inline-flex items-center gap-1.5 text-body ${ready ? 'text-white/85' : 'text-white/50'}`}>
    <span aria-hidden="true">{ready ? '✓' : '−'}</span>{label}
  </span>;
}

function RecipeCard({ row, atShelter, expanded, onToggle, onCraft, busy }: {
  row: CraftRecipeRow; atShelter: boolean; expanded: boolean; onToggle: () => void; onCraft: () => void; busy: boolean;
}) {
  const { t, locale } = useT();
  const { recipe, ingredients, check } = row;
  const out = itemDef(recipe.outputDefId);
  const name = itemName(out.id, locale);
  const detailsId = `craft-details-${recipe.id}`;
  return <article className={`min-w-0 rounded border ${expanded ? 'border-white/50 bg-white/[0.04]' : check.ok ? 'border-astral/40 bg-astral/[0.03]' : 'border-white/15 bg-black/10'}`}>
    <button type="button" aria-expanded={expanded} aria-controls={detailsId}
      aria-label={t('ui.craft.inspect', { name })} onClick={onToggle}
      className={`flex w-full flex-col gap-3 p-3 text-left hover:bg-white/[0.04] ${focusClass}`}>
      <span className="flex w-full items-start gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/10 bg-black/25"><Icon name={itemIcon(out)} size={28} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-read font-semibold text-white/90">{name}{recipe.outputCount > 1 && <span className="ml-1 text-white/60">×{recipe.outputCount}</span>}</span>
          <span className="mt-1 block text-body text-white/50">{t(`ui.craft.categories.${row.category}`)}</span>
        </span>
        <span className="shrink-0 text-body tabular-nums text-white/65">{t('ui.craft.hoursShort', { h: recipe.hours })}</span>
      </span>
      <span className="flex min-h-7 flex-wrap items-center gap-1.5" aria-label={t('ui.craft.ingredients')}>
        {ingredients.map((input) => <RecipeInputChip key={input.defId} {...input} showRatio nameOverride={input.water ? t('ui.craft.anyWater') : undefined} />)}
        {recipe.tool && <RecipeInputChip defId={recipe.tool} need={1} have={row.toolHave} role="tool" />}
      </span>
      <span className="flex w-full flex-wrap items-center gap-2 text-body">
        <span className={recipe.needsShelter && !atShelter ? 'text-hiss' : 'text-white/55'}>{t(recipe.needsShelter ? 'ui.craft.groupShelter' : 'ui.craft.groupField')}{recipe.needsShelter && !atShelter ? ' −' : ''}</span>
        {check.ok && <span className="text-astral">✓ {t('ui.craft.filterReady')}</span>}
        <span className="ml-auto text-white/65">{t('ui.craft.details')} <span aria-hidden="true">{expanded ? '−' : '+'}</span></span>
      </span>
    </button>
    <div id={detailsId} hidden={!expanded} className="border-t border-white/15 p-3">{expanded && <RecipeDetails row={row} atShelter={atShelter} onCraft={onCraft} busy={busy} />}</div>
  </article>;
}

function RecipeDetails({ row, atShelter, onCraft, busy }: { row: CraftRecipeRow; atShelter: boolean; onCraft: () => void; busy: boolean }) {
  const { t, locale } = useT();
  const equipment = useGame((s) => s.equipment);
  const { recipe, ingredients } = row;
  const out = itemDef(recipe.outputDefId);
  const preview: ItemInstance = { uid: `craft-${recipe.id}`, defId: out.id, container: 'backpack', x: 0, y: 0, rotated: false, stack: recipe.outputCount, coldPrepared: recipe.preparation === 'drink' && row.context.mode === 'room' };
  const stats = itemStatLines(out, preview, equipment, t).filter((line) => line.key !== 'val');
  return <div className="space-y-3 text-body">
    <div>
      <h5 className="text-read font-semibold text-white/85">{recipeName(recipe.id, locale)}</h5>
      <p className="mt-1 text-white/60">{recipeBlurb(recipe.id, locale)}</p>
    </div>
    {stats.length > 0 && <dl className="space-y-1 border-y border-white/10 py-2">
      {stats.map((line) => <div key={`${line.key}-${line.label}`} className="flex justify-between gap-2">
        <dt className="text-white/55">{line.label}</dt><dd className="text-white/85">{line.value}</dd>
      </div>)}
    </dl>}
    <div>
      <div className="mb-2 flex justify-between gap-2 text-label uppercase text-white/50"><h5>{t('ui.craft.ingredients')}</h5><span>{t('ui.craft.countLegend')}</span></div>
      <ul className="space-y-2">
        {ingredients.map((input) => <li key={input.defId} className="flex items-center gap-2">
          <Icon name={itemIcon(itemDef(input.defId))} size={18} />
          <span className="min-w-0 flex-1 text-white/75">{input.water ? t('ui.craft.anyWater') : itemName(input.defId, locale)}</span>
          <span className={`shrink-0 tabular-nums ${input.have < input.need ? 'text-hiss' : 'text-white/85'}`}>{input.have}/{input.need}</span>
        </li>)}
      </ul>
    </div>
    {(recipe.needsShelter || recipe.tool) && <div className="space-y-1 border-t border-white/10 pt-2">
      {recipe.needsShelter && <StatusChip ready={atShelter} label={t('ui.craft.shelterRequirement')} />}
      {recipe.tool && <StatusChip ready={row.toolHave > 0} label={t('ui.craft.toolKept', { name: itemName(recipe.tool, locale) })} />}
    </div>}
    {recipe.id === 'boil' && <p className="text-white/65">{t('ui.craft.boilNote')}</p>}
    {recipe.facility && <p className="text-signal">{t('ui.craft.staysHere')}</p>}
    {preview.coldPrepared && <p className="text-white/65">{t('ui.craft.roomPenalty')}</p>}
    {row.waterId === 'dirty_water' && preview.coldPrepared && <p className="text-hiss">{t('ui.craft.unsafeWater', { n: DIRTY_WATER_DRINK_INFECTION })}</p>}
    {row.check.block && <p className="text-hiss">{craftBlockText(row.check.block, t, locale)}</p>}
    {busy && <p className="text-hiss">{t('ui.craft.busy')}</p>}
    <button type="button" disabled={!row.check.ok || busy} onClick={onCraft}
      className={`min-h-11 w-full rounded border border-signal/50 bg-signal px-3 text-read font-semibold text-concrete-950 hover:bg-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/40 ${focusClass}`}>
      {t(row.check.ok ? 'ui.craft.craftAction' : 'ui.craft.unavailable')} · {t('ui.craft.hoursShort', { h: recipe.hours })}
    </button>
  </div>;
}

function craftBlockText(block: CraftBlock, t: (key: string, vars?: Record<string, string | number>) => string, locale: 'en' | 'zh-Hans'): string {
  if (block.kind === 'input') return t('ui.craft.needHave', { name: itemName(block.defId, locale), need: block.need, have: block.have });
  if (block.kind === 'tool') return t('ui.craft.toolKept', { name: itemName(block.defId, locale) });
  if (block.kind === 'water') return t('ui.craft.needHave', { name: t('ui.craft.anyWater'), need: block.need, have: block.have });
  if (block.kind === 'shelter') return t('ui.craft.shelterRequirement');
  return t(`ui.craft.block.${block.kind}`);
}

/** Shared with the DEV recipe editor. Tool chips retain their dashed outline. */
export function RecipeInputChip({
  defId,
  need,
  have,
  role = 'input',
  def,
  nameOverride,
  showRatio = false,
}: {
  defId: string;
  need: number;
  have: number;
  role?: 'input' | 'tool';
  def?: ItemDef;
  nameOverride?: string;
  showRatio?: boolean;
}) {
  const { t, locale } = useT();
  const resolved = def ?? ITEMS[defId];
  if (!resolved) return null;

  const name = nameOverride ?? itemName(defId, locale);
  const short = have < need;
  const text =
    role === 'tool'
      ? t('ui.craft.toolTip', { name, have })
      : t('ui.craft.needHave', { name, need, have });

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center border ${showRatio ? 'h-8 w-8' : 'h-7 w-7'} ${
        role === 'tool' ? 'border-dashed' : ''
      } ${short ? 'border-hiss/50 bg-hiss/10' : 'border-white/15 bg-black/40'}`}
      {...tip(text, { label: true })}
    >
      <Icon name={itemIcon(resolved)} size={18} className={short ? 'opacity-40' : undefined} />
      {role === 'tool' ? (
        <span className="pointer-events-none absolute -left-0.5 -top-0.5 rounded bg-black/80 text-white/80">
          <Icon name="action.craft" size={10} />
        </span>
      ) : null}
      <span
        className={`pointer-events-none absolute -bottom-px -right-px rounded-tl bg-black/75 px-0.5 text-micro font-bold tabular-nums ${
          short ? 'text-hiss' : 'text-white'
        }`}
      >
        {short || showRatio ? `${have}/${need}` : need}
      </span>
    </span>
  );
}
