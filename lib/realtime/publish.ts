import { getRedisConnection } from '@/lib/queue/connection'

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
  const redis = getRedisConnection()
  await redis.publish(
    realtimeChannel(tenantId),
    JSON.stringify({ type, payload, ts: Date.now() }),
  )
}
