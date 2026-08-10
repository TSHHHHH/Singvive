import { useState } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { useGame } from '../game/store';
import {
  currentFloor,
  floorThreat,
  MAX_LEVEL,
  reachableLevels,
  senseChance,
  SERVICE_LABEL,
  SERVICE_ICON,
  SKYBRIDGE_LEVELS,
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
  const hdbLeave = useGame((s) => s.hdbLeave);
  const [selected, setSelected] = useState<string | null>(null);

  if (!hdb || !character) return null;

  const floor = currentFloor(hdb);
  const threat = floorThreat(hdb, hdb.currentLevel);
  const reachable = reachableLevels(hdb);
  const heat = Math.floor(hdb.blockHeat);
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
          <div className="flex items-center gap-3">
            <HeatGauge heat={heat} />
            <button
              onClick={hdbLeave}
              className="rounded border border-concrete-600 px-3 py-1.5 text-xs hover:bg-white/5"
            >
              ✕ Leave block
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* ================= LEFT: elevator tower ================= */}
          <div className="w-28 shrink-0 overflow-y-auto border-r border-concrete-600 bg-concrete-950/60 p-2 md:w-36">
            <div className="signage mb-2 text-center text-[9px] text-concrete-400">Levels</div>
            <div className="flex flex-col-reverse gap-1">
              {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((level) => {
                const here = level === hdb.currentLevel;
                const canGo = reachable.includes(level);
                const f = hdb.floors[level - 1];
                const visited = hdb.visited.includes(level);
                return (
                  <button
                    key={level}
                    disabled={!canGo && !here}
                    onClick={() => hdbMove(level)}
                    className={`flex items-center justify-between rounded border px-2 py-1 text-[11px] transition ${
                      here
                        ? 'border-signal bg-signal/20 text-signal'
                        : canGo
                          ? 'border-concrete-600 hover:bg-white/5'
                          : 'border-concrete-800 text-concrete-400/40'
                    }`}
                  >
                    <span className="font-bold tabular-nums">
                      {String(level).padStart(2, '0')}
                    </span>
                    <span className="flex items-center gap-0.5">
                      {SKYBRIDGE_LEVELS.includes(level) && <Icon name="hdb.skybridge" title="Skybridge" />}
                      {f.heatLevel >= 1 && <span className="text-hiss">▲</span>}
                      {visited && !here && <span className="text-concrete-400">·</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ================= RIGHT: corridor map ================= */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="signage text-xs text-concrete-50">
                Level {String(hdb.currentLevel).padStart(2, '0')}
              </h3>
              <span className="text-[11px] text-concrete-400">
                Floor threat{' '}
                <span className={threat >= 5 ? 'text-hiss' : 'text-signal'}>{threat}</span>
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
                  senses. Pick a door; forcing it costs 15 minutes and wakes the block.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      <Icon name={UNIT_ICON[sel.type]} /> {sel.label}
                    </span>
                    <span className="text-[11px] uppercase tracking-widest text-concrete-400">
                      {sel.state}
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
                    ) : (
                      <button
                        onClick={() => hdbBreach(sel.id)}
                        disabled={sel.state === 'cleared'}
                        className="rounded bg-signal/80 px-3 py-1.5 text-xs font-bold text-black hover:bg-signal disabled:opacity-30"
                      >
                        <Icon name="hdb.breach" /> Force it · 15 min
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
            {u.service && (
              <div className="truncate text-[10px] opacity-70"><Icon name={SERVICE_ICON[u.service]} /> {SERVICE_LABEL[u.service]}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Block heat — the one number that decides how bad going back down will be. */
function HeatGauge({ heat }: { heat: number }) {
  const pips = Math.min(6, heat);
  return (
    <div className="text-right">
      <div className="signage text-[9px] text-concrete-400">Block heat</div>
      <div className="flex justify-end gap-0.5">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2 ${i < pips ? 'bg-hiss' : 'bg-concrete-600'} ${
              i < pips && heat >= 4 ? 'pulse-danger' : ''
            }`}
          />
        ))}
      </div>
    </div>
  );
}
