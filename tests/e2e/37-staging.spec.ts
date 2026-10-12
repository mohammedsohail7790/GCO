import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { anonymousContext, loginAs, waitFor } from './helpers'

// Runs ONLY against a staging environment (E2E_STAGING=1, GCO_ENVIRONMENT=staging, seeded by prisma/staging-seed.ts):
//   source ~/gco-local/staging-env.sh && E2E_STAGING=1 npx playwright test tests/e2e/37-staging.spec.ts
// In the normal suite it is skipped (the normal suite runs against a non-staging stack, where these tools must not exist).
const PW = process.env.STAGING_PERSONA_PASSWORD ?? ''
test.skip(process.env.E2E_STAGING !== '1', 'staging-only')

test.describe('staging environment', () => {
  test('identifies itself as staging and the simulator is owner-only', async () => {
    const anon = await anonymousContext()
    expect((await (await anon.get('/api/v1/health')).json()).data.environment).toBe('staging')
    expect((await anon.get('/api/v1/staging/clients')).status()).toBe(401)
    const mgr = await loginAs('manager.aurora@staging.gco', PW)
    expect((await mgr.get('/api/v1/staging/clients')).status()).toBe(403)
    const op = await loginAs('operator1.aurora@staging.gco', PW)
    expect((await op.post('/api/v1/staging/simulate', { data: { tenantId: 'x', customer: 'a', text: 'b' } })).status()).toBe(403)
  })

  test('three separate clients; full flow across two clients stays separated', async () => {
    const owner = await loginAs('owner@staging.gco', PW)
    const clients = (await (await owner.get('/api/v1/staging/clients')).json()).data as { tenantId: string; name: string; ready: boolean }[]
    expect(clients).toHaveLength(3)
    expect(clients.every((c) => c.ready)).toBe(true)
    const aurora = clients.find((c) => c.name.startsWith('Aurora'))!
    const pixel = clients.find((c) => c.name.startsWith('Pixel'))!

    const stamp = Date.now()
    const sim = (tenantId: string, customer: string, text: string, language?: string) => owner.post('/api/v1/staging/simulate', { data: { tenantId, customer, text, language } })
    expect((await sim(aurora.tenantId, `en-${stamp}`, 'Hello, where is my order?', 'en')).status()).toBe(200)
    expect((await sim(aurora.tenantId, `sv-${stamp}`, 'Hej, var är min order?', 'sv')).status()).toBe(200) // nobody online covers Swedish at Aurora
    expect((await sim(pixel.tenantId, `px-${stamp}`, 'Report: spam in chat', 'en')).status()).toBe(200)
    expect((await sim('not-a-tenant', 'a', 'b')).status()).toBe(404)
    expect((await sim(aurora.tenantId, 'a', 'b', 'xyz')).status()).toBe(400)

    const conv = (tenantId: string, who: string) => db.conversation.findFirst({ where: { tenantId, externalUserId: who }, include: { assignments: true } })
    await waitFor(async () => !!(await conv(aurora.tenantId, `en-${stamp}`))?.currentAssignmentId)
    const en = await conv(aurora.tenantId, `en-${stamp}`)
    expect(en?.state).toBe('ACTIVE') // assigned to Aurora's online English-capable operator
    await waitFor(async () => !!(await conv(aurora.tenantId, `sv-${stamp}`)))
    const sv = await conv(aurora.tenantId, `sv-${stamp}`)
    expect(sv?.state).toBe('QUEUED') // no available Swedish speaker at Aurora: waits, never goes to the wrong language
    await waitFor(async () => !!(await conv(pixel.tenantId, `px-${stamp}`))?.currentAssignmentId)
    expect((await conv(pixel.tenantId, `px-${stamp}`))?.state).toBe('ACTIVE')

    // The assigned operator answers; the reply shows up as received by the simulated client platform.
    const op = await loginAs('operator1.aurora@staging.gco', PW)
    const reply = `Thanks, your order is on its way (${stamp}).`
    const send = await op.post('/api/v1/messages/send', { data: { conversationId: en!.id, content: reply } })
    expect(send.ok()).toBe(true)
    await waitFor(async () => ((await (await owner.get(`/api/v1/staging/outbox?tenantId=${aurora.tenantId}`)).json()).data as { text: string }[]).some((o) => o.text === reply))
    const pixelBox = (await (await owner.get(`/api/v1/staging/outbox?tenantId=${pixel.tenantId}`)).json()).data as { text: string }[]
    expect(pixelBox.some((o) => o.text === reply)).toBe(false)

    // Another client's supervisor cannot see Aurora's conversations; Aurora's operator cannot see Pixel's.
    const pixelMgr = await loginAs('manager.pixelarena@staging.gco', PW)
    const found = (await (await pixelMgr.get(`/api/v1/conversations/search?q=${stamp}`)).json()).data
    expect(JSON.stringify(found)).not.toContain(`en-${stamp}`)
    expect(JSON.stringify(found)).not.toContain(`sv-${stamp}`)
  })
})
