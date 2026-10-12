import type { ConversationState, Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { normalizeLanguage } from '@/lib/languages'

export const SEARCH_STATES = ['QUEUED', 'ASSIGNED', 'ACTIVE', 'WAITING_FOR_OPERATOR', 'WAITING_FOR_CLIENT', 'EXPIRED', 'REASSIGNING', 'CLOSED', 'FAILED'] as const

export interface SearchParams { tenantId: string; q?: string; state?: string; language?: string; page: number; pageSize: number }

/** Conversation history search for supervisors: customer id, message text, state and language, newest first. */
export async function searchConversations(p: SearchParams) {
  const q = p.q?.trim()
  const lang = normalizeLanguage(p.language)
  const where: Prisma.ConversationWhereInput = {
    tenantId: p.tenantId,
    ...(p.state && (SEARCH_STATES as readonly string[]).includes(p.state) ? { state: p.state as ConversationState } : {}),
    ...(lang ? { language: lang } : {}),
    ...(q ? { OR: [{ externalUserId: { contains: q, mode: 'insensitive' } }, { messages: { some: { content: { contains: q, mode: 'insensitive' } } } }] } : {}),
  }
  const [total, rows] = await Promise.all([
    db.conversation.count({ where }),
    db.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, direction: true, createdAt: true } },
        currentAssignment: { select: { operator: { select: { user: { select: { displayName: true } } } } } },
        escalations: { where: { status: { not: 'RESOLVED' } }, select: { id: true }, take: 1 },
        _count: { select: { messages: true } },
      },
    }),
  ])
  return {
    total,
    items: rows.map((c) => ({
      id: c.id,
      customer: c.externalUserId,
      state: c.state,
      language: c.language,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
      lastMessage: c.messages[0] ? { direction: c.messages[0].direction, snippet: c.messages[0].content.slice(0, 160), at: c.messages[0].createdAt } : null,
      operator: c.currentAssignment?.operator.user.displayName ?? null,
      escalated: c.escalations.length > 0,
    })),
  }
}

/** Full read-only transcript for a conversation in the caller's tenant (null if not found / other tenant). */
export async function conversationTranscript(tenantId: string, id: string) {
  const c = await db.conversation.findFirst({
    where: { id, tenantId },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, direction: true, status: true, content: true, createdAt: true, operatorId: true } },
      notes: { orderBy: { createdAt: 'asc' }, select: { id: true, body: true, createdAt: true, authorUserId: true } },
      escalations: { orderBy: { createdAt: 'asc' }, select: { id: true, status: true, level: true, reason: true, createdAt: true, resolvedAt: true } },
    },
  })
  if (!c) return null
  const opIds = [...new Set(c.messages.map((m) => m.operatorId).filter((x): x is string => !!x))]
  const ops = opIds.length ? await db.operator.findMany({ where: { id: { in: opIds } }, select: { id: true, user: { select: { displayName: true } } } }) : []
  const name = new Map(ops.map((o) => [o.id, o.user.displayName]))
  const authors = [...new Set(c.notes.map((n) => n.authorUserId))]
  const users = authors.length ? await db.user.findMany({ where: { id: { in: authors } }, select: { id: true, displayName: true } }) : []
  const author = new Map(users.map((u) => [u.id, u.displayName]))
  return {
    id: c.id,
    customer: c.externalUserId,
    state: c.state,
    language: c.language,
    createdAt: c.createdAt,
    closedAt: c.closedAt,
    messages: c.messages.map((m) => ({ id: m.id, direction: m.direction, status: m.status, content: m.content, at: m.createdAt, operator: m.operatorId ? name.get(m.operatorId) ?? null : null })),
    notes: c.notes.map((n) => ({ id: n.id, body: n.body, at: n.createdAt, author: author.get(n.authorUserId) ?? 'staff' })),
    escalations: c.escalations,
  }
}
