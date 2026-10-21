import http from 'http'
import crypto from 'crypto'
import { test, expect, type APIRequestContext } from '@playwright/test'
import { db } from '@/lib/db/client'
import { signPayload } from '@/lib/integrations/adapters/gcoWebhook'
import { anonymousContext, loginAs, seedIsolatedTenant, cleanupTenant, sharedAdminContext, waitFor } from './helpers'

// FULL SIMULATED CLIENT ACCEPTANCE TEST. A scripted "client company" is created through the setup wizard, connected through the production-capable
// gco-webhook contract to a local client simulator, and then run through a working day: customers in two languages, operator replies with the
// client's own quick replies, delivery callbacks (including a client outage and recovery), a duplicate event, an escalation, a moderation feed,
// quality review, operator earnings and payout, client invoice and reconciliation, a privacy erasure, and isolation from another client.
// Everything is synthetic. It proves the GCO side end to end; it is NOT a real-client validation (no real client API exists yet).
test.describe.configure({ mode: 'serial' })
test.describe('simulated client: setup -> connect -> operate -> bill -> pay -> privacy -> isolation', () => {
  type Req = { headers: http.IncomingHttpHeaders; body: string }
  const stamp = Date.now()
  const PASSWORD = 'Harbor-Quiet-Lantern-2026'
  const slug = `sim-client-${stamp}`
  const email = (who: string) => `${slug}-${who}@e2e.gco`
  let sim: http.Server
  let simUrl = ''
  let received: Req[] = []
  let mode: 'ok' | '503' = 'ok'
  let admin: APIRequestContext
  let other: Awaited<ReturnType<typeof seedIsolatedTenant>>
  let tenantId = ''
  let integrationId = ''
  let secret = ''
  let mgr: APIRequestContext, opEn: APIRequestContext, opEs: APIRequestContext, client: APIRequestContext
  let opEnId = '', opEsId = ''
  const api = (p: string) => `/api/v1${p}`
  const inboundCount = { n: 0 }

  const signedPost = async (path: string, body: string) => {
    const ts = String(Math.floor(Date.now() / 1000))
    return (await anonymousContext()).post(api(path), { data: Buffer.from(body), headers: { 'Content-Type': 'application/json', 'X-GCO-Timestamp': ts, 'X-GCO-Signature': signPayload(secret, ts, body) } })
  }
  const customer = async (user: string, text: string, lang: string, id: string = crypto.randomUUID()) => {
    inboundCount.n++
    const body = JSON.stringify({ events: [{ event_id: `ev-${id}`, message_id: `m-${id}`, user_id: user, text, lang }] })
    expect((await signedPost(`/webhooks/${integrationId}`, body)).status()).toBe(202)
    return { body, id }
  }
  const convOf = (user: string) => db.conversation.findFirst({ where: { tenantId, externalUserId: user } })
  const assignedTo = async (user: string) => (await waitFor(async () => !!(await convOf(user))?.currentAssignmentId, 15000)) ? (await db.assignment.findUniqueOrThrow({ where: { id: (await convOf(user))!.currentAssignmentId! } })).operatorId : null

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
    other = await seedIsolatedTenant('simother')
  })
  test.afterAll(async () => {
    await new Promise((r) => sim.close(r))
    if (tenantId) {
      const ops = (await db.operator.findMany({ where: { tenantId }, select: { id: true } })).map((o) => o.id)
      await db.operatorPayout.deleteMany({ where: { operatorId: { in: ops } } }); await db.operatorEarningAdjustment.deleteMany({ where: { operatorId: { in: ops } } }); await db.operatorEarningLine.deleteMany({ where: { operatorId: { in: ops } } })
      await db.operatorWeeklyReport.deleteMany({ where: { tenantId } }); await db.operatorRateCard.deleteMany({ where: { tenantId } }); await db.qaReview.deleteMany({ where: { tenantId } })
      await db.moderationAppeal.deleteMany({ where: { tenantId } }); await db.moderationAction.deleteMany({ where: { tenantId } }); await db.moderationDecision.deleteMany({ where: { tenantId } }); await db.moderationItem.deleteMany({ where: { tenantId } })
      await db.knowledgeEntry.deleteMany({ where: { tenantId } }); await db.invoice.deleteMany({ where: { tenantId } }); await db.dataRequest.deleteMany({ where: { tenantId } })
      await db.notification.deleteMany({ where: { tenantId } }); await db.clientMessage.deleteMany({ where: { tenantId } }); await db.clientRequest.deleteMany({ where: { tenantId } })
      await db.staffInvitation.deleteMany({ where: { tenantId } }); await db.tenantService.deleteMany({ where: { tenantId } }); await db.trainingAssignment.deleteMany({ where: { operatorId: { in: ops } } })
      await cleanupTenant(tenantId).catch(() => null)
    }
    await cleanupTenant(other.tenantId).catch(() => null)
  })

  test('1. the CEO sets up the client in one step: services, languages, pay rate, billing, invitations; everyone activates their own account', async () => {
    const res = await admin.post(api('/admin/clients/setup'), { data: {
      company: { name: `[E2E] Simulated Client ${stamp}`, slug }, industry: 'ECOMMERCE', services: ['LIVE_CHAT_SUPPORT', 'MULTILINGUAL_CHAT', 'CHAT_MODERATION'], languages: ['en', 'es'], timezone: 'Europe/Rome', operatingHours: null,
      responseSlaSeconds: 120, operatorCapacity: 5, messageCap: null,
      billing: { model: 'PER_MESSAGE', pricePerMessageEurCents: 14, vatRatePercent: 22 }, operatorPay: { amountEurCents: 7, basis: 'DELIVERED' }, // 7 = TEST value (the CEO's provisional reference is not configured anywhere)
      aiMode: 'HUMAN_ONLY', requireOperatorApproval: false,
      clientContact: { email: email('client'), name: 'Simulated Client Contact' },
      staff: [{ email: email('mgr'), name: 'Maya Manager', role: 'MANAGER' }, { email: email('en'), name: 'Elena English', role: 'OPERATOR', languages: ['en'] }, { email: email('es'), name: 'Pablo Spanish', role: 'OPERATOR', languages: ['es'] }],
    } })
    expect(res.status()).toBe(200)
    const data = (await res.json()).data
    tenantId = data.tenantId
    expect(data.warnings).toEqual([]); expect(data.invitations).toHaveLength(4)
    expect(data.workspace.modules).toEqual(expect.arrayContaining(['conversations', 'language_routing', 'moderation_queue']))
    for (const inv of data.invitations) {
      const token = inv.setupUrl.split('#token=')[1]
      expect((await (await anonymousContext()).post(api('/auth/accept-invitation'), { data: { token, password: PASSWORD }, headers: { 'x-forwarded-for': `sim-${Math.random()}` } })).status()).toBe(200)
    }
    ;[mgr, opEn, opEs, client] = await Promise.all([loginAs(email('mgr'), PASSWORD), loginAs(email('en'), PASSWORD), loginAs(email('es'), PASSWORD), loginAs(email('client'), PASSWORD)])
    opEnId = (await db.operator.findFirstOrThrow({ where: { user: { email: email('en') } } })).id
    opEsId = (await db.operator.findFirstOrThrow({ where: { user: { email: email('es') } } })).id
    for (const o of [opEn, opEs]) expect((await o.patch(api('/operators/me/status'), { data: { status: 'AVAILABLE' } })).status()).toBe(200)
    expect((await client.get(api('/auth/me')).then((r) => r.json())).data.user).toMatchObject({ role: 'CLIENT', tenantId })
  })

  test('2. the client platform is connected through the signed contract, verified both ways, and the CEO takes it live', async () => {
    const created = await admin.post(api('/admin/integrations'), { data: { tenantId, adapterKey: 'gco-webhook', name: 'Simulated client platform', status: 'DISABLED', config: { callbackUrl: simUrl } } })
    expect(created.status()).toBe(201)
    const c = (await created.json()).data
    integrationId = c.id; secret = c.webhookSecret
    const contact = await db.user.findFirstOrThrow({ where: { tenantId, role: 'CLIENT' } })
    const onboarding = await db.clientOnboarding.create({ data: { leadId: `sim-${stamp}`, tenantId, contactEmail: contact.email, contactName: 'Sim', clientUserId: contact.id, status: 'SETUP', confirmations: Object.fromEntries(['languages', 'coverage', 'supervisor'].map((k) => [k, { by: 'e2e', at: new Date().toISOString() }])) } })
    expect((await admin.post(api(`/admin/onboarding/${onboarding.id}/go-live`), { data: {} })).status()).toBe(409) // not verified yet
    expect((await admin.post(api(`/admin/integrations/${integrationId}/verify`), { data: {} })).status()).toBe(200) // GCO -> client ping
    expect((await signedPost(`/webhooks/${integrationId}`, JSON.stringify({ type: 'ping' }))).status()).toBe(200) // client -> GCO ping
    expect((await (await admin.post(api(`/admin/integrations/${integrationId}/verify`), { data: {} })).json()).data.verified).toBe(true)
    expect((await admin.post(api(`/admin/onboarding/${onboarding.id}/go-live`), { data: {} })).status()).toBe(200)
    expect((await db.integration.findUniqueOrThrow({ where: { id: integrationId } })).status).toBe('ACTIVE')
    received = []
  })

  test('3. customers write in two languages: each conversation reaches an operator who speaks it; a duplicate delivery changes nothing', async () => {
    for (const u of ['en-1', 'en-2', 'en-3']) await customer(u, `Hello, I need help with order ${u}`, 'en')
    for (const u of ['es-1', 'es-2']) await customer(u, `Hola, necesito ayuda con el pedido ${u}`, 'es')
    for (const u of ['en-1', 'en-2', 'en-3']) expect(await assignedTo(u)).toBe(opEnId)
    for (const u of ['es-1', 'es-2']) expect(await assignedTo(u)).toBe(opEsId)
    const dup = await customer('en-4', 'This message is sent twice', 'en', 'dup-fixed')
    expect(await assignedTo('en-4')).toBe(opEnId)
    expect([200, 202]).toContain((await signedPost(`/webhooks/${integrationId}`, dup.body)).status())
    await new Promise((r) => setTimeout(r, 1500))
    expect(await db.message.count({ where: { tenantId, content: 'This message is sent twice' } })).toBe(1)
  })

  test('4. the manager gives operators the client\'s own quick replies; operators answer; every reply reaches the client platform once, signed', async () => {
    expect((await mgr.post(api('/knowledge'), { data: { kind: 'QUICK_REPLY', title: 'Order help EN', body: 'Thanks for contacting us. I am checking your order now.', language: 'en' } })).status()).toBe(200)
    expect((await mgr.post(api('/knowledge'), { data: { kind: 'QUICK_REPLY', title: 'Ayuda pedido ES', body: 'Gracias por escribirnos. Estoy revisando su pedido.', language: 'es' } })).status()).toBe(200)
    const kbEn = (await (await opEn.get(api('/operators/me/knowledge?language=en'))).json()).data as { body: string }[]
    const kbEs = (await (await opEs.get(api('/operators/me/knowledge?language=es'))).json()).data as { body: string }[]
    expect(kbEn.map((k) => k.body)).toEqual(['Thanks for contacting us. I am checking your order now.']) // only the English entry
    expect(kbEs.map((k) => k.body)).toEqual(['Gracias por escribirnos. Estoy revisando su pedido.'])
    const reply = async (ctx: APIRequestContext, user: string, content: string) => {
      const conv = (await convOf(user))!
      const r = await ctx.post(api('/messages/send'), { data: { conversationId: conv.id, content } })
      expect(r.status()).toBe(200)
      return (await r.json()).data.message.id as string
    }
    const ids = [await reply(opEn, 'en-1', kbEn[0]!.body), await reply(opEn, 'en-4', kbEn[0]!.body), await reply(opEs, 'es-1', kbEs[0]!.body), await reply(opEs, 'es-2', kbEs[0]!.body)]
    expect(await waitFor(async () => (await db.message.count({ where: { id: { in: ids }, status: 'DELIVERED' } })) === 4, 20000)).toBe(true)
    expect(received).toHaveLength(4)
    for (const r of received) expect(r.headers['x-gco-signature']).toBe(signPayload(secret, String(r.headers['x-gco-timestamp']), r.body)) // authentic and untampered
    expect(received.map((r) => JSON.parse(r.body).user_id ?? JSON.parse(r.body).external_user_id ?? '').filter(Boolean).sort()).toEqual(expect.arrayContaining(['en-1', 'en-4', 'es-1', 'es-2']))
    received = []
  })

  test('5. a client outage during a reply is survived: retried with backoff, delivered exactly once after recovery, nothing lost', async () => {
    mode = '503'
    const conv = (await convOf('en-2'))!
    const r = await opEn.post(api('/messages/send'), { data: { conversationId: conv.id, content: 'Sorry for the wait, here is your answer.' } })
    expect(r.status()).toBe(200)
    const id = (await r.json()).data.message.id as string
    expect(await waitFor(async () => received.length >= 1, 15000)).toBe(true) // first attempt failed
    expect((await db.message.findUniqueOrThrow({ where: { id } })).status).not.toBe('DELIVERED')
    mode = 'ok'
    expect(await waitFor(async () => (await db.message.findUnique({ where: { id } }))?.status === 'DELIVERED', 30000)).toBe(true)
    const attempts = received.filter((x) => x.body.includes('Sorry for the wait'))
    expect(attempts.length).toBeGreaterThanOrEqual(2) // at least one failed attempt and the successful one
    const okOnes = new Set(attempts.map((a) => `${a.headers['x-gco-timestamp']}${a.headers['x-gco-signature']}`))
    expect(okOnes.size).toBeGreaterThanOrEqual(1)
    expect(await db.message.count({ where: { tenantId, content: 'Sorry for the wait, here is your answer.', direction: 'OUTBOUND' } })).toBe(1) // one message, however many attempts
    received = []
  })

  test('6. a difficult case is escalated by an operator and resolved by the manager; the client sees nothing internal', async () => {
    const conv = (await convOf('en-3'))!
    const esc = await opEn.post(api('/escalations'), { data: { conversationId: conv.id, reason: 'SENSITIVE_SITUATION', note: 'Customer reports a possible fraud on the account.' } })
    expect(esc.status()).toBeLessThan(300)
    const id = (await esc.json()).data.id
    expect((await mgr.post(api(`/escalations/${id}/actions`), { data: { action: 'claim' } })).status()).toBe(200)
    expect((await mgr.post(api(`/escalations/${id}/actions`), { data: { action: 'resolve', resolution: 'Passed to the client fraud team by phone; customer informed.' } })).status()).toBe(200)
    const cl = JSON.stringify(await (await client.get(api('/escalations'))).json())
    expect(cl).not.toContain('possible fraud') // internal note never reaches the client
  })

  test('7. the client sends content to moderate; operators decide, a supervisor-level person resolves the escalated item, the client sees counts only', async () => {
    const items = JSON.stringify({ items: [
      { kind: 'COMMENT', externalItemId: 'c-1', subjectExternalId: 'troll-1', content: 'You are all idiots', flagReason: 'user report' },
      { kind: 'COMMENT', externalItemId: 'c-2', subjectExternalId: 'fan-2', content: 'Great product, thanks!' },
      { kind: 'COMMENT', externalItemId: 'c-3', subjectExternalId: 'gray-3', content: 'This is borderline sarcasm' },
    ] })
    const first = await signedPost(`/moderation/ingest/${integrationId}`, items)
    expect(first.status()).toBe(200); expect((await first.json()).data).toMatchObject({ created: 3, duplicates: 0 })
    expect((await (await signedPost(`/moderation/ingest/${integrationId}`, items)).json()).data).toMatchObject({ created: 0, duplicates: 3 })
    const claimed = (await (await opEn.post(api('/moderation/claim'), { data: {} })).json()).data as { id: string; subjectExternalId: string }[]
    expect(claimed).toHaveLength(3)
    const by = (s: string) => claimed.find((c) => c.subjectExternalId === s)!
    expect((await opEn.post(api(`/moderation/items/${by('troll-1').id}/decide`), { data: { verdict: 'REJECT', category: 'harassment' } })).status()).toBe(200)
    expect((await opEn.post(api(`/moderation/items/${by('fan-2').id}/decide`), { data: { verdict: 'APPROVE' } })).status()).toBe(200)
    expect((await opEn.post(api(`/moderation/items/${by('gray-3').id}/decide`), { data: { verdict: 'ESCALATE', note: 'Could be sarcasm or abuse.' } })).status()).toBe(200)
    expect((await mgr.post(api(`/moderation/items/${by('gray-3').id}/resolve`), { data: { verdict: 'APPROVE', note: 'Sarcasm, not abusive.' } })).status()).toBe(200)
    const s = (await (await client.get(api('/client/moderation/summary'))).json()).data
    expect(s.items.DECIDED).toBe(3); expect(JSON.stringify(s)).not.toContain('Elena')
  })

  test('8. quality review, operator earnings and the payment: every figure follows from what was delivered', async () => {
    const delivered = await db.message.findMany({ where: { tenantId, direction: 'OUTBOUND', status: 'DELIVERED' }, select: { id: true, operatorId: true } })
    const mine = (opId: string) => delivered.filter((m) => m.operatorId === opId).length
    expect(mine(opEnId)).toBe(3); expect(mine(opEsId)).toBe(2)
    const qa = (await (await mgr.get(api('/qa/queue'))).json()).data as { messageId: string }[]
    expect(qa.length).toBeGreaterThanOrEqual(1)
    expect((await mgr.post(api('/qa/reviews'), { data: { messageId: qa[0]!.messageId, accuracy: 5, tone: 5, resolution: 4 } })).status()).toBe(201)
    const e = (await (await opEn.get(api('/operators/me/earnings'))).json()).data
    expect(e.messages.delivered).toBe(3); expect(e.earnings.totalAccumulatedEurCents).toBe(3 * 7); expect(e.earnings.awaitingPayoutEurCents).toBe(21)
    const pay = await admin.post(api('/admin/earnings/payouts'), { data: { operatorId: opEnId, periodEnd: new Date().toISOString() } })
    expect(pay.status()).toBe(200)
    const payout = (await pay.json()).data
    expect(payout).toMatchObject({ totalEurCents: 21, lineCount: 3 })
    expect((await mgr.post(api(`/admin/earnings/payouts/${payout.id}/paid`), { data: {} })).status()).toBe(403) // a manager cannot pay
    expect((await admin.post(api(`/admin/earnings/payouts/${payout.id}/paid`), { data: { reference: 'SIM-1' } })).status()).toBe(200)
    expect((await (await opEn.get(api('/operators/me/earnings'))).json()).data.earnings).toMatchObject({ paidEurCents: 21, awaitingPayoutEurCents: 0 })
    expect((await (await opEs.get(api('/operators/me/earnings'))).json()).data.earnings.totalAccumulatedEurCents).toBe(14) // the Spanish operator sees only their own
  })

  test('9. the client is invoiced for what it sent, the books reconcile, and the margin is exactly billed minus operator pay', async () => {
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
    const end = new Date()
    const draft = await admin.post(api('/admin/billing/invoices'), { data: { tenantId, periodStart: start.toISOString(), periodEnd: end.toISOString() } })
    expect(draft.status()).toBe(200)
    const inv = (await draft.json()).data
    const received = await db.message.count({ where: { tenantId, direction: 'INBOUND' } })
    expect(received).toBe(inboundCount.n) // 6 customer messages (5 + the duplicate-tested one), counted once each
    expect(inv.subtotalEurCents).toBe(received * 14); expect(inv.vatEurCents).toBe(Math.round(received * 14 * 0.22))
    expect((await client.get(api('/client/invoices')).then((r) => r.json())).data).toEqual([]) // draft is invisible to the client
    expect((await admin.post(api(`/admin/billing/invoices/${inv.id}/issue`), { data: {} })).status()).toBe(200)
    const mine = (await (await client.get(api('/client/invoices'))).json()).data
    expect(mine).toHaveLength(1); expect(mine[0].totalEurCents).toBe(inv.totalEurCents)
    const rec = (await (await admin.get(api(`/admin/billing/reconciliation?tenantId=${tenantId}&from=${start.toISOString()}&to=${new Date(Date.now() + 1000).toISOString()}`))).json()).data
    expect(rec.activity).toMatchObject({ billableMessages: received, customerMessagesReceived: received })
    expect(rec.mismatches.receivedWithoutUsageRecord).toBe(0); expect(rec.mismatches.deliveredWithoutEarningLine).toBe(0)
    expect(rec.operatorCompensation.owedEurCents).toBe(5 * 7) // 3 + 2 delivered replies, 7 cents each (the outage reply included once)
    expect(rec.margin.grossEurCents).toBe(received * 14 - 5 * 7)
  })

  test('10. a privacy erasure for one end user removes their content and leaves the money and everyone else untouched; another client sees none of it', async () => {
    const before = { usage: await db.usageRecord.count({ where: { tenantId } }), lines: await db.operatorEarningLine.count({ where: { operatorId: { in: [opEnId, opEsId] } } }), invoices: await db.invoice.count({ where: { tenantId } }) }
    const req = await client.post(api('/client/data-requests'), { data: { kind: 'ERASURE', subjectRef: 'es-2' } })
    expect(req.status()).toBe(200)
    const id = (await req.json()).data.id
    expect((await admin.post(api(`/admin/privacy/requests/${id}/execute`), { data: { subjectRef: 'wrong' } })).status()).toBe(400)
    expect((await admin.post(api(`/admin/privacy/requests/${id}/execute`), { data: { subjectRef: 'es-2' } })).status()).toBe(200)
    expect(await db.message.count({ where: { tenantId, content: { contains: 'pedido es-2' } } })).toBe(0)
    expect(await db.message.count({ where: { tenantId, content: '[removed]' } })).toBeGreaterThanOrEqual(2)
    expect((await db.message.findMany({ where: { tenantId, content: { contains: 'pedido es-1' } } })).length).toBe(1) // another end user untouched
    expect({ usage: await db.usageRecord.count({ where: { tenantId } }), lines: await db.operatorEarningLine.count({ where: { operatorId: { in: [opEnId, opEsId] } } }), invoices: await db.invoice.count({ where: { tenantId } }) }).toEqual(before)
    // isolation: a second, unrelated client sees nothing of this one
    expect((await (await other.clientCtx.get(api('/client/live'))).json()).data.queue).toMatchObject({ waiting: 0, inProgress: 0 })
    expect((await (await other.clientCtx.get(api('/client/invoices'))).json()).data).toEqual([])
    expect((await (await other.managerCtx.get(api('/conversations?limit=50'))).json()).data?.length ?? 0).toBe(0)
    expect((await other.operatorCtx.post(api('/moderation/claim'), { data: {} })).status()).toBe(409) // moderation is not part of that client's services
  })

  test('11. nothing AI-generated exists for this client (AI is disabled by policy; the client was set to human-only)', async () => {
    expect(await db.aiGeneration.count({ where: { tenantId } })).toBe(0)
    expect(await db.aiMemory.count({ where: { tenantId } })).toBe(0)
    expect((await db.tenant.findUniqueOrThrow({ where: { id: tenantId } })).aiMode).toBe('HUMAN_ONLY')
  })
})
