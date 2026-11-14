import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { CombatImpact } from '../game/types';

/**
 * Desktop combat juice: screen shake, blood, hit flashes, miss whiffs and
 * floating damage numbers, layered over the whole screen.
 *
 * Presentation only — it reads `combat.impact` and the two HP totals, and never
 * writes to the store. Everything moves on transform / opacity so it stays on
 * the compositor, and nothing runs once a burst is over: each burst is one
 * keyed subtree whose longest animation ends it, and the shake is a single
 * Web Animation on the game shell with no fill.
 */

/** The game shell carries this attribute; it is what shakes. */
const COMBAT_SHAKE_ROOT_ATTR = 'data-combat-shake-root';

const SHAKE_KINDS = new Set<CombatImpact['kind']>(['hit', 'crit', 'death', 'kill']);
const HURT_KINDS = new Set<CombatImpact['kind']>(['hit', 'crit', 'death', 'kill']);
const WHIFF_KINDS = new Set<CombatImpact['kind']>(['miss', 'dodge', 'block']);

/** Longest piece of a burst, in ms — the life timer ends on this. */
function lifeMs(impact: CombatImpact): number {
  if (impact.side === 'player' && HURT_KINDS.has(impact.kind)) {
    return impact.kind === 'hit' ? 1500 : 1900;
  }
  return 1000;
}

type Rect = { x: number; y: number; w: number; h: number };

/** Tiny deterministic PRNG so a burst lays out the same on every render. */
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

interface Splat {
  left: string;
  top: string;
  size: number;
  rot: number;
  dots: { cx: number; cy: number; r: number }[];
  streaks: { cx: number; cy: number; rx: number; ry: number; a: number }[];
  delay: number;
}

/** A blood splat: one body, a ring of satellites, a few thrown streaks. */
function makeSplat(r: () => number, edge: number): Splat {
  // Hug the screen edges — the middle is where the player is reading.
  const along = 6 + r() * 88;
  const inset = r() * 14 - 4;
  const pos =
    edge === 0
      ? { left: `${along}%`, top: `${inset}%` }
      : edge === 1
        ? { left: `${100 - inset}%`, top: `${along}%` }
        : edge === 2
          ? { left: `${along}%`, top: `${100 - inset}%` }
          : { left: `${inset}%`, top: `${along}%` };
  const dots = [{ cx: 50, cy: 50, r: 16 + r() * 8 }];
  const satellites = 6 + Math.floor(r() * 6);
  for (let i = 0; i < satellites; i++) {
    const a = r() * Math.PI * 2;
    const d = 20 + r() * 26;
    dots.push({ cx: 50 + Math.cos(a) * d, cy: 50 + Math.sin(a) * d, r: 1.5 + r() * 5 });
  }
  const streaks = [];
  for (let i = 0; i < 3; i++) {
    const a = r() * 360;
    const rad = (a * Math.PI) / 180;
    streaks.push({ cx: 50 + Math.cos(rad) * 22, cy: 50 + Math.sin(rad) * 22, rx: 12 + r() * 10, ry: 2.5 + r() * 2, a });
  }
  return { ...pos, size: 110 + r() * 120, rot: r() * 360, dots, streaks, delay: r() * 60 };
}

interface Droplet {
  dx: number;
  dy: number;
  s: number;
  delay: number;
}

/** Spray thrown out of a portrait, biased upward so it arcs. */
function makeDroplets(r: () => number, n: number, spread: number): Droplet[] {
  const out: Droplet[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.7;
    const d = spread * (0.45 + r() * 0.75);
    out.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d + spread * 0.35, s: 3 + r() * 5, delay: r() * 40 });
  }
  return out;
}

function shake(impact: CombatImpact) {
  const el = document.querySelector<HTMLElement>(`[${COMBAT_SHAKE_ROOT_ATTR}]`);
  if (!el || typeof el.animate !== 'function') return;
  // Hits taken shake hard; hits dealt only punch.
  const taken = impact.side === 'player';
  const big = impact.kind === 'crit' || impact.kind === 'death' || impact.kind === 'kill';
  const amp = taken ? (big ? 11 : 6) : big ? 4 : 2;
  const rot = taken && big ? 0.5 : 0;
  const steps = [1, -0.85, 0.7, -0.5, 0.3, -0.15, 0];
  el.animate(
    steps.map((k, i) => ({
      transform: `translate3d(${(amp * k).toFixed(2)}px, ${(amp * k * (i % 2 ? 0.5 : -0.4)).toFixed(2)}px, 0) rotate(${(rot * k).toFixed(2)}deg)`,
    })),
    { duration: taken ? (big ? 420 : 300) : big ? 240 : 160, easing: 'ease-out' },
  );
}

