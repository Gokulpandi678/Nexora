import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import AppProviders from '@/components/AppProviders'
import { DEFAULT_UI_STYLE, UI_STYLES } from '@/lib/ui-styles'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk', display: 'swap' })
const serif = Fraunces({ subsets: ['latin'], variable: '--font-serif', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Nexora — incident intelligence for teams', template: '%s · Nexora' },
  description: 'Nexora matches every new incident to the ones your team already solved, by meaning — so the second occurrence takes minutes, not hours.',
  applicationName: 'Nexora'
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F6FB' },
    { media: '(prefers-color-scheme: dark)', color: '#090816' }
  ]
}

// Applies the saved theme and UI style before first paint so there is no flash
const themeScript = `(function(){var e=document.documentElement;e.setAttribute('data-style','${DEFAULT_UI_STYLE}');try{var s=JSON.parse(localStorage.getItem('nexora-user')||'{}').state||{};var t=s.theme||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);e.classList.toggle('dark',d);if(${JSON.stringify(UI_STYLES)}.indexOf(s.uiStyle)>=0)e.setAttribute('data-style',s.uiStyle)}catch(x){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${grotesk.variable} ${serif.variable}`}
      data-style={DEFAULT_UI_STYLE} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
