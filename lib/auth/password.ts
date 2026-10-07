import bcrypt from 'bcryptjs'

// The application's password hashing: bcrypt, cost 12 (the same parameters login/admin-user-creation use).
export const BCRYPT_COST = 12
export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST)

/** The password published in prisma/seed.ts, the docs and the test fixtures. It must never protect a real account. */
export const PUBLISHED_SEED_PASSWORD = 'DemoPassword123!'

const COMMON = new Set(['password1234', 'password12345', 'qwertyuiop12', 'letmein12345', '123456789012', 'administrator', 'welcome12345', 'changeme1234'])

/**
 * Policy for a real staff password (CEO / Assistant / Hunter). Returns a message, or null if acceptable.
 * bcrypt silently ignores everything past 72 BYTES, so longer input is refused rather than truncated.
 */
export function validateStaffPassword(password: string, email: string): string | null {
  if (password.length < 12) return 'Use at least 12 characters.'
  if (Buffer.byteLength(password) > 72) return 'Use at most 72 bytes (bcrypt ignores anything longer).'
  if (password.trim() !== password) return 'Do not start or end the password with whitespace.'
  if (password === PUBLISHED_SEED_PASSWORD || password.toLowerCase().includes('demopassword')) return 'That is the published demo password - choose a different one.'
  if (COMMON.has(password.toLowerCase())) return 'That password is too common.'
  if (new Set(password).size < 5) return 'Use a more varied password.'
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  if (local.length >= 4 && password.toLowerCase().includes(local)) return 'The password must not contain your email name.'
  return null
}
