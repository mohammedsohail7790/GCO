import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { logActivity, LeadConflictError } from '@/lib/crm/leads'

const Schema = z.object({ note: z.string().min(1).max(2000) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'LEAD_VIEW_OWN')
    const { id } = await params
    const body = Schema.parse(await req.json())

    if (
      await isRateLimited(`crm-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)
    ) {
      return fail('Rate limit exceeded', 429)
    }

    try {
      await logActivity(id, session.sub, body.note)
    } catch (err) {
      if (err instanceof LeadConflictError) return fail(err.message, err.status)
      throw err
    }

    return ok({ logged: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
