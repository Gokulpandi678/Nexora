import { Resend } from 'resend'
import { prisma } from '@/lib/db'
import { logError, logger } from '@/lib/logger'
import { activeMemberEmails } from '@/lib/members'

export type NotificationType = 'RECURRENCE' | 'MENTION' | 'SOLUTION_VERIFIED' | 'STATUS_CHANGED' | 'P1_ESCALATION'

let client: Resend | null | undefined
function resend(): Resend | null {
  if (client === undefined) client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  return client
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function appUrl(): string {
  const url = process.env.APP_URL
  if (!url) throw new Error('APP_URL is not set')
  return url
}
/** Goes through /go/incident/:id, which switches to the incident's organization before opening it. */
export const incidentUrl = (id: string): string => `${appUrl()}/go/incident/${id}`

interface Block {
  label: string
  value: string
}

/** Plain, client-safe email layout. All interpolated text is escaped here. */
export function renderEmail({ heading, intro, blocks = [], cta, footer = 'You receive this because you own or were mentioned on an incident.' }: {
  heading: string
  intro: string
  blocks?: Block[]
  cta: { label: string; url: string }
  footer?: string
}): string {
  const rows = blocks
    .map(
      b => `
      <tr><td style="padding:12px 16px;border:1px solid #E5E7EB;border-radius:6px;background:#F9FAFB">
        <div style="font-size:12px;color:#6B7280;margin-bottom:4px">${escapeHtml(b.label)}</div>
        <div style="font-size:14px;color:#111827;font-weight:600">${escapeHtml(b.value)}</div>
      </td></tr><tr><td style="height:8px"></td></tr>`
    )
    .join('')
  return `<!doctype html><html><body style="margin:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:8px;border:1px solid #E5E7EB">
      <tr><td style="height:4px;background:#0061FF;border-radius:8px 8px 0 0"></td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 8px;font-size:18px;color:#111827">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151">${escapeHtml(intro)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;margin-top:8px;background:#0061FF;color:#FFFFFF;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">${escapeHtml(cta.label)}</a>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #E5E7EB;font-size:12px;color:#6B7280">Nexora · ${escapeHtml(footer)}</td></tr>
    </table>
  </td></tr></table></body></html>`
}

export type EmailResult = { ok: true } | { ok: false; reason: 'disabled' | 'failed'; message: string }

/**
 * Sends one email through Resend. Never throws: returns why it was not sent (email not configured,
 * or Resend rejected it, e.g. the resend.dev test sender only delivers to your own Resend account).
 */
export async function sendEmail({ to, subject, html, attachments, context = {} }: {
  to: string
  subject: string
  html: string
  /** Files to attach (Resend allows up to 40 MB in total) */
  attachments?: { filename: string; content: Buffer }[]
  context?: Record<string, unknown>
}): Promise<EmailResult> {
  const mailer = resend()
  if (!mailer) {
    logger.info('email disabled; not sent', { to, subject, ...context })
    return { ok: false, reason: 'disabled', message: 'RESEND_API_KEY is not set' }
  }
  try {
    const { data, error } = await mailer.emails.send({
      from: process.env.EMAIL_FROM ?? 'Nexora <alerts@example.com>',
      to,
      subject,
      html,
      ...(attachments?.length && { attachments })
    })
    if (!error) {
      logger.info('email sent', { to, subject, id: data?.id, ...context })
      return { ok: true }
    }
    logError(new Error(error.message), { step: 'sendEmail', to, ...context })
    return { ok: false, reason: 'failed', message: error.message }
  } catch (error) {
    logError(error, { step: 'sendEmail', to, ...context })
    return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : 'Unknown error' }
  }
}

interface NotifyInput {
  to: string
  incidentId: string
  type: NotificationType
  /** Short text for the in-app inbox */
  title: string
  subject: string
  html: string
  /** Skip if this recipient already got this type for this incident */
  dedupe?: boolean
  /** Only deliver to active members of the incident's organization (off only for the on-call address) */
  membersOnly?: boolean
}

/**
 * Records an in-app notification and emails it when Resend is configured.
 * Never throws: a failed email must not fail the user's action.
 * Returns true when a notification was recorded.
 */
export async function notify({ to, incidentId, type, title, subject, html, dedupe = true, membersOnly = true }: NotifyInput): Promise<boolean> {
  const recipientEmail = to.toLowerCase()
  try {
    if (dedupe) {
      const already = await prisma.notificationLog.findFirst({
        where: { recipientEmail, incidentId, notificationType: type },
        select: { id: true }
      })
      if (already) return false
    }

    // Stored with the incident's organization so each organization's inbox only shows its own
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: { organizationId: true, organization: { select: { suspendedAt: true } } }
    })
    if (incident?.organization?.suspendedAt) return false // suspended organizations send nothing
    // Never email incident details to someone outside the incident's organization (e.g. people who left)
    if (membersOnly && incident?.organizationId && !(await activeMemberEmails(incident.organizationId, [recipientEmail])).has(recipientEmail)) {
      logger.info('notification skipped: recipient is not a member', { type, incidentId })
      return false
    }

    const delivered = (await sendEmail({ to: recipientEmail, subject, html, context: { type, incidentId } })).ok
    await prisma.notificationLog.create({
      data: { recipientEmail, incidentId, notificationType: type, title, delivered, organizationId: incident?.organizationId ?? null }
    })
    return true
  } catch (error) {
    logError(error, { step: 'notify', type, incidentId })
    return false
  }
}

