import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { normalizeEmail } from '@/lib/crm/leads'
import { listAdapterKeys } from '@/lib/integrations/registry'
import { SITE_URL } from '@/lib/config/site'
import { extractRequestedProfile } from './profile'

// Closed Won -> BPO handoff (tenant) -> THIS: client user + invitation + checklist + explicit go-live.
//
// Principles:
//  * every provisioning step is idempotent (unique leadId/tenantId/clientUserId/email) - a retried or
//    duplicated job converges on one tenant, one user, one onboarding record, one audit event per step;
//  * nothing is activated implicitly: the client user is created INACTIVE with an unusable password,
//    integrations are never auto-created (no production adapter exists yet - they are configured by the
//    CEO through the existing admin API), and the client is LIVE only after the explicit go-live action;
//  * secrets never enter logs, audit rows or SystemEvents: invitation tokens are shown once to the issuing
//    admin and only a SHA-256 hash is stored.

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export class OnboardingError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')

/** Errors are stored/logged without addresses or long provider messages. */
export function safeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'unknown error'
  return msg.split('\n')[0]!.replace(/[\w.+-]+@[\w.-]+\.[a-z]+/gi, '[email]').slice(0, 200)
}

type Confirmations = Partial<Record<'languages' | 'coverage' | 'supervisor', { by: string; at: string }>>
export const CONFIRMABLE = ['languages', 'coverage', 'supervisor'] as const
export type ConfirmableItem = (typeof CONFIRMABLE)[number]

export interface ChecklistItem {
  key: string
  label: string
  done: boolean
  /** manual = a human must confirm it; system = derived from real data */
  source: 'system' | 'manual'
  /** visible in the client-facing status */
  clientVisible: boolean
}

// ---------------------------------------------------------------------------
// Provisioning (worker)
// ---------------------------------------------------------------------------

/** Idempotent. Requires a SUCCEEDED handoff. Safe to run any number of times, concurrently or after partial failure. */
export async function provisionOnboarding(leadId: string) {
  const handoff = await db.bpoHandoff.findUnique({ where: { leadId } })
  if (!handoff || handoff.status !== 'SUCCEEDED' || !handoff.tenantId) {
    throw new OnboardingError('BPO handoff has not succeeded yet', 409, 'HANDOFF_NOT_READY')
  }
  const tenantId = handoff.tenantId
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
  const email = normalizeEmail(lead.email)

  // 1. onboarding record (unique on leadId and tenantId)
  let onboarding = await db.clientOnboarding.findUnique({ where: { leadId } })
  if (!onboarding) {
    try {
      onboarding = await db.clientOnboarding.create({
        data: {
          leadId,
          tenantId,
          contactEmail: email,
          contactName: lead.contactName,
          requestedProfile: extractRequestedProfile(lead.notes) as any,
        },
      })
      await writeAuditLog({ tenantId, action: 'onboarding.started', resource: 'client_onboarding', resourceId: onboarding.id, metadata: { leadId } })
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err
      onboarding = await db.clientOnboarding.findUniqueOrThrow({ where: { leadId } }) // a concurrent job won the race
    }
  }
  await db.clientOnboarding.update({ where: { id: onboarding.id }, data: { attempts: { increment: 1 } } })

  // 2. CLIENT user - inactive, unusable password until the invitation is accepted
  if (!onboarding.clientUserId) {
    const existing = await db.user.findUnique({ where: { email } })
    if (existing && (existing.role !== 'CLIENT' || existing.tenantId !== tenantId)) {
      // Never adopt (or reveal anything about) an account that belongs to someone else.
      throw new OnboardingError('The client contact email already belongs to another account', 409, 'EMAIL_IN_USE')
    }
    let userId = existing?.id
    let createdNow = false
    if (!userId) {
      const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)
      try {
        const user = await db.user.create({
          data: { email, passwordHash: unusable, role: 'CLIENT', tenantId, displayName: lead.contactName.slice(0, 120), isActive: false },
        })
        userId = user.id
        createdNow = true
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err
        const raced = await db.user.findUniqueOrThrow({ where: { email } })
        if (raced.role !== 'CLIENT' || raced.tenantId !== tenantId) throw new OnboardingError('The client contact email already belongs to another account', 409, 'EMAIL_IN_USE')
        userId = raced.id
      }
    }
    try {
      await db.clientOnboarding.update({ where: { id: onboarding.id }, data: { clientUserId: userId } })
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err // linked by a concurrent job already
    }
    if (createdNow) {
      await writeAuditLog({ tenantId, action: 'onboarding.user_created', resource: 'user', resourceId: userId, metadata: { role: 'CLIENT' } })
    }
  }

  await db.clientOnboarding.update({ where: { id: onboarding.id }, data: { lastError: null } })
  return reconcileStatus(onboarding.id)
}

