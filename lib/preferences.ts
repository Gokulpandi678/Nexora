import { z } from 'zod'
import { DEFAULT_UI_STYLE, UI_STYLES } from '@/lib/ui-styles'

/*
 * User preferences, saved on the account (User.preferences) so they follow the user to any browser or
 * device, and cached in localStorage so pages paint instantly. The defaults below are the safety net:
 * anything missing, malformed or unknown falls back field by field, so preferences can never stop a
 * page from rendering.
 */

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const INCIDENT_VIEWS = ['table', 'cards', 'board'] as const
export type IncidentView = (typeof INCIDENT_VIEWS)[number]

export interface Preferences {
  theme: Theme
  uiStyle: (typeof UI_STYLES)[number]
  sidebarCollapsed: boolean
  incidentView: IncidentView
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  theme: 'system',
  uiStyle: DEFAULT_UI_STYLE,
  sidebarCollapsed: false,
  incidentView: 'table'
})

export const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]

/** Every field falls back to its default on its own, so one bad value never discards the rest. */
const lenient = z.object({
  theme: z.enum(THEMES).catch(DEFAULT_PREFERENCES.theme),
  uiStyle: z.enum(UI_STYLES).catch(DEFAULT_PREFERENCES.uiStyle),
  sidebarCollapsed: z.boolean().catch(DEFAULT_PREFERENCES.sidebarCollapsed),
  incidentView: z.enum(INCIDENT_VIEWS).catch(DEFAULT_PREFERENCES.incidentView)
})

/** Never throws: any input (null, garbage, an old shape) becomes a complete, valid Preferences. */
export function parsePreferences(value: unknown): Preferences {
  const input = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return lenient.parse(input)
}

/** PATCH body: any subset of preferences, strictly validated (unknown keys are rejected). */
export const preferencesPatchSchema = z
  .object({
    theme: z.enum(THEMES),
    uiStyle: z.enum(UI_STYLES),
    sidebarCollapsed: z.boolean(),
    incidentView: z.enum(INCIDENT_VIEWS)
  })
  .partial()
  .strict()
  .refine(v => Object.keys(v).length > 0, 'Nothing to update')

export function pickPreferences(state: Preferences): Preferences {
  return { theme: state.theme, uiStyle: state.uiStyle, sidebarCollapsed: state.sidebarCollapsed, incidentView: state.incidentView }
}

/** The fields of `next` that differ from `base`. */
export function diffPreferences(base: Preferences, next: Preferences): Partial<Preferences> {
  const diff: Partial<Preferences> = {}
  for (const key of PREFERENCE_KEYS) {
    if (base[key] !== next[key]) (diff as Record<string, unknown>)[key] = next[key]
  }
  return diff
}
