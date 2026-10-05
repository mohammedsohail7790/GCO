import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { transitionEscalation } from '@/lib/escalation/service'

const text = (min: number) => z.string().trim().min(min).max(2000)

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim') }),
  z.object({ action: z.literal('note'), body: text(1), visibility: z.enum(['INTERNAL', 'CLIENT']).optional() }),
  z.object({ action: z.literal('escalate'), note: text(5), clientSummary: text(5) }),
  z.object({ action: z.literal('resolve'), resolution: text(3), clientNote: text(1).optional() }),
])

// One endpoint for every state transition; the service enforces RBAC, tenant scope and state rules.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getSession(req)
    const body = ActionSchema.parse(await req.json())
    if (await isRateLimited(`escalation-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) {
      return fail('Rate limit exceeded', 429)
    }
    return ok(await transitionEscalation(session, id, body))
  } catch (err) {
    return handleRouteError(err)
  }
}
