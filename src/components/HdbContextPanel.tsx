import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { sumTraitMod } from '../game/character';
import { useGame } from '../game/store';
import {
  breachOutcome,
  currentFloor,
  ENTRY_META,
  encounterChanceKnown,
  encounterChanceReadout,
  FOB_MINUTES,
  hasFob,
  heatBandAfter,
  isVoidDeckFloor,
  levelHeat,
  LOCKPICK_ID,
  PICK_MINUTES,
  ROOF_FOB,
  ROOF_HATCH_HEAT,
  ROOF_HATCH_MINUTES,
  roofHatchLevel,
  scaleDoorCost,
  SERVICE_ICON,
  SERVICE_LABEL,
  SHELTER_HEAT_DROP,
  SHELTER_HOURS,
  storeyLabel,
  THEME_META,
  UNIT_META,
  type HdbDungeon,
} from '../game/hdbDungeon';
import { msgOr, useT, type LocaleId, type TVars } from '../i18n';
import { useIsPhoneLayout } from './useIsPhoneLayout';
import { tip } from './tips';
import { Chip, Ledger, LedgerRow, Note, PlaceHead, PlaceStack } from './placeCard';
import { BTN } from './placeCardStyle';

const CONTAINER_ICON: Record<string, IconName> = {
  Medical: 'meter.infection',
  Food: 'meter.hunger',
  Tool: 'action.craft',
  Valuables: 'stat.value',
  Fob: 'item.lockpick',
};

/** Storey tooltip for the landing you stand on, with its theme if it has one. */
function landingTip(
  hdb: HdbDungeon,
  t: (key: string, vars?: TVars) => string,
  locale: LocaleId,
): string {
  const base = t('ui.hdb.storey', { nn: storeyLabel(hdb, hdb.currentLevel) });
  const theme = currentFloor(hdb).theme;
  if (!theme || theme === 'ordinary') return base;
  const label = msgOr(`ui.hdb.theme.${theme}.label`, THEME_META[theme].label, undefined, locale);
  const blurb = msgOr(`ui.hdb.theme.${theme}.blurb`, THEME_META[theme].blurb, undefined, locale);
  return `${base} · ${label}: ${blurb}`;
}

/**
 * The HDB action card: the room picked on your landing strip (scout tiles plus
 * Force / Pick / search / rest / read / service), else a landing summary and,
 * below the roof, the hatch. `full` for the desktop here card and the phone
 * strips dock; `compact` for the phone timeline foot. Leave lives on the status
 * dock in {@link HdbDungeonModal}; compact keeps one for when the Log tab hides it.
 */
