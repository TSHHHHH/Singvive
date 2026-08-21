import { useEffect } from 'react';
import { useGame } from './game/store';
import { FONT_SIZE_PX, useSetting } from './game/settings';
import { isLocaleId, DEFAULT_LOCALE } from './i18n';
import { Menu } from './screens/Menu';
import { CharacterCreate } from './screens/CharacterCreate';
import { SpawnSelect } from './screens/SpawnSelect';
import { GameScreen } from './screens/GameScreen';
import { DeathScreen } from './screens/DeathScreen';
import { DevToolsMenu } from './dev/DevToolsMenu';
import { DevLootBrowser } from './dev/LootBrowser';
import { DevEnemyBrowser } from './dev/EnemyBrowser';
import { DevIconBrowser } from './dev/IconBrowser';
import { DevLocaleEditor } from './dev/LocaleEditor';

function FontSizeSync() {
  const fontSize = useSetting('fontSize');
  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_PX[fontSize] ?? FONT_SIZE_PX.md;
  }, [fontSize]);
  return null;
}

function LocaleSync() {
  const language = useSetting('language');
  useEffect(() => {
    const locale = isLocaleId(language) ? language : DEFAULT_LOCALE;
    document.documentElement.lang = locale === 'zh-Hans' ? 'zh-Hans' : 'en';
    document.documentElement.dataset.locale = locale;
  }, [language]);
  return null;
}

export default function App() {
  const phase = useGame((s) => s.phase);

  return (
    <div className="h-full w-full overflow-hidden">
      <FontSizeSync />
      <LocaleSync />
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
      {import.meta.env.DEV && <DevToolsMenu />}
      {import.meta.env.DEV && <DevLootBrowser />}
      {import.meta.env.DEV && <DevEnemyBrowser />}
      {import.meta.env.DEV && <DevIconBrowser />}
      {import.meta.env.DEV && <DevLocaleEditor />}
    </div>
  );
}
