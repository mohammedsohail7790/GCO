import { describe, it, expect } from 'vitest'
import { SECURITY_SECTIONS, SECURITY_CLOSING } from '@/lib/content/security'

const text = JSON.stringify(SECURITY_SECTIONS)

describe('security page content (verified controls only)', () => {
  it('covers the nine approved areas, each with concrete points', () => {
    expect(SECURITY_SECTIONS.map((s) => s.title)).toEqual([
      'Access control', 'Client and tenant isolation', 'Transport security', 'Auditability', 'Webhook security', 'Rate limiting', 'Backups', 'Monitoring', 'Operational data handling',
    ])
    for (const s of SECURITY_SECTIONS) {
      expect(s.points.length, s.id).toBeGreaterThanOrEqual(2)
      expect(s.body.length, s.id).toBeGreaterThan(40)
    }
  })

  it('ends with the approved onboarding sentence', () => {
    expect(SECURITY_CLOSING).toBe('Additional security and data-handling requirements can be reviewed during onboarding.')
  })

  it.each([
    [/SOC ?2|ISO ?27001|\bISO\b|PCI|HIPAA/i, 'compliance frameworks'],
    [/certif(ied|ication)|attest|compliant|compliance/i, 'certifications / compliance claims'],
    [/encrypt(ed|ion)? at rest|at-rest/i, 'encryption at rest (unverified)'],
    [/\bMFA\b|multi-?factor|two-?factor|2FA/i, 'MFA (unverified)'],
    [/penetration|pen-?test|security audit by|bug bounty/i, 'pen-testing (unverified)'],
    [/\d+(\.\d+)?\s?%|99\.\d|uptime|\bSLA\b/i, 'figures / SLAs'],
    [/guarantee|military|bank-grade|unbreakable|100% secure/i, 'absolute claims'],
    [/data residency|stored in (the )?(EU|Europe)|GDPR/i, 'residency / GDPR claims'],
  ])('makes no unverified claim: %s (%s)', (re) => {
    expect(text).not.toMatch(re)
  })

  it('uses careful phrasing ("uses role-based access controls")', () => {
    expect(SECURITY_SECTIONS[0]!.body).toMatch(/GCO uses role-based access controls/)
  })
})
