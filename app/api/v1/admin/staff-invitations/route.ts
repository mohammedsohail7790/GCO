import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { created, ok, fail, handleRouteError } from '@/lib/api/response'
import { inviteStaff, listStaff } from '@/lib/onboarding/staffInvites'

const Body = z.object({
  tenantId: z.string().min(1).max(100),
  email: z.string().min(3).max(200),
  displayName: z.string().min(1).max(120),
  role: z.string().max(20),
  languages: z.array(z.string().max(10)).max(12).optional(),
}).strict()

// CEO/assistant invite a client's operator or manager; the response carries the one-time link ONCE (never stored).
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'STAFF_INVITE')
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    const b = Body.parse(await req.json())
    const r = await inviteStaff({ ...b, actorUserId: session.sub })
    return created({ ...r, expiresAt: r.expiresAt.toISOString() })
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'STAFF_INVITE')
    const tenantId = new URL(req.url).searchParams.get('tenantId')
    if (!tenantId) return fail('tenantId is required', 400)
    return ok(await listStaff(tenantId))
  } catch (err) {
    return handleRouteError(err)
  }
}
