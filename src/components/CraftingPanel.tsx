import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { itemDef, ITEMS } from '../game/loot';
import { canTearForRags, garmentTearsLeft, TEAR_HOURS, TEAR_RAGS_YIELD } from '../game/inventory';
import { countOf, type CraftBlock } from '../game/crafting';
import { collectedRain, gameHour, heatRemaining, surfaceSite, type SiteFacilities } from '../game/facilities';
import { ItemHoverCard } from './Inventory/ItemHoverCard';
import { useCoarsePointer } from './tips/useCoarsePointer';
import { sumTraitMod } from '../game/character';
import { skillMods } from '../game/skills';
import type { EquipSlot, ItemDef, ItemInstance, ItemPrep } from '../game/types';
import { itemIcon } from './Inventory/itemIcon';
import { itemStatLines } from './Inventory/itemStatLines';
import { Icon } from '../icons/Icon';
import { instanceName, itemName, recipeBlurb, recipeName, useT } from '../i18n';
import { tip } from './tips';
import {
  browseCraftEntries, CRAFT_CATEGORIES, craftingRows, groupCraftRows, tearRow, TEAR_RECIPE_ID,
  type CraftCategory, type CraftEntry, type CraftEntryView, type CraftFilter, type CraftRecipeRow, type CraftSort,
} from './craftingCatalog';

const controlClass = 'min-h-11 min-w-0 rounded border border-white/20 bg-concrete-950 px-3 text-body text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
const selectClass = 'min-h-9 min-w-0 rounded border border-white/15 bg-concrete-950 px-2 text-body text-white/80 [@media(pointer:coarse)]:min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
const chipClass = 'flex min-h-9 items-center gap-1.5 rounded border px-2.5 text-body [@media(pointer:coarse)]:min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';

const VARIANT_STORE = 'singvive.craftVariants.v1';
function loadVariantPicks(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VARIANT_STORE) ?? '{}') as Record<string, string>; } catch { return {}; }
}
function saveVariantPicks(picks: Record<string, string>) {
  try { localStorage.setItem(VARIANT_STORE, JSON.stringify(picks)); } catch { /* per-viewer convenience only */ }
}

/** Worn slots whose garment can be cut into strips, in body order. */
const TEAR_SLOTS: EquipSlot[] = ['head', 'body', 'legs'];

interface TearSource { id: string; label: string; usesLeft: number }

/** The shortest drink takes this long; enough heat for it means "hot" is the sensible default. */
const QUICKEST_DRINK_HOURS = 0.25;

