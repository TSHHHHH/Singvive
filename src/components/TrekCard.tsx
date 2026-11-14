import { formatDuration } from '../game/travel';
import { riskLabel, type TrekRisk } from '../game/wilds';
import { HazardOnRoute } from './HazardOnRoute';
import { Ledger, LedgerRow, LedgerRule, Note, PlaceHead, PlaceStack } from './placeCard';
import { BTN } from './placeCardStyle';
import { useT } from '../i18n';

interface Props {
  distanceM: number;
  travelMin: number;
  /** Priced against the hazards the survivor has actually sensed. */
  risk: TrekRisk;
  /** True when nothing on the route has been sensed — the estimate is a guess. */
  blind: boolean;
  /** After dark with little light — pockets past the light are not shown. */
  dark?: boolean;
  energyLow: boolean;
  outOfRange: boolean;
  tooClose: boolean;
  /** Straight chord crosses water/restricted with no land detour under budget. */
  noDryRoute?: boolean;
  arrivalAtNight: boolean;
  /** Route cuts through baked forest / nature reserve. */
  vegetationSlowed?: boolean;
  /** Extra stamina burned for vegetation (on top of open-ground exposure). */
  vegetationEnergy?: number;
  onTrek: () => void;
}

/**
 * The card for crossing open ground. Same anatomy as a LocationCard target —
 * head, ledger, notes, one button — but there's nothing there. It sells the
 * one thing the player is buying: a way out of wherever they're standing, at a
 * price.
 *
 * Sized for TargetDock (~328–368px). Cancel lives on the dock chrome, not here.
 */
export function TrekCard({
  distanceM,
  travelMin,
  risk,
  blind,
  dark = false,
  energyLow,
  outOfRange,
  tooClose,
  noDryRoute = false,
  arrivalAtNight,
  vegetationSlowed = false,
  vegetationEnergy = 0,
  onTrek,
}: Props) {
  const { t } = useT();
  const label = riskLabel(risk.fightChance);
  const blocked = energyLow || outOfRange || tooClose || noDryRoute;
  const energyHit = risk.energyCost + vegetationEnergy;

  return (
    <PlaceStack>
      <PlaceHead icon="action.travel" title={t('ui.trek.title')} meta={t('ui.trek.blurb')} />

      <Ledger>
        <LedgerRow icon="action.travel" label={t('ui.trek.cross')}>
          {distanceM} m · {formatDuration(travelMin)}
          {vegetationSlowed && <span className="text-concrete-400">{t('ui.trek.forest')}</span>}
        </LedgerRow>
        <LedgerRow icon="meter.energy" label={t('ui.trek.exposure')}>
          {t('ui.trek.energyHit', { n: energyHit })}
        </LedgerRow>
        <LedgerRule />
        <LedgerRow icon="combat.encounter" label={t('ui.trek.route')}>
          <span style={{ color: label.color }}>{label.text}</span>
        </LedgerRow>
      </Ledger>

      {(risk.hazards.length > 0 || blind || dark || arrivalAtNight || outOfRange || noDryRoute) && (
        <div className="flex flex-col gap-1">
          <HazardOnRoute hazards={risk.hazards} />
          {blind && <Note>{t('ui.trek.blind')}</Note>}
          {dark && <Note tone="warn" icon="time.night">{t('ui.trek.dark')}</Note>}
          {arrivalAtNight && <Note tone="warn" icon="time.night">{t('ui.trek.night')}</Note>}
          {outOfRange && <Note tone="warn" icon="status.blocked">{t('ui.trek.outOfRange')}</Note>}
          {noDryRoute && <Note tone="warn" icon="status.blocked">{t('ui.trek.noDry')}</Note>}
        </div>
      )}

      <button disabled={blocked} onClick={onTrek} className={BTN.primary}>
        {energyLow
          ? t('ui.trek.tooExhausted')
          : noDryRoute
            ? t('ui.trek.noDryRoute')
            : tooClose
              ? t('ui.trek.tooClose')
              : outOfRange
                ? t('ui.trek.tooFar')
                : t('ui.trek.crossCta', { dur: formatDuration(travelMin) })}
      </button>
    </PlaceStack>
  );
}
