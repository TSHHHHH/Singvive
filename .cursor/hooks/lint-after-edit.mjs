#!/usr/bin/env node
/**
 * afterFileEdit — run oxlint when a TypeScript file was edited.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  input = '{}';
}

let filePath = '';
try {
  const parsed = JSON.parse(input);
  filePath = parsed.file_path ?? parsed.path ?? '';
} catch {
  filePath = '';
}

if (!/\.tsx?$/.test(filePath)) {
  process.exit(0);
}

const result = spawnSync('npx', ['oxlint'], {
  shell: true,
  stdio: 'inherit',
  cwd: process.cwd(),
});

process.exit(result.status ?? 0);
