import Link from 'next/link'
import {
  ArrowRight, BarChart3, Building2, CheckCircle2, ChevronDown, FileDown, GitMerge, LogIn, Menu, RotateCw,
  ShieldCheck, Sparkles, Timer, UserPlus, Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Logo from '@/components/Logo'
import {
  AnalyticsPreview, ApprovalToast, BrowserFrame, DashboardPreview, MatchPreview, MatchToast, OrganizationsPreview
} from '@/components/landing/previews'
import { cn } from '@/lib/utils'

const SIGN_UP = '/auth/sign-up'
const SIGN_IN = '/auth/sign-in'

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#product', label: 'Product' },
  { href: '#how', label: 'How it works' },
  { href: '#roles', label: 'Teams & roles' },
  { href: '#faq', label: 'FAQ' }
]

function Header(): React.JSX.Element {
  return (
    <header className="ui-chrome sticky top-0 z-30 border-b border-border/60 bg-surface/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Nexora home"><Logo sub={null} /></Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV.map(n => (
            <a key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 sm:flex md:ml-0">
          <Button asChild variant="ghost"><a href={SIGN_IN}>Sign in</a></Button>
          <Button asChild><a href={SIGN_UP}>Get started <ArrowRight aria-hidden="true" /></a></Button>
        </div>
        {/* Phones: one disclosure menu, no JavaScript needed */}
        <details className="group relative ml-auto sm:hidden">
          <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <Menu className="size-5" aria-hidden="true" />
          </summary>
          <div className="ui-card absolute right-0 top-12 flex w-60 flex-col gap-1 p-2 shadow-lg">
            {NAV.map(n => <a key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm hover:bg-muted">{n.label}</a>)}
            <hr className="my-1 border-border" />
            <Button asChild variant="outline"><a href={SIGN_IN}>Sign in</a></Button>
            <Button asChild><a href={SIGN_UP}>Get started</a></Button>
          </div>
        </details>
      </div>
    </header>
  )
}

function Hero(): React.JSX.Element {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <a href="#product" className="animate-rise mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft/70 px-3 py-1 text-xs font-medium text-info-foreground backdrop-blur">
          <Sparkles className="size-3.5" aria-hidden="true" /> New: matches incidents by meaning, not just keywords
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </a>
        <h1 className="animate-rise font-display-tight text-4xl font-bold leading-[1.05] sm:text-6xl [animation-delay:60ms]">
          Never solve the same<br className="hidden sm:block" /> incident <span className="text-gradient">twice</span>.
        </h1>
        <p className="animate-rise mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg [animation-delay:120ms]">
          Nexora remembers every incident your team has fixed. When something breaks, it finds the past incidents that
          look like it — even when they were described in different words — and puts the fix that worked in front of you.
        </p>
        <div className="animate-rise mt-8 flex flex-col gap-3 sm:flex-row [animation-delay:180ms]">
          <Button asChild size="lg" className="h-12 px-7 text-base"><a href={SIGN_UP}>Get started free <ArrowRight aria-hidden="true" /></a></Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base"><a href={SIGN_IN}><LogIn aria-hidden="true" /> Sign in</a></Button>
        </div>
        <p className="animate-rise mt-4 text-xs text-muted-foreground [animation-delay:240ms]">
          Setting up your company? Use the invitation link in your email.
        </p>
      </div>

      <div className="relative mx-auto mt-14 max-w-6xl [perspective:2000px]">
        <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[3rem] bg-gradient-to-b from-primary/20 via-secondary/10 to-transparent blur-3xl" aria-hidden="true" />
        <div className="animate-rise [animation-delay:300ms] lg:[transform:rotateX(8deg)] lg:transition-transform lg:duration-700 lg:hover:[transform:rotateX(0deg)]">
          <BrowserFrame path="/dashboard" label="The Nexora dashboard: open incidents, P1s, average time to resolve, recurring rate, recent incidents and a daily chart">
            <DashboardPreview />
          </BrowserFrame>
        </div>
        <MatchToast className="absolute -bottom-8 left-4 hidden animate-rise [animation-delay:700ms] md:block lg:-left-8" />
        <ApprovalToast className="absolute -right-6 top-16 hidden animate-rise [animation-delay:900ms] lg:flex" />
      </div>
    </section>
  )
}

const PILLARS = ['Keyword + meaning-based matching', 'Verified, reusable fixes', 'Multi-organization workspaces', 'PDF & CSV reports by email', 'SSO-ready sign-in']

function Pillars(): React.JSX.Element {
  return (
    <section aria-label="Highlights" className="border-y border-border/60 bg-surface/40 px-4 py-5 backdrop-blur">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-medium text-muted-foreground">
        {PILLARS.map(p => (
          <li key={p} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" aria-hidden="true" /> {p}</li>
        ))}
      </ul>
    </section>
  )
}

const FEATURES = [
  { Icon: Sparkles, title: 'Matching by meaning', body: '“DB pool exhausted” finds “connections stuck in Postgres”. Every report is compared with your history by keywords and by meaning.', wide: true },
  { Icon: RotateCw, title: 'Recurrence chains', body: 'Repeats group under the first occurrence, so you see what keeps coming back and how often.' },
  { Icon: ShieldCheck, title: 'Verified fixes', body: 'Fixes carry a 5-point QA checklist. Verified ones are suggested first, with their real success rate.' },
  { Icon: BarChart3, title: 'Analytics that matter', body: 'Time to resolve, recurring rate, busiest systems and top solvers — every chart with a table view.' },
  { Icon: Building2, title: 'One login, many organizations', body: 'Employer, clients, side projects. Switch in one click; incidents never mix between organizations.', wide: true },
  { Icon: FileDown, title: 'Reports in your inbox', body: 'Any filtered list as CSV or a PDF report — downloaded, or emailed to you with both attached.' }
]

function Features(): React.JSX.Element {
  return (
    <section id="features" className="scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Features" title="Everything your team learns, kept and put to work"
          lead="Most incidents are not new. Nexora makes sure the second time is the fast time." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, body, wide }) => (
            <div key={title} className={cn('ui-card ui-card-interactive group flex flex-col gap-3 p-6', wide && 'lg:col-span-2')}>
              <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 text-primary transition-transform group-hover:scale-110">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SectionHeading({ eyebrow, title, lead, align = 'center' }: { eyebrow: string; title: string; lead?: string; align?: 'center' | 'left' }): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-3', align === 'center' ? 'mx-auto max-w-2xl items-center text-center' : 'max-w-xl')}>
      <p className="eyebrow text-info-foreground">{eyebrow}</p>
      <h2 className="font-display-tight text-3xl font-bold sm:text-4xl">{title}</h2>
      {lead && <p className="text-base text-muted-foreground">{lead}</p>}
    </div>
  )
}

const SHOWCASE = [
  {
    eyebrow: 'Report → match',
    title: 'Report once. See what worked last time.',
    points: [
      'A guided report form with live checks keeps reports useful.',
      'Matches arrive the moment you submit, ranked by how similar they are.',
      'Mark it “same issue” and the original owner is notified automatically.'
    ],
    path: '/incidents/new',
    label: 'Matching results: a new P1 report with two similar past incidents, an 87% match labelled similar meaning with a verified fix, and a 64% match',
    Preview: MatchPreview
  },
  {
    eyebrow: 'Analytics',
    title: 'Know what keeps coming back — and fix it for good.',
    points: [
      'Daily volume, time to resolve and recurring rate at a glance.',
      'The incidents that recur most, with their average time to fix.',
      'A department × system heatmap shows where the pain lands.'
    ],
    path: '/analytics',
    label: 'Analytics: incidents per day for 14 days trending down, the top three recurring incidents, and a department by system heatmap',
    Preview: AnalyticsPreview
  },
  {
    eyebrow: 'Organizations',
    title: 'Every organization, cleanly separated.',
    points: [
      'Belong to several organizations with a different role in each.',
      'Admins approve who joins and choose what each person can do.',
      'Incidents, analytics and notifications follow the organization you pick.'
    ],
    path: '/admin/members',
    label: 'Organizations: a switcher listing three organizations with roles, and two join requests waiting for approval',
    Preview: OrganizationsPreview
  }
]

function Showcase(): React.JSX.Element {
  return (
    <section id="product" className="scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-24">
        {SHOWCASE.map(({ eyebrow, title, points, path, label, Preview }, n) => (
          <div key={title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={cn(n % 2 === 1 && 'lg:order-2')}>
              <SectionHeading eyebrow={eyebrow} title={title} align="left" />
              <ul className="mt-6 flex flex-col gap-3">
                {points.map(p => (
                  <li key={p} className="flex gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /> {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-primary/15 via-secondary/10 to-accent/10 blur-2xl" aria-hidden="true" />
              <BrowserFrame path={path} label={label}><Preview /></BrowserFrame>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const STEPS = [
  { Icon: UserPlus, title: 'Report', body: 'Describe what broke and its symptoms. Takes about two minutes.' },
  { Icon: Sparkles, title: 'Match', body: 'Nexora surfaces past incidents that mean the same thing, with the fixes that worked.' },
  { Icon: ShieldCheck, title: 'Fix & verify', body: 'Record the fix; a QA verifier signs it off so it is trusted next time.' },
  { Icon: Timer, title: 'Get faster', body: 'Recurrences resolve in minutes, and analytics show what to fix for good.' }
]

function HowItWorks(): React.JSX.Element {
  return (
    <section id="how" className="scroll-mt-20 border-y border-border/60 bg-surface/40 px-4 py-24 backdrop-blur sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="How it works" title="From “it’s down” to “we’ve seen this” in four steps" />
        <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ Icon, title, body }, n) => (
            <li key={title} className="relative flex flex-col gap-3">
              {n < STEPS.length - 1 && <span className="absolute left-14 top-6 hidden h-px w-[calc(100%-2rem)] bg-gradient-to-r from-primary/40 to-transparent lg:block" aria-hidden="true" />}
              <span className="brand-mark flex size-12 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="font-mono text-xs text-muted-foreground">Step {n + 1}</span>
              <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const ROLES = [
  {
    Icon: ShieldCheck,
    title: 'Platform admin',
    how: 'Configured by your Nexora operator',
    can: ['Invites organizations by email', 'Resends or revokes invitations', 'Sees every organization at a glance']
  },
  {
    Icon: Building2,
    title: 'Organization admin',
    how: 'Accepts an emailed invitation',
    can: ['Sets up the organization’s profile', 'Approves or declines join requests', 'Chooses each member’s role'],
    featured: true
  },
  {
    Icon: Users,
    title: 'Member',
    how: 'Signs up and asks to join',
    can: ['Reports and resolves incidents', 'Reuses verified fixes', 'Joins as many organizations as needed']
  }
]

function Roles(): React.JSX.Element {
  return (
    <section id="roles" className="scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Teams & roles" title="Built for how organizations actually work"
          lead="Organizations join by invitation. People ask to join, and the organization’s admin decides." />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {ROLES.map(({ Icon, title, how, can, featured }) => (
            <div key={title} className={cn('ui-card flex flex-col gap-4 p-6', featured && 'ring-2 ring-primary/40')}>
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-info-foreground"><Icon className="size-5" aria-hidden="true" /></span>
                <span>
                  <span className="block font-display text-lg font-semibold tracking-tight">{title}</span>
                  <span className="block text-xs text-muted-foreground">{how}</span>
                </span>
              </span>
              <ul className="flex flex-col gap-2">
                {can.map(c => <li key={c} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> {c}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const FAQ = [
  {
    q: 'How do I get my organization on Nexora?',
    a: 'Organizations join by invitation. Once invited, you get an email with a one-time link: sign up with that address, add your organization’s details, and you become its admin.'
  },
  {
    q: 'I want to join my team. What do I do?',
    a: 'Create an account, fill in a short profile, search for your organization and request to join. Its admin approves you, and you get an email when they do.'
  },
  {
    q: 'Can one person belong to several organizations?',
    a: 'Yes. Many people work for an employer, freelance clients and side projects at once. Each organization approves you separately and gives you its own role; switch between them from the header.'
  },
  {
    q: 'Is our data separated from other organizations?',
    a: 'Yes. Every incident belongs to one organization. Search, matching, analytics, notifications and exports only ever see the organization you are working in.'
  },
  {
    q: 'How does “matching by meaning” work?',
    a: 'Each incident is turned into a semantic fingerprint by an embeddings model. New reports are compared with past ones by meaning as well as by shared keywords, so differently worded reports of the same problem still match.'
  },
  {
    q: 'What is MTTR?',
    a: 'Mean time to resolve: the average time from an incident being reported to it being resolved. Nexora tracks it per incident, system, department and fix, so you can see reused fixes paying off.'
  }
]

function Faq(): React.JSX.Element {
  return (
    <section id="faq" className="scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-10 flex flex-col gap-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="ui-card group p-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta(): React.JSX.Element {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl p-10 text-center text-white sm:p-16">
        <div className="brand-mark absolute inset-0 -z-10 bg-primary" aria-hidden="true" />
        <div className="absolute -right-24 -top-24 -z-10 size-72 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <h2 className="font-display-tight text-3xl font-bold sm:text-4xl">Make the next outage the fast one.</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/85">Bring your team’s hard-won fixes together and let Nexora surface them when it counts.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {/* A plain link: the style skins restyle primary buttons, and this one must stay white on the gradient */}
          <a href={SIGN_UP} className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-white px-7 text-base font-semibold text-[#4C28DC] shadow-lg transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent [&_svg]:size-4">
            Get started free <ArrowRight aria-hidden="true" />
          </a>
          <Button asChild size="lg" variant="ghost" className="h-12 px-7 text-base text-white hover:bg-white/15 hover:text-white">
            <a href={SIGN_IN}>I already have an account</a>
          </Button>
        </div>
      </div>
    </section>
  )
}

function Footer(): React.JSX.Element {
  return (
    <footer className="border-t border-border/60 px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-xs flex-col gap-3">
          <Logo />
          <p className="text-sm text-muted-foreground">Incident intelligence for teams that would rather not fix the same thing twice.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
          <span className="eyebrow text-[10px]">Product</span>
          <span className="eyebrow text-[10px]">Account</span>
          <a href="#features" className="text-muted-foreground hover:text-foreground">Features</a>
          <a href={SIGN_IN} className="text-muted-foreground hover:text-foreground">Sign in</a>
          <a href="#how" className="text-muted-foreground hover:text-foreground">How it works</a>
          <a href={SIGN_UP} className="text-muted-foreground hover:text-foreground">Create account</a>
          <a href="#faq" className="text-muted-foreground hover:text-foreground">FAQ</a>
          <a href="#roles" className="text-muted-foreground hover:text-foreground">Teams &amp; roles</a>
        </nav>
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Nexora. All rights reserved.</span>
        <span className="flex items-center gap-1.5"><GitMerge className="size-3.5" aria-hidden="true" /> Every incident, connected to its history.</span>
      </div>
    </footer>
  )
}

export default function LandingPage(): React.JSX.Element {
  return (
    // overflow-x-clip (not hidden) trims the decorative glows without breaking the sticky header
    <div className="relative min-h-screen overflow-x-clip">
      <div className="app-backdrop" aria-hidden="true" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Pillars />
        <Features />
        <Showcase />
        <HowItWorks />
        <Roles />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
