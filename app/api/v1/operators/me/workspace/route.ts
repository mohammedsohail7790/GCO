import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'

/**
 * Returns everything the operator screen needs in one call: their active
 * conversation, queued conversation, and per-conversation context - so the
 * operator never has to navigate through multiple screens to reply (spec 30).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    if (session.role !== 'OPERATOR') return fail('Not an operator account', 403)

    const operator = await db.operator.findUnique({ where: { userId: session.sub } })
    if (!operator) return fail('Operator profile not found', 404)

    const assignments = await db.assignment.findMany({
      where: { operatorId: operator.id, status: 'ACTIVE' },
      orderBy: { assignedAt: 'asc' },
      include: {
        conversation: {
          include: {
            messages: { orderBy: { createdAt: 'desc' }, take: 30 },
            notes: { orderBy: { createdAt: 'desc' }, take: 20 },
            aiMemories: { where: { isDeleted: false }, orderBy: { createdAt: 'desc' }, take: 20 },
          },
        },
      },
    })

    const conversations = assignments.map((a) => ({
      assignmentId: a.id,
      respondsBy: a.respondsBy,
      assignedAt: a.assignedAt,
      conversation: {
        ...a.conversation,
        messages: a.conversation.messages.reverse(),
      },
    }))

    return ok({
      operator: { id: operator.id, operatorNumber: operator.operatorNumber, status: operator.status, capacity: operator.capacity },
      conversations,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
