import { fail, handleRouteError } from '@/lib/api/response'
import { TrainingError } from './service'

export function trainingRouteError(err: unknown) {
  if (err instanceof TrainingError) return fail(err.message, err.status, err.code)
  return handleRouteError(err)
}
