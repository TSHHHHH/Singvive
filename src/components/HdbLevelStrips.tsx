import { useEffect, useState } from 'react';
import { Icon } from '../icons/Icon';
import { sumTraitMod } from '../game/character';
import { loadEffectsFor } from '../game/inventory';
import { torsoCarryMult } from '../game/survival';
import { useGame } from '../game/store';
import {
  canTravelTo,
  HEAT_BANDS,
  HEAT_MAX,
  HUNT_ELITE_CHANCE,
  isLevelRevealed,
  isRoofFloor,
  levelBand,
  levelHeat,
  levelHunting,
  retreatDc,
  retreatFailChance,
  rowStoreys,
  SEAL_META,
  storeyLabel,
  THEME_META,
  travelClearChance,
  travelPlan,
  UNIT_META,
  type HdbDungeon,
  type HdbUnitNode,
} from '../game/hdbDungeon';
import type { Attributes } from '../game/types';
import { msgOr, useT, type LocaleId, type TVars } from '../i18n';
import { PlayerPin } from './PlayerPin';
import { tip } from './tips';
import { BAND_FILL, bandText, SEAL_ICON, unitFaceClass } from './hdbStripStyle';

type T = (key: string, vars?: TVars) => string;

/** What a stair trip to `level` costs and risks, for the strip's tooltip. */
function travelTip(
  hdb: HdbDungeon,
  level: number,
  attrs: Attributes,
  stairMult: number,
  dcMod: number,
  t: T,
): string {
  const plan = travelPlan(hdb, hdb.pos.level, level, stairMult);
  const nn = storeyLabel(hdb, level);
  const lines = [t('ui.hdb.stripTravel', { nn, min: Math.max(1, Math.round(plan.minutes)) })];
  const down = plan.crossings.some((c) => c.descent);
  if (!down) lines.push(t('ui.hdb.travelUpFree'));
  for (const c of plan.crossings) {
    const at = storeyLabel(hdb, c.level);
    if (c.hunt) {
      lines.push(t('ui.hdb.travelHunt', { nn: at, pct: Math.round(HUNT_ELITE_CHANCE * 100) }));
    }
    // Only the landings that can actually stop you; a safe roll is noise.
    const pct = c.descent ? Math.round(retreatFailChance(attrs, hdb, c.level, dcMod) * 100) : 0;
    if (pct > 0) {
      lines.push(t('ui.hdb.travelCheck', { nn: at, pct, dc: retreatDc(hdb, c.level) + dcMod }));
    }
  }
  if (plan.crossings.some((c) => c.descent || c.hunt)) {
    lines.push(
      t('ui.hdb.travelClear', {
        pct: Math.round(travelClearChance(attrs, hdb, plan, dcMod) * 100),
      }),
    );
  }
  return lines.join('\n');
}

function themeChip(hdb: HdbDungeon, level: number, locale: LocaleId) {
  const theme = hdb.floors[level - 1]?.theme;
  if (!theme || theme === 'ordinary') return null;
  return {
    label: msgOr(`ui.hdb.theme.${theme}.label`, THEME_META[theme].label, undefined, locale),
    blurb: msgOr(`ui.hdb.theme.${theme}.blurb`, THEME_META[theme].blurb, undefined, locale),
  };
}

/** A level's heat as a short bar with band ticks. */
export function HeatMeter({
  heat,
  className = '',
}: {
  heat: number;
  className?: string;
}) {
  const band = HEAT_BANDS.reduce((acc, b) => (heat >= b.at ? b : acc), HEAT_BANDS[0]);
  const idx = HEAT_BANDS.indexOf(band);
  const hunting = heat >= HEAT_MAX;
  return (
    <span
      className={`relative block h-1.5 overflow-hidden rounded-sm bg-concrete-800 ${className}`}
    >
      <span
        className={`block h-full w-full origin-left transition-transform duration-300 ${BAND_FILL[idx]} ${
          hunting ? 'pulse-danger' : ''
        }`}
        style={{ transform: `scaleX(${Math.min(1, heat / HEAT_MAX)})` }}
      />
      {HEAT_BANDS.slice(1).map((b) => (
        <span
          key={b.at}
          className="absolute top-0 h-full w-px bg-concrete-950/70"
          style={{ left: `${(b.at / HEAT_MAX) * 100}%` }}
        />
      ))}
    </span>
  );
}

