import { logger } from '@/lib/observability/logger'

// AI-call logging. Deliberately content-free: only identifiers, counts and a
// coarse error category are ever recorded - never prompts, customer message
// text, raw provider error payloads, or keys.

export type AiErrorCategory =
  | 'timeout'
  | 'rate_limited'
  | 'provider_error'
  | 'auth'
  | 'bad_request'
  | 'connection'
  | 'invalid_output'
  | 'truncated'
  | 'unknown'

export type AiOperation = 'suggest' | 'extract'

/** Thrown when the provider stopped because it hit the output-token cap. */
export class AiOutputTruncatedError extends Error {
  constructor() {
    super('AI output truncated at max output tokens')
    this.name = 'AiOutputTruncatedError'
  }
}

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status
  return typeof s === 'number' ? s : undefined
}

export function categorizeAiError(err: unknown): AiErrorCategory {
  const name = (err as { name?: string } | null)?.name ?? ''
  if (name === 'AiOutputTruncatedError') return 'truncated'
  if (name === 'APIUserAbortError' || name === 'APIConnectionTimeoutError' || name === 'AbortError') return 'timeout'
  if (name === 'APIConnectionError') return 'connection'
  if (name === 'SyntaxError' || name === 'ZodError') return 'invalid_output'
  const status = statusOf(err)
  if (status === 429) return 'rate_limited'
  if (status === 401 || status === 403) return 'auth'
  if (status !== undefined && status >= 400 && status < 500) return 'bad_request'
  if (status !== undefined && status >= 500) return 'provider_error'
  return 'unknown'
}

/** Safe, content-free description suitable for logs and DB error columns. */
export function describeAiError(err: unknown): string {
  const status = statusOf(err)
  return status ? `${categorizeAiError(err)} (HTTP ${status})` : categorizeAiError(err)
}

function requestIdOf(err: unknown): string | undefined {
  const e = err as { request_id?: unknown; headers?: Record<string, unknown> } | null
  const id = e?.request_id ?? e?.headers?.['x-request-id']
  return typeof id === 'string' ? id : undefined
}

interface AiCallIds {
  provider: string
  model: string
  operation: AiOperation
  tenantId: string
  conversationId: string
}

export function logAiFailure(ids: AiCallIds & { latencyMs: number; err: unknown }) {
  const { err, ...rest } = ids
  logger.warn(
    { component: 'ai', ...rest, category: categorizeAiError(err), httpStatus: statusOf(err), requestId: requestIdOf(err) },
    'ai call failed',
  )
}

export function logAiUsage(
  ids: AiCallIds & { latencyMs: number; promptTokens?: number; completionTokens?: number; requestId?: string },
) {
  logger.info({ component: 'ai', ...ids }, 'ai call completed')
}
