import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { entriesForOperator } from '@/lib/knowledge/service'
import { knowledgeRouteError } from '@/lib/knowledge/http'

// The operator's own client only; tenant comes from the operator profile, never from the request.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'KNOWLEDGE_VIEW_OWN')
    const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { tenantId: true } })
    if (!op) return fail('Operator profile not found', 404)
    const url = new URL(req.url)
    const rows = await entriesForOperator(op.tenantId, url.searchParams.get('language'), url.searchParams.get('q'))
    return ok(rows.map((e) => ({ id: e.id, kind: e.kind, title: e.title, body: e.body, language: e.language, tags: e.tags })))
  } catch (err) {
    return knowledgeRouteError(err)
  }
}