export function HdbContextPanel({
  variant = 'full',
}: {
  variant?: 'full' | 'compact';
}) {
  const { locale, t } = useT();
  const hdb = useGame((s) => s.hdb);
  const character = useGame((s) => s.character);
  const items = useGame((s) => s.items);
  const pendingSearch = useGame((s) => s.pendingSearch);
  const selUnit = useGame((s) => s.hdbSelUnit);
  const hdbBreach = useGame((s) => s.hdbBreach);
  const hdbPick = useGame((s) => s.hdbPick);
  const hdbUseService = useGame((s) => s.hdbUseService);
  const hdbUseShelter = useGame((s) => s.hdbUseShelter);
  const hdbReadNotice = useGame((s) => s.hdbReadNotice);
  const hdbOpenRoof = useGame((s) => s.hdbOpenRoof);
  const hdbLeave = useGame((s) => s.hdbLeave);
  const isPhone = useIsPhoneLayout();

  if (!hdb || !character) return null;

  const floor = currentFloor(hdb);
  const sel = (selUnit && floor.units.find((u) => u.id === selUnit && u.available)) || null;
  const doorStatus = sel
    ? sel.state === 'cleared'
      ? t('ui.hdb.doorCleared')
      : msgOr(`ui.hdb.entry.${sel.entry}.label`, ENTRY_META[sel.entry].label, undefined, locale)
    : null;

  if (variant === 'compact') {
    const canLeave = hdb.currentLevel === 1 && !pendingSearch;
    const leaveTitle = pendingSearch
      ? t('ui.hdb.leaveNeedSearch')
      : hdb.currentLevel !== 1
          ? t('ui.hdb.leaveNeedVoidDeck')
          : undefined;
    return (
      <div className="space-y-2 text-body">
        <p className="text-concrete-200">{t('ui.hdb.compactHint')}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => hdbLeave()}
            disabled={!canLeave}
            {...tip(leaveTitle)}
            className={`${BTN.secondary} w-auto`}
          >
            {t('ui.hdb.leaveBlock')}
          </button>
        </div>
      </div>
    );
  }

  const selVerb = sel ? UNIT_META[sel.type].verb : null;
  const showEncounter =
    selVerb === 'search' || selVerb === 'hazard' || selVerb === 'burn';
  const encounter =
    sel && showEncounter
      ? encounterChanceReadout(
          breachOutcome(hdb, sel, hdb.currentLevel).encounterChance,
          encounterChanceKnown(sel),
        )
      : null;

  const forceOpts = {
    heatMult: sumTraitMod(character.traitIds, 'hdbDoorHeatMult'),
    minutesMult: sumTraitMod(character.traitIds, 'hdbBreachMinutesMult'),
    crowbar: items.some((i) => i.container === 'backpack' && i.defId === 'crowbar'),
  };
  const lockpickCount = items
    .filter((i) => i.container === 'backpack' && i.defId === LOCKPICK_ID)
    .reduce((n, i) => n + i.stack, 0);

  const heatWarn = (add: number) => {
    const band = heatBandAfter(levelHeat(hdb, hdb.currentLevel), add);
    if (!band) return '';
    const note = msgOr(`ui.hdb.heatBand.${band.label}.note`, band.note, undefined, locale);
    return t('ui.hdb.heatCross', { note });
  };

  const busy = !!pendingSearch;
  const hatchHere = !hdb.roofOpen && roofHatchLevel(hdb) === hdb.currentLevel;
  const hatchCost = scaleDoorCost(ROOF_HATCH_MINUTES, ROOF_HATCH_HEAT, forceOpts);
  const hatchActions = hatchHere ? (
    <div className="flex flex-col gap-2">
      <Note>{t('ui.hdb.hatchBlurb')}</Note>
      {hasFob(hdb, ROOF_FOB) && (
        <button
          type="button"
          onClick={() => hdbOpenRoof('fob')}
          disabled={busy}
          className={BTN.secondary}
        >
          <Icon name="item.lockpick" /> {t('ui.hdb.hatchFob', { min: FOB_MINUTES })}
        </button>
      )}
      <button
        type="button"
        onClick={() => hdbOpenRoof('force')}
        disabled={busy}
        className={BTN.danger}
      >
        <Icon name="hdb.breach" />{' '}
        {t('ui.hdb.hatchForce', {
          min: Math.round(hatchCost.minutes),
          heat: hatchCost.heat,
        })}
        {heatWarn(hatchCost.heat)}
      </button>
    </div>
  ) : null;

  const levelNn = storeyLabel(hdb, hdb.currentLevel);
  const placeTitle = sel
    ? sel.label
    : isVoidDeckFloor(floor) && floor.units.length === 0
      ? t('ui.hdb.voidDeck')
      : t('ui.hdb.level', { nn: levelNn });

  const unitLabel = sel
    ? msgOr(`ui.hdb.unit.${sel.type}.label`, UNIT_META[sel.type].label, undefined, locale)
    : '';
  const unitBlurb = sel
    ? msgOr(`ui.hdb.unit.${sel.type}.blurb`, UNIT_META[sel.type].blurb, undefined, locale)
    : '';
  const containerCat = sel?.scoutedInfo?.containerCategory;
  const containerLabel = containerCat
    ? msgOr(`ui.hdb.container.${containerCat}`, containerCat, undefined, locale)
    : null;

  const roomsLeft = floor.units.filter((u) => u.available && u.state !== 'cleared').length;

  const head = (
    <PlaceHead
      icon={sel ? UNIT_META[sel.type].icon : floor.units.length ? 'hdb.unit' : 'hdb.stairwell'}
      title={<span className="tabular-nums">{placeTitle}</span>}
      meta={
        sel ? (
          <span {...tip(unitBlurb)}>{unitLabel}</span>
        ) : floor.units.length > 0 ? (
          <span className="tabular-nums">{t('ui.hdb.roomsLeft', { n: roomsLeft })}</span>
        ) : undefined
      }
      aside={doorStatus ? <Chip>{doorStatus}</Chip> : undefined}
    />
  );

  const scoutLedger = sel ? (
    <Ledger>
      {selVerb === 'fight' && (
        <LedgerRow
          icon="combat.encounter"
          label={t('ui.hdb.scoutEncounter')}
          tip={sel.type === 'den' ? t('ui.hdb.scoutDenFight') : t('ui.hdb.scoutNestFight')}
        >
          <span className="text-hiss">{t('ui.hdb.scoutFight')}</span>
        </LedgerRow>
      )}
      {encounter && (
        <LedgerRow
          icon="combat.encounter"
          label={t('ui.hdb.scoutEncounter')}
          tip={
            encounter.exact
              ? t('ui.hdb.scoutEncounterExact')
              : t('ui.hdb.scoutEncounterEstimate')
          }
        >
          <span className={encounter.pct >= 50 ? 'text-hiss' : 'text-signal'}>
            {encounter.label}
          </span>
        </LedgerRow>
      )}
      <LedgerRow
        icon="action.inventory"
        label={t('ui.hdb.scoutContainers')}
        tip={
          containerLabel
            ? `${containerLabel} · ${sel.scoutedInfo?.lootQuality}`
            : t('ui.hdb.scoutContainersUnread')
        }
      >
        {containerCat && containerLabel ? (
          <span className="inline-flex items-center gap-1.5 text-astral">
            <Icon name={CONTAINER_ICON[containerCat] ?? 'action.inventory'} />
            {containerLabel}
          </span>
        ) : (
          <span className="text-concrete-400">?</span>
        )}
      </LedgerRow>
    </Ledger>
  ) : null;

  const entryVerb = sel
    ? msgOr(`ui.hdb.entry.${sel.entry}.verb`, ENTRY_META[sel.entry].verb, undefined, locale)
    : '';
  const outcome = sel ? breachOutcome(hdb, sel, hdb.currentLevel) : null;
  const smash = sel ? sel.entry === 'locked' || sel.entry === 'barricaded' : false;
  const scaledDoor =
    sel && outcome && smash
      ? scaleDoorCost(outcome.minutes, outcome.heat, forceOpts)
      : outcome
        ? { minutes: outcome.minutes, heat: selVerb === 'fight' ? 0 : outcome.heat }
        : null;
  const doorMins = scaledDoor ? Math.round(scaledDoor.minutes) : 0;
  const doorHeat = scaledDoor
    ? selVerb === 'fight'
      ? 0
      : scaledDoor.heat
    : 0;
  const heatBit =
    doorHeat > 0 ? t('ui.hdb.heatPlus', { n: doorHeat }) : t('ui.hdb.quiet');
  const doorWarn = doorHeat > 0 ? heatWarn(doorHeat) : '';

  const doorButtons = sel ? (
    sel.state === 'cleared' ? (
      <Note>{t('ui.hdb.unitClearedBlurb')}</Note>
    ) : selVerb === 'service' && sel.service ? (
      <button
        type="button"
        onClick={() => hdbUseService(sel.id)}
        disabled={busy}
        className={BTN.primary}
      >
        <Icon name={SERVICE_ICON[sel.service]} />{' '}
        {msgOr(`ui.hdb.service.${sel.service}`, SERVICE_LABEL[sel.service], undefined, locale)}
      </button>
    ) : selVerb === 'intel' ? (
      <button
        type="button"
        onClick={() => hdbReadNotice(sel.id)}
        disabled={busy}
        className={BTN.primary}
      >
        <Icon name="hdb.notice" /> {t('ui.hdb.readNotice', { min: 15 })}
      </button>
    ) : selVerb === 'rest' && sel.state === 'breached' ? (
      <button
        type="button"
        onClick={() => hdbUseShelter(sel.id)}
        disabled={busy}
        className={BTN.primary}
      >
        <Icon name="hdb.shelter" />{' '}
        {t('ui.hdb.restShelter', { h: SHELTER_HOURS, heat: SHELTER_HEAT_DROP })}
      </button>
    ) : (
      <div className="flex flex-col gap-2">
        {sel.state !== 'breached' && (
          <button
            type="button"
            onClick={() => hdbBreach(sel.id)}
            disabled={busy}
            className={BTN.primary}
          >
            <Icon name={doorHeat > 0 ? 'hdb.breach' : 'hdb.unit'} />{' '}
            {t('ui.hdb.breachLine', {
              verb: entryVerb,
              min: doorMins,
              heat: heatBit,
            })}
            {doorWarn}
          </button>
        )}
        {sel.entry === 'locked' && sel.state !== 'breached' && (
          <button
            type="button"
            onClick={() => hdbPick(sel.id)}
            disabled={busy || lockpickCount < 1}
            className={BTN.secondary}
          >
            <Icon name="item.lockpick" />{' '}
            {lockpickCount < 1
              ? t('ui.hdb.pickNeed')
              : t('ui.hdb.pickLine', { min: PICK_MINUTES })}
          </button>
        )}
      </div>
    )
  ) : null;

  // Heat lives on the status dock and the strip; the card only adds what is left to open.
  const levelHint = (
    <div {...tip(landingTip(hdb, t, locale))}>
      <Note>
        {floor.units.length === 0
          ? isVoidDeckFloor(floor)
            ? t('ui.hdb.voidHint')
            : t('ui.hdb.noDoorsHint')
          : isPhone
            ? t('ui.hdb.levelHintPhone')
            : t('ui.hdb.levelHint')}
      </Note>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <div className="px-3 pb-2 pt-1 lg:px-0 lg:pt-0">
        <PlaceStack>
          {head}
          {sel ? (
            <>
              {scoutLedger}
              {doorButtons}
            </>
          ) : (
            <>
              {levelHint}
              {hatchActions}
            </>
          )}
        </PlaceStack>
      </div>
    </div>
  );
}
