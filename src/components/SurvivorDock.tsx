import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { countBleeding, meterModifiers, totalHp, totalMaxHp } from '../game/survival';
import type { LoadEffects } from '../game/inventory';
import type { GuideTopic } from '../content/guideContent';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';
import { ConditionPanel } from './ConditionPanel';
import { InventoryPanel } from './Inventory/InventoryPanel';
import { loadTierLabel, loadTierShown } from './loadTier';
import { isModalOpen } from './modalStack';
import { tip } from './tips';
import { VitalMeter } from './VitalMeter';

/** Desktop dock. Body and pack stay together; the phone retains its tabs. */
export function SurvivorDock({
  sidePanel, onPanelChange, onOpenGuide, load, tools, blocked, hotkeys,
}: {
  sidePanel: string | null;
  onPanelChange: (panel: 'inventory' | 'craft' | null) => void;
  onOpenGuide: (topic: GuideTopic) => void;
  load: LoadEffects | null;
  tools: ReactNode;
  blocked: boolean;
  hotkeys: { inventory: string; craft: string };
}) {
  const { locale, t } = useT();
  const { meters, bodyParts } = useGame(
    useShallow((s) => ({ meters: s.meters, bodyParts: s.bodyParts })),
  );
  const [bodyOpen, setBodyOpen] = useState(true);
  const [packOpen, setPackOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (!moreOpen || sidePanel || blocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isModalOpen()) return;
      e.preventDefault();
      setMoreOpen(false);
      moreButton.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen, sidePanel, blocked]);

  const trayClass = (active: boolean) =>
    `flex min-h-10 min-w-0 items-center justify-center gap-2 rounded border px-2 py-1.5 text-label focus-visible:outline focus-visible:outline-signal ${
      active ? 'border-signal/60 bg-signal/10 text-signal' : 'border-white/10 text-white/65 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <div className="space-y-2" data-survivor-dock>
      <section aria-label={t('ui.dock.vitals')} className="sticky top-0 z-20 rounded-lg border border-white/15 bg-concrete-900 p-2.5 shadow-sm">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <VitalMeter label={t('ui.condition.health')} icon="meter.health" value={totalHp(bodyParts)} max={totalMaxHp(bodyParts)} />
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
      <nav aria-label={t('ui.dock.tools')} className="grid grid-cols-3 gap-1">
        <button type="button" onClick={() => onPanelChange(sidePanel === 'inventory' ? null : 'inventory')} aria-expanded={sidePanel === 'inventory'} aria-keyshortcuts={hotkeys.inventory} className={trayClass(sidePanel === 'inventory')} {...tip(t('ui.hud.hotkey', { label: t('ui.phone.stash'), key: hotkeys.inventory }))}>
          <Icon name="action.stash" size={18} /><span>{t('ui.phone.stash')}</span>
        </button>
        <button type="button" onClick={() => onPanelChange(sidePanel === 'craft' ? null : 'craft')} aria-expanded={sidePanel === 'craft'} aria-keyshortcuts={hotkeys.craft} className={trayClass(sidePanel === 'craft')} {...tip(t('ui.hud.hotkey', { label: t('ui.phone.craft'), key: hotkeys.craft }))}>
          <Icon name="action.craft" size={18} /><span>{t('ui.phone.craft')}</span>
        </button>
        <button ref={moreButton} type="button" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} aria-controls="survivor-dock-more" className={trayClass(moreOpen)}>
          <span aria-hidden>•••</span><span>{t('ui.dock.more')}</span>
        </button>
      </nav>
      {moreOpen && <div id="survivor-dock-more">{tools}</div>}
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
