import type { ReactElement } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import type { GuideTopic } from '../content/guideContent';
import { useT } from '../i18n';

/** Compact icon + label chip used inside guide diagrams. */
function Chip({
  icon,
  label,
  accent,
}: {
  icon?: IconName;
  label: string;
  accent?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs tabular-nums ${
        accent
          ? 'border-signal/40 bg-signal/10 text-signal'
          : 'border-white/10 bg-white/5 text-white/60'
      }`}
    >
      {icon && <Icon name={icon} size={12} />}
      {label}
    </span>
  );
}

function Arrow() {
  return <span className="text-white/25" aria-hidden>→</span>;
}

function SurviveDiagram() {
  const { t } = useT();
  const meters: { icon: IconName; fill: string; label: string }[] = [
    { icon: 'meter.hunger', fill: 'w-[70%]', label: t('ui.guide.diagram.hunger') },
    { icon: 'meter.thirst', fill: 'w-[55%]', label: t('ui.guide.diagram.thirst') },
    { icon: 'meter.energy', fill: 'w-[40%]', label: t('ui.guide.diagram.energy') },
    { icon: 'meter.infection', fill: 'w-[15%]', label: t('ui.guide.diagram.infect') },
  ];

  return (
    <div className="space-y-2" aria-hidden>
      <div className="grid grid-cols-2 gap-1.5">
        {meters.map((m) => (
          <div key={m.label} className="flex items-center gap-1.5">
            <Icon name={m.icon} size={12} />
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded bg-black/50">
              <div className={`h-full rounded bg-white/45 ${m.fill}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip label={t('ui.guide.diagram.hpLimbs')} />
        <Chip icon="action.sleep" label={t('ui.guide.diagram.sleepDrain')} />
        <Chip label={t('ui.guide.diagram.lowHpLoss')} accent />
      </div>
    </div>
  );
}

function LootDiagram() {
  const { t } = useT();
  const cells = [
    { fog: true, next: false },
    { fog: true, next: true },
    { fog: false, next: false },
    { fog: true, next: false },
    { fog: false, next: false },
    { fog: true, next: false },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" aria-hidden>
      <div className="grid grid-cols-3 gap-0.5 rounded border border-white/10 bg-black/40 p-1">
        {cells.map((c, i) => (
          <div
            key={i}
            className={`flex h-5 w-5 items-center justify-center rounded-sm text-2xs ${
              c.next
                ? 'border border-signal/50 bg-signal/15 text-signal'
                : c.fog
                  ? 'bg-white/10 text-white/35'
                  : 'bg-white/5 text-white/70'
            }`}
          >
            {c.next ? '?' : c.fog ? '·' : '■'}
          </div>
        ))}
      </div>
      <Arrow />
      <Chip icon="action.inventory" label={t('ui.guide.diagram.pack')} />
      <Arrow />
      <Chip icon="action.stash" label={t('ui.guide.diagram.stash')} />
      <Chip label={t('ui.guide.diagram.limitedSearches')} accent />
    </div>
  );
}

