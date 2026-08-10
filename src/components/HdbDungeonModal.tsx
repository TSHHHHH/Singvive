import { useState } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { useGame } from '../game/store';
import {
  currentFloor,
  ENTRY_META,
  floorThreat,
  forceableLevels,
  heatBand,
  HEAT_BANDS,
  HEAT_MAX,
  HUNT_ELITE_CHANCE,
  isHunting,
  retreatDc,
  risersAt,
  SEAL_META,
  threatBreakdown,
  reachableLevels,
  senseChance,
  SERVICE_LABEL,
  SERVICE_ICON,
  type HdbDungeon,
  type HdbUnitNode,
} from '../game/hdbDungeon';

const UNIT_ICON: Record<HdbUnitNode['type'], IconName> = {
  residential: 'hdb.unit',
  corner_unit: 'hdb.cornerUnit',
  stairwell: 'hdb.stairwell',
  shelter_service: 'hdb.service',
  hazard: 'hdb.hazard',
};

const STATE_CLASS: Record<HdbUnitNode['state'], string> = {
  unexplored: 'border-concrete-600 bg-concrete-800 text-concrete-200',
  scouted: 'border-astral/50 bg-astral/10 text-astral',
  breached: 'border-signal/60 bg-signal/10 text-signal',
  cleared: 'border-concrete-600/50 bg-concrete-900 text-concrete-400 line-through',
};

/**
 * The block, read as a tower: floors on the left, the corridor you're standing
 * in on the right. Everything costs time, and time is what wakes the block up.
 */
