import { lazy, Suspense, useEffect } from 'react';
import { useGame } from './game/store';
import { FONT_SIZE_PX, useSetting } from './game/settings';
import { isLocaleId, DEFAULT_LOCALE } from './i18n';
import { Menu } from './screens/Menu';
import { TipLayer } from './components/tips';
import { flushPersist } from './game/persistRun';
import { DevToolsMenu } from './dev/DevToolsMenu';
import { DevLootBrowser } from './dev/LootBrowser';
import { DevEnemyBrowser } from './dev/EnemyBrowser';
import { DevIconBrowser } from './dev/IconBrowser';
import { DevLocaleEditor } from './dev/LocaleEditor';

// Leaflet stays out of the menu chunk. Do not statically import spawn/game
// screens here — that pulls the map into first paint.
const CharacterCreate = lazy(() =>
  import('./screens/CharacterCreate').then((m) => ({ default: m.CharacterCreate })),
);
const SpawnSelect = lazy(() =>
  import('./screens/SpawnSelect').then((m) => ({ default: m.SpawnSelect })),
);
const GameScreen = lazy(() =>
  import('./screens/GameScreen').then((m) => ({ default: m.GameScreen })),
);
const DeathScreen = lazy(() =>
  import('./screens/DeathScreen').then((m) => ({ default: m.DeathScreen })),
);

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

function PersistFlush() {
  useEffect(() => {
    const onHide = () => flushPersist();
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, []);
  return null;
}

function ScreenFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-concrete-950 text-sm text-white/40">
      Loading…
    </div>
  );
}

export default function App() {
  const phase = useGame((s) => s.phase);

  return (
    <div className="h-full w-full overflow-hidden">
      <FontSizeSync />
      <LocaleSync />
      <PersistFlush />
      <TipLayer />
      {phase === 'menu' && <Menu />}
      <Suspense fallback={<ScreenFallback />}>
        {phase === 'character' && (
          <div className="h-full overflow-y-auto">
            <CharacterCreate />
          </div>
        )}
        {phase === 'spawn' && <SpawnSelect />}
        {/* Combat is an overlay panel inside the game screen — no phase switch. */}
        {phase === 'game' && <GameScreen />}
        {phase === 'death' && <DeathScreen />}
      </Suspense>
      {import.meta.env.DEV && <DevToolsMenu />}
      {import.meta.env.DEV && <DevLootBrowser />}
      {import.meta.env.DEV && <DevEnemyBrowser />}
      {import.meta.env.DEV && <DevIconBrowser />}
      {import.meta.env.DEV && <DevLocaleEditor />}
    </div>
  );
}
