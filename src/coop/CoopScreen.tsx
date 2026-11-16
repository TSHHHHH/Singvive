import { Component, lazy, Suspense, useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { useT } from '../i18n/useT';
import { useCoopCopy } from './copy';
import { CoopClient, enterRoom, readSession, type ClientState } from './client';
import { MAX_PLAYERS, SITES, type Command, type Credentials, type RoomState, type SiteId, type Stance, type Survivor } from './model';

const PANEL = 'border border-white/15 bg-concrete-900';
const INPUT = 'w-full rounded-sm border border-white/20 bg-concrete-950 px-3 py-3 text-read text-signal outline-none focus:border-signal';

const STANCES: Stance[] = ['guarded', 'aggressive', 'precision'];
const IslandScreen = lazy(() => import('./IslandScreen'));

function Button({ children, onClick, disabled = false, primary = false, title, type = 'button' }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean; title?: string; type?: 'button' | 'submit';
}) {
  return <button type={type} onClick={onClick} disabled={disabled} title={title}
    className={`min-h-11 rounded-sm border px-3 py-2 text-read transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:cursor-not-allowed disabled:opacity-35 ${primary
      ? 'border-signal bg-signal font-semibold text-black enabled:hover:bg-white'
      : 'border-white/25 bg-white/5 text-signal enabled:hover:border-white/60 enabled:hover:bg-white/10'}`}>{children}</button>;
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-label uppercase text-white/45">{children}</p>;
}

function Clock({ ms }: { ms: number }) {
  const minutes = Math.floor(ms / 1000);
  return <span className="tabular-nums">{String(Math.floor(minutes / 60)).padStart(2, '0')}:{String(minutes % 60).padStart(2, '0')}</span>;
}

function Lobby({ onEnter, saved }: { onEnter: (credentials: Credentials) => void; saved: Credentials | null }) {
  const { t } = useCoopCopy();
  const query = new URLSearchParams(window.location.search).get('coop') ?? '';
  const [name, setName] = useState('');
  const [code, setCode] = useState(query === '1' ? '' : query.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12));
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function enter(mode: 'create' | 'join') {
    if (busy || !name.trim() || (mode === 'join' && !code.trim())) return;
    setBusy(mode);
    setError(null);
    try { onEnter(await enterRoom(name, mode === 'join' ? code.trim() : undefined)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('ui.coop.enterError')); }
    finally { setBusy(null); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void enter(code ? 'join' : 'create'); }
  return <main className="flex min-h-full items-center justify-center bg-concrete-950 px-4 py-8 sm:px-8">
    <div className="w-full max-w-4xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-4">
        <a href="/" className="text-title text-signal hover:text-white">SINGVIVE</a>
        <span className="border border-white/20 px-2 py-1 text-label uppercase text-white/55">{t('ui.coop.prototype')}</span>
      </header>
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <section>
          <Kicker>{t('ui.coop.privateExpedition')}</Kicker>
          <h1 className="mt-4 max-w-sm text-marquee uppercase text-signal">{t('ui.coop.heroFirst')}<br />{t('ui.coop.heroSecond')}</h1>
          <p className="mt-5 max-w-sm text-read text-white/60">{t('ui.coopIsland.intro')}</p>
          <div className="mt-7 space-y-4 border-l border-white/20 pl-4 text-body text-white/55">
            <p><span className="text-signal">{t('ui.coop.stepOne')}</span><br />{t('ui.coop.stepOneBody')}</p>
            <p><span className="text-signal">{t('ui.coop.stepTwo')}</span><br />{t('ui.coop.stepTwoBody')}</p>
            <p><span className="text-signal">{t('ui.coop.stepThree')}</span><br />{t('ui.coop.stepThreeBody')}</p>
          </div>
          <p className="mt-7 text-body text-white/35">{t('ui.coopIsland.prototypeNote')}</p>
        </section>
        <section className={`${PANEL} self-start p-5 sm:p-6`} aria-labelledby="lobby-heading">
          <Kicker>{t('ui.coop.connectHeading')}</Kicker>
          <h2 id="lobby-heading" className="mt-2 text-title text-signal">{t('ui.coop.assembleHeading')}</h2>
          <form onSubmit={submit} className="mt-6 space-y-5">
            <label className="block text-body text-white/60">{t('ui.coop.name')}
              <input className={`${INPUT} mt-2`} autoComplete="nickname" maxLength={24} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('ui.coop.namePlaceholder')} required />
            </label>
            <div className="grid gap-3">
              <Button primary disabled={!!busy || !name.trim()} onClick={() => { void enter('create'); }}>{busy === 'create' ? t('ui.coop.creating') : t('ui.coop.create')}</Button>
            </div>
            <div className="border-t border-white/15 pt-5">
              <label className="block text-body text-white/60">{t('ui.coop.invitePrompt')}
                <input className={`${INPUT} mt-2 uppercase`} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder={t('ui.coop.codePlaceholder')} />
              </label>
              <div className="mt-3 grid"><Button type="submit" disabled={!!busy || !name.trim() || !code.trim()}>{busy === 'join' ? t('ui.coop.joining') : t('ui.coop.join')}</Button></div>
            </div>
          </form>
          {error && <p role="alert" className="mt-4 border border-hiss/50 bg-hiss/10 p-3 text-read text-red-200">{error}</p>}
          {saved && <div className="mt-5 border-t border-white/15 pt-4"><Button onClick={() => onEnter(saved)}>{t('ui.coop.returnRoom', { code: saved.room })}</Button><p className="mt-2 text-body text-white/40">{t('ui.coop.seatSaved')}</p></div>}
          <a href="/" className="mt-6 inline-block text-body text-white/45 underline underline-offset-4 hover:text-white">{t('ui.coop.backSolo')}</a>
        </section>
      </div>
    </div>
  </main>;
}