export function HdbDungeonModal() {
  const hdb = useGame((s) => s.hdb);
  const character = useGame((s) => s.character);
  const hdbBreach = useGame((s) => s.hdbBreach);
  const hdbMove = useGame((s) => s.hdbMove);
  const hdbUseService = useGame((s) => s.hdbUseService);
  const hdbForceSeal = useGame((s) => s.hdbForceSeal);
  const hdbLeave = useGame((s) => s.hdbLeave);
  const [selected, setSelected] = useState<string | null>(null);

  if (!hdb || !character) return null;

  const floor = currentFloor(hdb);
  const threat = floorThreat(hdb, hdb.currentLevel);
  const reachable = reachableLevels(hdb);
  const heat = Math.round(hdb.blockHeat);
  const band = heatBand(hdb.blockHeat);
  const hunting = isHunting(hdb);
  const dc = retreatDc(hdb);
  const parts = threatBreakdown(hdb, hdb.currentLevel);
  const sel = floor.units.find((u) => u.id === selected) ?? null;

  const attrs = character.attributes;
  // Each sense rolls per room on the way in — show the odds, not a pass/fail gate.
  const senses = [
    { key: 'Perception', value: attrs.perception, gives: 'threat count' },
    { key: 'Wits', value: attrs.wits, gives: 'room traits' },
    { key: 'Dexterity', value: attrs.dexterity, gives: 'container type' },
  ];

  const wing = (w: HdbUnitNode['wing']) => floor.units.filter((u) => u.wing === w);

  return (
    <div className="flex h-full w-full flex-col bg-concrete-950">
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        {/* ---- signage header ---- */}
        <div className="flex shrink-0 items-center justify-between border-b border-concrete-600 bg-concrete-800 px-4 py-2.5">
          <div className="min-w-0">
            <div className="signage truncate text-[11px] text-signal">{hdb.name}</div>
            <div className="text-[11px] text-concrete-400">
              {hdb.archetype === 'shelter' ? 'Barricaded shelter' : 'Residential block'} ·{' '}
              {floor.layoutType === 'slab' ? 'slab layout' : 'point block'}
            </div>
          </div>
          <button
            onClick={hdbLeave}
            className="shrink-0 rounded border border-concrete-600 px-3 py-1.5 text-xs hover:bg-white/5"
          >
            ✕ Leave block
          </button>
        </div>

        <HeatGauge heat={heat} band={band} dc={dc} hunting={hunting} />

        <div className="flex min-h-0 flex-1">
          {/* ================= LEFT: the block, as a section ================= */}
          <div className="w-52 shrink-0 overflow-y-auto border-r border-concrete-600 bg-concrete-950/60 p-2 md:w-64">
            {band.dcStep > 0 && (
              <div className="mb-2 rounded border border-hiss/40 bg-hiss/10 px-1.5 py-1 text-[9px] leading-snug text-hiss">
                Going down is a check now — Dex+End vs DC {dc}.
                {hunting ? ' The stairs are hunted in both directions.' : ' Climbing is still free.'}
              </div>
            )}
            <BlockSection hdb={hdb} reachable={reachable} onMove={hdbMove} onForce={hdbForceSeal} />
          </div>

          {/* ================= RIGHT: corridor map ================= */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="signage text-xs text-concrete-50">
                Level {String(hdb.currentLevel).padStart(2, '0')}
              </h3>
              <span className="text-[11px] text-concrete-400">
                Floor threat{' '}
                <span className={threat >= 5 ? 'text-hiss' : 'text-signal'}>{threat}</span>{' '}
                <span className="text-[10px] text-concrete-400/70">
                  ({parts.base} block
                  {parts.heat > 0 && <span className="text-hiss"> +{parts.heat} heat</span>}
                  {parts.height < 0 && ` ${parts.height} height`})
                </span>
                {floor.isSkybridge && <span className="text-astral"> · skybridge</span>}
              </span>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
              <Wing title="Left wing" units={wing('left')} selected={selected} onSelect={setSelected} />
              <Wing title="Core" units={wing('core')} selected={selected} onSelect={setSelected} narrow />
              <Wing title="Right wing" units={wing('right')} selected={selected} onSelect={setSelected} />
            </div>

            {/* ---- selected unit ---- */}
            <div className="mt-3 rounded border border-concrete-600 bg-concrete-950/60 p-3">
              {!sel ? (
                <p className="text-xs text-concrete-400">
                  You read this corridor on the way in — what you caught depends on your
                  senses. Pick a door — most hang open and cost you nothing but time.
                  The ones still shut are worth more, and forcing them wakes the block.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      <Icon name={UNIT_ICON[sel.type]} /> {sel.label}
                    </span>
                    <span className="text-[11px] uppercase tracking-widest text-concrete-400">
                      {sel.state === 'cleared' ? 'cleared' : ENTRY_META[sel.entry].label}
                    </span>
                  </div>

                  <ul className="mt-2 space-y-0.5 text-[11px] text-concrete-200">
                    <li>
                      Threats:{' '}
                      {sel.scoutedInfo && sel.scoutedInfo.threatCount >= 0 ? (
                        sel.scoutedInfo.threatCount
                      ) : (
                        <span className="text-concrete-400">couldn't count</span>
                      )}
                    </li>
                    <li>
                      Room:{' '}
                      {sel.scoutedInfo?.hazardType ? (
                        <span className="text-hiss">{sel.scoutedInfo.hazardType}</span>
                      ) : sel.scoutedInfo?.readRoom ? (
                        'reads clean'
                      ) : (
                        <span className="text-concrete-400">unread</span>
                      )}
                    </li>
                    <li>
                      Containers:{' '}
                      {sel.scoutedInfo?.containerCategory ? (
                        <span className="text-astral">
                          {sel.scoutedInfo.containerCategory} · {sel.scoutedInfo.lootQuality}
                        </span>
                      ) : (
                        <span className="text-concrete-400">unread</span>
                      )}
                    </li>
                  </ul>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {sel.type === 'shelter_service' && sel.service ? (
                      <button
                        onClick={() => hdbUseService(sel.id)}
                        disabled={sel.state === 'cleared'}
                        className="rounded bg-signal/80 px-3 py-1.5 text-xs font-bold text-black hover:bg-signal disabled:opacity-30"
                      >
                        <><Icon name={SERVICE_ICON[sel.service]} /> {SERVICE_LABEL[sel.service]}</>
                      </button>
                    ) : sel.state === 'cleared' ? (
                      <span className="text-[11px] text-concrete-400">
                        You've already been through this one. Nothing left in it.
                      </span>
                    ) : (
                      <button
                        onClick={() => hdbBreach(sel.id)}
                        className="rounded bg-signal/80 px-3 py-1.5 text-xs font-bold text-black hover:bg-signal"
                      >
                        <Icon name={ENTRY_META[sel.entry].heat > 0 ? 'hdb.breach' : 'hdb.unit'} />{' '}
                        {ENTRY_META[sel.entry].verb} · {ENTRY_META[sel.entry].minutes} min ·{' '}
                        {ENTRY_META[sel.entry].heat > 0
                          ? `+${ENTRY_META[sel.entry].heat} heat`
                          : 'quiet'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ---- what your senses can actually read ---- */}
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-concrete-400">
              {senses.map((s) => (
                <span
                  key={s.key}
                  className={`rounded border px-1.5 py-0.5 ${
                    senseChance(s.value) >= 0.6
                      ? 'border-astral/40 text-astral'
                      : 'border-concrete-600'
                  }`}
                >
                  {s.key} {s.value} → {s.gives} {Math.round(senseChance(s.value) * 100)}%
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Wing({
  title,
  units,
  selected,
  onSelect,
  narrow,
}: {
  title: string;
  units: HdbUnitNode[];
  selected: string | null;
  onSelect: (id: string) => void;
  narrow?: boolean;
}) {
  return (
    <div className={narrow ? 'w-24' : ''}>
      <div className="signage mb-1 text-center text-[9px] text-concrete-400">{title}</div>
      <div className="flex flex-col gap-1">
        {units.map((u) => (
          <button
            key={u.id}
            onClick={() => onSelect(u.id)}
            className={`rounded border px-2 py-2 text-left text-[11px] transition ${
              STATE_CLASS[u.state]
            } ${selected === u.id ? 'ring-1 ring-signal' : ''}`}
          >
            <div className="truncate font-bold">
              <Icon name={UNIT_ICON[u.type]} /> {u.label}
            </div>
            {u.service ? (
              <div className="truncate text-[10px] opacity-70"><Icon name={SERVICE_ICON[u.service]} /> {SERVICE_LABEL[u.service]}</div>
            ) : u.type !== 'stairwell' && u.state !== 'cleared' ? (
              <div className="truncate text-[10px] opacity-70">
                {ENTRY_META[u.entry].label}
                {ENTRY_META[u.entry].heat > 0 && <span className="text-hiss"> ▲</span>}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The block drawn as a cutaway: every storey it has, and the runs of stairs
 * beside them. Most floors are shut, and no single stairwell reaches all of the
 * ones that aren't — so the route matters as much as the rooms.
 */
function BlockSection({
  hdb,
  reachable,
  onMove,
  onForce,
}: {
  hdb: HdbDungeon;
  reachable: number[];
  onMove: (level: number) => void;
  onForce: (level: number) => void;
}) {
  const levels = Array.from({ length: hdb.height }, (_, i) => hdb.height - i); // top down
  const forceable = forceableLevels(hdb);
  const hereRisers = new Set(risersAt(hdb, hdb.currentLevel).map((r) => r.id));
  for (const b of hdb.skybridges) {
    if (b.level === hdb.currentLevel) for (const id of b.risers) hereRisers.add(id);
  }
  // Geometry: slabs stack at a fixed pitch and the shafts are drawn over them,
  // so a stairwell reads as one continuous column cutting through the building.
  const ROW = 22;
  const GAP = 3;
  const PITCH = ROW + GAP;
  const topOf = (level: number) => (hdb.height - level) * PITCH;
  const n = hdb.risers.length;
  // Shafts live in the right-hand part of each slab; text keeps the left.
  const shaftX = (i: number) => 52 + ((i + 0.5) / n) * 44;

  return (
    <>
      <div className="signage mb-1.5 flex items-baseline justify-between text-[9px] text-concrete-400">
        <span>Block section</span>
        <span>
          {hdb.height} storeys · {n} stairs
        </span>
      </div>

      <div className="relative" style={{ height: hdb.height * PITCH - GAP }}>
        {/* ---- the slabs ---- */}
        {levels.map((level) => {
          const f = hdb.floors[level - 1];
          const here = level === hdb.currentLevel;
          const canGo = reachable.includes(level);
          const canForce = forceable.includes(level);
          const visited = hdb.visited.includes(level);
          const seal = f.sealed;
          const label = String(level).padStart(2, '0');

          const cls = here
            ? 'border-signal bg-signal/25 text-signal'
            : canGo
              ? 'border-concrete-500 bg-concrete-800 text-concrete-100 hover:bg-white/10'
              : canForce
                ? 'border-hiss/60 bg-hiss/10 text-hiss hover:bg-hiss/20'
                : 'border-concrete-800 bg-concrete-900/40 text-concrete-400/45';

          return (
            <button
              key={level}
              disabled={!canGo && !here && !canForce}
              onClick={() => (canGo ? onMove(level) : canForce ? onForce(level) : undefined)}
              title={
                seal
                  ? `${SEAL_META[seal.kind].label} — ${SEAL_META[seal.kind].blurb}${
                      canForce ? ` Forcing it costs ${seal.minutes} min and +${seal.heat} heat.` : ''
                    }`
                  : here
                    ? 'You are here'
                    : canGo
                      ? `Level ${label} — walk here`
                      : `Level ${label} — no stairs you can reach serve it`
              }
              className={`absolute inset-x-0 flex items-center gap-1.5 overflow-hidden rounded-[2px] border px-1.5 text-[10px] transition ${cls}`}
              style={{ top: topOf(level), height: ROW }}
            >
              <span className="w-4 shrink-0 text-left font-bold tabular-nums">{label}</span>
              {seal ? (
                // Hatching reads as "filled in" without needing to be legible.
                <span
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(135deg, transparent 0 4px, rgba(255,255,255,0.16) 4px 5px)',
                  }}
                />
              ) : null}
              <span className="relative z-10 truncate">
                {seal ? (
                  <>
                    {SEAL_META[seal.kind].label}
                    {canForce && <span className="font-bold"> · force</span>}
                  </>
                ) : (
                  <span className="flex items-center gap-1">
                    {here && <span className="font-bold">you are here</span>}
                    {f.isSkybridge && <Icon name="hdb.skybridge" title="Skybridge" />}
                    {f.heatLevel >= 1 && (
                      <span className="text-hiss" title="You made noise on this floor">
                        ▲
                      </span>
                    )}
                    {visited && !here && <span className="text-concrete-400/70">worked</span>}
                  </span>
                )}
              </span>
            </button>
          );
        })}

        {/* ---- the shafts, laid over the slabs they cut through ---- */}
        <div className="pointer-events-none absolute inset-0">
          {hdb.risers.map((r, i) => {
            const live = hereRisers.has(r.id);
            const x = shaftX(i);
            return (
              <div key={r.id}>
                {/* One segment per storey: solid where there's a landing you
                    can use, faint where the stairs only pass through. */}
                {Array.from({ length: r.top - r.bottom + 1 }, (_, k) => {
                  const level = r.bottom + k;
                  const lands = hdb.floors[level - 1]?.sealed === null;
                  return (
                    <div
                      key={level}
                      className={`absolute border-x ${
                        live
                          ? lands
                            ? 'border-signal bg-signal/35'
                            : 'border-signal/40 bg-signal/10'
                          : lands
                            ? 'border-concrete-400 bg-concrete-500/40'
                            : 'border-concrete-600/50 bg-concrete-700/20'
                      }`}
                      style={{
                        top: topOf(level),
                        height: level === r.bottom ? ROW : PITCH,
                        left: `${x}%`,
                        width: 14,
                        transform: 'translateX(-50%)',
                      }}
                    />
                  );
                })}
                {/* Cap the run top and bottom so it reads as a shaft, not a bar. */}
                <div
                  className={`absolute border-t-2 ${live ? 'border-signal' : 'border-concrete-400'}`}
                  style={{ top: topOf(r.top), left: `${x}%`, width: 14, transform: 'translateX(-50%)' }}
                />
                <div
                  className={`absolute border-b-2 ${live ? 'border-signal' : 'border-concrete-400'}`}
                  style={{
                    top: topOf(r.bottom) + ROW,
                    left: `${x}%`,
                    width: 14,
                    transform: 'translateX(-50%)',
                  }}
                />
                <span
                  className={`absolute text-[8px] font-bold ${live ? 'text-signal' : 'text-concrete-400'}`}
                  style={{
                    top: topOf(r.top) - 9,
                    left: `${x}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  {r.id}
                </span>
              </div>
            );
          })}

          {/* ---- skybridges: the only way to change shafts ---- */}
          {hdb.skybridges.map((b) => {
            const idx = b.risers.map((id) => hdb.risers.findIndex((r) => r.id === id));
            const [a, z] = idx.sort((m, o) => m - o);
            return (
              <div
                key={`${b.level}-${b.risers.join('')}`}
                className="absolute border-t-2 border-dashed border-astral"
                style={{
                  top: topOf(b.level) + ROW / 2,
                  left: `${shaftX(a)}%`,
                  width: `${shaftX(z) - shaftX(a)}%`,
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-2.5 space-y-1 text-[9px] leading-snug text-concrete-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-2 border-x border-signal bg-signal/35" />
          stairs you're in
          <span className="ml-1 inline-block h-3 w-2 border-x border-concrete-400 bg-concrete-500/40" />
          stairs elsewhere
        </div>
        <div>
          Solid where the landing opens · faint where the stairs only pass through ·{' '}
          <span className="text-astral">- -</span> skybridge
        </div>
      </div>
    </>
  );
}

/** Fill colour per band — the bar should read at a glance, before the words do. */
const BAND_FILL = ['bg-concrete-400', 'bg-signal', 'bg-signal', 'bg-hiss', 'bg-hiss'];

/**
 * Block heat, as one long charge bar. Nothing but your own noise moves it, so
 * the gauge states what charged it, what it costs you now, and where the next
 * threshold sits — six anonymous pips said none of that.
 */
function HeatGauge({
  heat,
  band,
  dc,
  hunting,
}: {
  heat: number;
  band: (typeof HEAT_BANDS)[number];
  dc: number;
  hunting: boolean;
}) {
  const pct = Math.min(100, (heat / HEAT_MAX) * 100);
  const idx = HEAT_BANDS.indexOf(band);
  const next = HEAT_BANDS[idx + 1];

  return (
    <div className="shrink-0 border-b border-concrete-600 bg-concrete-900/60 px-4 py-2">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="signage text-[9px] text-concrete-400">
          Block heat ·{' '}
          <span className={hunting ? 'text-hiss' : idx >= 3 ? 'text-hiss' : idx >= 1 ? 'text-signal' : 'text-concrete-200'}>
            {band.label}
          </span>{' '}
          <span className="tabular-nums text-concrete-400">
            {heat}/{HEAT_MAX}
          </span>
        </span>
        <span className="text-[10px] tabular-nums text-concrete-400">
          {band.dcStep > 0 ? `descent DC ${dc}` : 'descent free'}
        </span>
      </div>

      {/* the bar, with a tick at every band threshold above Quiet */}
      <div className="relative h-2 w-full overflow-hidden rounded-sm bg-concrete-800">
        <div
          className={`h-full transition-all duration-300 ${BAND_FILL[idx]} ${
            hunting ? 'pulse-danger' : ''
          }`}
          style={{ width: `${pct}%` }}
        />
        {HEAT_BANDS.slice(1).map((b) => (
          <span
            key={b.at}
            className="absolute top-0 h-full w-px bg-concrete-950/70"
            style={{ left: `${(b.at / HEAT_MAX) * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-1 text-[10px] leading-snug">
        {hunting ? (
          <span className="text-hiss">
            HUNTING — {Math.round(HUNT_ELITE_CHANCE * 100)}% chance something finds you on every
            door and every staircase. Get out.
          </span>
        ) : (
          <span className="text-concrete-400">
            {band.note}
            {next && (
              <span className="text-concrete-400/70">
                {' '}
                · {next.at - heat} more noise to {next.label}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
