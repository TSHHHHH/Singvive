import { BODY_PART_LABEL, partConditionPct } from '../game/survival';
import type { BleedLevel, BodyPartId, BodyParts } from '../game/types';

const BLEED_LABEL: Record<BleedLevel, string> = {
  none: '',
  minor: 'bleeding',
  major: 'bleeding badly',
};

const BLEED_COLOR: Record<BleedLevel, string> = {
  none: 'transparent',
  minor: '#b7b3a9',
  major: '#d92d2d',
};

function partFill(condition: number): string {
  if (condition >= 90) return '#4a4a4d';
  if (condition >= 70) return '#6f6d68';
  if (condition >= 45) return '#8a7250';
  if (condition >= 20) return '#a5522f';
  return '#8f2020';
}

function partStroke(condition: number, active: boolean): string {
  if (active) return '#e8e5dd';
  if (condition >= 90) return '#6f6d68';
  if (condition >= 45) return '#b7b3a9';
  return '#d92d2d';
}

const SHAPES: Record<BodyPartId, { x: number; y: number; w: number; h: number; rx: number }> = {
  head: { x: 38, y: 4, w: 24, h: 26, rx: 11 },
  torso: { x: 37, y: 36, w: 26, h: 48, rx: 5 },
  rightArm: { x: 19, y: 39, w: 13, h: 45, rx: 5 },
  leftArm: { x: 68, y: 39, w: 13, h: 45, rx: 5 },
  rightLeg: { x: 37, y: 90, w: 11, h: 66, rx: 5 },
  leftLeg: { x: 52, y: 90, w: 11, h: 66, rx: 5 },
};

const PIP: Record<BodyPartId, [number, number]> = {
  head: [66, 9],
  torso: [67, 42],
  rightArm: [15, 42],
  leftArm: [85, 42],
  rightLeg: [33, 104],
  leftLeg: [67, 104],
};

const ORDER: BodyPartId[] = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

interface Props {
  bodyParts: BodyParts;
  height?: number;
  /** Limb currently highlighted by hover on the doll or the overview list. */
  selectedPart?: BodyPartId | null;
  onHover?: (id: BodyPartId | null) => void;
}

export function BodyDoll({ bodyParts, height = 150, selectedPart = null, onHover }: Props) {
  return (
    <svg
      viewBox="0 0 100 164"
      style={{ height }}
      className="w-auto select-none"
      role="img"
      aria-label="Body condition"
    >
      {ORDER.map((id) => {
        const p = bodyParts[id];
        const condition = partConditionPct(p);
        const active = selectedPart === id;
        const s = SHAPES[id];
        return (
          <g key={id}>
            <rect
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx={s.rx}
              fill={partFill(condition)}
              stroke={partStroke(condition, active)}
              strokeWidth={active ? 2.5 : 1.5}
              className={`cursor-default transition-[fill,stroke] duration-200 ${
                p.bleed === 'major' ? 'pulse-danger' : ''
              }`}
              onMouseEnter={() => onHover?.(id)}
              onMouseLeave={() => onHover?.(null)}
            >
              <title>
                {BODY_PART_LABEL[id]}: {Math.round(p.hp)}/{p.maxHp}
                {p.bleed !== 'none' ? ` · ${BLEED_LABEL[p.bleed]}` : ''}
                {p.fractured ? ' · fractured' : ''}
              </title>
            </rect>
            {p.bleed !== 'none' && (
              <g className={p.bleed === 'major' ? 'pulse-danger' : ''} pointerEvents="none">
                <rect
                  x={s.x - 2.5}
                  y={s.y - 2.5}
                  width={s.w + 5}
                  height={s.h + 5}
                  rx={s.rx + 2.5}
                  fill="none"
                  stroke={BLEED_COLOR[p.bleed]}
                  strokeWidth={p.bleed === 'major' ? 2 : 1.25}
                />
                <circle
                  cx={PIP[id][0]}
                  cy={PIP[id][1]}
                  r={p.bleed === 'major' ? 4 : 2.75}
                  fill={BLEED_COLOR[p.bleed]}
                />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