function District({ room, me, selected, onSelect }: { room: RoomState; me: Survivor; selected: SiteId; onSelect: (id: SiteId) => void }) {
  const { t, siteName } = useCoopCopy();
  return <section className={`${PANEL} overflow-hidden`} aria-labelledby="district-heading">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
      <h2 id="district-heading" className="text-plate uppercase text-white/65">{t('ui.coop.district')}</h2>
      <span className="text-label uppercase text-white/35">{t('ui.coop.schematicHint')}</span>
    </div>
    <div className="relative aspect-[5/3] min-h-64 w-full bg-concrete-950">
      <svg viewBox="0 0 1000 600" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs><pattern id="coop-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.045" /></pattern></defs>
        <rect width="1000" height="600" fill="url(#coop-grid)" />
        <g fill="currentColor" fillOpacity="0.025" stroke="currentColor" strokeOpacity="0.06">
          <path d="M40 40H155V190H40ZM360 40H610V125H360ZM650 270H910V450H650ZM290 430H470V550H290ZM40 480H195V560H40Z" />
        </g>
        {SITES.flatMap((site) => site.links.filter((link) => site.id < link).map((link) => {
          const target = SITES.find((candidate) => candidate.id === link)!;
          const highlighted = (me.site === site.id && selected === link) || (me.site === link && selected === site.id);
          return <line key={`${site.id}-${link}`} x1={site.x * 10} y1={site.y * 6} x2={target.x * 10} y2={target.y * 6} stroke="currentColor" strokeOpacity={highlighted ? 0.65 : 0.16} strokeWidth={highlighted ? 3 : 2} strokeDasharray="8 9" />;
        }))}
      </svg>
      {SITES.map((site, index) => {
        const occupants = room.players.filter((player) => player.site === site.id && player.status !== 'dead' && player.status !== 'extracted');
        const ownSite = me.site === site.id;
        return <button key={site.id} onClick={() => onSelect(site.id)} aria-pressed={selected === site.id}
          aria-label={t('ui.coop.siteAria', { site: siteName(site.id), location: ownSite ? t('ui.coop.yourLocationSuffix') : '', count: occupants.length, hostile: room.sites[site.id].enemyHp > 0 ? t('ui.coop.hostileSuffix') : '' })}
          style={{ left: `${site.x}%`, top: `${site.y}%` }}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 px-1 py-2 outline-none focus-visible:ring-2 focus-visible:ring-signal">
          <span className={`flex h-9 w-9 items-center justify-center border text-read ${selected === site.id ? 'border-signal bg-signal text-black' : ownSite ? 'border-signal bg-concrete-900 text-signal' : 'border-white/30 bg-concrete-900 text-white/60'}`}>{String(index + 1).padStart(2, '0')}</span>
          <span className="whitespace-nowrap bg-concrete-950/90 px-1 text-body text-signal">{siteName(site.id)}</span>
          <span className="flex min-h-2 items-center gap-1" aria-hidden="true">{occupants.map((player) => <span key={player.id} className={`h-1.5 w-1.5 rounded-full ${player.status === 'downed' ? 'bg-hiss' : player.id === me.id ? 'bg-astral' : 'bg-signal/65'}`} />)}{room.sites[site.id].enemyHp > 0 && <span className="ml-1 h-1.5 w-1.5 rotate-45 bg-hiss" />}</span>
        </button>;
      })}
      <span className="absolute bottom-3 left-4 text-label uppercase text-white/25">{t('ui.coop.sector')}</span>
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 px-4 py-3 text-body text-white/45">
      <span><span className="text-astral">●</span> {t('ui.coop.you')}</span><span><span className="text-signal">●</span> {t('ui.coop.squad')}</span><span><span className="text-hiss">◆</span> {t('ui.coop.hostileLegend')}</span><span>{t('ui.coop.routeDuration')}</span>
    </div>
  </section>;
}

