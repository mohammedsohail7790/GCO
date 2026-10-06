import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { confirmItem, CONFIRMABLE } from '@/lib/onboarding/service'

const Schema = z.object({ item: z.enum(CONFIRMABLE) })

/** A human confirms a fact that cannot be derived from data (languages / coverage / supervisor). Idempotent. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'ONBOARDING_MANAGE')
    const { id } = await params
    const { item } = Schema.parse(await req.json())
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    const ob = await confirmItem(id, item, session.sub)
    return ok({ status: ob.status })
  } catch (err) {
    return handleRouteError(err)
  }
}
