import { db } from '@/lib/db/client'
import { rankOperators, computeRespondsBy, type OperatorCandidate } from './policy'
import { scheduleAssignmentTimeoutCheck, cancelAssignmentTimeoutCheck } from '@/lib/queue/jobs'
import { writeAuditLog } from '@/lib/audit/log'
import { publishRealtimeEvent } from '@/lib/realtime/publish'
import { consecutiveSlaExpiries, getSlaCap, SLA_CAP_RESUME_EVENT } from './slaCap'

type AssignOutcome = { id: string } | 'operator_full' | 'conversation_taken'

/**
 * Creates the assignment for one operator, enforcing the operator's capacity.
 *
 * Capacity race: the candidate counts read before this call are only advisory. With several workers assigning
 * different conversations at once, each could read "1 of 2 used" and all create an assignment, exceeding capacity.
 * So the transaction first takes a transaction-scoped Postgres advisory lock keyed on the operator, then re-reads
 * the operator and re-counts its ACTIVE assignments; the lock is released at commit/rollback, so the next waiter's
 * re-count sees every committed assignment (READ COMMITTED takes a fresh snapshot per statement).
 *
 * Deadlock safety: a transaction takes exactly ONE advisory lock (its operator) and only then touches the
 * conversation row; nothing takes a conversation row and then asks for an operator lock, so there is no lock cycle.
 * Tenant isolation: the operator must belong to the conversation's tenant.
 */
