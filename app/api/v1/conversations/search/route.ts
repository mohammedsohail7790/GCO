import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { handleRouteError } from '@/lib/api/response'
import { searchConversations } from '@/lib/conversations/search'

const Query = z.object({
  q: z.string().max(100).optional(),
  state: z.string().max(40).optional(),
  language: z.string().max(10).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  tenantId: z.string().max(100).optional(),
})

// Conversation content: supervisors only (CONVERSATION_SEARCH), tenant-scoped, never cached.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'CONVERSATION_SEARCH')
    const query = Query.parse(Object.fromEntries(new URL(req.url).searchParams))
    const tenantId = resolveTenantScope(session, query.tenantId ?? null)
    const { total, items } = await searchConversations({ tenantId, q: query.q, state: query.state, language: query.language, page: query.page, pageSize: query.pageSize })
    return NextResponse.json({ ok: true, data: items, meta: { total, page: query.page, pageSize: query.pageSize } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return handleRouteError(err)
  }
}
