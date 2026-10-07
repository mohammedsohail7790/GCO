import crypto from 'crypto'
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Webhook route behaviour on the real database with the queue stubbed: integration/tenant state checks, payload limits,
// and recovery when the queue (Redis) is unavailable after the event is persisted.
const enqueue = vi.fn()
vi.mock('@/lib/queue/jobs', () => ({ enqueueMessageIngest: (...a: unknown[]) => enqueue(...a) }))

import { db } from '@/lib/db/client'
import { POST } from '@/app/api/v1/webhooks/[integrationId]/route'
import { signPayload } from '@/lib/integrations/adapters/gcoWebhook'

describe('inbound webhook route', () => {
  const base = `wr-${Date.now()}`
  const SECRET = crypto.randomBytes(32).toString('hex')
  let tenantId = ''
  const mkIntegration = (status: 'ACTIVE' | 'DISABLED' | 'DEGRADED', name: string) =>
    db.integration.create({ data: { tenantId, adapterKey: 'gco-webhook', name, status, config: { callbackUrl: 'https://client.example.com/h' }, webhookSecret: SECRET } }).then((i) => i.id)
  const call = (id: string, body: string, opts: { secret?: string; ts?: number; headers?: Record<string, string> } = {}) => {
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000))
    const req = new NextRequest(`http://localhost/api/v1/webhooks/${id}`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json', 'X-GCO-Timestamp': ts, 'X-GCO-Signature': signPayload(opts.secret ?? SECRET, ts, body), ...(opts.headers ?? {}) },
    })
    return POST(req, { params: Promise.resolve({ integrationId: id }) })
  }
  const msg = (id: string) => JSON.stringify({ events: [{ event_id: `e-${id}`, message_id: `m-${id}`, user_id: 'u1', text: 'hello' }] })

  beforeAll(async () => {
    tenantId = (await db.tenant.create({ data: { name: '[TEST] wr', slug: base } })).id
  })
  afterAll(async () => {
    await db.webhookEvent.deleteMany({ where: { tenantId } })
    await db.integration.deleteMany({ where: { tenantId } })
    await db.auditLog.deleteMany({ where: { tenantId } })
    await db.tenant.delete({ where: { id: tenantId } })
  })
  beforeEach(() => {
    enqueue.mockReset()
    enqueue.mockResolvedValue({ id: 'job' })
  })

  it('DEGRADED and staged integrations accept no customer messages (404, nothing stored, nothing queued)', async () => {
    for (const status of ['DEGRADED', 'DISABLED'] as const) {
      const id = await mkIntegration(status, status)
      const r = await call(id, msg(status))
      expect(r.status, status).toBe(404)
      expect(await db.webhookEvent.count({ where: { integrationId: id } })).toBe(0)
    }
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('a staged integration accepts only a SIGNED ping; a bad-signature ping is a 404', async () => {
    const id = await mkIntegration('DISABLED', 'staged')
    expect((await call(id, JSON.stringify({ type: 'ping' }), { secret: 'f'.repeat(64) })).status).toBe(404)
    expect((await db.integration.findUniqueOrThrow({ where: { id } })).config).not.toHaveProperty('verification')
    const ok = await call(id, JSON.stringify({ type: 'ping', ping_id: 'x' }))
    expect(ok.status).toBe(200)
    expect(((await db.integration.findUniqueOrThrow({ where: { id } })).config as any).verification.inboundAt).toBeTruthy()
    expect(await db.webhookEvent.count({ where: { integrationId: id } })).toBe(0)
  })

  it('a SUSPENDED tenant accepts nothing (409), an oversized body is refused (413) before parsing', async () => {
    const id = await mkIntegration('ACTIVE', 'active-suspend')
    await db.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED' } })
    try {
      expect((await call(id, msg('susp'))).status).toBe(409)
      expect(await db.webhookEvent.count({ where: { integrationId: id } })).toBe(0)
    } finally {
      await db.tenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } })
    }
    const huge = JSON.stringify({ events: [{ event_id: 'a', message_id: 'b', user_id: 'c', text: 'x'.repeat(1_100_000) }] })
    expect((await call(id, huge)).status).toBe(413)
    expect((await call(id, msg('lie'), { headers: { 'content-length': '5000000' } })).status).toBe(413)
    expect(await db.webhookEvent.count({ where: { integrationId: id } })).toBe(0)
  })

  it('queue unavailable AFTER the event is stored: the client gets an error, nothing is lost, and its retry re-queues the SAME event (no duplicate)', async () => {
    const id = await mkIntegration('ACTIVE', 'active-queue')
    const body = msg('q1')
    enqueue.mockRejectedValueOnce(new Error('ECONNREFUSED redis'))
    const failed = await call(id, body)
    expect(failed.status).toBeGreaterThanOrEqual(500)
    const stored = await db.webhookEvent.findMany({ where: { integrationId: id } })
    expect(stored).toHaveLength(1) // persisted before the queue call
    expect(stored[0]!.processed).toBe(false)
    expect(JSON.stringify(await failed.json())).not.toContain('ECONNREFUSED') // no internal detail leaked

    const retry = await call(id, body) // the client's retry of the identical request
    expect(retry.status).toBe(202)
    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(enqueue).toHaveBeenLastCalledWith(stored[0]!.id)
    expect(await db.webhookEvent.count({ where: { integrationId: id } })).toBe(1) // still ONE event
  })

  it('replay of a stale (even validly signed) request, unsigned requests and malformed payloads store nothing', async () => {
    const id = await mkIntegration('ACTIVE', 'active-attacks')
    expect((await call(id, msg('old'), { ts: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401)
    expect((await POST(new NextRequest(`http://localhost/x`, { method: 'POST', body: msg('unsigned'), headers: { 'Content-Type': 'application/json' } }), { params: Promise.resolve({ integrationId: id }) })).status).toBe(401)
    expect((await call(id, JSON.stringify({ events: [{ event_id: 'x' }] }))).status).toBe(400)
    expect((await call(id, 'not json')).status).toBe(400)
    expect(await db.webhookEvent.count({ where: { integrationId: id } })).toBe(0)
    expect(enqueue).not.toHaveBeenCalled()
  })
})
