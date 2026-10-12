import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { request, type FullConfig } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

/** The signed-in user every test runs as: an admin (so admin and QA-verify flows are reachable). */
export const E2E_ADMIN = { name: 'E2E Admin', email: 'e2e-admin@example.com', department: 'SRE' }
export const STORAGE_STATE = 'e2e/.auth/admin.json'

/**
 * Prepares the database and signs in once, through the test-only route (lib/e2e-auth.ts):
 * an organization with an onboarded admin, and the seeded incidents (npm run db:seed) moved into it.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const secret = process.env.E2E_AUTH_SECRET
  if (!secret || secret.length < 32) throw new Error('Set E2E_AUTH_SECRET (32+ characters) for end-to-end runs; see .env.example')
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3100'

  const prisma = new PrismaClient()
  try {
    const org = await prisma.organization.upsert({
      where: { slug: 'e2e-cloud' },
      update: { suspendedAt: null },
      create: { name: 'E2E Cloud', slug: 'e2e-cloud' }
    })
    const user = await prisma.user.upsert({
      where: { email: E2E_ADMIN.email },
      update: { name: E2E_ADMIN.name, department: E2E_ADMIN.department, onboardedAt: new Date() },
      create: { workosId: `e2e_${E2E_ADMIN.email}`, ...E2E_ADMIN, onboardedAt: new Date() }
    })
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
      update: { status: 'ACTIVE', role: 'ADMIN' },
      create: { userId: user.id, organizationId: org.id, status: 'ACTIVE', role: 'ADMIN', position: 'TEAM_LEAD' }
    })
    // Seeded incidents belong to no organization; give them to this one so search and matching have history
    await prisma.incident.updateMany({ where: { organizationId: null }, data: { organizationId: org.id } })
  } finally {
    await prisma.$disconnect()
  }

  const api = await request.newContext({ baseURL })
  try {
    // The dev server may still be compiling its first routes
    const deadline = Date.now() + 180_000
    while (!(await api.get('/api/health').then(r => r.ok(), () => false))) {
      if (Date.now() > deadline) throw new Error(`${baseURL} did not become healthy`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    const res = await api.post('/api/e2e/login', { data: { email: E2E_ADMIN.email, secret } })
    if (!res.ok()) {
      throw new Error(`Test sign-in failed (${res.status()}): ${await res.text()}. ` +
        'It only works against a dev server (not a production build) started with the same E2E_AUTH_SECRET.')
    }
    mkdirSync(dirname(STORAGE_STATE), { recursive: true })
    await api.storageState({ path: STORAGE_STATE })
  } finally {
    await api.dispose()
  }
}
