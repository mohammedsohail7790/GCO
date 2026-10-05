import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { created, ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { ESCALATION_REASONS, createEscalation, listEscalations } from '@/lib/escalation/service'

const CreateSchema = z.object({
  conversationId: z.string().min(1).max(100),
  reason: z.enum(ESCALATION_REASONS),
  note: z.string().trim().min(5, 'Please describe why you are escalating').max(2000),
})

// Role-shaped list: operators see their own, supervisors their tenant, management everything,
// clients only client-decision items (client-facing fields). Scope is decided server-side.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const level = url.searchParams.get('level')
    const data = await listEscalations(session, {
      status: status === 'OPEN' || status === 'CLAIMED' || status === 'RESOLVED' ? status : undefined,
      level: level === 'SUPERVISOR' || level === 'CLIENT_DECISION' ? level : undefined,
      tenantId: url.searchParams.get('tenantId'),
      includeResolved: url.searchParams.get('includeResolved') === '1',
    })
    return ok(data)
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    const body = CreateSchema.parse(await req.json())
    if (await isRateLimited(`escalation-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) {
      return fail('Rate limit exceeded', 429)
    }
    return created(await createEscalation(session, body))
  } catch (err) {
    return handleRouteError(err)
  }
}
