import { describe, it, expect } from 'vitest'
import { runRateProjection } from '@/lib/executive/overview'

describe('run-rate projection', () => {
  it('extrapolates month-to-date to the month at the current daily rate', () => {
    // 10 days elapsed of a 31-day month, 1000 so far -> 3100
    expect(runRateProjection(1000, new Date('2026-10-11T00:00:00Z'))).toBe(3100)
  })
  it('never divides by less than a day, and is zero with no revenue', () => {
    expect(runRateProjection(500, new Date('2026-10-01T01:00:00Z'))).toBeGreaterThan(0)
    expect(runRateProjection(0, new Date('2026-10-20T00:00:00Z'))).toBe(0)
  })
})
