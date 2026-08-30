import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts: the app config pulls in the
// Cloudflare Workers plugin, which needs wrangler bindings that have no
// place in a unit-test run over pure game logic.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
