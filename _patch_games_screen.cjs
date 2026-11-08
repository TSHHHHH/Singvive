const fs = require('fs');
const p = 'd:/Projects/Singvive/src/screens/GameScreen.tsx';
let t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

if (!t.includes("import { SkillsPanel }")) {
  t = t.replace(
    "import { StatsPanel } from '../components/StatsPanel';\n",
    "import { StatsPanel } from '../components/StatsPanel';\nimport { SkillsPanel } from '../components/SkillsPanel';\n",
  );
}

t = t.replace(
  `type SidePanel = 'inventory' | 'craft' | 'logbook' | 'stats' | 'objective';

const SIDE_PANEL_ICONS: Record<SidePanel, IconName> = {
  inventory: 'action.inventory',
  craft: 'action.craft',
  logbook: 'action.logbook',
  stats: 'action.stats',
  objective: 'action.objectives',
};

/** Rail switchers — objectives opens from its own bar. */
const PANEL_BUTTONS: SidePanel[] = ['inventory', 'craft', 'logbook', 'stats'];

function sidePanelLabelKey(id: SidePanel): string {
  if (id === 'inventory') return 'ui.phone.stash';
  if (id === 'craft') return 'ui.phone.craft';
  if (id === 'logbook') return 'ui.phone.logbook';
  if (id === 'stats') return 'ui.phone.stats';
  return 'ui.phone.objectives';
}`,
  `type SidePanel = 'inventory' | 'craft' | 'logbook' | 'stats' | 'skills' | 'objective';

const SIDE_PANEL_ICONS: Record<SidePanel, IconName> = {
  inventory: 'action.inventory',
  craft: 'action.craft',
  logbook: 'action.logbook',
  stats: 'action.stats',
  skills: 'attr.wits',
  objective: 'action.objectives',
};

/** Rail switchers — objectives opens from its own bar. */
const PANEL_BUTTONS: SidePanel[] = ['inventory', 'craft', 'logbook', 'stats', 'skills'];

function sidePanelLabelKey(id: SidePanel): string {
  if (id === 'inventory') return 'ui.phone.stash';
  if (id === 'craft') return 'ui.phone.craft';
  if (id === 'logbook') return 'ui.phone.logbook';
  if (id === 'stats') return 'ui.phone.stats';
  if (id === 'skills') return 'ui.phone.skills';
  return 'ui.phone.objectives';
}`,
);

t = t.replace(
  `? PANEL_BUTTONS.filter((id) => id === 'logbook' || id === 'stats')`,
  `? PANEL_BUTTONS.filter((id) => id === 'logbook' || id === 'stats' || id === 'skills')`,
);

t = t.replace(
  `{sidePanel === 'stats' && <StatsPanel />}
            {sidePanel === 'objective' && (`,
  `{sidePanel === 'stats' && <StatsPanel />}
            {sidePanel === 'skills' && <SkillsPanel />}
            {sidePanel === 'objective' && (`,
);

fs.writeFileSync(p, t.replace(/\n/g, '\r\n'));
console.log('GameScreen patched');
