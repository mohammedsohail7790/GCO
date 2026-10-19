import { handleRouteError, fail } from '@/lib/api/response'
import { EarningsError } from './ledger'

export function earningsRouteError(err: unknown) {
  if (err instanceof EarningsError) return fail(err.message, err.status)
  return handleRouteError(err)
}
