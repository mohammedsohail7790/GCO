import { z } from 'zod'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { assertNoSecrets } from '@/lib/security/secretGuard'
import { LeadConflictError } from './leads'

// The 30-minute discovery call, captured as structured, NON-SECRET answers. Four short sections mirror the sales
// playbook (business / operations / technical / commercial). Every field is optional plain text with a hard length limit;
// there is no scoring. Credentials (API keys, passwords, tokens, webhook secrets, private keys) are refused by the shared
// guard - they never belong in a CRM record.

const text = (max: number) => z.string().trim().max(max).optional()

export const DISCOVERY_SECTIONS = {
  business: ['company', 'website', 'industry', 'service', 'targetMarket', 'conversationVolume', 'currentOperation', 'pain', 'desiredOutcome', 'urgency', 'decisionMaker'],
  operations: ['channels', 'operatingHours', 'languages', 'coverage', 'expectedVolume', 'escalation', 'operatorNeeds', 'supervisorNeeds'],
  technical: ['channelProvider', 'existingApi', 'webhookCapability', 'apiDocumentation', 'sandbox', 'technicalContact', 'callbackRequirements', 'authMethod'],
  commercial: ['scope', 'pilot', 'pricing', 'startDate', 'decisionProcess', 'nextStep'],
} as const

const sectionSchema = (keys: readonly string[]) =>
  z.object(Object.fromEntries(keys.map((k) => [k, text(300)]))).strict().optional()

export const DiscoverySchema = z
  .object({
    business: sectionSchema(DISCOVERY_SECTIONS.business),
    operations: sectionSchema(DISCOVERY_SECTIONS.operations),
    technical: sectionSchema(DISCOVERY_SECTIONS.technical),
    commercial: sectionSchema(DISCOVERY_SECTIONS.commercial),
  })
  .strict()

export const QUALIFICATION_VALUES = ['QUALIFIED', 'NOT_QUALIFIED', 'NEEDS_FOLLOW_UP'] as const

export const UpdateDiscoverySchema = z
  .object({
    qualification: z.enum(QUALIFICATION_VALUES).nullable().optional(),
    discovery: DiscoverySchema.optional(),
    nextAction: z.string().trim().max(200).nullable().optional(),
    nextActionAt: z.string().datetime().nullable().optional(),
  })
  .strict()
export type UpdateDiscoveryInput = z.infer<typeof UpdateDiscoverySchema>

type Discovery = Partial<Record<keyof typeof DISCOVERY_SECTIONS, Record<string, string>>>

/** Merge: a provided section replaces that section's answers (empty strings clear a field); untouched sections stay. */
function mergeDiscovery(current: Discovery, patch: NonNullable<UpdateDiscoveryInput['discovery']>): Discovery {
  const next: Discovery = { ...current }
  for (const section of Object.keys(DISCOVERY_SECTIONS) as (keyof typeof DISCOVERY_SECTIONS)[]) {
    const incoming = patch[section]
    if (!incoming) continue
    const merged = { ...(next[section] ?? {}) }
    for (const [k, v] of Object.entries(incoming)) {
      if (typeof v !== 'string') continue
      if (v === '') delete merged[k]
      else merged[k] = v
    }
    next[section] = merged
  }
  return next
}

const LOCK_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Records discovery answers / qualification / next action on a lead. The caller (route) has already decided WHO may do it
 * (the owning Hunter, or a Manager/CEO). Recording real work on a lead the actor owns also extends the 30-day lock, exactly
 * like logging an activity. History stores field NAMES only (never answers) so the timeline can be shared safely.
 */
