/**
 * Switchable UI styles. Each one is a full skin (palette, type, radius, depth, backdrop)
 * applied through `data-style` on <html>; the CSS lives in app/globals.css.
 */
export const UI_STYLES = ['aurora', 'command', 'paper', 'neo'] as const
export type UiStyle = (typeof UI_STYLES)[number]

export const DEFAULT_UI_STYLE: UiStyle = 'aurora'

export interface UiStyleMeta {
  id: UiStyle
  name: string
  tagline: string
  /** Swatches for the picker preview: background, surface, primary, accent */
  swatches: { light: [string, string, string, string]; dark: [string, string, string, string] }
}

export const UI_STYLE_META: Record<UiStyle, UiStyleMeta> = {
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    tagline: 'Frosted glass, soft gradients, calm focus',
    swatches: { light: ['#F6F6FB', '#FFFFFF', '#6340FF', '#EC4899'], dark: ['#090816', '#141228', '#9278FF', '#F472B6'] }
  },
  command: {
    id: 'command',
    name: 'Command',
    tagline: 'Mission-control console for on-call nights',
    swatches: { light: ['#F1F4F2', '#FCFDFC', '#05965A', '#B46E00'], dark: ['#070A09', '#0D1210', '#22E68C', '#FABE28'] }
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    tagline: 'Editorial serif, warm paper, zero noise',
    swatches: { light: ['#FAF7F0', '#FFFDF8', '#C2410C', '#1E4078'], dark: ['#181614', '#201D1B', '#FB925A', '#93B4E6'] }
  },
  neo: {
    id: 'neo',
    name: 'Neo',
    tagline: 'Bold neo-brutalist blocks and hard shadows',
    swatches: { light: ['#FFF6D6', '#FFFFFF', '#E62864', '#2563EB'], dark: ['#121212', '#1C1C1C', '#FF5C8D', '#60A5FA'] }
  }
}

export const isUiStyle = (value: unknown): value is UiStyle =>
  typeof value === 'string' && (UI_STYLES as readonly string[]).includes(value)