/** Browse without spending anything; one thin strip per thing you can make, click to open it. */
export function CraftingPanel() {
  const { t, locale } = useT();
  const { items, clothingTears, craftItem, tearOwnClothes, tearForRags, character, skills, site, atSite, day, hour, busy, equipment, seed } =
    useGame(useShallow((s) => ({
      items: s.items, clothingTears: s.clothingTears, seed: s.seed,
      craftItem: s.craftItem, tearOwnClothes: s.tearOwnClothes, tearForRags: s.tearForRags,
      character: s.character, skills: s.skills,
      site: surfaceSite(s)?.facilities, atSite: !!surfaceSite(s), day: s.day, hour: s.hour,
      busy: !!(s.combat || s.travelAnim || s.pendingSearch || s.pendingEvent),
      equipment: s.equipment,
    })));
  const coarse = useCoarsePointer();
  const [filter, setFilter] = useState<CraftFilter>('all');
  const [category, setCategory] = useState<CraftCategory>('all');
  const [sort, setSort] = useState<CraftSort>('ready');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [crafted, setCrafted] = useState<{ defId: string; prep: ItemPrep; count: number; loose: number } | null>(null);
  const [modePick, setModePick] = useState<'auto' | 'hot' | 'room'>('auto');
  const [waterPick, setWaterPick] = useState<'carried' | 'site'>('carried');
  const [picks, setPicks] = useState<Record<string, string>>(loadVariantPicks);
  const [hover, setHover] = useState<{ row: CraftRecipeRow; x: number; y: number } | null>(null);
  const [frozen, setFrozen] = useState<{ keys: string[]; browseKey: string } | null>(null);
  const now = gameHour(day, hour);
  const heat = heatRemaining(site, now);
  // Hot when you can (pot + heat here), room temperature otherwise — the player can still override per drink.
  const mode: 'hot' | 'room' = modePick !== 'auto' ? modePick
    : atSite && countOf(items, 'cooking_pot') > 0 && heat >= QUICKEST_DRINK_HOURS ? 'hot' : 'room';
  const siteWater = atSite ? (site?.water?.amount ?? 0) : 0;
  const waterSource: 'carried' | 'site' = siteWater > 0 ? waterPick : 'carried';
  const context = useMemo(() => ({ site, atSite, now, mode, waterSource }), [site, atSite, now, mode, waterSource]);
  const craftCost = sumTraitMod(character?.traitIds ?? [], 'craftCostMod') + skillMods(skills).craftCostMod;
  const [tearPick, setTearPick] = useState<string>('own');
  // What you can cut strips from: the clothes on your back, or any cloth garment you are wearing.
  const tearSources = useMemo<TearSource[]>(() => [
    { id: 'own', label: t('ui.craft.tearOwn', { n: clothingTears }), usesLeft: clothingTears },
    ...TEAR_SLOTS.flatMap((slot) => {
      const inst = equipment[slot];
      if (!inst || !canTearForRags(itemDef(inst.defId))) return [];
      const usesLeft = garmentTearsLeft(inst);
      return [{ id: inst.uid, usesLeft, label: t('ui.craft.tearGarment', { slot: t(`ui.slots.${slot}`), item: itemName(inst.defId, locale), n: usesLeft }) }];
    }),
  ], [equipment, clothingTears, t, locale]);
  const tearSource = tearSources.find((source) => source.id === tearPick) ?? tearSources[0];
  // The workbench rule is off for now, so every recipe is checked as if at a workbench.
  const rows = useMemo(() => [
    ...craftingRows(items, true, craftCost, context),
    tearRow(tearSource.usesLeft, TEAR_HOURS, TEAR_RAGS_YIELD, context, tearSource.id !== 'own'),
  ], [items, craftCost, context, tearSource]);
  const entries = useMemo(() => groupCraftRows(rows), [rows]);
  const browse = { query, category, sort, locale };
  const browseKey = `${query}|${category}|${filter}|${sort}`;
  const entryName = (entry: CraftEntry) => entry.family ? t(`ui.craft.family.${entry.family}`) : itemName(entry.variants[0].recipe.outputDefId, locale);
  const sorted = browseCraftEntries(entries, { ...browse, filter }, picks, { expanded: selected, entryName });
  // While a strip is open, the list keeps the order it had when the strip opened: crafting, a variant
  // pick or a hot/room switch changes readiness, and the strip must not jump away from the pointer.
  const views = frozen && selected !== null && frozen.browseKey === browseKey ? keepOrder(sorted, frozen.keys) : sorted;
  const counts = Object.fromEntries((['all', 'ready', 'almost'] as const).map((id) => [id, browseCraftEntries(entries, { ...browse, filter: id }, picks).length]));
  const categoryCounts = Object.fromEntries(CRAFT_CATEGORIES.map((id) => [id, browseCraftEntries(entries, { ...browse, category: id, filter }, picks).length]));
  const filtered = query !== '' || category !== 'all' || filter !== 'all';
  const reset = () => { setQuery(''); setCategory('all'); setFilter('all'); };
  const pickVariantFor = (key: string, recipeId: string) => {
    const next = { ...picks, [key]: recipeId };
    setPicks(next);
    saveVariantPicks(next);
  };
  const craft = (row: CraftRecipeRow) => {
    const result = row.recipe.id !== TEAR_RECIPE_ID ? craftItem(row.recipe.id, mode, waterSource)
      : tearSource.id === 'own' ? tearOwnClothes() : tearForRags(tearSource.id);
    setCrafted(result ? { defId: row.recipe.outputDefId, prep: row.prep, count: row.recipe.outputCount, loose: result.loose } : null);
  };
  const hoverInst: ItemInstance | null = hover ? previewInstance(hover.row) : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CampBar atSite={atSite} site={site} now={now} seed={seed} onOpen={() => { setCategory('facilities'); setFilter('all'); }} />

      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5">
          <div className="relative flex min-w-0 flex-1">
            <input
              type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              aria-label={t('ui.craft.search')} placeholder={t('ui.craft.search')}
              className={`${selectClass} w-full pr-14 [&::-webkit-search-cancel-button]:appearance-none`}
            />
            {query && <button type="button" onClick={() => setQuery('')} className={`absolute inset-y-0 right-0 px-3 text-body text-white/65 ${focusClass}`}>{t('ui.craft.clear')}</button>}
          </div>
          <select aria-label={t('ui.craft.sortLabel')} value={sort} onChange={(event) => setSort(event.target.value as CraftSort)} className={`${selectClass} w-[8.5rem] shrink-0`}>
            <option value="ready">{t('ui.craft.sortReady')}</option>
            <option value="time">{t('ui.craft.sortTime')}</option>
            <option value="name">{t('ui.craft.sortName')}</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('ui.craft.categoryLabel')}>
          {CRAFT_CATEGORIES.map((id) => (
            <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)}
              disabled={id !== 'all' && categoryCounts[id] === 0 && category !== id}
              className={`${chipClass} disabled:opacity-35 ${category === id ? 'border-signal/60 bg-signal/10 text-signal' : 'border-white/15 text-white/70 hover:bg-white/5'}`}>
              {t(`ui.craft.chips.${id}`)}
              <span className="tabular-nums text-white/40">{categoryCounts[id]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-white/50">
          <div className="flex gap-1" role="group" aria-label={t('ui.craft.availability')}>
            {(['all', 'ready', 'almost'] as const).map((id) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                className={`flex min-h-7 items-center gap-1 rounded-full border px-2 text-label [@media(pointer:coarse)]:min-h-9 ${focusClass} ${filter === id ? 'border-astral/50 bg-astral/10 text-astral' : 'border-white/10 text-white/55 hover:bg-white/5'}`}>
                {t(id === 'all' ? 'ui.craft.filterAll' : id === 'ready' ? 'ui.craft.filterReady' : 'ui.craft.filterAlmost')}
                <span className="tabular-nums opacity-60">{counts[id]}</span>
              </button>
            ))}
          </div>
          <span className="ml-auto" role="status">{t('ui.craft.showing', { n: views.length, total: entries.length })}</span>
          {filtered && <button type="button" onClick={reset} className={`min-h-7 underline underline-offset-4 hover:text-white ${focusClass}`}>{t('ui.craft.reset')}</button>}
        </div>
      </div>

      <div role="status" aria-live="polite" className={crafted ? 'border-l-2 border-astral bg-astral/5 px-3 py-2 text-body text-astral' : 'sr-only'}>
        {crafted && t('ui.craft.made', { n: crafted.count, name: instanceName({ defId: crafted.defId, ...crafted.prep }, locale) })}
        {crafted && crafted.loose > 0 && <> · {t('ui.craft.carryLoose', { n: crafted.loose })}</>}
      </div>

      {views.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded border border-dashed border-white/20 p-5">
          <p className="text-read text-white/85">{t('ui.craft.noMatches')}</p>
          <p className="max-w-prose text-body text-white/55">{t(filter === 'ready' ? 'ui.craft.noneReady' : filter === 'almost' ? 'ui.craft.noneAlmost' : 'ui.craft.trySearch')}</p>
          <button type="button" onClick={reset} className={`${controlClass} hover:bg-white/10`}>{t('ui.craft.reset')}</button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-white/[0.07] rounded border border-white/10" onPointerLeave={() => setHover(null)}>
          {views.map((view) => <RecipeStrip key={view.entry.key} view={view} busy={busy}
            expanded={selected === view.entry.key}
            onToggle={() => {
              setHover(null);
              const open = selected !== view.entry.key;
              setSelected(open ? view.entry.key : null);
              setFrozen(open ? { keys: views.map((v) => v.entry.key), browseKey } : null);
            }}
            onHover={coarse ? undefined : (e) => setHover(e ? { row: view.row, x: e.clientX, y: e.clientY } : null)}
            onPickVariant={(id) => pickVariantFor(view.entry.key, id)}
            mode={mode} onMode={setModePick}
            siteWater={siteWater} waterSource={waterSource} onWaterSource={setWaterPick}
            tearSources={tearSources} tearPick={tearSource.id} onTearPick={setTearPick}
            onCraft={() => craft(view.row)} />)}
        </ul>
      )}

      {hover && hoverInst && <ItemHoverCard inst={hoverInst} equipment={equipment} equipSlot={null} clientX={hover.x} clientY={hover.y} />}

    </div>
  );
}

