import { useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { countBleeding, meterModifiers, totalHp, totalMaxHp } from '../game/survival';
import { effectiveMaxHp } from '../game/injuryEffects';
import type { LoadEffects } from '../game/inventory';
import type { GuideTopic } from '../content/guideContent';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';
import { ConditionPanel } from './ConditionPanel';
import { InventoryPanel } from './Inventory/InventoryPanel';
import { loadTierLabel, loadTierShown } from './loadTier';
import { VitalMeter } from './VitalMeter';
import { useHeldWhileRolling } from '../ui/diceGate';

/** Desktop dock. Body and pack stay together; the phone retains its tabs. */
export function SurvivorDock({
  sidePanel, onOpenGuide, load, menu,
}: {
  sidePanel: string | null;
  onOpenGuide: (topic: GuideTopic) => void;
  load: LoadEffects | null;
  /** The one-row icon menu (panels, timeline, day logs, settings). */
  menu: ReactNode;
}) {
  const { locale, t } = useT();
  const live = useGame(
    useShallow((s) => ({ meters: s.meters, bodyParts: s.bodyParts })),
  );
  // A check's wounds and costs show once its die has landed.
  const { meters, bodyParts } = useHeldWhileRolling(live);
  const [bodyOpen, setBodyOpen] = useState(true);
  const [packOpen, setPackOpen] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const [previousPanel, setPreviousPanel] = useState(sidePanel);
  if (previousPanel !== sidePanel) {
    setPreviousPanel(sidePanel);
    if (sidePanel === 'inventory') setPackOpen(true);
  }
  const major = countBleeding(bodyParts, 'major');
  const minor = countBleeding(bodyParts, 'minor');
  const injured = Object.values(bodyParts).some((p) => p.hp < p.maxHp || p.fractured || p.crippled);
  const needsCare = major > 0 || minor > 0 || injured || meters.infection > 0;
  const heavy = load != null && loadTierShown(load);
  const careLabel = major ? t('ui.condition.bleedingOut') : minor
    ? t('ui.condition.bleeding') : injured ? t('ui.dock.injured') : '';
  const infectionLabel = meters.infection > 0
    ? `${t('ui.condition.infection')} ${Math.round(meters.infection)}%` : '';

  return (
    <div className="space-y-2" data-survivor-dock>
      <section aria-label={t('ui.dock.vitals')} className="sticky top-0 z-20 rounded-lg border border-white/15 bg-concrete-900 p-2.5 shadow-sm">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <VitalMeter label={t('ui.condition.health')} icon="meter.health" value={totalHp(bodyParts)} max={totalMaxHp(bodyParts)}
            locked={totalMaxHp(bodyParts) - effectiveMaxHp(bodyParts)}
            hint={totalMaxHp(bodyParts) > effectiveMaxHp(bodyParts) ? t('ui.condition.woundsHoldMax', { n: totalMaxHp(bodyParts) - effectiveMaxHp(bodyParts) }) : undefined} />
          <VitalMeter label={t('ui.condition.energy')} icon="meter.energy" value={meters.energy} hint={meterModifiers('energy', meters, locale).map((m) => m.text).join('\n')} />
          <VitalMeter label={t('ui.dock.food')} icon="meter.hunger" value={meters.hunger} hint={meterModifiers('hunger', meters, locale).map((m) => m.text).join('\n')} />
          <VitalMeter label={t('ui.dock.water')} icon="meter.thirst" value={meters.thirst} hint={meterModifiers('thirst', meters, locale).map((m) => m.text).join('\n')} />
        </div>
        {(needsCare || (heavy && !packOpen)) && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2" aria-live="polite">
            {needsCare && <button type="button" onClick={() => {
              setBodyOpen(true);
              bodyRef.current?.scrollIntoView({ block: 'nearest' });
            }} className="min-h-8 rounded border border-hiss/40 px-2 py-1 text-label text-hiss hover:bg-hiss/10">
              <Icon name={major || minor ? 'status.bleeding' : 'action.status'} />{' '}
              {[careLabel, infectionLabel].filter(Boolean).join(' · ')}
            </button>}
            {heavy && !packOpen && <button type="button" onClick={() => {
              setPackOpen(true);
              packRef.current?.scrollIntoView({ block: 'nearest' });
            }} className="min-h-8 rounded border border-hiss/40 px-2 py-1 text-label text-hiss hover:bg-hiss/10">
              <Icon name="meta.weight" /> {loadTierLabel(load, t)}
            </button>}
          </div>
        )}
      </section>
      {menu}
      <div ref={bodyRef} id="survivor-dock-body" className="scroll-mt-36">
        <ConditionPanel onOpenGuide={onOpenGuide} showSurvivorStats={false} showMeters={false}
          compact collapsed={!bodyOpen}
          onToggle={() => setBodyOpen(!bodyOpen)} />
      </div>
      <div ref={packRef} id="survivor-dock-pack" className="scroll-mt-36 rounded-lg border border-white/15 bg-black/15 p-2.5">
        <InventoryPanel layout="backpack" collapsed={!packOpen}
          onToggle={() => setPackOpen(!packOpen)} />
      </div>
    </div>
  );
}
