import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { tryAssignConversation } from '@/lib/assignment/engine'

const BodySchema = z.object({ status: z.enum(['OFFLINE', 'AVAILABLE', 'BUSY', 'PAUSED']) })

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession(req)
    if (session.role !== 'OPERATOR') return fail('Not an operator account', 403)
    const { status } = BodySchema.parse(await req.json())

    const operator = await db.operator.update({
      where: { userId: session.sub },
      data: { status },
    })

    if (status === 'AVAILABLE') {
      const queued = await db.conversation.findMany({
        where: { tenantId: operator.tenantId, state: { in: ['QUEUED', 'REASSIGNING'] }, currentAssignmentId: null },
        take: 5,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      })
      for (const c of queued) await tryAssignConversation(c.id)
    }

    return ok({ operator })
  } catch (err) {
    return handleRouteError(err)
  }
}
