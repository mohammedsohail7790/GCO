import crypto from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { STAGING_CLIENTS } from './clients'
import { validateStaffPassword } from '@/lib/auth/password'

export class StagingSeedError extends Error {}

/** The seed refuses to run anywhere that is not explicitly a staging environment. */
export function assertStagingSeedAllowed(env: Record<string, string | undefined> = process.env): void {
  if (env.GCO_ENVIRONMENT !== 'staging') {
    throw new StagingSeedError('Refusing to seed: GCO_ENVIRONMENT is not "staging". This seed is for the staging environment only, never production.')
  }
}

/** The shared password for the fictional staging personas comes from the person running the seed, never from the repository. */
export function checkPersonaPassword(pw: string | undefined): string {
  if (!pw) throw new StagingSeedError('Set STAGING_PERSONA_PASSWORD (12+ characters) for the fictional staging accounts. It is not stored in the repository.')
  const problem = validateStaffPassword(pw, 'persona@staging.gco')
  if (problem) throw new StagingSeedError(`STAGING_PERSONA_PASSWORD rejected: ${problem}`)
  return pw
}

export interface StagingSeedOptions {
  passwordHash: string
  /** Appended to slugs/emails (and prefixed in names) so automated tests can seed an isolated copy. */
  suffix?: string
  history?: boolean
}

export interface StagingSeedResult {
  tenants: { key: string; name: string; slug: string; tenantId: string; integrationId: string; emails: Record<string, string[]> }[]
}

export const personaEmail = (role: string, key: string, n: number | null, suffix = '') => `${role}${n ?? ''}.${key}${suffix}@staging.gco`

export async function seedStaging(db: PrismaClient, opts: StagingSeedOptions): Promise<StagingSeedResult> {
  const suffix = opts.suffix ?? ''
  const out: StagingSeedResult = { tenants: [] }
  for (const c of STAGING_CLIENTS) {
    const slug = `${c.slug}${suffix}`
    const tenant = await db.tenant.upsert({
      where: { slug },
      update: { defaultOperatorCapacity: c.capacity, defaultResponseSlaSeconds: c.sla, timezone: c.timezone, operatingHours: c.hours ?? undefined },
      create: { name: `${suffix ? '[TEST] ' : ''}${c.name}`, slug, defaultOperatorCapacity: c.capacity, defaultResponseSlaSeconds: c.sla, timezone: c.timezone, operatingHours: c.hours ?? undefined },
    })
    if (!c.hours) await db.tenant.update({ where: { id: tenant.id }, data: { operatingHours: undefined } })

    const emails: Record<string, string[]> = { manager: [], client: [], operators: [] }
    const upsertUser = async (email: string, role: 'MANAGER' | 'CLIENT' | 'OPERATOR', displayName: string) =>
      db.user.upsert({ where: { email }, update: { displayName, isActive: true }, create: { email, passwordHash: opts.passwordHash, role, displayName, tenantId: tenant.id } })

    const mEmail = personaEmail('manager', c.key, null, suffix)
    await upsertUser(mEmail, 'MANAGER', `${c.name.split(' (')[0]} Supervisor`)
    emails.manager!.push(mEmail)
    const cEmail = personaEmail('client', c.key, null, suffix)
    await upsertUser(cEmail, 'CLIENT', `${c.name.split(' (')[0]} Client Contact`)
    emails.client!.push(cEmail)

    for (const [i, o] of c.operators.entries()) {
      const email = personaEmail('operator', c.key, i + 1, suffix)
      const u = await upsertUser(email, 'OPERATOR', o.name)
      const status = o.online ? 'AVAILABLE' : 'OFFLINE'
      const existing = await db.operator.findUnique({ where: { userId: u.id } })
      if (existing) await db.operator.update({ where: { id: existing.id }, data: { languages: o.languages, capacity: c.capacity, status } })
      else await db.operator.create({ data: { userId: u.id, tenantId: tenant.id, languages: o.languages, capacity: c.capacity, status } })
      emails.operators!.push(email)
    }

    // One ACTIVE simulated client platform per client. The secret is random per install and never leaves the database/server.
    let integration = await db.integration.findFirst({ where: { tenantId: tenant.id, adapterKey: 'dev-mock' } })
    if (!integration) {
      integration = await db.integration.create({ data: { tenantId: tenant.id, adapterKey: 'dev-mock', name: `${c.name.split(' (')[0]} (simulated client platform)`, status: 'ACTIVE', config: {}, webhookSecret: crypto.randomBytes(24).toString('hex') } })
    } else if (integration.status !== 'ACTIVE') {
      integration = await db.integration.update({ where: { id: integration.id }, data: { status: 'ACTIVE' } })
    }

    if (opts.history && !(await db.conversation.count({ where: { tenantId: tenant.id } }))) {
      const op = await db.operator.findFirst({ where: { tenantId: tenant.id } })
      for (const [i, s] of c.samples.slice(0, 2).entries()) {
        const at = new Date(Date.now() - (90 + i * 45) * 60_000)
        const conv = await db.conversation.create({ data: { tenantId: tenant.id, externalUserId: s.customer, state: 'WAITING_FOR_CLIENT', language: s.lang, createdAt: at } })
        await db.message.create({ data: { tenantId: tenant.id, conversationId: conv.id, direction: 'INBOUND', status: 'RECEIVED', content: s.text, externalMessageId: `staging-hist-in-${slug}-${i}`, createdAt: at } })
        await db.message.create({ data: { tenantId: tenant.id, conversationId: conv.id, direction: 'OUTBOUND', status: 'DELIVERED', content: 'Thanks for getting in touch. We have looked into this and will update you shortly.', externalMessageId: `staging-hist-out-${slug}-${i}`, operatorId: op?.id, sentAt: new Date(at.getTime() + 4 * 60_000), createdAt: new Date(at.getTime() + 4 * 60_000) } })
      }
    }
    out.tenants.push({ key: c.key, name: tenant.name, slug, tenantId: tenant.id, integrationId: integration.id, emails })
  }
  return out
}

/** Clears conversations and everything hanging off them for the given staging tenants, so a test round starts clean. Accounts/config stay. */
export async function resetStagingActivity(db: PrismaClient, tenantIds: string[]): Promise<void> {
  for (const tenantId of tenantIds) {
    const w = { tenantId }
    const convIds = (await db.conversation.findMany({ where: w, select: { id: true } })).map((c) => c.id)
    await db.conversation.updateMany({ where: w, data: { currentAssignmentId: null } })
    await db.qaReview.deleteMany({ where: w })
    await db.escalationEvent.deleteMany({ where: { escalation: { conversationId: { in: convIds } } } })
    await db.escalation.deleteMany({ where: { conversationId: { in: convIds } } })
    await db.aiGeneration.deleteMany({ where: w })
    await db.assignmentHistoryEntry.deleteMany({ where: { assignment: { tenantId } } })
    await db.assignment.deleteMany({ where: w })
    await db.messageEvent.deleteMany({ where: { message: { tenantId } } })
    await db.usageRecord.deleteMany({ where: w })
    await db.message.deleteMany({ where: w })
    await db.conversation.deleteMany({ where: w })
    await db.webhookEvent.deleteMany({ where: w })
    await db.operator.updateMany({ where: w, data: { status: 'OFFLINE' } })
  }
}
