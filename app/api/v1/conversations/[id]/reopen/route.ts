import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { ok, handleRouteError } from '@/lib/api/response'
import { reopenConversation } from '@/lib/conversations/lifecycle'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'CONVERSATION_REOPEN')
    const { id } = await params
    return ok(await reopenConversation(id, { userId: session.sub, role: session.role, tenantId: session.tenantId ?? null }))
  } catch (err) {
    return handleRouteError(err)
  }
}
