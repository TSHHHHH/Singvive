import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { BODY_PART_IDS, BODY_PART_LABEL, partConditionPct } from '../game/survival';
import type { BodyPart, BodyPartId, BodyParts } from '../game/types';

const ORDER: BodyPartId[] = BODY_PART_IDS;

interface StatusChip {
  icon: IconName;
  label: string;
  detail: string;
  tone: 'warn' | 'danger';
}

function statusChips(partId: BodyPartId, part: BodyPart): StatusChip[] {
  const chips: StatusChip[] = [];
  const isArm = partId === 'leftArm' || partId === 'rightArm';
  const isLeg = partId === 'leftLeg' || partId === 'rightLeg';

  if (part.bleed === 'major') {
    chips.push({
      icon: 'status.bleeding',
      label: 'Bleeding badly',
      detail:
        'Drains this limb until dressed. Raises encounter chance (+10% each, capped) — blood trail draws them in.',
      tone: 'danger',
    });
  } else if (part.bleed === 'minor') {
    chips.push({
      icon: 'status.bleeding',
      label: 'Bleeding',
      detail:
        'Slow drain; may clot on its own. Still raises encounter chance (+4% each, capped). Dress it if you can.',
      tone: 'warn',
    });
  }
  if (part.fractured) {
    chips.push({
      icon: 'status.fractured',
      label: 'Fractured',
      detail: isLeg
        ? 'Needs a splint. Slows travel and shrinks how far you can push in one go.'
        : isArm
          ? 'Needs a splint. Hurts aim and melee until set.'
          : 'Needs a splint. Slows recovery and taxes combat.',
      tone: 'warn',
    });
  }
  if (part.crippled || part.hp <= 0) {
    const vitalDetail =
      partId === 'torso'
        ? 'Vital zone wrecked — another solid hit here ends the run.'
        : partId === 'head'
          ? 'Vital zone wrecked — overkill spills into the body.'
          : null;
    chips.push({
      icon: 'status.crippled',
      label: partId === 'head' || partId === 'torso' ? 'Critical' : 'Crippled',
      detail: vitalDetail
        ? vitalDetail
        : isLeg
          ? 'Limb wrecked. Travel crawls; passive heal caps at 70% until treated.'
          : isArm
            ? 'Limb wrecked. Heavy combat penalty; passive heal caps at 70% until treated.'
            : 'Limb wrecked. Passive heal caps at 70% until treated.',
      tone: 'danger',
    });
  }
  return chips;
}

function barColor(pct: number): string {
  if (pct >= 90) return '#5a5a5e';
  if (pct >= 70) return '#8a7250';
  if (pct >= 40) return '#a5522f';
  return '#d92d2d';
}

function StatusIcon({ chip }: { chip: StatusChip }) {
  return (
    <span
      className={`group/tip relative inline-flex cursor-help ${
        chip.tone === 'danger' ? 'text-hiss' : 'text-concrete-200'
      } ${chip.tone === 'danger' && chip.icon === 'status.bleeding' ? 'pulse-danger' : ''}`}
    >
      <Icon name={chip.icon} size={12} title={chip.label} />
      <span className="pointer-events-none absolute bottom-full right-0 z-30 mb-1.5 hidden w-max max-w-[14rem] rounded border border-white/15 bg-concrete-900 px-2 py-1.5 text-left shadow-signage group-hover/tip:block">
        <span className="block text-2xs font-semibold uppercase tracking-wider text-white/50">
          {chip.label}
        </span>
        <span className="mt-0.5 block text-2xs leading-snug text-concrete-200">{chip.detail}</span>
      </span>
    </span>
  );
}

function LimbRow({
  partId,
  part,
  highlighted,
  onHover,
}: {
  partId: BodyPartId;
  part: BodyPart;
  highlighted: boolean;
  onHover: (id: BodyPartId | null) => void;
}) {
  const pct = partConditionPct(part);
  const chips = statusChips(partId, part);
  const low = pct < 25;

  return (
    <div
      className={`flex items-center gap-1.5 rounded px-1 py-0.5 transition ${
        highlighted ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
      onMouseEnter={() => onHover(partId)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="w-9 shrink-0 text-2xs uppercase tracking-wide text-white/45">
        {BODY_PART_LABEL[partId]}
      </span>
      <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded bg-black/50 ring-1 ring-white/10">
        <div
          className={`h-full transition-all duration-300 ${low ? 'pulse-danger' : ''}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: barColor(pct) }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-2xs tabular-nums text-white/60">
        {Math.round(part.hp)}/{part.maxHp}
      </span>
      <span className="flex w-8 shrink-0 items-center justify-end gap-0.5">
        {chips.map((c) => (
          <StatusIcon key={c.label} chip={c} />
        ))}
      </span>
    </div>
  );
}

interface Props {
  bodyParts: BodyParts;
  /** Which limb the doll / list is currently pointing at. */
  highlighted?: BodyPartId | null;
  onHover?: (id: BodyPartId | null) => void;
}

/** Compact list of every limb — HP at a glance, status icons with hover detail. */
export function LimbDetailPanel({ bodyParts, highlighted = null, onHover }: Props) {
  return (
    <div className="flex h-full min-h-[120px] flex-col justify-center gap-0.5 rounded border border-white/10 bg-black/25 p-1.5">
      {ORDER.map((id) => (
        <LimbRow
          key={id}
          partId={id}
          part={bodyParts[id]}
          highlighted={highlighted === id}
          onHover={onHover ?? (() => {})}
        />
      ))}
    </div>
  );
}
