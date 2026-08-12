import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Honour PORT so two dev servers can run side by side; 5190 stays the default.
  server: { port: Number(process.env.PORT) || 5190 },
})
