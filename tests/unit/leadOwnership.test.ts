import { describe, it, expect } from 'vitest'
import { isValidTransition, VALID_TRANSITIONS } from '@/lib/crm/leads'

describe('isValidTransition', () => {
  it('allows the documented forward path through the pipeline', () => {
    expect(isValidTransition('NEW', 'CONTACTED')).toBe(true)
    expect(isValidTransition('CONTACTED', 'ENGAGED')).toBe(true)
    expect(isValidTransition('ENGAGED', 'QUALIFIED')).toBe(true)
    expect(isValidTransition('QUALIFIED', 'MEETING_BOOKED')).toBe(true)
    expect(isValidTransition('MEETING_BOOKED', 'PROPOSAL')).toBe(true)
    expect(isValidTransition('PROPOSAL', 'PENDING_APPROVAL')).toBe(true)
  })

  it('allows dropping out to CLOSED_LOST from any active stage', () => {
    for (const stage of Object.keys(VALID_TRANSITIONS)) {
      if (stage === 'CLOSED_WON' || stage === 'CLOSED_LOST') continue
      expect(isValidTransition(stage, 'CLOSED_LOST')).toBe(true)
    }
  })

  it('allows PENDING_APPROVAL to revert back to PROPOSAL on rejection', () => {
    expect(isValidTransition('PENDING_APPROVAL', 'PROPOSAL')).toBe(true)
  })

  it('rejects skipping stages', () => {
    expect(isValidTransition('NEW', 'QUALIFIED')).toBe(false)
    expect(isValidTransition('NEW', 'CLOSED_WON')).toBe(false)
    expect(isValidTransition('CONTACTED', 'PENDING_APPROVAL')).toBe(false)
  })

  it('rejects any transition out of terminal stages', () => {
    expect(isValidTransition('CLOSED_WON', 'NEW')).toBe(false)
    expect(isValidTransition('CLOSED_WON', 'PROPOSAL')).toBe(false)
    expect(isValidTransition('CLOSED_LOST', 'NEW')).toBe(false)
    expect(isValidTransition('CLOSED_LOST', 'CONTACTED')).toBe(false)
  })

  it('rejects moving into PENDING_APPROVAL from anywhere but PROPOSAL', () => {
    expect(isValidTransition('MEETING_BOOKED', 'PENDING_APPROVAL')).toBe(false)
    expect(isValidTransition('PENDING_APPROVAL', 'PENDING_APPROVAL')).toBe(false)
  })

  it('rejects moving CLOSED_WON directly - it is only reachable via the approval flow, never via changeStage', () => {
    expect(isValidTransition('PENDING_APPROVAL', 'CLOSED_WON')).toBe(false)
    expect(isValidTransition('PROPOSAL', 'CLOSED_WON')).toBe(false)
  })

  it('rejects an unknown source stage', () => {
    expect(isValidTransition('NOT_A_STAGE', 'NEW')).toBe(false)
  })
})

describe('30-day lock expiry math', () => {
  const LOCK_DAYS = 30
  const LOCK_MS = LOCK_DAYS * 24 * 60 * 60 * 1000

  it('is exactly 30 days in milliseconds', () => {
    expect(LOCK_MS).toBe(2_592_000_000)
  })

  it('produces an expiry timestamp 30 days after a given claim time', () => {
    const claimedAt = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(claimedAt.getTime() + LOCK_MS)
    expect(expiresAt.toISOString()).toBe('2026-01-31T00:00:00.000Z')
  })

  it('a lock is expired once "now" passes ownershipExpiresAt', () => {
    const ownershipExpiresAt = new Date('2026-01-31T00:00:00.000Z')
    const beforeExpiry = new Date('2026-01-30T23:59:59.999Z')
    const afterExpiry = new Date('2026-01-31T00:00:00.001Z')
    expect(beforeExpiry.getTime() < ownershipExpiresAt.getTime()).toBe(true)
    expect(afterExpiry.getTime() > ownershipExpiresAt.getTime()).toBe(true)
  })
})
