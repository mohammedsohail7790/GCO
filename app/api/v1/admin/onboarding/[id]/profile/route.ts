import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { updateClientProfile } from '@/lib/onboarding/service'

// Non-secret client facts only (channel, website, hours, contacts). Strict keys; credential-looking values are refused.
const Schema = z.object({
  channel: z.string().max(80).optional(),
  website: z.string().max(200).optional(),
  operatingHours: z.string().max(200).optional(),
  technicalContact: z.string().max(200).optional(),
  escalationContact: z.string().max(200).optional(),
}).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'ONBOARDING_MANAGE')
    const { id } = await params
    const body = Schema.parse(await req.json())
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    return ok({ clientProfile: await updateClientProfile(id, body, session.sub) })
  } catch (err) {
    return handleRouteError(err)
  }
}
