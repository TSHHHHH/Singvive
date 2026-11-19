import type { TravelEnergyQuote } from '../game/travelEnergy';
import { useT } from '../i18n';
import { LedgerRow, Note } from './placeCard';

/** Walking cost is guaranteed at departure; encounters are a separate risk. */
export function TravelEnergyRow({ quote }: { quote?: TravelEnergyQuote }) {
  const { t } = useT();
  if (!quote) return null;
  // Round costs up and remaining energy down so the display never promises
  // an unaffordable move. The simulation still charges the exact fraction.
  const cost = (Math.ceil(Math.max(0, quote.energyCost - 1e-9) * 10) / 10).toFixed(1);
  const left = (Math.floor((quote.remainingEnergy + 1e-9) * 10) / 10).toFixed(1);
  return (
    <>
      <LedgerRow icon="meter.energy" label={t('ui.trek.walkingEnergy')}>
        {t('ui.trek.energyHit', { n: cost })}
        {quote.affordable && <> · {t('ui.trek.energyLeft', { n: left })}</>}
      </LedgerRow>
      {quote.arrivesExhausted && <Note tone="warn">{t('ui.trek.arriveExhausted')}</Note>}
      <Note>{t('ui.trek.encounterEnergy')}</Note>
    </>
  );
}
