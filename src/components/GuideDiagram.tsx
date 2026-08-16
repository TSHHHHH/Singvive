import type { ReactElement } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import type { GuideTopic } from '../content/guideContent';

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
  const meters: { icon: IconName; fill: string; label: string }[] = [
    { icon: 'meter.hunger', fill: 'w-[70%]', label: 'Hunger' },
    { icon: 'meter.thirst', fill: 'w-[55%]', label: 'Thirst' },
    { icon: 'meter.energy', fill: 'w-[40%]', label: 'Energy' },
    { icon: 'meter.infection', fill: 'w-[15%]', label: 'Infect' },
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
        <Chip label="HP = 6 limbs" />
        <Chip icon="action.sleep" label="sleep ×0.3 drain" />
        <Chip label="<20 → HP loss" accent />
      </div>
    </div>
  );
}

function LootDiagram() {
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
      <Chip icon="action.inventory" label="pack" />
      <Arrow />
      <Chip icon="action.stash" label="stash" />
      <Chip label="limited searches" accent />
    </div>
  );
}

function EvacDiagram() {
  const weights: { label: string; w: string; mult: string }[] = [
    { label: 'Fuel', w: 'w-full', mult: '×3' },
    { label: 'Meds/Ammo', w: 'w-[83%]', mult: '×2.5' },
    { label: 'Weapons', w: 'w-1/2', mult: '×1–1.6' },
    { label: 'Food/Water', w: 'w-1/3', mult: '×0.5' },
  ];

  return (
    <div className="space-y-2" aria-hidden>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip icon="action.evac" label="beacon" accent />
        <Arrow />
        <Chip icon="action.inventory" label="backpack only" />
        <Chip label="timed window" />
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
  return (
    <div className="space-y-2" aria-hidden>
      <div className="flex flex-wrap items-center gap-1 text-2xs text-white/55">
        <Chip icon="action.kills" label="×25" />
        <span className="text-white/25">+</span>
        <Chip icon="stat.value" label="loot" />
        <span className="text-white/25">+</span>
        <Chip label="days ×50" />
        <span className="text-white/25">×</span>
        <Chip label="day mult" accent />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip label="day 1 → ×1.0" />
        <Chip label="+0.1 / day" />
        <Chip icon="action.evac" label="+2000 × mult" accent />
      </div>
    </div>
  );
}

function HdbDiagram() {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
      <Chip icon="hdb.enterBlock" label="climb" />
      <Arrow />
      <Chip icon="hdb.unit" label="door" />
      <Arrow />
      <Chip icon="hdb.breach" label="heat" accent />
      <Arrow />
      <Chip icon="action.search" label="timeline" />
    </div>
  );
}

function TunnelsDiagram() {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
      <Chip icon="action.mrt" label="plan" />
      <Arrow />
      <Chip label="fewest stops" accent />
      <Arrow />
      <Chip icon="tunnel.platform" label="crawl" />
      <Arrow />
      <Chip label="exit / arrive" />
    </div>
  );
}

const DIAGRAMS: Record<GuideTopic, () => ReactElement> = {
  survive: SurviveDiagram,
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
