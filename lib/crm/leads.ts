import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'

const LOCK_DAYS = 30
const LOCK_MS = LOCK_DAYS * 24 * 60 * 60 * 1000

export class LeadConflictError extends Error {
  status = 409
}
export class LeadDuplicateError extends Error {
  status = 409
  field: 'email' | 'vatId'
  constructor(field: 'email' | 'vatId') {
    super(`A lead with this ${field === 'email' ? 'email' : 'VAT/tax ID'} already exists`)
    this.field = field
  }
}

function extractDomain(website?: string | null, email?: string | null): string | null {
  if (website) {
    try {
      const url = website.includes('://') ? website : `https://${website}`
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    } catch {
      /* fall through to email-based extraction */
    }
  }
  if (email && email.includes('@')) return email.split('@')[1]!.toLowerCase()
  return null
}

/**
 * Creates a lead with the business's duplicate rules:
 *  - email: HARD BLOCK (DB-unique-constraint-backed, not just this check - a
 *    concurrent duplicate insert still fails at the database).
 *  - vatId: HARD BLOCK when provided (same DB-constraint backing).
 *  - domain: SOFT WARNING only - creation proceeds, `domainWarning` is
 *    returned so the caller (Hunter) can see it, never blocks.
 */
export async function createLead(params: {
  companyName: string
  contactName: string
  email: string
  phone?: string
  website?: string
  vatId?: string
  industry?: string
  country?: string
  source?: string
  notes?: string
  estimatedValueEurCents?: number
  // null for a system/anonymous submission (e.g. the public website contact
  // form) - LeadHistoryEntry.actorUserId and the audit log both already
  // support a null actor for exactly this case.
  actorUserId: string | null
}) {
  const domain = extractDomain(params.website, params.email)

  const [existingEmail, existingVat] = await Promise.all([
    db.lead.findUnique({ where: { email: params.email } }),
    params.vatId ? db.lead.findUnique({ where: { vatId: params.vatId } }) : Promise.resolve(null),
  ])
  if (existingEmail) throw new LeadDuplicateError('email')
  if (existingVat) throw new LeadDuplicateError('vatId')

  let domainWarning: string | null = null
  if (domain) {
    const domainMatch = await db.lead.findFirst({ where: { domain } })
    if (domainMatch) {
      domainWarning = `A lead with a matching domain (${domain}) already exists: "${domainMatch.companyName}". You can continue if this is a different contact.`
    }
  }

  // The email/vatId unique constraints are the real, race-safe backstop - two
  // concurrent requests for the same email can both pass the check above, but
  // only one create() will succeed; the loser gets a Prisma unique-constraint
  // error, translated to the same LeadDuplicateError shape here.
  let lead
  try {
    lead = await db.lead.create({
      data: {
        companyName: params.companyName,
        contactName: params.contactName,
        email: params.email,
        phone: params.phone,
        website: params.website,
        domain,
        vatId: params.vatId || null,
        industry: params.industry,
        country: params.country,
        source: params.source,
        notes: params.notes,
        estimatedValueEurCents: params.estimatedValueEurCents,
      },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const target = (err.meta?.target as string[]) ?? []
      throw new LeadDuplicateError(target.includes('vatId') ? 'vatId' : 'email')
    }
    throw err
  }

  await db.leadHistoryEntry.create({
    data: { leadId: lead.id, actorUserId: params.actorUserId, action: 'created' },
  })
  await writeAuditLog({
    actorUserId: params.actorUserId,
    action: 'lead.create',
    resource: 'lead',
    resourceId: lead.id,
    metadata: { domainWarning },
  })

  return { lead, domainWarning }
}

/**
 * Race-safe claim: mirrors lib/assignment/engine.ts::tryAssignConversation's
 * conditional-update pattern. Two Hunters clicking "claim" on the same lead
 * at the same instant can both pass a naive read-then-write check; the
 * `updateMany({ where: { id, ownerId: null } })` below is a single atomic
 * statement at the database, so only one can ever win - the loser's update
 * affects 0 rows and gets a LeadConflictError instead of silently succeeding.
 */
export async function claimLead(leadId: string, hunterUserId: string) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LOCK_MS)

  const result = await db.lead.updateMany({
    where: { id: leadId, ownerId: null },
    data: { ownerId: hunterUserId, ownershipStartedAt: now, ownershipExpiresAt: expiresAt },
  })

  if (result.count === 0) {
    const existing = await db.lead.findUnique({ where: { id: leadId } })
    if (!existing) throw new LeadConflictError('Lead not found')
    throw new LeadConflictError('Lead is already owned by another Hunter')
  }

  await db.leadHistoryEntry.create({
    data: { leadId, actorUserId: hunterUserId, action: 'claimed', metadata: { ownershipExpiresAt: expiresAt } },
  })
  await writeAuditLog({ actorUserId: hunterUserId, action: 'lead.claimed', resource: 'lead', resourceId: leadId })

  return db.lead.findUniqueOrThrow({ where: { id: leadId } })
}