export async function updateLeadDiscovery(leadId: string, actorUserId: string, input: UpdateDiscoveryInput) {
  const strings: Record<string, unknown> = { nextAction: input.nextAction }
  for (const section of Object.keys(DISCOVERY_SECTIONS) as (keyof typeof DISCOVERY_SECTIONS)[]) {
    for (const [k, v] of Object.entries(input.discovery?.[section] ?? {})) strings[`${section}.${k}`] = v
  }
  assertNoSecrets(strings)

  const lead = await db.lead.findUnique({ where: { id: leadId } })
  if (!lead) throw new LeadConflictError('Lead not found')

  const data: Record<string, unknown> = {}
  const changed: string[] = []
  if ('qualification' in input) {
    data.qualification = input.qualification ?? null
    changed.push('qualification')
  }
  if ('nextAction' in input) {
    data.nextAction = input.nextAction || null
    changed.push('nextAction')
  }
  if ('nextActionAt' in input) {
    data.nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : null
    changed.push('nextActionAt')
  }
  if (input.discovery) {
    data.discovery = mergeDiscovery((lead.discovery ?? {}) as Discovery, input.discovery) as object
    changed.push(...Object.keys(input.discovery).map((s) => `discovery.${s}`))
  }
  if (changed.length === 0) return lead

  const ownsLead = lead.ownerId === actorUserId
  if (ownsLead) data.ownershipExpiresAt = new Date(Date.now() + LOCK_MS)
  const updated = await db.lead.update({ where: { id: leadId }, data })
  await db.leadHistoryEntry.create({
    data: { leadId, actorUserId, action: 'discovery_updated', metadata: { fields: changed, qualification: 'qualification' in input ? (input.qualification ?? null) : undefined } },
  })
  await writeAuditLog({ actorUserId, action: 'lead.discovery_updated', resource: 'lead', resourceId: leadId, metadata: { fields: changed } })
  return updated
}

// ---------------------------------------------------------------------------
// Follow-ups and last contact (derived from real rows - nothing is invented)
// ---------------------------------------------------------------------------

const CONTACT_ACTIONS = ['activity_logged', 'stage_changed', 'claimed', 'discovery_updated', 'pilot_request_received', 'contact_request_received']
const OPEN_STAGES = ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL', 'PENDING_APPROVAL'] as const

/** Latest recorded touch per lead (one grouped query). Leads with no history simply have no entry. */
export async function lastActivityByLead(leadIds: string[]): Promise<Map<string, Date>> {
  if (leadIds.length === 0) return new Map()
  const rows = await db.leadHistoryEntry.groupBy({ by: ['leadId'], where: { leadId: { in: leadIds }, action: { in: CONTACT_ACTIONS } }, _max: { createdAt: true } })
  return new Map(rows.filter((r) => r._max.createdAt).map((r) => [r.leadId, r._max.createdAt!]))
}

export const daysSince = (d: Date | null | undefined, now = new Date()) => (d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000)) : null)

export interface FollowUp {
  leadId: string
  companyName: string
  stage: string
  ownerId: string | null
  ownerName: string | null
  nextAction: string | null
  nextActionAt: Date | null
  daysSinceContact: number | null
  reason: 'next_action_due' | 'lock_expiring'
}

/**
 * Follow-ups due: an open lead whose next action date has arrived, or (existing behaviour) an owned open lead whose 30-day
 * ownership lock expires within 5 days. `ownerId` scopes a Hunter to their own leads; omit for the team view.
 */
export async function followUpsDue(opts: { ownerId?: string; now?: Date; limit?: number } = {}): Promise<FollowUp[]> {
  const now = opts.now ?? new Date()
  const soon = new Date(now.getTime() + 5 * 86_400_000)
  const leads = await db.lead.findMany({
    where: {
      pipelineStage: { in: [...OPEN_STAGES] },
      ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
      OR: [{ nextActionAt: { lte: now } }, { ownerId: { not: null }, ownershipExpiresAt: { lt: soon } }],
    },
    include: { owner: { select: { displayName: true } } },
    orderBy: [{ nextActionAt: 'asc' }, { ownershipExpiresAt: 'asc' }],
    take: opts.limit ?? 50,
  })
  const last = await lastActivityByLead(leads.map((l) => l.id))
  return leads.map((l) => ({
    leadId: l.id,
    companyName: l.companyName,
    stage: l.pipelineStage,
    ownerId: l.ownerId,
    ownerName: l.owner?.displayName ?? null,
    nextAction: l.nextAction,
    nextActionAt: l.nextActionAt,
    daysSinceContact: daysSince(last.get(l.id) ?? l.createdAt, now),
    reason: l.nextActionAt && l.nextActionAt <= now ? 'next_action_due' : 'lock_expiring',
  }))
}
