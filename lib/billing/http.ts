import { fail, handleRouteError } from '@/lib/api/response'
import { BillingError } from './service'

export function billingRouteError(err: unknown) {
  if (err instanceof BillingError) return fail(err.message, err.status)
  return handleRouteError(err)
}
