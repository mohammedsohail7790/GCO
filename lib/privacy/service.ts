import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { requestDeadlineDays, knownRegime } from './regimes'

export class PrivacyError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const REMOVED = '[removed]'
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex')
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * Removes personal CONTENT from the given conversations while keeping the operational and financial skeleton (ids, timestamps,
 * statuses, operator, usage and earnings ledgers) - billing and pay records must stay accurate and auditable.
 * Idempotent. Returns how many rows of each kind were redacted.
 */
async function redactConversations(tenantId: string, conversationIds: string[], erasedUserId?: string) {
  if (conversationIds.length === 0) return { conversations: 0, messages: 0, notes: 0, memories: 0, suggestions: 0, escalations: 0 }
  return db.$transaction(async (tx) => {
    const inConv = { tenantId, conversationId: { in: conversationIds } }
    const messages = await tx.message.updateMany({ where: { ...inConv, NOT: { content: REMOVED } }, data: { content: REMOVED } })
    const notes = await tx.note.updateMany({ where: { ...inConv, NOT: { body: REMOVED } }, data: { body: REMOVED } })
    const memories = await tx.aiMemory.updateMany({ where: inConv, data: { value: REMOVED, correctedValue: null, isDeleted: true, ...(erasedUserId ? { externalUserId: erasedUserId } : {}) } })
    const genIds = (await tx.aiGeneration.findMany({ where: inConv, select: { id: true } })).map((g) => g.id)
    const suggestions = await tx.aiGeneration.updateMany({ where: { id: { in: genIds }, NOT: { suggestedReply: REMOVED } }, data: { suggestedReply: REMOVED, reasoningSummary: null, errorMessage: null } })
    const escalations = await tx.escalation.updateMany({ where: inConv, data: { summary: REMOVED, resolution: null } })
    await tx.escalationEvent.updateMany({ where: { tenantId, escalation: { conversationId: { in: conversationIds } } }, data: { body: null } })
    const conversations = await tx.conversation.updateMany({ where: { id: { in: conversationIds }, tenantId, redactedAt: null }, data: { redactedAt: new Date() } })
    return { conversations: conversations.count, messages: messages.count, notes: notes.count, memories: memories.count, suggestions: suggestions.count, escalations: escalations.count }
  })
}

/** Raw webhook payloads carry the customer's message text: blank those older than the cutoff. Hash and ids stay for deduplication/audit. */
async function purgeWebhookPayloads(tenantId: string, before: Date) {
  return db.$executeRaw`UPDATE "WebhookEvent" SET "rawPayload" = '{}'::jsonb WHERE "tenantId" = ${tenantId} AND "createdAt" < ${before} AND "rawPayload" <> '{}'::jsonb`
}

export type Counts = Awaited<ReturnType<typeof redactConversations>> & { webhookPayloads: number }

/**
 * Applies each client's retention window: conversations closed (or last active) more than N days ago lose their personal
 * content. Clients without a window are untouched. `dryRun` only counts.
 */
export async function runRetention(opts: { tenantId?: string; now?: Date; dryRun?: boolean; actorUserId?: string | null }) {
  const now = opts.now ?? new Date()
  const tenants = await db.tenant.findMany({ where: { messageRetentionDays: { not: null }, ...(opts.tenantId ? { id: opts.tenantId } : {}) }, select: { id: true, messageRetentionDays: true } })
  const out: { tenantId: string; retentionDays: number; counts: Counts | { wouldRedactConversations: number } }[] = []
  for (const t of tenants) {
    const cutoff = new Date(now.getTime() - t.messageRetentionDays! * 86_400_000)
    const due = await db.conversation.findMany({
      where: { tenantId: t.id, redactedAt: null, OR: [{ closedAt: { lt: cutoff } }, { closedAt: null, updatedAt: { lt: cutoff } }] },
      select: { id: true },
      take: 5000,
    })
    if (opts.dryRun) { out.push({ tenantId: t.id, retentionDays: t.messageRetentionDays!, counts: { wouldRedactConversations: due.length } }); continue }
    const counts = await redactConversations(t.id, due.map((c) => c.id))
    const webhookPayloads = Number(await purgeWebhookPayloads(t.id, cutoff))
    out.push({ tenantId: t.id, retentionDays: t.messageRetentionDays!, counts: { ...counts, webhookPayloads } })
    await writeAuditLog({ tenantId: t.id, actorUserId: opts.actorUserId ?? null, action: 'privacy.retention_run', resource: 'tenant', resourceId: t.id, metadata: { retentionDays: t.messageRetentionDays, ...counts, webhookPayloads } })
  }
  return out
}

