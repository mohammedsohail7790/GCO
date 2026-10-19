import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { cleanupTenant, loginAs, seedIsolatedTenant, sendWebhook, waitFor } from './helpers'
import { hashPassword } from '../../lib/auth/password'

// Operator-to-operator transfer over real HTTP: handover to a named colleague, capacity and ownership rules, tenant isolation.
test.describe('conversation transfer', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  const stamp = Date.now()
  const colleagueEmail = `colleague-${stamp}@e2e.gco`
  test.beforeAll(async () => {
    a = await seedIsolatedTenant('tra'); b = await seedIsolatedTenant('trb')
    const user = await db.user.create({ data: { email: colleagueEmail, passwordHash: await hashPassword('DemoPassword123!'), role: 'OPERATOR', tenantId: a.tenantId, displayName: 'Colleague Two' } })
    await db.operator.create({ data: { userId: user.id, tenantId: a.tenantId, status: 'OFFLINE', capacity: 1 } })
  })
  test.afterAll(async () => { await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId) })

  test('an operator hands a held conversation to an available colleague; rules and isolation hold', async () => {
    await sendWebhook(a.integrationId, [{ event_id: `t-${stamp}`, message_id: `tm-${stamp}`, user_id: `t-user-${stamp}`, text: 'Please help' }])
    expect(await waitFor(async () => (await db.assignment.count({ where: { tenantId: a.tenantId, status: 'ACTIVE' } })) === 1)).toBe(true)
    const asg = await db.assignment.findFirstOrThrow({ where: { tenantId: a.tenantId, status: 'ACTIVE' } })
    const colleague = await db.operator.findFirstOrThrow({ where: { user: { email: colleagueEmail } } })
    const colleagueCtx = await loginAs(colleagueEmail)

    // colleague is offline: not offered and cannot receive
    expect((await (await a.operatorCtx.get('/api/v1/operators/me/colleagues')).json()).data).toEqual([])
    const refused = await a.operatorCtx.post(`/api/v1/assignments/${asg.id}/transfer`, { data: { toOperatorId: colleague.id } })
    expect(refused.status()).toBe(409); expect((await refused.json()).error.code).toBe('TARGET_UNAVAILABLE')
    expect((await db.assignment.findUniqueOrThrow({ where: { id: asg.id } })).status).toBe('ACTIVE') // nothing lost

    // colleague comes online
    expect((await colleagueCtx.patch('/api/v1/operators/me/status', { data: { status: 'AVAILABLE' } })).status()).toBe(200)
    const offered = (await (await a.operatorCtx.get('/api/v1/operators/me/colleagues')).json()).data as { id: string }[]
    expect(offered.map((o) => o.id)).toEqual([colleague.id])
    expect((await b.operatorCtx.post(`/api/v1/assignments/${asg.id}/transfer`, { data: { toOperatorId: colleague.id } })).status()).toBe(404) // another client's operator
    expect((await a.clientCtx.post(`/api/v1/assignments/${asg.id}/transfer`, { data: { toOperatorId: colleague.id } })).status()).toBe(403)
    expect((await colleagueCtx.post(`/api/v1/assignments/${asg.id}/transfer`, { data: { toOperatorId: colleague.id } })).status()).toBe(404) // not the holder
    expect((await a.operatorCtx.post(`/api/v1/assignments/${asg.id}/transfer`, { data: { toOperatorId: 'nobody' } })).status()).toBe(409)

    const done = await a.operatorCtx.post(`/api/v1/assignments/${asg.id}/transfer`, { data: { toOperatorId: colleague.id, reason: 'End of my shift' } })
    expect(done.status()).toBe(200)
    expect((await db.assignment.findUniqueOrThrow({ where: { id: asg.id } })).status).toBe('CANCELLED')
    const now = await db.assignment.findFirstOrThrow({ where: { tenantId: a.tenantId, status: 'ACTIVE' } })
    expect(now.operatorId).toBe(colleague.id)
    expect((await db.conversation.findUniqueOrThrow({ where: { id: asg.conversationId } })).currentAssignmentId).toBe(now.id)
    expect((await db.assignmentHistoryEntry.findFirstOrThrow({ where: { assignmentId: asg.id, event: 'transferred' } })).actorUserId).not.toBeNull()
    // the previous holder can no longer transfer or see it as theirs
    expect((await a.operatorCtx.post(`/api/v1/assignments/${asg.id}/transfer`, { data: { toOperatorId: colleague.id } })).status()).toBe(409)
    // a manager can move it back
    const back = await a.managerCtx.post(`/api/v1/assignments/${now.id}/transfer`, { data: { toOperatorId: (await db.operator.findFirstOrThrow({ where: { user: { email: a.operatorEmail } } })).id } })
    expect(back.status()).toBe(200)
  })
})
