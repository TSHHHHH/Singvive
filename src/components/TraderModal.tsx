import { useGame } from '../game/store';
import { itemDef } from '../game/loot';
import { Icon } from '../icons/Icon';
import { FACTION_CONFIG, standingLabel, STANDING_KIN } from '../game/factions';
import type { TradeOffer } from '../game/trade';

/**
 * The counter at a faction hub (outpost or territory site that offers trade).
 *
 * Deliberately not a shop. There is no currency, no running total and no
 * haggling — just the handful of swaps this faction chalked up today, each one
 * take-it-or-leave-it and each one gone once taken. The interesting question is
 * "is this worth the walk and the shelf space", and the UI should ask exactly
 * that and nothing else.
 */
export function TraderModal() {
  const trader = useGame((s) => s.trader);
  const items = useGame((s) => s.items);
  const standing = useGame((s) => s.factionStanding);
  const closeTrader = useGame((s) => s.closeTrader);
  const acceptTrade = useGame((s) => s.acceptTrade);
  if (!trader) return null;

  const cfg = FACTION_CONFIG[trader.factionId];
  const rep = standing[trader.factionId];

  const held = (defId: string) =>
    items
      .filter((i) => i.container === 'backpack' && i.defId === defId)
      .reduce((n, i) => n + i.stack, 0);

  return (
    <div
      className="absolute inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4"
      onClick={closeTrader}
    >
      <div
        className="flex max-h-[88%] w-full max-w-lg flex-col rounded-xl border bg-concrete-900 shadow-signage"
        style={{ borderColor: `${cfg.color}55` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/10 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: cfg.color }}>
              <Icon name={cfg.icon} /> {cfg.shortName} {cfg.outpostName}
            </h3>
            <button onClick={closeTrader} className="text-xs text-white/40 hover:text-white/70">
              ✕ close
            </button>
          </div>
          <p className="mt-2 text-xs italic text-white/50">{trader.greeting}</p>
          <div className="mt-2 flex items-center gap-2 text-2xs uppercase tracking-wide">
            <span className="rounded px-1.5 py-0.5" style={{ background: `${cfg.color}22`, color: cfg.color }}>
              {standingLabel(rep)} {rep > 0 ? `+${rep}` : rep}
            </span>
            {rep < STANDING_KIN && (
              <span className="text-white/30">
                they keep better stock back for their own
              </span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {trader.offers.length === 0 ? (
            <p className="p-4 text-center text-sm text-white/30">
              The board is bare today. Come back tomorrow.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {trader.offers.map((o) => (
                <OfferRow
                  key={o.id}
                  offer={o}
                  color={cfg.color}
                  taken={trader.taken.includes(o.id)}
                  held={held(o.wantDefId)}
                  onAccept={() => acceptTrade(o.id)}
                />
              ))}
            </ul>
          )}
        </div>

        <p className="shrink-0 border-t border-white/10 px-4 py-2 text-2xs text-white/30">
          The board turns over at dawn. What's gone is gone.
        </p>
      </div>
    </div>
  );
}

function OfferRow({
  offer,
  color,
  taken,
  held,
  onAccept,
}: {
  offer: TradeOffer;
  color: string;
  taken: boolean;
  /** How many of the asking price you're actually carrying. */
  held: number;
  onAccept: () => void;
}) {
  const want = itemDef(offer.wantDefId);
  const give = itemDef(offer.giveDefId);
  const afford = held >= offer.wantCount;

  return (
    <li
      className={`rounded-lg border p-2.5 ${
        taken ? 'border-white/5 opacity-40' : 'border-white/10'
      }`}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-white/70">
          {offer.wantCount}× {want.name}
        </span>
        <span className="shrink-0 text-white/30">→</span>
        <span className="min-w-0 flex-1 truncate text-right font-semibold" style={{ color }}>
          {offer.giveCount}× {give.name}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {/* What you're carrying, so the decision doesn't need a trip to the
            inventory panel and back. */}
        <span className={`text-2xs ${afford ? 'text-white/40' : 'text-hiss'}`}>
          carrying {held}
        </span>
        <button
          disabled={taken || !afford}
          onClick={onAccept}
          className="rounded px-3 py-1 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
          style={taken || !afford ? undefined : { background: color }}
        >
          {taken ? 'taken' : afford ? 'Trade' : 'Short'}
        </button>
      </div>
    </li>
  );
}