async function assignToOperator(p: {
  tenantId: string
  conversationId: string
  operatorId: string
  slaSeconds: number
  now: Date
  respondsBy: Date
}): Promise<AssignOutcome> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('gco:operator-capacity'), hashtext(${p.operatorId}))`

    const operator = await tx.operator.findFirst({
      where: { id: p.operatorId, tenantId: p.tenantId, status: 'AVAILABLE' },
      select: { capacity: true },
    })
    if (!operator) return 'operator_full' as const
    const active = await tx.assignment.count({ where: { operatorId: p.operatorId, status: 'ACTIVE' } })
    if (active >= operator.capacity) return 'operator_full' as const

    const created = await tx.assignment.create({
      data: {
        tenantId: p.tenantId,
        conversationId: p.conversationId,
        operatorId: p.operatorId,
        slaSeconds: p.slaSeconds,
        assignedAt: p.now,
        respondsBy: p.respondsBy,
      },
    })

    // Conditional update prevents a race where two workers both pass the
    // "currentAssignmentId is null" check and both try to win the same conversation.
    const updateResult = await tx.conversation.updateMany({
      where: { id: p.conversationId, currentAssignmentId: null },
      data: { currentAssignmentId: created.id, state: 'ACTIVE' },
    })
    if (updateResult.count === 0) {
      // Lost the race - undo the assignment we just created.
      await tx.assignment.delete({ where: { id: created.id } })
      return 'conversation_taken' as const
    }

    await tx.assignmentHistoryEntry.create({
      data: { assignmentId: created.id, event: 'created', metadata: { operatorId: p.operatorId } },
    })
    return { id: created.id }
  })
}

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

  // Best candidate first. The counts above are only a pre-filter (they can be stale by the time we act): the
  // authoritative capacity check happens under a per-operator lock inside the transaction below.
  const ranked = rankOperators(candidates)
  if (ranked.length === 0) {
    // No eligible operator right now - conversation stays QUEUED, a future
    // operator status change or queue sweep will retry.
    return false
  }

  const now = new Date()
  const slaSeconds = tenant.defaultResponseSlaSeconds
  const respondsBy = computeRespondsBy(now, slaSeconds)

  let assignment: { id: string } | null = null
  let chosenOperatorId = ''
  for (const candidate of ranked) {
    const outcome = await assignToOperator({
      tenantId: conversation.tenantId,
      conversationId: conversation.id,
      operatorId: candidate.operatorId,
      slaSeconds,
      now,
      respondsBy,
    })
    if (outcome === 'conversation_taken') return false // another worker assigned this conversation first
    if (outcome === 'operator_full') continue // lost the capacity race for this operator - try the next best
    assignment = outcome
    chosenOperatorId = candidate.operatorId
    break
  }
  if (!assignment) return false

  await scheduleAssignmentTimeoutCheck(assignment.id, respondsBy.getTime() - Date.now())
  await publishRealtimeEvent(conversation.tenantId, 'assignment.created', {
    conversationId: conversation.id,
    assignmentId: assignment.id,
    operatorId: chosenOperatorId,
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
 *
 * Atomic and idempotent: the ACTIVE -> EXPIRED transition is a conditional update, so two workers (or a retried job)
 * cannot both expire the same assignment, write duplicate audit rows, or both reassign. A no-op if the assignment is no
 * longer ACTIVE.
 *
 * Capped: after SLA_MAX_CONSECUTIVE_EXPIRIES consecutive expiries (see lib/assignment/slaCap.ts) the conversation is NOT
 * reassigned again. It moves to the EXPIRED state and a single content-free escalation is recorded (audit + SystemEvent +
 * realtime). Only the worker that actually performed the expiry reaches that code, so escalation is recorded once.
 */
export async function expireAssignment(assignmentId: string) {
  const assignment = await db.assignment.findUnique({ where: { id: assignmentId } })
  if (!assignment || assignment.status !== 'ACTIVE') return

  const cap = getSlaCap()
  const outcome = await db.$transaction(async (tx) => {
    const claimed = await tx.assignment.updateMany({
      where: { id: assignmentId, status: 'ACTIVE' },
      data: { status: 'EXPIRED', expiredAt: new Date(), releaseReason: 'sla_timeout' },
    })
    if (claimed.count === 0) return null // another worker expired it first
    await tx.assignmentHistoryEntry.create({ data: { assignmentId, event: 'expired', metadata: { reason: 'sla_timeout' } } })
    const { count } = await consecutiveSlaExpiries(tx, assignment.conversationId)
    const capped = count >= cap
    await tx.conversation.updateMany({
      where: { id: assignment.conversationId, currentAssignmentId: assignmentId },
      data: { currentAssignmentId: null, state: capped ? 'EXPIRED' : 'REASSIGNING' },
    })
    return { count, capped }
  })
  if (!outcome) return

  await writeAuditLog({
    tenantId: assignment.tenantId,
    action: 'assignment.expired',
    resource: 'assignment',
    resourceId: assignment.id,
    metadata: { conversationId: assignment.conversationId, operatorId: assignment.operatorId, consecutiveExpiries: outcome.count },
  })
  await publishRealtimeEvent(assignment.tenantId, 'assignment.expired', {
    conversationId: assignment.conversationId,
    assignmentId: assignment.id,
  })

  if (outcome.capped) {
    // Automatic reassignment stops here. Distinct from an ordinary expiry so monitoring can tell them apart.
    await writeAuditLog({
      tenantId: assignment.tenantId,
      action: 'conversation.sla_escalated',
      resource: 'conversation',
      resourceId: assignment.conversationId,
      metadata: { consecutiveExpiries: outcome.count, cap },
    })
    await db.systemEvent
      .create({
        data: {
          category: 'sla',
          severity: 'warning',
          message: 'Conversation reached the SLA reassignment cap - manager attention required',
          metadata: { tenantId: assignment.tenantId, conversationId: assignment.conversationId, consecutiveExpiries: outcome.count, cap },
        },
      })
      .catch(() => null)
    // Deliberately NOT published on the tenant realtime channel (CLIENT sockets share it): an SLA failure is internal
    // operations information. Managers see it through the needs-attention list, which polls.
    return
  }

  // Immediately attempt reassignment; if no operator is free the conversation
  // simply stays in REASSIGNING/queue until one is.
  await tryAssignConversation(assignment.conversationId)
}

/** Manual reassignment triggered by a manager/assistant (e.g. operator went offline). */
export async function manualReassign(conversationId: string, actorUserId: string, reason: string) {
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })
  if (conversation.state === 'EXPIRED') {
    // Resuming an SLA-capped conversation: record the boundary that resets the consecutive-expiry counter, so the
    // resumed conversation gets a fresh set of attempts instead of being capped again after one more expiry.
    const last = await db.assignment.findFirst({ where: { conversationId }, orderBy: { assignedAt: 'desc' }, select: { id: true } })
    if (last) {
      await db.assignmentHistoryEntry.create({ data: { assignmentId: last.id, event: SLA_CAP_RESUME_EVENT, actorUserId, metadata: { reason } } })
    }
  }
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
