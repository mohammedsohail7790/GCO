import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { created, handleRouteError } from '@/lib/api/response'
import { addConversationNote } from '@/lib/conversations/lifecycle'

const Schema = z.object({ body: z.string().min(1).max(2000) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'CONVERSATION_NOTE_ADD')
    const { id } = await params
    const { body } = Schema.parse(await req.json())
    return created(await addConversationNote(id, { userId: session.sub, role: session.role, tenantId: session.tenantId ?? null }, body))
  } catch (err) {
    return handleRouteError(err)
  }
}
