import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { lootDevApi } from './vite.loot-dev-api.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), lootDevApi()],
  // Honour PORT so two dev servers can run side by side; 5190 stays the default.
  server: { port: Number(process.env.PORT) || 5190 },
})
