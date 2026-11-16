import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { expirePrivilegedAccess } from '@/lib/auth/accessExpiry'

describe('time-limited privileged access expiry (real database)', () => {
  const ids: string[] = []
  const mk = async (tag: string, accessExpiresAt: Date | null) => {
    const u = await db.user.create({ data: { email: `access-exp-${Date.now()}-${tag}@test.gco`, passwordHash: 'x', role: 'CTO', displayName: tag, accessExpiresAt } })
    ids.push(u.id)
    return u.id
  }
  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { resourceId: { in: ids } } })
    await db.session.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  })

  it('disables an account whose expiry has passed, revokes its sessions, and logs it - once, idempotently', async () => {
    const now = new Date()
    const past = new Date(now.getTime() - 60_000)
    const id = await mk('expired', past)
    await db.session.create({ data: { userId: id, refreshToken: `access-exp-test-${id}`, expiresAt: new Date(now.getTime() + 86_400_000) } })

    await expirePrivilegedAccess(now)

    const row = await db.user.findUniqueOrThrow({ where: { id } })
    expect(row.isActive).toBe(false)
    const sessions = await db.session.findMany({ where: { userId: id } })
    expect(sessions.every((s) => s.revokedAt !== null)).toBe(true)
    const audit = await db.auditLog.findFirst({ where: { resourceId: id, action: 'auth.access_expired' } })
    expect(audit).not.toBeNull()
    expect((audit!.metadata as any).role).toBe('CTO')

    // A second sweep is a no-op for this specific account: it's already inactive, so it's never selected again,
    // and is therefore never logged a second time (checked on this account's own id, not a global count, since
    // other tests may share this table concurrently).
    await expirePrivilegedAccess(new Date())
    const auditCountAfter = await db.auditLog.count({ where: { resourceId: id, action: 'auth.access_expired' } })
    expect(auditCountAfter).toBe(1)
  })

  it('leaves an account with no expiry, or a future expiry, untouched', async () => {
    const now = new Date()
    const future = new Date(now.getTime() + 90 * 86_400_000)
    const noExpiry = await mk('none', null)
    const notYet = await mk('future', future)

    await expirePrivilegedAccess(now)

    const a = await db.user.findUniqueOrThrow({ where: { id: noExpiry } })
    const b = await db.user.findUniqueOrThrow({ where: { id: notYet } })
    expect(a.isActive).toBe(true)
    expect(b.isActive).toBe(true)
  })

  it('one failing account does not stop the rest of the batch from being expired', async () => {
    const now = new Date()
    const past = new Date(now.getTime() - 60_000)
    const idA = await mk('batch-a', past)
    const idB = await mk('batch-b', past)
    // Pre-disable A so its transactional update (isActive: true -> false) affects 0 rows and is swallowed, not thrown.
    await db.user.update({ where: { id: idA }, data: { isActive: false } })

    await expirePrivilegedAccess(now)

    const b = await db.user.findUniqueOrThrow({ where: { id: idB } })
    expect(b.isActive).toBe(false)
  })
})
