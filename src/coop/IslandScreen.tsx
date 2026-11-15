import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '../i18n/useT';
import { itemName, poiCategoryLabel, recipeBlurb, recipeName } from '../i18n/display';
import { OCCUPATIONS } from '../game/occupations';
import { ITEMS } from '../game/loot';
import { RECIPES } from '../game/crafting';
import { BODY_PART_IDS, totalHp, totalMaxHp } from '../game/survival';
import { SKILL_IDS, XP_TO_NEXT } from '../game/skills';
import { careForItem } from '../game/woundCare';
import type { BodyPartId, EquipSlot, ItemInstance } from '../game/types';
import { medicalCount } from './expeditionSurvivor';
import { availableIslandInteriorChoices } from './islandBuildings';
import { SPAWN_DISTRICTS, type IslandPoint } from './islandModel';
import type { CoopClient, ClientState } from './client';
import type { Command, Credentials, RoomState, Survivor } from './model';
import { useCoopCopy } from './copy';
import IslandMap from './IslandMap';

const PANEL = 'border border-white/15 bg-concrete-900';
const SELECT = 'min-h-11 w-full rounded-sm border border-white/20 bg-concrete-950 px-3 py-2 text-read text-signal outline-none focus:border-signal';
const STANCES = ['guarded', 'aggressive', 'precision'] as const;
const TABS = ['site', 'pack', 'body', 'craft', 'skills'] as const;
type Tab = typeof TABS[number];
type Send = (command: Command) => boolean;
interface Props {
  room: RoomState;
  me: Survivor;
  state: ClientState;
  client: CoopClient;
  credentials: Credentials;
  onLobby: () => void;
}

function Button({ children, onClick, disabled = false, primary = false }: {
  children: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean;
}) {
  return <button type="button" onClick={onClick} disabled={disabled}
    className={`min-h-11 rounded-sm border px-3 py-2 text-body transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:cursor-not-allowed disabled:opacity-35 ${primary
      ? 'border-signal bg-signal text-black enabled:hover:bg-white'
      : 'border-white/25 bg-white/5 text-signal enabled:hover:border-white/60 enabled:hover:bg-white/10'}`}>{children}</button>;
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="text-plate uppercase text-white/55">{children}</h3>;
}

function Clock({ ms }: { ms: number }) {
  const minutes = Math.floor(ms / 1000);
  return <span className="tabular-nums">{String(Math.floor(minutes / 60)).padStart(2, '0')}:{String(minutes % 60).padStart(2, '0')}</span>;
}

function Meter({ label, value, max = 100, danger = false }: { label: string; value: number; max?: number; danger?: boolean }) {
  return <div>
    <div className="flex justify-between gap-3 text-body"><span className="text-white/50">{label}</span><span className={danger ? 'text-red-300' : 'text-signal'}>{Math.round(value)} / {Math.round(max)}</span></div>
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.max(0, Math.min(max, value))} className="mt-1 h-1 bg-white/10"><div className={danger ? 'h-full bg-hiss' : 'h-full bg-astral/70'} style={{ width: `${Math.max(0, Math.min(100, value / Math.max(1, max) * 100))}%` }} /></div>
  </div>;
}

function ActionProgress({ room, me, send, active }: { room: RoomState; me: Survivor; send: Send; active: boolean }) {
  const { t } = useT();
  const action = me.action;
  if (!action) return null;
  const target = action.target ? room.world?.locations[action.target]?.name ?? t('ui.coopIsland.trekPoint') : '';
  const label = action.kind === 'travel' ? t('ui.coop.enRoute', { site: target }) : t(`ui.coopIsland.actions.${action.kind}`);
  const progress = (room.simMs - action.startedAt) / Math.max(1, action.endsAt - action.startedAt) * 100;
  return <div className="border border-astral/30 bg-astral/5 p-3" role="status">
    <p className="text-read text-signal">{label}</p><p className="mt-1 text-body text-white/50">{t('ui.coop.actionStatus', { action: t('ui.coopIsland.inProgress'), seconds: Math.max(0, Math.ceil((action.endsAt - room.simMs) / 1000)) })}</p>
    <div className="my-3 h-1 bg-white/10"><div className="h-full bg-astral" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
    {action.kind === 'travel' || action.kind === 'treat' ? <p className="text-body text-white/40">{t(action.kind === 'travel' ? 'ui.coop.travelCommitted' : 'ui.coopIsland.treatmentCommitted')}</p> : <Button disabled={!active} onClick={() => send({ type: 'cancel' })}>{t('ui.coop.cancel')}</Button>}
  </div>;
}

