import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

/** Colors are RGB triplets in CSS variables (app/globals.css) so light/dark swap in one place. */
const token = (name: string): string => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        surface: token('surface'),
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        subtle: token('subtle'),
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground'), soft: token('primary-soft') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground'), soft: token('secondary-soft') },
        success: { DEFAULT: token('success'), soft: token('success-soft'), foreground: token('success-foreground') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft'), foreground: token('warning-foreground') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft'), foreground: token('danger-foreground') },
        info: { DEFAULT: token('info'), soft: token('info-soft'), foreground: token('info-foreground') },
        accent: token('accent')
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        /** Per-style heading face (Space Grotesk / JetBrains Mono / Fraunces) */
        display: ['var(--font-display)']
      },
      /** Radius scales from one per-style token so every corner changes together */
      borderRadius: {
        '2xl': 'calc(var(--radius) * 1.5)',
        xl: 'calc(var(--radius) * 1.15)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) * 0.7)',
        sm: 'calc(var(--radius) * 0.45)'
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)'
      },
      keyframes: {
        'slide-in': { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'grow-x': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } }
      },
      animation: { 'slide-in': 'slide-in 0.2s ease-out', 'grow-x': 'grow-x 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both' }
    }
  },
  plugins: [animate]
}

export default config
