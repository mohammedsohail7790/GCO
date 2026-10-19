import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { normalizeLanguage } from '@/lib/languages'

export class ModerationError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const MAX_CLAIMED = 5
const STALE_CLAIM_MS = 15 * 60_000

export interface IngestItem {
  kind: 'MESSAGE' | 'IMAGE' | 'PROFILE' | 'POST' | 'COMMENT' | 'REPORT'
  externalItemId: string
  subjectExternalId: string
  reporterExternalId?: string | null
  content?: string | null
  mediaUrl?: string | null
  flagReason?: string | null
  language?: string | null
  priority?: number
}

/** https only, bounded; GCO never fetches it. Returns null if not acceptable. */
export function safeMediaUrl(v: string | null | undefined): string | null {
  if (!v) return null
  if (v.length > 2000) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null
  } catch {
    return null
  }
}

/** Is a moderation service switched on for this client? (Workspace modules follow purchased services.) */
export async function moderationEnabled(tenantId: string): Promise<boolean> {
  return (await db.tenantService.count({ where: { tenantId, enabled: true, serviceType: { in: ['CHAT_MODERATION', 'COMMUNITY_MODERATION'] } } })) > 0
}

/** Idempotent on (tenant, kind, externalItemId): a re-sent item is counted as a duplicate, never queued twice. */
export async function ingestItems(tenantId: string, items: IngestItem[]) {
  if (items.length === 0 || items.length > 100) throw new ModerationError('Send between 1 and 100 items')
  if (!(await moderationEnabled(tenantId))) throw new ModerationError('Moderation is not enabled for this client', 409, 'MODULE_OFF')
  const rows = items.map((i, n) => {
    const ext = String(i.externalItemId ?? '').trim()
    const subject = String(i.subjectExternalId ?? '').trim()
    if (!ext || ext.length > 200 || !subject || subject.length > 200) throw new ModerationError(`Item ${n + 1}: externalItemId and subjectExternalId are required (max 200 characters)`)
    if (i.content && i.content.length > 10_000) throw new ModerationError(`Item ${n + 1}: content is too long`)
    if (i.mediaUrl && !safeMediaUrl(i.mediaUrl)) throw new ModerationError(`Item ${n + 1}: mediaUrl must be an https URL`)
    if (!i.content && !i.mediaUrl) throw new ModerationError(`Item ${n + 1}: send content or a mediaUrl`)
    const language = i.language ? normalizeLanguage(i.language) : null
    return { tenantId, kind: i.kind, externalItemId: ext, subjectExternalId: subject, reporterExternalId: i.reporterExternalId?.slice(0, 200) ?? null, content: i.content ?? null, mediaUrl: safeMediaUrl(i.mediaUrl), flagReason: i.flagReason?.slice(0, 300) ?? null, language, priority: Math.min(Math.max(Math.trunc(i.priority ?? 0), 0), 5) }
  })
  const r = await db.moderationItem.createMany({ data: rows, skipDuplicates: true })
  return { received: rows.length, created: r.count, duplicates: rows.length - r.count }
}

/** Puts back claims nobody worked for 15 minutes, so an operator going offline never strands items. */
export async function releaseStale(tenantId: string, now = new Date()) {
  const r = await db.moderationItem.updateMany({ where: { tenantId, status: 'IN_REVIEW', claimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } }, data: { status: 'PENDING', assignedOperatorId: null, claimedAt: null } })
  return r.count
}

/**
 * Claims up to `want` pending items for an operator, highest priority then oldest first. SKIP LOCKED makes concurrent claims
 * hand out disjoint items; an operator never holds more than MAX_CLAIMED.
 */
export async function claimBatch(operatorId: string, want = MAX_CLAIMED) {
  const op = await db.operator.findUniqueOrThrow({ where: { id: operatorId }, select: { tenantId: true } })
  if (!(await moderationEnabled(op.tenantId))) throw new ModerationError('Moderation is not enabled for this client', 409, 'MODULE_OFF')
  await releaseStale(op.tenantId)
  const held = await db.moderationItem.count({ where: { assignedOperatorId: operatorId, status: 'IN_REVIEW' } })
  const room = Math.max(0, Math.min(want, MAX_CLAIMED) - held)
  if (room > 0) {
    await db.$executeRaw`
      UPDATE "ModerationItem" SET "status" = 'IN_REVIEW', "assignedOperatorId" = ${operatorId}, "claimedAt" = now()
      WHERE "id" IN (SELECT "id" FROM "ModerationItem" WHERE "tenantId" = ${op.tenantId} AND "status" = 'PENDING' ORDER BY "priority" DESC, "createdAt" ASC LIMIT ${room} FOR UPDATE SKIP LOCKED)`
  }
  return myItems(operatorId)
}

