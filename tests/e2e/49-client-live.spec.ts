import { test, expect } from '@playwright/test'
import { cleanupTenant, seedIsolatedTenant, sendWebhook, waitFor } from './helpers'

test.describe('client live operations view', () => {
  let a: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let b: Awaited<ReturnType<typeof seedIsolatedTenant>>
  test.beforeAll(async () => { a = await seedIsolatedTenant('lva'); b = await seedIsolatedTenant('lvb') })
  test.afterAll(async () => { await cleanupTenant(a.tenantId); await cleanupTenant(b.tenantId) })

  test('shows the client\'s own queue and team, nothing else; staff roles use their own screens', async () => {
    for (const ctx of [a.operatorCtx, a.managerCtx]) expect((await ctx.get('/api/v1/client/live')).status()).toBe(403)
    await sendWebhook(a.integrationId, [{ event_id: `lv-${Date.now()}`, message_id: `lvm-${Date.now()}`, user_id: 'live-user-1', text: 'Secret customer words' }])
    await waitFor(async () => ((await (await a.clientCtx.get('/api/v1/client/live')).json()).data.queue.inProgress + (await (await a.clientCtx.get('/api/v1/client/live')).json()).data.queue.waiting) >= 1)
    const live = (await (await a.clientCtx.get('/api/v1/client/live')).json()).data
    expect(live.queue.inProgress + live.queue.waiting).toBeGreaterThanOrEqual(1)
    expect(live.team.total).toBeGreaterThanOrEqual(1)
    expect(live.service.status).toBe('covered')
    const text = JSON.stringify(live)
    expect(text).not.toContain('Secret customer words'); expect(text).not.toContain('live-user-1'); expect(text).not.toContain('@e2e.gco') // no content, no ids, no emails
    for (const m of live.team.members) expect(m.firstName).not.toMatch(/\s/) // first names only
    const other = (await (await b.clientCtx.get('/api/v1/client/live')).json()).data
    expect(other.queue.inProgress + other.queue.waiting).toBe(0) // another client sees none of it
  })
})
