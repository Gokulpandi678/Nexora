/**
 * Design tokens. CSS uses the same values through variables in app/globals.css;
 * this module is for places that need raw values (charts, emails).
 */
export const COLORS = {
  primary: '#0061FF',
  secondary: '#5E5DFF',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827'
  }
} as const

export const SPACING = {
  xs: '0.25rem', // 4px
  sm: '0.5rem', // 8px
  'sm+': '0.75rem', // 12px
  md: '1rem', // 16px
  lg: '1.5rem', // 24px
  xl: '2rem', // 32px
  '2xl': '3rem' // 48px
} as const

export const SHADOWS = {
  sm: '0 1px 2px 0 rgb(16 24 40 / 0.05)',
  md: '0 4px 6px -1px rgb(16 24 40 / 0.08), 0 2px 4px -2px rgb(16 24 40 / 0.06)',
  lg: '0 10px 15px -3px rgb(16 24 40 / 0.08), 0 4px 6px -4px rgb(16 24 40 / 0.05)'
} as const

export const TYPOGRAPHY = {
  display: { size: '1.5rem', weight: 700 },
  title: { size: '1.125rem', weight: 600 },
  body: { size: '0.875rem', weight: 400 },
  small: { size: '0.8125rem', weight: 400 },
  mono: { size: '0.75rem', weight: 500 }
} as const

/**
 * Chart colors. Brand blue and violet are too close to tell apart as two data series
 * (validated: ΔE 0.4 under protanopia), so charts use ONE brand hue for single-series data
 * and the reserved status palette — always with text labels — for severity.
 */
export const CHART = {
  light: { series: '#0061FF', grid: '#E5E7EB', axis: '#6B7280', text: '#374151', surface: '#FFFFFF' },
  dark: { series: '#4D8EFF', grid: '#293241', axis: '#949CAA', text: '#D1D5DB', surface: '#111620' },
  severity: { P1: '#D03B3B', P2: '#EC835A', P3: '#FAB219', P4: '#9CA3AF' },
  /** Sequential blue ramp for heatmaps, light → dark */
  sequential: ['#CDE2FB', '#9EC5F4', '#6DA7EC', '#3987E5', '#256ABF', '#184F95', '#0D366B']
} as const
