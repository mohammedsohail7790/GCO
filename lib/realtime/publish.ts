import { getAppRedisConnection } from '@/lib/queue/connection'
import { logger } from '@/lib/observability/logger'

// Realtime fan-out uses Redis pub/sub as the transport between API/worker
// processes and the WebSocket server (see workers/realtime-server.ts), so
// any process instance can publish without holding open socket state itself.
export function realtimeChannel(tenantId: string) {
  return `gco:realtime:${tenantId}`
}

export async function publishRealtimeEvent(
  tenantId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  // Called inline on the normal message-handling request path - this must
  // never hang the caller. Realtime is a best-effort UX enhancement (clients
  // still get the underlying data via the regular REST responses), so a
  // Redis outage should silently drop the live-update push, not fail or
  // stall the request that triggered it (confirmed by fault injection: the
  // BullMQ-style connection this used to share would hang indefinitely here).
  try {
    const redis = getAppRedisConnection()
    await redis.publish(
      realtimeChannel(tenantId),
      JSON.stringify({ type, payload, ts: Date.now() }),
    )
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err, tenantId, type }, 'realtime publish failed - continuing without it')
  }
}
