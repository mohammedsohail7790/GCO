import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { getClientIp } from '@/lib/api/clientIp'
import { acceptInvitation } from '@/lib/onboarding/service'
import { acceptStaffInvitation } from '@/lib/onboarding/staffInvites'

const Schema = z.object({ token: z.string().min(1).max(200), password: z.string().min(10).max(200) })

/** Public. Sets a client's or a staff member's password from a valid one-time invitation. Every failure is the same generic 400. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers)
    if (await isRateLimited(`accept-invitation:${ip}`, RATE_LIMITS.LOGIN.max, RATE_LIMITS.LOGIN.windowSeconds)) {
      return fail('Too many attempts. Try again later.', 429)
    }
    const body = Schema.parse(await req.json())
    // A staff (operator/manager) setup link, else the client's own setup link. Same endpoint, same generic failure.
    if (!(await acceptStaffInvitation(body.token, body.password))) await acceptInvitation(body.token, body.password)
    return ok({ accepted: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
