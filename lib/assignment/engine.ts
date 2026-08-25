import { db } from '@/lib/db/client'
import { pickOperator, computeRespondsBy, type OperatorCandidate } from './policy'
import { scheduleAssignmentTimeoutCheck, cancelAssignmentTimeoutCheck } from '@/lib/queue/jobs'
import { writeAuditLog } from '@/lib/audit/log'
import { publishRealtimeEvent } from '@/lib/realtime/publish'

/**
 * Attempts to assign a QUEUED (or REASSIGNING) conversation to an eligible operator.
 * Race-safety: conversation.currentAssignmentId has a unique constraint, and the
 * conditional update below (`WHERE currentAssignmentId IS NULL`) ensures only one
 * concurrent caller can win the assignment for a given conversation - the loser's
 * update affects 0 rows and it retries the next tick instead of double-assigning.
 */
export async function tryAssignConversation(conversationId: string): Promise<boolean> {
  const conversation = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conversation) return false
  if (conversation.currentAssignmentId) return false // already assigned
  if (!['QUEUED', 'REASSIGNING'].includes(conversation.state)) return false

  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: conversation.tenantId } })

  const operators = await db.operator.findMany({
    where: {
      tenantId: conversation.tenantId,
      status: 'AVAILABLE',
    },
    include: {
      assignments: { where: { status: 'ACTIVE' } },
    },
  })

  const candidates: OperatorCandidate[] = operators.map((op) => ({
    operatorId: op.id,
    capacity: op.capacity,
    activeAssignmentCount: op.assignments.length,
    status: op.status,
  }))

  const chosen = pickOperator(candidates)
  if (!chosen) {
    // No eligible operator right now - conversation stays QUEUED, a future
    // operator status change or queue sweep will retry.
    return false
  }

  const now = new Date()
  const slaSeconds = tenant.defaultResponseSlaSeconds
  const respondsBy = computeRespondsBy(now, slaSeconds)

  const assignment = await db.$transaction(async (tx) => {
    const created = await tx.assignment.create({
      data: {
        tenantId: conversation.tenantId,
        conversationId: conversation.id,
        operatorId: chosen.operatorId,
        slaSeconds,
        assignedAt: now,
        respondsBy,
      },
    })

    // Conditional update prevents a race where two workers both pass the
    // "currentAssignmentId is null" check above and both try to win.
    const updateResult = await tx.conversation.updateMany({
      where: { id: conversation.id, currentAssignmentId: null },
      data: { currentAssignmentId: created.id, state: 'ACTIVE' },
    })

    if (updateResult.count === 0) {
      // Lost the race - undo the assignment we just created.
      await tx.assignment.delete({ where: { id: created.id } })
      return null
    }

    await tx.assignmentHistoryEntry.create({
      data: { assignmentId: created.id, event: 'created', metadata: { operatorId: chosen.operatorId } },
    })

    return created
  })

  if (!assignment) return false

  await scheduleAssignmentTimeoutCheck(assignment.id, respondsBy.getTime() - Date.now())
  await publishRealtimeEvent(conversation.tenantId, 'assignment.created', {
    conversationId: conversation.id,
    assignmentId: assignment.id,
    operatorId: chosen.operatorId,
  })

  return true
}

/** Called by the operator when they send a reply - closes out the SLA clock cleanly. */
export async function completeAssignment(assignmentId: string) {
  const assignment = await db.assignment.update({
    where: { id: assignmentId },
    data: { status: 'COMPLETED', respondedAt: new Date() },
  })
  await cancelAssignmentTimeoutCheck(assignmentId)
  await db.assignmentHistoryEntry.create({
    data: { assignmentId, event: 'completed' },
  })
  await db.conversation.update({
    where: { id: assignment.conversationId },
    data: { currentAssignmentId: null, state: 'WAITING_FOR_CLIENT' },
  })
  return assignment
}

/**
 * Server-side SLA expiry handler, invoked by the assignment-timeout worker.
 * Idempotent: if the assignment is no longer ACTIVE (already completed or
 * already expired by a prior run), this is a no-op.
 */
export async function expireAssignment(assignmentId: string) {
  const assignment = await db.assignment.findUnique({ where: { id: assignmentId } })
  if (!assignment || assignment.status !== 'ACTIVE') return

  await db.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: assignmentId },
      data: { status: 'EXPIRED', expiredAt: new Date(), releaseReason: 'sla_timeout' },
    })
    await tx.assignmentHistoryEntry.create({
      data: { assignmentId, event: 'expired', metadata: { reason: 'sla_timeout' } },
    })
    await tx.conversation.update({
      where: { id: assignment.conversationId },
      data: { currentAssignmentId: null, state: 'REASSIGNING' },
    })
  })

  await writeAuditLog({
    tenantId: assignment.tenantId,
    action: 'assignment.expired',
    resource: 'assignment',
    resourceId: assignment.id,
    metadata: { conversationId: assignment.conversationId, operatorId: assignment.operatorId },
  })

  await publishRealtimeEvent(assignment.tenantId, 'assignment.expired', {
    conversationId: assignment.conversationId,
    assignmentId: assignment.id,
  })

  // Immediately attempt reassignment; if no operator is free the conversation
  // simply stays in REASSIGNING/queue until one is.
  await tryAssignConversation(assignment.conversationId)
}

/** Manual reassignment triggered by a manager/assistant (e.g. operator went offline). */
export async function manualReassign(conversationId: string, actorUserId: string, reason: string) {
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })
  if (conversation.currentAssignmentId) {
    const current = await db.assignment.findUnique({ where: { id: conversation.currentAssignmentId } })
    if (current && current.status === 'ACTIVE') {
      await db.assignment.update({
        where: { id: current.id },
        data: { status: 'CANCELLED', expiredAt: new Date(), releaseReason: reason },
      })
      await cancelAssignmentTimeoutCheck(current.id)
      await db.assignmentHistoryEntry.create({
        data: { assignmentId: current.id, event: 'manually_reassigned', actorUserId, metadata: { reason } },
      })
    }
  }

  await db.conversation.update({
    where: { id: conversationId },
    data: { currentAssignmentId: null, state: 'REASSIGNING' },
  })

  await writeAuditLog({
    tenantId: conversation.tenantId,
    actorUserId,
    action: 'conversation.manual_reassign',
    resource: 'conversation',
    resourceId: conversationId,
    metadata: { reason },
  })

  return tryAssignConversation(conversationId)
}