export async function releaseLead(leadId: string, actorUserId: string | null, reason: 'released' | 'auto_released') {
  await db.lead.update({
    where: { id: leadId },
    data: { ownerId: null, ownershipStartedAt: null, ownershipExpiresAt: null },
  })
  await db.leadHistoryEntry.create({
    data: { leadId, actorUserId, action: reason },
  })
  await writeAuditLog({ actorUserId, action: `lead.${reason}`, resource: 'lead', resourceId: leadId })
}

/** Qualifying activity extends the 30-day lock, per the business rule "if the Hunter remains active, lock remains." */
export async function logActivity(leadId: string, actorUserId: string, note: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
  if (lead.ownerId !== actorUserId) throw new LeadConflictError('You do not own this lead')

  const expiresAt = new Date(Date.now() + LOCK_MS)
  await db.lead.update({ where: { id: leadId }, data: { ownershipExpiresAt: expiresAt } })
  await db.leadHistoryEntry.create({
    data: { leadId, actorUserId, action: 'activity_logged', metadata: { note } },
  })
}

export const VALID_TRANSITIONS: Record<string, string[]> = {
  NEW: ['CONTACTED', 'CLOSED_LOST'],
  CONTACTED: ['ENGAGED', 'CLOSED_LOST'],
  ENGAGED: ['QUALIFIED', 'CLOSED_LOST'],
  QUALIFIED: ['MEETING_BOOKED', 'CLOSED_LOST'],
  MEETING_BOOKED: ['PROPOSAL', 'CLOSED_LOST'],
  PROPOSAL: ['PENDING_APPROVAL', 'CLOSED_LOST'],
  PENDING_APPROVAL: ['PROPOSAL', 'CLOSED_LOST'], // reverted by a rejected approval, or manually walked back
  CLOSED_WON: [],
  CLOSED_LOST: [],
}

/** Pure logic, no DB - a lead must never silently jump stages. Exported
 *  separately so it's unit-testable without a database, matching the
 *  existing lib/assignment/policy.ts convention. */
export function isValidTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to)
}

export class InvalidStageTransitionError extends Error {
  status = 400
}

/** A lead must never silently jump stages - every change is validated and recorded. */
export async function changeStage(leadId: string, actorUserId: string, toStage: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
  if (!isValidTransition(lead.pipelineStage, toStage)) {
    throw new InvalidStageTransitionError(`Cannot move from ${lead.pipelineStage} to ${toStage}`)
  }

  await db.lead.update({ where: { id: leadId }, data: { pipelineStage: toStage as any } })
  await db.leadHistoryEntry.create({
    data: { leadId, actorUserId, action: 'stage_changed', metadata: { from: lead.pipelineStage, to: toStage } },
  })
  await writeAuditLog({
    actorUserId,
    action: 'lead.stage_changed',
    resource: 'lead',
    resourceId: leadId,
    metadata: { from: lead.pipelineStage, to: toStage },
  })
}