/** Worker entry point: provisions, and on failure records it visibly (status, audit, SystemEvent) before re-throwing so BullMQ retries / dead-letters. */
export async function runOnboarding(leadId: string) {
  try {
    return await provisionOnboarding(leadId)
  } catch (err) {
    await recordOnboardingFailure(leadId, err)
    throw err
  }
}

export async function recordOnboardingFailure(leadId: string, err: unknown) {
  const message = safeError(err)
  const onboarding = await db.clientOnboarding.findUnique({ where: { leadId } })
  if (onboarding && onboarding.status !== 'LIVE') {
    await db.clientOnboarding.update({ where: { id: onboarding.id }, data: { status: 'FAILED', lastError: message } })
  }
  const handoff = await db.bpoHandoff.findUnique({ where: { leadId }, select: { tenantId: true } })
  await db.systemEvent
    .create({
      data: {
        category: 'onboarding',
        severity: 'error',
        message: 'Client onboarding failed - retry from the onboarding console',
        metadata: { leadId, tenantId: handoff?.tenantId ?? null, error: message },
      },
    })
    .catch(() => null)
  await writeAuditLog({
    tenantId: handoff?.tenantId ?? null,
    action: 'onboarding.failed',
    resource: 'client_onboarding',
    resourceId: onboarding?.id ?? null,
    metadata: { leadId, error: message },
  }).catch(() => null)
}

// ---------------------------------------------------------------------------
// Checklist (computed from real data) and status
// ---------------------------------------------------------------------------

export async function computeChecklist(onboardingId: string) {
  const ob = await db.clientOnboarding.findUniqueOrThrow({ where: { id: onboardingId } })
  const confirmations = (ob.confirmations ?? {}) as Confirmations
  const [user, integrations, withSecret, operators] = await Promise.all([
    ob.clientUserId ? db.user.findUnique({ where: { id: ob.clientUserId }, select: { isActive: true } }) : Promise.resolve(null),
    db.integration.findMany({ where: { tenantId: ob.tenantId }, select: { adapterKey: true } }),
    db.integration.count({ where: { tenantId: ob.tenantId, webhookSecret: { not: null } } }), // presence only - the secret is never selected
    db.operator.count({ where: { tenantId: ob.tenantId, user: { isActive: true } } }),
  ])
  const known = new Set(listAdapterKeys())
  const items: ChecklistItem[] = [
    { key: 'tenant_created', label: 'Client account created', done: true, source: 'system', clientVisible: true },
    { key: 'client_user_created', label: 'Client user created', done: !!ob.clientUserId, source: 'system', clientVisible: false },
    { key: 'invitation_accepted', label: 'Client has set up their login', done: !!user?.isActive, source: 'system', clientVisible: true },
    { key: 'integration_configured', label: 'Integration configured', done: integrations.some((i) => known.has(i.adapterKey)), source: 'system', clientVisible: true },
    { key: 'webhook_secret_issued', label: 'Webhook secret issued', done: withSecret > 0, source: 'system', clientVisible: false },
    { key: 'operator_assigned', label: 'Operator assigned', done: operators > 0, source: 'system', clientVisible: false },
    { key: 'supervisor_confirmed', label: 'Supervisor / team lead confirmed', done: !!confirmations.supervisor, source: 'manual', clientVisible: false },
    { key: 'languages_confirmed', label: 'Languages confirmed', done: !!confirmations.languages, source: 'manual', clientVisible: true },
    { key: 'coverage_confirmed', label: 'Coverage confirmed', done: !!confirmations.coverage, source: 'manual', clientVisible: true },
  ]
  return { onboarding: ob, items, ready: items.every((i) => i.done) }
}

