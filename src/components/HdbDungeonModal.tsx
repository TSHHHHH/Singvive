import { useState } from 'react';
import { Icon } from '../icons/Icon';
import { ATTRIBUTE_ICONS } from '../game/character';
import { useGame } from '../game/store';
import type { GuideTopic } from '../content/guideContent';
import { PlayerPin } from './PlayerPin';
import { GuideInfoButton } from './GuideInfoButton';
import { HdbContextPanel } from './HdbContextPanel';
import { useIsPhoneLayout } from './useIsPhoneLayout';
import { HdbLevelStrips, HeatMeter } from './HdbLevelStrips';
import { bandText, unitFaceClass } from './hdbStripStyle';
import {
  COOL_PER_HOUR,
  currentFloor,
  GROUND_LABEL,
  HEAT_BANDS,
  HEAT_MAX,
  HUNT_ELITE_CHANCE,
  landingCount,
  levelBand,
  levelHeat,
  levelHunting,
  peakHeat,
  realStoreysOf,
  retreatDc,
  revealedLandings,
  senseChance,
  storeyLabel,
  UNIT_META,
  type HeatBand,
} from '../game/hdbDungeon';
import type { AttributeKey } from '../game/types';
import { msgOr, useT } from '../i18n';
import { tip } from './tips';

/**
 * Inside an HDB block: the landing strips (one per storey row, each with its
 * own heat and rooms) under a status dock for the landing you stand on.
 * Desktop 3D draws it over the map beside the block; phone and 2D full-view.
 */
