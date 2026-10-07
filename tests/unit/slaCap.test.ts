import { describe, it, expect, afterEach } from 'vitest'
import { countLeadingSlaExpiries, getSlaCap, DEFAULT_SLA_MAX_CONSECUTIVE_EXPIRIES } from '@/lib/assignment/slaCap'

const exp = { status: 'EXPIRED', releaseReason: 'sla_timeout' }
describe('SLA cap: pure counting', () => {
  it('counts only directly consecutive sla_timeout expiries from the newest', () => {
    expect(countLeadingSlaExpiries([])).toBe(0)
    expect(countLeadingSlaExpiries([exp, exp, exp])).toBe(3)
    expect(countLeadingSlaExpiries([exp, exp, { status: 'COMPLETED', releaseReason: null }, exp, exp])).toBe(2) // operator replied: chain broken
    expect(countLeadingSlaExpiries([{ status: 'CANCELLED', releaseReason: 'manual' }, exp, exp])).toBe(0) // manual reassignment: chain broken
    expect(countLeadingSlaExpiries([{ status: 'ACTIVE', releaseReason: null }, exp, exp])).toBe(2) // an in-flight attempt does not erase earlier expiries
    expect(countLeadingSlaExpiries([{ status: 'ACTIVE', releaseReason: null }, { status: 'COMPLETED', releaseReason: null }, exp])).toBe(0)
    expect(countLeadingSlaExpiries([{ status: 'EXPIRED', releaseReason: 'other' }, exp])).toBe(0)
  })
})
describe('SLA cap: configuration', () => {
  const saved = process.env.SLA_MAX_CONSECUTIVE_EXPIRIES
  afterEach(() => (saved === undefined ? delete process.env.SLA_MAX_CONSECUTIVE_EXPIRIES : (process.env.SLA_MAX_CONSECUTIVE_EXPIRIES = saved)))
  it('defaults to 5 and rejects nonsense values', () => {
    delete process.env.SLA_MAX_CONSECUTIVE_EXPIRIES
    expect(getSlaCap()).toBe(DEFAULT_SLA_MAX_CONSECUTIVE_EXPIRIES)
    expect(DEFAULT_SLA_MAX_CONSECUTIVE_EXPIRIES).toBe(5)
    for (const v of ['0', '-1', 'abc', '', '51', '1e9']) {
      process.env.SLA_MAX_CONSECUTIVE_EXPIRIES = v
      expect(getSlaCap(), v).toBe(5)
    }
    process.env.SLA_MAX_CONSECUTIVE_EXPIRIES = '3'
    expect(getSlaCap()).toBe(3)
  })
})
