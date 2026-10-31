import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant, sharedAdminContext } from './helpers'
import { db } from '@/lib/db/client'

// P0-9: a client must never receive internal commercial or security fields, or anything about another client or about GCO's own staff,
// in ANY response it can reach. The tenant under test has billing settings, usage, an issued invoice and a handled conversation, so
// the forbidden fields really exist in the database: their absence from the responses is the filtering working, not empty data.
const FORBIDDEN_KEY = /margin|operatorcost|rateeurcents|commission|payout|ledger|owed|passwordhash|webhooksecret|secret|refreshtoken|totp|hunter/i

// Every parameterless GET a CLIENT could reach (from the route inventory). Endpoints a client is refused on are skipped, but at least
// MIN_REACHED must answer 200 so the test cannot pass by reaching nothing.
const CLIENT_GET_PATHS = [
  '/api/v1/client/live',
  '/api/v1/client/invoices',
  '/api/v1/client/requests',
  '/api/v1/client/data-requests',
  '/api/v1/client/moderation/summary',
  '/api/v1/reports/client?days=14',
  '/api/v1/usage/summary',
  '/api/v1/tickets',
  '/api/v1/client-requests',
  '/api/v1/escalations',
  '/api/v1/onboarding/status',
  '/api/v1/tenant/settings',
  '/api/v1/tenant/services',
  '/api/v1/notifications',
  '/api/v1/analytics/overview',
]
const MIN_REACHED = 6

function collectKeys(v: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => collectKeys(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); collectKeys(x, out) }
  return out
}

test.describe('client portal leak checks', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  const MARK_B = `ZZLEAKMARK-B-${Date.now()}`

  test.beforeAll(async () => {
    a = await seedIsolatedTenant('leak-a')
    b = await seedIsolatedTenant('leak-b')
    const admin = await sharedAdminContext()
    // internal commercial data for tenant A (price charged and what an operator costs us)
    const s = await admin.put('/api/v1/admin/billing/settings', { data: { tenantId: a.tenantId, billingModel: 'PER_MESSAGE', pricePerMessageEurCents: 15, operatorCostPerMessageEurCents: 7 } })
    expect(s.ok()).toBe(true)
    // a handled conversation in A (usage + operator reply) and a conversation with a unique marker in B
    expect((await sendWebhook(a.integrationId, [{ event_id: 'ev-leak-a', message_id: 'msg-leak-a', user_id: 'user-leak-a', text: 'Where is my order?' }])).status()).toBe(202)
    expect((await sendWebhook(b.integrationId, [{ event_id: 'ev-leak-b', message_id: 'msg-leak-b', user_id: 'user-leak-b', text: MARK_B }])).status()).toBe(202)
    let convId = ''
    await waitFor(async () => {
      const c = await db.conversation.findFirst({ where: { tenantId: a.tenantId, externalUserId: 'user-leak-a' } })
      convId = c?.id ?? ''
      return !!c?.currentAssignmentId
    })
    const reply = await a.operatorCtx.post('/api/v1/messages/send', { data: { conversationId: convId, content: 'Checking now.' } })
    expect(reply.ok()).toBe(true)
    await waitFor(async () => (await db.usageRecord.count({ where: { tenantId: a.tenantId } })) > 0)
    // an issued invoice in A
    const now = new Date()
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString().slice(0, 10) // the day after today, so today's usage is inside the period
    const draft = await admin.post('/api/v1/admin/billing/invoices', { data: { tenantId: a.tenantId, periodStart, periodEnd } })
    expect(draft.ok(), await draft.text()).toBe(true)
    const invoiceId = (await draft.json()).data.id
    expect((await admin.post(`/api/v1/admin/billing/invoices/${invoiceId}/issue`)).ok()).toBe(true)
  })

  test.afterAll(async () => {
    await cleanupTenant(a.tenantId)
    await cleanupTenant(b.tenantId)
  })

  test('no internal field, other client or staff identity appears in any client-reachable response', async () => {
    let reached = 0
    const problems: string[] = []
    const bodies: string[] = []
    for (const path of CLIENT_GET_PATHS) {
      const res = await a.clientCtx.get(path)
      if (!res.ok()) continue
      reached++
      const text = await res.text()
      bodies.push(text)
      let json: unknown
      try { json = JSON.parse(text) } catch { continue }
      for (const k of collectKeys(json)) if (FORBIDDEN_KEY.test(k)) problems.push(`${path}: forbidden key "${k}"`)
      for (const needle of [b.tenantId, b.slug, b.operatorEmail, b.managerEmail, b.clientEmail, MARK_B, a.operatorEmail, a.managerEmail]) {
        if (text.includes(needle)) problems.push(`${path}: contains "${needle.slice(0, 24)}"`)
      }
    }
    expect(reached, 'the client must be able to reach enough endpoints for this check to mean anything').toBeGreaterThanOrEqual(MIN_REACHED)
    expect(problems).toEqual([])
    // the data the client IS entitled to is really there (so the checks above were not run against empty bodies)
    expect(bodies.join('\n')).toContain('GCO-')
  })

  test('the internal operator cost and margin exist for management but are never shown to the client', async () => {
    const admin = await sharedAdminContext()
    const now = new Date()
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString().slice(0, 10)
    const mgmt = await admin.get(`/api/v1/admin/billing/reconciliation?tenantId=${a.tenantId}&from=${from}&to=${to}`)
    expect(mgmt.ok()).toBe(true)
    expect(collectKeys(await mgmt.json()).has('margin')).toBe(true)
    // and the client is refused the management views outright
    for (const p of ['/api/v1/admin/executive/overview', `/api/v1/admin/billing/reconciliation?tenantId=${a.tenantId}&from=${from}&to=${to}`, '/api/v1/admin/audit-logs']) {
      expect([401, 403]).toContain((await a.clientCtx.get(p)).status())
    }
  })
})
