import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { countBleeding, meterModifiers, totalHp, totalMaxHp } from '../game/survival';
import type { LoadEffects } from '../game/inventory';
import type { GuideTopic } from '../content/guideContent';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { ConditionPanel } from './ConditionPanel';
import { InventoryPanel } from './Inventory/InventoryPanel';
import { dynamicMeterColor } from './MeterBar';
import { loadTierLabel, loadTierShown } from './loadTier';
import { isModalOpen } from './modalStack';
import { tip } from './tips';

type Section = 'condition' | 'backpack' | 'more';

/** Desktop disclosure only. The phone keeps its full Status tab. */
export function SurvivorDock({
  sidePanel,
  onPanelChange,
  onOpenGuide,
  load,
  tools,
  blocked,
  hotkeys,
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
  const [section, setSection] = useState<Section | null>(null);
  const triggers = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({});
  // Stash must expose both grids for drag-and-drop, including when opened by
  // hotkey or a loot action. Other slide-outs take precedence over rail detail.
  const visible = sidePanel === 'inventory' ? 'backpack' : sidePanel ? null : section;
  const major = countBleeding(bodyParts, 'major');
  const minor = countBleeding(bodyParts, 'minor');
  const injured = Object.values(bodyParts).some((p) => p.hp < p.maxHp || p.fractured || p.crippled);
  const needsCare = major > 0 || minor > 0 || injured || meters.infection > 0;
  const heavy = load != null && loadTierShown(load);
  const careLabel = major
    ? t('ui.condition.bleedingOut')
    : minor
      ? t('ui.condition.bleeding')
      : injured ? t('ui.dock.injured') : '';
  const infectionLabel = meters.infection > 0
    ? `${t('ui.condition.infection')} ${Math.round(meters.infection)}%`
    : '';
  const conditionSummary = [careLabel, infectionLabel].filter(Boolean).join(' · ');

  const toggle = (next: Section) => {
    setSection(visible === next ? null : next);
    onPanelChange(null);
  };
  const close = () => {
    if (visible) triggers.current[visible]?.focus();
    setSection(null);
    onPanelChange(null);
  };

  useEffect(() => {
    // GameScreen owns Escape while a slide-out or modal is open.
    if (!section || sidePanel || blocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isModalOpen()) return;
      e.preventDefault();
      triggers.current[section]?.focus();
      setSection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [section, sidePanel, blocked]);

  const sectionLabel = (id: Section) => t(
    id === 'condition' ? 'ui.condition.title' : id === 'backpack' ? 'ui.inventory.backpack' : 'ui.dock.more',
  );
  const trayClass = (active: boolean) =>
    `relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded border px-1 py-2 text-label transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${
      active ? 'border-signal/60 bg-signal/10 text-signal' : 'border-transparent text-white/65 hover:bg-white/5 hover:text-white'
    }`;
  const sectionButton = (id: Section, icon: IconName | null, alert = false) => (
    <button
      key={id}
      ref={(el) => { triggers.current[id] = el; }}
      type="button"
      onClick={() => toggle(id)}
      aria-expanded={visible === id}
      aria-controls="survivor-dock-details"
      className={trayClass(visible === id)}
    >
      {icon ? <Icon name={icon} size={18} /> : <span aria-hidden className="text-read leading-none">•••</span>}
      <span>{id === 'condition' ? t('ui.dock.body') : sectionLabel(id)}</span>
      {alert && <span aria-hidden className="absolute right-2 top-1 text-label text-hiss">!</span>}
    </button>
  );

  return (
    <div className="space-y-2.5">
      <section aria-label={t('ui.dock.vitals')} className="rounded-lg border border-white/15 bg-black/15 p-2.5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DockMeter label={t('ui.condition.health')} icon="meter.health" value={totalHp(bodyParts)} max={totalMaxHp(bodyParts)} />
          <DockMeter label={t('ui.condition.energy')} icon="meter.energy" value={meters.energy} hint={meterModifiers('energy', meters, locale).map((m) => m.text).join('\n')} />
          <DockMeter label={t('ui.dock.food')} icon="meter.hunger" value={meters.hunger} hint={meterModifiers('hunger', meters, locale).map((m) => m.text).join('\n')} />
          <DockMeter label={t('ui.dock.water')} icon="meter.thirst" value={meters.thirst} hint={meterModifiers('thirst', meters, locale).map((m) => m.text).join('\n')} />
        </div>
        {(needsCare || heavy) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/10 pt-2" aria-live="polite">
            {needsCare && (
              <button type="button" onClick={() => { setSection('condition'); onPanelChange(null); }} className="rounded border border-hiss/40 px-2 py-1 text-label text-hiss hover:bg-hiss/10">
                <Icon name={major || minor ? 'status.bleeding' : 'action.status'} />{' '}
                {conditionSummary}
              </button>
            )}
            {heavy && (
              <button type="button" onClick={() => { setSection('backpack'); onPanelChange(null); }} className="rounded border border-hiss/40 px-2 py-1 text-label text-hiss hover:bg-hiss/10">
                <Icon name="meta.weight" /> {loadTierLabel(load, t)}
              </button>
            )}
          </div>
        )}
      </section>

      <nav aria-label={t('ui.dock.tools')} className="grid grid-cols-5 gap-0.5 rounded-lg border border-white/15 bg-black/20 p-1">
        {sectionButton('condition', 'action.status', needsCare)}
        {sectionButton('backpack', 'action.inventory', heavy)}
        <button type="button" onClick={() => { setSection(null); onPanelChange(sidePanel === 'inventory' ? null : 'inventory'); }} aria-expanded={sidePanel === 'inventory'} aria-keyshortcuts={hotkeys.inventory} className={trayClass(sidePanel === 'inventory')} {...tip(t('ui.hud.hotkey', { label: t('ui.phone.stash'), key: hotkeys.inventory }))}>
          <Icon name="action.stash" size={18} />
          <span>{t('ui.phone.stash')}</span>
        </button>
        <button type="button" onClick={() => { setSection(null); onPanelChange(sidePanel === 'craft' ? null : 'craft'); }} aria-expanded={sidePanel === 'craft'} aria-keyshortcuts={hotkeys.craft} className={trayClass(sidePanel === 'craft')} {...tip(t('ui.hud.hotkey', { label: t('ui.phone.craft'), key: hotkeys.craft }))}>
          <Icon name="action.craft" size={18} />
          <span>{t('ui.phone.craft')}</span>
        </button>
        {sectionButton('more', null)}
      </nav>
      <div id="survivor-dock-details" hidden={!visible}>
        {visible && (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-label uppercase text-white/50">{sectionLabel(visible)}</span>
              <button type="button" onClick={close} className="rounded px-2 py-1 text-label text-white/60 hover:bg-white/5 hover:text-white">
                {t('ui.hud.collapse')} <span aria-hidden>⌃</span>
              </button>
            </div>
            {visible === 'condition' && <ConditionPanel onOpenGuide={onOpenGuide} showSurvivorStats={false} showMeters={false} />}
            {visible === 'backpack' && <InventoryPanel layout="backpack" />}
            {visible === 'more' && tools}
          </>
        )}
      </div>
    </div>
  );
}

function DockMeter({ label, icon, value, max = 100, hint }: {
  label: string;
  icon: IconName;
  value: number;
  max?: number;
  hint?: string;
}) {
  const pct = Math.max(0, Math.min(100, value / Math.max(1, max) * 100));
  return (
    <div {...tip(hint)}>
      <div className="mb-1 flex items-center justify-between gap-2 text-body">
        <span className="flex items-center gap-1.5 text-white/65"><Icon name={icon} size={13} />{label}</span>
        <span className={pct < 35 ? 'tabular-nums text-hiss' : 'tabular-nums text-concrete-50'}>{Math.round(value)}<span className="text-micro text-white/40">/{Math.round(max)}</span></span>
      </div>
      <div role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="h-1 overflow-hidden bg-white/10">
        <div className="h-full" style={{ width: `${pct}%`, background: dynamicMeterColor(pct) }} />
      </div>
    </div>
  );
}
