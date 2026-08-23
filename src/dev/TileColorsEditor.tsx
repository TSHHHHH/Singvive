import {
  TILE_COLOR_KEYS,
  TILE_COLOR_LABELS,
  type ItemTileColors,
  type TileColorKey,
} from '../game/itemTileColor';
import { tip } from '../components/tips';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

type Props = {
  colors: ItemTileColors;
  onChange: (next: ItemTileColors) => void;
};

function TileSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded"
      style={{
        background: `${hex}66`,
        boxShadow: `inset 0 0 0 1px ${hex}`,
      }}
      aria-hidden
    />
  );
}

export function TileColorsEditor({ colors, onChange }: Props) {
  const setKey = (key: TileColorKey, value: string) => {
    onChange({ ...colors, [key]: value });
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <p className="mb-4 max-w-xl text-sm text-white/50">
        Inventory tile backgrounds are tinted by category — not per item. Slotted
        non-weapons (armour, bags, etc.) use <span className="text-white/70">Gear</span>.
        Exotic gear still uses the amber ring.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {TILE_COLOR_KEYS.map((key) => (
          <div
            key={`preview-${key}`}
            className="flex h-9 w-9 items-center justify-center rounded text-2xs font-bold uppercase text-white/80"
            style={{
              background: `${colors[key]}66`,
              boxShadow: `inset 0 0 0 1px ${colors[key]}`,
            }}
            {...tip(TILE_COLOR_LABELS[key])}
          >
            {key.slice(0, 2)}
          </div>
        ))}
      </div>

      <ul className="mx-auto grid max-w-2xl gap-3">
        {TILE_COLOR_KEYS.map((key) => {
          const hex = colors[key];
          const valid = HEX_RE.test(hex);
          return (
            <li
              key={key}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5"
            >
              <TileSwatch hex={valid ? hex : '#7f8c8d'} />
              <div className="min-w-[10rem] flex-1">
                <div className="text-sm font-medium text-concrete-50">
                  {TILE_COLOR_LABELS[key]}
                </div>
                <div className="font-mono text-2xs text-white/35">{key}</div>
              </div>
              <input
                type="color"
                className="h-9 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
                value={valid ? hex : '#7f8c8d'}
                onChange={(e) => setKey(key, e.target.value.toLowerCase())}
                aria-label={`${key} color picker`}
              />
              <input
                className={`w-28 rounded border bg-black/40 px-2 py-1.5 font-mono text-xs text-concrete-50 ${
                  valid ? 'border-white/15' : 'border-hiss/60'
                }`}
                value={hex}
                onChange={(e) => setKey(key, e.target.value.trim())}
                spellCheck={false}
                aria-label={`${key} hex`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
