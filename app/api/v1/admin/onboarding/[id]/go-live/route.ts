import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { goLive } from '@/lib/onboarding/service'

/** Explicit go-live (CEO only). Server-side checklist validation; activates this client's staged integrations. Idempotent. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'ONBOARDING_GO_LIVE')
    const { id } = await params
    if (!(await db.clientOnboarding.findUnique({ where: { id }, select: { id: true } }))) return fail('Onboarding not found', 404)
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    const r = await goLive(id, session.sub)
    return ok({ status: r.onboarding.status, activatedIntegrations: r.activatedIntegrations, alreadyLive: r.alreadyLive })
  } catch (err) {
    return handleRouteError(err)
  }
}
