import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl = process.env.E2E_BASE_URL
const baseURL = externalBaseUrl ?? 'http://localhost:3100'

export default defineConfig({
  testDir: 'e2e',
  // Creates the test organization and admin, then signs in through the test-only route (lib/e2e-auth.ts)
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    // Every test starts signed in as the admin from e2e/global-setup.ts
    storageState: 'e2e/.auth/admin.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Start the dev server only when no external server was given
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run dev -- -p 3100',
        url: `${baseURL}/api/health`,
        reuseExistingServer: true,
        timeout: 180_000
      }
})
