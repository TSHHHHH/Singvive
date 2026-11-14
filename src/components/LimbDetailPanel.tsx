import { useT } from '../i18n';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { BODY_PART_IDS, partConditionPct } from '../game/survival';
import type { BodyPart, BodyPartId, BodyParts } from '../game/types';

const ORDER: BodyPartId[] = BODY_PART_IDS;

interface StatusChip {
  icon: IconName;
  label: string;
  detail: string;
  tone: 'warn' | 'danger';
}

function statusChips(partId: BodyPartId, part: BodyPart, t: ReturnType<typeof useT>['t']): StatusChip[] {
  const chips: StatusChip[] = [];
  const isArm = partId === 'leftArm' || partId === 'rightArm';
  const isLeg = partId === 'leftLeg' || partId === 'rightLeg';

  if (part.bleed === 'major') {
    chips.push({
      icon: 'status.bleeding',
      label: t('ui.body.majorBleeding'),
      detail:
        t('ui.body.majorDetail'),
      tone: 'danger',
    });
  } else if (part.bleed === 'minor') {
    chips.push({
      icon: 'status.bleeding',
      label: t('ui.body.bleeding'),
      detail:
        t('ui.body.minorDetail'),
      tone: 'warn',
    });
  }
  if (part.fractured) {
    chips.push({
      icon: 'status.fractured',
      label: t('ui.body.fractured'),
      detail: isLeg
        ? t('ui.body.fracturedLeg')
        : isArm
          ? t('ui.body.fracturedArm')
          : t('ui.body.fracturedOther'),
      tone: 'warn',
    });
  }
  if (part.crippled || part.hp <= 0) {
    const vitalDetail =
      partId === 'torso'
        ? t('ui.body.criticalTorso')
        : partId === 'head'
          ? t('ui.body.criticalHead')
          : null;
    chips.push({
      icon: 'status.crippled',
      label: partId === 'head' || partId === 'torso' ? t('ui.body.critical') : t('ui.body.crippled'),
      detail: vitalDetail
        ? vitalDetail
        : isLeg
          ? t('ui.body.crippledLeg')
          : isArm
            ? t('ui.body.crippledArm')
            : t('ui.body.crippledOther'),
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
        <span className="block text-label uppercase text-white/50">
          {chip.label}
        </span>
        <span className="mt-0.5 block text-micro text-concrete-200">{chip.detail}</span>
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
  const { t } = useT();
  const pct = partConditionPct(part);
  const chips = statusChips(partId, part, t);
  const low = pct < 25;

  const hpText = `${Math.round(part.hp)}/${part.maxHp}`;

  return (
    <div
      className={`flex items-center gap-1.5 rounded px-1 py-0.5 transition ${
        highlighted ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
      onMouseEnter={() => onHover(partId)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="w-9 shrink-0 text-label uppercase text-white/45">
        {t(`ui.body.parts.${partId}`)}
      </span>
      <div
        className="relative min-h-[1em] min-w-0 flex-1 overflow-hidden rounded bg-black/50 ring-1 ring-white/10"
        aria-label={`${t(`ui.body.parts.${partId}`)} ${hpText}`}
      >
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-300 ${low ? 'pulse-danger' : ''}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: barColor(pct) }}
        />
        <span className="relative z-[1] flex items-center justify-end px-1.5 py-0.5 text-body tabular-nums leading-none text-white/80 [text-shadow:0_1px_1px_rgba(0,0,0,0.85)]">
          {hpText}
        </span>
      </div>
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
