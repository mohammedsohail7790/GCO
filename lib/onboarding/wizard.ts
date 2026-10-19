import type { Industry, ServiceType } from '@prisma/client'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { normalizeLanguage } from '@/lib/languages'
import { isValidTimezone, validateOperatingHours, type OperatingHours } from '@/lib/tenant/settings'
import { setTenantServices } from '@/lib/tenant/services'
import { INDUSTRY_TEMPLATES, resolveWorkspace } from '@/lib/tenant/templates'
import { createRateCard } from '@/lib/earnings/ledger'
import { inviteStaff } from './staffInvites'
import { INVITE_TTL_MS, OnboardingError, sha256 } from './service'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { SITE_URL } from '@/lib/config/site'

export interface WizardInput {
  company: { name: string; slug: string }
  industry: Industry
  services: ServiceType[]
  languages: string[]
  timezone: string
  operatingHours: OperatingHours | null // null = 24/7
  responseSlaSeconds: number
  operatorCapacity: number
  messageCap: number | null
  billing: { model: 'PER_MESSAGE' | 'PER_TICKET' | 'PER_HOUR' | 'MONTHLY_FLAT'; pricePerMessageEurCents: number; pricePerTicketEurCents: number | null; pricePerHourEurCents: number | null; monthlyFeeEurCents: number | null; vatRatePercent: number; vatNote: string | null }
  operatorPay: { amountEurCents: number; basis: 'DELIVERED' | 'APPROVED' } | null
  aiMode: 'HUMAN_ONLY' | 'AI_ASSISTED' | 'AI_PLUS_HUMAN'
  requireOperatorApproval: boolean
  clientContact: { email: string; name: string } | null
  staff: { email: string; name: string; role: 'MANAGER' | 'SUPERVISOR' | 'OPERATOR'; languages?: string[] }[]
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Everything that can be checked without touching the database. Returns human-readable problems; empty = valid. */
export function validateWizard(i: WizardInput): string[] {
  const p: string[] = []
  if (i.company.name.trim().length < 2) p.push('Enter the company name')
  if (!/^[a-z0-9-]{2,60}$/.test(i.company.slug)) p.push('The short name must be 2-60 lowercase letters, digits or dashes')
  if (!i.services.length) p.push('Select at least one service')
  if (i.languages.some((l) => !normalizeLanguage(l))) p.push('Languages must be two-letter codes')
  if (!isValidTimezone(i.timezone)) p.push('Unknown timezone')
  const h = validateOperatingHours(i.operatingHours)
  if (h) p.push(h)
  if (!Number.isInteger(i.responseSlaSeconds) || i.responseSlaSeconds < 30 || i.responseSlaSeconds > 3600) p.push('Response time must be 30-3600 seconds')
  if (!Number.isInteger(i.operatorCapacity) || i.operatorCapacity < 1 || i.operatorCapacity > 20) p.push('Simultaneous chats per operator must be 1-20')
  if (i.messageCap !== null && (!Number.isInteger(i.messageCap) || i.messageCap < 1)) p.push('Message cap must be a positive whole number')
  const b = i.billing
  if (b.model === 'PER_TICKET' && b.pricePerTicketEurCents === null) p.push('Set the price per ticket')
  if (b.model === 'PER_HOUR' && b.pricePerHourEurCents === null) p.push('Set the price per hour')
  if (b.model === 'MONTHLY_FLAT' && b.monthlyFeeEurCents === null) p.push('Set the monthly fee')
  if (b.vatRatePercent < 0 || b.vatRatePercent > 30) p.push('VAT rate must be 0-30%')
  if (i.aiMode === 'AI_PLUS_HUMAN') p.push('AI + Human mode is not available yet. Choose Human only or AI assisted.')
  const emails = [...(i.clientContact ? [i.clientContact.email] : []), ...i.staff.map((s) => s.email)].map((e) => e.trim().toLowerCase())
  for (const e of emails) if (!EMAIL.test(e) || e.endsWith('@demo.gco')) p.push(`Invalid email: ${e}`)
  if (new Set(emails).size !== emails.length) p.push('The same email is used twice')
  for (const s of i.staff) {
    if (s.name.trim().length < 1) p.push(`Name missing for ${s.email}`)
    if (s.languages?.some((l) => !normalizeLanguage(l))) p.push(`Invalid language for ${s.email}`)
  }
  return p
}

export interface WizardResult {
  tenantId: string
  slug: string
  workspace: ReturnType<typeof resolveWorkspace>
  /** One-time setup links, shown once. */
  invitations: { email: string; role: string; setupUrl: string; expiresAt: Date }[]
  warnings: string[]
}

/**
 * Registers a new client end to end: company, industry template, purchased services, languages, hours, SLA, capacity, billing,
 * operator pay rate, AI mode, and secure one-time invitations for the client contact and GCO staff. All checks run before anything
 * is written; if an invitation fails afterwards the client still exists and the failure is reported as a warning (staff can be
 * invited again from the client's staff panel - nothing is half-created silently).
 */
export async function runWizard(i: WizardInput, actorUserId: string): Promise<WizardResult> {
  const problems = validateWizard(i)
  if (await db.tenant.findUnique({ where: { slug: i.company.slug }, select: { id: true } })) problems.push('That short name is already used by another client')
  const emails = [...(i.clientContact ? [i.clientContact.email] : []), ...i.staff.map((s) => s.email)].map((e) => e.trim().toLowerCase())
  const taken = await db.user.findMany({ where: { email: { in: emails } }, select: { email: true } })
  for (const t of taken) problems.push(`A user with ${t.email} already exists`)
  if (problems.length) throw new OnboardingError(problems.join(' · '), 400, 'WIZARD_INVALID')

  const tpl = INDUSTRY_TEMPLATES[i.industry]
  const tenant = await db.tenant.create({
    data: {
      name: i.company.name.trim(),
      slug: i.company.slug,
      industry: i.industry,
      timezone: i.timezone,
      operatingHours: (i.operatingHours ?? undefined) as never,
      defaultResponseSlaSeconds: i.responseSlaSeconds,
      defaultOperatorCapacity: i.operatorCapacity,
      messageCap: i.messageCap,
      aiMode: i.aiMode,
      requireOperatorApproval: i.requireOperatorApproval,
      billingModel: i.billing.model,
      pricePerMessageEurCents: i.billing.pricePerMessageEurCents,
      pricePerTicketEurCents: i.billing.pricePerTicketEurCents,
      pricePerHourEurCents: i.billing.pricePerHourEurCents,
      monthlyFeeEurCents: i.billing.monthlyFeeEurCents,
      vatRatePercent: i.billing.vatRatePercent,
      vatNote: i.billing.vatNote,
    },
  })
  const warnings: string[] = []
  await setTenantServices({ tenantId: tenant.id, industry: i.industry, services: i.services, actorUserId })
  if (i.operatorPay) {
    await createRateCard({ tenantId: tenant.id, amountEurCents: i.operatorPay.amountEurCents, basis: i.operatorPay.basis, effectiveFrom: new Date(), note: 'Set in the client setup wizard', actorUserId })
  } else {
    warnings.push('No operator pay rate was set: operator messages stay unpriced until a rate is added under Earnings → Rates.')
  }

  const invitations: WizardResult['invitations'] = []
  if (i.clientContact) {
    try {
      invitations.push({ ...(await inviteClientContact(tenant.id, i.clientContact, actorUserId)), role: 'CLIENT' })
    } catch (e) {
      warnings.push(`Client contact invitation failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }
  for (const s of i.staff) {
    try {
      const r = await inviteStaff({ tenantId: tenant.id, email: s.email, displayName: s.name, role: s.role, languages: s.role === 'OPERATOR' ? (s.languages?.length ? s.languages : i.languages) : undefined, actorUserId })
      invitations.push({ email: s.email.trim().toLowerCase(), role: s.role, setupUrl: r.setupUrl, expiresAt: r.expiresAt })
    } catch (e) {
      warnings.push(`Invitation for ${s.email} failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  await writeAuditLog({
    tenantId: tenant.id,
    actorUserId,
    action: 'client.setup_wizard',
    resource: 'tenant',
    resourceId: tenant.id,
    metadata: { industry: i.industry, services: i.services, aiMode: i.aiMode, billingModel: i.billing.model, invitations: invitations.length, warnings: warnings.length, template: tpl.label }, // never links or tokens
  })
  return { tenantId: tenant.id, slug: tenant.slug, workspace: resolveWorkspace(i.industry, i.services), invitations, warnings }
}

/** The client's own login: an INACTIVE CLIENT user with an unusable password and a one-time, single-use setup link (same mechanism as staff). */
async function inviteClientContact(tenantId: string, c: { email: string; name: string }, actorUserId: string) {
  const email = c.email.trim().toLowerCase()
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)
  const out = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, displayName: c.name.trim().slice(0, 120), role: 'CLIENT', tenantId, passwordHash: unusable, isActive: false } })
    await tx.staffInvitation.create({ data: { tenantId, userId: user.id, role: 'CLIENT', tokenHash: sha256(token), expiresAt, createdByUserId: actorUserId } })
    return user
  })
  await writeAuditLog({ tenantId, actorUserId, action: 'client.contact_invited', resource: 'user', resourceId: out.id, metadata: { expiresAt: expiresAt.toISOString() } })
  return { email, setupUrl: `${SITE_URL}/accept-invitation#token=${token}`, expiresAt }
}