/** Persists the derived status. LIVE is sticky; FAILED is cleared only by a successful provisioning run. */
export async function reconcileStatus(onboardingId: string) {
  const { onboarding, items, ready } = await computeChecklist(onboardingId)
  if (onboarding.status === 'LIVE') return onboarding
  const provisioned = !!onboarding.clientUserId
  const next = !provisioned ? onboarding.status : ready ? 'READY_FOR_GO_LIVE' : 'SETUP'
  if (next !== onboarding.status && !(onboarding.status === 'FAILED' && !provisioned)) {
    const updated = await db.clientOnboarding.update({ where: { id: onboardingId }, data: { status: next } })
    if (next === 'READY_FOR_GO_LIVE') {
      await writeAuditLog({ tenantId: onboarding.tenantId, action: 'onboarding.ready', resource: 'client_onboarding', resourceId: onboardingId, metadata: { items: items.length } })
    }
    return updated
  }
  return onboarding
}

// ---------------------------------------------------------------------------
// Invitation
// ---------------------------------------------------------------------------

/** Issues (or re-issues, invalidating the previous token) a one-time setup link. The token is returned once and never stored. */
export async function issueInvitation(onboardingId: string, actorUserId: string) {
  const ob = await db.clientOnboarding.findUnique({ where: { id: onboardingId } })
  if (!ob) throw new OnboardingError('Onboarding not found', 404)
  if (!ob.clientUserId) throw new OnboardingError('The client user has not been created yet - retry provisioning first', 409, 'USER_NOT_CREATED')
  const user = await db.user.findUniqueOrThrow({ where: { id: ob.clientUserId }, select: { isActive: true } })
  if (user.isActive) throw new OnboardingError('This client has already set up their login', 409, 'ALREADY_ACTIVE')

  const token = crypto.randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
  await db.clientOnboarding.update({ where: { id: ob.id }, data: { inviteTokenHash: sha256(token), inviteIssuedAt: now, inviteExpiresAt: expiresAt, inviteAcceptedAt: null } })
  await writeAuditLog({
    tenantId: ob.tenantId,
    actorUserId,
    action: 'onboarding.invitation_issued',
    resource: 'client_onboarding',
    resourceId: ob.id,
    metadata: { expiresAt: expiresAt.toISOString() }, // never the token
  })
  // Fragment, not query: browsers do not send it to servers, proxies, logs or Referer headers.
  return { setupUrl: `${SITE_URL}/accept-invitation#token=${token}`, expiresAt }
}

const INVALID_INVITE = 'This invitation link is invalid or has expired'

/** Public. One generic failure for every reason (unknown, expired, used) so the endpoint is not an oracle. */
export async function acceptInvitation(token: string, password: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new OnboardingError(INVALID_INVITE, 400)
  const hash = sha256(token)
  const passwordHash = await bcrypt.hash(password, 12)
  const ob = await db.clientOnboarding.findUnique({ where: { inviteTokenHash: hash } })
  if (!ob || !ob.clientUserId) throw new OnboardingError(INVALID_INVITE, 400)

  const userId = ob.clientUserId
  await db.$transaction(async (tx) => {
    // Atomic single-use claim: only one request can ever flip an unexpired, unused token.
    const claimed = await tx.clientOnboarding.updateMany({
      where: { id: ob.id, inviteTokenHash: hash, inviteAcceptedAt: null, inviteExpiresAt: { gt: new Date() } },
      data: { inviteAcceptedAt: new Date(), inviteTokenHash: null },
    })
    if (claimed.count === 0) throw new OnboardingError(INVALID_INVITE, 400)
    await tx.user.update({ where: { id: userId }, data: { passwordHash, isActive: true } })
  })
  await writeAuditLog({ tenantId: ob.tenantId, actorUserId: userId, action: 'onboarding.invitation_accepted', resource: 'client_onboarding', resourceId: ob.id })
  await reconcileStatus(ob.id)
  return { tenantId: ob.tenantId }
}

// ---------------------------------------------------------------------------
// Manual confirmations and go-live
// ---------------------------------------------------------------------------

