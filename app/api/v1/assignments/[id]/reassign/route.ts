import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { manualReassign } from '@/lib/assignment/engine'
import { ok, fail, handleRouteError } from '@/lib/api/response'

const BodySchema = z.object({ reason: z.string().min(1).max(500) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await requirePermission(req, 'CONVERSATION_REASSIGN')
    const { reason } = BodySchema.parse(await req.json())

    const assignment = await db.assignment.findUnique({ where: { id } })
    if (!assignment) return fail('Assignment not found', 404)
    // CEO_ADMIN and ASSISTANT are global operational roles (see
    // lib/auth/tenantGuard.ts); MANAGER is tenant-scoped and must match.
    const isGlobalRole = session.role === 'CEO_ADMIN' || session.role === 'ASSISTANT'
    if (!isGlobalRole && session.tenantId !== assignment.tenantId) {
      return fail('Forbidden', 403)
    }

    const reassigned = await manualReassign(assignment.conversationId, session.sub, reason)
    return ok({ reassigned })
  } catch (err) {
    return handleRouteError(err)
  }
}
