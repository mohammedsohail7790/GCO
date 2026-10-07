import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, created, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { startManualOnboarding } from '@/lib/onboarding/service'

// Onboarding console list. Safe fields only - never the invitation token hash, secrets or passwords.
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'ONBOARDING_VIEW')
    const rows = await db.clientOnboarding.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, status: true, contactEmail: true, lastError: true, createdAt: true, liveAt: true, tenant: { select: { id: true, name: true, slug: true } } },
    })
    return ok(rows)
  } catch (err) {
    return handleRouteError(err)
  }
}

const StartSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email().max(200),
})

/** Start onboarding for a client that did not come through the CRM pipeline (CEO/Assistant). Creates the tenant + client user. */
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'ONBOARDING_MANAGE')
    const body = StartSchema.parse(await req.json())
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    const ob = await startManualOnboarding(body, session.sub)
    return created({ id: ob.id, status: ob.status })
  } catch (err) {
    return handleRouteError(err)
  }
}
