import type { Role } from '@prisma/client'
import { db } from '@/lib/db/client'
import { can } from '@/lib/auth/rbac'
import { writeAuditLog } from '@/lib/audit/log'
import { publishRealtimeEvent } from '@/lib/realtime/publish'

// Focused operational escalation workflow:
//
//   OPERATOR --raise--> SUPERVISOR level --escalate--> CLIENT_DECISION level
//                           |                               |
//                        resolve                         resolve (management)
//
// Roles: operators raise; MANAGER/ASSISTANT/CEO_ADMIN handle the supervisor level;
// CEO_ADMIN/ASSISTANT (GCO management) handle the client-decision level; CLIENT users
// only ever see client-facing information about escalations awaiting their decision.
// Every transition writes an EscalationEvent (timeline) AND an AuditLog row; realtime
// pushes carry an opaque reference only (never content) on the tenant channel.

export const ESCALATION_REASONS = ['DECISION_NEEDED', 'CLIENT_APPROVAL_NEEDED', 'SENSITIVE_SITUATION', 'CANNOT_RESOLVE_SAFELY'] as const
export type EscalationReasonKey = (typeof ESCALATION_REASONS)[number]

export class EscalationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export interface Actor {
  sub: string
  role: Role
  tenantId: string | null
}

const isGlobal = (r: Role) => r === 'CEO_ADMIN' || r === 'ASSISTANT'

// Unknown/foreign escalations are reported as 404, not 403, so existence never leaks across tenants.
const notFound = () => new EscalationError('Escalation not found', 404)

interface EscalationRow {
  id: string
  tenantId: string
  conversationId: string
  level: 'SUPERVISOR' | 'CLIENT_DECISION'
  status: 'OPEN' | 'CLAIMED' | 'RESOLVED'
  reason: EscalationReasonKey
  summary: string
  raisedByUserId: string
  claimedByUserId: string | null
  resolvedByUserId: string | null
  resolution: string | null
  createdAt: Date
  claimedAt: Date | null
  escalatedToClientAt: Date | null
  resolvedAt: Date | null
}

interface EventRow {
  id: string
  actorUserId: string
  action: string
  visibility: 'INTERNAL' | 'CLIENT'
  body: string | null
  createdAt: Date
}

/** Who may see this escalation at all (row-level scope). */
function canSee(actor: Actor, e: EscalationRow): boolean {
  if (isGlobal(actor.role)) return true
  if (actor.role === 'MANAGER') return !!actor.tenantId && actor.tenantId === e.tenantId
  if (actor.role === 'OPERATOR') return e.raisedByUserId === actor.sub
  if (actor.role === 'CLIENT') return !!actor.tenantId && actor.tenantId === e.tenantId && e.level === 'CLIENT_DECISION'
  return false
}

/** Role-shaped view - internal fields never reach roles that must not see them. */
function view(actor: Actor, e: EscalationRow, events?: EventRow[]) {
  if (actor.role === 'CLIENT') {
    return {
      id: e.id,
      conversationId: e.conversationId,
      level: e.level,
      status: e.status,
      reason: e.reason,
      createdAt: e.createdAt,
      escalatedToClientAt: e.escalatedToClientAt,
      resolvedAt: e.resolvedAt,
      events: (events ?? []).filter((v) => v.visibility === 'CLIENT').map((v) => ({ id: v.id, action: v.action, body: v.body, createdAt: v.createdAt })),
    }
  }
  if (actor.role === 'OPERATOR') {
    return {
      id: e.id,
      conversationId: e.conversationId,
      level: e.level,
      status: e.status,
      reason: e.reason,
      createdAt: e.createdAt,
      claimed: !!e.claimedByUserId,
      resolvedAt: e.resolvedAt,
    }
  }
  return { ...e, events: events ?? [] }
}

async function notify(e: { id: string; tenantId: string }) {
  // Opaque reference only: realtime sockets are tenant-wide (incl. CLIENT users), and the
  // receiver's correct reaction is to refetch through the RBAC-checked API.
  await publishRealtimeEvent(e.tenantId, 'ops.refresh', { ref: e.id })
}

async function audit(actor: Actor, e: { id: string; tenantId: string; level: string; status: string; reason: string }, action: string) {
  await writeAuditLog({
    tenantId: e.tenantId,
    actorUserId: actor.sub,
    action: `escalation.${action}`,
    resource: 'escalation',
    resourceId: e.id,
    // Metadata is deliberately content-free (no notes): audit logs have a wider readership than notes.
    metadata: { level: e.level, status: e.status, reason: e.reason },
  })
}

