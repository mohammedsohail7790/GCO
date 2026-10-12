import { describe, it, expect, beforeAll } from 'vitest'
import { base32Decode, base32Encode, hotp, totpAt, verifyTotp, generateSecret, otpauthUri } from '@/lib/auth/totp'
import { encryptSecret, decryptSecret } from '@/lib/auth/secretBox'

// RFC 6238 appendix B (SHA-1, secret "12345678901234567890"); the RFC lists 8 digits, the last 6 are the 6-digit code.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))
const VECTORS: [number, string][] = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]

describe('TOTP (RFC 6238)', () => {
  it.each(VECTORS)('matches the RFC vector at t=%i', (t, eight) => {
    expect(totpAt(RFC_SECRET, t * 1000)).toBe(eight.slice(2))
    expect(hotp(base32Decode(RFC_SECRET), Math.floor(t / 30), 8)).toBe(eight)
  })
  it('base32 round-trips and rejects junk', () => {
    const b = Buffer.from([0, 1, 2, 250, 255, 7, 8, 9, 10, 11])
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true)
    expect(() => base32Decode('not*base32')).toThrow()
    expect(generateSecret()).toMatch(/^[A-Z2-7]{32}$/)
  })
  it('accepts the current and adjacent steps, rejects further drift, junk and replays', () => {
    const now = 1_700_000_000_000
    const cur = totpAt(RFC_SECRET, now)
    expect(verifyTotp(RFC_SECRET, cur, now, null)).toBe(Math.floor(now / 30000))
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 30000), now, null)).not.toBeNull()
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + 30000), now, null)).not.toBeNull()
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 90000), now, null)).toBeNull()
    expect(verifyTotp(RFC_SECRET, '12345', now, null)).toBeNull()
    expect(verifyTotp(RFC_SECRET, 'abcdef', now, null)).toBeNull()
    const step = Math.floor(now / 30000)
    expect(verifyTotp(RFC_SECRET, cur, now, step)).toBeNull() // already used
    expect(verifyTotp(RFC_SECRET, cur, now, step - 1)).toBe(step)
    expect(verifyTotp(RFC_SECRET, `${cur.slice(0, 3)} ${cur.slice(3)}`, now, null)).toBe(step) // spaces tolerated
  })
  it('builds a standard otpauth URI', () => {
    expect(otpauthUri('ABC', 'a@b.co')).toBe('otpauth://totp/GCO:a%40b.co?secret=ABC&issuer=GCO&algorithm=SHA1&digits=6&period=30')
  })
})

describe('secret box', () => {
  beforeAll(() => { process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'unit-test-auth-secret-0123456789' })
  it('round-trips, is randomised, and detects tampering', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP'), b = encryptSecret('JBSWY3DPEHPK3PXP')
    expect(a).not.toBe(b)
    expect(a).not.toContain('JBSWY3DPEHPK3PXP')
    expect(decryptSecret(a)).toBe('JBSWY3DPEHPK3PXP')
    const parts = a.split(':'); parts[3] = Buffer.from('x'.repeat(16)).toString('base64')
    expect(() => decryptSecret(parts.join(':'))).toThrow()
  })
})
