import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { lootDevApi } from './vite.loot-dev-api.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // itch.io serves the zip from a subpath, so asset URLs must be relative.
  // That build is static: no Worker, no D1. The Workers deploy stays `npm run build`.
  const itch = mode === 'itch';
  return {
    base: itch ? './' : '/',
    plugins: [react(), lootDevApi(), ...(itch ? [] : [cloudflare()])],
    // Honour PORT so two dev servers can run side by side; 5190 stays the default.
    server: { port: Number(process.env.PORT) || 5190 },
    build: {
      outDir: itch ? 'dist-itch' : 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/leaflet') || id.includes('react-leaflet')) {
              return 'leaflet';
            }
          },
        },
      },
    },
  };
})