export async function myItems(operatorId: string) {
  return db.moderationItem.findMany({ where: { assignedOperatorId: operatorId, status: 'IN_REVIEW' }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }], select: { id: true, kind: true, subjectExternalId: true, content: true, mediaUrl: true, flagReason: true, language: true, priority: true, createdAt: true } })
}

async function categoriesOf(tenantId: string) {
  return (await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { moderationCategories: true } })).moderationCategories
}

function checkVerdict(verdict: 'APPROVE' | 'REJECT' | 'ESCALATE', category: string | null | undefined, note: string | null | undefined, allowed: string[]) {
  if (verdict === 'REJECT') {
    if (!category || !allowed.includes(category)) throw new ModerationError(`Choose a violation category: ${allowed.join(', ')}`)
  }
  if (verdict === 'ESCALATE' && (!note || note.trim().length < 3)) throw new ModerationError('Explain why you are escalating')
  if (note && note.length > 2000) throw new ModerationError('Note is too long')
}

export async function decide(i: { operatorId: string; userId: string; itemId: string; verdict: 'APPROVE' | 'REJECT' | 'ESCALATE'; category?: string | null; note?: string | null }) {
  const item = await db.moderationItem.findUnique({ where: { id: i.itemId } })
  if (!item) throw new ModerationError('Item not found', 404)
  const op = await db.operator.findUniqueOrThrow({ where: { id: i.operatorId }, select: { tenantId: true } })
  if (item.tenantId !== op.tenantId || item.assignedOperatorId !== i.operatorId || item.status !== 'IN_REVIEW') throw new ModerationError('Item not found', 404) // same answer for "not yours"
  checkVerdict(i.verdict, i.category, i.note, await categoriesOf(item.tenantId))
  const final = i.verdict === 'ESCALATE' ? 'ESCALATED' : 'DECIDED'
  await db.$transaction(async (tx) => {
    const claimed = await tx.moderationItem.updateMany({ where: { id: item.id, status: 'IN_REVIEW', assignedOperatorId: i.operatorId }, data: { status: final, decidedAt: new Date() } })
    if (claimed.count === 0) throw new ModerationError('Item not found', 404)
    await tx.moderationDecision.create({ data: { itemId: item.id, tenantId: item.tenantId, operatorId: i.operatorId, userId: i.userId, verdict: i.verdict, category: i.verdict === 'REJECT' ? i.category! : null, note: i.note?.trim() || null } })
  })
  await writeAuditLog({ tenantId: item.tenantId, actorUserId: i.userId, action: 'moderation.decided', resource: 'moderation_item', resourceId: item.id, metadata: { verdict: i.verdict, category: i.category ?? null } }) // never the content
  return { id: item.id, status: final }
}

export async function releaseItem(operatorId: string, itemId: string) {
  const r = await db.moderationItem.updateMany({ where: { id: itemId, assignedOperatorId: operatorId, status: 'IN_REVIEW' }, data: { status: 'PENDING', assignedOperatorId: null, claimedAt: null } })
  if (r.count === 0) throw new ModerationError('Item not found', 404)
}

/** A supervisor or manager closes an escalated item. */
export async function resolveEscalation(i: { userId: string; tenantId: string; itemId: string; verdict: 'APPROVE' | 'REJECT'; category?: string | null; note?: string | null }) {
  const item = await db.moderationItem.findFirst({ where: { id: i.itemId, tenantId: i.tenantId, status: 'ESCALATED' } })
  if (!item) throw new ModerationError('Escalated item not found', 404)
  checkVerdict(i.verdict, i.category, i.note, await categoriesOf(i.tenantId))
  await db.$transaction(async (tx) => {
    const r = await tx.moderationItem.updateMany({ where: { id: item.id, status: 'ESCALATED' }, data: { status: 'DECIDED', decidedAt: new Date() } })
    if (r.count === 0) throw new ModerationError('Escalated item not found', 404)
    await tx.moderationDecision.create({ data: { itemId: item.id, tenantId: i.tenantId, operatorId: null, userId: i.userId, verdict: i.verdict, category: i.verdict === 'REJECT' ? i.category! : null, note: i.note?.trim() || null } })
  })
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.userId, action: 'moderation.escalation_resolved', resource: 'moderation_item', resourceId: item.id, metadata: { verdict: i.verdict } })
}

