import { useGame } from './game/store';
import { Menu } from './screens/Menu';
import { CharacterCreate } from './screens/CharacterCreate';
import { SpawnSelect } from './screens/SpawnSelect';
import { GameScreen } from './screens/GameScreen';
import { CombatScreen } from './screens/CombatScreen';
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
      {phase === 'game' && <GameScreen />}
      {phase === 'combat' && (
        <div className="h-full overflow-y-auto">
          <CombatScreen />
        </div>
      )}
      {phase === 'death' && <DeathScreen />}
    </div>
  );
}
