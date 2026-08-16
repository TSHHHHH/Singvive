import { Icon } from '../icons/Icon';

/**
 * The teardrop player pin used on the world map. Same CSS (`.player-pin`) so
 * HDB cutaway and Leaflet share one look.
 */
export function PlayerPin({
  size = 'md',
  className = '',
}: {
  /** `xs` = legend-row glyph; `sm` = HDB cutaway; `md` = world map. */
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const glyph = size === 'xs' ? 8 : size === 'sm' ? 14 : 16;
  const sizeCls =
    size === 'xs' ? 'player-pin--xs' : size === 'sm' ? 'player-pin--sm' : '';
  return (
    <div className={`player-pin ${sizeCls} ${className}`} aria-hidden>
      <div className="player-pin__body">
        <div className="player-pin__glyph text-[#e8e5dd]">
          <Icon name="combat.player" size={glyph} />
        </div>
      </div>
      <div className="player-pin__ground" />
    </div>
  );
}