export function CombatFx({
  impact,
  playerHp,
  enemyHp,
  playerRef,
  enemyRef,
  reduced,
  labels,
}: {
  impact: CombatImpact | null;
  playerHp: number;
  enemyHp: number;
  playerRef: RefObject<HTMLElement | null>;
  enemyRef: RefObject<HTMLElement | null>;
  /** Hold everything still: no shake, no flying spray — fades only. */
  reduced: boolean;
  labels: { miss: string; dodge: string; block: string; crit: string };
}) {
  const id = impact?.id ?? 0;

  // HP on the previous impact, so a burst can say how much it took. Updated in
  // render (the "state from previous render" pattern) so Strict Mode's double
  // render cannot eat the delta.
  const [hp, setHp] = useState({ id, playerHp, enemyHp, dPlayer: 0, dEnemy: 0 });
  if (hp.id !== id) {
    setHp({ id, playerHp, enemyHp, dPlayer: hp.playerHp - playerHp, dEnemy: hp.enemyHp - enemyHp });
  } else if (hp.playerHp !== playerHp || hp.enemyHp !== enemyHp) {
    // Bleed ticks between swings: track them without crediting the next hit.
    setHp({ ...hp, playerHp, enemyHp });
  }

  // Whatever impact is on screen when the panel mounts already played.
  const [doneId, setDoneId] = useState(id);
  const [spots, setSpots] = useState<{ id: number; player: Rect | null; enemy: Rect | null }>({
    id: 0,
    player: null,
    enemy: null,
  });
  const firstId = useRef(id);

  // One measurement per impact: where the two portraits sit right now.
  useLayoutEffect(() => {
    if (!impact || impact.id === firstId.current) return;
    const read = (el: HTMLElement | null): Rect | null => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    };
    setSpots({ id: impact.id, player: read(playerRef.current), enemy: read(enemyRef.current) });
  }, [impact, playerRef, enemyRef]);

  useEffect(() => {
    if (!impact || reduced || impact.id === firstId.current || !SHAKE_KINDS.has(impact.kind)) return;
    shake(impact);
  }, [impact, reduced]);

  const burst = useMemo(() => {
    if (!impact) return null;
    const r = rng(impact.id);
    const hurt = HURT_KINDS.has(impact.kind);
    const big = impact.kind === 'crit' || impact.kind === 'death' || impact.kind === 'kill';
    const splats: Splat[] = [];
    if (impact.side === 'player' && hurt) {
      const n = big ? 6 : 3;
      for (let i = 0; i < n; i++) splats.push(makeSplat(r, Math.floor(r() * 4)));
    }
    const droplets = hurt ? makeDroplets(r, big ? 18 : 10, big ? 70 : 48) : [];
    return { hurt, big, splats, droplets, slashAngle: -35 + r() * 30 };
  }, [impact]);

  if (!impact || !burst || impact.id === doneId || spots.id !== impact.id) return null;

  const target = impact.side === 'player' ? spots.player : spots.enemy;
  const taken = impact.side === 'player';
  const dmg = Math.round(taken ? hp.dPlayer : hp.dEnemy);
  const label = WHIFF_KINDS.has(impact.kind)
    ? impact.kind === 'miss'
      ? labels.miss
      : impact.kind === 'dodge'
        ? labels.dodge
        : labels.block
    : burst.hurt && dmg > 0
      ? `-${dmg}`
      : null;
  const labelTone = WHIFF_KINDS.has(impact.kind)
    ? impact.kind === 'miss'
      ? 'combat-fx-label--miss'
      : 'combat-fx-label--guard'
    : taken
      ? 'combat-fx-label--taken'
      : burst.big
        ? 'combat-fx-label--crit'
        : 'combat-fx-label--dealt';

  return createPortal(
    <div
      key={impact.id}
      className={`combat-fx-layer ${reduced ? 'combat-fx-layer--still' : ''}`}
      aria-hidden
    >
      {/* Ends the burst: when this runs out, the whole subtree unmounts. */}
      <div
        className="combat-fx-life"
        style={{ animationDuration: `${lifeMs(impact)}ms` }}
        onAnimationEnd={() => setDoneId(impact.id)}
      />

      {taken && burst.hurt && (
        <div className={`combat-fx-vignette ${burst.big ? 'combat-fx-vignette--big' : ''}`} />
      )}

      {burst.splats.map((s, i) => (
        <svg
          key={i}
          className="combat-fx-splat"
          viewBox="0 0 100 100"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}ms`,
            ['--rot' as string]: `${s.rot}deg`,
          }}
        >
          {s.streaks.map((k, j) => (
            <ellipse key={`s${j}`} cx={k.cx} cy={k.cy} rx={k.rx} ry={k.ry} transform={`rotate(${k.a} ${k.cx} ${k.cy})`} />
          ))}
          {s.dots.map((d, j) => (
            <circle key={j} cx={d.cx} cy={d.cy} r={d.r} />
          ))}
        </svg>
      ))}

      {target && (
        <div
          className="combat-fx-spot"
          style={{ left: target.x + target.w / 2, top: target.y + target.h / 2 }}
        >
          {burst.hurt && <div className={`combat-fx-flash ${taken ? 'combat-fx-flash--taken' : ''}`} style={{ width: target.w, height: target.h }} />}
          {burst.hurt && !reduced && (
            <div className="combat-fx-slash" style={{ ['--a' as string]: `${burst.slashAngle}deg` }} />
          )}
          {burst.hurt &&
            !reduced &&
            burst.droplets.map((d, i) => (
              <span
                key={i}
                className="combat-fx-drop"
                style={{
                  width: d.s,
                  height: d.s,
                  animationDelay: `${d.delay}ms`,
                  ['--dx' as string]: `${d.dx.toFixed(1)}px`,
                  ['--dy' as string]: `${d.dy.toFixed(1)}px`,
                }}
              />
            ))}
          {WHIFF_KINDS.has(impact.kind) && !reduced && (
            <div className={`combat-fx-whiff ${impact.kind === 'block' ? 'combat-fx-whiff--block' : ''}`} />
          )}
          {label && (
            <div className={`combat-fx-label ${labelTone}`} style={{ top: -target.h / 2 - 14 }}>
              {impact.kind === 'crit' && <span className="combat-fx-label-tag">{labels.crit}</span>}
              {label}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
