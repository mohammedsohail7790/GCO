import { fail, handleRouteError } from '@/lib/api/response'
import { PrivacyError } from './service'

export function privacyRouteError(err: unknown) {
  if (err instanceof PrivacyError) return fail(err.message, err.status)
  return handleRouteError(err)
}
