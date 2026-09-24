import IORedis from 'ioredis'

declare global {
  var __gcoRedis: IORedis | undefined
  var __gcoAppRedis: IORedis | undefined
}

/**
 * BullMQ connection - `maxRetriesPerRequest: null` is required by BullMQ's
 * own blocking commands. Use ONLY for actual Queue/Worker instantiation
 * (lib/queue/queues.ts, workers/*.ts) and admin routes that manage BullMQ
 * `Queue` objects directly - never for plain ad-hoc commands on a normal
 * request path, since with this setting a command queued while Redis is
 * unreachable waits indefinitely instead of failing (confirmed by fault
 * injection: killing Redis made health checks, login, and the public
 * contact form all hang forever rather than degrade or fail fast).
 */
export function getRedisConnection(): IORedis {
  if (!global.__gcoRedis) {
    global.__gcoRedis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // required by BullMQ
    })
  }
  return global.__gcoRedis
}

/**
 * Fast-fail connection for ad-hoc, non-BullMQ Redis use on ordinary request
 * paths (rate limiting, health checks, realtime pub/sub) - anything called
 * synchronously while a real user is waiting on the response. Unlike
 * getRedisConnection(), a command here gives up quickly instead of queuing
 * forever when Redis is unreachable, so a Redis outage degrades those
 * specific features instead of hanging every request that touches them.
 */
export function getAppRedisConnection(): IORedis {
  if (!global.__gcoAppRedis) {
    global.__gcoAppRedis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      // Bounded (not null/infinite like the BullMQ connection) so a command
      // gives up after a few retries instead of waiting forever. Offline
      // queueing is left at its default (true) deliberately - `false` was
      // tried and rejected here: it made this connection's very FIRST
      // command fail with "Stream isn't writeable" whenever it fired before
      // the initial TCP handshake finished (a real race on every fresh
      // process, not just during an actual outage - caught by the full test
      // suite before this shipped). With the default queueing, a command
      // issued while merely still connecting waits for that connection
      // attempt; only a genuinely unreachable Redis exhausts the retries
      // below and rejects.
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
    })
    // A connection-level error (e.g. ECONNREFUSED while down) would otherwise
    // be an unhandled 'error' event and crash the process - ioredis expects
    // callers to listen for it even when every actual command call site
    // already catches its own rejection.
    global.__gcoAppRedis.on('error', () => {})
  }
  return global.__gcoAppRedis
}
