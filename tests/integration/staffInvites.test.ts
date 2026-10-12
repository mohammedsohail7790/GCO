import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { inviteStaff, reissueStaffInvite, cancelStaffInvite, acceptStaffInvitation, listStaff } from '@/lib/onboarding/staffInvites'
import { OnboardingError, sha256 } from '@/lib/onboarding/service'

const tokenOf = (url: string) => /#token=([0-9a-f]{64})$/.exec(url)![1]!
const GOOD = 'Orchard-Lantern-Quiet-2026'

describe('staff invitations (real database)', () => {
  const base = `inv-${Date.now()}`
  const tenantIds: string[] = []
  const ceo = 'ceo-user-id-for-audit'
  let seq = 0
  const mkTenant = async (tag: string, extra: object = {}) => { const n = ++seq; const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}-${n}`, slug: `${base}-${tag}-${n}`, defaultOperatorCapacity: 3, ...extra } }); tenantIds.push(t.id); return t.id }
  const email = (t: string) => `${t}-${base}@invite.test`

  afterAll(async () => {
    await db.staffInvitation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.session.deleteMany({ where: { user: { tenantId: { in: tenantIds } } } })
    await db.user.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('invites an operator: inactive user, OFFLINE profile with client capacity and languages, only a token HASH stored, audit without the token', async () => {
    const t = await mkTenant('op')
    const r = await inviteStaff({ tenantId: t, email: `  ${email('Op').toUpperCase()} `, displayName: 'Op One', role: 'OPERATOR', languages: ['ES', 'en-GB'], actorUserId: ceo })
    const token = tokenOf(r.setupUrl)
    const u = await db.user.findUniqueOrThrow({ where: { id: r.userId }, include: { operator: true } })
    expect(u).toMatchObject({ email: email('op'), role: 'OPERATOR', tenantId: t, isActive: false })
    expect(u.operator).toMatchObject({ status: 'OFFLINE', capacity: 3 }); expect(u.operator!.languages).toEqual(['en', 'es'])
    const inv = await db.staffInvitation.findUniqueOrThrow({ where: { id: r.invitationId } })
    expect(inv.tokenHash).toBe(sha256(token)); expect(JSON.stringify(inv)).not.toContain(token)
    expect(inv.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86400_000)
    expect(JSON.stringify(await db.auditLog.findMany({ where: { tenantId: t } }))).not.toContain(token)
    // the placeholder password is unusable: nobody knows it
    expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/)
  })

  it('invites a manager without an operator profile', async () => {
    const t = await mkTenant('mgr')
    const r = await inviteStaff({ tenantId: t, email: email('mgr'), displayName: 'Mgr', role: 'MANAGER', actorUserId: ceo })
    expect((await db.user.findUniqueOrThrow({ where: { id: r.userId }, include: { operator: true } })).operator).toBeNull()
  })

  it.each([
    ['a role that is not operator/manager', { role: 'CEO_ADMIN' }, /OPERATOR or MANAGER/],
    ['a client role', { role: 'CLIENT' }, /OPERATOR or MANAGER/],
    ['an invalid email', { role: 'OPERATOR', email: 'nope' }, /valid email/],
    ['a demo email', { role: 'OPERATOR', email: 'x@demo.gco' }, /Demo accounts/],
    ['languages on a manager', { role: 'MANAGER', languages: ['en'] }, /operators only/],
    ['bad language codes', { role: 'OPERATOR', languages: ['english'] }, /two-letter/],
    ['an empty name', { role: 'OPERATOR', displayName: '  ' }, /name is required/],
  ])('refuses %s and creates nothing', async (_n, extra, msg) => {
    const t = await mkTenant('bad')
    const before = await db.user.count()
    await expect(inviteStaff({ tenantId: t, email: email('bad'), displayName: 'X', actorUserId: ceo, ...Object.assign({ role: 'OPERATOR' }, extra) } as never)).rejects.toThrow(msg)
    expect(await db.user.count()).toBe(before)
  })

  it('refuses an unknown, suspended or demo client, and an existing email', async () => {
    await expect(inviteStaff({ tenantId: 'no-such', email: email('a'), displayName: 'A', role: 'OPERATOR', actorUserId: ceo })).rejects.toMatchObject({ status: 404 })
    const sus = await mkTenant('sus', { status: 'SUSPENDED' })
    await expect(inviteStaff({ tenantId: sus, email: email('b'), displayName: 'B', role: 'OPERATOR', actorUserId: ceo })).rejects.toThrow(/SUSPENDED/)
    const demo = await db.tenant.findUnique({ where: { slug: 'demo-dating-app' } })
    if (demo) await expect(inviteStaff({ tenantId: demo.id, email: email('c'), displayName: 'C', role: 'OPERATOR', actorUserId: ceo })).rejects.toThrow(/demo client/)
    const t = await mkTenant('dup')
    await inviteStaff({ tenantId: t, email: email('dup'), displayName: 'D', role: 'OPERATOR', actorUserId: ceo })
    await expect(inviteStaff({ tenantId: t, email: email('dup'), displayName: 'D2', role: 'MANAGER', actorUserId: ceo })).rejects.toMatchObject({ status: 409 })
  })

  it('accepting: a weak password is refused WITHOUT using up the link; a strong one activates the account; the link is single-use', async () => {
    const t = await mkTenant('acc')
    const r = await inviteStaff({ tenantId: t, email: email('acc'), displayName: 'Acc', role: 'OPERATOR', actorUserId: ceo })
    const token = tokenOf(r.setupUrl)
    await expect(acceptStaffInvitation(token, 'short')).rejects.toThrow(/at least 12/)
    await expect(acceptStaffInvitation(token, `${email('acc').split('@')[0]}-xxxx-1234`)).rejects.toThrow(/email name/) // contains the email name
    expect((await db.user.findUniqueOrThrow({ where: { id: r.userId } })).isActive).toBe(false)
    expect(await acceptStaffInvitation(token, GOOD)).toEqual({ tenantId: t })
    const u = await db.user.findUniqueOrThrow({ where: { id: r.userId } })
    expect(u.isActive).toBe(true)
    expect((await import('bcryptjs')).default.compareSync(GOOD, u.passwordHash)).toBe(true)
    await expect(acceptStaffInvitation(token, 'Another-Strong-Passphrase-77')).resolves.toBeNull() // used link: hash cleared, no longer a staff link
    expect(JSON.stringify(await db.auditLog.findMany({ where: { tenantId: t } }))).not.toMatch(new RegExp(`${token}|${GOOD}`))
  })

  it('two concurrent redemptions: exactly one wins', async () => {
    const t = await mkTenant('race')
    const r = await inviteStaff({ tenantId: t, email: email('race'), displayName: 'Race', role: 'MANAGER', actorUserId: ceo })
    const token = tokenOf(r.setupUrl)
    const results = await Promise.allSettled([acceptStaffInvitation(token, GOOD), acceptStaffInvitation(token, 'Second-Orchard-Passphrase-88')])
    expect(results.filter((x) => x.status === 'fulfilled' && x.value !== null)).toHaveLength(1)
  })

  it('expired, cancelled and unknown links fail generically; a non-staff token returns null so the client flow can handle it', async () => {
    const t = await mkTenant('exp')
    const r = await inviteStaff({ tenantId: t, email: email('exp'), displayName: 'E', role: 'OPERATOR', actorUserId: ceo })
    await db.staffInvitation.update({ where: { id: r.invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } })
    await expect(acceptStaffInvitation(tokenOf(r.setupUrl), GOOD)).rejects.toThrow(/invalid or has expired/)
    expect((await listStaff(t))[0]!.state).toBe('expired')
    const fresh = await reissueStaffInvite(r.invitationId, ceo)
    await expect(acceptStaffInvitation(tokenOf(r.setupUrl), GOOD)).resolves.toBeNull() // old link replaced: no longer matches any invitation
    const c = await inviteStaff({ tenantId: t, email: email('can'), displayName: 'C', role: 'MANAGER', actorUserId: ceo })
    await cancelStaffInvite(c.invitationId, ceo)
    await expect(acceptStaffInvitation(tokenOf(c.setupUrl), GOOD)).resolves.toBeNull() // cancelled: token hash cleared
    await expect(reissueStaffInvite(c.invitationId, ceo)).rejects.toMatchObject({ status: 409 })
    await expect(acceptStaffInvitation('not-a-token', GOOD)).resolves.toBeNull()
    await expect(acceptStaffInvitation('0'.repeat(64), GOOD)).resolves.toBeNull()
    // the re-issued link works and the account stays inactive until then
    expect((await db.user.findUniqueOrThrow({ where: { id: r.userId } })).isActive).toBe(false)
    await acceptStaffInvitation(tokenOf(fresh.setupUrl), GOOD)
    await expect(reissueStaffInvite(r.invitationId, ceo)).rejects.toMatchObject({ status: 409 })
    await expect(cancelStaffInvite(r.invitationId, ceo)).rejects.toBeInstanceOf(OnboardingError)
  })

  it('lists staff with their states', async () => {
    const t = await mkTenant('list')
    await inviteStaff({ tenantId: t, email: email('l1'), displayName: 'L1', role: 'OPERATOR', languages: ['fr'], actorUserId: ceo })
    const l2 = await inviteStaff({ tenantId: t, email: email('l2'), displayName: 'L2', role: 'MANAGER', actorUserId: ceo })
    await acceptStaffInvitation(tokenOf(l2.setupUrl), GOOD)
    const list = await listStaff(t)
    expect(list.map((p) => [p.name, p.state])).toEqual([['L1', 'invited'], ['L2', 'active']])
    expect(list[0]!.languages).toEqual(['fr'])
  })
})