// ---- warnings / restrictions -------------------------------------------------------------------------------------------

export async function requestAction(i: { tenantId: string; userId: string; subjectExternalId: string; kind: 'WARNING' | 'RESTRICTION' | 'BAN'; itemId?: string | null; reason: string }) {
  if (i.reason.trim().length < 5) throw new ModerationError('Give a reason')
  if (i.itemId && !(await db.moderationItem.findFirst({ where: { id: i.itemId, tenantId: i.tenantId, subjectExternalId: i.subjectExternalId }, select: { id: true } }))) throw new ModerationError('Item not found for that person', 404)
  const a = await db.moderationAction.create({ data: { tenantId: i.tenantId, subjectExternalId: i.subjectExternalId, kind: i.kind, itemId: i.itemId ?? null, reason: i.reason.slice(0, 2000), requestedByUserId: i.userId } })
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.userId, action: 'moderation.action_requested', resource: 'moderation_action', resourceId: a.id, metadata: { kind: i.kind } })
  return a
}

/** Warnings can be confirmed by anyone who manages moderation; restrictions and bans likewise - never by the operator who requested it. */
export async function decideAction(i: { tenantId: string; userId: string; actionId: string; applied: boolean }) {
  const a = await db.moderationAction.findFirst({ where: { id: i.actionId, tenantId: i.tenantId, status: 'REQUESTED' } })
  if (!a) throw new ModerationError('Request not found', 404)
  if (a.requestedByUserId === i.userId) throw new ModerationError('Someone else must confirm your request', 403)
  const r = await db.moderationAction.updateMany({ where: { id: a.id, status: 'REQUESTED' }, data: { status: i.applied ? 'APPLIED' : 'REJECTED', decidedByUserId: i.userId, decidedAt: new Date() } })
  if (r.count === 0) throw new ModerationError('Request not found', 404)
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.userId, action: i.applied ? 'moderation.action_applied' : 'moderation.action_rejected', resource: 'moderation_action', resourceId: a.id, metadata: { kind: a.kind } })
}

// ---- appeals -----------------------------------------------------------------------------------------------------------

export async function createAppeal(i: { tenantId: string; externalItemId: string; kind: IngestItem['kind']; reason: string }) {
  if (i.reason.trim().length < 5) throw new ModerationError('Explain the appeal')
  const item = await db.moderationItem.findUnique({ where: { tenantId_kind_externalItemId: { tenantId: i.tenantId, kind: i.kind, externalItemId: i.externalItemId } } })
  if (!item || item.status !== 'DECIDED') throw new ModerationError('Only a decided item can be appealed', 409)
  if (await db.moderationAppeal.findFirst({ where: { itemId: item.id, status: 'OPEN' }, select: { id: true } })) throw new ModerationError('An appeal for this item is already open', 409)
  return db.moderationAppeal.create({ data: { tenantId: i.tenantId, itemId: item.id, subjectExternalId: item.subjectExternalId, reason: i.reason.slice(0, 2000) } })
}

