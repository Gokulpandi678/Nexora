# Incident Tracker: Full-Stack Development Prompt for Claude Code

## Project Overview
Build a full-stack incident management system where employees submit incidents, the system finds similar historical incidents, and users decide whether to link to existing incidents or create new ones. Multiple solutions stored per issue type. Original issue owners notified when their incidents recur.

**Tech Stack**: Next.js 14+ (App Router), TypeScript, Supabase (PostgreSQL), Prisma ORM, TailwindCSS

---

## PART 1: SETUP & DATABASE

### Step 1: Project Initialization
```bash
# Create Next.js project
npx create-next-app@latest incident-tracker \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir

cd incident-tracker

# Install dependencies
npm install @prisma/client prisma @supabase/supabase-js resend clsx date-fns zustand
npm install -D prisma @types/node

# Create .env.local
touch .env.local
```

### Step 2: Environment Variables
```
# .env.local
DATABASE_URL="postgresql://[user]:[password]@[host]:5432/[database]"
SUPABASE_URL="https://[project-id].supabase.co"
SUPABASE_ANON_KEY="[anon-key]"
RESEND_API_KEY="[your-resend-key]"
APP_URL="http://localhost:3000"
```

### Step 3: Prisma Schema
Create `prisma/schema.prisma` with COMPLETE database schema:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Incident {
  id              String   @id @default(cuid())
  title           String   @db.VarChar(255)
  description     String   @db.Text
  symptoms        String   @db.Text
  affectedSystems String[]
  
  severity        String   @default("P2")
  status          String   @default("OPEN")
  
  createdBy       String
  email           String
  createdAt       DateTime @default(now())
  resolvedAt      DateTime?
  
  // Link to older incident if matched
  linkedTo        Incident? @relation("IncidentLink", fields: [linkedToId], references: [id])
  linkedToId      String?
  linkedFrom      Incident[] @relation("IncidentLink")
  
  // Solutions/approaches
  solutions       Solution[]
  
  // Match tracking
  matchedAs       MatchLink[] @relation("newIncident")
  matchedFrom     MatchLink[] @relation("originalIncident")
  
  @@fulltext([title, description, symptoms])
  @@index([status, severity, createdAt])
  @@index([linkedToId])
}

model Solution {
  id            String   @id @default(cuid())
  incident      Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  incidentId    String
  
  rootCause     String   @db.Text
  approach      String   @db.Text
  timeToFix     Int
  efficiency    String   @default("MEDIUM")
  useCaseNotes  String   @db.Text
  
  solvedBy      String
  solvedAt      DateTime @default(now())
  status        String   @default("UNVERIFIED")
  
  @@index([incidentId])
}

model MatchLink {
  id                 String   @id @default(cuid())
  
  newIncident        Incident @relation("newIncident", fields: [newIncidentId], references: [id], onDelete: Cascade)
  newIncidentId      String
  
  originalIncident   Incident @relation("originalIncident", fields: [originalIncidentId], references: [id], onDelete: Cascade)
  originalIncidentId String
  
  matchType          String   @default("SIMILAR")
  solutionUsed       String?
  notes              String?  @db.Text
  createdAt          DateTime @default(now())
  
  @@unique([newIncidentId, originalIncidentId])
  @@index([newIncidentId, originalIncidentId])
}

model NotificationLog {
  id                String   @id @default(cuid())
  recipientEmail    String
  incidentId        String
  notificationType  String
  sentAt            DateTime @default(now())
  
  @@index([recipientEmail, incidentId])
}
```

### Step 4: Migrate Database
```bash
npx prisma migrate dev --name init
npx prisma generate
```

---

## PART 2: BACKEND API ROUTES

### lib/db.ts - Database utilities with search
```typescript
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