function RoomTile({
  unit,
  selected,
  selectable,
  phone,
  onPick,
}: {
  unit: HdbUnitNode;
  selected: boolean;
  selectable: boolean;
  phone: boolean;
  onPick: () => void;
}) {
  const { locale, t } = useT();
  const meta = UNIT_META[unit.type];
  const typeLabel = msgOr(`ui.hdb.unit.${unit.type}.label`, meta.label, undefined, locale);
  const state = !unit.available
    ? t('ui.hdb.doorBoardedShut')
    : unit.state === 'cleared'
      ? t('ui.hdb.doorCleared')
      : typeLabel;
  const read = unit.scoutedInfo?.containerCategory
    ? ` · ${msgOr(
        `ui.hdb.container.${unit.scoutedInfo.containerCategory}`,
        unit.scoutedInfo.containerCategory,
        undefined,
        locale,
      )}`
    : '';
  const panel = !unit.available
    ? 'border-concrete-800 bg-concrete-900 text-concrete-600'
    : unit.state === 'cleared'
      ? 'border-concrete-800 bg-transparent text-concrete-600'
      : unit.state === 'breached'
        ? 'border-concrete-200 bg-concrete-800'
        : 'border-concrete-600 bg-concrete-800';
  const size = phone ? 'h-14 w-12' : 'h-12 w-11';
  const face = !unit.available ? (
    <Icon name="hdb.unavailable" size={14} />
  ) : unit.state === 'cleared' ? (
    <Icon name="choice.check" size={14} />
  ) : (
    <Icon name={meta.icon} size={phone ? 18 : 16} className={unitFaceClass(unit.type)} />
  );
  const scouted = unit.available && unit.state !== 'cleared' && !!unit.scoutedInfo?.containerCategory;
  const body = (
    <>
      {face}
      {scouted && (
        <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-astral" />
      )}
      <span className="w-full truncate px-0.5 text-center text-micro leading-none tabular-nums text-concrete-400">
        {unit.label.replace(/^#/, '')}
      </span>
    </>
  );
  const cls = `relative flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-sm border ${size} ${panel} ${
    selected ? 'ring-2 ring-signal ring-offset-1 ring-offset-concrete-950' : ''
  }`;
  if (!selectable || !unit.available) {
    return (
      <span className={cls} {...tip(`${unit.label} · ${state}${read}`)}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      aria-pressed={selected}
      {...tip(`${unit.label} · ${state}${read}`)}
      className={`${cls} transition-colors hover:border-concrete-50`}
    >
      {body}
    </button>
  );
}

/**
 * The block as a stack of landing strips, top storey first. Each open landing
 * shows its own heat and its rooms; a click on the strip takes the stairs
 * there, a click on a room on your own landing picks it for the action card.
 * Hovering a strip lights that storey on the 3D block.
 */
export function HdbLevelStrips({ phone }: { phone: boolean }) {
  const { locale, t } = useT();
  const hdb = useGame((s) => s.hdb);
  const character = useGame((s) => s.character);
  const items = useGame((s) => s.items);
  const equipment = useGame((s) => s.equipment);
  const bodyParts = useGame((s) => s.bodyParts);
  const selUnit = useGame((s) => s.hdbSelUnit);
  const setSelUnit = useGame((s) => s.setHdbSelUnit);
  const hdbTravel = useGame((s) => s.hdbTravel);
  const busy = useGame((s) => !!s.pendingSearch || !!s.combat || !!s.pendingEvent);
  const setHdbHoverLevel = useGame((s) => s.setHdbHoverLevel);
  const [hoverRow, setHoverRow] = useState<number | null>(null);

  useEffect(() => {
    setHdbHoverLevel(hoverRow);
  }, [hoverRow, setHdbHoverLevel]);
  useEffect(() => () => setHdbHoverLevel(null), [setHdbHoverLevel]);

  if (!hdb || !character) return null;

  const load = loadEffectsFor(
    items,
    character.attributes,
    equipment,
    sumTraitMod(character.traitIds, 'carryCapacityMod'),
    torsoCarryMult(bodyParts),
  );
  const levels = Array.from({ length: hdb.height }, (_, i) => hdb.height - i);

  return (
    <div
      className={
        phone
          ? 'flex flex-col gap-1'
          : 'flex h-full min-h-0 flex-col justify-center gap-1'
      }
      onMouseLeave={() => setHoverRow(null)}
    >
      {levels.map((level) => {
        const f = hdb.floors[level - 1];
        const label = storeyLabel(hdb, level);
        const seal = f.sealed;

        if (seal) {
          const span = f.span ? rowStoreys(f) : 1;
          const sealLabel = msgOr(
            `ui.hdb.sealKind.${seal.kind}.label`,
            SEAL_META[seal.kind].label,
            undefined,
            locale,
          );
          return (
            <div
              key={level}
              {...tip(
                span > 1
                  ? t('ui.hdb.spanSealed', { nn: label, n: span, label: sealLabel })
                  : t('ui.hdb.inaccessible', { label: sealLabel }),
              )}
              className={`flex shrink-0 items-center gap-2 rounded-sm border border-dashed border-concrete-800 bg-concrete-950/80 px-2 text-micro uppercase text-concrete-400 ${
                phone ? 'h-6' : 'h-5'
              }`}
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, transparent 0 4px, rgba(255,255,255,0.03) 4px 5px)',
              }}
            >
              <Icon name={SEAL_ICON[seal.kind]} size={11} />
              <span className="truncate">
                {span > 1 ? t('ui.hdb.spanChip', { n: span, label: sealLabel }) : sealLabel}
              </span>
            </div>
          );
        }

        const here = level === hdb.pos.level;
        const roof = isRoofFloor(f);
        const revealed = isLevelRevealed(hdb, level);
        const heat = levelHeat(hdb, level);
        const band = levelBand(hdb, level);
        const idx = HEAT_BANDS.indexOf(band);
        const hunting = levelHunting(hdb, level);
        const bandLabel = msgOr(`ui.hdb.heatBand.${band.label}.label`, band.label, undefined, locale);
        const theme = revealed ? themeChip(hdb, level, locale) : null;
        const roofShut = roof && !hdb.roofOpen;
        const canGo = !busy && canTravelTo(hdb, level);
        const hovered = hoverRow === level;
        const units = f.units;
        const left = units.filter((u) => u.available && u.state !== 'cleared').length;

        const title = here
          ? t('ui.hdb.youAreHere')
          : roofShut
            ? t('ui.hdb.roofShutTip')
            : canGo
              ? travelTip(hdb, level, character.attributes, load.stairMult, load.fleeDcMod, t)
              : undefined;

        return (
          <div
            key={level}
            role={canGo ? 'button' : undefined}
            tabIndex={canGo ? 0 : undefined}
            onClick={canGo ? () => hdbTravel(level) : undefined}
            onKeyDown={
              canGo
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      hdbTravel(level);
                    }
                  }
                : undefined
            }
            onMouseEnter={() => setHoverRow(level)}
            onFocus={() => setHoverRow(level)}
            {...tip(title, { follow: true })}
            className={`relative flex shrink-0 items-center gap-2 rounded-sm border px-2 transition-colors ${
              phone ? 'min-h-[3.25rem] py-1.5' : 'min-h-[2.75rem] flex-1 py-1'
            } ${
              here
                ? 'border-signal/70 bg-concrete-800'
                : revealed
                  ? 'border-concrete-600 bg-concrete-900'
                  : 'border-concrete-800 bg-concrete-950'
            } ${canGo ? 'cursor-pointer hover:border-concrete-400' : ''} ${
              hovered && !here ? 'border-concrete-400' : ''
            }`}
          >
            {/* Pointer notch toward the tower (desktop over-map). */}
            {!phone && (
              <span
                aria-hidden
                className={`absolute -left-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l transition-colors ${
                  here
                    ? 'border-signal/70 bg-concrete-800'
                    : `${hovered ? 'border-concrete-400' : revealed ? 'border-concrete-600' : 'border-concrete-800'} ${
                        revealed ? 'bg-concrete-900' : 'bg-concrete-950'
                      }`
                }`}
              />
            )}

            <div className="flex w-10 shrink-0 flex-col items-center gap-1">
              <span
                className={`min-w-8 rounded-sm border px-1 text-center text-plate tabular-nums ${
                  here
                    ? 'border-signal/70 text-signal'
                    : revealed
                      ? 'border-concrete-600 text-concrete-50'
                      : 'border-concrete-800 text-concrete-400'
                }`}
              >
                {roof ? t('ui.hdb.roofShort') : label}
              </span>
              {here && <PlayerPin size="xs" />}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="flex w-20 shrink-0 items-center gap-1 text-micro uppercase leading-none"
                  {...tip(t('ui.hdb.levelHeatTip', { heat: Math.round(heat), band: bandLabel }))}
                >
                  {Math.round(heat) > 0 && (
                    <>
                      <span className={`truncate ${bandText(idx, hunting)}`}>{bandLabel}</span>
                      <span className="tabular-nums text-concrete-400">{Math.round(heat)}</span>
                    </>
                  )}
                </span>
                <HeatMeter heat={heat} className="min-w-8 flex-1" />
                {theme && (
                  <span
                    className="shrink-0 rounded-sm border border-concrete-600 px-1 py-0.5 text-micro uppercase leading-none text-concrete-200"
                    {...tip(`${theme.label}: ${theme.blurb}`)}
                  >
                    {theme.label}
                  </span>
                )}
                {roofShut && (
                  <span className="shrink-0 rounded-sm border border-concrete-600 px-1 py-0.5 text-micro uppercase leading-none text-concrete-400">
                    {t('ui.hdb.roofShut')}
                  </span>
                )}
                {!revealed ? (
                  <span className="shrink-0 text-micro uppercase text-concrete-600">{t('ui.hdb.unexplored')}</span>
                ) : units.length === 0 ? (
                  roof || roofShut ? null : (
                    <span className="shrink-0 text-micro uppercase text-concrete-600">{t('ui.hdb.noDoors')}</span>
                  )
                ) : (
                  <span
                    className="shrink-0 text-micro tabular-nums text-concrete-400"
                    {...tip(t('ui.hdb.roomsLeft', { n: left }))}
                  >
                    {left}/{units.length}
                  </span>
                )}
              </div>
              {revealed && units.length > 0 && (
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {units.map((u) => (
                    <RoomTile
                      key={u.id}
                      unit={u}
                      phone={phone}
                      selected={here && selUnit === u.id}
                      selectable={here && !busy}
                      onPick={() => setSelUnit(selUnit === u.id ? null : u.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
