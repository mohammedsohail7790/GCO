import http from 'http'
import crypto from 'crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { outboundDeliveryProcessor } from '@/workers/processors/outboundDelivery'
import { signPayload } from '@/lib/integrations/adapters/gcoWebhook'
import { createLead } from '@/lib/crm/leads'
import { provisionOnboarding, computeChecklist, goLive, confirmItem, acceptInvitation, issueInvitation } from '@/lib/onboarding/service'
import { recordVerification, clearVerification, isIntegrationVerified } from '@/lib/integrations/verification'

// Outbound delivery through the REAL processor and the REAL gco-webhook adapter against a local client simulator
// (a test double for the client's endpoint, NOT a real provider). ALLOW_DEV_ADAPTERS relaxes only the
// destination check so the simulator on loopback is reachable; the safety checks themselves are covered separately.
describe('gco-webhook outbound delivery semantics', () => {
  const SECRET = crypto.randomBytes(32).toString('hex')
  const base = `gwd-${Date.now()}`
  type Seen = { headers: http.IncomingHttpHeaders; body: string }
  let server: http.Server
  let url = ''
  let seen: Seen[] = []
  let respond: (res: http.ServerResponse) => void = (res) => res.writeHead(200).end(JSON.stringify({ delivery_id: 'client-d-1' }))
  let tenantId = ''
  let integrationId = ''
  let conversationId = ''
  const messageIds: string[] = []

  const mkMessage = async (content = 'Hello from the operator') => {
    const m = await db.message.create({
      data: { tenantId, conversationId, direction: 'OUTBOUND', status: 'PENDING_REVIEW', content, externalMessageId: `out_${crypto.randomUUID()}` },
    })
    messageIds.push(m.id)
    return m
  }
  const run = (id: string) => outboundDeliveryProcessor({ data: { messageId: id } } as any)

  beforeAll(async () => {
    process.env.ALLOW_DEV_ADAPTERS = 'true'
    process.env.GCO_WEBHOOK_TIMEOUT_MS = '500'
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        seen.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') })
        respond(res)
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as any).port}/hook`
    const t = await db.tenant.create({ data: { name: '[TEST] gwd', slug: base } })
    tenantId = t.id
    integrationId = (await db.integration.create({ data: { tenantId, adapterKey: 'gco-webhook', name: 'gwd', status: 'ACTIVE', config: { callbackUrl: url }, webhookSecret: SECRET } })).id
    conversationId = (await db.conversation.create({ data: { tenantId, externalUserId: 'end-user-1', state: 'WAITING_FOR_CLIENT' } })).id
  })
  afterAll(async () => {
    await new Promise((r) => server.close(r))
    delete process.env.ALLOW_DEV_ADAPTERS
    delete process.env.GCO_WEBHOOK_TIMEOUT_MS
    await db.messageEvent.deleteMany({ where: { messageId: { in: messageIds } } })
    await db.message.deleteMany({ where: { tenantId } })
    await db.conversation.deleteMany({ where: { tenantId } })
    await db.integration.deleteMany({ where: { tenantId } })
    await db.systemEvent.deleteMany({ where: { category: 'delivery', metadata: { path: ['tenantId'], equals: tenantId } } })
    await db.tenant.delete({ where: { id: tenantId } })
  })
  beforeEach(() => {
    seen = []
    respond = (res) => res.writeHead(200).end(JSON.stringify({ delivery_id: 'client-d-1' }))
  })

  it('2xx = DELIVERED, with a verifiable signature, idempotency key and the provider delivery id', async () => {
    const m = await mkMessage()
    await run(m.id)
    expect(seen).toHaveLength(1)
    const { headers, body } = seen[0]!
    const ts = String(headers['x-gco-timestamp'])
    expect(headers['x-gco-signature']).toBe(signPayload(SECRET, ts, body)) // the client can verify authenticity
    expect(Math.abs(Date.now() / 1000 - Number(ts))).toBeLessThan(10)
    expect(headers['idempotency-key']).toBe(m.externalMessageId)
    expect(JSON.parse(body)).toMatchObject({ type: 'message.reply', message_id: m.externalMessageId, user_id: 'end-user-1', text: 'Hello from the operator' })
    expect(JSON.stringify(headers)).not.toContain(SECRET) // the secret itself never travels
    const after = await db.message.findUniqueOrThrow({ where: { id: m.id } })
    expect(after.status).toBe('DELIVERED')
    const ev = await db.messageEvent.findFirstOrThrow({ where: { messageId: m.id, type: 'DELIVERY_CONFIRMED' } })
    expect(ev.metadata).toMatchObject({ externalDeliveryId: 'client-d-1' })
  })

  it('an already delivered message is never sent twice (duplicate job / duplicate operator action)', async () => {
    const m = await mkMessage()
    await run(m.id)
    await run(m.id)
    await run(m.id)
    expect(seen).toHaveLength(1)
  })

  it('5xx and 429: NOT delivered, recorded as retryable failure, job throws so BullMQ retries; the same idempotency key is reused', async () => {
    const m = await mkMessage()
    for (const status of [503, 429]) {
      seen = []
      respond = (res) => res.writeHead(status).end('nope')
      await expect(run(m.id), String(status)).rejects.toThrow()
      const after = await db.message.findUniqueOrThrow({ where: { id: m.id } })
      expect(after.status).toBe('FAILED')
      expect(after.deliveredAt).toBeNull()
      expect(seen[0]!.headers['idempotency-key']).toBe(m.externalMessageId)
    }
    const ev = await db.messageEvent.findFirstOrThrow({ where: { messageId: m.id, type: 'DELIVERY_FAILED' }, orderBy: { createdAt: 'desc' } })
    expect(ev.metadata).toMatchObject({ retryable: true, category: 'rate_limited' })
    // recovery: the client comes back, the retry succeeds and the message becomes DELIVERED exactly once
    respond = (res) => res.writeHead(200).end('{}')
    seen = []
    await run(m.id)
    expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('DELIVERED')
    expect(seen).toHaveLength(1)
  })

  it('permanent 4xx (400/401/403/404): FAILED, NOT retried (no throw), a content-free SystemEvent is raised', async () => {
    for (const [status, category] of [[400, 'client_4xx'], [401, 'credential'], [403, 'credential'], [404, 'client_4xx']] as const) {
      const m = await mkMessage('private operator text')
      respond = (res) => res.writeHead(status).end('rejected')
      seen = []
      await expect(run(m.id), String(status)).resolves.toBeUndefined()
      expect(seen).toHaveLength(1) // exactly one attempt
      expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('FAILED')
      const ev = await db.systemEvent.findFirstOrThrow({ where: { category: 'delivery', metadata: { path: ['messageId'], equals: m.id } } })
      expect(ev.metadata).toMatchObject({ tenantId, integrationId, category })
      expect(JSON.stringify(ev)).not.toContain('private operator text')
      expect(JSON.stringify(ev)).not.toContain(SECRET)
    }
  })

  it('a redirect is a permanent failure and is never followed', async () => {
    const m = await mkMessage()
    respond = (res) => res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' }).end()
    await expect(run(m.id)).resolves.toBeUndefined()
    expect(seen).toHaveLength(1)
    expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('FAILED')
    const ev = await db.messageEvent.findFirstOrThrow({ where: { messageId: m.id, type: 'DELIVERY_FAILED' } })
    expect(ev.metadata).toMatchObject({ category: 'redirect', retryable: false })
  })

  it('timeout and connection failure are retryable and never DELIVERED', async () => {
    const slow = await mkMessage()
    respond = () => {
      /* never answers */
    }
    await expect(run(slow.id)).rejects.toThrow()
    expect((await db.messageEvent.findFirstOrThrow({ where: { messageId: slow.id, type: 'DELIVERY_FAILED' } })).metadata).toMatchObject({ category: 'timeout', retryable: true })
    expect((await db.message.findUniqueOrThrow({ where: { id: slow.id } })).status).toBe('FAILED')

    const closed = await mkMessage()
    await db.integration.update({ where: { id: integrationId }, data: { config: { callbackUrl: 'http://127.0.0.1:1/never' } } })
    try {
      await expect(run(closed.id)).rejects.toThrow()
      expect((await db.messageEvent.findFirstOrThrow({ where: { messageId: closed.id, type: 'DELIVERY_FAILED' } })).metadata).toMatchObject({ category: 'network', retryable: true })
    } finally {
      await db.integration.update({ where: { id: integrationId }, data: { config: { callbackUrl: url } } })
    }
  })

  it('a response is never trusted beyond the status: an oversized/garbage 2xx body still counts as delivered only on 2xx', async () => {
    const m = await mkMessage()
    respond = (res) => res.writeHead(200).end('x'.repeat(1000)) // not JSON - delivery id simply absent
    await run(m.id)
    expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('DELIVERED')
    const big = await mkMessage()
    respond = (res) => res.writeHead(200).end('y'.repeat(200 * 1024))
    await expect(run(big.id)).resolves.toBeUndefined() // too_large is treated as a permanent failure, not delivered
    expect((await db.message.findUniqueOrThrow({ where: { id: big.id } })).status).toBe('FAILED')
  })

  it('production destination rules apply when the dev flag is off: unsafe callbacks are refused with NO network call', async () => {
    const m = await mkMessage()
    delete process.env.ALLOW_DEV_ADAPTERS
    try {
      await expect(run(m.id)).resolves.toBeUndefined() // http://127.0.0.1 is not an acceptable production destination
      expect(seen).toHaveLength(0)
      expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('FAILED')
      expect((await db.messageEvent.findFirstOrThrow({ where: { messageId: m.id, type: 'DELIVERY_FAILED' } })).metadata).toMatchObject({ category: 'bad_config', retryable: false })
    } finally {
      process.env.ALLOW_DEV_ADAPTERS = 'true'
    }
  })

  it('no ACTIVE integration -> the job fails loudly instead of silently dropping or faking delivery', async () => {
    const m = await mkMessage()
    await db.integration.update({ where: { id: integrationId }, data: { status: 'DEGRADED' } })
    try {
      await expect(run(m.id)).rejects.toThrow()
      expect(seen).toHaveLength(0)
      expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).status).not.toBe('DELIVERED')
    } finally {
      await db.integration.update({ where: { id: integrationId }, data: { status: 'ACTIVE' } })
    }
  })
})

describe('go-live safety for the gco-webhook adapter (production default: dev flag OFF)', () => {
  const base = `gws-${Date.now()}`
  const leadIds: string[] = []
  const tenantIds: string[] = []
  let admin = ''
  const mk = async (tag: string) => {
    const { lead } = await createLead({ companyName: `[TEST] ${tag}`, contactName: tag, email: `${base}-${tag}@test.gco`, actorUserId: admin })
    leadIds.push(lead.id)
    const tenant = await db.tenant.create({ data: { name: `[TEST] ${tag}`, slug: `${base}-${tag}` } })
    tenantIds.push(tenant.id)
    await db.bpoHandoff.create({ data: { leadId: lead.id, eventId: `h-${lead.id}`, payload: {}, status: 'SUCCEEDED', tenantId: tenant.id } })
    const ob = await provisionOnboarding(lead.id)
    await acceptInvitation((await issueInvitation(ob.id, admin)).setupUrl.split('#token=')[1]!, 'a-long-enough-password')
    const op = await db.user.create({ data: { email: `${base}-${tag}-op@test.gco`, passwordHash: 'x', role: 'OPERATOR', tenantId: tenant.id, displayName: 'op' } })
    await db.operator.create({ data: { userId: op.id, tenantId: tenant.id, capacity: 2 } })
    for (const i of ['languages', 'coverage', 'supervisor'] as const) await confirmItem(ob.id, i, admin)
    return { ob, tenant }
  }
  const missing = async (obId: string) => (await computeChecklist(obId)).items.filter((i) => !i.done).map((i) => i.key)

  beforeAll(async () => {
    delete process.env.ALLOW_DEV_ADAPTERS
    admin = (await db.user.create({ data: { email: `${base}-admin@test.gco`, passwordHash: 'x', role: 'CEO_ADMIN', displayName: '[TEST] admin' } })).id
  })
  afterAll(async () => {
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.integration.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.clientOnboarding.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { id: admin }] } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.bpoHandoff.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.leadHistoryEntry.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.lead.deleteMany({ where: { id: { in: leadIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('refuses until the integration is verified in BOTH directions for its CURRENT destination; then activates only that integration', async () => {
    const a = await mk('a')
    const b = await mk('b')
    const cfg = { callbackUrl: 'https://client-a.example.com/gco' }
    const integ = await db.integration.create({ data: { tenantId: a.tenant.id, adapterKey: 'gco-webhook', name: 'A', status: 'DISABLED', config: cfg, webhookSecret: 's'.repeat(64) } })
    const other = await db.integration.create({ data: { tenantId: b.tenant.id, adapterKey: 'gco-webhook', name: 'B', status: 'DISABLED', config: { callbackUrl: 'https://client-b.example.com/gco' }, webhookSecret: 't'.repeat(64) } })
    const degraded = await db.integration.create({ data: { tenantId: a.tenant.id, adapterKey: 'gco-webhook', name: 'A-degraded', status: 'DEGRADED', config: cfg, webhookSecret: 'u'.repeat(64) } })
    const unverified2 = await db.integration.create({ data: { tenantId: a.tenant.id, adapterKey: 'gco-webhook', name: 'A-second', status: 'DISABLED', config: { callbackUrl: 'https://client-a2.example.com/gco' }, webhookSecret: 'v'.repeat(64) } })

    expect(await missing(a.ob.id)).toEqual(['integration_verified'])
    await expect(goLive(a.ob.id, admin)).rejects.toMatchObject({ status: 409, code: 'CHECKLIST_INCOMPLETE' })

    await recordVerification(integ.id, 'outbound')
    expect(await missing(a.ob.id)).toEqual(['integration_verified']) // one direction is not enough
    await recordVerification(integ.id, 'inbound')
    expect(await missing(a.ob.id)).toEqual([])

    // changing the destination invalidates the proof
    await db.integration.update({ where: { id: integ.id }, data: { config: { ...cfg, callbackUrl: 'https://elsewhere.example.com/gco', verification: (await db.integration.findUniqueOrThrow({ where: { id: integ.id } })).config && (((await db.integration.findUniqueOrThrow({ where: { id: integ.id } })).config) as any).verification } } })
    expect(await missing(a.ob.id)).toEqual(['integration_verified'])
    await db.integration.update({ where: { id: integ.id }, data: { config: cfg as any } }) // wipes verification entirely
    await recordVerification(integ.id, 'outbound')
    await recordVerification(integ.id, 'inbound')
    expect(await missing(a.ob.id)).toEqual([])
    // secret rotation clears it
    await clearVerification(integ.id)
    expect(await missing(a.ob.id)).toEqual(['integration_verified'])
    await recordVerification(integ.id, 'outbound')
    await recordVerification(integ.id, 'inbound')

    const r = await goLive(a.ob.id, admin)
    expect(r.activatedIntegrations).toBe(1)
    const status = async (id: string) => (await db.integration.findUniqueOrThrow({ where: { id } })).status
    expect(await status(integ.id)).toBe('ACTIVE')
    expect(await status(other.id)).toBe('DISABLED') // another tenant's integration untouched
    expect(await status(degraded.id)).toBe('DEGRADED') // never activated
    expect(await status(unverified2.id)).toBe('DISABLED') // unverified sibling never activated
    expect(isIntegrationVerified('gco-webhook', (await db.integration.findUniqueOrThrow({ where: { id: unverified2.id } })).config)).toBe(false)
    expect(JSON.stringify(r)).not.toMatch(/s{64}|webhookSecret/)
  })

  it('a dev-mock integration still cannot take a client live in production', async () => {
    const c = await mk('c')
    await db.integration.create({ data: { tenantId: c.tenant.id, adapterKey: 'dev-mock', name: 'dev', status: 'DISABLED', config: {}, webhookSecret: 'w'.repeat(64) } })
    expect(await missing(c.ob.id)).toEqual(['integration_configured', 'integration_verified', 'webhook_secret_issued'])
    await expect(goLive(c.ob.id, admin)).rejects.toMatchObject({ status: 409 })
  })
})
