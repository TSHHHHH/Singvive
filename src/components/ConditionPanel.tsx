import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { useHeldWhileRolling } from '../ui/diceGate';
import { DockSectionHeader } from './DockSectionHeader';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { MeterBar } from './MeterBar';
import { BodyDoll } from './BodyDoll';
import { LimbDetailPanel } from './LimbDetailPanel';
import { WoundCarePanel, type CareFeedback } from './WoundCarePanel';
import { AttributeRow } from './AttributeRow';
import { SurvivorStatsGrid } from './SurvivorStatsGrid';
import { GuideInfoButton } from './GuideInfoButton';
import { countBleeding, meterModifiers, totalHp, totalMaxHp } from '../game/survival';
import { effectiveMaxHp } from '../game/injuryEffects';
import type { GuideTopic } from '../content/guideContent';
import type { BodyPartId, BodyParts } from '../game/types';
import { useT } from '../i18n';

/**
 * Condition at a glance: body doll + all-limb overview up top, survival meters
 * and attributes in the middle, live derived stats along the bottom.
 */
export function ConditionPanel({
  dollHeight = 120,
  onOpenGuide,
  showSurvivorStats = true,
  showMeters = true,
  showAttributes = true,
  compact = false,
  collapsed = false,
  onToggle,
}: {
  dollHeight?: number;
  onOpenGuide?: (topic: GuideTopic) => void;
  /** Desktop moves live combat stats into the Stats tab. */
  showSurvivorStats?: boolean;
  /** Desktop keeps labelled vitals visible above the disclosure tray. */
  showMeters?: boolean;
  /** Desktop shows the five attributes under the sticky vitals instead. */
  showAttributes?: boolean;
  compact?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const { locale, t } = useT();
  const contentId = useId();
  const { meters, bodyParts, lastCare } = useGame(
    useShallow((s) => ({ meters: s.meters, bodyParts: s.bodyParts, lastCare: s.lastCare })),
  );
  const [hovered, setHovered] = useState<BodyPartId | null>(null);
  const [feedback, setFeedback] = useState<CareFeedback | null>(null);
  const seenCare = useRef(lastCare?.sequence ?? 0);
  useEffect(() => {
    if (!lastCare || lastCare.sequence === seenCare.current) return;
    seenCare.current = lastCare.sequence;
    setFeedback(lastCare);
    const timer = window.setTimeout(() => setFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [lastCare]);
  // The header pill follows the dock vitals: a check's wounds show once its die lands.
  const shown = useHeldWhileRolling({ bodyParts, infection: meters.infection });
  const hp = totalHp(bodyParts);
  const hpMax = totalMaxHp(bodyParts);
  const careBadge = <CareBadge bodyParts={shown.bodyParts} infection={shown.infection} />;

  return (
    <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-2.5">
      {onToggle ? (
        <DockSectionHeader title={t('ui.dock.body')} open={!collapsed} onToggle={onToggle} controls={contentId}
          badge={careBadge}
          accessory={onOpenGuide && <GuideInfoButton topic="body" onOpen={onOpenGuide} />} />
      ) : <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h4 className="text-plate uppercase text-white/30">{t(compact ? 'ui.dock.body' : 'ui.condition.title')}</h4>
          {onOpenGuide && <GuideInfoButton topic="body" onOpen={onOpenGuide} />}
        </div>
        {!compact && careBadge}
      </div>}

      <div id={contentId} hidden={collapsed}>
      {!collapsed && (
        <>
          {showMeters && (
            <div className="mb-2.5 flex flex-col gap-1.5">
              <MeterBar
                label={t('ui.condition.health')}
                icon="meter.health"
                value={hp}
                max={hpMax}
                color="#d92d2d"
              />
              {hpMax > effectiveMaxHp(bodyParts) && (
                <p className="-mt-1 text-micro text-hiss/80">
                  {t('ui.condition.woundsHoldMax', { n: hpMax - effectiveMaxHp(bodyParts) })}
                </p>
              )}
              <MeterBar
                label={t('ui.condition.hunger')}
                icon="meter.hunger"
                value={meters.hunger}
                max={100}
                color="#b7b3a9"
                dynamic
                modifiers={meterModifiers('hunger', meters, locale)}
              />
              <MeterBar
                label={t('ui.condition.thirst')}
                icon="meter.thirst"
                value={meters.thirst}
                max={100}
                color="#2bc4d9"
                dynamic
                modifiers={meterModifiers('thirst', meters, locale)}
              />
              <MeterBar
                label={t('ui.condition.energy')}
                icon="meter.energy"
                value={meters.energy}
                max={100}
                color="#e8e5dd"
                dynamic
                modifiers={meterModifiers('energy', meters, locale)}
              />
              <MeterBar
                label={t('ui.condition.infection')}
                icon="meter.infection"
                value={meters.infection}
                max={100}
                color="#2bc4d9"
                danger
              />
            </div>
          )}

          {showAttributes && (
            <div className="mb-2.5">
              <AttributeRow />
            </div>
          )}

          <div className="mb-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-1.5">
            <div className="flex w-fit items-center justify-center self-stretch rounded border border-white/10 bg-black/20 px-0.5 py-1">
              <BodyDoll
                bodyParts={bodyParts}
                height={dollHeight}
                selectedPart={hovered}
                onHover={setHovered}
                careFeedback={feedback}
              />
            </div>
            <LimbDetailPanel bodyParts={bodyParts} highlighted={hovered} onHover={setHovered} />
          </div>

          <WoundCarePanel bodyParts={bodyParts} feedback={feedback} onHighlight={setHovered} />


          {showSurvivorStats && <SurvivorStatsGrid />}
        </>
      )}
      </div>
    </section>
  );
}

/** One pill for what needs care: bleeding outranks other wounds, infection rides along. */
function CareBadge({ bodyParts, infection }: { bodyParts: BodyParts; infection: number }) {
  const { t } = useT();
  const major = countBleeding(bodyParts, 'major');
  const minor = countBleeding(bodyParts, 'minor');
  const injured = Object.values(bodyParts).some((p) => p.hp < p.maxHp || p.fractured || p.crippled);
  const care = major
    ? (major > 1 ? t('ui.condition.bleedingOutTimes', { n: major }) : t('ui.condition.bleedingOut'))
    : minor
      ? (minor > 1 ? t('ui.condition.bleedingTimes', { n: minor }) : t('ui.condition.bleeding'))
      : injured ? t('ui.dock.injured') : '';
  const infected = infection > 0 ? `${t('ui.condition.infection')} ${Math.round(infection)}%` : '';
  const label = [care, infected].filter(Boolean).join(' · ');
  if (!label) return null;
  return (
    <span aria-live="polite" className={`inline-flex min-w-0 items-center gap-1 truncate rounded border border-hiss/40 px-1.5 py-0.5 text-label text-hiss ${major ? 'pulse-danger' : ''}`}>
      <Icon name={major || minor ? 'status.bleeding' : 'action.status'} />
      <span className="truncate">{label}</span>
    </span>
  );
}
