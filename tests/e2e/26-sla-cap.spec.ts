import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, cleanupTenant, sendWebhook, waitFor, sharedAdminContext, anonymousContext, seedHunter, cleanupHunter } from './helpers'
import { db } from '@/lib/db/client'

// Unanswered conversation lifecycle through the REAL worker: repeated SLA expiry -> cap -> escalation -> manager resume.
// Default cap is 5 consecutive expiries; the tenant SLA is shortened to 2s so the whole lifecycle takes ~15s.
test.describe.configure({ mode: 'serial' })
test.describe('SLA reassignment cap: an unanswered conversation cannot loop forever', () => {
  let A: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let B: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let conversationId = ''
  const api = (p: string) => `/api/v1${p}`

  test.beforeAll(async () => {
    A = await seedIsolatedTenant('sla-a')
    B = await seedIsolatedTenant('sla-b')
    await db.tenant.update({ where: { id: A.tenantId }, data: { defaultResponseSlaSeconds: 2 } })
  })
  test.afterAll(async () => {
    await cleanupTenant(A.tenantId).catch(() => null)
    await cleanupTenant(B.tenantId).catch(() => null)
  })

  test('a NORMAL conversation is untouched: replied in time, completed, never capped', async () => {
    const ok = await seedIsolatedTenant('sla-normal')
    try {
      expect((await sendWebhook(ok.integrationId, [{ event_id: 'n1', message_id: 'nm1', user_id: 'normal-user', text: 'hi' }])).status()).toBe(202)
      expect(await waitFor(async () => !!(await db.conversation.findFirst({ where: { tenantId: ok.tenantId } }))?.currentAssignmentId, 15000)).toBe(true)
      const c = (await db.conversation.findFirst({ where: { tenantId: ok.tenantId } }))!
      expect((await ok.operatorCtx.post(api('/messages/send'), { data: { conversationId: c.id, content: 'on it' } })).status()).toBe(200)
      expect((await db.conversation.findUniqueOrThrow({ where: { id: c.id } })).state).toBe('WAITING_FOR_CLIENT')
      expect(await db.auditLog.count({ where: { tenantId: ok.tenantId, action: 'conversation.sla_escalated' } })).toBe(0)
    } finally {
      await cleanupTenant(ok.tenantId).catch(() => null)
    }
  })

  test('an unanswered conversation cycles up to the cap, then STOPS in a visible, actionable state with ONE escalation', async () => {
    expect((await sendWebhook(A.integrationId, [{ event_id: 'u1', message_id: 'um1', user_id: 'silent-user', text: 'anyone there?' }])).status()).toBe(202)
    expect(await waitFor(async () => (await db.conversation.findFirst({ where: { tenantId: A.tenantId } }))?.state === 'EXPIRED', 45000, 500)).toBe(true)
    conversationId = (await db.conversation.findFirst({ where: { tenantId: A.tenantId } }))!.id
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })
    expect(conv.currentAssignmentId).toBeNull()
    const assignments = await db.assignment.findMany({ where: { conversationId } })
    expect(assignments.filter((a) => a.status === 'EXPIRED')).toHaveLength(5) // the default cap
    expect(assignments.filter((a) => a.status === 'ACTIVE')).toHaveLength(0)
    expect(await db.auditLog.count({ where: { tenantId: A.tenantId, action: 'conversation.sla_escalated', resourceId: conversationId } })).toBe(1)
    const events = await db.systemEvent.findMany({ where: { category: 'sla', metadata: { path: ['conversationId'], equals: conversationId } } })
    expect(events).toHaveLength(1)
    expect(JSON.stringify(events)).not.toContain('anyone there?') // content-free
  })

  test('it STAYS stopped: no new assignments, audit rows or events while nobody acts (the old behaviour looped every SLA interval)', async () => {
    const snapshot = async () => ({
      assignments: await db.assignment.count({ where: { conversationId } }),
      audits: await db.auditLog.count({ where: { tenantId: A.tenantId } }),
      events: await db.systemEvent.count({ where: { category: 'sla', metadata: { path: ['tenantId'], equals: A.tenantId } } }),
      state: (await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).state,
    })
    const before = await snapshot()
    await new Promise((r) => setTimeout(r, 7000)) // > three SLA intervals and many sweep ticks
    expect(await snapshot()).toEqual(before)
    expect(before.state).toBe('EXPIRED')
  })

  test('the manager (own tenant only) sees it with operational metadata and NO message content; other roles/tenants do not', async () => {
    const mine = await A.managerCtx.get(api('/conversations/needs-attention'))
    expect(mine.status()).toBe(200)
    const rows = (await mine.json()).data
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ conversationId, status: 'SLA_CAPPED', consecutiveExpiries: 5, cap: 5, tenant: { id: A.tenantId } })
    expect(JSON.stringify(rows)).not.toContain('anyone there?')
    expect((await (await B.managerCtx.get(api('/conversations/needs-attention'))).json()).data).toEqual([]) // another tenant's manager sees nothing
    const ceo = (await (await (await sharedAdminContext()).get(api('/conversations/needs-attention'))).json()).data
    expect(ceo.some((r: any) => r.conversationId === conversationId)).toBe(true)
    const hunter = await seedHunter('sla-hunter')
    try {
      for (const [who, ctx] of [['operator', A.operatorCtx], ['client', A.clientCtx], ['hunter', hunter.ctx]] as const) {
        expect((await ctx.get(api('/conversations/needs-attention'))).status(), who).toBe(403)
        expect((await ctx.post(api(`/conversations/${conversationId}/resume`), { data: {} })).status(), who).toBe(403)
      }
    } finally {
      await cleanupHunter(hunter.userId)
    }
    expect((await (await anonymousContext()).get(api('/conversations/needs-attention'))).status()).toBe(401)
    expect((await B.managerCtx.post(api(`/conversations/${conversationId}/resume`), { data: {} })).status()).toBe(403) // another tenant's manager cannot act on it
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).state).toBe('EXPIRED')
  })

  test('the manager resumes it: the conversation is assigned again with a fresh counter and the operator can answer it', async () => {
    const res = await A.managerCtx.post(api(`/conversations/${conversationId}/resume`), { data: { reason: 'checked with the client' } })
    expect(res.status()).toBe(200)
    expect((await res.json()).data).toMatchObject({ resumed: true, assigned: true })
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })
    expect(conv.state).toBe('ACTIVE')
    expect(conv.currentAssignmentId).not.toBeNull()
    // it is not capped again after a single further expiry (counter was reset by the resume)
    await new Promise((r) => setTimeout(r, 3500))
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).state).not.toBe('EXPIRED')
    expect(await db.auditLog.count({ where: { tenantId: A.tenantId, action: 'conversation.manual_reassign' } })).toBe(1)
    // a second resume of a conversation that is no longer capped is refused
    expect((await A.managerCtx.post(api(`/conversations/${conversationId}/resume`), { data: {} })).status()).toBe(409)
    const current = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })
    if (current.currentAssignmentId) {
      expect((await A.operatorCtx.post(api('/messages/send'), { data: { conversationId, content: 'Sorry for the wait' } })).status()).toBe(200)
      expect((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).state).toBe('WAITING_FOR_CLIENT')
    }
    expect((await (await A.managerCtx.get(api('/conversations/needs-attention'))).json()).data).toEqual([])
  })

  test('a NEW customer message re-queues a capped conversation with a fresh start (no manager needed)', async () => {
    expect((await sendWebhook(A.integrationId, [{ event_id: 'u2', message_id: 'um2', user_id: 'silent-user-2', text: 'second silent customer' }])).status()).toBe(202)
    expect(await waitFor(async () => (await db.conversation.findFirst({ where: { tenantId: A.tenantId, externalUserId: 'silent-user-2' } }))?.state === 'EXPIRED', 45000, 500)).toBe(true)
    const c2 = (await db.conversation.findFirst({ where: { tenantId: A.tenantId, externalUserId: 'silent-user-2' } }))!
    expect((await sendWebhook(A.integrationId, [{ event_id: 'u3', message_id: 'um3', user_id: 'silent-user-2', text: 'hello??' }])).status()).toBe(202)
    expect(await waitFor(async () => !!(await db.conversation.findUniqueOrThrow({ where: { id: c2.id } })).currentAssignmentId, 15000)).toBe(true)
    expect(['ACTIVE', 'WAITING_FOR_OPERATOR']).toContain((await db.conversation.findUniqueOrThrow({ where: { id: c2.id } })).state)
  })
})
