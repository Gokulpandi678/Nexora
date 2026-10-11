import { execSync } from 'node:child_process'

/** Brings the test database schema up to date once per run. */
export default function setup(): void {
  // vitest.config.ts has already loaded .env and checked this is set
  const url = process.env.TEST_DATABASE_URL!
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe'
  })
}
