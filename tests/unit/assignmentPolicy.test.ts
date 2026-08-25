import { describe, it, expect } from 'vitest'
import { pickOperator, computeRespondsBy, isExpired, type OperatorCandidate } from '@/lib/assignment/policy'

describe('pickOperator', () => {
  it('returns null when no operators are available', () => {
    const candidates: OperatorCandidate[] = [
      { operatorId: 'a', capacity: 2, activeAssignmentCount: 0, status: 'OFFLINE' },
      { operatorId: 'b', capacity: 2, activeAssignmentCount: 2, status: 'AVAILABLE' },
    ]
    expect(pickOperator(candidates)).toBeNull()
  })

  it('never picks an operator at or over capacity', () => {
    const candidates: OperatorCandidate[] = [
      { operatorId: 'a', capacity: 2, activeAssignmentCount: 2, status: 'AVAILABLE' },
    ]
    expect(pickOperator(candidates)).toBeNull()
  })

  it('prefers the operator with the most spare capacity', () => {
    const candidates: OperatorCandidate[] = [
      { operatorId: 'a', capacity: 2, activeAssignmentCount: 1, status: 'AVAILABLE' }, // spare 1
      { operatorId: 'b', capacity: 2, activeAssignmentCount: 0, status: 'AVAILABLE' }, // spare 2
    ]
    expect(pickOperator(candidates)?.operatorId).toBe('b')
  })

  it('breaks ties deterministically by operatorId', () => {
    const candidates: OperatorCandidate[] = [
      { operatorId: 'z', capacity: 2, activeAssignmentCount: 0, status: 'AVAILABLE' },
      { operatorId: 'a', capacity: 2, activeAssignmentCount: 0, status: 'AVAILABLE' },
    ]
    expect(pickOperator(candidates)?.operatorId).toBe('a')
  })

  it('ignores BUSY and PAUSED operators even with spare capacity', () => {
    const candidates: OperatorCandidate[] = [
      { operatorId: 'a', capacity: 2, activeAssignmentCount: 0, status: 'BUSY' },
      { operatorId: 'b', capacity: 2, activeAssignmentCount: 0, status: 'PAUSED' },
    ]
    expect(pickOperator(candidates)).toBeNull()
  })
})

describe('SLA timer', () => {
  it('computes the deadline as assignedAt + slaSeconds', () => {
    const assignedAt = new Date('2026-01-01T00:00:00Z')
    const respondsBy = computeRespondsBy(assignedAt, 120)
    expect(respondsBy.toISOString()).toBe('2026-01-01T00:02:00.000Z')
  })

  it('is not expired before the deadline', () => {
    const respondsBy = new Date('2026-01-01T00:02:00Z')
    const now = new Date('2026-01-01T00:01:59Z')
    expect(isExpired(respondsBy, now)).toBe(false)
  })

  it('is expired at or after the deadline', () => {
    const respondsBy = new Date('2026-01-01T00:02:00Z')
    expect(isExpired(respondsBy, new Date('2026-01-01T00:02:00Z'))).toBe(true)
    expect(isExpired(respondsBy, new Date('2026-01-01T00:02:01Z'))).toBe(true)
  })
})
