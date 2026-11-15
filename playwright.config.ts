import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `vite preview`, so what
 * passes here is what ships. Port 4350 is unique to this lab across the fleet
 * (never the Vite default 4173); `node tools/port-sync.js` in the catalog repo
 * pins it in tools/playwright-ports.json.
 *
 * `webServer.command` BUILDS before serving: `vite preview` only serves what is
 * already in dist/, so without the build a failing compile would quietly serve
 * the previous good bundle and the suite would pass against stale code.
 */
export default defineConfig({
  testDir: './e2e',
  // Marker coverage is a RUNTIME rule, not a scan of spec source: globalSetup
  // clears the observation sink and globalTeardown fails the run if any recorded
  // §4.1c kill never executed its assertion. Deleting either line turns that off,
  // which is why the teardown treats a MISSING sink as a failure.
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4350/crypto-lab-noisy-parity/',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4350 --strictPort',
    url: 'http://localhost:4350/crypto-lab-noisy-parity/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
