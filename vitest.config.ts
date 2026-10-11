import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Integration tests run against a real Postgres. Locally: `npm run db:up` (docker compose) provides it.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/incident_tracker_test'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Throws outside React Server Components; route handlers under test import it indirectly
      'server-only': path.resolve(__dirname, '__tests__/setup/server-only.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.{ts,tsx}'],
    globalSetup: ['__tests__/setup/global-setup.ts'],
    setupFiles: ['__tests__/setup/setup.ts'],
    // Integration tests share one database, so files run one at a time
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      NODE_ENV: 'test',
      RESEND_API_KEY: '',
      ONCALL_EMAIL: 'oncall@example.com',
      APP_URL: 'http://localhost:3000'
    }
  }
})
