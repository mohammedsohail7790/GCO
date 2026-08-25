// Pure, dependency-free assignment policy logic - kept separate from engine.ts
// (which does DB/queue I/O) so it can be unit tested without a database.

export interface OperatorCandidate {
  operatorId: string
  capacity: number
  activeAssignmentCount: number
  status: 'OFFLINE' | 'AVAILABLE' | 'BUSY' | 'PAUSED'
}

/**
 * Selects the next operator to receive a conversation.
 * Policy (V1, deliberately simple - see docs/decisions.md):
 *  1. Only AVAILABLE operators are eligible.
 *  2. Operator must have spare capacity (activeAssignmentCount < capacity).
 *  3. Prefer the operator with the *most* spare capacity (load balancing);
 *     ties broken by whichever has been idle longest is not tracked in V1,
 *     so we fall back to stable input order (lowest operatorId).
 */
export function pickOperator(candidates: OperatorCandidate[]): OperatorCandidate | null {
  const eligible = candidates.filter(
    (c) => c.status === 'AVAILABLE' && c.activeAssignmentCount < c.capacity,
  )
  if (eligible.length === 0) return null

  eligible.sort((a, b) => {
    const spareA = a.capacity - a.activeAssignmentCount
    const spareB = b.capacity - b.activeAssignmentCount
    if (spareB !== spareA) return spareB - spareA
    return a.operatorId.localeCompare(b.operatorId)
  })

  return eligible[0] ?? null
}

export function computeRespondsBy(assignedAt: Date, slaSeconds: number): Date {
  return new Date(assignedAt.getTime() + slaSeconds * 1000)
}

export function isExpired(respondsBy: Date, now: Date = new Date()): boolean {
  return now.getTime() >= respondsBy.getTime()
}
