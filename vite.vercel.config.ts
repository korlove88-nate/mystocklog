import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Browser-only Vite build for Vercel. The current `vite.config.ts` remains
 * unchanged so the existing Codex Sites deployment can stay online as a
 * rollback target during the migration.
 */
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist-vercel', emptyOutDir: true },
})
