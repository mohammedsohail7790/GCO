import pino from 'pino'

/**
 * Structured JSON logger, shared by the API process and the worker process.
 * Replaces bare console.log/console.error so production log aggregation
 * (Datadog, CloudWatch, etc.) can filter/query by level, category, and
 * arbitrary structured fields instead of parsing free-text lines.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Pretty-print in local dev only; production emits compact JSON lines,
  // which is what log aggregators expect.
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
  base: { service: process.env.APP_NAME ?? 'gco' },
})

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings)
}
