import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { fail, handleRouteError } from '@/lib/api/response'
import { conversationTranscript } from '@/lib/conversations/search'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'CONVERSATION_SEARCH')
    const { id } = await params
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    const t = await conversationTranscript(tenantId, id)
    if (!t) return fail('Conversation not found', 404)
    return NextResponse.json({ ok: true, data: t }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return handleRouteError(err)
  }
}