function SitePanel({ room, me, selected, ground, active, idle, send, onCurrent }: {
  room: RoomState; me: Survivor; selected: string; ground: IslandPoint | null;
  active: boolean; idle: boolean; send: Send; onCurrent: () => void;
}) {
  const { t, locale } = useT();
  const world = room.world!;
  const site = world.locations[selected];
  const siteState = ground ? undefined : room.sites[selected];
  const local = !ground && selected === me.site;
  const nearby = room.players.filter(player => player.id !== me.id && player.site === me.site && player.action?.kind !== 'travel');
  const hostile = (room.sites[me.site]?.enemyHp ?? 0) > 0;
  const interiorChoices = local ? availableIslandInteriorChoices(room, me.id) : [];
  const indoors = !!world.locations[me.site]?.interior;
  return <div className="space-y-4 p-4">
    <div><p className="text-label uppercase text-white/40">{local ? t('ui.coop.yourLocation') : t('ui.coop.selectedDestination')}</p><h2 className="mt-2 text-title text-signal">{ground ? t('ui.coopIsland.trekPoint') : site?.name ?? t('ui.coopIsland.unknownSite')}</h2>
      {ground ? <p className="mt-2 text-body text-white/50">{ground.lat.toFixed(5)}, {ground.lng.toFixed(5)}</p> : site && <p className="mt-2 text-body text-white/50">{poiCategoryLabel(site.category, locale)} · {t('ui.coopIsland.danger', { value: site.danger })}{site.id === world.spawn ? ` · ${t('ui.coopIsland.rendezvous')}` : ''}{site.id === world.evac ? ` · ${t('ui.coopIsland.evacObjective')}` : ''}</p>}
    </div>
    <ActionProgress room={room} me={me} send={send} active={active} />
    {!local && <div className="space-y-3 border-t border-white/10 pt-4">
      <p className="text-body text-white/45">{t('ui.coopIsland.travelHint')}</p>
      <div className="grid gap-2"><Button primary disabled={!idle || hostile || indoors || !!site?.interior || (!ground && !site)} onClick={() => send(ground ? { type: 'trek', ...ground } : { type: 'travel', site: selected })}>{t('ui.coopIsland.travel')}</Button><Button onClick={onCurrent}>{t('ui.coopIsland.showCurrent')}</Button></div>
      {(indoors || !!site?.interior) && <p className="text-body text-white/45">{t('ui.coopIsland.building.useDoors')}</p>}
    </div>}
    {siteState ? <div className="flex items-center justify-between gap-3 border-y border-white/10 py-3 text-body"><span className="text-white/50">{t('ui.coop.searchesLeft')}</span><span className="text-signal">{siteState.searches}</span></div> : !ground && <p className="border-y border-white/10 py-3 text-body text-white/45">{t('ui.coopIsland.conditionsUnknown')}</p>}
    {local && <>
      {interiorChoices.length > 0 && <section className="space-y-3 border-b border-white/10 pb-4">
        <Heading>{t('ui.coopIsland.building.title')}</Heading>
        <p className="text-body text-white/45">{t('ui.coopIsland.building.hint')}</p>
        {interiorChoices.map((choice, index) => <div key={index} className="space-y-1">
          <Button disabled={!idle || hostile || !choice.available} onClick={() => send(choice.command)}>
            {choice.kind === 'unit' ? t('ui.coopIsland.building.unit', { name: choice.unitLabel ?? '' })
              : choice.kind === 'stairs' ? t('ui.coopIsland.building.stairs', { storey: choice.storey ?? 1 })
              : t(`ui.coopIsland.building.${choice.kind}`)}
          </Button>
          {choice.reasonCode && <p className="text-body text-white/40">{t(`ui.coopIsland.building.reasons.${choice.reasonCode}`)}</p>}
        </div>)}
      </section>}
      {!!site?.tunnelExits?.length && <section className="space-y-3 border-b border-white/10 pb-4">
        <Heading>{t('ui.coopIsland.tunnels')}</Heading>
        <p className="text-body text-white/45">{t('ui.coopIsland.tunnelHint')}</p>
        {site.tunnelExits.map(exit => <div key={`${exit.stationId}:${exit.line}`} className="flex items-center justify-between gap-3">
          <div><p className="text-body text-signal">{exit.name}</p><p className="text-label text-white/45">{t('ui.coopIsland.tunnelDistance', { line: exit.line, km: (exit.meters / 1000).toFixed(1) })}</p></div>
          <Button disabled={!idle || hostile} onClick={() => send({ type: 'tunnel', stationId: exit.stationId })}>{t('ui.coopIsland.crawl')}</Button>
        </div>)}
      </section>}
      <div className="grid grid-cols-2 gap-2"><Button primary disabled={!idle || hostile || !siteState?.searches} onClick={() => send({ type: 'search' })}>{t('ui.coopIsland.search', { seconds: 15 })}</Button><Button disabled={!idle || hostile} onClick={() => send({ type: 'rest' })}>{t('ui.coopIsland.rest', { seconds: 240 })}</Button></div>
      {!!siteState?.enemyHp && <div className="space-y-3 border border-hiss/40 bg-hiss/5 p-3"><p className="text-plate text-red-200">{t('ui.coop.enemyHealth', { hp: Math.ceil(siteState.enemyHp) })}</p><p className="text-body text-white/50">{t('ui.coopIsland.combatHint')}</p><div className="flex gap-2"><Button disabled={!active || !!me.action || me.fighting} primary onClick={() => send({ type: 'fight' })}>{me.fighting ? t('ui.coop.fighting') : t('ui.coop.fight')}</Button><Button disabled={!active || !!me.action} onClick={() => send({ type: 'flee' })}>{t('ui.coop.flee')}</Button></div></div>}
      <label className="block text-body text-white/45">{t('ui.coop.stanceHeading')}<select className={`${SELECT} mt-2`} value={me.stance} disabled={!active || !!me.action} onChange={event => { const stance = STANCES.find(value => value === event.target.value); if (stance) send({ type: 'stance', stance }); }}>{STANCES.map(stance => <option key={stance} value={stance}>{t(`ui.coop.stances.${stance}.label`)}</option>)}</select></label>
      {site?.id === world.evac && <div className="border border-signal/30 p-3"><Button primary disabled={!idle || hostile} onClick={() => send({ type: 'extract' })}>{t('ui.coop.extract')}</Button><p className="mt-2 text-body text-white/45">{t('ui.coop.extractHelp')}</p></div>}
      <section className="border-t border-white/10 pt-4"><Heading>{t('ui.coopIsland.cache')}</Heading><p className="mt-2 text-body text-white/40">{t('ui.coopIsland.cacheHint')}</p><div className="mt-3 space-y-2">{siteState?.items?.length ? siteState.items.map(item => <div key={item.uid} className="flex items-center justify-between gap-3 border border-white/10 p-2"><div className="min-w-0"><p className="text-body text-signal">{itemName(item.defId, locale)} ×{item.stack}</p>{item.defId === 'medkit' && <p className="text-body text-white/40">{t('ui.coopIsland.charges', { count: item.careUses ?? 3 })}</p>}</div><Button disabled={!idle || hostile} onClick={() => send({ type: 'takeItem', uid: item.uid })}>{t('ui.coopIsland.take')}</Button></div>) : <p className="text-body text-white/35">{t('ui.coopIsland.cacheEmpty')}</p>}</div></section>
      {nearby.length > 0 && <section className="space-y-3 border-t border-white/10 pt-4"><Heading>{t('ui.coop.nearby', { site: site?.name ?? '' })}</Heading>{nearby.map(player => <div key={player.id} className="flex items-center justify-between gap-2"><div><p className="text-read text-signal">{player.name}</p><p className="text-body text-white/45">{t(`ui.coop.status.${player.status}`)}</p></div>{player.status === 'downed' && <Button disabled={!idle || !me.expedition || medicalCount(me.expedition) < 1} onClick={() => send({ type: 'rescue', playerId: player.id })}>{t('ui.coop.rescue')}</Button>}</div>)}<p className="text-body text-white/40">{t('ui.coop.rescueHelp')}</p></section>}
    </>}
  </div>;
}