function Roster({ room, me }: { room: RoomState; me: Survivor }) {
  const { t, siteName } = useCoopCopy();
  return <section aria-labelledby="roster-heading">
    <h2 id="roster-heading" className="mb-3 text-plate uppercase text-white/45">{t('ui.coop.rosterCount', { count: room.players.length, max: MAX_PLAYERS })}</h2>
    <div className="grid gap-2 sm:grid-cols-2">
      {room.players.map((player, index) => <article key={player.id} className={`${PANEL} min-w-0 p-3 ${player.id === me.id ? 'border-astral/35' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><p className="truncate text-read font-semibold text-signal"><span className="mr-2 text-white/30">0{index + 1}</span>{player.name}{player.id === me.id && <span className="ml-2 text-label text-astral">{t('ui.coop.youBadge')}</span>}</p><p className="mt-1 text-body text-white/45">{siteName(player.site)} · {t(`ui.coop.status.${player.action?.kind === 'travel' ? 'travelling' : player.status}`)}</p></div>
          <span className={`shrink-0 text-label uppercase ${player.connected ? 'text-white/55' : 'text-hiss'}`}>{player.connected ? room.ready.includes(player.id) ? t('ui.coop.ready') : t('ui.coop.online') : t('ui.coop.offline')}</span>
        </div>
        <div className="mt-3 h-1 bg-white/10" role="meter" aria-label={t('ui.coop.healthAria', { name: player.name })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={player.hp}><div className={player.hp <= 30 ? 'h-full bg-hiss' : 'h-full bg-signal/60'} style={{ width: `${Math.max(0, Math.min(100, player.hp))}%` }} /></div>
        <div className="mt-2 flex flex-wrap justify-between gap-1 text-body text-white/45"><span>{t('ui.coop.vitals', { hp: player.hp, wounds: player.wounds })}</span><span>{t('ui.coop.supplies', { medical: player.medical, food: player.food })}</span></div>
        {player.status === 'downed' && <p className="mt-2 text-body text-red-300">{t('ui.coop.rescueWindow', { seconds: Math.max(0, Math.ceil(((player.downedUntil ?? room.simMs) - room.simMs) / 1000)) })}</p>}
        {player.action && <p className="mt-2 text-body text-white/65">{t('ui.coop.actionStatus', { action: player.action.kind === 'travel' ? t('ui.coop.enRoute', { site: siteName(player.action.target as SiteId) }) : t(`ui.coop.actions.${player.action.kind}`), seconds: Math.max(0, Math.ceil((player.action.endsAt - room.simMs) / 1000)) })}</p>}
        {player.fighting && <p className="mt-2 text-body text-red-300">{t('ui.coop.inCombat', { stance: t(`ui.coop.stances.${player.stance}.label`) })}</p>}
      </article>)}
      {Array.from({ length: MAX_PLAYERS - room.players.length }, (_, index) => <div key={`empty-${index}`} className="flex min-h-28 items-center justify-center border border-dashed border-white/10 p-3 text-body text-white/25">{t('ui.coop.openSeat')}</div>)}
    </div>
  </section>;
}

function SitePanel({ room, me, selected, canSend, send }: { room: RoomState; me: Survivor; selected: SiteId; canSend: boolean; send: (command: Command) => boolean }) {
  const { t, siteName } = useCoopCopy();
  const site = SITES.find((candidate) => candidate.id === selected)!;
  const state = room.sites[selected];
  const local = selected === me.site;
  const current = SITES.find((candidate) => candidate.id === me.site)!;
  const linked = current.links.some((id) => id === selected);
  const active = canSend && room.phase === 'running' && !room.pause && me.status === 'active';
  const available = active && !me.action;
  const idle = available && !me.fighting;
  const currentHostile = room.sites[me.site].enemyHp > 0;
  const nearby = room.players.filter((player) => player.id !== me.id && player.site === me.site && player.action?.kind !== 'travel');
  const actionRemaining = me.action ? Math.max(0, Math.ceil((me.action.endsAt - room.simMs) / 1000)) : 0;
  const progress = me.action ? Math.max(0, Math.min(100, (room.simMs - me.action.startedAt) / (me.action.endsAt - me.action.startedAt) * 100)) : 0;
  return <aside className={`${PANEL} self-start`} aria-labelledby="site-heading">
    <div className="border-b border-white/10 p-4"><Kicker>{local ? t('ui.coop.yourLocation') : t('ui.coop.selectedDestination')}</Kicker><h2 id="site-heading" className="mt-2 text-title text-signal">{siteName(site.id)}</h2><p className="mt-2 text-body text-white/50">{t(`ui.coop.sites.${site.id}.description`)}</p></div>
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-3 gap-2 text-center"><div className="bg-white/5 p-2"><p className="text-title tabular-nums text-signal">{state.searches}</p><Kicker>{t('ui.coop.searchesLeft')}</Kicker></div><div className="bg-white/5 p-2"><p className="text-title tabular-nums text-signal">{state.medical}</p><Kicker>{t('ui.coop.medical')}</Kicker></div><div className="bg-white/5 p-2"><p className="text-title tabular-nums text-signal">{state.food}</p><Kicker>{t('ui.coop.food')}</Kicker></div></div>
      {!local && <div className="grid gap-2"><Button primary disabled={!idle || !linked || currentHostile} onClick={() => send({ type: 'travel', site: selected })}>{t('ui.coop.travel')}</Button>{currentHostile ? <><p className="text-body text-red-300">{t('ui.coop.travelBlocked', { site: siteName(me.site) })}</p><Button disabled={!active || me.action?.kind === 'travel'} onClick={() => send({ type: 'flee' })}>{t('ui.coop.fleeRendezvous')}</Button></> : !linked ? <p className="text-body text-white/40">{t('ui.coop.noRoute', { site: siteName(me.site) })}</p> : null}</div>}
      {local && <>
        {me.action && <div className="border border-white/20 p-3"><div className="flex justify-between gap-2 text-read text-signal"><span className="capitalize">{t(`ui.coop.actions.${me.action.kind}`)}</span><span className="tabular-nums">{t('ui.coop.seconds', { count: actionRemaining })}</span></div><div className="my-3 h-1 bg-white/10"><div className="h-full bg-signal" style={{ width: `${progress}%` }} /></div>{me.action.kind === 'travel' ? <p className="text-body text-white/40">{t('ui.coop.travelCommitted')}</p> : <Button disabled={!active} onClick={() => send({ type: 'cancel' })}>{t('ui.coop.cancel')}</Button>}</div>}
        <div className="grid grid-cols-2 gap-2"><Button disabled={!idle || state.searches <= 0 || state.enemyHp > 0} onClick={() => send({ type: 'search' })}>{t('ui.coop.search')}</Button><Button disabled={!idle || state.enemyHp > 0} onClick={() => send({ type: 'rest' })}>{t('ui.coop.rest')}</Button></div>
        <div><Kicker>{t('ui.coop.cache')}</Kicker><div className="mt-2 grid grid-cols-2 gap-2"><Button disabled={!available || state.medical < 1} onClick={() => send({ type: 'take', item: 'medical' })}>{t('ui.coop.takeMedical')}</Button><Button disabled={!available || state.food < 1} onClick={() => send({ type: 'take', item: 'food' })}>{t('ui.coop.takeFood')}</Button></div></div>
        {state.enemyHp > 0 && <section className="border border-hiss/40 bg-hiss/5 p-3"><p className="text-plate uppercase text-red-300">{t('ui.coop.enemyHealth', { hp: state.enemyHp })}</p><p className="mt-2 text-body text-white/50">{t('ui.coop.combatHelp')}</p><div className="mt-3 grid grid-cols-2 gap-2"><Button disabled={!idle} onClick={() => send({ type: 'fight' })}>{me.fighting ? t('ui.coop.fighting') : t('ui.coop.fight')}</Button><Button disabled={!active || me.action?.kind === 'travel'} onClick={() => send({ type: 'flee' })}>{t('ui.coop.flee')}</Button></div></section>}
        <fieldset><legend className="text-label uppercase text-white/45">{t('ui.coop.stanceHeading')}</legend><div className="mt-2 grid grid-cols-3 gap-1">{STANCES.map((stance) => <button type="button" key={stance} disabled={!active || me.stance === stance} aria-pressed={me.stance === stance} title={t(`ui.coop.stances.${stance}.detail`)} onClick={() => send({ type: 'stance', stance: stance })} className={`min-h-11 border px-1 py-2 text-body disabled:opacity-35 ${me.stance === stance ? 'border-signal bg-white/10 text-signal' : 'border-white/15 text-white/45 enabled:hover:border-white/50'}`}>{t(`ui.coop.stances.${stance}.label`)}</button>)}</div></fieldset>
        {selected === 'evac' && <div className="grid gap-2 border-t border-white/15 pt-4"><Button primary disabled={!idle || state.enemyHp > 0} onClick={() => send({ type: 'extract' })}>{t('ui.coop.extract')}</Button><p className="text-body text-white/40">{t('ui.coop.extractHelp')}</p></div>}
      </>}
      <div className="border-t border-white/15 pt-4"><Kicker>{t('ui.coop.yourSupplies', { medical: me.medical, food: me.food })}</Kicker><div className="mt-2 grid"><Button disabled={!available || me.food < 1 || me.hp >= Math.max(40, 100 - me.wounds * 15)} onClick={() => send({ type: 'eat' })}>{t('ui.coop.eat')}</Button></div></div>
      {nearby.length > 0 && <section className="border-t border-white/15 pt-4"><Kicker>{t('ui.coop.nearby', { site: siteName(me.site) })}</Kicker><div className="mt-3 space-y-3">{nearby.map((player) => <div key={player.id}><p className="text-read text-white/75">{player.name} <span className="text-body text-white/40">/ {t(`ui.coop.status.${player.status}`)}</span></p>{player.status === 'downed' ? <div className="mt-2 grid"><Button primary disabled={!available || me.medical < 1} onClick={() => send({ type: 'rescue', playerId: player.id })}>{t('ui.coop.rescue')}</Button></div> : player.status === 'active' ? <div className="mt-2 grid grid-cols-2 gap-2"><Button disabled={!available || me.medical < 1} onClick={() => send({ type: 'give', item: 'medical', playerId: player.id })}>{t('ui.coop.giveMedical')}</Button><Button disabled={!available || me.food < 1} onClick={() => send({ type: 'give', item: 'food', playerId: player.id })}>{t('ui.coop.giveFood')}</Button></div> : null}</div>)}</div><p className="mt-3 text-body text-white/35">{t('ui.coop.rescueHelp')}</p></section>}
    </div>
  </aside>;
}

function Room({ credentials, onLobby }: { credentials: Credentials; onLobby: () => void }) {
  const { t, logText } = useCoopCopy();
  const [client] = useState(() => new CoopClient(credentials));
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [selected, setSelected] = useState<SiteId>('shelter');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { client.start(); return client.stop; }, [client]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer); }, [copied]);
  const room = state.room;
  const me = room?.players.find((player) => player.id === credentials.playerId);
  const canSend = state.connection === 'connected' && !state.pending;
  const serverNow = now + state.serverOffset;
  const graceActive = !!room?.pause && room.pause.graceUntil > serverNow && room.players.some((player) => !player.connected);
  async function copyInvite() {
    const url = new URL('/', window.location.href);
    url.searchParams.set('coop', credentials.room);
    try { await navigator.clipboard.writeText(url.toString()); setCopied(true); setCopyFailed(false); }
    catch { setCopied(false); setCopyFailed(true); }
  }
  if (room?.world && me) return <Suspense fallback={<main className="flex min-h-full items-center justify-center bg-concrete-950 p-6 text-read text-white/50">{t('ui.coop.establishing')}</main>}><IslandScreen room={room} me={me} state={state} client={client} credentials={credentials} onLobby={onLobby} /></Suspense>;
  return <main className="min-h-full bg-concrete-950 px-3 pb-8 pt-4 sm:px-6">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-4">
        <div><a href="/" className="text-title text-signal">SINGVIVE <span className="text-body font-normal text-white/35">{t('ui.coop.headerBadge')}</span></a><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1"><p className="text-plate uppercase text-white/55">{t('ui.coop.roomLabel')} <span className="select-all text-signal">{credentials.room}</span></p><Connection state={state} /></div></div>
        <div className="flex gap-2"><Button onClick={() => { void copyInvite(); }}>{copied ? t('ui.coop.inviteCopied') : t('ui.coop.copyInvite')}</Button><Button onClick={onLobby}>{t('ui.coop.lobby')}</Button></div>
      </header>
      {copyFailed && <p role="status" className="mt-3 text-body text-white/55">{t('ui.coop.copyFailed', { code: credentials.room })}</p>}
      {state.error && <div role="alert" className="mt-4 flex items-start justify-between gap-3 border border-hiss/40 bg-hiss/10 p-3 text-read text-red-200"><p>{state.error}</p><button type="button" onClick={client.clearError} aria-label={t('ui.coop.dismiss')} className="shrink-0 px-2 text-white/60 hover:text-white">×</button></div>}
      {state.connection !== 'connected' && <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-white/20 bg-white/5 p-3 text-read text-white/65"><p>{state.connection === 'offline' ? t('ui.coop.offlineHelp') : t('ui.coop.connectingHelp')}</p>{state.connection === 'offline' && <Button onClick={client.reconnect}>{t('ui.coop.reconnect')}</Button>}</div>}
      {room && me ? <>
        <section className="my-4 flex flex-wrap items-center justify-between gap-4 border border-white/15 bg-concrete-900 p-4" aria-label={t('ui.coop.clockAria')}>
          <div className="flex items-center gap-5"><div><Kicker>{t('ui.coop.elapsed')}</Kicker><p className="mt-1 text-marquee text-signal"><Clock ms={room.simMs} /></p></div><div className="border-l border-white/15 pl-5"><p className="text-plate uppercase text-white/75">{room.phase === 'lobby' ? t('ui.coop.assembling') : room.phase === 'ended' ? t('ui.coop.ended') : room.pause ? t('ui.coop.paused') : t('ui.coop.running')}</p><p className="mt-1 max-w-lg text-body text-white/45">{room.phase === 'lobby' ? t('ui.coop.lobbyHelp') : room.phase === 'ended' ? t('ui.coop.endedHelp') : room.pause ? room.pause.by ? t('ui.coop.pausedBy', { name: room.players.find((player) => player.id === room.pause?.by)?.name ?? t('ui.coop.survivor') }) : t('ui.coop.disconnectPause') : t('ui.coop.clockHelp')}</p></div></div>
          {room.phase === 'lobby' ? me.id === room.hostId ? <Button primary disabled={!canSend} onClick={() => client.send({ type: 'start' })}>{t('ui.coop.start')}</Button> : <p className="text-read text-white/45">{t('ui.coop.waitingHost')}</p> : room.phase === 'running' ? room.pause ? <div className="text-right">{room.resumeAt ? <p role="status" className="text-read text-signal">{t('ui.coop.resuming', { seconds: Math.max(0, Math.ceil((room.resumeAt - serverNow) / 1000)) })}</p> : <Button primary disabled={!canSend || room.ready.includes(me.id) || graceActive} onClick={() => client.send({ type: 'ready' })}>{graceActive ? t('ui.coop.grace', { seconds: Math.ceil((room.pause.graceUntil - serverNow) / 1000) }) : room.ready.includes(me.id) ? t('ui.coop.youReady') : t('ui.coop.readyResume')}</Button>}<p className="mt-2 text-body text-white/40">{t('ui.coop.readyCount', { ready: room.ready.length, connected: room.players.filter((player) => player.connected).length })}</p></div> : <Button disabled={!canSend} onClick={() => client.send({ type: 'pause' })}>{t('ui.coop.pause')}</Button> : null}
        </section>
        <SurvivorNotice room={room} me={me} canSend={canSend} send={client.send} />
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]"><div className="min-w-0 lg:col-start-1 lg:row-start-1"><District room={room} me={me} selected={selected} onSelect={setSelected} /></div><div className="lg:col-start-2 lg:row-span-2 lg:row-start-1"><SitePanel room={room} me={me} selected={selected} canSend={canSend} send={client.send} /></div><div className="min-w-0 lg:col-start-1 lg:row-start-2"><Roster room={room} me={me} /></div></div>
        <section className={`${PANEL} mt-5`} aria-labelledby="log-heading"><h2 id="log-heading" className="border-b border-white/10 px-4 py-3 text-plate uppercase text-white/55">{t('ui.coop.logHeading')}</h2><ol className="max-h-64 space-y-2 overflow-y-auto p-4 text-body" aria-label={t('ui.coop.logAria')}>{room.log.slice(-30).reverse().map((entry, index) => <li key={`${entry.at}-${index}`} className="flex gap-4"><span className="shrink-0 text-white/30"><Clock ms={entry.at} /></span><span className="text-white/65">{logText(entry.text)}</span></li>)}{!room.log.length && <li className="text-white/35">{t('ui.coop.logEmpty')}</li>}</ol></section>
        <footer className="mt-5 flex flex-wrap justify-between gap-2 text-body text-white/30"><p>{t('ui.coop.footer')}</p><p>{state.pending ? t('ui.coop.sending') : t('ui.coop.lifeKills', { life: me.life, kills: me.kills })}</p></footer>
      </> : <div className="flex min-h-80 items-center justify-center text-read text-white/35">{t('ui.coop.waitingSnapshot')}</div>}
    </div>
  </main>;
}

function Connection({ state }: { state: ClientState }) {
  const { t } = useCoopCopy();
  return <p role="status" className={`flex items-center gap-1.5 text-label uppercase ${state.connection === 'connected' ? 'text-astral' : 'text-white/45'}`}><span className={`h-1.5 w-1.5 rounded-full ${state.connection === 'connected' ? 'bg-astral' : state.connection === 'offline' ? 'bg-hiss' : 'bg-white/35'}`} />{state.connection === 'connected' ? state.pending ? t('ui.coop.sendingShort') : t('ui.coop.live') : state.connection === 'reconnecting' ? t('ui.coop.reconnecting', { attempt: state.retries }) : t(`ui.coop.connection.${state.connection}`)}</p>;
}

function SurvivorNotice({ room, me, canSend, send }: { room: RoomState; me: Survivor; canSend: boolean; send: (command: Command) => boolean }) {
  const { t, siteName } = useCoopCopy();
  if (me.status === 'active') return null;
  const replacementAvailable = room.phase === 'running' && room.players.some((player) => player.id !== me.id && player.status === 'active' && player.site === 'shelter' && !player.action);
  return <section className={`mb-4 border p-4 ${me.status === 'downed' ? 'border-hiss/50 bg-hiss/10' : 'border-white/25 bg-white/5'}`} aria-label={t('ui.coop.noticeAria')}><h2 className="text-title text-signal">{me.status === 'downed' ? t('ui.coop.downedTitle') : me.status === 'dead' ? t('ui.coop.deadTitle') : t('ui.coop.extractedTitle')}</h2><p className="mt-2 text-read text-white/60">{me.status === 'downed' ? t('ui.coop.downedHelp', { site: siteName(me.site), seconds: Math.max(0, Math.ceil(((me.downedUntil ?? room.simMs) - room.simMs) / 1000)) }) : me.status === 'dead' ? room.phase === 'ended' ? t('ui.coop.deadEndedHelp') : t('ui.coop.deadHelp') : t('ui.coop.extractedHelp')}</p>{me.status === 'dead' && room.phase !== 'ended' && <div className="mt-3"><Button primary disabled={!canSend || !!room.pause || !replacementAvailable} onClick={() => send({ type: 'replace' })}>{t('ui.coop.replace')}</Button><p className="mt-2 text-body text-white/40">{replacementAvailable ? t('ui.coop.replacementHelp') : t('ui.coop.waitingReplacement')}</p></div>}</section>;
}

function CoopEntry() {
  const { t } = useCoopCopy();
  const [saved] = useState(readSession);
  const [credentials, setCredentials] = useState<Credentials | null>(() => {
    const code = new URLSearchParams(window.location.search).get('coop')?.toUpperCase();
    return saved && (!code || code === '1' || code === saved.credentials.room) ? saved.credentials : null;
  });
  function enter(credentials: Credentials) {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('coop', credentials.room);
    window.history.replaceState(null, '', url);
    setCredentials(credentials);
  }
  if (import.meta.env.MODE === 'itch') return <main className="flex min-h-full items-center justify-center p-6"><div className="max-w-md"><h1 className="text-title text-signal">{t('ui.coop.itchHeading')}</h1><p className="mt-3 text-read text-white/55">{t('ui.coop.itchHelp')}</p><a href="./" className="mt-5 inline-block text-read text-signal underline">{t('ui.coop.returnSolo')}</a></div></main>;
  return credentials ? <Room key={`${credentials.room}-${credentials.playerId}`} credentials={credentials} onLobby={() => { setCredentials(null); }} /> : <Lobby saved={readSession()?.credentials ?? null} onEnter={enter} />;
}

class CoopBoundary extends Component<{ children: ReactNode; t: ReturnType<typeof useT>['t'] }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    const { t } = this.props;
    return this.state.failed ? <main className="flex min-h-full items-center justify-center p-6"><div className="max-w-md"><h1 className="text-title text-signal">{t('ui.coop.displayError')}</h1><p className="mt-3 text-read text-white/55">{t('ui.coop.displayErrorHelp')}</p><div className="mt-5"><Button primary onClick={() => window.location.reload()}>{t('ui.coop.reload')}</Button></div></div></main> : this.props.children;
  }
}

export default function CoopScreen() {
  const { t, locale } = useT();
  useEffect(() => { document.documentElement.lang = locale === 'zh-Hans' ? 'zh-Hans' : 'en'; }, [locale]);
  return <CoopBoundary t={t}><CoopEntry /></CoopBoundary>;
}
