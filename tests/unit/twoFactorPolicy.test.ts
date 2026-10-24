import { describe, it, expect } from 'vitest'
import { rolesRequiringTwoFactor, twoFactorEnrolmentRequired } from '@/lib/auth/twoFactorPolicy'

describe('two-factor policy (finding F2)', () => {
  it('is off when the setting is empty or missing', () => {
    expect(rolesRequiringTwoFactor('').size).toBe(0)
    expect(rolesRequiringTwoFactor(undefined).size).toBe(rolesRequiringTwoFactor(process.env.REQUIRE_TWO_FACTOR_ROLES).size)
    expect(twoFactorEnrolmentRequired('CEO_ADMIN', null, '')).toBe(false)
  })
  it('parses a role list, ignoring case, spaces and unknown names', () => {
    expect([...rolesRequiringTwoFactor(' ceo_admin , Manager,NOPE,, cto ')].sort()).toEqual(['CEO_ADMIN', 'CTO', 'MANAGER'])
  })
  it('requires enrolment only for listed roles that have no two-factor yet', () => {
    const raw = 'CEO_ADMIN,MANAGER'
    expect(twoFactorEnrolmentRequired('CEO_ADMIN', null, raw)).toBe(true)
    expect(twoFactorEnrolmentRequired('CEO_ADMIN', new Date(), raw)).toBe(false)
    expect(twoFactorEnrolmentRequired('OPERATOR', null, raw)).toBe(false)
    expect(twoFactorEnrolmentRequired('CLIENT', null, raw)).toBe(false)
  })
})
