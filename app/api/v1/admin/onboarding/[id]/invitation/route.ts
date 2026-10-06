import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { issueInvitation } from '@/lib/onboarding/service'

/** Issues a one-time setup link. Returned exactly once in this response; only a hash is stored. Re-issuing invalidates the previous link. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'ONBOARDING_MANAGE')
    const { id } = await params
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    const { setupUrl, expiresAt } = await issueInvitation(id, session.sub)
    return ok({ setupUrl, expiresAt })
  } catch (err) {
    return handleRouteError(err)
  }
}