export async function updatePolicy(tenantId: string, patch: { messageRetentionDays?: number | null; regulations?: string[]; dataRegion?: string | null }, actorUserId: string) {
  if (patch.regulations) {
    if (patch.regulations.length === 0 || patch.regulations.some((r) => !knownRegime(r))) throw new PrivacyError('Choose one or more known regimes')
  }
  if (patch.messageRetentionDays !== undefined && patch.messageRetentionDays !== null && (!Number.isInteger(patch.messageRetentionDays) || patch.messageRetentionDays < 7 || patch.messageRetentionDays > 3650)) throw new PrivacyError('Retention must be 7-3650 days')
  const before = await db.tenant.findUnique({ where: { id: tenantId }, select: { messageRetentionDays: true, regulations: true, dataRegion: true } })
  if (!before) throw new PrivacyError('Client not found', 404)
  const t = await db.tenant.update({ where: { id: tenantId }, data: patch, select: { messageRetentionDays: true, regulations: true, dataRegion: true } })
  await writeAuditLog({ tenantId, actorUserId, action: 'privacy.policy_changed', resource: 'tenant', resourceId: tenantId, metadata: { before, after: t } })
  return t
}

// ---- data-subject requests --------------------------------------------------------------------------------------------

export async function createDataRequest(i: { tenantId: string; kind: 'EXPORT' | 'ERASURE'; subjectRef: string; note?: string | null; requestedByUserId: string }) {
  const ref = i.subjectRef.trim()
  if (ref.length < 1 || ref.length > 200) throw new PrivacyError('Enter the end user\'s id on your platform')
  const t = await db.tenant.findUnique({ where: { id: i.tenantId }, select: { regulations: true } })
  if (!t) throw new PrivacyError('Client not found', 404)
  const req = await db.dataRequest.create({
    data: { tenantId: i.tenantId, kind: i.kind, subjectRefHash: sha(`${i.tenantId}:${ref}`), subjectHint: ref.slice(-4), note: i.note?.slice(0, 500) ?? null, requestedByUserId: i.requestedByUserId, dueAt: new Date(Date.now() + requestDeadlineDays(t.regulations) * 86_400_000) },
  })
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.requestedByUserId, action: 'privacy.request_created', resource: 'data_request', resourceId: req.id, metadata: { kind: i.kind } })
  return req
}

async function conversationsOf(tenantId: string, externalUserId: string) {
  return db.conversation.findMany({ where: { tenantId, externalUserId }, select: { id: true } })
}

/** Everything held about one end user of one client, as plain data. Returned to the caller once; not stored. */
export async function exportSubject(tenantId: string, externalUserId: string) {
  const convs = await db.conversation.findMany({
    where: { tenantId, externalUserId },
    orderBy: { createdAt: 'asc' },
    include: { messages: { orderBy: { createdAt: 'asc' }, select: { id: true, direction: true, content: true, status: true, createdAt: true, deliveredAt: true } }, notes: { select: { body: true, createdAt: true } }, aiMemories: { where: { isDeleted: false }, select: { type: true, value: true, createdAt: true } } },
  })
  return { tenantId, externalUserId, generatedAt: new Date().toISOString(), conversations: convs.map((c) => ({ id: c.id, language: c.language, state: c.state, createdAt: c.createdAt, closedAt: c.closedAt, messages: c.messages, notes: c.notes, extractedFacts: c.aiMemories })) }
}

/** Redacts the conversations of one end user and replaces the platform id with an unlinkable placeholder. */
export async function eraseSubject(tenantId: string, externalUserId: string) {
  const convs = await conversationsOf(tenantId, externalUserId)
  const counts = await redactConversations(tenantId, convs.map((c) => c.id), `erased-${crypto.randomBytes(6).toString('hex')}`)
  for (const c of convs) await db.conversation.update({ where: { id: c.id }, data: { externalUserId: `erased-${crypto.randomBytes(6).toString('hex')}` } })
  const escaped = escapeLike(externalUserId)
  const webhookPayloads = Number(await db.$executeRaw`UPDATE "WebhookEvent" SET "rawPayload" = '{}'::jsonb WHERE "tenantId" = ${tenantId} AND "rawPayload"::text LIKE ${`%${escaped}%`} ESCAPE '\\' AND "rawPayload" <> '{}'::jsonb`)
  return { ...counts, webhookPayloads, conversationsFound: convs.length }
}

