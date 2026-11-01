import { test, expect } from '@playwright/test'
import { seedIsolatedTenant, sendWebhook, waitFor, cleanupTenant, sharedAdminContext } from './helpers'
import { db } from '@/lib/db/client'

// P0-6: CSV exports are management-only, bound to the requesting user, short-lived, audited, and their totals equal what the screen shows.
test.describe('csv exports', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let from = ''
  let to = ''
  let invoiceNumber = ''

  test.beforeAll(async () => {
    a = await seedIsolatedTenant('export-a')
    const admin = await sharedAdminContext()
    expect((await admin.put('/api/v1/admin/billing/settings', { data: { tenantId: a.tenantId, billingModel: 'PER_MESSAGE', pricePerMessageEurCents: 15, operatorCostPerMessageEurCents: 7 } })).ok()).toBe(true)
    for (let i = 0; i < 3; i++) {
      expect((await sendWebhook(a.integrationId, [{ event_id: `ev-exp-${i}`, message_id: `msg-exp-${i}`, user_id: `user-exp-${i}`, text: `Order question ${i}` }])).status()).toBe(202)
    }
    await waitFor(async () => (await db.usageRecord.count({ where: { tenantId: a.tenantId } })) >= 3)
    const now = new Date()
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
    to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString().slice(0, 10) // day after today so today's usage is inside
    const draft = await admin.post('/api/v1/admin/billing/invoices', { data: { tenantId: a.tenantId, periodStart: from, periodEnd: to } })
    expect(draft.ok(), await draft.text()).toBe(true)
    const id = (await draft.json()).data.id
    const issued = await admin.post(`/api/v1/admin/billing/invoices/${id}/issue`)
    expect(issued.ok()).toBe(true)
    invoiceNumber = (await issued.json()).data.number
  })
  test.afterAll(async () => { await cleanupTenant(a.tenantId) })

  const request = async (kind: string, extra: Record<string, unknown> = {}) => {
    const admin = await sharedAdminContext()
    return admin.post('/api/v1/admin/exports', { data: { kind, tenantId: a.tenantId, from, to, ...extra } })
  }
  const download = async (url: string) => (await sharedAdminContext()).get(url)

  test('usage export: file, headers, audit entries, and its total equals the reconciliation screen', async () => {
    const r = await request('usage')
    expect(r.status()).toBe(200)
    const { downloadUrl } = (await r.json()).data
    const res = await download(downloadUrl)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/csv')
    expect(res.headers()['content-disposition']).toContain('attachment')
    expect(res.headers()['cache-control']).toContain('no-store')
    const lines = (await res.text()).trim().split('\r\n')
    expect(lines[0]).toBe('createdAt,messageId,eventType,billable,priceEurCents,operatorCostEurCents,source')
    expect(lines.length - 1).toBe(3)
    const priceSum = lines.slice(1).reduce((s, l) => s + Number(l.split(',')[4]), 0)
    const admin = await sharedAdminContext()
    const rec = await (await admin.get(`/api/v1/admin/billing/reconciliation?tenantId=${a.tenantId}&from=${from}&to=${to}`)).json()
    expect(priceSum).toBe(rec.data.clientBilling.billedPerUsageEurCents)
    expect(priceSum).toBe(45)
    const actions = (await db.auditLog.findMany({ where: { tenantId: a.tenantId, resource: 'export' }, select: { action: true } })).map((x) => x.action)
    expect(actions).toContain('export.requested')
    expect(actions).toContain('export.downloaded')
  })

  test('invoices, reconciliation and operator-earnings exports work', async () => {
    const inv = await download((await (await request('invoices')).json()).data.downloadUrl)
    expect(await inv.text()).toContain(invoiceNumber)
    const rec = await download((await (await request('reconciliation')).json()).data.downloadUrl)
    const recText = await rec.text()
    expect(recText).toContain('billedPerUsageEurCents,45')
    expect(recText).toContain('billableMessages,3')
    const earn = await download((await (await request('operator-earnings')).json()).data.downloadUrl)
    expect(earn.status()).toBe(200)
    expect((await earn.text()).startsWith('messageAt,operatorId,messageId,rateEurCents,basis,state,stateReason,payoutId')).toBe(true)
  })

  test('only management can request; clients, operators and managers are refused, and a link is useless to them', async () => {
    const url = (await (await request('usage')).json()).data.downloadUrl
    const body = { kind: 'usage', tenantId: a.tenantId, from, to }
    for (const ctx of [a.clientCtx, a.operatorCtx, a.managerCtx]) {
      expect([401, 403]).toContain((await ctx.post('/api/v1/admin/exports', { data: body })).status())
      expect([401, 403]).toContain((await ctx.get(url)).status())
    }
  })

  test('a tampered or garbage link and a bad period are refused', async () => {
    const url: string = (await (await request('usage')).json()).data.downloadUrl
    const token = decodeURIComponent(url.split('token=')[1] ?? '')
    const [body = '', sig = ''] = token.split('.')
    const other = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), tenantId: 'someone-else' })).toString('base64url')
    for (const t of [`${other}.${sig}`, 'garbage', '']) {
      const res = await download(`/api/v1/admin/exports/download?token=${encodeURIComponent(t)}`)
      expect(res.status()).toBe(403)
      expect((await res.json()).error.code).toBe('EXPORT_LINK_INVALID')
    }
    expect((await request('usage', { from: to, to: from })).status()).toBe(400)
    expect((await request('usage', { from: '2020-01-01', to })).status()).toBe(400)
    expect((await request('usage', { tenantId: 'does-not-exist' })).status()).toBe(404)
    expect((await request('usage', { kind: 'everything' })).status()).toBe(400)
  })
})
