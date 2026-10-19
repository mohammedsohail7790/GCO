import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { hashPassword } from '../../lib/auth/password'
import { cleanupTenant, loginAs, seedIsolatedTenant, sendWebhook, waitFor } from './helpers'

// With shifts planned, the on-shift operator gets the conversation even if an off-shift colleague has more free capacity;
// without anybody on shift, work still goes to whoever is available (coverage beats the plan).
test.describe('shift-aware assignment', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  const stamp = Date.now()
  const otherEmail = `shift-other-${stamp}@e2e.gco`
  let fixtureOp = '', otherOp = ''
  test.beforeAll(async () => {
    a = await seedIsolatedTenant('shfas')
    fixtureOp = (await db.operator.findFirstOrThrow({ where: { tenantId: a.tenantId } })).id
    const u = await db.user.create({ data: { email: otherEmail, passwordHash: await hashPassword('DemoPassword123!'), role: 'OPERATOR', tenantId: a.tenantId, displayName: 'Other Op' } })
    otherOp = (await db.operator.create({ data: { userId: u.id, tenantId: a.tenantId, status: 'OFFLINE', capacity: 5 } })).id // more spare capacity than the fixture operator (2)
    expect((await (await loginAs(otherEmail)).patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })).status()).toBe(200)
  })
  test.afterAll(async () => { await db.shift.deleteMany({ where: { tenantId: a.tenantId } }); await cleanupTenant(a.tenantId) })

  test('on-shift operator is preferred; off-shift still works when the on-shift one is full', async () => {
    await db.shift.create({ data: { tenantId: a.tenantId, operatorId: fixtureOp, startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 3_600_000), createdByUserId: 'e2e' } })
    for (let i = 0; i < 2; i++) await sendWebhook(a.integrationId, [{ event_id: `s-${stamp}-${i}`, message_id: `sm-${stamp}-${i}`, user_id: `s-user-${stamp}-${i}`, text: 'hello' }])
    expect(await waitFor(async () => (await db.assignment.count({ where: { tenantId: a.tenantId, status: 'ACTIVE' } })) === 2)).toBe(true)
    const first = await db.assignment.findMany({ where: { tenantId: a.tenantId, status: 'ACTIVE' }, select: { operatorId: true } })
    expect(first.every((x) => x.operatorId === fixtureOp)).toBe(true) // both to the on-shift operator (capacity 2), although the other has 5 free
    await sendWebhook(a.integrationId, [{ event_id: `s-${stamp}-3`, message_id: `sm-${stamp}-3`, user_id: `s-user-${stamp}-3`, text: 'third' }])
    expect(await waitFor(async () => (await db.assignment.count({ where: { tenantId: a.tenantId, status: 'ACTIVE', operatorId: otherOp } })) === 1)).toBe(true) // overflow goes to the off-shift operator, not lost
  })
})
