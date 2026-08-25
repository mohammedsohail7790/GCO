import 'dotenv/config'
import { WebSocketServer, type WebSocket } from 'ws'
import { getRedisConnection } from '@/lib/queue/connection'
import { realtimeChannel } from '@/lib/realtime/publish'
import { verifyRealtimeTicket } from '@/lib/auth/tokens'
import { logger } from '@/lib/observability/logger'

// Standalone realtime push server. Runs as its own process (see docs/deployment.md)
// so a slow/misbehaving dashboard socket can never block API or worker throughput.
//
// Auth: browsers hold their session in an httpOnly cookie, which cannot be
// read by client JS to pass as a WS query param. Clients instead fetch a
// short-lived (30s) single-purpose ticket from GET /api/v1/realtime/ticket
// (itself authenticated via the httpOnly cookie) and pass THAT here. See
// lib/auth/tokens.ts::signRealtimeTicket for why this is a distinct token
// type, not the REST access token.
//
// This server is an accelerator, never a source of truth: every message it
// pushes is a "something changed, go refetch" signal, not authoritative
// data - the client re-reads current state from the REST API/database. That
// makes duplicate delivery and missed events both harmless by construction,
// and is why polling remains as an unconditional fallback in the dashboards
// (see lib/realtime/useRealtime.ts) rather than being replaced by this.

const PORT = parseInt(process.env.REALTIME_PORT ?? '3001', 10)
const wss = new WebSocketServer({ port: PORT })
const subscriber = getRedisConnection().duplicate()

interface ClientInfo {
  socket: WebSocket
  tenantId: string | null
  isAlive: boolean
}

const clients = new Set<ClientInfo>()
const channelSubscriberCounts = new Map<string, number>()

async function subscribeChannel(channel: string) {
  const count = channelSubscriberCounts.get(channel) ?? 0
  channelSubscriberCounts.set(channel, count + 1)
  if (count === 0) await subscriber.subscribe(channel)
}

async function unsubscribeChannel(channel: string) {
  const count = channelSubscriberCounts.get(channel) ?? 0
  if (count <= 1) {
    channelSubscriberCounts.delete(channel)
    await subscriber.unsubscribe(channel)
  } else {
    channelSubscriberCounts.set(channel, count - 1)
  }
}

wss.on('connection', async (socket, req) => {
  const url = new URL(req.url ?? '', 'http://localhost')
  const token = url.searchParams.get('token')

  let tenantId: string | null = null
  let role: string | null = null
  try {
    if (!token) throw new Error('missing token')
    const claims = await verifyRealtimeTicket(token)
    tenantId = claims.tenantId
    role = claims.role
    if (role === 'CEO_ADMIN' || role === 'ASSISTANT') tenantId = null // global operational roles - see lib/auth/tenantGuard.ts
  } catch {
    socket.close(4001, 'unauthorized')
    return
  }

  const info: ClientInfo = { socket, tenantId, isAlive: true }
  clients.add(info)

  if (tenantId) {
    await subscribeChannel(realtimeChannel(tenantId))
  }

  socket.on('pong', () => {
    info.isAlive = true
  })

  socket.on('close', async () => {
    clients.delete(info)
    if (info.tenantId) await unsubscribeChannel(realtimeChannel(info.tenantId))
  })
})

subscriber.on('message', (channel, message) => {
  for (const client of clients) {
    if (client.tenantId && realtimeChannel(client.tenantId) === channel) {
      client.socket.send(message)
    }
  }
})

// Heartbeat: detects half-open connections (e.g. a laptop that went to
// sleep) so the client's reconnect logic kicks in promptly rather than the
// dashboard silently going stale with no error.
const HEARTBEAT_INTERVAL_MS = 30_000
const heartbeatTimer = setInterval(() => {
  for (const client of clients) {
    if (!client.isAlive) {
      client.socket.terminate()
      clients.delete(client)
      continue
    }
    client.isAlive = false
    client.socket.ping()
  }
}, HEARTBEAT_INTERVAL_MS)

logger.info({ component: 'realtime-server', port: PORT }, 'GCO realtime server listening')

async function shutdown() {
  clearInterval(heartbeatTimer)
  wss.close()
  await subscriber.quit()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
