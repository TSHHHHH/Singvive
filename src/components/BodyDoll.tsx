import { partConditionPct } from '../game/survival';
import { useT } from '../i18n';
import type { BleedLevel, BodyPartId, BodyParts } from '../game/types';
import type { CareFeedback } from './BodyCareList';

const BLEED_LABEL: Record<BleedLevel, string> = {
  none: '',
  minor: 'ui.body.bleeding',
  major: 'ui.body.majorBleeding',
};

const BLEED_COLOR: Record<BleedLevel, string> = {
  none: 'transparent',
  minor: '#b7b3a9',
  major: '#d92d2d',
};

function partFill(condition: number): string {
  if (condition >= 90) return '#414749';
  if (condition >= 70) return '#575852';
  if (condition >= 45) return '#70614f';
  if (condition >= 20) return '#835343';
  return '#823d38';
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

const OUTLINES: Record<BodyPartId, string> = {
  head: 'M50 4 C36 4 36 14 39 23 Q41 30 50 31 Q59 30 61 23 C64 14 64 4 50 4 Z',
  torso: 'M44 34 L56 34 L57 38 L65 41 L61 64 L62 82 Q50 88 38 82 L39 64 L35 41 L43 38 Z',
  rightArm: 'M32 40 Q25 38 23 46 L18 64 L17 79 Q17 86 23 86 Q27 86 28 80 L29 66 L35 48 Z',
  leftArm: 'M68 40 Q75 38 77 46 L82 64 L83 79 Q83 86 77 86 Q73 86 72 80 L71 66 L65 48 Z',
  rightLeg: 'M38 87 L49 89 L47 119 L46 149 L47 155 Q41 159 34 156 L36 148 L36 118 Z',
  leftLeg: 'M51 89 L62 87 L64 118 L64 148 L66 156 Q59 159 53 155 L54 149 L53 119 Z',
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

/** Cropped to the silhouette (plus bleed pips) so the doll column stays narrow. */
const VIEW_X = 10;
const VIEW_W = 80;
const VIEW_H = 164;

interface Props {
  bodyParts: BodyParts;
  height?: number;
  /** Limb currently highlighted by hover on the doll or the overview list. */
  selectedPart?: BodyPartId | null;
  onHover?: (id: BodyPartId | null) => void;
  careFeedback?: CareFeedback | null;
}

export function BodyDoll({ bodyParts, height = 150, selectedPart = null, onHover, careFeedback }: Props) {
  const { t } = useT();
  const width = height * (VIEW_W / VIEW_H);
  return (
    <svg
      viewBox={`${VIEW_X} 0 ${VIEW_W} ${VIEW_H}`}
      width={width}
      height={height}
      className="care-doll block select-none"
      role="img"
      aria-label={`${t('ui.body.title')}. ${ORDER.map(id => {
        const part = bodyParts[id];
        return [t(`ui.body.parts.${id}`), `${Math.round(part.hp)}/${part.maxHp}`,
          part.wound ? t(`ui.care.wound.${part.wound}`) : '',
          part.dirty ? t('ui.care.dirtyHint') : '',
          part.dressing === 'clean' ? t('ui.care.dressingClean') : '',
          part.dressing === 'soiled' ? t('ui.care.dressingSoiled') : '',
          part.fractured ? t(part.splinted ? 'ui.care.fractureSupported' : 'ui.care.fractureUnsupported') : '',
          (part.recoveryBoostHours ?? 0) > 0 ? t('ui.care.supportActive', { n: Math.ceil(part.recoveryBoostHours ?? 0) }) : '',
          part.bleed !== 'none' ? t(BLEED_LABEL[part.bleed]) : '',
        ].filter(Boolean).join(' · ');
      }).join('. ')}`}
    >
      {ORDER.map((id) => {
        const p = bodyParts[id];
        const condition = partConditionPct(p);
        const active = selectedPart === id;
        const s = SHAPES[id];
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h * 0.48;
        const wrapped = p.dressing === 'clean' || p.dressing === 'soiled';
        return (
          <g key={id}>
            <path
              d={OUTLINES[id]}
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
                {t(`ui.body.parts.${id}`)}: {Math.round(p.hp)}/{p.maxHp}
                {p.bleed !== 'none' ? ` · ${t(BLEED_LABEL[p.bleed])}` : ''}
                {p.fractured ? ` · ${t('ui.body.fractured')}` : ''}
              </title>
            </path>
            <g pointerEvents="none">
              {p.wound && !wrapped && (p.wound === 'bruise' ? (
                <g fill="#a17b84" opacity="0.7">
                  <ellipse cx={cx} cy={cy} rx={Math.min(5, s.w * 0.3)} ry="6" />
                  <ellipse cx={cx + 1} cy={cy - 1} rx="2" ry="3" fill="#73576b" />
                </g>
              ) : (
                <g strokeLinecap="round">
                  <path d={`M${cx - 2} ${cy - 7} l3 4 -3 3 4 5`} fill="none" stroke="#3c2524" strokeWidth="3.5" />
                  <path d={`M${cx - 2} ${cy - 7} l3 4 -3 3 4 5`} fill="none" stroke={p.wound === 'deep' ? '#d96858' : '#bc8172'} strokeWidth={p.wound === 'deep' ? 1.8 : 1.1} />
                  {p.wound === 'deep' && <path d={`M${cx - 4} ${cy - 3} l6 -2 M${cx - 3} ${cy + 3} l6 -2`} stroke="#b78979" strokeWidth="1" />}
                </g>
              ))}
              {wrapped && (
                <g>
                  <rect x={cx - Math.min(8, s.w / 2 + 1)} y={cy - 6} width={Math.min(16, s.w + 2)} height="12" rx="2" fill={p.dressing === 'soiled' ? '#9d9177' : '#ddd9c9'} stroke="#5b605c" strokeWidth="0.7" />
                  <path d={`M${cx - 5} ${cy - 3} h10 M${cx - 5} ${cy} h10 M${cx - 5} ${cy + 3} h10`} stroke="#7d8177" strokeWidth="0.7" opacity="0.7" />
                  {p.dressing === 'soiled' && <ellipse cx={cx + 1} cy={cy} rx="3" ry="3.5" fill="#765447" opacity="0.75" />}
                </g>
              )}
              {p.dirty && (
                <g fill="#bf9c64">
                  <circle cx={cx - 4} cy={cy + 9} r="1.1" />
                  <circle cx={cx + 2} cy={cy + 11} r="0.9" />
                  <circle cx={cx + 4} cy={cy + 8} r="0.8" />
                </g>
              )}
              {p.fractured && !p.splinted && <path d={`M${cx - 2} ${cy + 15} l4 3 -4 3 4 3`} fill="none" stroke="#d4b787" strokeWidth="1.7" />}
              {p.splinted && (
                <g>
                  <path d={`M${cx - 4} ${cy + 9} v19 M${cx + 4} ${cy + 9} v19`} stroke="#c1aa7c" strokeWidth="2.5" strokeLinecap="round" />
                  <path d={`M${cx - 5} ${cy + 13} h10 M${cx - 5} ${cy + 24} h10`} stroke="#d9d8c9" strokeWidth="2" />
                </g>
              )}
              {(p.painReliefHours ?? 0) > 0 && <circle cx={cx + s.w / 2 + 3} cy={cy + 4} r="2" fill="#79bfc1" />}
              {careFeedback?.partId === id && (
                <rect key={careFeedback.sequence} className="care-body-feedback" x={s.x - 4} y={s.y - 4} width={s.w + 8} height={s.h + 8} rx={s.rx + 3} fill="none" stroke="#7fd0cb" strokeWidth="2" />
              )}
            </g>
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
