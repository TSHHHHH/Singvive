import { useGame } from './game/store';
import { Menu } from './screens/Menu';
import { CharacterCreate } from './screens/CharacterCreate';
import { SpawnSelect } from './screens/SpawnSelect';
import { GameScreen } from './screens/GameScreen';
import { DeathScreen } from './screens/DeathScreen';

export default function App() {
  const phase = useGame((s) => s.phase);

  return (
    <div className="h-full w-full overflow-hidden">
      {phase === 'menu' && <Menu />}
      {phase === 'character' && (
        <div className="h-full overflow-y-auto">
          <CharacterCreate />
        </div>
      )}
      {phase === 'spawn' && <SpawnSelect />}
      {/* Combat is an overlay panel inside the game screen — no phase switch. */}
      {phase === 'game' && <GameScreen />}
      {phase === 'death' && <DeathScreen />}
    </div>
  );
}
