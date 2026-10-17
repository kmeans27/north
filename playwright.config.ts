import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      // Chromium mobile emulation at the spec viewport (04-ux.md §2).
      // WebKit needs system libraries this environment lacks; the layout
      // assertions only need a 390 × 844 touch viewport.
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true
      }
    }
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port ' + PORT,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
