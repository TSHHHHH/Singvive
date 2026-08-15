import { Icon } from '../icons/Icon';

/**
 * The teardrop player pin used on the world map. Same CSS (`.player-pin`) so
 * HDB cutaway and Leaflet share one look.
 */
export function PlayerPin({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  const glyph = size === 'sm' ? 14 : 16;
  return (
    <div
      className={`player-pin ${size === 'sm' ? 'player-pin--sm' : ''} ${className}`}
      aria-hidden
    >
      <div className="player-pin__body">
        <div className="player-pin__glyph text-[#e8e5dd]">
          <Icon name="combat.player" size={glyph} />
        </div>
      </div>
      <div className="player-pin__ground" />
    </div>
  );
}
