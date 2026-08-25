import { test, expect } from '@playwright/test'
import { WebSocket } from 'ws'
import { seedIsolatedTenant, sendWebhook, cleanupTenant } from './helpers'
import { db } from '@/lib/db/client'

void db // ensures this file's module graph matches other spec files that
// statically import db, avoiding an esbuild CJS/ESM interop edge case seen
// when this file relied solely on helpers.ts's dynamic import() of db while
// also statically importing the CJS 'ws' package.

const REALTIME_URL = process.env.REALTIME_URL ?? 'ws://localhost:3001'

function connect(token: string | null): Promise<{ code: number | null; opened: boolean; messages: string[] }> {
  return new Promise((resolve) => {
    const url = token ? `${REALTIME_URL}?token=${encodeURIComponent(token)}` : REALTIME_URL
    const ws = new WebSocket(url)
    const messages: string[] = []
    let opened = false
    let code: number | null = null
    ws.on('open', () => {
      opened = true
    })
    ws.on('message', (m) => messages.push(m.toString()))
    ws.on('close', (c) => {
      code = c
      resolve({ code, opened, messages })
    })
    setTimeout(() => {
      ws.close()
      resolve({ code, opened, messages })
    }, 800)
  })
}

// TEST: realtime WebSocket authentication + cross-tenant isolation, exercised
// directly against workers/realtime-server.ts (not through the browser hook).
test.describe('realtime security', () => {
  test('missing token is rejected with code 4001', async () => {
    const result = await connect(null)
    expect(result.code).toBe(4001)
  })

  test('garbage token is rejected with code 4001', async () => {
    const result = await connect('not-a-real-jwt')
    expect(result.code).toBe(4001)
  })

  test('an expired realtime ticket is rejected with code 4001', async () => {
    const jose = await import('jose')
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
    const expired = await new jose.SignJWT({ sub: 'x', role: 'OPERATOR', tenantId: 't1', email: 'x@y.com', typ: 'realtime' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret)
    const result = await connect(expired)
    expect(result.code).toBe(4001)
  })

  test('a REST access token cannot be used as a realtime ticket - the two token types are mutually exclusive', async () => {
    const jose = await import('jose')
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
    const accessToken = await new jose.SignJWT({ sub: 'x', role: 'OPERATOR', tenantId: 't1', email: 'x@y.com', typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('60m')
      .sign(secret)
    const result = await connect(accessToken)
    expect(result.code).toBe(4001)
  })

  test('a valid realtime ticket connects successfully', async () => {
    const jose = await import('jose')
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
    const ticket = await new jose.SignJWT({ sub: 'x', role: 'OPERATOR', tenantId: 't1', email: 'x@y.com', typ: 'realtime' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30s')
      .sign(secret)
    const result = await connect(ticket)
    expect(result.opened).toBe(true)
  })

  test('a tenant A socket never receives a tenant B event', async () => {
    const tenantA = await seedIsolatedTenant('rt-iso-a')
    const tenantB = await seedIsolatedTenant('rt-iso-b')
    try {
      const ticketA = (await (await tenantA.operatorCtx.get('/api/v1/realtime/ticket')).json()).data.ticket
      const ticketB = (await (await tenantB.operatorCtx.get('/api/v1/realtime/ticket')).json()).data.ticket

      const wsA = new WebSocket(`${REALTIME_URL}?token=${encodeURIComponent(ticketA)}`)
      const wsB = new WebSocket(`${REALTIME_URL}?token=${encodeURIComponent(ticketB)}`)
      const messagesA: string[] = []
      const messagesB: string[] = []
      wsA.on('message', (m) => messagesA.push(m.toString()))
      wsB.on('message', (m) => messagesB.push(m.toString()))
      await Promise.all([
        new Promise((r) => wsA.on('open', r)),
        new Promise((r) => wsB.on('open', r)),
      ])

      const res = await sendWebhook(tenantB.integrationId, [
        { event_id: 'ev-rt-iso-1', message_id: 'msg-rt-iso-1', user_id: 'user-rt-iso', text: 'tenant B only' },
      ])
      expect(res.status()).toBe(202)

      await new Promise((r) => setTimeout(r, 1000))
      wsA.close()
      wsB.close()

      expect(messagesA).toHaveLength(0) // tenant A must NEVER see tenant B's events
      expect(messagesB.length).toBeGreaterThan(0) // tenant B does see its own events
      expect(messagesB.some((m) => m.includes('message.received'))).toBe(true)
    } finally {
      await cleanupTenant(tenantA.tenantId)
      await cleanupTenant(tenantB.tenantId)
    }
  })
})
