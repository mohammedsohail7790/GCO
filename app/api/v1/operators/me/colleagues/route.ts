import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { operatorCoversLanguage } from '@/lib/languages'
import { ok, fail, handleRouteError } from '@/lib/api/response'

// Colleagues of the same client who could take a conversation right now (available, covering its language, with a free slot).
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'CONVERSATION_HANDLE')
    const me = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true, tenantId: true } })
    if (!me) return fail('Operator profile not found', 404)
    const language = new URL(req.url).searchParams.get('language')
    const ops = await db.operator.findMany({ where: { tenantId: me.tenantId, status: 'AVAILABLE', id: { not: me.id }, user: { isActive: true } }, select: { id: true, capacity: true, languages: true, user: { select: { displayName: true } }, assignments: { where: { status: 'ACTIVE' }, select: { id: true } } } })
    return ok(ops.filter((o) => o.assignments.length < o.capacity && operatorCoversLanguage(o.languages, language)).map((o) => ({ id: o.id, name: o.user.displayName, free: o.capacity - o.assignments.length, languages: o.languages })))
  } catch (err) {
    return handleRouteError(err)
  }
}
