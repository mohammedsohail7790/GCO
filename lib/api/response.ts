import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { logger } from '@/lib/observability/logger'

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 })
}

export function created<T>(data: T) {
  return NextResponse.json({ ok: true, data }, { status: 201 })
}

export function paginated<T>(
  data: T[],
  meta: { total: number; page: number; pageSize: number },
) {
  return NextResponse.json({ ok: true, data, meta }, { status: 200 })
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: { message, code } }, { status })
}

/**
 * Wraps a route handler, converting thrown errors (with .status) into
 * consistent JSON error responses.
 *
 * For 5xx: the client NEVER sees the raw exception message - only "Internal
 * server error". An unhandled exception (a Prisma error, a bug, anything we
 * didn't deliberately throw via fail()) can carry internal detail (query
 * shape, field names, occasionally more) that has no business leaving the
 * server. The full message + stack is logged server-side via `logger`
 * instead, where it's actually useful for debugging.
 *
 * For 4xx: these are always OUR OWN deliberate `fail('...', code)` calls
 * elsewhere in the codebase (validation errors, permission denials, not-found)
 * - safe and intended to be shown to the caller.
 */
export function handleRouteError(err: unknown) {
  // Zod validation failures (every route does Schema.parse(await req.json()))
  // and malformed-JSON SyntaxErrors are client input errors (400), not server
  // errors (500) - neither carries a `.status` field on its own, so without
  // this check they'd both fall through to the generic 500 branch below.
  if (err instanceof ZodError) {
    return fail(err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') || 'Invalid request body', 400)
  }
  if (err instanceof SyntaxError) {
    return fail('Invalid JSON in request body', 400)
  }

  const e = err as { status?: number; message?: string }
  const status = e?.status ?? 500

  if (status >= 500) {
    logger.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : err }, 'unhandled route error')
    return fail('Internal server error', status)
  }

  return fail(e?.message ?? 'Request failed', status)
}
