// Owner: Abhinav
// Playwright config for web/e2e. Run from web/: `npm run e2e`.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: '..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
