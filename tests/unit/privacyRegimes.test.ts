import { describe, it, expect } from 'vitest'
import { requestDeadlineDays, knownRegime, REGIMES } from '@/lib/privacy/regimes'

describe('privacy regimes', () => {
  it('uses the strictest deadline among a client\'s regimes, GDPR when none', () => {
    expect(requestDeadlineDays(['GDPR'])).toBe(30)
    expect(requestDeadlineDays(['GDPR', 'CCPA'])).toBe(30)
    expect(requestDeadlineDays(['CCPA', 'LGPD'])).toBe(15)
    expect(requestDeadlineDays([])).toBe(30)
    expect(requestDeadlineDays(['MADE_UP'])).toBe(30)
  })
  it('knows its regimes, and flags them as indicative in the notes', () => {
    expect(knownRegime('GDPR')).toBe(true)
    expect(knownRegime('SKYNET')).toBe(false)
    expect(Object.keys(REGIMES).length).toBeGreaterThanOrEqual(4)
  })
})
