import { execSync } from 'node:child_process'

/** Brings the test database schema up to date once per run. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/incident_tracker_test'
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe'
  })
}
