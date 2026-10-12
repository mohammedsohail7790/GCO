import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { publishRealtimeEvent } from '@/lib/realtime/publish'
import { cancelAssignmentTimeoutCheck } from '@/lib/queue/jobs'
import { tryAssignConversation } from '@/lib/assignment/engine'
import type { Role } from '@prisma/client'

export class LifecycleError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}
export interface Actor { userId: string; role: Role; tenantId: string | null }

/** Loads the conversation within the actor's tenant scope. Another tenant's conversation is a 404, never a 403. */
async function loadScoped(conversationId: string, actor: Actor) {
  const c = await db.conversation.findUnique({ where: { id: conversationId }, include: { currentAssignment: { include: { operator: true } } } })
  if (!c) throw new LifecycleError('Conversation not found', 404)
  const global = actor.role === 'CEO_ADMIN' || actor.role === 'ASSISTANT'
  if (!global && c.tenantId !== actor.tenantId) throw new LifecycleError('Conversation not found', 404)
  return c
}

/**
 * Resolve (close) a conversation. An OPERATOR may resolve only a conversation currently assigned to them or one
 * whose reply they sent; managers/CEO/assistant may resolve any in scope. A conversation with an unresolved
 * escalation cannot be closed (the escalation must be resolved first).
 */
export async function resolveConversation(conversationId: string, actor: Actor) {
  const c = await loadScoped(conversationId, actor)
  if (c.state === 'CLOSED') throw new LifecycleError('Conversation is already resolved', 409)

  if (actor.role === 'OPERATOR') {
    const operator = await db.operator.findUnique({ where: { userId: actor.userId }, select: { id: true } })
    const assignedToMe = !!operator && c.currentAssignment?.operatorId === operator.id
    let repliedByMe = false
    if (!assignedToMe && operator) {
      repliedByMe = !!(await db.message.findFirst({ where: { conversationId: c.id, direction: 'OUTBOUND', operatorId: operator.id }, select: { id: true } }))
    }
    if (!assignedToMe && !repliedByMe) throw new LifecycleError('Conversation not found', 404)
  }

  const openEscalation = await db.escalation.findFirst({ where: { conversationId: c.id, status: { not: 'RESOLVED' } }, select: { id: true } })
  if (openEscalation) throw new LifecycleError('Resolve the open escalation first', 409)

  const assignmentId = c.currentAssignment?.status === 'ACTIVE' ? c.currentAssignment.id : null
  await db.$transaction(async (tx) => {
    const moved = await tx.conversation.updateMany({ where: { id: c.id, state: { not: 'CLOSED' } }, data: { state: 'CLOSED', closedAt: new Date(), currentAssignmentId: null } })
    if (moved.count === 0) throw new LifecycleError('Conversation is already resolved', 409)
    if (assignmentId) {
      await tx.assignment.update({ where: { id: assignmentId }, data: { status: 'COMPLETED', releaseReason: 'resolved' } })
      await tx.assignmentHistoryEntry.create({ data: { assignmentId, event: 'resolved', actorUserId: actor.userId } })
    }
  })
  if (assignmentId) await cancelAssignmentTimeoutCheck(assignmentId).catch(() => null)
  await writeAuditLog({ tenantId: c.tenantId, actorUserId: actor.userId, action: 'conversation.resolved', resource: 'conversation', resourceId: c.id, metadata: { fromState: c.state } })
  await publishRealtimeEvent(c.tenantId, 'conversation.resolved', { conversationId: c.id }).catch(() => null)
  return { id: c.id, state: 'CLOSED' as const }
}

/** Reopen a resolved conversation: it returns to the queue and is assigned like any other. Managers/CEO/assistant only. */
export async function reopenConversation(conversationId: string, actor: Actor) {
  const c = await loadScoped(conversationId, actor)
  if (c.state !== 'CLOSED') throw new LifecycleError('Only a resolved conversation can be reopened', 409)
  const moved = await db.conversation.updateMany({ where: { id: c.id, state: 'CLOSED' }, data: { state: 'QUEUED', closedAt: null } })
  if (moved.count === 0) throw new LifecycleError('Only a resolved conversation can be reopened', 409)
  await writeAuditLog({ tenantId: c.tenantId, actorUserId: actor.userId, action: 'conversation.reopened', resource: 'conversation', resourceId: c.id })
  await publishRealtimeEvent(c.tenantId, 'conversation.reopened', { conversationId: c.id }).catch(() => null)
  await tryAssignConversation(c.id).catch(() => null)
  return { id: c.id, state: (await db.conversation.findUniqueOrThrow({ where: { id: c.id } })).state }
}

/** Internal note on a conversation (never shown to the client). Operators may note conversations they are working on. */
export async function addConversationNote(conversationId: string, actor: Actor, body: string) {
  const text = body.trim()
  if (!text) throw new LifecycleError('Note cannot be empty', 400)
  if (text.length > 2000) throw new LifecycleError('Note is too long (2000 characters max)', 400)
  const c = await loadScoped(conversationId, actor)
  if (actor.role === 'OPERATOR') {
    const operator = await db.operator.findUnique({ where: { userId: actor.userId }, select: { id: true } })
    const mine = !!operator && (c.currentAssignment?.operatorId === operator.id || !!(await db.message.findFirst({ where: { conversationId: c.id, direction: 'OUTBOUND', operatorId: operator.id }, select: { id: true } })))
    if (!mine) throw new LifecycleError('Conversation not found', 404)
  }
  const note = await db.note.create({ data: { tenantId: c.tenantId, conversationId: c.id, authorUserId: actor.userId, body: text } })
  await writeAuditLog({ tenantId: c.tenantId, actorUserId: actor.userId, action: 'conversation.note_added', resource: 'conversation', resourceId: c.id, metadata: { noteId: note.id } })
  return { id: note.id, createdAt: note.createdAt }
}
