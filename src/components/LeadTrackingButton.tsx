import { useGame } from '../game/store';
import { useT } from '../i18n';

export function LeadTrackingButton({ id, onFocusMap }: {
  id: string;
  onFocusMap?: (lat: number, lng: number) => void;
}) {
  const lead = useGame(s => s.explorationLeads.find(l => l.id === id));
  const { t } = useT();
  if (!lead || lead.completedDay !== undefined) return null;

  const toggle = () => {
    const game = useGame.getState();
    const target = game.locations[lead.targetId];
    if (!target) return;
    game.trackLead(lead.tracked ? null : lead.id);
    if (!lead.tracked) onFocusMap?.(target.lat, target.lng);
  };
  return (
    <button type="button" aria-pressed={!!lead.tracked} onClick={toggle}
      className="mt-1 rounded border border-signal/40 bg-signal/10 px-2 py-1 text-label text-signal hover:bg-signal/20">
      {t(lead.tracked ? 'ui.exploration.untrack' : 'ui.exploration.track')}
    </button>
  );
}
