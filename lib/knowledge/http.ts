import { fail, handleRouteError } from '@/lib/api/response'
import { KnowledgeError } from './service'

export function knowledgeRouteError(err: unknown) {
  if (err instanceof KnowledgeError) return fail(err.message, err.status)
  return handleRouteError(err)
}