/** Four-eyes: whoever decided the item (or an earlier appeal of it) can never decide its appeal. */
export async function decideAppeal(i: { tenantId: string; userId: string; appealId: string; outcome: 'UPHELD' | 'OVERTURNED'; note?: string | null; category?: string | null }) {
  const appeal = await db.moderationAppeal.findFirst({ where: { id: i.appealId, tenantId: i.tenantId, status: 'OPEN' } })
  if (!appeal) throw new ModerationError('Appeal not found', 404)
  const prior = await db.moderationDecision.findMany({ where: { itemId: appeal.itemId }, orderBy: { createdAt: 'asc' } })
  if (prior.some((d) => d.userId === i.userId)) throw new ModerationError('A different reviewer must decide this appeal', 403)
  const last = prior[prior.length - 1]
  await db.$transaction(async (tx) => {
    const r = await tx.moderationAppeal.updateMany({ where: { id: appeal.id, status: 'OPEN' }, data: { status: i.outcome, decidedByUserId: i.userId, note: i.note?.slice(0, 2000) ?? null, decidedAt: new Date() } })
    if (r.count === 0) throw new ModerationError('Appeal not found', 404)
    if (i.outcome === 'OVERTURNED') {
      const verdict = last?.verdict === 'REJECT' ? 'APPROVE' : 'REJECT'
      if (verdict === 'REJECT') checkVerdict('REJECT', i.category, i.note, (await tx.tenant.findUniqueOrThrow({ where: { id: i.tenantId }, select: { moderationCategories: true } })).moderationCategories)
      await tx.moderationDecision.create({ data: { itemId: appeal.itemId, tenantId: i.tenantId, userId: i.userId, verdict, category: verdict === 'REJECT' ? i.category! : null, note: `Appeal overturned${i.note ? `: ${i.note}` : ''}` } })
    }
  })
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.userId, action: 'moderation.appeal_decided', resource: 'moderation_appeal', resourceId: appeal.id, metadata: { outcome: i.outcome } })
}

// ---- history and overview ----------------------------------------------------------------------------------------------

export async function subjectHistory(tenantId: string, subjectExternalId: string) {
  const [items, actions, appeals] = await Promise.all([
    db.moderationItem.findMany({ where: { tenantId, subjectExternalId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.moderationAction.findMany({ where: { tenantId, subjectExternalId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, kind: true, status: true, reason: true, createdAt: true } }),
    db.moderationAppeal.findMany({ where: { tenantId, subjectExternalId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, status: true, createdAt: true } }),
  ])
  const decisions = await db.moderationDecision.findMany({ where: { itemId: { in: items.map((x) => x.id) } }, orderBy: { createdAt: 'asc' }, select: { itemId: true, verdict: true, category: true, note: true, createdAt: true } })
  return { items: items.map((x) => ({ id: x.id, kind: x.kind, status: x.status, content: x.content, flagReason: x.flagReason, createdAt: x.createdAt, decisions: decisions.filter((d) => d.itemId === x.id) })), actions, appeals }
}

export async function overview(tenantId: string, operatorIds?: string[]) {
  const since = new Date(Date.now() - 7 * 86_400_000)
  const [byStatus, decisions, openActions, openAppeals, escalated] = await Promise.all([
    db.moderationItem.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
    db.moderationDecision.groupBy({ by: ['operatorId', 'verdict'], where: { tenantId, createdAt: { gte: since }, operatorId: operatorIds ? { in: operatorIds } : { not: null } }, _count: { _all: true } }),
    db.moderationAction.findMany({ where: { tenantId, status: 'REQUESTED' }, orderBy: { createdAt: 'asc' }, take: 50 }),
    db.moderationAppeal.findMany({ where: { tenantId, status: 'OPEN' }, orderBy: { createdAt: 'asc' }, take: 50 }),
    db.moderationItem.findMany({ where: { tenantId, status: 'ESCALATED' }, orderBy: { decidedAt: 'asc' }, take: 50, select: { id: true, kind: true, subjectExternalId: true, content: true, mediaUrl: true, flagReason: true } }),
  ])
  const ops = await db.operator.findMany({ where: { id: { in: [...new Set(decisions.map((d) => d.operatorId).filter((x): x is string => !!x))] } }, select: { id: true, operatorNumber: true, user: { select: { displayName: true } } } })
  const perOperator = ops.map((o) => {
    const mine = decisions.filter((d) => d.operatorId === o.id)
    const n = (v: string) => mine.filter((d) => d.verdict === v).reduce((a, d) => a + d._count._all, 0)
    const total = n('APPROVE') + n('REJECT') + n('ESCALATE')
    return { operatorId: o.id, number: o.operatorNumber, name: o.user.displayName, decisions: total, approved: n('APPROVE'), rejected: n('REJECT'), escalated: n('ESCALATE'), rejectRatePct: total ? Math.round((n('REJECT') / total) * 100) : null }
  })
  const count = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0
  return { queue: { pending: count('PENDING'), inReview: count('IN_REVIEW'), escalated: count('ESCALATED'), decided: count('DECIDED') }, perOperator, escalated, openActions, openAppeals }
}