/* ---------- Specific notifications ---------- */

export function sendMatchNotification(args: {
  ownerEmail: string
  originalTitle: string
  newIncidentId: string
  newIncidentTitle: string
  reportedBy: string
  notes?: string
}): Promise<boolean> {
  return notify({
    to: args.ownerEmail,
    incidentId: args.newIncidentId,
    type: 'RECURRENCE',
    title: `"${args.originalTitle}" is happening again`,
    subject: `Your incident "${args.originalTitle}" is happening again`,
    html: renderEmail({
      heading: 'An incident you handled has recurred',
      intro: `${args.reportedBy} linked a new report to your earlier incident. Could you check whether it is the same issue and share what worked last time?`,
      blocks: [
        { label: 'Your original incident', value: args.originalTitle },
        { label: 'New report', value: args.newIncidentTitle },
        ...(args.notes ? [{ label: 'Their note', value: args.notes }] : [])
      ],
      cta: { label: 'Review the new incident', url: incidentUrl(args.newIncidentId) }
    })
  })
}

export function sendMentionNotification(args: {
  to: string
  incidentId: string
  incidentTitle: string
  author: string
  excerpt: string
}): Promise<boolean> {
  return notify({
    to: args.to,
    incidentId: args.incidentId,
    type: 'MENTION',
    title: `${args.author} mentioned you on "${args.incidentTitle}"`,
    subject: `${args.author} mentioned you on "${args.incidentTitle}"`,
    dedupe: false,
    html: renderEmail({
      heading: `${args.author} needs your input`,
      intro: 'You were mentioned in a comment on an incident.',
      blocks: [
        { label: 'Incident', value: args.incidentTitle },
        { label: 'Comment', value: args.excerpt }
      ],
      cta: { label: 'Open the discussion', url: incidentUrl(args.incidentId) }
    })
  })
}

export function sendVerifiedNotification(args: {
  to: string
  incidentId: string
  incidentTitle: string
  verifier: string
}): Promise<boolean> {
  return notify({
    to: args.to,
    incidentId: args.incidentId,
    type: 'SOLUTION_VERIFIED',
    title: `Your fix for "${args.incidentTitle}" was verified`,
    subject: `Your solution was verified by ${args.verifier}`,
    html: renderEmail({
      heading: 'Your solution passed QA',
      intro: `${args.verifier} verified your fix. It will now be suggested first when this issue recurs.`,
      blocks: [{ label: 'Incident', value: args.incidentTitle }],
      cta: { label: 'View the incident', url: incidentUrl(args.incidentId) }
    })
  })
}

export function sendStatusNotification(args: {
  to: string
  incidentId: string
  incidentTitle: string
  status: string
  actor: string
}): Promise<boolean> {
  return notify({
    to: args.to,
    incidentId: args.incidentId,
    type: 'STATUS_CHANGED',
    title: `"${args.incidentTitle}" is now ${args.status.toLowerCase()}`,
    subject: `[${args.status}] ${args.incidentTitle}`,
    dedupe: false,
    html: renderEmail({
      heading: `Incident ${args.status.toLowerCase()}`,
      intro: `${args.actor} changed the status of an incident you reported.`,
      blocks: [
        { label: 'Incident', value: args.incidentTitle },
        { label: 'New status', value: args.status }
      ],
      cta: { label: 'View the incident', url: incidentUrl(args.incidentId) }
    })
  })
}

/** P1s go straight to on-call when ONCALL_EMAIL is set. */
export async function escalateP1(args: { incidentId: string; title: string; reportedBy: string; systems: string[] }): Promise<boolean> {
  const to = process.env.ONCALL_EMAIL
  if (!to) return false
  return notify({
    // The on-call address is a distribution list, not a member
    membersOnly: false,
    to,
    incidentId: args.incidentId,
    type: 'P1_ESCALATION',
    title: `P1: ${args.title}`,
    subject: `[P1] ${args.title}`,
    html: renderEmail({
      heading: 'Critical incident reported',
      intro: `${args.reportedBy} reported a P1 incident.`,
      blocks: [
        { label: 'Incident', value: args.title },
        { label: 'Affected systems', value: args.systems.join(', ') }
      ],
      cta: { label: 'Take ownership', url: incidentUrl(args.incidentId) }
    })
  })
}

