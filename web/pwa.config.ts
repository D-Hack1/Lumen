// Owner: Nived
// Offline caching (Workbox via vite-plugin-pwa), imported by vite.config.ts.
// Goal (N-12): after the first load the whole app AND every data file works in airplane mode, with zero runtime
// network use. So the app shell and the active data folder are PRECACHED at install, not cached on first use.
import type { VitePWAOptions } from 'vite-plugin-pwa';

export type LumenDataMode = 'mock' | 'real';

/** Bump when the cache layout changes so old caches are dropped. */
export const DATA_CACHE = 'lumen-data-v1';

/** Largest precached file. Real ephem.bin is ~3.4 MB and dsn.bin ~1.3 MB; the Workbox default (2 MiB) would skip them. */
const MAX_FILE_BYTES = 16 * 1024 * 1024;

export function pwaOptions(dataMode: LumenDataMode = 'mock'): Partial<VitePWAOptions> {
  const dataDir = dataMode === 'real' ? 'data' : 'data-mock';
  return {
    registerType: 'autoUpdate',
    // Dev server: no service worker (it would cache stale modules while developing).
    devOptions: { enabled: false },
    includeAssets: [],
    manifest: {
      name: 'LUMEN · Lunar Mission ENvironment Navigator',
      short_name: 'LUMEN',
      description: 'Sun availability and Earth-communication windows at lunar landing sites. Works offline.',
      display: 'standalone',
      start_url: '.',
      background_color: '#0b0e14',
      theme_color: '#0b0e14',
    },
    workbox: {
      // App shell + only the data folder this build uses (never ship both sets offline).
      globPatterns: ['**/*.{js,css,html,woff2,svg,png}', `${dataDir}/**/*.{json,bin,png,svg}`, 'content/**/*.json'],
      globIgnores: dataMode === 'real' ? ['data-mock/**'] : ['data/**'],
      maximumFileSizeToCacheInBytes: MAX_FILE_BYTES,
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
      // Anything fetched later from the data folder that was not precached (e.g. a late tile) is cached once, then served offline.
      runtimeCaching: [
        {
          urlPattern: ({ url }) => url.pathname.includes(`/${dataDir}/`),
          handler: 'CacheFirst',
          options: { cacheName: DATA_CACHE, expiration: { maxEntries: 400 } },
        },
      ],
    },
  };
}
