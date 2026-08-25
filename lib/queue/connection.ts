import IORedis from 'ioredis'

declare global {
  var __gcoRedis: IORedis | undefined
}

export function getRedisConnection(): IORedis {
  if (!global.__gcoRedis) {
    global.__gcoRedis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // required by BullMQ
    })
  }
  return global.__gcoRedis
}
