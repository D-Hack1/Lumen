// Owner: Abhinav
// Vite build configuration (+ Vitest unit-test settings).
// PWA: Nived's pwa.config.ts supplies the offline-caching options (wired in below; disabled under Vitest).
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { pwaOptions, type LumenDataMode } from './pwa.config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const dataMode: LumenDataMode = env.VITE_LUMEN_DATA === 'real' ? 'real' : 'mock';
  return {
    plugins: [react(), ...(process.env.VITEST ? [] : [VitePWA(pwaOptions(dataMode))])],
    server: { port: 5173 },
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      environment: 'node',
    },
  };
});