export function HdbDungeonModal({
  onOpenGuide,
  inset,
  overMap = false,
}: {
  onOpenGuide?: (topic: GuideTopic) => void;
  /**
   * Desktop: px kept clear on each side for the floating HUD (dock and phone,
   * timeline, the here card), so the strips are drawn in the space they leave.
   */
  inset?: { top: number; right: number; bottom: number; left: number };
  /** Drawn over the live 3D map: no backdrop of its own outside the panel. */
  overMap?: boolean;
} = {}) {
  const { locale, t } = useT();
  const hdb = useGame((s) => s.hdb);
  const character = useGame((s) => s.character);
  const hdbLeave = useGame((s) => s.hdbLeave);
  const pendingSearch = useGame((s) => s.pendingSearch);
  const isPhone = useIsPhoneLayout();

  if (!hdb || !character) return null;

  const floor = currentFloor(hdb);
  const level = hdb.currentLevel;
  const heat = levelHeat(hdb, level);
  const canLeave = level === 1 && !pendingSearch;
  const leaveTitle = pendingSearch
    ? t('ui.hdb.leaveNeedSearch')
    : level !== 1
      ? t('ui.hdb.leaveNeedVoidDeck')
      : undefined;
  const placeMeta = `${
    hdb.archetype === 'shelter' ? t('ui.hdb.shelter') : t('ui.hdb.residential')
  } · ${floor.layoutType === 'slab' ? t('ui.hdb.slab') : t('ui.hdb.point')} · ${msgOr(
    `ui.hdb.ground.${hdb.groundKind}`,
    GROUND_LABEL[hdb.groundKind],
    undefined,
    locale,
  )} · ${t('ui.hdb.storeysLandings', { n: realStoreysOf(hdb), m: landingCount(hdb) })}`;

  return (
    <div
      // Over the map, this box's bare padding is the view of the tower beside
      // the strips: drag there to orbit the block (BlockView in GameMap).
      data-block-orbit={overMap ? '' : undefined}
      className={`box-border flex h-full w-full flex-col ${
        overMap ? 'cursor-grab active:cursor-grabbing' : 'bg-concrete-950'
      }`}
      style={
        !isPhone && inset
          ? {
              paddingTop: inset.top,
              paddingRight: inset.right,
              paddingBottom: inset.bottom,
              paddingLeft: inset.left,
            }
          : undefined
      }
    >
      <div className={`flex min-h-0 flex-1 flex-col ${overMap ? 'cursor-auto' : ''}`}>
        <div
            className={`max-h-[45%] shrink-0 overflow-y-auto ${
            overMap
              ? 'rounded-sm border border-concrete-600 bg-concrete-950/95 shadow-[0_8px_32px_rgba(0,0,0,0.6)]'
              : ''
          }`}
        >
          <HdbStatusDock
            name={hdb.name}
            placeMeta={placeMeta}
            levelLabel={storeyLabel(hdb, level)}
            heat={heat}
            peak={peakHeat(hdb)}
            band={levelBand(hdb, level)}
            dc={retreatDc(hdb, level)}
            hunting={levelHunting(hdb, level)}
            revealed={revealedLandings(hdb)}
            height={landingCount(hdb)}
            storeys={realStoreysOf(hdb)}
            canLeave={canLeave}
            leaveTitle={leaveTitle}
            onLeave={hdbLeave}
            onOpenGuide={onOpenGuide}
            senses={[
              {
                key: 'perception',
                value: character.attributes.perception,
                gives: t('ui.hdb.senseEncounterPct'),
              },
              {
                key: 'dexterity',
                value: character.attributes.dexterity,
                gives: t('ui.hdb.senseContainerType'),
              },
            ]}
          />
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${
              overMap ? 'mt-2 pl-1.5' : 'p-1.5 sm:p-2'
          }`}
        >
          <HdbLevelStrips phone={isPhone} />
        </div>

        {isPhone && (
          <div className="flex max-h-[min(46%,22rem)] min-h-0 shrink-0 flex-col border-t border-concrete-600 bg-concrete-900/80 pt-1.5">
            <HdbContextPanel variant="full" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Identity + this landing's heat + leave in one dock; legend / senses behind expand. */
function HdbStatusDock({
  name,
  placeMeta,
  levelLabel,
  heat,
  peak,
  band,
  dc,
  hunting,
  revealed,
  height,
  storeys,
  canLeave,
  leaveTitle,
  onLeave,
  onOpenGuide,
  senses,
}: {
  name: string;
  placeMeta: string;
  levelLabel: string;
  heat: number;
  peak: number;
  band: HeatBand;
  dc: number;
  hunting: boolean;
  revealed: number;
  height: number;
  storeys: number;
  canLeave: boolean;
  leaveTitle?: string;
  onLeave: () => void;
  onOpenGuide?: (topic: GuideTopic) => void;
  senses: { key: AttributeKey; value: number; gives: string }[];
}) {
  const { locale, t } = useT();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const idx = HEAT_BANDS.indexOf(band);
  const next = HEAT_BANDS[idx + 1];
  const bandLabel = msgOr(`ui.hdb.heatBand.${band.label}.label`, band.label, undefined, locale);
  const bandNote = msgOr(`ui.hdb.heatBand.${band.label}.note`, band.note, undefined, locale);
  const nextBit =
    !hunting && next
      ? t('ui.hdb.nextBand', {
          label: msgOr(`ui.hdb.heatBand.${next.label}.label`, next.label, undefined, locale),
          at: next.at,
        })
      : '';
  const peakShown = Math.round(peak) > Math.round(heat);

  return (
    <div className="shrink-0 px-3 py-3 lg:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-1.5">
          <span className="truncate text-plate uppercase text-signal lg:text-title" {...tip(placeMeta)}>
            {name}
          </span>
          <span
            className="shrink-0 text-body tabular-nums text-concrete-200"
            {...tip(t('ui.hdb.landingsRevealed', { revealed, height, storeys }))}
          >
            {revealed}/{height}
          </span>
          {onOpenGuide && (
            <GuideInfoButton topic="hdb" onOpen={onOpenGuide} label={t('ui.hdb.guide')} />
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-label={detailsOpen ? t('ui.hdb.ariaHideDetails') : t('ui.hdb.ariaShowDetails')}
            {...tip(detailsOpen ? t('ui.hdb.hideDetails') : t('ui.hdb.showDetails'))}
            onClick={() => setDetailsOpen((o) => !o)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-concrete-600 text-concrete-200 transition-colors hover:bg-white/5"
          >
            <svg
              viewBox="0 0 12 12"
              width={12}
              height={12}
              aria-hidden
              className={`transition-transform duration-150 ${detailsOpen ? 'rotate-180' : ''}`}
            >
              <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
            </svg>
          </button>
          <button
            type="button"
            onClick={onLeave}
            disabled={!canLeave}
            {...tip(leaveTitle)}
            className="h-10 shrink-0 rounded border border-concrete-600 px-3 text-read text-concrete-50 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            {t('ui.hdb.leave')}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((o) => !o)}
        className="mt-2 flex w-full flex-col gap-1 text-left"
        {...tip(t('ui.hdb.tapDetails'))}
      >
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-plate uppercase text-concrete-400">
            {t('ui.hdb.levelHeat', { nn: levelLabel })}
          </span>
          <span className={`text-plate uppercase ${bandText(idx, hunting)}`}>{bandLabel}</span>
          <span className="text-body tabular-nums text-concrete-200">
            {Math.round(heat)}/{HEAT_MAX}
          </span>
          {peakShown && (
            <span className="text-micro tabular-nums text-concrete-400">
              {t('ui.hdb.blockPeak', { n: Math.round(peak) })}
            </span>
          )}
        </span>
        <span className="relative block">
          <HeatMeter heat={heat} />
          {peakShown && (
            <span
              className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-hiss/80"
              style={{ left: `${Math.min(100, (peak / HEAT_MAX) * 100)}%` }}
            />
          )}
        </span>
        <span className="text-body text-concrete-200 lg:text-read">
          {bandNote} {t('ui.hdb.descentNeedsAttrs', { dc })}
          {nextBit && <span className="text-concrete-400">{nextBit}</span>}
        </span>
        {hunting && (
          <span className="text-body text-hiss">
            {t('ui.hdb.huntChance', { n: Math.round(HUNT_ELITE_CHANCE * 100) })}
          </span>
        )}
      </button>

      {detailsOpen && (
        <div className="mt-2 space-y-2 border-t border-concrete-800 pt-2">
          <p className="text-micro text-concrete-400">
            {t('ui.hdb.coolingNote', { n: COOL_PER_HOUR })}
          </p>
          <HdbSymbolKey />
          <div className="flex flex-wrap gap-1.5 text-micro" {...tip(t('ui.hdb.senseCorridor'))}>
            {senses.map((s) => (
              <span
                key={s.key}
                className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 ${
                  senseChance(s.value) >= 0.6
                    ? 'border-concrete-600 text-concrete-200'
                    : 'border-concrete-800 text-concrete-400'
                }`}
              >
                <Icon name={ATTRIBUTE_ICONS[s.key]} size={11} title={t(`ui.attributes.${s.key}`)} />
                <span className="truncate">
                  {t('ui.hdb.senseArrow', {
                    value: s.value,
                    gives: s.gives,
                    pct: Math.round(senseChance(s.value) * 100),
                  })}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HdbSymbolKey() {
  const { locale, t } = useT();
  const roomTypes = (Object.keys(UNIT_META) as (keyof typeof UNIT_META)[]).map((id) => {
    const m = UNIT_META[id];
    const label = msgOr(`ui.hdb.unit.${id}.label`, m.label, undefined, locale);
    const blurb = msgOr(`ui.hdb.unit.${id}.blurb`, m.blurb, undefined, locale);
    return (
      <span key={id} className="inline-flex items-center gap-1" {...tip(blurb)}>
        <Icon name={m.icon} size={11} className={unitFaceClass(id)} />
        {label.toLowerCase()}
      </span>
    );
  });

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro leading-none text-concrete-400">
      <span className="inline-flex items-center gap-1.5">
        <PlayerPin size="xs" />
        {t('ui.hdb.legendYou')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <HeatMeter heat={55} className="w-6" />
        {t('ui.hdb.legendHeat')}
      </span>
      {roomTypes}
      <span className="inline-flex items-center gap-1">
        <Icon name="hdb.unavailable" size={11} className="text-concrete-400" />
        {t('ui.hdb.legendBoarded')}
      </span>
      <span className="inline-flex items-center gap-1 text-concrete-400">{t('ui.hdb.legendDim')}</span>
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-astral" /> {t('ui.hdb.legendScouted')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icon name="hdb.sealedCollapsed" size={12} className="text-concrete-400" />
        {t('ui.hdb.legendHatch')}
      </span>
    </div>
  );
}
