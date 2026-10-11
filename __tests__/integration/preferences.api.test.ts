import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { GET as getPreferences, PATCH as patchPreferences } from '@/app/api/me/preferences/route'
import { loadSession } from '@/lib/session'
import { DEFAULT_PREFERENCES } from '@/lib/preferences'
import { createUser, json, noParams, req, resetDb } from '../setup/helpers'

/* Preferences saved on the account, read back through the session with per-field fallbacks. */

const auth = vi.hoisted(() => ({ userId: null as string | null }))
vi.mock('@workos-inc/authkit-nextjs', () => ({ withAuth: vi.fn(async () => ({ user: null })) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }))
vi.mock('@/lib/session', async importOriginal => {
  const mod = await importOriginal<typeof import('@/lib/session')>()
  return { ...mod, getSession: vi.fn(async () => (auth.userId ? mod.loadSession(auth.userId, null) : null)) }
})

type Body = { preferences: typeof DEFAULT_PREFERENCES; saved: boolean }
let user: { id: string }

beforeEach(async () => {
  await resetDb()
  user = await createUser({ name: 'Pat Prefs', email: 'pat@example.test' })
  auth.userId = user.id
})

const get = async (): Promise<Body> => json<Body>(await getPreferences(req('GET', '/api/me/preferences'), noParams))
const patch = (body: unknown): Promise<Response> => patchPreferences(req('PATCH', '/api/me/preferences', body), noParams)

describe('/api/me/preferences', () => {
  it('starts with the defaults and reports that nothing was saved yet', async () => {
    expect(await get()).toEqual({ preferences: DEFAULT_PREFERENCES, saved: false })
    expect((await loadSession(user.id, null)).preferences).toBeNull()
  })

  it('saves a subset and merges later changes, so devices do not undo each other', async () => {
    expect((await patch({ theme: 'dark' })).status).toBe(200)
    expect((await patch({ incidentView: 'board' })).status).toBe(200)
    const expected = { ...DEFAULT_PREFERENCES, theme: 'dark', incidentView: 'board' }
    expect(await get()).toEqual({ preferences: expected, saved: true })
    expect((await loadSession(user.id, null)).preferences).toEqual(expected)
  })

  it('rejects invalid values and unknown fields without touching what is saved', async () => {
    await patch({ theme: 'light' })
    expect((await patch({ theme: 'sepia' })).status).toBe(400)
    expect((await patch({ isSuperAdmin: true })).status).toBe(400)
    expect((await patch({})).status).toBe(400)
    expect((await get()).preferences.theme).toBe('light')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isSuperAdmin).toBe(false)
  })

  it('reads a corrupted saved value with per-field fallbacks instead of failing', async () => {
    await prisma.user.update({ where: { id: user.id }, data: { preferences: { theme: 'dark', uiStyle: 7, extra: 'x' } } })
    expect((await get()).preferences).toEqual({ ...DEFAULT_PREFERENCES, theme: 'dark' })
    expect((await patch({ sidebarCollapsed: true })).status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).preferences)
      .toEqual({ ...DEFAULT_PREFERENCES, theme: 'dark', sidebarCollapsed: true })
  })

  it('requires a signed-in user', async () => {
    auth.userId = null
    expect((await getPreferences(req('GET', '/api/me/preferences'), noParams)).status).toBe(401)
    expect((await patch({ theme: 'dark' })).status).toBe(401)
  })
})
