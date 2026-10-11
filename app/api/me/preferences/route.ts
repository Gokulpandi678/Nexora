import { NextResponse } from 'next/server'
import { parseJson, route } from '@/lib/api'
import { prisma } from '@/lib/db'
import { sessionOrThrow } from '@/lib/organizations'
import { DEFAULT_PREFERENCES, parsePreferences, preferencesPatchSchema, type Preferences } from '@/lib/preferences'

/** GET /api/me/preferences — the account's preferences (defaults filled in) and whether any were ever saved. */
export const GET = route('me.preferences.get', async () => {
  const session = await sessionOrThrow()
  return NextResponse.json({ preferences: session.preferences ?? { ...DEFAULT_PREFERENCES }, saved: session.preferences !== null })
}, { members: false })

/**
 * PATCH /api/me/preferences — change any subset (theme, uiStyle, sidebarCollapsed, incidentView).
 * Merged onto what is saved, so two devices changing different preferences do not undo each other.
 */
export const PATCH = route('me.preferences.update', async req => {
  const session = await sessionOrThrow()
  const patch = await parseJson(req, preferencesPatchSchema)
  const current = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { preferences: true } })
  const preferences: Preferences = { ...parsePreferences(current.preferences), ...patch }
  await prisma.user.update({ where: { id: session.user.id }, data: { preferences: { ...preferences } } })
  return NextResponse.json({ preferences, saved: true })
}, { members: false })