export async function searchSimilarIncidents(query: string, limit = 5) {
  return prisma.incident.findMany({
    where: {
      OR: [
        { title: { search: query } },
        { description: { search: query } },
        { symptoms: { search: query } }
      ]
    },
    include: { 
      solutions: {
        orderBy: { solvedAt: 'desc' }
      },
      matchedAs: true
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  })
}

export async function getIncidentWithDetails(id: string) {
  return prisma.incident.findUnique({
    where: { id },
    include: {
      solutions: { orderBy: { solvedAt: 'desc' } },
      linkedFrom: { include: { solutions: true } },
      linkedTo: { include: { solutions: true } },
      matchedAs: { include: { originalIncident: true } },
      matchedFrom: { include: { newIncident: true } }
    }
  })
}
```

### app/api/incidents/create/route.ts - Create new incident
```typescript
import { prisma } from '@/lib/db'
import { searchSimilarIncidents } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const {
      title, description, symptoms, affectedSystems,
      severity, createdBy, email
    } = await req.json()

    const incident = await prisma.incident.create({
      data: {
        title, description, symptoms,
        affectedSystems, severity, status: 'OPEN',
        createdBy, email
      }
    })

    const similar = await searchSimilarIncidents(title, 5)

    return NextResponse.json({
      incident,
      similarIncidents: similar.filter(i => i.id !== incident.id)
    })
  } catch (error) {
    console.error('Error creating incident:', error)
    return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 })
  }
}
```

### app/api/incidents/link/route.ts - Link incident to existing one
```typescript
import { prisma } from '@/lib/db'
import { sendMatchNotification } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { newIncidentId, originalIncidentId, matchType, solutionUsed, notes } = await req.json()

    await prisma.matchLink.create({
      data: {
        newIncidentId,
        originalIncidentId,
        matchType: matchType || 'SAME',
        solutionUsed,
        notes
      }
    })

    const original = await prisma.incident.findUnique({
      where: { id: originalIncidentId }
    })

    if (original) {
      await sendMatchNotification(original.email, original.title, newIncidentId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error linking incident:', error)
    return NextResponse.json({ error: 'Failed to link incident' }, { status: 500 })
  }
}
```

### app/api/incidents/resolve/route.ts - Add solution and resolve
```typescript
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const {
      incidentId, rootCause, approach, timeToFix,
      efficiency, useCaseNotes, solvedBy
    } = await req.json()

    const solution = await prisma.solution.create({
      data: {
        incidentId,
        rootCause, approach, timeToFix,
        efficiency: efficiency || 'MEDIUM',
        useCaseNotes, solvedBy,
        status: 'UNVERIFIED'
      }
    })

    await prisma.incident.update({
      where: { id: incidentId },
      data: { status: 'RESOLVED', resolvedAt: new Date() }
    })

    return NextResponse.json({ solution, success: true })
  } catch (error) {
    console.error('Error resolving incident:', error)
    return NextResponse.json({ error: 'Failed to resolve incident' }, { status: 500 })
  }
}
```

### app/api/incidents/search/route.ts - Search incidents
```typescript
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')
    const status = searchParams.get('status')

    const results = await prisma.incident.findMany({
      where: {
        AND: [
          q ? {
            OR: [
              { title: { search: q } },
              { description: { search: q } },
              { symptoms: { search: q } }
            ]
          } : {},
          status ? { status } : {}
        ]
      },
      include: { solutions: true },
      orderBy: { createdAt: 'desc' },
      take: 30
    })

    return NextResponse.json(results)
  } catch (error) {
    console.error('Error searching incidents:', error)
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 })
  }
}
```

---

## PART 3: FRONTEND - DESIGN SYSTEM & COMPONENTS

### Design Tokens (Colors, Spacing, Typography)
**Cool-toned, modern, compact design**

```typescript
// lib/design-tokens.ts
export const COLORS = {
  // Cool blue/slate base (not warm cream)
  bg: {
    primary: '#0f172a',      // Deep slate
    secondary: '#1e293b',    // Slate-800
    tertiary: '#334155',     // Slate-700
    hover: '#1e2d42'
  },
  text: {
    primary: '#f1f5f9',      // Slate-100
    secondary: '#cbd5e1',    // Slate-300
    muted: '#94a3b8'         // Slate-400
  },
  accent: {
    primary: '#0ea5e9',      // Sky-500 (cool cyan)
    secondary: '#06b6d4',    // Cyan-500
    tertiary: '#8b5cf6',     // Violet-500
    success: '#10b981',      // Emerald-500
    warning: '#f59e0b',      // Amber-500
    danger: '#ef4444'        // Red-500
  },
  border: '#475569',         // Slate-600
  overlay: 'rgba(15, 23, 42, 0.95)'
}

export const SPACING = {
  xs: '0.25rem',    // 4px
  sm: '0.5rem',     // 8px
  md: '1rem',       // 16px
  lg: '1.5rem',     // 24px
  xl: '2rem',       // 32px
  '2xl': '3rem'     // 48px
}