// ---- create ---------------------------------------------------------------

export async function createEscalation(actor: Actor, input: { conversationId: string; reason: EscalationReasonKey; note: string }) {
  if (!can(actor.role, 'ESCALATION_CREATE')) throw new EscalationError('Forbidden', 403)

  const operator = await db.operator.findUnique({ where: { userId: actor.sub } })
  if (!operator) throw new EscalationError('Operator profile not found', 404)

  // The operator may only escalate a conversation they currently hold - this also pins the tenant.
  const assignment = await db.assignment.findFirst({
    where: { conversationId: input.conversationId, operatorId: operator.id, status: 'ACTIVE' },
    include: { conversation: { select: { id: true, tenantId: true } } },
  })
  if (!assignment) throw new EscalationError('Conversation not found among your active conversations', 404)
  const tenantId = assignment.conversation.tenantId

  const created = await db.$transaction(async (tx) => {
    // Serialise per conversation so two concurrent escalations cannot both pass the check.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'escalation:' + input.conversationId}))`
    const open = await tx.escalation.findFirst({ where: { conversationId: input.conversationId, status: { not: 'RESOLVED' } }, select: { id: true } })
    if (open) throw new EscalationError('This conversation already has an open escalation', 409)
    const esc = await tx.escalation.create({
      data: { tenantId, conversationId: input.conversationId, reason: input.reason, summary: input.note, raisedByUserId: actor.sub },
    })
    await tx.escalationEvent.create({ data: { escalationId: esc.id, tenantId, actorUserId: actor.sub, action: 'raised', body: input.note } })
    return esc
  })

  await audit(actor, created, 'raised')
  await notify(created)
  return view(actor, created as unknown as EscalationRow)
}

// ---- read -----------------------------------------------------------------

export async function listEscalations(
  actor: Actor,
  filters: { status?: 'OPEN' | 'CLAIMED' | 'RESOLVED'; level?: 'SUPERVISOR' | 'CLIENT_DECISION'; tenantId?: string | null; includeResolved?: boolean },
) {
  const where: Record<string, unknown> = {}
  if (actor.role === 'OPERATOR') {
    where.raisedByUserId = actor.sub
    where.status = { not: 'RESOLVED' }
  } else if (actor.role === 'CLIENT') {
    if (!actor.tenantId) throw new EscalationError('Forbidden', 403)
    where.tenantId = actor.tenantId // never from the request
    where.level = 'CLIENT_DECISION'
  } else if (actor.role === 'MANAGER') {
    if (!actor.tenantId) throw new EscalationError('Forbidden', 403)
    where.tenantId = actor.tenantId
  } else if (isGlobal(actor.role)) {
    if (filters.tenantId) where.tenantId = filters.tenantId
  } else {
    throw new EscalationError('Forbidden', 403)
  }
  if (filters.status) where.status = filters.status
  else if (!filters.includeResolved && actor.role !== 'OPERATOR') where.status = { not: 'RESOLVED' }
  if (filters.level && actor.role !== 'OPERATOR') where.level = filters.level

  const rows = await db.escalation.findMany({
    where: where as any,
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 100,
    include: {
      conversation: { select: { externalUserId: true, state: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  })
  return rows.map((r) => {
    const base = view(actor, r as unknown as EscalationRow, r.events as unknown as EventRow[])
    return actor.role === 'CLIENT' || actor.role === 'OPERATOR' ? base : { ...base, conversation: r.conversation }
  })
}

export async function getEscalation(actor: Actor, id: string) {
  const e = await db.escalation.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: 'asc' } }, conversation: { select: { externalUserId: true, state: true } } } })
  if (!e || !canSee(actor, e as unknown as EscalationRow)) throw notFound()
  const base = view(actor, e as unknown as EscalationRow, e.events as unknown as EventRow[])
  if (actor.role === 'CLIENT' || actor.role === 'OPERATOR') return base

  // Supervisors/management get conversation context only where they may read conversation content at all.
  let messages: Array<{ direction: string; content: string; createdAt: Date }> = []
  if (can(actor.role, 'VIEW_CONVERSATION_CONTENT')) {
    messages = (
      await db.message.findMany({
        where: { conversationId: e.conversationId, tenantId: e.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { direction: true, content: true, createdAt: true },
      })
    ).reverse()
  }
  return { ...base, conversation: e.conversation, messages }
}

