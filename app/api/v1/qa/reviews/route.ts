import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { created, fail, handleRouteError } from '@/lib/api/response'
import { db } from '@/lib/db/client'
import { assertOperatorInTeam } from '@/lib/auth/teamScope'
import { QA_FLAGS, QaError, submitQaReview } from '@/lib/qa/reviews'

const score = z.number().int().min(1).max(5)
const Schema = z
  .object({
    messageId: z.string().min(1).max(100),
    accuracy: score,
    tone: score,
    resolution: score,
    flags: z.array(z.enum(QA_FLAGS)).max(QA_FLAGS.length).default([]),
    note: z.string().max(2000).optional(),
    tenantId: z.string().max(100).optional(),
  })
  .strict()

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'QA_REVIEW')
    const body = Schema.parse(await req.json())
    const tenantId = resolveTenantScope(session, body.tenantId ?? null)
    const target = await db.message.findFirst({ where: { id: body.messageId, tenantId }, select: { operatorId: true } })
    await assertOperatorInTeam(session, target?.operatorId) // supervisors review only their own team's replies
    try {
      const review = await submitQaReview({ ...body, tenantId, reviewerUserId: session.sub })
      return created({ id: review.id, outcome: review.outcome })
    } catch (err) {
      if (err instanceof QaError) return fail(err.message, err.status)
      throw err
    }
  } catch (err) {
    return handleRouteError(err)
  }
}
