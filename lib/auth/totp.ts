import crypto from 'crypto'

// RFC 6238 time-based one-time passwords (HMAC-SHA1, 6 digits, 30-second steps) - what every authenticator app implements.
// No dependency: HOTP/TOTP are ~20 lines over node:crypto, and are verified against the RFC test vectors in tests/unit/totp.test.ts.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const STEP_SECONDS = 30
export const DIGITS = 6

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = ''
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx < 0) throw new Error('Invalid base32')
    value = (value << 5) | idx; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

export const generateSecret = () => base32Encode(crypto.randomBytes(20)) // 160 bits, the RFC recommendation

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac('sha1', secret).update(msg).digest()
  const o = h[h.length - 1]! & 0xf
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!
  return String(bin % 10 ** digits).padStart(digits, '0')
}
export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS)
export const totpAt = (secretB32: string, ms: number) => hotp(base32Decode(secretB32), stepAt(ms))

const safeEqual = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

/**
 * Checks a 6-digit code against the current step and +-1 step (clock drift). Returns the matching step or null. A step <= lastUsedStep
 * is refused, so a code (even a correct one) works once.
 */
export function verifyTotp(secretB32: string, code: string, nowMs: number, lastUsedStep: number | null, window = 1): number | null {
  const clean = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  const secret = base32Decode(secretB32)
  const now = stepAt(nowMs)
  let match: number | null = null
  for (let w = -window; w <= window; w++) {
    const step = now + w
    if (safeEqual(hotp(secret, step), clean) && match === null) match = step // no early return: constant-ish work
  }
  if (match === null) return null
  if (lastUsedStep !== null && match <= lastUsedStep) return null
  return match
}

export const otpauthUri = (secretB32: string, account: string, issuer = 'GCO') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
