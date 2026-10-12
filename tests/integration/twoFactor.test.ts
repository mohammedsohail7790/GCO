import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { beginSetup, confirmEnable, verifySecondFactor, disable, regenerateRecoveryCodes, twoFactorStatus, TwoFactorError } from '@/lib/auth/twoFactor'
import { totpAt } from '@/lib/auth/totp'

describe('two-factor sign-in (real database)', () => {
  const ids: string[] = []
  const mk = async (tag: string) => {
    const u = await db.user.create({ data: { email: `tfa-${Date.now()}-${tag}@test.gco`, passwordHash: 'x', role: 'CEO_ADMIN', displayName: tag } })
    ids.push(u.id); return u.id
  }
  afterAll(async () => { await db.user.deleteMany({ where: { id: { in: ids } } }) })

  it('enrol, confirm, sign-in code works once, replay and wrong codes fail, secret stored encrypted', async () => {
    const id = await mk('a')
    const { secret } = await beginSetup(id)
    expect((await twoFactorStatus(id)).enabled).toBe(false) // not enforced before confirmation
    expect(await verifySecondFactor(id, totpAt(secret, Date.now()))).toBeNull()
    const t0 = Date.now()
    await expect(confirmEnable(id, '000000', t0)).rejects.toBeInstanceOf(TwoFactorError)
    const { recoveryCodes } = await confirmEnable(id, totpAt(secret, t0), t0)
    expect(recoveryCodes).toHaveLength(10)
    const row = await db.user.findUniqueOrThrow({ where: { id } })
    expect(row.totpSecretEnc).not.toContain(secret)
    expect(JSON.stringify(row.totpRecoveryHashes)).not.toContain(recoveryCodes[0]!.replace('-', ''))
    // the confirmation code's step is consumed: the same code cannot be used to sign in right after
    expect(await verifySecondFactor(id, totpAt(secret, t0), t0)).toBeNull()
    const next = t0 + 30_000
    expect(await verifySecondFactor(id, totpAt(secret, next), next)).toBe('totp')
    expect(await verifySecondFactor(id, totpAt(secret, next), next)).toBeNull() // replay
    expect(await verifySecondFactor(id, '123456', next + 60_000)).toBeNull()
  })

  it('simultaneous submissions of one valid code: exactly one succeeds', async () => {
    const id = await mk('race')
    const { secret } = await beginSetup(id)
    const t0 = Date.now()
    await confirmEnable(id, totpAt(secret, t0), t0)
    const t = t0 + 60_000
    const results = await Promise.all(Array.from({ length: 6 }, () => verifySecondFactor(id, totpAt(secret, t), t)))
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('recovery codes: single use, loose formatting accepted, regenerate invalidates old, disable clears everything', async () => {
    const id = await mk('rec')
    const { secret } = await beginSetup(id)
    const { recoveryCodes } = await confirmEnable(id, totpAt(secret, Date.now()))
    const [c1, c2] = recoveryCodes
    expect(await verifySecondFactor(id, c1!.toUpperCase().replace('-', ' '))).toBe('recovery')
    expect(await verifySecondFactor(id, c1!)).toBeNull()
    expect((await twoFactorStatus(id)).recoveryCodesLeft).toBe(9)
    const fresh = await regenerateRecoveryCodes(id)
    expect(await verifySecondFactor(id, c2!)).toBeNull()
    expect(await verifySecondFactor(id, fresh.recoveryCodes[0]!)).toBe('recovery')
    await expect(beginSetup(id)).rejects.toMatchObject({ status: 409 })
    await disable(id)
    const row = await db.user.findUniqueOrThrow({ where: { id } })
    expect([row.totpSecretEnc, row.totpEnabledAt, row.totpLastStep, row.totpRecoveryHashes]).toEqual([null, null, null, []])
    expect(await verifySecondFactor(id, fresh.recoveryCodes[1]!)).toBeNull()
  })
})
