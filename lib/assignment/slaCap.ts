import type { Prisma } from '@prisma/client'

// SLA reassignment cap. By design an unanswered assignment expires after the tenant's SLA and the conversation is
// reassigned. Without a limit that cycles forever (one demo conversation produced 5,400+ expiries). After
// SLA_MAX_CONSECUTIVE_EXPIRIES consecutive expiries automatic reassignment STOPS: the conversation moves to the
// EXPIRED state ("SLA-capped, needs manager attention" - the state was previously unused) and stays visible and
// actionable until a manager resumes it or the customer writes again.
//
// The counter is DERIVED from persisted assignment rows, so it survives worker restarts and needs no extra column:
// the number of directly consecutive `sla_timeout` expiries since the latest boundary, where a boundary is the
// customer's latest inbound message or a manager's explicit resume. Any completed (operator replied) or cancelled
// (manual reassignment) assignment breaks the chain.

export const SLA_CAP_RESUME_EVENT = 'sla_cap_resumed'
export const DEFAULT_SLA_MAX_CONSECUTIVE_EXPIRIES = 5

export function getSlaCap(): number {
  const raw = process.env.SLA_MAX_CONSECUTIVE_EXPIRIES ?? ''
  const n = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN // strict: "1e9" or "5abc" must not be read as a number
  return n >= 1 && n <= 50 ? n : DEFAULT_SLA_MAX_CONSECUTIVE_EXPIRIES
}

type Client = Prisma.TransactionClient

/** Pure: how many leading assignments (newest first) are consecutive SLA expiries (an in-flight ACTIVE one is skipped). */
export function countLeadingSlaExpiries(assignmentsNewestFirst: Array<{ status: string; releaseReason: string | null }>): number {
  let n = 0
  let leading = true
  for (const a of assignmentsNewestFirst) {
    if (leading && a.status === 'ACTIVE') continue // an in-flight attempt does not erase the expiries before it
    leading = false
    if (a.status === 'EXPIRED' && a.releaseReason === 'sla_timeout') n++
    else break
  }
  return n
}

export async function consecutiveSlaExpiries(client: Client, conversationId: string): Promise<{ count: number; lastCustomerMessageAt: Date | null }> {
  const [lastInbound, lastResume] = await Promise.all([
    client.message.findFirst({ where: { conversationId, direction: 'INBOUND' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    client.assignmentHistoryEntry.findFirst({ where: { event: SLA_CAP_RESUME_EVENT, assignment: { conversationId } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ])
  // Inclusive lower bound: an assignment created in the same millisecond as the customer message belongs to it.
  // A resume boundary is moved 1 ms forward so the assignments that existed BEFORE the resume are excluded.
  const candidates = [lastInbound?.createdAt, lastResume ? new Date(lastResume.createdAt.getTime() + 1) : undefined].filter((d): d is Date => !!d)
  const boundary = candidates.sort((a, b) => b.getTime() - a.getTime())[0]
  const assignments = await client.assignment.findMany({
    where: { conversationId, ...(boundary ? { assignedAt: { gte: boundary } } : {}) },
    orderBy: { assignedAt: 'desc' },
    select: { status: true, releaseReason: true },
    take: 100,
  })
  return { count: countLeadingSlaExpiries(assignments), lastCustomerMessageAt: lastInbound?.createdAt ?? null }
}
