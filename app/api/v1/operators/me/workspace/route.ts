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
            // Operator-safe view only: no internal notes/summary/claimant.
            escalations: { where: { status: { not: 'RESOLVED' } }, select: { id: true, level: true, status: true, reason: true, createdAt: true }, take: 1 },
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

    // The operator's own replies from the last 24 hours with their delivery state. A conversation leaves this screen as soon as it is answered,
    // so without this list a reply that fails to reach the client's platform would be invisible. Own messages only; no failure detail is returned.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const sent = await db.message.findMany({
      where: { operatorId: operator.id, direction: 'OUTBOUND', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, conversationId: true, status: true, createdAt: true, content: true },
    })
    const recentReplies = sent.map((m) => ({ id: m.id, conversationId: m.conversationId, status: m.status, createdAt: m.createdAt, preview: m.content.slice(0, 80) }))

    return ok({
      operator: { id: operator.id, operatorNumber: operator.operatorNumber, status: operator.status, capacity: operator.capacity, languages: operator.languages },
      conversations,
      recentReplies,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
