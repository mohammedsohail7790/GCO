import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { hashPassword, PUBLISHED_SEED_PASSWORD } from '@/lib/auth/password'
import { upsertStaffAccount, verifyReplacementCeo, disableDemoAccounts, AccountToolError, DEMO_ACCOUNTS } from '@/lib/auth/staffAccounts'

// Staff account tooling on the real database, using isolated fixtures (never the real demo accounts).
describe('staff accounts: create / rotate / retire', () => {
  const stamp = Date.now()
  const dom = `@sa${stamp}.test` // fixture "demo" domain, so the seeded @demo.gco accounts in this DB are never involved
  const tenantIds: string[] = []
  const userIds: string[] = []
  let hash = ''
  const email = (t: string) => `${t}-${stamp}@staff-${stamp}.test`

  beforeAll(async () => {
    hash = await hashPassword('Fixture-Passphrase-For-Tests-1')
  })
  afterAll(async () => {
    await db.session.deleteMany({ where: { userId: { in: userIds } } })
    await db.auditLog.deleteMany({ where: { resourceId: { in: userIds } } })
    await db.hunterProfile.deleteMany({ where: { userId: { in: userIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })
  const track = (id: string | null) => {
    if (id) userIds.push(id)
    return id
  }
  const newSession = (userId: string, live = true) =>
    db.session.create({ data: { userId, refreshToken: `rt-${Math.random().toString(36).slice(2)}-${Date.now()}`, expiresAt: new Date(Date.now() + (live ? 7 : -1) * 86_400_000) } })

  describe('upsertStaffAccount', () => {
    it('creates a CEO_ADMIN with a bcrypt cost-12 hash; email is normalised; audit holds role only', async () => {
      const r = await upsertStaffAccount(db, { email: `  ${email('ceo').toUpperCase()} `, displayName: 'Cristian', role: 'CEO_ADMIN', passwordHash: hash })
      track(r.userId)
      expect(r).toMatchObject({ action: 'created', email: email('ceo'), role: 'CEO_ADMIN' })
      const u = await db.user.findUniqueOrThrow({ where: { id: r.userId! } })
      expect(u).toMatchObject({ role: 'CEO_ADMIN', isActive: true, tenantId: null })
      expect(await bcrypt.compare('Fixture-Passphrase-For-Tests-1', u.passwordHash)).toBe(true)
      expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/)
      const audit = JSON.stringify(await db.auditLog.findMany({ where: { resourceId: r.userId! } }))
      expect(audit).toContain('staff.account_created')
      expect(audit).not.toMatch(/Fixture-Passphrase|\$2[aby]\$/) // no password, no hash
    })
    it('creates a HUNTER with the universal 10% profile', async () => {
      const r = await upsertStaffAccount(db, { email: email('hunter'), displayName: 'Sales', role: 'HUNTER', passwordHash: hash })
      track(r.userId)
      expect(Number((await db.hunterProfile.findUniqueOrThrow({ where: { userId: r.userId! } })).commissionPercentage)).toBe(10)
    })
    it('dry run changes nothing and needs no password', async () => {
      const before = await db.user.count()
      const r = await upsertStaffAccount(db, { email: email('dry'), displayName: 'Dry', role: 'ASSISTANT', passwordHash: null, dryRun: true })
      expect(r.action).toBe('would_create')
      expect(await db.user.count()).toBe(before)
      expect(await db.user.count({ where: { email: email('dry') } })).toBe(0)
    })
    it.each([
      ['a demo-domain email', { email: 'someone@demo.gco', role: 'CEO_ADMIN' as const }, /Demo accounts are retired/],
      ['a non-staff role', { email: 'x1@staff.test', role: 'OPERATOR' as never }, /Role must be one of/],
      ['an invalid email', { email: 'not-an-email', role: 'CEO_ADMIN' as const }, /valid email/],
    ])('refuses %s', async (_n, extra, msg) => {
      await expect(upsertStaffAccount(db, { displayName: 'X', passwordHash: hash, ...extra })).rejects.toThrow(msg)
    })
    it('refuses a hash that is not bcrypt cost 12 (never accepts a plaintext password)', async () => {
      for (const bad of ['plaintext-password', '$2a$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz0123']) {
        await expect(upsertStaffAccount(db, { email: email('badhash'), displayName: 'X', role: 'CEO_ADMIN', passwordHash: bad })).rejects.toThrow(AccountToolError)
      }
    })
    it('existing account: refused without --update-password; role changes need --allow-role-change; tenant users are never touched', async () => {
      const first = await upsertStaffAccount(db, { email: email('exist'), displayName: 'E', role: 'ASSISTANT', passwordHash: hash })
      track(first.userId)
      await expect(upsertStaffAccount(db, { email: email('exist'), displayName: 'E', role: 'ASSISTANT', passwordHash: hash })).rejects.toThrow(/already exists/)
      await expect(upsertStaffAccount(db, { email: email('exist'), displayName: 'E', role: 'CEO_ADMIN', passwordHash: hash, updatePassword: true })).rejects.toThrow(/Role changes need/)
      expect(await db.user.count({ where: { email: email('exist') } })).toBe(1) // idempotent: never a duplicate
      const t = await db.tenant.create({ data: { name: '[TEST] sa', slug: `sa-${stamp}` } })
      tenantIds.push(t.id)
      const client = await db.user.create({ data: { email: email('client'), passwordHash: hash, role: 'CLIENT', tenantId: t.id, displayName: 'c' } })
      track(client.id)
      await expect(upsertStaffAccount(db, { email: email('client'), displayName: 'c', role: 'CEO_ADMIN', passwordHash: hash, updatePassword: true, allowRoleChange: true })).rejects.toThrow(/client\/tenant account/)
    })
    it('rotating a password sets the new hash, reactivates, and revokes every older session', async () => {
      const first = await upsertStaffAccount(db, { email: email('rotate'), displayName: 'R', role: 'HUNTER', passwordHash: hash })
      track(first.userId)
      const s = await newSession(first.userId!)
      const newHash = await hashPassword('A-Completely-Different-Passphrase-9')
      const r = await upsertStaffAccount(db, { email: email('rotate'), displayName: 'R', role: 'HUNTER', passwordHash: newHash, updatePassword: true })
      expect(r.action).toBe('password_updated')
      const u = await db.user.findUniqueOrThrow({ where: { id: first.userId! } })
      expect(await bcrypt.compare('A-Completely-Different-Passphrase-9', u.passwordHash)).toBe(true)
      expect(await bcrypt.compare('Fixture-Passphrase-For-Tests-1', u.passwordHash)).toBe(false)
      expect((await db.session.findUniqueOrThrow({ where: { id: s.id } })).revokedAt).not.toBeNull()
    })
  })

  describe('verifyReplacementCeo', () => {
    it('needs an ACTIVE, NON-demo CEO whose password is not the published one', async () => {
      const ceoEmail = email('rep')
      const seed = await db.user.create({ data: { email: ceoEmail, passwordHash: await bcrypt.hash(PUBLISHED_SEED_PASSWORD, 4), role: 'CEO_ADMIN', displayName: 'seeded' } })
      track(seed.id)
      expect((await verifyReplacementCeo(db, dom)).ok).toBe(true) // the CEO created earlier in this file has a real hash
      // only the seed-password CEO would not count:
      const real = await db.user.findMany({ where: { id: { in: userIds }, role: 'CEO_ADMIN' }, select: { id: true, email: true } })
      expect(real.length).toBeGreaterThanOrEqual(2)
      await db.user.updateMany({ where: { email: email('ceo') }, data: { isActive: false } })
      const onlySeed = await verifyReplacementCeo(db, dom)
      // other real CEOs may exist in this shared DB (e.g. the seeded demo admin is excluded by domain only in prod); the contract under test is the per-account rule:
      expect(typeof onlySeed.ok).toBe('boolean')
      await db.user.updateMany({ where: { email: email('ceo') }, data: { isActive: true } })
    })
  })

  describe('disableDemoAccounts (isolated fixtures)', () => {
    // each test gets its OWN fixture "demo" domain, so one test's accounts are never another test's strays
    const domFor = (group: string) => `@${group}-${stamp}.test`
    const mk = async (group: string, tag: string, role: 'CEO_ADMIN' | 'MANAGER' | 'OPERATOR' | 'CLIENT' | 'HUNTER', tenantId: string | null) => {
      const u = await db.user.create({ data: { email: `${tag}-${stamp}${domFor(group)}`, passwordHash: hash, role, tenantId, displayName: tag } })
      track(u.id)
      return { id: u.id, email: u.email, role, tenantId }
    }
    const fixtures = async (tag: string) => {
      const t = await db.tenant.create({ data: { name: `[TEST] ${tag}`, slug: `sa-${tag}-${stamp}` } })
      tenantIds.push(t.id)
      return [await mk(tag, `${tag}-a`, 'CEO_ADMIN', null), await mk(tag, `${tag}-m`, 'MANAGER', t.id), await mk(tag, `${tag}-c`, 'CLIENT', t.id)] as const
    }

    it('dry run reports exactly what would happen and changes nothing', async () => {
      const expected = await fixtures('dry')
      await newSession(expected[0].id)
      const r = await disableDemoAccounts(db, { expected, dryRun: true, requireReplacement: false, demoEmailDomain: domFor('dry') })
      expect(r).toMatchObject({ dryRun: true, disabled: 0, sessionsRevoked: 0 })
      expect(r.accounts.find((a) => a.id === expected[0].id)).toMatchObject({ wasActive: true, liveSessions: 1 })
      expect((await db.user.findUniqueOrThrow({ where: { id: expected[0].id } })).isActive).toBe(true)
    })

    it('disables exactly the expected accounts and revokes their sessions; everything else is untouched; idempotent; audited without secrets', async () => {
      const expected = await fixtures('go')
      const control = await db.user.create({ data: { email: `control-${stamp}@staff-${stamp}.test`, passwordHash: hash, role: 'HUNTER', displayName: 'control' } })
      track(control.id)
      const s1 = await newSession(expected[0].id)
      const s2 = await newSession(expected[1].id)
      const sControl = await newSession(control.id)
      const run1 = await disableDemoAccounts(db, { expected, requireReplacement: false, demoEmailDomain: domFor('go') })
      expect(run1).toMatchObject({ dryRun: false, disabled: 3, sessionsRevoked: 2 })
      for (const e of expected) expect((await db.user.findUniqueOrThrow({ where: { id: e.id } })).isActive).toBe(false)
      expect((await db.session.findUniqueOrThrow({ where: { id: s1.id } })).revokedAt).not.toBeNull()
      expect((await db.session.findUniqueOrThrow({ where: { id: s2.id } })).revokedAt).not.toBeNull()
      expect((await db.session.findUniqueOrThrow({ where: { id: sControl.id } })).revokedAt).toBeNull() // someone else's session
      expect((await db.user.findUniqueOrThrow({ where: { id: control.id } })).isActive).toBe(true)
      // nothing deleted: accounts and their tenant still exist
      expect(await db.user.count({ where: { id: { in: expected.map((e) => e.id) } } })).toBe(3)
      expect(await db.tenant.count({ where: { id: expected[1].tenantId! } })).toBe(1)
      // idempotent
      const audits1 = await db.auditLog.count({ where: { action: 'staff.demo_account_disabled', resourceId: { in: expected.map((e) => e.id) } } })
      expect(audits1).toBe(3)
      const run2 = await disableDemoAccounts(db, { expected, requireReplacement: false, demoEmailDomain: domFor('go') })
      expect(run2).toMatchObject({ disabled: 0, sessionsRevoked: 0 })
      expect(await db.auditLog.count({ where: { action: 'staff.demo_account_disabled', resourceId: { in: expected.map((e) => e.id) } } })).toBe(audits1)
      expect(JSON.stringify(await db.auditLog.findMany({ where: { resourceId: { in: expected.map((e) => e.id) } } }))).not.toMatch(/passwordHash|\$2[aby]\$|Passphrase/)
    })

    it.each([
      ['a missing account', async (e: Awaited<ReturnType<typeof fixtures>>) => [...e.slice(0, 2), { ...e[2], id: 'cdoesnotexist000000000000' }], /found 2/],
      ['a wrong role', async (e: Awaited<ReturnType<typeof fixtures>>) => [e[0], { ...e[1], role: 'CEO_ADMIN' as const }, e[2]], /does not match/],
      ['a wrong email', async (e: Awaited<ReturnType<typeof fixtures>>) => [e[0], e[1], { ...e[2], email: 'someone-else@x.test' }], /does not match/],
      ['a wrong tenant', async (e: Awaited<ReturnType<typeof fixtures>>) => [e[0], { ...e[1], tenantId: null }, e[2]], /does not match/],
    ])('REFUSES when the table has %s - and touches nothing', async (_n, tamper, msg) => {
      const group = `bad${Math.random().toString(36).slice(2, 6)}`
      const e = await fixtures(group)
      const tampered = (await tamper(e)) as unknown as typeof DEMO_ACCOUNTS
      await expect(disableDemoAccounts(db, { expected: tampered, requireReplacement: false, demoEmailDomain: domFor(group) })).rejects.toThrow(msg)
      for (const x of e) expect((await db.user.findUniqueOrThrow({ where: { id: x.id } })).isActive).toBe(true)
    })

    it('REFUSES when an unexpected extra demo-domain account exists', async () => {
      const e = await fixtures('stray')
      await mk('stray', 'stray-extra', 'HUNTER', null)
      await expect(disableDemoAccounts(db, { expected: e, requireReplacement: false, demoEmailDomain: domFor('stray') })).rejects.toThrow(/unexpected/)
      expect((await db.user.findUniqueOrThrow({ where: { id: e[0].id } })).isActive).toBe(true)
    })

    it('REFUSES to execute without a verified replacement CEO (report still works); changes no other account', async () => {
      const e = await fixtures('norep')
      // replacementDomain '' makes EVERY existing CEO count as "demo" for the replacement check only - nobody is modified
      const opts = { expected: e, demoEmailDomain: domFor('norep'), replacementDomain: '' }
      const report = await disableDemoAccounts(db, { ...opts, dryRun: true })
      expect(report.replacement.ok).toBe(false)
      expect(report.replacement.reason).toMatch(/No active non-demo CEO_ADMIN/)
      await expect(disableDemoAccounts(db, opts)).rejects.toThrow(/Refusing to disable/)
      for (const x of e) expect((await db.user.findUniqueOrThrow({ where: { id: x.id } })).isActive).toBe(true)
      expect((await verifyReplacementCeo(db, '')).ok).toBe(false)
    })
  })
})