function EvacDiagram() {
  const { t } = useT();
  const weights: { label: string; w: string; mult: string }[] = [
    { label: t('ui.guide.diagram.fuel'), w: 'w-full', mult: '×3' },
    { label: t('ui.guide.diagram.medsAmmo'), w: 'w-[83%]', mult: '×2.5' },
    { label: t('ui.guide.diagram.weapons'), w: 'w-1/2', mult: '×1–1.6' },
    { label: t('ui.guide.diagram.foodWater'), w: 'w-1/3', mult: '×0.5' },
  ];

  return (
    <div className="space-y-2" aria-hidden>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip icon="action.evac" label={t('ui.guide.diagram.beacon')} accent />
        <Arrow />
        <Chip icon="action.inventory" label={t('ui.guide.diagram.backpackOnly')} />
        <Chip label={t('ui.guide.diagram.timedWindow')} />
      </div>
      <div className="space-y-1">
        {weights.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-2xs text-white/40">{row.label}</span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded bg-black/50">
              <div className={`h-full rounded bg-signal/60 ${row.w}`} />
            </div>
            <span className="w-10 shrink-0 text-right text-2xs tabular-nums text-signal/80">
              {row.mult}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreDiagram() {
  const { t } = useT();
  return (
    <div className="space-y-2" aria-hidden>
      <div className="flex flex-wrap items-center gap-1 text-2xs text-white/55">
        <Chip icon="action.kills" label="×25" />
        <span className="text-white/25">+</span>
        <Chip icon="stat.value" label={t('ui.guide.diagram.loot')} />
        <span className="text-white/25">+</span>
        <Chip label={t('ui.guide.diagram.daysTimes50')} />
        <span className="text-white/25">×</span>
        <Chip label={t('ui.guide.diagram.dayMult')} accent />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip label={t('ui.guide.diagram.day1Mult')} />
        <Chip label={t('ui.guide.diagram.plusPerDay')} />
        <Chip icon="action.evac" label={t('ui.guide.diagram.evacBonus')} accent />
      </div>
    </div>
  );
}

function HdbDiagram() {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
      <Chip icon="hdb.enterBlock" label={t('ui.guide.diagram.climb')} />
      <Arrow />
      <Chip icon="hdb.unit" label={t('ui.guide.diagram.door')} />
      <Arrow />
      <Chip icon="hdb.breach" label={t('ui.guide.diagram.heat')} accent />
      <Arrow />
      <Chip icon="action.search" label={t('ui.guide.diagram.timeline')} />
    </div>
  );
}

function TunnelsDiagram() {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
      <Chip icon="action.mrt" label={t('ui.guide.diagram.plan')} />
      <Arrow />
      <Chip label={t('ui.guide.diagram.fewestStops')} accent />
      <Arrow />
      <Chip icon="tunnel.platform" label={t('ui.guide.diagram.crawl')} />
      <Arrow />
      <Chip label={t('ui.guide.diagram.exitArrive')} />
    </div>
  );
}

function BodyDiagram() {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
      <Chip label={t('ui.guide.diagram.legsTravel')} accent />
      <Arrow />
      <Chip icon="slot.mainHand" label={t('ui.guide.diagram.rightArmHit')} />
      <Chip icon="slot.offHand" label={t('ui.guide.diagram.leftArmBlock')} />
      <Arrow />
      <Chip icon="attr.perception" label={t('ui.guide.diagram.headSearch')} />
      <Chip icon="meter.energy" label={t('ui.guide.diagram.torsoEnergy')} />
    </div>
  );
}

function FightDiagram() {
  const { t } = useT();
  return (
    <div className="space-y-2" aria-hidden>
      <div className="relative h-3 rounded-sm bg-black/50 ring-1 ring-white/10">
        <div
          className="absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-sm bg-astral"
          style={{ left: '32%' }}
        />
        <div
          className="absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-sm bg-hiss"
          style={{ left: '68%' }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip icon="item.weaponMelee" label={t('ui.guide.diagram.lightFast')} accent />
        <Chip icon="item.weaponMelee" label={t('ui.guide.diagram.heavyHit')} />
        <Chip icon="attr.dexterity" label={t('ui.guide.diagram.freeHand')} accent />
        <Chip icon="slot.offHand" label={t('ui.guide.diagram.shieldBlock')} />
        <Chip icon="slot.mainHand" label={t('ui.guide.diagram.secondBlade')} />
      </div>
    </div>
  );
}

const DIAGRAMS: Record<GuideTopic, () => ReactElement> = {
  survive: SurviveDiagram,
  body: BodyDiagram,
  fight: FightDiagram,
  loot: LootDiagram,
  hdb: HdbDiagram,
  tunnels: TunnelsDiagram,
  evac: EvacDiagram,
  score: ScoreDiagram,
};

/** Simple icon / shape / number diagram for a guide topic. */
export function GuideDiagram({ topic }: { topic: GuideTopic }) {
  const Diagram = DIAGRAMS[topic];
  return (
    <div className="rounded-md border border-white/15 bg-concrete-900/80 p-2.5">
      <Diagram />
    </div>
  );
}
