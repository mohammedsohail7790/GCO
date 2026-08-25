import 'dotenv/config'
import { WebSocketServer, type WebSocket } from 'ws'
import { getRedisConnection } from '@/lib/queue/connection'
import { realtimeChannel } from '@/lib/realtime/publish'
import { verifyAccessToken } from '@/lib/auth/tokens'
import { logger } from '@/lib/observability/logger'

// Standalone realtime push server. Runs as its own process (see docs/deployment.md)
// so a slow/misbehaving dashboard socket can never block API or worker throughput.
// Clients authenticate with the same access token used for the REST API and are
// subscribed only to their own tenant's Redis pub/sub channel - no cross-tenant leakage.

const PORT = parseInt(process.env.REALTIME_PORT ?? '3001', 10)
const wss = new WebSocketServer({ port: PORT })
const subscriber = getRedisConnection().duplicate()

interface ClientInfo {
  socket: WebSocket
  tenantId: string | null
}

const clients = new Set<ClientInfo>()
const subscribedChannels = new Set<string>()

wss.on('connection', async (socket, req) => {
  const url = new URL(req.url ?? '', 'http://localhost')
  const token = url.searchParams.get('token')

  let tenantId: string | null = null
  try {
    if (!token) throw new Error('missing token')
    const claims = await verifyAccessToken(token)
    tenantId = claims.tenantId
    if (claims.role === 'CEO_ADMIN') tenantId = null // admin may subscribe globally via query param per-tenant later
  } catch {
    socket.close(4001, 'unauthorized')
    return
  }

  const info: ClientInfo = { socket, tenantId }
  clients.add(info)

  if (tenantId) {
    const channel = realtimeChannel(tenantId)
    if (!subscribedChannels.has(channel)) {
      subscribedChannels.add(channel)
      await subscriber.subscribe(channel)
    }
  }

  socket.on('close', () => clients.delete(info))
})

subscriber.on('message', (channel, message) => {
  for (const client of clients) {
    if (client.tenantId && realtimeChannel(client.tenantId) === channel) {
      client.socket.send(message)
    }
  }
})

logger.info({ component: 'realtime-server', port: PORT }, 'GCO realtime server listening')