export async function confirmItem(onboardingId: string, item: ConfirmableItem, actorUserId: string) {
  const ob = await db.clientOnboarding.findUnique({ where: { id: onboardingId } })
  if (!ob) throw new OnboardingError('Onboarding not found', 404)
  const confirmations = (ob.confirmations ?? {}) as Confirmations
  if (!confirmations[item]) {
    await db.clientOnboarding.update({
      where: { id: ob.id },
      data: { confirmations: { ...confirmations, [item]: { by: actorUserId, at: new Date().toISOString() } } as any },
    })
    await writeAuditLog({ tenantId: ob.tenantId, actorUserId, action: 'onboarding.confirmed', resource: 'client_onboarding', resourceId: ob.id, metadata: { item } })
  }
  return reconcileStatus(ob.id)
}

/** Explicit, human go-live. Validates the checklist server-side, then activates this client's staged (DISABLED) integrations. Idempotent. */
export async function goLive(onboardingId: string, actorUserId: string) {
  const { onboarding, items, ready } = await computeChecklist(onboardingId)
  if (onboarding.status === 'LIVE') return { onboarding, activatedIntegrations: 0, alreadyLive: true }
  if (!ready) {
    const missing = items.filter((i) => !i.done).map((i) => i.key)
    throw new OnboardingError(`Go-live checklist incomplete: ${missing.join(', ')}`, 409, 'CHECKLIST_INCOMPLETE')
  }
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.clientOnboarding.updateMany({
      where: { id: onboardingId, status: { not: 'LIVE' } },
      data: { status: 'LIVE', liveAt: new Date(), liveByUserId: actorUserId },
    })
    if (claimed.count === 0) return { activated: 0, already: true }
    const activated = await tx.integration.updateMany({ where: { tenantId: onboarding.tenantId, status: 'DISABLED' }, data: { status: 'ACTIVE' } })
    return { activated: activated.count, already: false }
  })
  if (!result.already) {
    await writeAuditLog({ tenantId: onboarding.tenantId, actorUserId, action: 'onboarding.live', resource: 'client_onboarding', resourceId: onboardingId, metadata: { activatedIntegrations: result.activated } })
  }
  return { onboarding: await db.clientOnboarding.findUniqueOrThrow({ where: { id: onboardingId } }), activatedIntegrations: result.activated, alreadyLive: result.already }
}

// ---------------------------------------------------------------------------
// Views (never include token hash, secrets or passwords)
// ---------------------------------------------------------------------------

export async function adminView(onboardingId: string) {
  await reconcileStatus(onboardingId)
  const { onboarding: ob, items, ready } = await computeChecklist(onboardingId)
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: ob.tenantId },
    select: { id: true, name: true, slug: true, status: true, defaultOperatorCapacity: true, defaultResponseSlaSeconds: true, messageCap: true },
  })
  const user = ob.clientUserId ? await db.user.findUnique({ where: { id: ob.clientUserId }, select: { id: true, email: true, isActive: true } }) : null
  return {
    id: ob.id,
    leadId: ob.leadId,
    status: ob.status,
    ready,
    tenant,
    contact: { name: ob.contactName, email: ob.contactEmail },
    clientUser: user,
    invitation: { issuedAt: ob.inviteIssuedAt, expiresAt: ob.inviteExpiresAt, pending: !!ob.inviteTokenHash && !!ob.inviteExpiresAt && ob.inviteExpiresAt > new Date(), accepted: !!user?.isActive },
    requestedProfile: ob.requestedProfile,
    confirmations: ob.confirmations,
    checklist: items,
    lastError: ob.lastError,
    liveAt: ob.liveAt,
    createdAt: ob.createdAt,
  }
}

/** What a CLIENT may see about their own onboarding: no contact data, no internal steps, no ids beyond their tenant. */
export async function clientView(tenantId: string) {
  const ob = await db.clientOnboarding.findUnique({ where: { tenantId }, select: { id: true } })
  if (!ob) return null
  await reconcileStatus(ob.id)
  const { onboarding, items } = await computeChecklist(ob.id)
  return {
    status: onboarding.status,
    live: onboarding.status === 'LIVE',
    steps: items.filter((i) => i.clientVisible).map((i) => ({ key: i.key, label: i.label, done: i.done })),
  }
}
