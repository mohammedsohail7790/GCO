import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { decideApproval, ApprovalError } from '@/lib/crm/approvals'

const Schema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewNotes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'APPROVAL_DECIDE')
    const { id } = await params
    const body = Schema.parse(await req.json())

    if (
      await isRateLimited(`crm-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)
    ) {
      return fail('Rate limit exceeded', 429)
    }

    try {
      const result = await decideApproval(id, session.sub, body.decision, body.reviewNotes)
      return ok(result)
    } catch (err) {
      if (err instanceof ApprovalError) return fail(err.message, err.status)
      throw err
    }
  } catch (err) {
    return handleRouteError(err)
  }
}
