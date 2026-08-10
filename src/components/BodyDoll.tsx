import { useState } from 'react';
import { BODY_PART_LABEL } from '../game/survival';
import type { BodyPartId, BodyParts } from '../game/types';

/**
 * The survivor, drawn as a figure rather than a list of numbers — the Zomboid /
 * Tarkov idea that you should be able to read your own condition at a glance,
 * without parsing six percentages.
 *
 * The figure faces the viewer, so the survivor's LEFT limbs sit on the viewer's
 * RIGHT. That's the convention those games use and the one the labels assume.
 */

/** Fill for a part at a given condition — greys until it's actually hurt. */
function partFill(condition: number): string {
  if (condition >= 90) return '#4a4a4d';
  if (condition >= 70) return '#6f6d68';
  if (condition >= 45) return '#8a7250';
  if (condition >= 20) return '#a5522f';
  return '#8f2020';
}

function partStroke(condition: number): string {
  if (condition >= 90) return '#6f6d68';
  if (condition >= 45) return '#b7b3a9';
  return '#d92d2d';
}

/**
 * Geometry of each region, in the 100×164 viewBox. Every part is separated from
 * its neighbours by a few units of empty space — the silhouette reads as an
 * assembled figure rather than one blob, and a damaged limb is unmistakably
 * *that* limb.
 */
const SHAPES: Record<BodyPartId, { x: number; y: number; w: number; h: number; rx: number }> = {
  head: { x: 38, y: 4, w: 24, h: 26, rx: 11 },
  torso: { x: 37, y: 36, w: 26, h: 48, rx: 5 },
  // viewer-left column = the survivor's RIGHT arm
  rightArm: { x: 19, y: 39, w: 13, h: 45, rx: 5 },
  leftArm: { x: 68, y: 39, w: 13, h: 45, rx: 5 },
  rightLeg: { x: 37, y: 90, w: 11, h: 66, rx: 5 },
  leftLeg: { x: 52, y: 90, w: 11, h: 66, rx: 5 },
};

/** Where the "bleeding" pip sits for each part — just outside its outline. */
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
  /** Rendered height in px. Width follows the aspect ratio. */
  height?: number;
}

export function BodyDoll({ bodyParts, height = 150 }: Props) {
  const [hovered, setHovered] = useState<BodyPartId | null>(null);

  // With nothing hovered, name the part that most wants attention: bleeding
  // first, then whatever is in the worst shape.
  const worst = ORDER.reduce((acc, id) => {
    const a = bodyParts[acc];
    const b = bodyParts[id];
    if (b.bleeding !== a.bleeding) return b.bleeding ? id : acc;
    return b.condition < a.condition ? id : acc;
  }, ORDER[0]);

  const focus = hovered ?? worst;
  const focused = bodyParts[focus];
  const healthy = !focused.bleeding && focused.condition >= 99;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        viewBox="0 0 100 164"
        style={{ height }}
        className="w-auto select-none"
        role="img"
        aria-label="Body condition"
      >
        {ORDER.map((id) => {
          const p = bodyParts[id];
          const active = hovered === id;
          const s = SHAPES[id];
          return (
            <g key={id}>
              <rect
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                rx={s.rx}
                fill={partFill(p.condition)}
                stroke={active ? '#e8e5dd' : partStroke(p.condition)}
                strokeWidth={active ? 2.5 : 1.5}
                className={`cursor-pointer transition-[fill,stroke] duration-200 ${
                  p.bleeding ? 'pulse-danger' : ''
                }`}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered((h) => (h === id ? null : h))}
                onClick={() => setHovered((h) => (h === id ? null : id))}
              >
                <title>
                  {BODY_PART_LABEL[id]}: {Math.round(p.condition)}%
                  {p.bleeding ? ' · bleeding' : ''}
                </title>
              </rect>
              {/* Bleeding used to throb the whole map frame red; it lives here
                  now — a pip plus a halo on the limb that's actually open. */}
              {p.bleeding && (
                <g className="pulse-danger" pointerEvents="none">
                  <rect
                    x={s.x - 2.5}
                    y={s.y - 2.5}
                    width={s.w + 5}
                    height={s.h + 5}
                    rx={s.rx + 2.5}
                    fill="none"
                    stroke="#d92d2d"
                    strokeWidth={2}
                  />
                  <circle cx={PIP[id][0]} cy={PIP[id][1]} r={4} fill="#d92d2d" />
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* One-line readout for whatever the figure is pointing at. */}
      <div className="text-center leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-white/40">
          {BODY_PART_LABEL[focus]}
        </div>
        <div
          className={`text-[11px] tabular-nums ${
            focused.bleeding ? 'text-hiss' : healthy ? 'text-white/50' : 'text-concrete-200'
          }`}
        >
          {Math.round(focused.condition)}%{focused.bleeding && ' · bleeding'}
        </div>
      </div>
    </div>
  );
}
