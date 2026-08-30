#!/usr/bin/env node
/**
 * beforeShellExecution — block npm run bake:* unless the user explicitly
 * requested a map-data bake (Overpass / data.gov.sg fetches are manual steps).
 */
import { readFileSync } from 'node:fs';

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  input = '';
}

let command = '';
try {
  command = JSON.parse(input).command ?? '';
} catch {
  command = '';
}

const isBake =
  /\bnpm\s+run\s+bake:[\w-]+/.test(command) ||
  /\bnpx\s+.*bake-(pois|mrt|zones|towns)/.test(command);

if (isBake) {
  console.log(
    JSON.stringify({
      permission: 'deny',
      user_message:
        'Bake scripts re-fetch map data and are manual, committed steps. Run only when you explicitly intend to update pois/mrt/zones/towns.',
      agent_message:
        'Blocked bake:* — AGENTS.md says do not run bake scripts during normal agent work. Ask the user to confirm before retrying.',
    }),
  );
  process.exit(0);
}

console.log(JSON.stringify({ permission: 'allow' }));
process.exit(0);