// ---- transitions ----------------------------------------------------------

export type EscalationAction =
  | { action: 'claim' }
  | { action: 'note'; body: string; visibility?: 'INTERNAL' | 'CLIENT' }
  | { action: 'escalate'; note: string; clientSummary: string }
  | { action: 'resolve'; resolution: string; clientNote?: string }

function canHandle(actor: Actor, level: EscalationRow['level']): boolean {
  return level === 'SUPERVISOR' ? can(actor.role, 'ESCALATION_HANDLE') : can(actor.role, 'ESCALATION_MANAGE_CLIENT_DECISION')
}

export async function transitionEscalation(actor: Actor, id: string, input: EscalationAction) {
  const existing = await db.escalation.findUnique({ where: { id } })
  if (!existing || !canSee(actor, existing as unknown as EscalationRow)) throw notFound()
  const e = existing as unknown as EscalationRow
  if (e.status === 'RESOLVED') throw new EscalationError('Escalation is already resolved', 409)

  // Notes are allowed to any staff who can see the escalation; everything else needs the level's handler role.
  const staff = can(actor.role, 'ESCALATION_HANDLE')
  if (input.action === 'note') {
    if (!staff) throw new EscalationError('Forbidden', 403)
    if ((input.visibility ?? 'INTERNAL') === 'CLIENT' && !(e.level === 'CLIENT_DECISION' && can(actor.role, 'ESCALATION_MANAGE_CLIENT_DECISION'))) {
      throw new EscalationError('Only management can add client-visible notes, on client-decision escalations', 403)
    }
  } else if (input.action === 'escalate') {
    if (e.level !== 'SUPERVISOR') throw new EscalationError('Already at client-decision level', 409)
    if (!canHandle(actor, 'SUPERVISOR')) throw new EscalationError('Forbidden', 403)
  } else if (!canHandle(actor, e.level)) {
    throw new EscalationError('Forbidden', 403)
  }

  const now = new Date()
  const updated = await db.$transaction(async (tx) => {
    // Re-read inside the transaction under a lock so racing transitions can't both win.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'escalation:' + e.conversationId}))`
    const fresh = (await tx.escalation.findUnique({ where: { id } })) as unknown as EscalationRow | null
    if (!fresh || fresh.status === 'RESOLVED') throw new EscalationError('Escalation is already resolved', 409)
    const ev = (data: { action: string; visibility?: 'INTERNAL' | 'CLIENT'; body?: string | null }) =>
      tx.escalationEvent.create({ data: { escalationId: id, tenantId: e.tenantId, actorUserId: actor.sub, ...data } })

    switch (input.action) {
      case 'claim': {
        if (fresh.status !== 'OPEN') throw new EscalationError('Escalation is already claimed', 409)
        const u = await tx.escalation.update({ where: { id }, data: { status: 'CLAIMED', claimedByUserId: actor.sub, claimedAt: now } })
        await ev({ action: 'claimed' })
        return u
      }
      case 'note': {
        await ev({ action: 'note', visibility: input.visibility ?? 'INTERNAL', body: input.body })
        return tx.escalation.findUniqueOrThrow({ where: { id } })
      }
      case 'escalate': {
        if (fresh.level !== 'SUPERVISOR') throw new EscalationError('Already at client-decision level', 409)
        const u = await tx.escalation.update({
          where: { id },
          data: { level: 'CLIENT_DECISION', status: 'OPEN', claimedByUserId: null, claimedAt: null, escalatedToClientAt: now },
        })
        await ev({ action: 'escalated_to_client', body: input.note })
        await ev({ action: 'note', visibility: 'CLIENT', body: input.clientSummary })
        return u
      }
      case 'resolve': {
        const u = await tx.escalation.update({
          where: { id },
          data: { status: 'RESOLVED', resolvedByUserId: actor.sub, resolvedAt: now, resolution: input.resolution },
        })
        await ev({ action: 'resolved', body: input.resolution })
        if (input.clientNote && fresh.level === 'CLIENT_DECISION') await ev({ action: 'decision', visibility: 'CLIENT', body: input.clientNote })
        return u
      }
    }
  })

  const auditAction = input.action === 'escalate' ? 'escalated_to_client' : input.action === 'resolve' ? 'resolved' : input.action === 'claim' ? 'claimed' : 'note'
  await audit(actor, updated as any, auditAction)
  await notify(updated as any)
  return getEscalation(actor, id)
}
