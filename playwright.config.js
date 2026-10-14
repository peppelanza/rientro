// End-to-end tests (npm run e2e): real browsers on the site of e2e/server.js (its own database,
// launched, no email). A computer and a phone each run every test.
import { defineConfig, devices } from '@playwright/test';

// E2E_PORT: another port for a second site (e.g. with Turnstile's test keys, npm run e2e:turnstile)
const PORT = process.env.E2E_PORT || '3020';

export default defineConfig({
  testDir: 'e2e/tests',
  globalSetup: './e2e/setup.js',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'data/e2e-report' }]],
  outputDir: 'data/e2e-results',
  use: { baseURL: `http://localhost:${PORT}`, extraHTTPHeaders: { 'x-requested-with': 'rientro' }, locale: 'it-IT', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'computer', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    { name: 'telefono', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'node --experimental-sqlite --no-warnings=ExperimentalWarning e2e/server.js', url: `http://localhost:${PORT}/healthz`, reuseExistingServer: true, timeout: 30_000 },
});
