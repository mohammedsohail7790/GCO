import crypto from 'crypto'
import { db } from '@/lib/db/client'
import { decryptSecret, encryptSecret } from '@/lib/auth/secretBox'
import { generateSecret, otpauthUri, stepAt, verifyTotp } from '@/lib/auth/totp'

const RECOVERY_COUNT = 10
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export class TwoFactorError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** `abcde-fghij` style, 50 bits each; normalised (case, dashes, spaces) before hashing so typing it loosely still works. */
function newRecoveryCode(): string {
  const raw = crypto.randomBytes(8).toString('hex').slice(0, 10)
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}
const normaliseRecovery = (s: string) => s.toLowerCase().replace(/[\s-]/g, '')
export const looksLikeRecoveryCode = (s: string) => /^[0-9a-f]{10}$/.test(normaliseRecovery(s))
const hashRecovery = (s: string) => sha256(normaliseRecovery(s))

export async function twoFactorStatus(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true, totpRecoveryHashes: true } })
  return { enabled: !!u?.totpEnabledAt, enabledAt: u?.totpEnabledAt ?? null, recoveryCodesLeft: u?.totpEnabledAt ? u.totpRecoveryHashes.length : 0 }
}

/** Starts (or restarts) enrolment. Nothing is enforced at sign-in until the first code is confirmed. */
export async function beginSetup(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, totpEnabledAt: true } })
  if (u.totpEnabledAt) throw new TwoFactorError('Two-factor sign-in is already on. Turn it off first to set up a new device.', 409)
  const secret = generateSecret()
  await db.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(secret), totpLastStep: null } })
  return { secret, otpauthUri: otpauthUri(secret, u.email) }
}

/** Confirms enrolment with a code from the app, turns two-factor on and returns the one-time recovery codes (shown once). */
export async function confirmEnable(userId: string, code: string, now = Date.now()) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabledAt: true } })
  if (u.totpEnabledAt) throw new TwoFactorError('Two-factor sign-in is already on.', 409)
  if (!u.totpSecretEnc) throw new TwoFactorError('Start setup first.', 400)
  const step = verifyTotp(decryptSecret(u.totpSecretEnc), code, now, null)
  if (step === null) throw new TwoFactorError('That code is not correct. Check the time on your phone and try the newest code.', 400)
  const codes = Array.from({ length: RECOVERY_COUNT }, newRecoveryCode)
  const claimed = await db.user.updateMany({
    where: { id: userId, totpEnabledAt: null, totpSecretEnc: u.totpSecretEnc },
    data: { totpEnabledAt: new Date(now), totpLastStep: step, totpRecoveryHashes: codes.map(hashRecovery) },
  })
  if (claimed.count !== 1) throw new TwoFactorError('Two-factor setup changed. Start again.', 409)
  return { recoveryCodes: codes }
}

export async function disable(userId: string) {
  await db.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryHashes: [] } })
}

export async function regenerateRecoveryCodes(userId: string) {
  const codes = Array.from({ length: RECOVERY_COUNT }, newRecoveryCode)
  const r = await db.user.updateMany({ where: { id: userId, totpEnabledAt: { not: null } }, data: { totpRecoveryHashes: codes.map(hashRecovery) } })
  if (r.count !== 1) throw new TwoFactorError('Two-factor sign-in is not on.', 409)
  return { recoveryCodes: codes }
}

export type SecondFactorResult = 'totp' | 'recovery' | null

/**
 * Checks the second factor at sign-in. An authenticator code is accepted once (the step is claimed atomically, so two
 * simultaneous submissions of the same code cannot both succeed); a recovery code is removed atomically when used.
 */
export async function verifySecondFactor(userId: string, input: string, now = Date.now()): Promise<SecondFactorResult> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabledAt: true, totpLastStep: true } })
  if (!u?.totpEnabledAt || !u.totpSecretEnc) return null
  if (looksLikeRecoveryCode(input)) {
    const n = await db.$executeRaw`UPDATE "User" SET "totpRecoveryHashes" = array_remove("totpRecoveryHashes", ${hashRecovery(input)}) WHERE id = ${userId} AND ${hashRecovery(input)} = ANY("totpRecoveryHashes")`
    return n === 1 ? 'recovery' : null
  }
  const step = verifyTotp(decryptSecret(u.totpSecretEnc), input, now, u.totpLastStep)
  if (step === null) return null
  const claimed = await db.user.updateMany({
    where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  })
  return claimed.count === 1 ? 'totp' : null
}

export { stepAt }