/* ---------- Accounts & organizations ---------- */

const ACCOUNT_FOOTER = 'You receive this because of your account or organization on Nexora.'

export function sendOrgInvitation(args: { to: string; organizationName: string; token: string; invitedBy: string; expiresAt: Date }): Promise<EmailResult> {
  return sendEmail({
    to: args.to,
    subject: `You're invited to set up ${args.organizationName} on Nexora`,
    context: { type: 'ORG_INVITATION' },
    html: renderEmail({
      heading: `Set up ${args.organizationName} on Nexora`,
      intro: `${args.invitedBy} invited you to create your organization's workspace. You'll be its admin: you approve who joins and manage their roles.`,
      blocks: [
        { label: 'Organization', value: args.organizationName },
        { label: 'Link expires', value: args.expiresAt.toUTCString() }
      ],
      cta: { label: 'Accept invitation', url: `${appUrl()}/invite/${encodeURIComponent(args.token)}` },
      footer: 'You receive this because a platform admin invited this address. Ignore it if it was not meant for you.'
    })
  })
}

export function sendJoinRequestNotification(args: { to: string; organizationId: string; organizationName: string; requester: string; requesterEmail: string; message: string | null }): Promise<EmailResult> {
  return sendEmail({
    to: args.to,
    subject: `${args.requester} asked to join ${args.organizationName}`,
    context: { type: 'JOIN_REQUEST' },
    html: renderEmail({
      heading: 'New request to join your organization',
      intro: `${args.requester} (${args.requesterEmail}) wants to join ${args.organizationName}.`,
      blocks: args.message ? [{ label: 'Their note', value: args.message }] : [],
      cta: { label: 'Review requests', url: `${appUrl()}/switch-org?org=${encodeURIComponent(args.organizationId)}&next=/admin/members` },
      footer: ACCOUNT_FOOTER
    })
  })
}

export function sendMembershipDecision(args: { to: string; organizationId: string; organizationName: string; approved: boolean }): Promise<EmailResult> {
  return sendEmail({
    to: args.to,
    subject: args.approved ? `You've joined ${args.organizationName}` : `Your request to join ${args.organizationName}`,
    context: { type: 'MEMBERSHIP_DECISION' },
    html: renderEmail({
      heading: args.approved ? `Welcome to ${args.organizationName}` : 'Your join request was declined',
      intro: args.approved
        ? 'An admin approved your request. You can now report and resolve incidents with your team.'
        : 'An admin declined your request. You can ask to join a different organization.',
      cta: {
        label: args.approved ? `Open ${args.organizationName}` : 'Choose an organization',
        url: args.approved ? `${appUrl()}/switch-org?org=${encodeURIComponent(args.organizationId)}&next=/dashboard` : `${appUrl()}/organizations`
      },
      footer: ACCOUNT_FOOTER
    })
  })
}

export function sendOrganizationStatusEmail(args: {
  to: string
  organizationName: string
  suspended: boolean
  reason?: string | null
}): Promise<EmailResult> {
  return sendEmail({
    to: args.to,
    subject: args.suspended ? `${args.organizationName} has been suspended on Nexora` : `${args.organizationName} is active again on Nexora`,
    context: { type: args.suspended ? 'ORG_SUSPENDED' : 'ORG_REACTIVATED' },
    html: renderEmail({
      heading: args.suspended ? `${args.organizationName} is suspended` : `${args.organizationName} is active again`,
      intro: args.suspended
        ? 'A Nexora administrator suspended this organization. Its members cannot open it until it is reactivated. No data has been deleted.'
        : 'A Nexora administrator reactivated this organization. Members can use it again, with all incidents and history intact.',
      blocks: args.suspended && args.reason ? [{ label: 'Reason', value: args.reason }] : [],
      cta: { label: 'Open Nexora', url: appUrl() },
      footer: 'You receive this because you are an admin of this organization.'
    })
  })
}

export function sendMemberInvite(args: { to: string; organizationName: string; invitedBy: string; position: string | null; access: string }): Promise<EmailResult> {
  return sendEmail({
    to: args.to,
    subject: `${args.invitedBy} invited you to join ${args.organizationName} on Nexora`,
    context: { type: 'MEMBER_INVITE' },
    html: renderEmail({
      heading: `Join ${args.organizationName} on Nexora`,
      intro: `${args.invitedBy} invited you to their organization. Sign in (or create your account) with this email address, then accept the invitation with one click.`,
      blocks: [
        { label: 'Organization', value: args.organizationName },
        ...(args.position ? [{ label: 'Position', value: args.position }] : []),
        { label: 'Access', value: args.access }
      ],
      cta: { label: 'View invitation', url: `${appUrl()}/organizations` },
      footer: 'You receive this because an organization admin invited this address. Ignore it if it was not meant for you.'
    })
  })
}