export const TYPOGRAPHY = {
  fontSize: {
    xs: '0.75rem',   // 12px
    sm: '0.875rem',  // 14px
    base: '1rem',    // 16px
    lg: '1.125rem',  // 18px
    xl: '1.25rem',   // 20px
    '2xl': '1.5rem'  // 24px
  },
  fontFamily: {
    sans: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', monospace"
  }
}
```

### globals.css - Tailwind + custom styles
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --bg-tertiary: #334155;
  --text-primary: #f1f5f9;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --accent-primary: #0ea5e9;
  --accent-secondary: #06b6d4;
  --accent-tertiary: #8b5cf6;
  --accent-success: #10b981;
  --accent-warning: #f59e0b;
  --accent-danger: #ef4444;
  --border-color: #475569;
}

* {
  @apply antialiased;
}

body {
  @apply bg-[#0f172a] text-[#f1f5f9];
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

/* Compact card styling */
.card {
  @apply bg-[#1e293b] border border-[#475569] rounded-lg px-3 py-2.5;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
  @apply bg-[#334155] border-[#0ea5e9];
  box-shadow: 0 0 20px rgba(14, 165, 233, 0.15);
}

/* Button styles - interactive & modern */
.btn {
  @apply px-3 py-1.5 rounded-md font-medium text-sm transition-all duration-200;
  @apply active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2;
}

.btn-primary {
  @apply bg-[#0ea5e9] text-[#0f172a] hover:bg-[#06b6d4] shadow-lg hover:shadow-xl;
}

.btn-secondary {
  @apply bg-[#334155] text-[#f1f5f9] hover:bg-[#475569] border border-[#475569];
}

.btn-ghost {
  @apply text-[#cbd5e1] hover:text-[#0ea5e9] hover:bg-[#1e293b];
}

.btn:disabled {
  @apply opacity-50 cursor-not-allowed;
}

/* Badge styles */
.badge {
  @apply inline-block px-2 py-1 text-xs font-semibold rounded-full;
}

.badge-success {
  @apply bg-[#10b981]/20 text-[#6ee7b7];
}

.badge-warning {
  @apply bg-[#f59e0b]/20 text-[#fcd34d];
}

.badge-danger {
  @apply bg-[#ef4444]/20 text-[#fca5a5];
}

.badge-info {
  @apply bg-[#0ea5e9]/20 text-[#7dd3fc];
}

/* Compact input */
input, textarea, select {
  @apply bg-[#334155] border border-[#475569] text-[#f1f5f9];
  @apply px-2.5 py-1.5 rounded-md text-sm;
  @apply placeholder-[#94a3b8];
  @apply focus:outline-none focus:border-[#0ea5e9] focus:ring-1 focus:ring-[#0ea5e9];
  transition: all 0.2s;
}

/* Smooth scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #475569;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #64748b;
}

/* Animations */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-in {
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Interactive pulse for alerts */
@keyframes pulse-soft {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.pulse-soft {
  animation: pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

### lib/email.ts - Send notifications
```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendMatchNotification(
  recipientEmail: string,
  incidentTitle: string,
  newIncidentId: string
) {
  try {
    await resend.emails.send({
      from: 'alerts@incident-tracker.com',
      to: recipientEmail,
      subject: `🔄 Your incident "${incidentTitle}" is happening again`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #f1f5f9; background: #0f172a; padding: 20px; border-radius: 8px; max-width: 600px; margin: 0 auto;">
          <div style="border-left: 4px solid #0ea5e9; padding-left: 16px; margin-bottom: 20px;">
            <h2 style="margin: 0 0 8px 0; color: #7dd3fc; font-size: 18px;">Incident Match Alert</h2>
            <p style="margin: 0; color: #cbd5e1; font-size: 14px;">Someone just reported an incident matching your past resolution</p>
          </div>
          
          <div style="background: #1e293b; padding: 12px; border-radius: 6px; margin-bottom: 16px; border: 1px solid #475569;">
            <p style="margin: 0 0 6px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase;">Original Issue</p>
            <p style="margin: 0; color: #f1f5f9; font-size: 14px; font-weight: 600;">${incidentTitle}</p>
          </div>

          <p style="color: #cbd5e1; font-size: 13px; line-height: 1.6;">
            Can you quickly review if it's the same issue and provide suggestions? Your experience could help resolve this faster.
          </p>

          <a href="${process.env.APP_URL}/incidents/${newIncidentId}" style="display: inline-block; background: #0ea5e9; color: #0f172a; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 12px;">
            View Incident →
          </a>

          <p style="margin: 20px 0 0 0; padding-top: 16px; border-top: 1px solid #475569; color: #94a3b8; font-size: 12px;">
            Incident Tracker • Your Organization
          </p>
        </div>
      `
    })
  } catch (error) {
    console.error('Error sending email:', error)
  }
}
```

### app/components/IncidentForm.tsx - Main submission form
```typescript
'use client'

import { useState, useTransition } from 'react'
import { COLORS, SPACING } from '@/lib/design-tokens'

interface SimilarIncident {
  id: string
  title: string
  symptoms: string
  createdBy: string
  email: string
  severity: string
}

export default function IncidentForm() {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    symptoms: '',
    affectedSystems: [] as string[],
    severity: 'P2',
    createdBy: '',
    email: ''
  })

  const [similar, setSimilar] = useState<SimilarIncident[]>([])
  const [showResults, setShowResults] = useState(false)
  const [isPending, startTransition] = useTransition()

  const systemOptions = ['Database', 'API', 'Cache', 'Network', 'Auth', 'Storage', 'Queue', 'Other']

  const handleSystemToggle = (system: string) => {
    setFormData(prev => ({
      ...prev,
      affectedSystems: prev.affectedSystems.includes(system)
        ? prev.affectedSystems.filter(s => s !== system)
        : [...prev.affectedSystems, system]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/incidents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      setSimilar(data.similarIncidents)
      setShowResults(true)
    })
  }

  return (
    <div style={{ padding: SPACING.lg }}>
      <div style={{ marginBottom: SPACING.xl }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 ' + SPACING.sm + ' 0' }}>
          Report Incident
        </h1>
        <p style={{ fontSize: '13px', color: COLORS.text.secondary, margin: 0 }}>
          Help us track and prevent recurring issues
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: '640px' }}>
        {/* Title */}
        <div style={{ marginBottom: SPACING.md }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '0.5px', color: COLORS.text.secondary }}>
            Incident Title
          </label>
          <input
            type="text"
            placeholder="e.g., Database connection timeout"
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            required
            style={{
              width: '100%',
              padding: SPACING.sm + ' ' + SPACING.md,
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: SPACING.md }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '0.5px', color: COLORS.text.secondary }}>
            Description
          </label>
          <textarea
            placeholder="What happened? When did you first notice it?"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            required
            rows={3}
            style={{
              width: '100%',
              padding: SPACING.sm + ' ' + SPACING.md,
              fontSize: '13px',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Symptoms */}
        <div style={{ marginBottom: SPACING.md }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '0.5px', color: COLORS.text.secondary }}>
            Observable Symptoms
          </label>
          <textarea
            placeholder="What did users/systems experience? Error messages? Slow responses?"
            value={formData.symptoms}
            onChange={(e) => setFormData({...formData, symptoms: e.target.value})}
            required
            rows={3}
            style={{
              width: '100%',
              padding: SPACING.sm + ' ' + SPACING.md,
              fontSize: '13px',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Affected Systems */}
        <div style={{ marginBottom: SPACING.md }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '0.5px', color: COLORS.text.secondary }}>
            Affected Systems
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: SPACING.sm }}>
            {systemOptions.map(system => (
              <button
                key={system}
                type="button"
                onClick={() => handleSystemToggle(system)}
                style={{
                  padding: SPACING.sm + ' ' + SPACING.md,
                  fontSize: '12px',
                  fontWeight: '500',
                  border: '1px solid ' + COLORS.border,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: formData.affectedSystems.includes(system) ? COLORS.accent.primary : COLORS.bg.tertiary,
                  color: formData.affectedSystems.includes(system) ? '#0f172a' : COLORS.text.primary,
                  transition: 'all 0.2s'
                }}
              >
                {system}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div style={{ marginBottom: SPACING.md }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '0.5px', color: COLORS.text.secondary }}>
            Severity
          </label>
          <div style={{ display: 'flex', gap: SPACING.sm }}>
            {['P1', 'P2', 'P3'].map(severity => (
              <button
                key={severity}
                type="button"
                onClick={() => setFormData({...formData, severity})}
                style={{
                  padding: SPACING.sm + ' ' + SPACING.md,
                  fontSize: '12px',
                  fontWeight: '600',
                  border: '1px solid ' + (formData.severity === severity ? COLORS.accent.primary : COLORS.border),
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: formData.severity === severity ? COLORS.accent.primary + '20' : COLORS.bg.tertiary,
                  color: COLORS.text.primary,
                  transition: 'all 0.2s'
                }}
              >
                {severity}
              </button>
            ))}
          </div>
        </div>

        {/* Reporter Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.lg }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '0.5px', color: COLORS.text.secondary }}>
              Your Name
            </label>
            <input
              type="text"
              placeholder="Name"
              value={formData.createdBy}
              onChange={(e) => setFormData({...formData, createdBy: e.target.value})}
              required
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '0.5px', color: COLORS.text.secondary }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@company.com"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          style={{
            width: '100%',
            padding: SPACING.md,
            fontSize: '13px',
            fontWeight: '600',
            background: COLORS.accent.primary,
            color: '#0f172a',
            border: 'none',
            borderRadius: '6px',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1,
            transition: 'all 0.2s'
          }}
        >
          {isPending ? 'Searching...' : 'Report Incident'}
        </button>
      </form>

      {/* Similar Incidents Results */}
      {showResults && similar.length > 0 && (
        <div style={{ marginTop: SPACING.xl, animation: 'slideIn 0.3s' }}>
          <div style={{ marginBottom: SPACING.lg }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 ' + SPACING.sm + ' 0' }}>
              ⚠️ Similar Incidents Found
            </h2>
            <p style={{ fontSize: '13px', color: COLORS.text.secondary, margin: 0 }}>
              These past incidents might be related. Are any of these your issue?
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
            {similar.map(incident => (
              <IncidentMatch key={incident.id} incident={incident} />
            ))}
          </div>

          <div style={{ marginTop: SPACING.lg, paddingTop: SPACING.lg, borderTop: '1px solid ' + COLORS.border }}>
            <button
              type="button"
              onClick={() => setShowResults(false)}
              style={{
                padding: SPACING.md,
                fontSize: '13px',
                fontWeight: '600',
                background: COLORS.bg.tertiary,
                color: COLORS.text.primary,
                border: '1px solid ' + COLORS.border,
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              None of these match - Create New Incident
            </button>
          </div>
        </div>
      )}

      {showResults && similar.length === 0 && (
        <div style={{ marginTop: SPACING.xl, padding: SPACING.lg, background: COLORS.bg.secondary, borderRadius: '8px', border: '1px solid ' + COLORS.border }}>
          <p style={{ fontSize: '13px', color: COLORS.text.secondary, margin: 0 }}>
            ✓ No similar incidents found. Your new incident will be stored for future reference.
          </p>
        </div>
      )}
    </div>
  )
}

interface IncidentMatchProps {
  incident: SimilarIncident
}

function IncidentMatch({ incident }: IncidentMatchProps) {
  const [choosing, setChoosing] = useState(false)

  return (
    <div style={{
      background: COLORS.bg.secondary,
      border: '1px solid ' + COLORS.border,
      borderRadius: '8px',
      padding: SPACING.md,
      transition: 'all 0.2s'
    }}>
      <div style={{ marginBottom: SPACING.sm }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: SPACING.sm }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', margin: 0, color: COLORS.text.primary }}>
            {incident.title}
          </h3>
          <span style={{
            fontSize: '11px',
            fontWeight: '600',
            padding: '2px 6px',
            borderRadius: '4px',
            background: COLORS.accent.primary + '20',
            color: '#7dd3fc'
          }}>
            {incident.severity}
          </span>
        </div>
        <p style={{ fontSize: '12px', color: COLORS.text.secondary, margin: 0 }}>
          Reported by <strong>{incident.createdBy}</strong>
        </p>
      </div>

      <p style={{ fontSize: '13px', color: COLORS.text.muted, marginBottom: SPACING.sm, lineHeight: '1.5' }}>
        <strong>Symptoms:</strong> {incident.symptoms.substring(0, 150)}...
      </p>

      {!choosing ? (
        <div style={{ display: 'flex', gap: SPACING.sm }}>
          <button
            onClick={() => setChoosing(true)}
            style={{
              flex: 1,
              padding: SPACING.sm,
              fontSize: '12px',
              fontWeight: '600',
              background: COLORS.accent.primary,
              color: '#0f172a',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Yes, this is my issue
          </button>
          <button
            style={{
              flex: 1,
              padding: SPACING.sm,
              fontSize: '12px',
              fontWeight: '600',
              background: COLORS.bg.tertiary,
              color: COLORS.text.primary,
              border: '1px solid ' + COLORS.border,
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Different issue
          </button>
        </div>
      ) : (
        <LinkConfirmation incidentId={incident.id} />
      )}
    </div>
  )
}

function LinkConfirmation({ incidentId }: { incidentId: string }) {
  const [isPending, startTransition] = useTransition()

  const handleLink = () => {
    startTransition(async () => {
      await fetch('/api/incidents/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newIncidentId: 'NEW_ID', // Pass actual ID from form
          originalIncidentId: incidentId,
          matchType: 'SAME'
        })
      })
      // Show success message
    })
  }

  return (
    <div>
      <p style={{ fontSize: '12px', color: COLORS.text.secondary, marginBottom: SPACING.sm }}>
        We'll link this to the past incident and notify the original owner.
      </p>
      <button
        onClick={handleLink}
        disabled={isPending}
        style={{
          width: '100%',
          padding: SPACING.sm,
          fontSize: '12px',
          fontWeight: '600',
          background: COLORS.accent.success,
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isPending ? 'not-allowed' : 'pointer'
        }}
      >
        {isPending ? 'Linking...' : 'Confirm & Link'}
      </button>
    </div>
  )
}
```

---

## PART 4: PAGE LAYOUT

### app/page.tsx - Main dashboard
```typescript
'use client'

import IncidentForm from '@/components/IncidentForm'
import IncidentList from '@/components/IncidentList'
import { useState } from 'react'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'report' | 'view'>('report')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      paddingTop: '20px'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '40px' }}>
        {/* Header */}
        <div style={{ paddingLeft: '24px', paddingRight: '24px', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '800', margin: '0 0 8px 0', backgroundImage: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Incident Tracker
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
            Reduce recurring issues by learning from past incidents
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', paddingLeft: '24px', paddingRight: '24px', marginBottom: '24px', borderBottom: '1px solid #475569', paddingBottom: '0' }}>
          {[
            { id: 'report', label: '+ Report Incident' },
            { id: 'view', label: 'View All Incidents' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: '600',
                background: 'transparent',
                color: activeTab === tab.id ? '#0ea5e9' : '#94a3b8',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #0ea5e9' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: '-1px'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ paddingLeft: '24px', paddingRight: '24px' }}>
          {activeTab === 'report' && <IncidentForm />}
          {activeTab === 'view' && <IncidentList />}
        </div>
      </div>
    </div>
  )
}
```

---

## PART 5: ADDITIONAL COMPONENTS NEEDED

Create these component files:

### app/components/IncidentList.tsx
Show all incidents with search, filter by status/severity, click to view details

### app/components/IncidentDetail.tsx
Full incident view with solutions, linked incidents, QA checklist

### app/components/ResolutionForm.tsx
Add solution/resolution to an incident

### hooks/useIncidents.ts
Custom hook for incident queries and state management

---

## BUILD INSTRUCTIONS

1. **Setup database**: Follow PART 1 steps
2. **Create API routes**: Implement all PART 2 routes
3. **Build components**: Start with PART 3 design system + IncidentForm
4. **Add pages**: Create PART 4 layout
5. **Deploy**: `vercel deploy`

## START COMMAND
```bash
npm run dev
```

Visit `http://localhost:3000`

---

## KEY FEATURES TO IMPLEMENT
- ✅ Full-text search for similar incidents
- ✅ Match decision UI (Same/Different/Custom approach)
- ✅ Email notifications to original incident owners
- ✅ Multi-solution storage per issue
- ✅ Compact, modern UI with cool colors
- ✅ Interactive form with system selectors
- ✅ Mobile-responsive design
- ✅ Solution tracking (Verified/Unverified)
- ✅ Dashboard showing incident patterns
- ✅ QA checklist for resolutions

---

## DESIGN PHILOSOPHY
- **Cool palette**: Deep slate backgrounds (#0f172a, #1e293b) + cyan/sky accents (#0ea5e9)
- **Compact spacing**: 4px baseline, tight margins for density
- **Small typography**: 12px labels, 14px body, 16px headings max
- **Interactive**: Hover states, smooth transitions, active feedback
- **Modern**: Minimal borders, gradient accents, smooth curves
- **Accessible**: Clear focus states, semantic HTML, ARIA labels
