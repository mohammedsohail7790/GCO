import { fail, handleRouteError } from '@/lib/api/response'
import { ShiftError } from './service'

export function shiftRouteError(err: unknown) {
  if (err instanceof ShiftError) return fail(err.message, err.status)
  return handleRouteError(err)
}

/** ISO date/time from a query value, or the fallback. */
export function dateParam(v: string | null, fallback: Date): Date {
  const d = v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : fallback
}
