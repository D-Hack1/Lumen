// Owner: Abhinav
// Vite build configuration (+ Vitest unit-test settings).
// PWA: Nived's pwa.config.ts is still a comment-only stub (no export) — wire it in here once it exports a config.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
