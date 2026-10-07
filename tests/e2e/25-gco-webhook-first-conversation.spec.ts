import http from 'http'
import crypto from 'crypto'
import { test, expect, type APIRequestContext } from '@playwright/test'
import { anonymousContext, seedIsolatedTenant, cleanupTenant, sharedAdminContext, waitFor } from './helpers'
import { db } from '@/lib/db/client'
import { signPayload } from '@/lib/integrations/adapters/gcoWebhook'
import { outboundDeliveryProcessor } from '@/workers/processors/outboundDelivery'

// First-conversation validation of the gco-webhook adapter through the REAL stack (web + worker + queue + DB), against a
// local CLIENT SIMULATOR that implements the documented contract. This proves the GCO side end to end; it is NOT a
// real-client validation (that remains blocked until a real client implements the contract against a staged tenant).
// Needs the web server AND worker started with ALLOW_DEV_ADAPTERS=true (local/CI only) so they may call the loopback simulator.
test.describe.configure({ mode: 'serial' })
test.describe('gco-webhook: configure -> verify -> go-live -> first conversation -> reply -> delivery', () => {
  type Req = { headers: http.IncomingHttpHeaders; body: string; at: number }
  let sim: http.Server
  let simUrl = ''
  let received: Req[] = []
  let mode: 'ok' | '500' | '400' = 'ok'
  let A: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let B: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let admin: APIRequestContext
  let integrationId = ''
  let secret = ''
  let onboardingId = ''
  const timings: Record<string, number> = {}
  const api = (p: string) => `/api/v1${p}`

  const signedPost = async (id: string, body: string, opts: { ts?: number; secret?: string } = {}) => {
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000))
    const anon = await anonymousContext()
    return anon.post(api(`/webhooks/${id}`), {
      data: Buffer.from(body), // raw bytes: Playwright must not re-encode what was signed
      headers: { 'Content-Type': 'application/json', 'X-GCO-Timestamp': ts, 'X-GCO-Signature': signPayload(opts.secret ?? secret, ts, body) },
    })
  }
  const inbound = (user: string, text: string, id: string = crypto.randomUUID()) => JSON.stringify({ events: [{ event_id: `ev-${id}`, message_id: `m-${id}`, user_id: user, text }] })
  const conversationFor = (tenantId: string, user: string) => db.conversation.findFirst({ where: { tenantId, externalUserId: user } })
  const sendAs = async (user: string, text: string) => {
    expect((await signedPost(integrationId, inbound(user, 'customer question'))).status()).toBe(202)
    expect(await waitFor(async () => !!(await conversationFor(A.tenantId, user))?.currentAssignmentId, 15000)).toBe(true)
    const conv = (await conversationFor(A.tenantId, user))!
    const res = await A.operatorCtx.post(api('/messages/send'), { data: { conversationId: conv.id, content: text } })
    expect(res.status()).toBe(200)
    return { conv, messageId: (await res.json()).data.message.id as string }
  }

  test.beforeAll(async () => {
    sim = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8'), at: Date.now() })
        if (mode === '500') return res.writeHead(503).end('unavailable')
        if (mode === '400') return res.writeHead(400).end('bad request')
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ delivery_id: `sim-${crypto.randomUUID()}` }))
      })
    })
    await new Promise<void>((r) => sim.listen(0, '127.0.0.1', r))
    simUrl = `http://127.0.0.1:${(sim.address() as any).port}/gco`
    A = await seedIsolatedTenant('gw-a')
    B = await seedIsolatedTenant('gw-b')
    admin = await sharedAdminContext()
    await db.integration.deleteMany({ where: { tenantId: A.tenantId } }) // replace the seeded dev-mock with the real adapter
    await db.operator.updateMany({ where: { tenantId: A.tenantId }, data: { capacity: 20 } }) // several unanswered test conversations stay open
  })
  test.afterAll(async () => {
    await new Promise((r) => sim.close(r))
    await cleanupTenant(A.tenantId).catch(() => null)
    await cleanupTenant(B.tenantId).catch(() => null)
    console.log('GCO-WEBHOOK TIMINGS (local, controlled, ms):', JSON.stringify(timings))
  })

  test('integration administration is CEO-only; config is validated; the secret is shown once and never listed', async () => {
    const anon = await anonymousContext()
    const body = { tenantId: A.tenantId, adapterKey: 'gco-webhook', name: 'Client A', status: 'DISABLED', config: { callbackUrl: simUrl } }
    expect((await anon.post(api('/admin/integrations'), { data: body })).status()).toBe(401)
    for (const [who, ctx] of [['operator', A.operatorCtx], ['manager', A.managerCtx], ['client', A.clientCtx]] as const) {
      expect((await ctx.post(api('/admin/integrations'), { data: body })).status(), who).toBe(403)
    }
    for (const bad of [{}, { callbackUrl: 'https://user:pw@client.example.com/h' }, { callbackUrl: 'https://client.example.com/h#frag' }, { callbackUrl: 'not a url' }, { callbackUrl: simUrl, apiKey: 'sk-live-1' }, { callbackUrl: simUrl, verification: { outboundAt: 'x', inboundAt: 'y' } }]) {
      const r = await admin.post(api('/admin/integrations'), { data: { ...body, config: bad } })
      expect(r.status(), JSON.stringify(bad)).toBe(400)
    }
    expect(await db.integration.count({ where: { tenantId: A.tenantId } })).toBe(0)

    const created = await admin.post(api('/admin/integrations'), { data: body })
    expect(created.status()).toBe(201)
    const c = (await created.json()).data
    integrationId = c.id
    secret = c.webhookSecret
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    const list = JSON.stringify(await (await admin.get(api(`/admin/integrations?tenantId=${A.tenantId}`))).json())
    expect(list).not.toContain(secret)
    expect(list).not.toContain('webhookSecret')
    expect((await db.integration.findUniqueOrThrow({ where: { id: integrationId } })).status).toBe('DISABLED')

    // capability and verification are COMPUTED by the server; nothing the caller sends can declare them
    const row = (await (await admin.get(api(`/admin/integrations?tenantId=${A.tenantId}`))).json()).data.find((x: any) => x.id === integrationId)
    expect(row).toMatchObject({ productionCapable: true, usableForGoLive: true, requiresVerification: true, verified: false, status: 'DISABLED' })
    expect(row.verification).toEqual({ outboundAt: null, inboundAt: null })
    const spoof = await admin.post(api('/admin/integrations'), { data: { ...body, name: 'spoof', productionCapable: true, config: { callbackUrl: simUrl } } })
    expect(spoof.status()).toBe(201) // unknown field is ignored, not trusted
    const spoofRow = (await (await admin.get(api(`/admin/integrations?tenantId=${A.tenantId}`))).json()).data.find((x: any) => x.name === 'spoof')
    expect(spoofRow.productionCapable).toBe(true) // from the registry for gco-webhook, never from the request
    await db.integration.delete({ where: { id: spoofRow.id } })
    const adapters = (await (await admin.get(api('/admin/integrations/adapters'))).json()).data
    expect(adapters.find((a: any) => a.key === 'dev-mock')).toMatchObject({ productionCapable: false })
    expect(adapters.find((a: any) => a.key === 'gco-webhook')).toMatchObject({ productionCapable: true, supportsVerification: true })
    for (const [who, ctx] of [['operator', A.operatorCtx], ['manager', A.managerCtx], ['client', A.clientCtx]] as const) {
      expect((await ctx.get(api('/admin/integrations/adapters'))).status(), who).toBe(403)
    }
    expect((await (await anonymousContext()).get(api('/admin/integrations/adapters'))).status()).toBe(401)
  })

  test('a staged (DISABLED) integration accepts ONLY a correctly signed ping: nothing else is persisted or acknowledged', async () => {
    const before = await db.webhookEvent.count({ where: { tenantId: A.tenantId } })
    expect((await signedPost(integrationId, inbound('u-staged', 'hi'))).status()).toBe(404) // valid signature, but not a ping
    expect((await signedPost(integrationId, JSON.stringify({ type: 'ping' }), { secret: 'f'.repeat(64) })).status()).toBe(404) // wrong secret
    expect((await signedPost(integrationId, JSON.stringify({ type: 'ping' }), { ts: Math.floor(Date.now() / 1000) - 3600 })).status()).toBe(404) // stale
    expect(await db.webhookEvent.count({ where: { tenantId: A.tenantId } })).toBe(before)
    expect((await db.integration.findUniqueOrThrow({ where: { id: integrationId } })).config).not.toHaveProperty('verification')
  })

  test('go-live is refused before verification; outbound verify (CEO only) + the client\'s signed inbound ping verify it', async () => {
    const client = (await db.user.findFirstOrThrow({ where: { tenantId: A.tenantId, role: 'CLIENT' } }))
    onboardingId = (await db.clientOnboarding.create({
      data: {
        leadId: `smoke-${Date.now()}`, tenantId: A.tenantId, contactEmail: client.email, contactName: 'Smoke Client', clientUserId: client.id, status: 'SETUP',
        confirmations: Object.fromEntries(['languages', 'coverage', 'supervisor'].map((k) => [k, { by: 'e2e', at: new Date().toISOString() }])),
      },
    })).id
    const early = await admin.post(api(`/admin/onboarding/${onboardingId}/go-live`), { data: {} })
    expect(early.status()).toBe(409)
    expect(JSON.stringify(await early.json())).toContain('integration_verified')
    expect((await db.integration.findUniqueOrThrow({ where: { id: integrationId } })).status).toBe('DISABLED')

    for (const [who, ctx] of [['operator', A.operatorCtx], ['manager', A.managerCtx], ['client', A.clientCtx]] as const) {
      expect((await ctx.post(api(`/admin/integrations/${integrationId}/verify`), { data: {} })).status(), who).toBe(403)
    }
    expect((await (await anonymousContext()).post(api(`/admin/integrations/${integrationId}/verify`), { data: {} })).status()).toBe(401)
    expect(received).toHaveLength(0) // unauthorised callers caused no outbound traffic

    const out = await admin.post(api(`/admin/integrations/${integrationId}/verify`), { data: {} })
    expect(out.status()).toBe(200)
    const o = (await out.json()).data
    expect(o.outbound.ok).toBe(true)
    expect(o.verified).toBe(false) // inbound proof still missing
    expect(received).toHaveLength(1)
    const ping = received[0]!
    expect(JSON.parse(ping.body)).toMatchObject({ type: 'ping' })
    expect(ping.headers['x-gco-signature']).toBe(signPayload(secret, String(ping.headers['x-gco-timestamp']), ping.body))

    const inbound = await signedPost(integrationId, JSON.stringify({ type: 'ping', ping_id: 'p1' }))
    expect(inbound.status()).toBe(200)
    const again = await (await admin.post(api(`/admin/integrations/${integrationId}/verify`), { data: {} })).json()
    expect(again.data.verified).toBe(true)
    expect(await db.webhookEvent.count({ where: { tenantId: A.tenantId } })).toBe(0) // pings create no events
    expect(await db.message.count({ where: { tenantId: A.tenantId } })).toBe(0)
    received = []
  })

  test('go-live (CEO) activates exactly the verified integration; the Manager cannot', async () => {
    expect((await A.managerCtx.post(api(`/admin/onboarding/${onboardingId}/go-live`), { data: {} })).status()).toBe(403)
    // six concurrent go-live requests: exactly one performs it, the others are idempotent no-ops
    const results = await Promise.all(Array.from({ length: 6 }, () => admin.post(api(`/admin/onboarding/${onboardingId}/go-live`), { data: {} })))
    for (const r of results) expect([200, 409]).toContain(r.status())
    const bodies = await Promise.all(results.filter((r) => r.status() === 200).map(async (r) => (await r.json()).data))
    expect(bodies.filter((b) => b.alreadyLive === false)).toHaveLength(1)
    expect(bodies.find((b) => b.alreadyLive === false)).toMatchObject({ status: 'LIVE', activatedIntegrations: 1 })
    expect((await db.integration.findUniqueOrThrow({ where: { id: integrationId } })).status).toBe('ACTIVE')
    expect(await db.auditLog.count({ where: { tenantId: A.tenantId, action: 'onboarding.live' } })).toBe(1)
  })

  test('first conversation: signed inbound -> authenticated -> persisted -> queued -> assigned to the operator (latency measured locally)', async () => {
    const body = inbound('end-user-1', 'Hello, I need help with my order', 'first')
    const t0 = Date.now()
    const res = await signedPost(integrationId, body)
    timings.webhookAckMs = Date.now() - t0
    expect(res.status()).toBe(202)
    expect(await waitFor(async () => !!(await conversationFor(A.tenantId, 'end-user-1'))?.currentAssignmentId, 15000)).toBe(true)
    timings.inboundToAssignedMs = Date.now() - t0
    const conv = (await conversationFor(A.tenantId, 'end-user-1'))!
    expect(conv.tenantId).toBe(A.tenantId)
    const msgs = await db.message.findMany({ where: { conversationId: conv.id } })
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({ direction: 'INBOUND', tenantId: A.tenantId, content: 'Hello, I need help with my order' })
    const asg = await db.assignment.findUniqueOrThrow({ where: { id: conv.currentAssignmentId! } })
    expect((await db.operator.findUniqueOrThrow({ where: { id: asg.operatorId } })).tenantId).toBe(A.tenantId)
  })

  test('inbound hardening: duplicate, replay, tamper, wrong secret, malformed, oversize, unknown and cross-tenant are all handled with no stray persistence', async () => {
    const dupBody = inbound('end-user-2', 'dup me', 'dup')
    const eventsBeforeDup = await db.webhookEvent.count({ where: { tenantId: A.tenantId } })
    expect((await signedPost(integrationId, dupBody)).status()).toBe(202)
    expect(await waitFor(async () => (await db.message.count({ where: { tenantId: A.tenantId, content: 'dup me' } })) === 1, 10000)).toBe(true)
    const dup = await signedPost(integrationId, dupBody)
    expect([200, 202]).toContain(dup.status())
    await new Promise((r) => setTimeout(r, 1500))
    expect(await db.message.count({ where: { tenantId: A.tenantId, content: 'dup me' } })).toBe(1) // ONE message
    expect(await db.webhookEvent.count({ where: { tenantId: A.tenantId } })).toBe(eventsBeforeDup + 1) // one stored event for two identical deliveries

    const events = await db.webhookEvent.count({ where: { tenantId: A.tenantId } })
    const fresh = inbound('end-user-3', 'should never persist', 'bad')
    expect((await signedPost(integrationId, fresh, { ts: Math.floor(Date.now() / 1000) - 600 })).status()).toBe(401) // replay of an old signed request
    expect((await signedPost(integrationId, fresh, { secret: 'e'.repeat(64) })).status()).toBe(401) // wrong secret
    const ts = String(Math.floor(Date.now() / 1000))
    const anon = await anonymousContext()
    expect((await anon.post(api(`/webhooks/${integrationId}`), { data: fresh.replace('persist', 'PERSIST'), headers: { 'Content-Type': 'application/json', 'X-GCO-Timestamp': ts, 'X-GCO-Signature': signPayload(secret, ts, fresh) } })).status()).toBe(401) // tampered
    expect((await anon.post(api(`/webhooks/${integrationId}`), { data: fresh, headers: { 'Content-Type': 'application/json' } })).status()).toBe(401) // unsigned
    expect((await anon.post(api(`/webhooks/${integrationId}`), { data: fresh, headers: { 'Content-Type': 'application/json', 'X-GCO-Signature': 'deadbeef'.repeat(8) } })).status()).toBe(401) // dev-mock style signature
    expect((await signedPost(integrationId, JSON.stringify({ events: [{ event_id: 'x', message_id: 'y', user_id: 'z' }] }))).status()).toBe(400) // malformed: no text
    expect((await signedPost(integrationId, JSON.stringify({ events: [{ event_id: 'x', message_id: 'y', user_id: 'z', text: 'a'.repeat(4001) }] }))).status()).toBe(400) // oversize
    expect((await signedPost(integrationId, 'not json')).status()).toBe(400)
    expect((await signedPost('no-such-integration', fresh)).status()).toBe(404)
    // another tenant's webhook URL with THIS client's secret is rejected (per-integration secrets)
    expect((await signedPost(B.integrationId, fresh)).status()).toBe(401)
    expect(await db.webhookEvent.count({ where: { tenantId: A.tenantId } })).toBe(events)
    expect(await db.webhookEvent.count({ where: { tenantId: B.tenantId } })).toBe(0)
    expect(await db.message.count({ where: { content: 'should never persist' } })).toBe(0)
  })

  test('operator reply -> real outbound to the client endpoint -> DELIVERED only after the client answered 2xx; one send; audit trail', async () => {
    received = []
    const conv = (await conversationFor(A.tenantId, 'end-user-1'))!
    // authorisation boundaries on sending
    expect((await B.operatorCtx.post(api('/messages/send'), { data: { conversationId: conv.id, content: 'cross-tenant' } })).status()).toBe(403)
    for (const [who, ctx] of [['client', A.clientCtx], ['manager', A.managerCtx], ['ceo', admin]] as const) {
      expect((await ctx.post(api('/messages/send'), { data: { conversationId: conv.id, content: 'impersonation' } })).status(), who).toBe(403)
    }
    expect(received).toHaveLength(0)

    const t0 = Date.now()
    const res = await A.operatorCtx.post(api('/messages/send'), { data: { conversationId: conv.id, content: 'Happy to help - what is the order number?' } })
    expect(res.status()).toBe(200)
    const messageId = (await res.json()).data.message.id
    expect(await waitFor(async () => (await db.message.findUnique({ where: { id: messageId } }))?.status === 'DELIVERED', 15000)).toBe(true)
    timings.operatorSendToDeliveredMs = Date.now() - t0

    expect(received).toHaveLength(1) // exactly one request to the client
    const r = received[0]!
    const msg = await db.message.findUniqueOrThrow({ where: { id: messageId } })
    expect(JSON.parse(r.body)).toMatchObject({ type: 'message.reply', message_id: msg.externalMessageId, user_id: 'end-user-1', text: 'Happy to help - what is the order number?' })
    expect(r.headers['idempotency-key']).toBe(msg.externalMessageId)
    expect(r.headers['x-gco-signature']).toBe(signPayload(secret, String(r.headers['x-gco-timestamp']), r.body))
    expect(msg.deliveredAt).not.toBeNull()
    const ev = await db.messageEvent.findFirstOrThrow({ where: { messageId, type: 'DELIVERY_CONFIRMED' } })
    expect((ev.metadata as any).externalDeliveryId).toMatch(/^sim-/)
    expect(await db.auditLog.count({ where: { tenantId: A.tenantId, action: 'message.send', resourceId: messageId } })).toBe(1)

    await outboundDeliveryProcessor({ data: { messageId } } as any) // duplicate job / duplicate action
    await outboundDeliveryProcessor({ data: { messageId } } as any)
    expect(received).toHaveLength(1)
  })

  test('tenant isolation: Client B / Operator B see nothing of Client A, and the simulator only ever saw Client A traffic', async () => {
    const ws = JSON.stringify(await (await B.operatorCtx.get(api('/operators/me/workspace'))).json())
    for (const u of ['end-user-1', 'Hello, I need help', 'Happy to help']) expect(ws).not.toContain(u)
    expect(await db.conversation.count({ where: { tenantId: B.tenantId } })).toBe(0)
    expect(await db.message.count({ where: { tenantId: B.tenantId } })).toBe(0)
    expect((await B.clientCtx.get(api('/admin/integrations'))).status()).toBe(403)
    expect((await B.operatorCtx.post(api(`/admin/integrations/${integrationId}/verify`), { data: {} })).status()).toBe(403)
    expect((await B.clientCtx.get(api('/onboarding/status'))).status()).toBe(200) // own tenant only
    expect(JSON.stringify(await (await B.clientCtx.get(api('/onboarding/status'))).json())).not.toContain('Client A')
  })

  test('secret rotation (CEO only): the old secret stops working at once, verification is cleared, the new secret works', async () => {
    const oldSecret = secret
    for (const [who, ctx] of [['operator', A.operatorCtx], ['manager', A.managerCtx], ['client', A.clientCtx]] as const) {
      expect((await ctx.patch(api(`/admin/integrations/${integrationId}/webhook-secret`), { data: {} })).status(), who).toBe(403)
    }
    const rot = await admin.patch(api(`/admin/integrations/${integrationId}/webhook-secret`), { data: {} })
    expect(rot.status()).toBe(200)
    secret = (await rot.json()).data.secret
    expect(secret).not.toBe(oldSecret)
    const row = (await (await admin.get(api(`/admin/integrations?tenantId=${A.tenantId}`))).json()).data.find((x: any) => x.id === integrationId)
    expect(row.verified).toBe(false) // verification cleared by the rotation
    expect(row.verification).toEqual({ outboundAt: null, inboundAt: null })
    expect(JSON.stringify(row)).not.toContain(secret)
    expect((await signedPost(integrationId, inbound('end-user-rot', 'sent with the OLD secret'), { secret: oldSecret })).status()).toBe(401)
    expect((await signedPost(integrationId, inbound('end-user-rot', 'sent with the NEW secret'))).status()).toBe(202)
    expect(await db.message.count({ where: { tenantId: A.tenantId, content: 'sent with the OLD secret' } })).toBe(0)
  })

  test('provider 5xx: message FAILED (never DELIVERED), retried with the SAME idempotency key, delivered once the client recovers', async () => {
    mode = '500'
    received = []
    const { messageId } = await sendAs('end-user-5xx', 'retry me')
    expect(await waitFor(async () => received.length >= 1, 15000)).toBe(true)
    expect((await db.message.findUniqueOrThrow({ where: { id: messageId } })).status).not.toBe('DELIVERED')
    mode = 'ok'
    expect(await waitFor(async () => (await db.message.findUnique({ where: { id: messageId } }))?.status === 'DELIVERED', 30000)).toBe(true)
    const msg = await db.message.findUniqueOrThrow({ where: { id: messageId } })
    const keys = new Set(received.map((r) => r.headers['idempotency-key']))
    expect(keys).toEqual(new Set([msg.externalMessageId])) // every attempt carried the same key
    expect(received.filter((r) => r.headers['idempotency-key'] === msg.externalMessageId).length).toBeGreaterThanOrEqual(2)
    expect(await db.messageEvent.count({ where: { messageId, type: 'DELIVERY_FAILED' } })).toBeGreaterThanOrEqual(1)
    expect(await db.messageEvent.count({ where: { messageId, type: 'DELIVERY_CONFIRMED' } })).toBe(1)
  })

  test('provider 4xx: FAILED after exactly one attempt (no retry storm) and a content-free SystemEvent for management', async () => {
    mode = '400'
    received = []
    const { messageId } = await sendAs('end-user-4xx', 'this will be rejected')
    expect(await waitFor(async () => (await db.message.findUnique({ where: { id: messageId } }))?.status === 'FAILED', 15000)).toBe(true)
    await new Promise((r) => setTimeout(r, 4000)) // a retry would have fired within the 2s first backoff
    expect(received).toHaveLength(1)
    const ev = await db.systemEvent.findFirstOrThrow({ where: { category: 'delivery', metadata: { path: ['messageId'], equals: messageId } } })
    expect(ev.metadata).toMatchObject({ tenantId: A.tenantId, integrationId, category: 'client_4xx' })
    expect(JSON.stringify(ev)).not.toContain('this will be rejected')
    mode = 'ok'
  })

  test('secrets and message content never reach audit logs, system events or message events', async () => {
    const audits = JSON.stringify(await db.auditLog.findMany({ where: { tenantId: A.tenantId } }))
    const events = JSON.stringify(await db.systemEvent.findMany({ where: { createdAt: { gte: new Date(Date.now() - 900_000) } } }))
    const msgEvents = JSON.stringify(await db.messageEvent.findMany({ where: { message: { tenantId: A.tenantId } } }))
    for (const blob of [audits, events, msgEvents]) {
      expect(blob).not.toContain(secret)
      expect(blob).not.toContain('Happy to help')
      expect(blob).not.toContain('retry me')
    }
  })
})
