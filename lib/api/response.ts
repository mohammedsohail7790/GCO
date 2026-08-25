import { NextResponse } from 'next/server'
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

/** Wraps a route handler, converting thrown errors (with .status) into consistent JSON error responses. */
export function handleRouteError(err: unknown) {
  const e = err as { status?: number; message?: string }
  const status = e?.status ?? 500
  if (status >= 500) {
    logger.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : err }, 'unhandled route error')
  }
  return fail(e?.message ?? 'Internal server error', status)
}