/** Executes an open request. The subject reference must be supplied again - only its hash is stored, so a typo cannot hit another person. */
export async function executeDataRequest(i: { requestId: string; subjectRef: string; actorUserId: string }) {
  const req = await db.dataRequest.findUnique({ where: { id: i.requestId } })
  if (!req) throw new PrivacyError('Request not found', 404)
  if (req.status !== 'OPEN') throw new PrivacyError('This request is already closed', 409)
  if (sha(`${req.tenantId}:${i.subjectRef.trim()}`) !== req.subjectRefHash) throw new PrivacyError('That id does not match the request', 400)
  const ref = i.subjectRef.trim()
  let exported: Awaited<ReturnType<typeof exportSubject>> | null = null
  let counts: Record<string, number> = {}
  if (req.kind === 'EXPORT') {
    exported = await exportSubject(req.tenantId, ref)
    counts = { conversations: exported.conversations.length }
  } else {
    counts = await eraseSubject(req.tenantId, ref)
  }
  const claimed = await db.dataRequest.updateMany({ where: { id: req.id, status: 'OPEN' }, data: { status: 'COMPLETED', completedAt: new Date(), completedByUserId: i.actorUserId, result: counts } })
  if (claimed.count === 0) throw new PrivacyError('This request was closed by someone else', 409)
  await writeAuditLog({ tenantId: req.tenantId, actorUserId: i.actorUserId, action: 'privacy.request_completed', resource: 'data_request', resourceId: req.id, metadata: { kind: req.kind, ...counts } }) // counts only, never the subject
  return { kind: req.kind, counts, export: exported }
}

export async function rejectDataRequest(i: { requestId: string; actorUserId: string; reason: string }) {
  if (i.reason.trim().length < 5) throw new PrivacyError('Give a reason')
  const r = await db.dataRequest.updateMany({ where: { id: i.requestId, status: 'OPEN' }, data: { status: 'REJECTED', completedAt: new Date(), completedByUserId: i.actorUserId, note: i.reason.slice(0, 500) } })
  if (r.count === 0) throw new PrivacyError('Request not found or already closed', 409)
}

// ---- people we employ / contact -----------------------------------------------------------------------------------------

/**
 * Anonymises a staff or client user account: name and email are replaced, login disabled, sessions and two-factor removed.
 * The user id stays, so earnings, audit and operational history keep working (financial records are retained by law).
 */
export async function anonymiseUser(i: { userId: string; reason: string; actorUserId: string }) {
  if (i.reason.trim().length < 5) throw new PrivacyError('Give a reason')
  const u = await db.user.findUnique({ where: { id: i.userId }, select: { id: true, role: true, tenantId: true } })
  if (!u) throw new PrivacyError('User not found', 404)
  if (u.role === 'CEO_ADMIN') throw new PrivacyError('The CEO account cannot be anonymised here', 403)
  const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: u.id }, data: { displayName: 'Former user', email: `${u.id}@anonymised.invalid`, isActive: false, passwordHash: unusable, totpSecretEnc: null, totpEnabledAt: null, totpRecoveryHashes: [] } })
    await tx.session.deleteMany({ where: { userId: u.id } })
  })
  await writeAuditLog({ tenantId: u.tenantId, actorUserId: i.actorUserId, action: 'privacy.user_anonymised', resource: 'user', resourceId: u.id, metadata: { role: u.role } })
}

/** Job applicants: anonymise applications untouched for N days (default policy suggestion: 12 months). */
export async function purgeCareerApplications(olderThanDays: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - olderThanDays * 86_400_000)
  const rows = await db.careerApplication.findMany({ where: { createdAt: { lt: cutoff }, NOT: { fullName: REMOVED } }, select: { id: true } })
  for (const r of rows) await db.careerApplication.update({ where: { id: r.id }, data: { fullName: REMOVED, email: `${r.id}@anonymised.invalid`, phone: null, message: null, reviewNote: null, country: null, languages: null } })
  return { applications: rows.length }
}
