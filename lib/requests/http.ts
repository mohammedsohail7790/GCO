import { fail, handleRouteError } from '@/lib/api/response'
import { RequestError } from './service'

export function requestRouteError(err: unknown) {
  if (err instanceof RequestError) return fail(err.message, err.status)
  return handleRouteError(err)
}