function PackPanel({ room, me, idle, send }: { room: RoomState; me: Survivor; idle: boolean; send: Send }) {
  const { t, locale } = useT();
  const [part, setPart] = useState<BodyPartId | ''>('');
  const [recipient, setRecipient] = useState('');
  const expedition = me.expedition;
  if (!expedition) return null;
  const nearby = room.players.filter(player => player.id !== me.id && player.site === me.site && player.status === 'active' && player.action?.kind !== 'travel');
  const giveTo = nearby.find(player => player.id === recipient)?.id ?? nearby[0]?.id;
  const equipped = Object.entries(expedition.equipment).flatMap(([slot, item]) => item ? [{ item, slot: slot as EquipSlot }] : []);
  const items: { item: ItemInstance; slot?: EquipSlot }[] = [...equipped, ...expedition.items.map(item => ({ item }))];
  return <div className="space-y-4 p-4">
    <Heading>{t('ui.coopIsland.pack')}</Heading><p className="text-body text-white/50">{t('ui.coopIsland.medicalAvailable', { count: medicalCount(expedition) })}</p>
    <label className="block text-body text-white/45">{t('ui.coopIsland.treatmentTarget')}<select className={`${SELECT} mt-2`} value={part} onChange={event => setPart(event.target.value as BodyPartId | '')}><option value="">{t('ui.coopIsland.automaticTarget')}</option>{BODY_PART_IDS.map(id => <option key={id} value={id}>{t(`ui.body.parts.${id}`)}</option>)}</select></label>
    {nearby.length > 0 && <label className="block text-body text-white/45">{t('ui.coopIsland.giveTo')}<select className={`${SELECT} mt-2`} value={giveTo} onChange={event => setRecipient(event.target.value)}>{nearby.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>}
    <div className="space-y-3">{items.map(({ item, slot }) => {
      const def = ITEMS[item.defId];
      const care = careForItem(item.defId);
      const usable = !!care || ['food', 'water', 'energy', 'cure'].includes(def?.effect.kind ?? '');
      const equippable = !!slot || !!def?.slot || (def?.effect.kind === 'weapon' && def.effect.ranged);
      return <article key={item.uid} className="border border-white/15 bg-concrete-950/50 p-3"><div className="flex items-start justify-between gap-3"><p className="text-read text-signal">{itemName(item.defId, locale)} <span className="text-white/45">×{item.stack}</span></p>{slot && <span className="text-label uppercase text-astral">{t(`ui.slots.${slot}`)}</span>}</div><div className="mt-1 flex flex-wrap gap-x-3 text-body text-white/45">{item.condition !== undefined && <span>{t('ui.coopIsland.condition', { value: Math.round(item.condition) })}</span>}{item.defId === 'medkit' && <span>{t('ui.coopIsland.charges', { count: item.careUses ?? 3 })}</span>}</div><div className="mt-3 flex flex-wrap gap-2">
        {usable && !slot && <Button primary disabled={!idle} onClick={() => send({ type: 'useItem', uid: item.uid, ...(part ? { part } : {}) })}>{care ? t('ui.coopIsland.treat') : t('ui.coopIsland.use')}</Button>}
        {equippable && <Button disabled={!idle} onClick={() => send({ type: 'equipItem', uid: item.uid })}>{slot ? t('ui.coopIsland.unequip') : t('ui.coopIsland.equip')}</Button>}
        <Button disabled={!idle} onClick={() => send({ type: 'dropItem', uid: item.uid })}>{t('ui.coopIsland.drop')}</Button>
        {!slot && giveTo && <Button disabled={!idle} onClick={() => send({ type: 'giveItem', uid: item.uid, playerId: giveTo })}>{t('ui.coopIsland.give')}</Button>}
      </div></article>;
    })}{!items.length && <p className="text-body text-white/40">{t('ui.coopIsland.packEmpty')}</p>}</div>
  </div>;
}

function BodyPanel({ me, onPack }: { me: Survivor; onPack: () => void }) {
  const { t } = useT();
  const expedition = me.expedition;
  if (!expedition) return null;
  return <div className="space-y-4 p-4"><Heading>{t('ui.body.title')}</Heading>
    <Meter label={t('ui.coopIsland.health')} value={totalHp(expedition.bodyParts)} max={totalMaxHp(expedition.bodyParts)} />
    <div className="grid grid-cols-2 gap-4 border-y border-white/10 py-4">{(['hunger', 'thirst', 'energy', 'infection'] as const).map(id => <Meter key={id} label={t(`ui.coopIsland.meters.${id}`)} value={expedition.meters[id]} danger={id === 'infection' ? expedition.meters[id] > 50 : expedition.meters[id] < 25} />)}</div>
    {BODY_PART_IDS.map(id => { const part = expedition.bodyParts[id]; return <div key={id} className="space-y-2"><Meter label={t(`ui.body.parts.${id}`)} value={part.hp} max={part.maxHp} danger={part.hp < part.maxHp * 0.3} /><div className="flex flex-wrap gap-2 text-body text-red-200">{part.bleed !== 'none' && <span>{t(part.bleed === 'major' ? 'ui.body.majorBleeding' : 'ui.body.bleeding')}</span>}{part.fractured && <span>{t('ui.body.fractured')}</span>}{part.crippled && <span>{t('ui.body.crippled')}</span>}{part.dirty && <span>{t('ui.coopIsland.dirtyWound')}</span>}</div></div>; })}
    <Button onClick={onPack}>{t('ui.coopIsland.openMedical')}</Button>
  </div>;
}

function CraftPanel({ idle, send }: { idle: boolean; send: Send }) {
  const { t, locale } = useT();
  const recipes = RECIPES.filter(recipe => !recipe.needsShelter && !recipe.facility);
  const [chosen, setChosen] = useState(recipes[0]?.id ?? '');
  const recipe = recipes.find(value => value.id === chosen);
  return <div className="space-y-4 p-4"><Heading>{t('ui.coopIsland.tabs.craft')}</Heading><p className="text-body text-white/45">{t('ui.coopIsland.fieldCraftHint')}</p><label className="block text-body text-white/45">{t('ui.coopIsland.recipe')}<select className={`${SELECT} mt-2`} value={chosen} onChange={event => setChosen(event.target.value)}>{recipes.map(value => <option key={value.id} value={value.id}>{recipeName(value.id, locale)}</option>)}</select></label>
    {recipe && <><p className="text-body text-white/60">{recipeBlurb(recipe.id, locale)}</p><div className="space-y-2 border-y border-white/10 py-4"><Heading>{t('ui.craft.ingredients')}</Heading>{Object.entries(recipe.inputs).map(([id, count]) => <p key={id} className="text-body text-signal">{itemName(id, locale)} ×{count}</p>)}{recipe.waterInput && <p className="text-body text-signal">{t('ui.coopIsland.recipeWater', { count: recipe.waterInput })}</p>}{recipe.tool && <p className="text-body text-white/45">{t('ui.craft.toolKept', { name: itemName(recipe.tool, locale) })}</p>}</div><p className="text-body text-white/55">{t('ui.coopIsland.recipeOutput', { name: itemName(recipe.outputDefId, locale), count: recipe.outputCount, minutes: Math.round(recipe.hours * 60) })}</p><Button primary disabled={!idle} onClick={() => send({ type: 'craft', recipeId: recipe.id })}>{t('ui.craft.craftAction')}</Button></>}
  </div>;
}

function SkillPanel({ me }: { me: Survivor }) {
  const { t } = useT();
  if (!me.expedition) return null;
  return <div className="space-y-5 p-4"><Heading>{t('ui.skills.title')}</Heading>{SKILL_IDS.map(id => {
    const skill = me.expedition!.skills[id];
    const next = XP_TO_NEXT[skill.level];
    return <div key={id}><div className="flex justify-between gap-3 text-read text-signal"><span>{t(`ui.skills.names.${id}`)}</span><span>{t('ui.skills.level', { level: skill.level })}</span></div><p className="mt-1 text-body text-white/45">{next ? t('ui.skills.xp', { xp: Math.floor(skill.xp), need: next }) : t('ui.skills.maxed')}</p><div className="mt-2 h-1 bg-white/10"><div className="h-full bg-astral/70" style={{ width: `${next ? Math.min(100, skill.xp / next * 100) : 100}%` }} /></div></div>;
  })}</div>;
}

function Squad({ room, me, onSelect }: { room: RoomState; me: Survivor; onSelect: (id: string) => void }) {
  const { t } = useT();
  return <section className="mt-4"><Heading>{t('ui.coop.rosterCount', { count: room.players.length, max: 4 })}</Heading><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{room.players.map(player => {
    const maximum = player.expedition ? totalMaxHp(player.expedition.bodyParts) : 100;
    return <article key={player.id} className={`${PANEL} p-3 ${player.id === me.id ? 'border-astral/40' : ''}`}><div className="flex justify-between gap-2"><p className="truncate text-read text-signal">{player.name}{player.id === me.id && <span className="ml-2 text-label text-astral">{t('ui.coop.youBadge')}</span>}</p><span className={`text-label uppercase ${player.connected ? 'text-white/45' : 'text-hiss'}`}>{player.connected ? room.ready.includes(player.id) ? t('ui.coop.ready') : t('ui.coop.online') : t('ui.coop.offline')}</span></div><button type="button" onClick={() => onSelect(player.site)} className="mt-2 min-h-11 w-full text-left text-body text-white/55 underline decoration-white/20 underline-offset-4">{room.world?.locations[player.site]?.name ?? t('ui.coopIsland.trekPoint')}</button><p className="mb-3 text-label uppercase text-white/40">{t(`ui.coop.status.${player.action?.kind === 'travel' ? 'travelling' : player.status}`)}</p><Meter label={t('ui.coopIsland.health')} value={player.hp} max={maximum} danger={player.hp < maximum * 0.3} />{player.expedition && <p className="mt-2 text-body text-white/40">{t('ui.coopIsland.medicalAvailable', { count: medicalCount(player.expedition) })}</p>}{player.action && <p className="mt-2 text-body text-astral">{t('ui.coop.actionStatus', { action: t(`ui.coopIsland.actions.${player.action.kind}`), seconds: Math.max(0, Math.ceil((player.action.endsAt - room.simMs) / 1000)) })}</p>}{player.status === 'downed' && <p className="mt-2 text-body text-red-300">{t('ui.coop.rescueWindow', { seconds: Math.max(0, Math.ceil(((player.downedUntil ?? room.simMs) - room.simMs) / 1000)) })}</p>}</article>;
  })}</div></section>;
}

export default function IslandScreen({ room, me, state, client, credentials, onLobby }: Props) {
  const { t } = useT();
  const { logText } = useCoopCopy();
  const [selectedId, setSelected] = useState(me.site);
  const [ground, setGround] = useState<IslandPoint | null>(null);
  const [tab, setTab] = useState<Tab>('site');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { setSelected(me.site); setGround(null); }, [me.site]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer); }, [copied]);
  const world = room.world!;
  const selected = world.locations[selectedId] ? selectedId : me.site;
  const canSend = state.connection === 'connected' && !state.pending;
  const active = canSend && room.phase === 'running' && !room.pause && me.status === 'active';
  const idle = active && !me.action && !me.fighting;
  const serverNow = now + state.serverOffset;
  const graceActive = !!room.pause && room.pause.graceUntil > serverNow && room.players.some(player => !player.connected);
  const replacementAvailable = room.phase === 'running' && room.players.some(player => player.id !== me.id && player.status === 'active' && player.site === world.spawn && !player.action && !player.fighting);
  const district = SPAWN_DISTRICTS.find(value => world.spawn === `spawn:${value.id}` || world.spawn.includes(value.id))?.id ?? SPAWN_DISTRICTS.reduce((nearest, value) => {
    const spawn = world.locations[world.spawn];
    return spawn && Math.hypot(spawn.lat - value.lat, spawn.lng - value.lng) < Math.hypot(spawn.lat - nearest.lat, spawn.lng - nearest.lng) ? value : nearest;
  }, SPAWN_DISTRICTS[0]).id;
  function select(id: string) { setSelected(id); setGround(null); setTab('site'); }
  async function copyInvite() {
    const url = new URL('/', window.location.href);
    url.searchParams.set('coop', credentials.room);
    try { await navigator.clipboard.writeText(url.toString()); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); setCopied(false); }
  }
  return <main className="min-h-full bg-concrete-950 px-3 pb-6 pt-4 sm:px-5">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-4"><div><a href="/" className="text-title text-signal">SINGVIVE <span className="text-label text-white/40">{t('ui.coopIsland.badge')}</span></a><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-label uppercase"><span className="text-white/50">{t('ui.coop.roomLabel')} <span className="select-all text-signal">{credentials.room}</span></span><span role="status" className={state.connection === 'connected' ? 'text-astral' : 'text-hiss'}>{state.connection === 'connected' ? state.pending ? t('ui.coop.sendingShort') : t('ui.coop.live') : state.connection === 'reconnecting' ? t('ui.coop.reconnecting', { attempt: state.retries }) : t(`ui.coop.connection.${state.connection}`)}</span></div></div><div className="flex gap-2"><Button onClick={() => { void copyInvite(); }}>{copied ? t('ui.coop.inviteCopied') : t('ui.coop.copyInvite')}</Button><Button onClick={onLobby}>{t('ui.coop.lobby')}</Button></div></header>
    {copyFailed && <p role="status" className="mt-3 text-body text-white/55">{t('ui.coop.copyFailed', { code: credentials.room })}</p>}
    {state.error && <div role="alert" className="mt-3 flex justify-between gap-3 border border-hiss/40 bg-hiss/10 p-3 text-read text-red-200"><p>{state.error}</p><button type="button" aria-label={t('ui.coop.dismiss')} className="min-h-11 px-3 text-white/60" onClick={client.clearError}>×</button></div>}
    {state.connection !== 'connected' && <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-white/20 p-3 text-read text-white/60"><p>{state.connection === 'offline' ? t('ui.coop.offlineHelp') : t('ui.coop.connectingHelp')}</p><Button onClick={client.reconnect}>{t('ui.coop.reconnect')}</Button></div>}
    <section className="my-4 flex flex-wrap items-center justify-between gap-4" aria-label={t('ui.coop.clockAria')}><div className="flex items-center gap-4"><div><p className="text-label uppercase text-white/35">{t('ui.coop.elapsed')}</p><p className="mt-1 text-title text-signal"><Clock ms={room.simMs} /></p></div><div className="border-l border-white/15 pl-4"><p className="text-plate uppercase text-white/70">{room.phase === 'lobby' ? t('ui.coop.assembling') : room.phase === 'ended' ? t('ui.coop.ended') : room.pause ? t('ui.coop.paused') : t('ui.coop.running')}</p><p className="mt-1 text-body text-white/40">{room.phase === 'lobby' ? t('ui.coop.lobbyHelp') : room.phase === 'ended' ? t('ui.coop.endedHelp') : room.pause ? room.pause.by ? t('ui.coop.pausedBy', { name: room.players.find(player => player.id === room.pause?.by)?.name ?? t('ui.coop.survivor') }) : t('ui.coop.disconnectPause') : t('ui.coop.clockHelp')}</p></div></div>
      {room.phase === 'lobby' ? me.id === room.hostId ? <Button primary disabled={!canSend} onClick={() => client.send({ type: 'start' })}>{t('ui.coop.start')}</Button> : <p className="text-body text-white/45">{t('ui.coop.waitingHost')}</p> : room.phase === 'running' ? room.pause ? <div><Button primary disabled={!canSend || room.ready.includes(me.id) || graceActive || !!room.resumeAt} onClick={() => client.send({ type: 'ready' })}>{room.resumeAt ? t('ui.coop.resuming', { seconds: Math.max(0, Math.ceil((room.resumeAt - serverNow) / 1000)) }) : graceActive ? t('ui.coop.grace', { seconds: Math.ceil((room.pause.graceUntil - serverNow) / 1000) }) : room.ready.includes(me.id) ? t('ui.coop.youReady') : t('ui.coop.readyResume')}</Button><p className="mt-2 text-body text-white/35">{t('ui.coop.readyCount', { ready: room.ready.length, connected: room.players.filter(player => player.connected).length })}</p></div> : <Button disabled={!canSend} onClick={() => client.send({ type: 'pause' })}>{t('ui.coop.pause')}</Button> : null}
    </section>
    {room.phase === 'lobby' && <section className={`${PANEL} mb-4 grid gap-4 p-4 sm:grid-cols-2`}><label className="text-body text-white/50">{t('ui.coopIsland.startDistrict')}<select className={`${SELECT} mt-2`} value={district} disabled={!canSend || me.id !== room.hostId} onChange={event => client.send({ type: 'spawn', district: event.target.value })}>{SPAWN_DISTRICTS.map(value => <option key={value.id} value={value.id}>{t(`ui.coopIsland.districts.${value.id}`)}</option>)}</select></label><label className="text-body text-white/50">{t('ui.coopIsland.occupation')}<select className={`${SELECT} mt-2`} value={me.expedition?.character.occupationId ?? 'student'} disabled={!canSend} onChange={event => client.send({ type: 'occupation', occupationId: event.target.value })}>{OCCUPATIONS.map(value => <option key={value.id} value={value.id}>{t(`occupation.${value.id}.name`)}</option>)}</select></label><p className="text-body text-white/40 sm:col-span-2">{t('ui.coopIsland.lobbyHint')}</p></section>}
    {me.status !== 'active' && <section className="mb-4 border border-hiss/40 bg-hiss/5 p-4" aria-label={t('ui.coop.noticeAria')}><h2 className="text-title text-signal">{me.status === 'downed' ? t('ui.coop.downedTitle') : me.status === 'dead' ? t('ui.coop.deadTitle') : t('ui.coop.extractedTitle')}</h2><p className="mt-2 text-body text-white/60">{me.status === 'downed' ? t('ui.coop.downedHelp', { site: world.locations[me.site]?.name ?? t('ui.coopIsland.trekPoint'), seconds: Math.max(0, Math.ceil(((me.downedUntil ?? room.simMs) - room.simMs) / 1000)) }) : me.status === 'extracted' ? t('ui.coop.extractedHelp') : room.phase === 'ended' ? t('ui.coop.deadEndedHelp') : t('ui.coopIsland.deadHelp', { site: world.locations[world.spawn]?.name ?? '' })}</p>{me.status === 'dead' && room.phase !== 'ended' && <div className="mt-3"><Button primary disabled={!canSend || !!room.pause || !replacementAvailable} onClick={() => client.send({ type: 'replace' })}>{t('ui.coop.replace')}</Button><p className="mt-2 text-body text-white/40">{t('ui.coopIsland.replacementHint', { site: world.locations[world.spawn]?.name ?? '' })}</p></div>}</section>}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <IslandMap room={room} me={me} selected={ground ? '' : selected} ground={ground} onSelect={select} onGround={point => { setGround(point); setTab('site'); }} />
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-body text-white/35"><p>{t('ui.coopIsland.mapHint')}</p><p>{t('ui.coopIsland.discovered', { count: Object.keys(world.locations).length })} · {t(`ui.weather.${world.weather}`)}</p></div>
      </div>
      <aside className={`${PANEL} min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto`}>
        <nav className="sticky top-0 z-10 grid grid-cols-5 border-b border-white/15 bg-concrete-900" aria-label={t('ui.coopIsland.panelNav')}>{TABS.map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`min-h-12 border-b-2 px-1 py-3 text-body ${tab === value ? 'border-astral bg-astral/5 text-signal' : 'border-transparent text-white/45 hover:text-white'}`}>{t(`ui.coopIsland.tabs.${value}`)}</button>)}</nav>
        {tab === 'site' ? <SitePanel room={room} me={me} selected={selected} ground={ground} active={active} idle={idle} send={client.send} onCurrent={() => select(me.site)} /> : tab === 'pack' ? <PackPanel room={room} me={me} idle={idle} send={client.send} /> : tab === 'body' ? <BodyPanel me={me} onPack={() => setTab('pack')} /> : tab === 'craft' ? <CraftPanel idle={idle && !(room.sites[me.site]?.enemyHp ?? 0)} send={client.send} /> : <SkillPanel me={me} />}
      </aside>
      <div className="min-w-0 lg:col-start-1 lg:row-start-2"><Squad room={room} me={me} onSelect={select} /></div>
    </div>
    <details className={`${PANEL} mt-4`}><summary className="min-h-11 cursor-pointer px-4 py-3 text-plate uppercase text-white/55">{t('ui.coop.logHeading')}</summary><ol className="max-h-64 space-y-2 overflow-y-auto border-t border-white/10 p-4 text-body" aria-label={t('ui.coop.logAria')}>{room.log.slice(-30).reverse().map((entry, index) => <li key={`${entry.at}-${index}`} className="flex gap-4"><span className="shrink-0 text-white/30"><Clock ms={entry.at} /></span><span className="text-white/65">{logText(entry.text)}</span></li>)}{!room.log.length && <li className="text-white/35">{t('ui.coop.logEmpty')}</li>}</ol></details>
    <footer className="mt-4 flex flex-wrap justify-between gap-2 text-body text-white/30"><p>{t('ui.coopIsland.scope')}</p><p>{state.pending ? t('ui.coop.sending') : t('ui.coop.lifeKills', { life: me.life, kills: me.kills })}</p></footer>
  </main>;
}