/** Sorted views laid out in a remembered key order; keys the order does not know go last, in sorted order. */
function keepOrder(views: CraftEntryView[], keys: string[]): CraftEntryView[] {
  const at = new Map(keys.map((key, i) => [key, i]));
  const slot = (view: CraftEntryView) => at.get(view.entry.key) ?? keys.length;
  return views.map((view, i) => ({ view, i })).sort((a, b) => slot(a.view) - slot(b.view) || a.i - b.i).map(({ view }) => view);
}

/** Quick read of what's built here, above the list; tapping it shows the camp setup recipes. */
function CampBar({ atSite, site, now, seed, onOpen }: { atSite: boolean; site: SiteFacilities | undefined; now: number; seed: string; onOpen: () => void }) {
  const { t } = useT();
  if (!atSite) return <p className="flex min-h-9 items-center rounded border border-white/10 bg-black/20 px-2.5 text-label text-white/45">{t('ui.craft.camp.away')}</p>;
  const chips: { icon: string; label: string; live: boolean }[] = [];
  const heat = heatRemaining(site, now);
  if ((site?.fireUntil ?? 0) > now) chips.push({ icon: 'cooking_fire', label: t('ui.craft.camp.fire', { h: fmtHours(site!.fireUntil! - now) }), live: true });
  if (site?.stove) chips.push({ icon: 'fixed_stove', label: (site.stoveUntil ?? 0) > now ? t('ui.craft.camp.stoveLit', { h: fmtHours(site.stoveUntil! - now) }) : t('ui.craft.camp.stove'), live: (site.stoveUntil ?? 0) > now });
  if (site?.rainShelter) chips.push({ icon: 'rain_shelter', label: t('ui.craft.camp.shelter'), live: false });
  if (site?.collector) chips.push({ icon: 'rain_collector', label: t('ui.craft.camp.rain', { n: collectedRain(site, now, seed).toFixed(1) }), live: false });
  if ((site?.water?.amount ?? 0) > 0) chips.push({ icon: 'hot_water', label: t('ui.craft.camp.water', { n: site!.water!.amount }), live: (site!.water!.hotUntil ?? 0) > now });
  return <button type="button" onClick={onOpen} aria-label={t('ui.craft.camp.title')}
    className={`flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded border border-white/10 bg-black/20 px-2.5 py-1 text-left text-label hover:bg-white/[0.04] ${focusClass}`}>
    <span className="mr-1 uppercase tracking-wide text-white/45">{t('ui.craft.camp.title')}</span>
    {chips.length === 0
      ? <span className="text-white/45">{t('ui.craft.camp.none')}</span>
      : chips.map((chip) => <span key={chip.icon} className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 ${chip.live ? 'border-astral/30 text-astral' : 'border-white/10 text-white/70'}`}>
        <Icon name={itemIcon(itemDef(chip.icon))} size={14} />{chip.label}
      </span>)}
    {chips.length > 0 && heat <= 0 && <span className="text-white/40">· {t('ui.craft.noHeatHere')}</span>}
  </button>;
}

function StatusChip({ ready, label }: { ready: boolean; label: string }) {
  return <span className={`inline-flex items-center gap-1.5 text-body ${ready ? 'text-white/85' : 'text-white/50'}`}>
    <span aria-hidden="true">{ready ? '✓' : '−'}</span>{label}
  </span>;
}

const fmtHours = (h: number): string => (Math.round(h * 10) / 10).toString();

function previewInstance(row: CraftRecipeRow): ItemInstance {
  const { recipe } = row;
  return {
    uid: `craft-${recipe.id}`, defId: recipe.outputDefId, container: 'backpack', x: 0, y: 0, rotated: false,
    stack: recipe.outputCount, ...row.prep,
  };
}

/** What's already standing here for a setup recipe — shown on its strip so the site status lives with the recipe. */
function facilityStatus(row: CraftRecipeRow, t: (key: string, vars?: Record<string, string | number>) => string, seed: string): string | null {
  const { recipe, context } = row;
  if (row.usesLeft !== undefined) return t('ui.craft.tearRemaining', { n: row.usesLeft });
  const site = context.site;
  if (!recipe.facility || !context.atSite || !site) return null;
  const now = context.now;
  switch (recipe.facility) {
    case 'fire': return (site.fireUntil ?? 0) > now ? t('ui.craft.status.burning', { h: fmtHours(site.fireUntil! - now) }) : null;
    case 'stove_fuel': return (site.stoveUntil ?? 0) > now ? t('ui.craft.status.burning', { h: fmtHours(site.stoveUntil! - now) }) : null;
    case 'stove': return site.stove ? t('ui.craft.status.built') : null;
    case 'rain_shelter': return site.rainShelter ? t('ui.craft.status.built') : null;
    case 'rain_collector': return site.collector ? t('ui.craft.status.rain', { n: collectedRain(site, now, seed).toFixed(1) }) : null;
    case 'hot_water': return (site.water?.amount ?? 0) > 0 ? t('ui.craft.status.water', { n: site.water!.amount }) : null;
  }
}

function RecipeStrip({ view, expanded, onToggle, onHover, onCraft, onPickVariant, busy, mode, onMode, siteWater, waterSource, onWaterSource, tearSources, tearPick, onTearPick }: {
  view: CraftEntryView; expanded: boolean; onToggle: () => void;
  onHover?: (e: { clientX: number; clientY: number } | null) => void;
  onCraft: () => void; onPickVariant: (recipeId: string) => void; busy: boolean;
  mode: 'hot' | 'room'; onMode: (mode: 'hot' | 'room') => void;
  siteWater: number; waterSource: 'carried' | 'site'; onWaterSource: (source: 'carried' | 'site') => void;
  tearSources: TearSource[]; tearPick: string; onTearPick: (id: string) => void;
}) {
  const { t, locale } = useT();
  const seed = useGame((s) => s.seed);
  const { entry, row } = view;
  const { recipe, ingredients, check } = row;
  const out = itemDef(recipe.outputDefId);
  const multi = entry.variants.length > 1;
  const name = entry.family ? t(`ui.craft.family.${entry.family}`) : itemName(out.id, locale);
  const variantName = multi ? (entry.family ? itemName(out.id, locale) : recipeName(recipe.id, locale)) : null;
  const status = facilityStatus(row, t, seed);
  const tearing = recipe.id === TEAR_RECIPE_ID;
  const detailsId = `craft-details-${entry.key.replace(/[^a-z0-9_-]/gi, '-')}`;
  const ready = check.ok;
  // The edge bar marks the strip as craftable when any variant is, so it agrees with the Ready filter.
  const anyReady = view.anyReady;
  // Three chips fit beside the name on a phone; past that, two plus a "+n".
  const slots = recipe.tool ? 2 : 3;
  const shownInputs = ingredients.length > slots ? slots - 1 : slots;
  return <li className={`relative min-w-0 ${expanded ? 'bg-white/[0.04]' : ''}`}>
    <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-0.5 ${ready ? 'bg-astral/80' : anyReady ? 'bg-astral/35' : 'bg-transparent'}`} />
    <button type="button" aria-expanded={expanded} aria-controls={detailsId}
      aria-label={t('ui.craft.inspect', { name: variantName ? `${name} · ${variantName}` : name })} onClick={onToggle}
      onPointerMove={onHover ? (e) => { if (e.pointerType === 'mouse') onHover(e); } : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
      className={`flex min-h-10 w-full items-center gap-2 py-1 pl-2.5 pr-2 text-left hover:bg-white/[0.05] [@media(pointer:coarse)]:min-h-11 ${focusClass}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center border ${ready ? 'border-astral/30 bg-astral/[0.06]' : 'border-white/10 bg-black/25'}`}>
        <Icon name={itemIcon(out)} size={22} className={ready ? undefined : 'opacity-80'} />
      </span>
      <span className="flex min-w-[5.5rem] flex-1 flex-col leading-tight">
        <span className="flex min-w-0 items-baseline gap-1">
          <span className={`truncate text-body font-semibold ${ready ? 'text-white' : 'text-white/80'}`}>{name}</span>
          {recipe.outputCount > 1 && <span className="shrink-0 text-label text-white/50">×{recipe.outputCount}</span>}
        </span>
        {(multi || recipe.facility) && <span className="flex min-w-0 items-center gap-1 overflow-hidden text-label">
          {recipe.facility && !status && <span className="shrink-0 rounded-sm border border-signal/30 px-1 text-micro text-signal/80">{t('ui.craft.builtHere')}</span>}
          {status && <span className="truncate text-astral/80">{row.usesLeft !== undefined && variantName ? `${variantName} · ${status}` : status}</span>}
          {!status && variantName && <span className="truncate text-white/45">{variantName}</span>}
          {multi && <span className="shrink-0 text-white/35">· {t('ui.craft.variants', { n: entry.variants.length })}</span>}
        </span>}
      </span>
      <span className="flex h-6 min-w-0 shrink flex-wrap items-center justify-end gap-1 overflow-hidden" aria-label={t('ui.craft.ingredients')}>
        {ingredients.slice(0, shownInputs).map((input) => <MiniInput key={input.defId} {...input} label={input.water ? t('ui.craft.anyWater') : undefined} />)}
        {ingredients.length > shownInputs && <span className="shrink-0 text-label text-white/40">+{ingredients.length - shownInputs}</span>}
        {recipe.tool && <MiniInput defId={recipe.tool} need={1} have={row.toolHave} tool />}
      </span>
      <span className="shrink-0 whitespace-nowrap pl-1 text-right text-label tabular-nums text-white/55">{t('ui.craft.hoursShort', { h: recipe.hours })}</span>
      <span aria-hidden="true" className={`shrink-0 text-white/45 transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
    </button>
    <div id={detailsId} hidden={!expanded} className="border-t border-white/10 px-3 pb-3 pt-2.5">
      {expanded && <>
        {(multi || tearing || recipe.preparation === 'drink' || (recipe.waterInput && recipe.preparation !== 'boil' && siteWater > 0)) && <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {multi && <label className="flex min-w-0 flex-col gap-1 text-label text-white/55">{t('ui.craft.variant')}
            <select aria-label={t('ui.craft.variant')} className={controlClass} value={recipe.id} onChange={(e) => onPickVariant(e.target.value)}>
              {entry.variants.map((v) => <option key={v.recipe.id} value={v.recipe.id}>
                {v.check.ok ? '✓ ' : ''}{entry.family ? itemName(v.recipe.outputDefId, locale) : recipeName(v.recipe.id, locale)}
              </option>)}
            </select>
          </label>}
          {tearing && <label className="flex min-w-0 flex-col gap-1 text-label text-white/55">{t('ui.craft.tearSource')}
            <select aria-label={t('ui.craft.tearSource')} className={controlClass} value={tearPick} onChange={(e) => onTearPick(e.target.value)}>
              {tearSources.map((source) => <option key={source.id} value={source.id}>{source.usesLeft > 0 ? '' : '✕ '}{source.label}</option>)}
            </select>
          </label>}
          {recipe.preparation === 'drink' && <label className="flex min-w-0 flex-col gap-1 text-label text-white/55">{t('ui.craft.preparation')}
            <select aria-label={t('ui.craft.preparation')} className={controlClass} value={mode} onChange={(e) => onMode(e.target.value as 'hot' | 'room')}>
              <option value="hot">{t('ui.craft.hotMode')}</option><option value="room">{t('ui.craft.roomMode')}</option>
            </select>
          </label>}
          {recipe.waterInput && recipe.preparation !== 'boil' && siteWater > 0 && <label className="flex min-w-0 flex-col gap-1 text-label text-white/55">{t('ui.craft.waterSource')}
            <select aria-label={t('ui.craft.waterSource')} className={controlClass} value={waterSource} onChange={(e) => onWaterSource(e.target.value as 'carried' | 'site')}>
              <option value="carried">{t('ui.craft.carriedWater')}</option><option value="site">{t('ui.craft.siteWater')}</option>
            </select>
          </label>}
        </div>}
        <RecipeDetails row={row} onCraft={onCraft} busy={busy} />
      </>}
    </div>
  </li>;
}

/** Strip-sized ingredient: icon plus have/need, red when short. Tool chips get a dashed outline. */
function MiniInput({ defId, need, have, tool = false, label }: { defId: string; need: number; have: number; tool?: boolean; water?: boolean; label?: string }) {
  const { t, locale } = useT();
  const def = ITEMS[defId];
  if (!def) return null;
  const name = label ?? itemName(defId, locale);
  const short = have < need;
  const text = tool ? t('ui.craft.toolTip', { name, have }) : t('ui.craft.needHave', { name, need, have });
  return <span {...tip(text, { label: true })}
    className={`inline-flex h-6 shrink-0 items-center gap-0.5 rounded-sm border px-0.5 ${tool ? 'border-dashed' : ''} ${short ? 'border-hiss/40 bg-hiss/10' : 'border-white/10 bg-black/30'}`}>
    <Icon name={itemIcon(def)} size={14} className={short ? 'opacity-50' : undefined} />
    {!tool && <span className={`text-micro tabular-nums ${short ? 'text-hiss' : 'text-white/70'}`}>{have}/{need}</span>}
  </span>;
}

function RecipeDetails({ row, onCraft, busy }: { row: CraftRecipeRow; onCraft: () => void; busy: boolean }) {
  const { t, locale } = useT();
  const equipment = useGame((s) => s.equipment);
  const { recipe, ingredients } = row;
  const out = itemDef(recipe.outputDefId);
  const preview = previewInstance(row);
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
    {ingredients.length > 0 && <div>
      <div className="mb-2 flex justify-between gap-2 text-label uppercase text-white/50"><h5>{t('ui.craft.ingredients')}</h5><span>{t('ui.craft.countLegend')}</span></div>
      <ul className="space-y-2">
        {ingredients.map((input) => <li key={input.defId} className="flex items-center gap-2">
          <Icon name={itemIcon(itemDef(input.defId))} size={18} />
          <span className="min-w-0 flex-1 text-white/75">{input.water ? t('ui.craft.anyWater') : itemName(input.defId, locale)}</span>
          <span className={`shrink-0 tabular-nums ${input.have < input.need ? 'text-hiss' : 'text-white/85'}`}>{input.have}/{input.need}</span>
        </li>)}
      </ul>
    </div>}
    {recipe.tool && <div className="space-y-1 border-t border-white/10 pt-2">
      {recipe.tool && <StatusChip ready={row.toolHave > 0} label={t('ui.craft.toolKept', { name: itemName(recipe.tool, locale) })} />}
    </div>}
    {recipe.id === 'boil' && <p className="text-white/65">{t('ui.craft.boilNote')}</p>}
    {recipe.facility && <p className="text-signal">{t('ui.craft.staysHere')}</p>}
    <SiteCollect row={row} busy={busy} />
    {preview.coldPrepared && <p className="text-white/65">{t('ui.craft.roomPenalty')}</p>}
    {preview.muddy && <p className="text-white/65">{t('ui.craft.muddyPenalty')}</p>}
    {preview.contaminationRisk !== undefined && <p className="text-hiss">{t('ui.craft.unsafeWater', { n: preview.contaminationRisk })}</p>}
    {row.check.block && <p className="text-hiss">{craftBlockText(row.check.block, t, locale)}</p>}
    {busy && <p className="text-hiss">{t('ui.craft.busy')}</p>}
    <button type="button" disabled={!row.check.ok || busy} onClick={onCraft}
      className={`min-h-11 w-full rounded border border-signal/50 bg-signal px-3 text-read font-semibold text-concrete-950 hover:bg-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/40 ${focusClass}`}>
      {t(row.check.ok ? 'ui.craft.craftAction' : 'ui.craft.unavailable')} · {t('ui.craft.hoursShort', { h: recipe.hours })}
    </button>
  </div>;
}

/** The collect actions that used to live in the separate facilities box sit with the recipe that made the water. */
function SiteCollect({ row, busy }: { row: CraftRecipeRow; busy: boolean }) {
  const { t } = useT();
  const { seed, collect } = useGame(useShallow((s) => ({ seed: s.seed, collect: s.collectSiteWater })));
  const { recipe, context } = row;
  const site = context.site;
  if (!context.atSite || !site) return null;
  const button = `min-h-9 rounded border border-white/20 px-3 text-body text-white/80 hover:bg-white/10 disabled:opacity-40 ${focusClass}`;
  if (recipe.facility === 'rain_collector' && site.collector) {
    const rain = collectedRain(site, context.now, seed);
    return <div className="flex flex-wrap items-center gap-2">
      <span className="text-white/65">{t('ui.craft.rainStored', { n: rain.toFixed(1) })}</span>
      <button type="button" className={button} disabled={busy || rain < 1} onClick={() => collect('rain')}>{t('ui.craft.collectRain')}</button>
    </div>;
  }
  const water = site.water?.amount ?? 0;
  if (recipe.facility === 'hot_water' && water > 0) {
    const hotLeft = Math.max(0, (site.water?.hotUntil ?? 0) - context.now);
    return <div className="flex flex-wrap items-center gap-2">
      <span className="text-white/65">{t(hotLeft > 0 ? 'ui.craft.hotStored' : 'ui.craft.cleanStored', { n: water, h: hotLeft.toFixed(1) })}</span>
      <button type="button" className={button} disabled={busy} onClick={() => collect('boiled')}>{t('ui.craft.collectClean')}</button>
    </div>;
  }
  return null;
}

function craftBlockText(block: CraftBlock, t: (key: string, vars?: Record<string, string | number>) => string, locale: 'en' | 'zh-Hans'): string {
  if (block.kind === 'input') return t('ui.craft.needHave', { name: itemName(block.defId, locale), need: block.need, have: block.have });
  if (block.kind === 'tool') return t('ui.craft.toolKept', { name: itemName(block.defId, locale) });
  if (block.kind === 'water') return t('ui.craft.needHave', { name: t('ui.craft.anyWater'), need: block.need, have: block.have });
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
