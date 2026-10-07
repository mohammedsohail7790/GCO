import http from 'http'
import crypto from 'crypto'
import { test, expect, type APIRequestContext } from '@playwright/test'
import { anonymousContext, cleanupTenant, loginAs, seedHunter, cleanupHunter, sharedAdminContext, waitFor } from './helpers'
import { db } from '@/lib/db/client'
import { signPayload } from '@/lib/integrations/adapters/gcoWebhook'

// "First client" operating procedure, end to end, through the REAL API + worker + queue, with NO database shortcuts:
// start onboarding -> invite -> profile -> staged integration -> operator -> verify (both ways) -> checklist -> go-live ->
// first conversation -> operator reply -> outbound delivery -> failure recovery -> secret rotation invalidation.
// The client's endpoint is a LOCAL SIMULATOR implementing docs/gco-webhook-contract.md: this validates the GCO side only
// and is NOT a real-client validation. Needs web + worker started with ALLOW_DEV_ADAPTERS=true (local/CI only).
test.describe.configure({ mode: 'serial' })
test.describe('first client onboarding (console flow) -> first conversation', () => {
  type Req = { headers: http.IncomingHttpHeaders; body: string }
  type Client = { slug: string; onboardingId: string; tenantId: string; clientEmail: string; integrationId: string; secret: string; operatorEmail: string; operatorCtx: APIRequestContext }
  const PASSWORD = 'First-Client-Passw0rd!'
  let sim: http.Server
  let simUrl = ''
  let received: Req[] = []
  let mode: 'ok' | '503' = 'ok'
  let admin: APIRequestContext
  let X: Client
  let Y: Client
  const tenantIds: string[] = []
  const stamp = Date.now()
  const api = (p: string) => `/api/v1${p}`
  const ip = () => ({ 'x-forwarded-for': `fc-${Math.random()}` })

  const signedPost = async (c: Client, body: string, o: { ts?: number; secret?: string } = {}) => {
    const ts = String(o.ts ?? Math.floor(Date.now() / 1000))
    return (await anonymousContext()).post(api(`/webhooks/${c.integrationId}`), {
      data: Buffer.from(body),
      headers: { 'Content-Type': 'application/json', 'X-GCO-Timestamp': ts, 'X-GCO-Signature': signPayload(o.secret ?? c.secret, ts, body) },
    })
  }
  const msg = (user: string, text: string, id: string = crypto.randomUUID()) => JSON.stringify({ events: [{ event_id: `e-${id}`, message_id: `m-${id}`, user_id: user, text }] })
  const detail = async (c: Client) => (await (await admin.get(api(`/admin/onboarding/${c.onboardingId}`))).json()).data
  const item = (d: any, key: string) => d.checklist.find((i: any) => i.key === key)

  /** The whole manual procedure, every step through an API the console uses. */
  async function onboard(tag: string): Promise<Client> {
    const slug = `fc-${tag}-${stamp}`
    const start = await admin.post(api('/admin/onboarding'), { data: { name: `[E2E] First client ${tag}`, slug, contactName: `Client ${tag}`, contactEmail: `client-${tag}-${stamp}@e2e.gco` } })
    expect(start.status(), await start.text()).toBe(201)
    const onboardingId = (await start.json()).data.id
    const d = (await (await admin.get(api(`/admin/onboarding/${onboardingId}`))).json()).data
    tenantIds.push(d.tenant.id)
    const inv = await admin.post(api(`/admin/onboarding/${onboardingId}/invitation`), { data: {} })
    const token = (await inv.json()).data.setupUrl.split('#token=')[1]
    expect((await (await anonymousContext()).post(api('/auth/accept-invitation'), { data: { token, password: PASSWORD }, headers: ip() })).status()).toBe(200)
    const integ = await admin.post(api('/admin/integrations'), { data: { tenantId: d.tenant.id, adapterKey: 'gco-webhook', name: `Main ${tag}`, config: { callbackUrl: simUrl } } }) // status omitted -> staged
    expect(integ.status()).toBe(201)
    const ij = (await integ.json()).data
    const operatorEmail = `op-${tag}-${stamp}@e2e.gco`
    expect((await admin.post(api('/admin/users'), { data: { role: 'OPERATOR', tenantId: d.tenant.id, displayName: `Operator ${tag}`, email: operatorEmail, password: PASSWORD } })).status()).toBe(201)
    const operatorCtx = await loginAs(operatorEmail, PASSWORD)
    expect((await operatorCtx.patch(api('/operators/me/status'), { data: { status: 'AVAILABLE' } })).status()).toBe(200)
    await db.operator.updateMany({ where: { tenantId: d.tenant.id }, data: { capacity: 10 } })
    return { slug, onboardingId, tenantId: d.tenant.id, clientEmail: d.contact.email, integrationId: ij.id, secret: ij.webhookSecret, operatorEmail, operatorCtx }
  }

  test.beforeAll(async () => {
    sim = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') })
        if (mode === '503') return res.writeHead(503).end('unavailable')
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ delivery_id: `sim-${crypto.randomUUID()}` }))
      })
    })
    await new Promise<void>((r) => sim.listen(0, '127.0.0.1', r))
    simUrl = `http://127.0.0.1:${(sim.address() as any).port}/gco`
    admin = await sharedAdminContext()
  })
  test.afterAll(async () => {
    await new Promise((r) => sim.close(r))
    for (const id of tenantIds) await cleanupTenant(id).catch(() => null)
  })

  test('starting a client is a management action: only CEO/Assistant; input is validated; duplicates are refused', async () => {
    const body = { name: 'Nope', slug: `nope-${stamp}`, contactName: 'N', contactEmail: `nope-${stamp}@e2e.gco` }
    expect((await (await anonymousContext()).post(api('/admin/onboarding'), { data: body })).status()).toBe(401)
    const hunter = await seedHunter('fc-hunter')
    try {
      const manager = await loginAs('manager@demo.gco')
      const operator = await loginAs('operator1@demo.gco')
      const client = await loginAs('client@demo.gco')
      for (const [who, ctx] of [['hunter', hunter.ctx], ['manager', manager], ['operator', operator], ['client', client]] as const) {
        expect((await ctx.post(api('/admin/onboarding'), { data: body })).status(), who).toBe(403)
      }
    } finally {
      await cleanupHunter(hunter.userId)
    }
    expect(await db.tenant.count({ where: { slug: body.slug } })).toBe(0)
    for (const bad of [{ ...body, slug: 'Bad Slug!' }, { ...body, contactEmail: 'not-an-email' }, { ...body, name: '' }, { ...body, slug: 'x'.repeat(81) }]) {
      expect((await admin.post(api('/admin/onboarding'), { data: bad })).status(), JSON.stringify(bad).slice(0, 60)).toBe(400)
    }
  })

  test('client X: start -> invite -> accept -> profile -> staged integration -> operator, all through the console APIs', async () => {
    X = await onboard('x')
    const d = await detail(X)
    expect(d.manual).toBe(true)
    expect(d.status).toBe('SETUP')
    expect(d.integrations).toEqual([expect.objectContaining({ adapter: 'gco-webhook', status: 'DISABLED', productionCapable: true, callbackUrl: simUrl, verified: false })])
    expect(d.operators).toEqual([expect.objectContaining({ email: X.operatorEmail, active: true })])
    expect(JSON.stringify(d)).not.toContain(X.secret) // the secret was shown once at creation and never again
    expect(item(d, 'invitation_accepted').state).toBe('pass')
    // the client can now sign in (and could not before accepting)
    expect((await loginAs(X.clientEmail, PASSWORD).then((c) => c.get(api('/onboarding/status')))).status()).toBe(200)
  })

  test('profile: non-secret facts are saved; credentials are refused; only management can write them', async () => {
    const ok = await admin.post(api(`/admin/onboarding/${X.onboardingId}/profile`), { data: { channel: 'In-app chat', website: 'client.example.com', operatingHours: 'Mon-Fri 09:00-18:00 CET', technicalContact: 'Jane Doe, jane@client.example.com' } })
    expect(ok.status()).toBe(200)
    expect((await detail(X)).clientProfile).toMatchObject({ channel: 'In-app chat', website: 'client.example.com' })
    for (const bad of [{ channel: 'api_key: sk-live-1234567890abcdef' }, { technicalContact: 'a'.repeat(40) }, { password: 'x' }, { channel: 'x'.repeat(81) }]) {
      expect((await admin.post(api(`/admin/onboarding/${X.onboardingId}/profile`), { data: bad as any })).status(), JSON.stringify(bad).slice(0, 50)).toBe(400)
    }
    const operator = await loginAs('operator1@demo.gco')
    expect((await operator.post(api(`/admin/onboarding/${X.onboardingId}/profile`), { data: { channel: 'x' } })).status()).toBe(403)
    expect(JSON.stringify(await db.auditLog.findMany({ where: { tenantId: X.tenantId, action: 'onboarding.profile_updated' } }))).not.toContain('jane@client.example.com')
  })

  test('verification: outbound (GCO -> client) then the client\'s signed ping; the checklist moves FAIL -> BLOCKED -> PASS and explains itself', async () => {
    let d = await detail(X)
    expect(item(d, 'integration_verified')).toMatchObject({ state: 'fail', detail: expect.stringMatching(/outbound verification/) })
    expect(d.ready).toBe(false)
    expect((await admin.post(api(`/admin/integrations/${X.integrationId}/verify`), { data: {} })).status()).toBe(200)
    expect(received.at(-1)!.headers['x-gco-signature']).toBe(signPayload(X.secret, String(received.at(-1)!.headers['x-gco-timestamp']), received.at(-1)!.body))
    d = await detail(X)
    expect(item(d, 'integration_verified')).toMatchObject({ state: 'blocked', detail: expect.stringMatching(/Waiting for the client/) })
    expect((await signedPost(X, JSON.stringify({ type: 'ping', ping_id: 'p1' }))).status()).toBe(200)
    d = await detail(X)
    expect(item(d, 'integration_verified').state).toBe('pass')
    expect(d.integrations[0].verification.outboundAt && d.integrations[0].verification.inboundAt).toBeTruthy()
    // only the manual confirmations remain
    expect(d.checklist.filter((i: any) => !i.done).map((i: any) => i.key)).toEqual(['supervisor_confirmed', 'languages_confirmed', 'coverage_confirmed'])
    for (const k of ['supervisor', 'languages', 'coverage']) expect((await admin.post(api(`/admin/onboarding/${X.onboardingId}/confirm`), { data: { item: k } })).status()).toBe(200)
    d = await detail(X)
    expect(d.ready).toBe(true)
    expect(d.status).toBe('READY_FOR_GO_LIVE')
    expect(received.filter((r) => JSON.parse(r.body).type === 'message.reply')).toHaveLength(0) // verification sent no customer traffic
  })

  test('go-live (CEO only) activates exactly this client\'s verified integration', async () => {
    const manager = await loginAs('manager@demo.gco')
    expect((await manager.post(api(`/admin/onboarding/${X.onboardingId}/go-live`), { data: {} })).status()).toBe(403)
    expect((await db.integration.findUniqueOrThrow({ where: { id: X.integrationId } })).status).toBe('DISABLED')
    const live = await admin.post(api(`/admin/onboarding/${X.onboardingId}/go-live`), { data: {} })
    expect(live.status()).toBe(200)
    expect((await live.json()).data).toMatchObject({ status: 'LIVE', activatedIntegrations: 1 })
    expect((await db.integration.findUniqueOrThrow({ where: { id: X.integrationId } })).status).toBe('ACTIVE')
  })

  test('first real conversation: inbound -> tenant X -> operator -> reply -> client endpoint -> DELIVERED; duplicates/replays/other tenants refused', async () => {
    received = []
    const body = msg('first-user', 'Hello, this is our first message')
    expect((await signedPost(X, body)).status()).toBe(202)
    expect(await waitFor(async () => !!(await db.conversation.findFirst({ where: { tenantId: X.tenantId, externalUserId: 'first-user' } }))?.currentAssignmentId, 15000)).toBe(true)
    const conv = (await db.conversation.findFirst({ where: { tenantId: X.tenantId, externalUserId: 'first-user' } }))!
    expect(await db.message.count({ where: { conversationId: conv.id } })).toBe(1)

    const dup = await signedPost(X, body) // the client retries the identical request
    expect([200, 202]).toContain(dup.status())
    expect((await signedPost(X, msg('first-user', 'old'), { ts: Math.floor(Date.now() / 1000) - 3600 })).status()).toBe(401) // stale replay
    expect((await signedPost(X, msg('first-user', 'x'), { secret: 'e'.repeat(64) })).status()).toBe(401)
    await new Promise((r) => setTimeout(r, 1200))
    expect(await db.message.count({ where: { conversationId: conv.id } })).toBe(1) // ONE message

    const reply = await X.operatorCtx.post(api('/messages/send'), { data: { conversationId: conv.id, content: 'Welcome! How can we help?' } })
    expect(reply.status()).toBe(200)
    const messageId = (await reply.json()).data.message.id
    expect(await waitFor(async () => (await db.message.findUnique({ where: { id: messageId } }))?.status === 'DELIVERED', 15000)).toBe(true)
    expect(received.filter((r) => JSON.parse(r.body).type === 'message.reply')).toHaveLength(1)
    const out = received.find((r) => JSON.parse(r.body).type === 'message.reply')!
    expect(JSON.parse(out.body)).toMatchObject({ user_id: 'first-user', text: 'Welcome! How can we help?' })
    expect(out.headers['idempotency-key']).toBe(JSON.parse(out.body).message_id)
    expect((await db.messageEvent.findFirstOrThrow({ where: { messageId, type: 'DELIVERY_CONFIRMED' } })).metadata).toMatchObject({ externalDeliveryId: expect.stringMatching(/^sim-/) })
    expect(await db.auditLog.count({ where: { tenantId: X.tenantId, action: 'message.send', resourceId: messageId } })).toBe(1)
  })

  test('provider failure then recovery: the reply stays undelivered while the client is down, retries with the SAME idempotency key, and is delivered once', async () => {
    mode = '503'
    received = []
    expect((await signedPost(X, msg('retry-user', 'please answer'))).status()).toBe(202)
    expect(await waitFor(async () => !!(await db.conversation.findFirst({ where: { tenantId: X.tenantId, externalUserId: 'retry-user' } }))?.currentAssignmentId, 15000)).toBe(true)
    const conv = (await db.conversation.findFirst({ where: { tenantId: X.tenantId, externalUserId: 'retry-user' } }))!
    const messageId = (await (await X.operatorCtx.post(api('/messages/send'), { data: { conversationId: conv.id, content: 'On it' } })).json()).data.message.id
    expect(await waitFor(async () => received.length >= 1, 15000)).toBe(true)
    expect((await db.message.findUniqueOrThrow({ where: { id: messageId } })).status).not.toBe('DELIVERED')
    mode = 'ok'
    expect(await waitFor(async () => (await db.message.findUnique({ where: { id: messageId } }))?.status === 'DELIVERED', 30000)).toBe(true)
    expect(new Set(received.map((r) => r.headers['idempotency-key'])).size).toBe(1)
    expect(await db.messageEvent.count({ where: { messageId, type: 'DELIVERY_CONFIRMED' } })).toBe(1)
  })

  test('client Y is onboarded in parallel: isolated from X (inbound with X\'s secret is refused, nothing crosses)', async () => {
    Y = await onboard('y')
    expect((await signedPost(Y, msg('y-user', 'intended for Y'), { secret: X.secret })).status()).toBe(404) // Y is still staged: only pings are accepted
    expect(await db.webhookEvent.count({ where: { tenantId: Y.tenantId } })).toBe(0)
    expect(await db.conversation.count({ where: { tenantId: Y.tenantId } })).toBe(0)
    const ws = JSON.stringify(await (await Y.operatorCtx.get(api('/operators/me/workspace'))).json())
    for (const leak of ['first-user', 'retry-user', 'first message', 'Welcome']) expect(ws).not.toContain(leak)
    const yDetail = JSON.stringify(await detail(Y))
    expect(yDetail).not.toContain(X.integrationId)
    expect(yDetail).not.toContain(X.clientEmail)
  })

  test('secret rotation invalidates verification: go-live is BLOCKED until the client is verified again with the NEW secret', async () => {
    for (const k of ['supervisor', 'languages', 'coverage']) await admin.post(api(`/admin/onboarding/${Y.onboardingId}/confirm`), { data: { item: k } })
    await admin.post(api(`/admin/integrations/${Y.integrationId}/verify`), { data: {} })
    expect((await signedPost(Y, JSON.stringify({ type: 'ping' }))).status()).toBe(200)
    expect((await detail(Y)).ready).toBe(true)

    const rot = await admin.patch(api(`/admin/integrations/${Y.integrationId}/webhook-secret`), { data: {} })
    expect(rot.status()).toBe(200)
    const oldSecret = Y.secret
    Y.secret = (await rot.json()).data.secret
    let d = await detail(Y)
    expect(d.ready).toBe(false)
    expect(item(d, 'integration_verified').state).toBe('fail')
    const blocked = await admin.post(api(`/admin/onboarding/${Y.onboardingId}/go-live`), { data: {} })
    expect(blocked.status()).toBe(409)
    expect(JSON.stringify(await blocked.json())).toContain('integration_verified')
    expect((await db.integration.findUniqueOrThrow({ where: { id: Y.integrationId } })).status).toBe('DISABLED')
    expect((await signedPost(Y, JSON.stringify({ type: 'ping' }), { secret: oldSecret })).status()).toBe(404) // the old secret no longer authenticates

    await admin.post(api(`/admin/integrations/${Y.integrationId}/verify`), { data: {} })
    expect((await signedPost(Y, JSON.stringify({ type: 'ping' }))).status()).toBe(200) // new secret
    d = await detail(Y)
    expect(d.ready).toBe(true)
    expect((await admin.post(api(`/admin/onboarding/${Y.onboardingId}/go-live`), { data: {} })).status()).toBe(200)
    expect((await db.integration.findUniqueOrThrow({ where: { id: Y.integrationId } })).status).toBe('ACTIVE')
  })

  test('no secret, token, password or message content reaches audit logs or system events for either client', async () => {
    const audits = JSON.stringify(await db.auditLog.findMany({ where: { tenantId: { in: [X.tenantId, Y.tenantId] } } }))
    const events = JSON.stringify(await db.systemEvent.findMany({ where: { createdAt: { gte: new Date(stamp) } } }))
    for (const blob of [audits, events]) {
      for (const secret of [X.secret, Y.secret, PASSWORD]) expect(blob).not.toContain(secret)
      for (const text of ['first message', 'Welcome', 'please answer']) expect(blob).not.toContain(text)
      expect(blob).not.toMatch(/passwordHash|inviteTokenHash/)
    }
  })
})
